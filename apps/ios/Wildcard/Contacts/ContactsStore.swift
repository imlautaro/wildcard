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

    func contact(id: String) -> Contact? { knownContacts[id] }

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
            for contact in page.contacts {
                knownContacts[contact.id] = contact
                contactRefreshedAt[contact.id] = .now
            }
            let incomingIDs = Set(page.contacts.map(\.id))
            let additional = preserveLoadedPages ? contacts.filter { !firstPageIDs.contains($0.id) && !incomingIDs.contains($0.id) } : []
            contacts = page.contacts + additional
            firstPageIDs = incomingIDs
            totalUnreadCount = page.totalUnreadCount ?? page.contacts.reduce(0) { $0 + ($1.unreadCount ?? 0) }
            if additional.isEmpty { nextCursor = page.nextCursor }
            hasLoaded = true
            refreshedAt = .now
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
            let known = Set(contacts.map(\.id))
            contacts.append(contentsOf: page.contacts.filter { !known.contains($0.id) })
            nextCursor = page.nextCursor
        } catch {
            if request == generation && !isCancellation(error) { self.error = error.localizedDescription }
        }
    }

    func save(name: String, contactID: String?, using auth: AuthStore) async throws {
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
                contacts.sort { $0.createdAt == $1.createdAt ? $0.id > $1.id : $0.createdAt > $1.createdAt }
            }
            isMutating = false
            if !hasLoaded { await refresh(using: auth) }
        } catch {
            isMutating = false
            throw error
        }
    }

    func delete(_ contact: Contact, using auth: AuthStore) async throws {
        try beginMutation()
        do {
            do {
                try await auth.withSession { api, token in try await api.deleteContact(id: contact.id, token: token) }
            } catch AuthAPI.Failure.notFound {
                // A contact removed on another client is already deleted.
            }
            conversations.remove(contactID: contact.id)
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
        } catch {
            guard request == generation else { return }
            if case AuthAPI.Failure.notFound = error {
                conversations.remove(contactID: id)
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
            totalUnreadCount = max(0, totalUnreadCount - (contact.unreadCount ?? 0) + state.unreadCount)
            readRevision += 1
            contact.lastReadSequence = state.lastReadSequence
            contact.unreadCount = state.unreadCount
            knownContacts[id] = contact
            if let index = contacts.firstIndex(where: { $0.id == id }) { contacts[index] = contact }
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
