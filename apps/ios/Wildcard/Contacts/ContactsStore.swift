import Foundation
import Observation

@MainActor
@Observable
final class ContactsStore {
    private(set) var contacts: [Contact] = []
    private(set) var nextCursor: String?
    private(set) var hasLoaded = false
    private(set) var isLoading = false
    private(set) var isLoadingMore = false
    private(set) var isMutating = false
    private(set) var error: String?
    private(set) var totalUnreadCount = 0
    private var markingRead: Set<String> = []
    let conversations = ConversationCache()
    private var refreshedAt: Date?
    private var contactRefreshedAt: [String: Date] = [:]
    private var refreshingContacts: Set<String> = []
    private let freshness: TimeInterval = 30
    private var generation = 0
    private var readRevision = 0
    private var firstPageIDs: Set<String> = []
    private var knownContacts: [String: Contact] = [:]
    private struct MessageTimestamp {
        let preview: String
        let value: Double
    }
    private var messageTimestamps: [String: MessageTimestamp] = [:]
    private struct MessageTimestampRequest: Hashable {
        let contactID: String
        let preview: String
    }
    private var loadingMessageTimestamps: Set<MessageTimestampRequest> = []

    func contact(id: String) -> Contact? { knownContacts[id] }

    private func isMoreRecent(_ lhs: Contact, than rhs: Contact) -> Bool {
        let left = lhs.lastMessageAt ?? lhs.createdAt
        let right = rhs.lastMessageAt ?? rhs.createdAt
        return left == right ? lhs.id > rhs.id : left > right
    }

    private func sortContacts() {
        contacts.sort { isMoreRecent($0, than: $1) }
    }

    func lastMessageTimestamp(for contact: Contact) -> Double? {
        if let timestamp = contact.lastMessageAt { return timestamp }
        guard let preview = contact.lastMessageText else { return nil }
        if let turn = conversations.lastTurn(for: contact.id), messagePreview(for: turn) == preview {
            return turn.assistantText == nil ? turn.createdAt : turn.updatedAt
        }
        guard let cached = messageTimestamps[contact.id], cached.preview == preview else { return nil }
        return cached.value
    }

    func loadMessageTimestamp(for contact: Contact, using auth: AuthStore) async {
        guard lastMessageTimestamp(for: contact) == nil, let preview = contact.lastMessageText else { return }
        let request = MessageTimestampRequest(contactID: contact.id, preview: preview)
        guard loadingMessageTimestamps.insert(request).inserted else { return }
        defer { loadingMessageTimestamps.remove(request) }
        do {
            let page = try await auth.withSession { api, token in
                try await api.chatTurns(contactID: contact.id, token: token)
            }
            guard !Task.isCancelled, knownContacts[contact.id]?.lastMessageText == preview,
                  let turn = page.turns.last, messagePreview(for: turn) == preview else { return }
            messageTimestamps[contact.id] = MessageTimestamp(
                preview: preview, value: turn.assistantText == nil ? turn.createdAt : turn.updatedAt
            )
        } catch {
            // A missing timestamp must not prevent opening the conversation.
        }
    }

    private func messagePreview(for turn: ChatTurn) -> String {
        String(String.UnicodeScalarView((turn.assistantText ?? turn.userText).unicodeScalars.prefix(500)))
    }

    func refresh(using auth: AuthStore, force: Bool = true, preserveLoadedPages: Bool = false) async {
        guard !isMutating, !isLoading, (!preserveLoadedPages || !isLoadingMore) else { return }
        if !force, let refreshedAt, Date().timeIntervalSince(refreshedAt) < freshness { return }
        generation += 1
        let request = generation
        let readSnapshot = readRevision
        isLoading = true
        isLoadingMore = false
        error = nil
        defer { if request == generation { isLoading = false } }
        do {
            let page = try await auth.withSession { api, token in try await api.contacts(token: token) }
            guard request == generation, readSnapshot == readRevision, !Task.isCancelled else { return }
            let changedReplies = page.contacts.filter { contact in
                guard let previous = knownContacts[contact.id] else { return false }
                return (contact.unreadCount ?? 0) > (previous.unreadCount ?? 0)
            }
            for contact in page.contacts {
                knownContacts[contact.id] = contact
                contactRefreshedAt[contact.id] = .now
            }
            let incomingIDs = Set(page.contacts.map(\.id))
            let firstPageChanged = incomingIDs != firstPageIDs
            let additional = preserveLoadedPages && page.nextCursor != nil ? contacts.filter { existing in
                guard !incomingIDs.contains(existing.id) else { return false }
                // Keep loaded rows pushed below the first page by newer messages.
                // Missing first-page rows that still belong above its boundary were deleted.
                guard firstPageIDs.contains(existing.id) else { return true }
                guard let boundary = page.contacts.last else { return false }
                return isMoreRecent(boundary, than: existing)
            } : []
            let removed = contacts.contains { existing in
                guard firstPageIDs.contains(existing.id), !incomingIDs.contains(existing.id) else { return false }
                guard page.nextCursor != nil, let boundary = page.contacts.last else { return true }
                return !isMoreRecent(boundary, than: existing)
            }
            if removed { await auth.images.clear(deactivate: false) }
            guard request == generation, readSnapshot == readRevision, !Task.isCancelled else { return }
            contacts = page.contacts + additional
            sortContacts()
            firstPageIDs = incomingIDs
            totalUnreadCount = page.totalUnreadCount ?? page.contacts.reduce(0) { $0 + ($1.unreadCount ?? 0) }
            // Rebase when rows cross the first-page boundary. Load more deduplicates
            // repeated rows while filling gaps caused by the mutable activity order.
            if additional.isEmpty || firstPageChanged { nextCursor = page.nextCursor }
            hasLoaded = true
            refreshedAt = .now
            // Resolve stable turn IDs only when unread counts grow, so polling and APNs
            // share the same deduplication key even outside the visible conversation.
            for contact in changedReplies {
                guard !Task.isCancelled, let userID = auth.user?.id else { return }
                if let history = try? await auth.withSession({ api, token in
                    try await api.chatTurns(contactID: contact.id, token: token)
                }) {
                    guard !Task.isCancelled, auth.user?.id == userID else { return }
                    for turn in history.turns where turn.assistantText != nil {
                        MessageSounds.shared.received(turnID: turn.id, contactID: contact.id, userID: userID,
                                                      completedAt: Date(timeIntervalSince1970: turn.updatedAt / 1000))
                    }
                }
            }
        } catch {
            if request == generation && !isCancellation(error) { self.error = error.localizedDescription }
        }
    }

    func loadMore(using auth: AuthStore) async {
        guard !isLoading, !isLoadingMore, !isMutating, let cursor = nextCursor else { return }
        let request = generation
        let readSnapshot = readRevision
        isLoadingMore = true
        error = nil
        defer { if request == generation { isLoadingMore = false } }
        do {
            let page = try await auth.withSession { api, token in try await api.contacts(token: token, before: cursor) }
            guard request == generation, readSnapshot == readRevision, !Task.isCancelled else { return }
            for contact in page.contacts {
                knownContacts[contact.id] = contact
                contactRefreshedAt[contact.id] = .now
            }
            let incomingIDs = Set(page.contacts.map(\.id))
            contacts.removeAll { incomingIDs.contains($0.id) }
            contacts.append(contentsOf: page.contacts)
            sortContacts()
            nextCursor = page.nextCursor
        } catch {
            if request == generation && !isCancellation(error) { self.error = error.localizedDescription }
        }
    }

    @discardableResult
    func save(name: String, contactID: String?, using auth: AuthStore) async throws -> Contact {
        try beginMutation()
        do {
            var saved = try await auth.withSession { api, token in
                try await api.saveContact(name: name, id: contactID, token: token)
            }
            if saved.unreadCount == nil { saved.unreadCount = knownContacts[saved.id]?.unreadCount }
            if saved.lastReadSequence == nil { saved.lastReadSequence = knownContacts[saved.id]?.lastReadSequence }
            knownContacts[saved.id] = saved
            contactRefreshedAt[saved.id] = .now
            refreshedAt = nil
            if let index = contacts.firstIndex(where: { $0.id == saved.id }) {
                contacts[index] = saved
            } else if contactID == nil {
                contacts.insert(saved, at: 0)
            }
            sortContacts()
            isMutating = false
            if !hasLoaded { await refresh(using: auth) }
            return saved
        } catch {
            isMutating = false
            throw error
        }
    }

    func savePhoto(contactID: String, data: Data?, using auth: AuthStore) async throws {
        try beginMutation()
        defer { isMutating = false }
        let saved = try await auth.withSession { api, token in
            try await api.saveContactPhoto(id: contactID, data: data, token: token)
        }
        if let data, let version = saved.photoVersion {
            await auth.images.store(data, for: .contactAvatar(contactID: contactID, version: version))
        }
        knownContacts[contactID] = saved
        if let index = contacts.firstIndex(where: { $0.id == contactID }) { contacts[index] = saved }
        sortContacts()
        contactRefreshedAt[contactID] = .now
        refreshedAt = nil
    }

    func delete(_ contact: Contact, using auth: AuthStore) async throws {
        try beginMutation()
        do {
            do {
                try await auth.withSession { api, token in try await api.deleteContact(id: contact.id, token: token) }
            } catch AuthAPI.Failure.notFound {
                // A contact removed on another client is already deleted.
            }
            await auth.images.clear(deactivate: false)
            conversations.remove(contactID: contact.id)
            messageTimestamps.removeValue(forKey: contact.id)
            contactRefreshedAt.removeValue(forKey: contact.id)
            refreshedAt = nil
            totalUnreadCount = max(0, totalUnreadCount - (knownContacts[contact.id]?.unreadCount ?? 0))
            knownContacts.removeValue(forKey: contact.id)
            contacts.removeAll { $0.id == contact.id }
            isMutating = false
            if !hasLoaded { await refresh(using: auth) }
        } catch {
            isMutating = false
            throw error
        }
    }

    func refreshContact(id: String, using auth: AuthStore, force: Bool = true) async throws {
        if !force, let date = contactRefreshedAt[id], Date().timeIntervalSince(date) < freshness { return }
        guard refreshingContacts.insert(id).inserted else { return }
        defer { refreshingContacts.remove(id) }
        let request = generation
        let readSnapshot = readRevision
        do {
            let contact = try await auth.withSession { api, token in try await api.contact(id: id, token: token) }
            guard request == generation, readSnapshot == readRevision, !Task.isCancelled else { return }
            knownContacts[id] = contact
            contactRefreshedAt[id] = .now
            if let index = contacts.firstIndex(where: { $0.id == id }) { contacts[index] = contact }
            sortContacts()
        } catch {
            guard request == generation else { return }
            if case AuthAPI.Failure.notFound = error {
                await auth.images.clear(deactivate: false)
                guard request == generation else { return }
                conversations.remove(contactID: id)
                messageTimestamps.removeValue(forKey: id)
                contactRefreshedAt.removeValue(forKey: id)
                knownContacts.removeValue(forKey: id)
                contacts.removeAll { $0.id == id }
            }
            throw error
        }
    }

    func markRead(id: String, sequence: Int, using auth: AuthStore) async {
        guard sequence > (knownContacts[id]?.lastReadSequence ?? 0), markingRead.insert(id).inserted else { return }
        defer { markingRead.remove(id) }
        do {
            let state = try await auth.withSession { api, token in
                try await api.markChatRead(contactID: id, sequence: sequence, token: token)
            }
            guard var contact = knownContacts[id], state.lastReadSequence >= (contact.lastReadSequence ?? 0) else { return }
            totalUnreadCount = state.totalUnreadCount ?? max(0, totalUnreadCount - (contact.unreadCount ?? 0) + state.unreadCount)
            readRevision += 1
            contact.lastReadSequence = state.lastReadSequence
            contact.unreadCount = state.unreadCount
            knownContacts[id] = contact
            if let index = contacts.firstIndex(where: { $0.id == id }) { contacts[index] = contact }
            sortContacts()
            refreshedAt = nil
        } catch is CancellationError { }
        catch { /* Active chat polling retries the acknowledgement without hiding messages. */ }
    }

    private func beginMutation() throws {
        guard !isMutating else { throw MutationInProgress() }
        generation += 1
        isLoading = false
        isLoadingMore = false
        isMutating = true
        error = nil
    }

    private func isCancellation(_ error: Error) -> Bool {
        error is CancellationError || (error as? URLError)?.code == .cancelled
    }

    private struct MutationInProgress: LocalizedError {
        var errorDescription: String? { "Please wait for the current change to finish." }
    }
}
