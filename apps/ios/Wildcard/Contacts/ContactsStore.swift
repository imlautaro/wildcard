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
    private let readAcknowledgements = ReadAcknowledgementQueue()
    let conversations = ConversationCache()
    let scheduleSnapshots = NavigationSnapshotCache<[ContactSchedule]>()
    let mcpAccessSnapshots = NavigationSnapshotCache<[McpAccess]>()
    let mcpSnapshots = NavigationSnapshotCache<[McpConnection]>()
    let energySnapshots = NavigationSnapshotCache<ContactEnergy>()
    let learningSnapshots = NavigationSnapshotCache<ConversationLearningSnapshot>()
    /// The account-independent voice catalog for the contact voice picker, cached for the session.
    let voiceCatalog = NavigationSnapshotCache<[VoiceOption]>()
    let personalitySnapshots = NavigationSnapshotCache<ContactPersonalitySnapshot>()
    @ObservationIgnored private var personalityDrafts: [String: PersonalityDraft] = [:]
    @ObservationIgnored private var personalityDraftOrder: [String] = []

    func personalitySnapshot(id: String) -> NavigationSnapshot<ContactPersonalitySnapshot> {
        personalitySnapshots.store(for: id, preserving: Set(personalityDrafts.filter { $0.value.saving }.map(\.key)))
    }

    func personalityDraft(id: String) -> PersonalityDraft {
        personalityDraftOrder.removeAll { $0 == id }
        personalityDraftOrder.append(id)
        if let value = personalityDrafts[id] { return value }
        if personalityDrafts.count >= 8, let oldest = personalityDraftOrder.first(where: { personalityDrafts[$0]?.saving != true }) {
            personalityDrafts.removeValue(forKey: oldest)
            personalityDraftOrder.removeAll { $0 == oldest }
        }
        let value = PersonalityDraft()
        personalityDrafts[id] = value
        return value
    }

    func forgetPersonality(id: String) {
        personalitySnapshots.remove(id: id)
        if let draft = personalityDrafts[id] {
            draft.profile = ContactPersonality()
            draft.baseline = draft.profile
            draft.loaded = false
            draft.revision = 0
        }
        personalityDrafts.removeValue(forKey: id)
        personalityDraftOrder.removeAll { $0 == id }
    }
    let sharingSnapshots = NavigationSnapshotCache<ContactSharing>()
    let mediaSnapshots = NavigationSnapshotCache<ChatMediaPage>()
    let taskSnapshots = NavigationSnapshotCache<TaskBoard>()
    let documentCaches = DocumentCaches()
    let miniApps = MiniAppStore()
    private var refreshRequest: (id: UUID, task: Task<Void, Never>)?
    private var warmingTask: Task<Void, Never>?
    private var queuedWarmContacts: [Contact]?
    private var queuedAnnouncements: Set<String> = []
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

    var nativeDirectoryContacts: [Contact] {
        Array(knownContacts.values).sorted { $0.id < $1.id }
    }

    func contact(id: String) -> Contact? { knownContacts[id] }

    func preview(for contact: Contact) -> Contact {
        guard let chat = conversations.cachedStore(for: contact.id),
              let turn = chat.displayedTurns.last else { return contact }
        let timestamp = turn.assistantText == nil ? turn.createdAt : turn.updatedAt
        guard chat.isSubmitting(turn.id) || timestamp >= (contact.lastMessageAt ?? 0) else { return contact }
        var result = contact
        result.lastMessageVoice = turn.assistantText == nil ? turn.voice : turn.assistantMessages?.last?.voice
        result.lastMessageText = messagePreview(for: turn)
        result.lastMessagePreview = result.lastMessageText == "Voice message" ? result.lastMessageText
            : turn.assistantText.map { String(MessageMarkdown.plainText($0).prefix(500)) } ?? result.lastMessageText
        result.lastMessageAt = timestamp
        result.lastMessageFromUser = turn.assistantText == nil && turn.scheduleID == nil && turn.groupRequestID == nil ? 1 : 0
        result.lastMessageReadAt = [turn.readAt, timestamp == contact.lastMessageAt ? contact.lastMessageReadAt : nil].compactMap { $0 }.max()
        return result
    }

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
        // Voice messages never preview their transcript or spoken text.
        if turn.assistantText == nil ? turn.voice != nil : turn.assistantMessages?.last?.voice != nil { return "Voice message" }
        let fallback = turn.scheduleID != nil ? "Scheduled message" : turn.groupRequestID != nil ? "Group response" :
            turn.userText.isEmpty ? turn.attachment.map { "Attachment: " + $0.name } ?? "" : turn.userText
        return String(String.UnicodeScalarView((turn.assistantText ?? fallback).unicodeScalars.prefix(500)))
    }

    func refresh(using auth: AuthStore, force: Bool = true, preserveLoadedPages: Bool = false) async {
        guard !isMutating else { return }
        if let request = refreshRequest { await request.task.value; return }
        let request = (id: UUID(), task: Task {
            await self.performRefresh(using: auth, force: force, preserveLoadedPages: preserveLoadedPages)
        })
        refreshRequest = request
        await request.task.value
        if refreshRequest?.id == request.id { refreshRequest = nil }
    }

    private func performRefresh(using auth: AuthStore, force: Bool, preserveLoadedPages: Bool) async {
        guard !isMutating, (!preserveLoadedPages || !isLoadingMore) else { return }
        if !force, let refreshedAt, Date().timeIntervalSince(refreshedAt) < freshness { return }
        generation += 1
        let request = generation
        let readSnapshot = readRevision
        isLoading = true
        isLoadingMore = false
        defer { if request == generation { isLoading = false } }
        do {
            let page = try await auth.withSession { api, token in try await api.contacts(token: token) }
            guard request == generation, readSnapshot == readRevision, !Task.isCancelled else { return }
            let clearedIDs = page.contacts.filter { incoming in
                guard let old = knownContacts[incoming.id] else { return false }
                return (old.historyRevision ?? 0) != (incoming.historyRevision ?? 0)
            }.map(\.id)
            for id in clearedIDs { forgetHistory(id: id) }
            if !clearedIDs.isEmpty { await auth.images.clear(deactivate: false) }
            guard request == generation else { return }
            let previousContacts = knownContacts
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
            let removed = contacts.filter { existing in
                guard firstPageIDs.contains(existing.id), !incomingIDs.contains(existing.id) else { return false }
                guard page.nextCursor != nil, let boundary = page.contacts.last else { return true }
                return !isMoreRecent(boundary, than: existing)
            }
            for contact in removed {
                readAcknowledgements.remove(id: contact.id)
                conversations.remove(contactID: contact.id)
                NativeExperiments.shared.forget(contactID: contact.id)
                scheduleSnapshots.remove(id: contact.id)
                sharingSnapshots.remove(id: contact.id)
                energySnapshots.remove(id: contact.id)
                learningSnapshots.remove(id: contact.id)
                forgetPersonality(id: contact.id)
                mcpAccessSnapshots.remove(id: "contact:\(contact.id)")
                miniApps.forget(base: "contacts/\(contact.id)")
                mediaSnapshots.forget(.contact(contact.id))
                taskSnapshots.remove(id: "contacts/\(contact.id)")
                documentCaches.forget("contacts/\(contact.id)")
                knownContacts.removeValue(forKey: contact.id)
                contactRefreshedAt.removeValue(forKey: contact.id)
                messageTimestamps.removeValue(forKey: contact.id)
            }
            if !removed.isEmpty { await auth.images.clear(deactivate: false) }
            guard request == generation, readSnapshot == readRevision, !Task.isCancelled else { return }
            contacts = page.contacts.map { contact in
                var result = contact
                if let previous = previousContacts[contact.id], previous.lastMessageAt == result.lastMessageAt,
                   previous.lastMessageFromUser == result.lastMessageFromUser {
                    result.lastMessageReadAt = [previous.lastMessageReadAt, result.lastMessageReadAt].compactMap { $0 }.max()
                }
                return result
            } + additional
            for contact in contacts { knownContacts[contact.id] = contact }
            sortContacts()
            firstPageIDs = incomingIDs
            totalUnreadCount = page.totalUnreadCount ?? page.contacts.reduce(0) { $0 + ($1.unreadCount ?? 0) }
            // Rebase when rows cross the first-page boundary. Load more deduplicates
            // repeated rows while filling gaps caused by the mutable activity order.
            if additional.isEmpty || firstPageChanged { nextCursor = page.nextCursor }
            hasLoaded = true
            refreshedAt = .now
            error = nil
            // List evidence updates receipts and warms existing histories before navigation.
            for contact in page.contacts { conversations.cachedStore(for: contact.id)?.reconcile(contact) }
            let changedIDs = Set(changedReplies.map(\.id))
            warmHistories(page.contacts, announcing: changedIDs, using: auth)
        } catch {
            // Background revalidation keeps loaded rows visible through transient failures.
            guard request == generation, !isCancellation(error), !(hasLoaded && AuthAPI.isTransient(error)) else { return }
            self.error = error.localizedDescription
        }
    }

    private func warmHistories(_ contacts: [Contact], announcing ids: Set<String>, using auth: AuthStore) {
        let ownerID = auth.user?.id
        queuedWarmContacts = contacts
        queuedAnnouncements.formUnion(ids)
        guard warmingTask == nil else { return }
        warmingTask = Task {
            while !Task.isCancelled, auth.state == .signedIn, auth.user?.id == ownerID, let batch = queuedWarmContacts {
                queuedWarmContacts = nil
                let announcements = queuedAnnouncements
                queuedAnnouncements.removeAll()
                await withTaskGroup(of: Void.self) { tasks in
                    var inFlight = 0
                    for contact in batch {
                        guard !Task.isCancelled, auth.state == .signedIn, auth.user?.id == ownerID else { break }
                        let cached = conversations.cachedStore(for: contact.id)
                        guard cached?.needsRefresh(for: contact) == true || announcements.contains(contact.id) else { continue }
                        // Unopened notification histories must not evict navigation caches.
                        let chat = cached ?? ChatStore()
                        tasks.addTask { @MainActor in await chat.refresh(contactID: contact.id, using: auth) }
                        inFlight += 1
                        if inFlight == 4 { await tasks.next(); inFlight -= 1 }
                    }
                }
            }
            warmingTask = nil
        }
    }

    func loadMore(using auth: AuthStore) async {
        if let request = refreshRequest { await request.task.value }
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

    func setInitiative(contactID: String, enabled: Bool, using auth: AuthStore) async throws {
        try await updateContact(contactID: contactID, using: auth) { api, token in
            try await api.setContactInitiative(id: contactID, enabled: enabled, token: token)
        }
    }

    /// This participant's opt-in to voice replies from the contact.
    func setVoiceMessages(contactID: String, enabled: Bool, using auth: AuthStore) async throws {
        try await updateContact(contactID: contactID, using: auth) { api, token in
            try await api.setContactVoiceMessages(id: contactID, enabled: enabled, token: token)
        }
    }

    /// The contact's shared voice; the server allows only its creator to change it.
    func setVoice(contactID: String, voiceID: String, using auth: AuthStore) async throws {
        try await updateContact(contactID: contactID, using: auth) { api, token in
            try await api.setContactVoice(id: contactID, voiceID: voiceID, token: token)
        }
    }

    func setSpeechAccent(contactID: String, accent: String, using auth: AuthStore) async throws {
        try await updateContact(contactID: contactID, using: auth) { api, token in
            try await api.setContactSpeechAccent(id: contactID, accent: accent, token: token)
        }
    }

    private func updateContact(contactID: String, using auth: AuthStore,
                               _ operation: (AuthAPI, String) async throws -> Contact) async throws {
        try beginMutation()
        let request = generation
        defer { if request == generation { isMutating = false } }
        let saved = try await auth.withSession(operation)
        guard request == generation, !Task.isCancelled else { return }
        knownContacts[contactID] = saved
        if let index = contacts.firstIndex(where: { $0.id == contactID }) { contacts[index] = saved }
        sortContacts()
        contactRefreshedAt[contactID] = .now
        refreshedAt = nil
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

    private func forgetHistory(id: String) {
        learningSnapshots.remove(id: id)
        conversations.remove(contactID: id)
        NativeExperiments.shared.forget(contactID: id)
        scheduleSnapshots.remove(id: id)
        forgetPersonality(id: id)
        miniApps.forget(base: "contacts/\(id)")
        mediaSnapshots.forget(.contact(id))
        taskSnapshots.remove(id: "contacts/\(id)")
        documentCaches.forget("contacts/\(id)")
        readAcknowledgements.remove(id: id)
        messageTimestamps.removeValue(forKey: id)
        VoicePlayer.shared.stop()
    }

    func archive(_ contact: Contact, archived: Bool, using auth: AuthStore) async throws {
        try await updateContact(contactID: contact.id, using: auth) { api, token in
            try await api.archiveChat(id: contact.id, group: false, archived: archived, token: token)
            return try await api.contact(id: contact.id, token: token)
        }
    }

    func clear(_ contact: Contact, clearMemory: Bool, using auth: AuthStore) async throws {
        try beginMutation()
        let request = generation
        let ownerID = auth.user?.id
        defer { if request == generation { isMutating = false } }
        try await auth.withSession { api, token in
            try await api.clearChat(id: contact.id, group: false, clearMemory: clearMemory, historyRevision: contact.historyRevision ?? 0, token: token)
        }
        guard request == generation, ownerID == auth.user?.id else { return }
        forgetHistory(id: contact.id)
        await auth.images.clear(deactivate: false)
        guard request == generation, ownerID == auth.user?.id else { return }
        let saved = try await auth.withSession { api, token in try await api.contact(id: contact.id, token: token) }
        guard request == generation, ownerID == auth.user?.id else { return }
        totalUnreadCount = max(0, totalUnreadCount - (knownContacts[contact.id]?.unreadCount ?? 0))
        knownContacts[contact.id] = saved
        if let index = contacts.firstIndex(where: { $0.id == contact.id }) { contacts[index] = saved }
        refreshedAt = nil
        sortContacts()
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
            NativeExperiments.shared.forget(contactID: contact.id)
            scheduleSnapshots.remove(id: contact.id)
            sharingSnapshots.remove(id: contact.id)
            energySnapshots.remove(id: contact.id)
            learningSnapshots.remove(id: contact.id)
            forgetPersonality(id: contact.id)
            mcpAccessSnapshots.remove(id: "contact:\(contact.id)")
            miniApps.forget(base: "contacts/\(contact.id)")
            mediaSnapshots.forget(.contact(contact.id))
            taskSnapshots.remove(id: "contacts/\(contact.id)")
            documentCaches.forget("contacts/\(contact.id)")
            readAcknowledgements.remove(id: contact.id)
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
        guard !isMutating else { return }
        if !force, let date = contactRefreshedAt[id], Date().timeIntervalSince(date) < freshness { return }
        guard refreshingContacts.insert(id).inserted else { return }
        defer { refreshingContacts.remove(id) }
        let request = generation
        let readSnapshot = readRevision
        do {
            let contact = try await auth.withSession { api, token in try await api.contact(id: id, token: token) }
            guard request == generation, readSnapshot == readRevision, !Task.isCancelled else { return }
            if let old = knownContacts[id], (old.historyRevision ?? 0) != (contact.historyRevision ?? 0) {
                forgetHistory(id: id)
                await auth.images.clear(deactivate: false)
                guard request == generation else { return }
            }
            knownContacts[id] = contact
            contactRefreshedAt[id] = .now
            if let index = contacts.firstIndex(where: { $0.id == id }) { contacts[index] = contact }
            sortContacts()
        } catch {
            guard request == generation else { return }
            if case AuthAPI.Failure.notFound = error {
                await auth.images.clear(deactivate: false)
                guard request == generation else { return }
                NativeExperiments.shared.forget(contactID: id)
                scheduleSnapshots.remove(id: id)
                sharingSnapshots.remove(id: id)
                energySnapshots.remove(id: id)
                learningSnapshots.remove(id: id)
                forgetPersonality(id: id)
                mcpAccessSnapshots.remove(id: "contact:\(id)")
                miniApps.forget(base: "contacts/\(id)")
                mediaSnapshots.forget(.contact(id))
                taskSnapshots.remove(id: "contacts/\(id)")
                documentCaches.forget("contacts/\(id)")
                readAcknowledgements.remove(id: id)
                conversations.remove(contactID: id)
                messageTimestamps.removeValue(forKey: id)
                contactRefreshedAt.removeValue(forKey: id)
                knownContacts.removeValue(forKey: id)
                contacts.removeAll { $0.id == id }
            }
            throw error
        }
    }

    /// Called synchronously when loaded replies are presented, before view teardown.
    @discardableResult
    func noteRead(id: String, sequence: Int, using auth: AuthStore) -> Task<Void, Never>? {
        guard sequence > 0, let ownerID = auth.user?.id else { return nil }
        return readAcknowledgements.enqueue(id: id, sequence: sequence,
            confirmed: knownContacts[id]?.lastReadSequence ?? 0) { [weak self] sequence in
            guard let self, auth.state == .signedIn, auth.user?.id == ownerID else { throw CancellationError() }
            do {
                let started = self.readRevision
                let state = try await auth.withSession { api, token in
                    try await api.markChatRead(contactID: id, sequence: sequence, token: token)
                }
                try Task.checkCancellation()
                guard auth.user?.id == ownerID else { throw CancellationError() }
                guard var contact = self.knownContacts[id] else { return state.lastReadSequence }
                guard state.lastReadSequence >= (contact.lastReadSequence ?? 0) else {
                    return contact.lastReadSequence ?? 0
                }
                let adjusted = max(0, self.totalUnreadCount - (contact.unreadCount ?? 0) + state.unreadCount)
                self.totalUnreadCount = started == self.readRevision ? state.totalUnreadCount ?? adjusted : adjusted
                self.readRevision += 1
                contact.lastReadSequence = state.lastReadSequence
                contact.unreadCount = state.unreadCount
                self.knownContacts[id] = contact
                if let index = self.contacts.firstIndex(where: { $0.id == id }) { self.contacts[index] = contact }
                self.sortContacts()
                self.refreshedAt = nil
                return state.lastReadSequence
            } catch AuthAPI.Failure.notFound {
                self.readAcknowledgements.remove(id: id)
                throw AuthAPI.Failure.notFound
            }
        }
    }

    func markRead(id: String, sequence: Int, using auth: AuthStore) async {
        await noteRead(id: id, sequence: sequence, using: auth)?.value
    }

    func retryPendingReads() { readAcknowledgements.retryPending() }

    private func beginMutation() throws {
        guard !isMutating else { throw MutationInProgress() }
        generation += 1
        refreshRequest?.task.cancel()
        refreshRequest = nil
        warmingTask?.cancel()
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
