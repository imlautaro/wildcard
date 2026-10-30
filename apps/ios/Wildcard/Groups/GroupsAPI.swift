import Foundation
import Observation

struct ChatGroup: Decodable, Hashable, Identifiable {
    let id: String
    let name: String
    var archivedAt: Double? = nil
    var historyRevision: Int? = nil
    var clearing: Int? = nil
    let ownerID: String
    let createdAt: Double
    let updatedAt: Double
    var replyActivity: String? = nil
    var lastMessageVoice: MessageVoice? = nil
    var lastMessagePreview: String? = nil
    var lastMessageText: String?
    var lastMessageAt: Double?
    var lastMessageSenderName: String?
    var lastMessageID: String? = nil
    var lastMessageUserID: String? = nil
    var lastMessageReceiptState: String? = nil
    let photoVersion: String?
    var unreadCount: Int?
    var lastReadSequence: Int?
}
struct GroupActivity: Decodable {
    let messageID: String
    let sequence: Int
    let groupID: String
    let groupName: String
    let senderName: String
    let sentAt: Double
    let text: String
    var previewText: String? = nil
    var agentID: String? = nil
}
struct GroupReadState: Decodable { let lastReadSequence: Int; let unreadCount: Int }
struct GroupMember: Decodable, Hashable, Identifiable {
    let id: String
    let kind: String
    let name: String
    let photoVersion: String?
    let canInvite: Int
    let addedBy: String?
    var identity: String { "\(kind)/\(id)" }
}
struct GroupReply: Decodable, Identifiable {
    var isTyping: Int? = nil
    var replyActivity: String? = nil
    let id: String
    let agentID: String
    let name: String
    let status: String
    var sourceID: String? = nil
    var sourceSequence: Int? = nil
    var attempt: Int? = nil
    /// Set when the reply is a task work turn; its trigger is hidden from the transcript.
    var taskID: String? = nil
    var taskTitle: String? = nil
}
struct GroupMessage: Decodable, Identifiable, Equatable {
    let sequence: Int
    let id: String
    let userID: String?
    let agentID: String?
    let senderName: String
    var receiptState: String? = nil
    let text: String
    let createdAt: Double
    let attachment: ChatAttachment?
    var replyTo: MessageReplyQuote? = nil
    /// Voice message metadata; human voice messages have empty `text`, contact ones keep the spoken text.
    var voice: MessageVoice? = nil
}
struct GroupPrivateSharing: Decodable, Identifiable {
    let agentID: String
    let enabled: Int
    let available: Int
    var id: String { agentID }
}
struct GroupSnapshot: Decodable {
    let group: ChatGroup
    let members: [GroupMember]
    let replies: [GroupReply]
    var privateSharing: [GroupPrivateSharing]? = nil
    let canInvite: Bool
    let contributorModel: Bool
}
struct GroupMessagesPage: Decodable {
    var historyRevision: Int? = nil
    let messages: [GroupMessage]
    let nextBefore: Int?
}
struct GroupInvitation: Decodable, Identifiable {
    let id: String
    let groupName: String
    let senderName: String
    let expiresAt: Double
}
struct GroupListResponse: Decodable {
    let groups: [ChatGroup]
    let activity: [GroupActivity]?
    let contributorModel: Bool
}
struct GroupInvitationsResponse: Decodable { let invitations: [GroupInvitation]; let contributorModel: Bool }
private struct GroupReceiptUpdate: Decodable { let id: String; let receiptState: String? }
private struct GroupReceiptPage: Decodable { let receipts: [GroupReceiptUpdate] }
struct GroupIDResponse: Decodable { let id: String }

@MainActor
enum GroupService {
    static func data(_ path: String = "", method: String = "GET", input: [String: Any]? = nil, auth: AuthStore) async throws -> Data {
        let body = try input.map { try JSONSerialization.data(withJSONObject: $0) }
        return try await auth.withSession { api, token in
            try await api.send(path: "groups" + (path.isEmpty ? "" : "/\(path)"), method: method, body: body, token: token).0
        }
    }
    static func read<T: Decodable>(_ type: T.Type, path: String = "", auth: AuthStore) async throws -> T {
        try JSONDecoder().decode(type, from: await data(path, auth: auth))
    }
}

@MainActor @Observable
final class GroupsStore {
    private(set) var groups: [ChatGroup] = []
    private(set) var invitations: [GroupInvitation] = []
    private(set) var contributorModel = false
    private(set) var hasLoaded = false
    private(set) var isLoading = false
    var error: String?
    let conversations = GroupConversationCache()
    private var receivedPreviewIDs: Set<String> = []
    private var isRefreshingInbox = false
    private var warmingTask: Task<Void, Never>?
    private var queuedWarmGroups: [ChatGroup]?
    private var refreshRequest: (id: UUID, task: Task<Void, Never>)?

    func archive(_ group: ChatGroup, archived: Bool, using auth: AuthStore) async throws {
        let ownerID = auth.user?.id
        readRevision += 1
        try await auth.withSession { api, token in
            try await api.archiveChat(id: group.id, group: true, archived: archived, token: token)
        }
        guard ownerID == auth.user?.id else { return }
        readRevision += 1
        if let index = groups.firstIndex(where: { $0.id == group.id }) {
            groups[index].archivedAt = archived ? Date().timeIntervalSince1970 * 1000 : nil
        }
        await refreshRequest?.task.value
        await refresh(using: auth, refreshInvitations: false)
    }

    func clear(_ group: ChatGroup, clearMemory: Bool, using auth: AuthStore) async throws {
        let ownerID = auth.user?.id
        readRevision += 1
        try await auth.withSession { api, token in
            try await api.clearChat(id: group.id, group: true, clearMemory: clearMemory, historyRevision: group.historyRevision ?? 0, token: token)
        }
        guard ownerID == auth.user?.id else { return }
        readRevision += 1
        conversations.remove(id: group.id)
        readAcknowledgements.remove(id: group.id)
        VoicePlayer.shared.stop()
        await auth.images.clear(deactivate: false)
        guard ownerID == auth.user?.id else { return }
        await refreshRequest?.task.value
        await refresh(using: auth, refreshInvitations: false)
    }

    func refreshInbox(using auth: AuthStore) async {
        guard !isRefreshingInbox else { return }
        isRefreshingInbox = true
        defer { isRefreshingInbox = false }
        do {
            let inbox = try await GroupService.read(GroupInvitationsResponse.self, path: "invitations", auth: auth)
            invitations = inbox.invitations
        } catch { /* Chat synchronization and invitation retries have independent lifecycles. */ }
    }
    private var readRevision = 0
    private let readAcknowledgements = ReadAcknowledgementQueue()
    private var readSequences: [String: Int] = [:]
    var totalUnreadCount: Int { groups.reduce(0) { $0 + max(0, $1.unreadCount ?? 0) } }

    func preview(for group: ChatGroup) -> ChatGroup {
        guard let chat = conversations.cachedStore(for: group.id) else { return group }
        return chat.preview(for: group)
    }

    @discardableResult
    func noteRead(id: String, sequence: Int, using auth: AuthStore) -> Task<Void, Never>? {
        guard sequence > 0, let ownerID = auth.user?.id else { return nil }
        return readAcknowledgements.enqueue(id: id, sequence: sequence,
            confirmed: readSequences[id] ?? 0) { [weak self] sequence in
            guard let self, auth.state == .signedIn, auth.user?.id == ownerID else { throw CancellationError() }
            do {
                let data = try await GroupService.data("\(id)/read", method: "PUT", input: ["sequence": sequence], auth: auth)
                let state = try JSONDecoder().decode(GroupReadState.self, from: data)
                try Task.checkCancellation()
                guard auth.user?.id == ownerID else { throw CancellationError() }
                guard state.lastReadSequence >= (self.readSequences[id] ?? 0) else {
                    return self.readSequences[id] ?? 0
                }
                self.readSequences[id] = state.lastReadSequence
                self.readRevision += 1
                if let index = self.groups.firstIndex(where: { $0.id == id }) {
                    self.groups[index].unreadCount = state.unreadCount
                    self.groups[index].lastReadSequence = state.lastReadSequence
                }
                PushNotifications.shared.noteGroupRead(id: id, sequence: state.lastReadSequence, userID: ownerID)
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

    func refresh(using auth: AuthStore, refreshInvitations: Bool = true) async {
        if let request = refreshRequest { await request.task.value }
        else {
            let request = (id: UUID(), task: Task { await self.performRefresh(using: auth) })
            refreshRequest = request
            await request.task.value
            if refreshRequest?.id == request.id { refreshRequest = nil }
        }
        if refreshInvitations { await refreshInbox(using: auth) }
    }

    private func performRefresh(using auth: AuthStore) async {
        isLoading = true
        let revision = readRevision
        defer { isLoading = false }
        do {
            let list = try await GroupService.read(GroupListResponse.self, auth: auth)
            guard revision == readRevision else { return }
            let removed = hasLoaded ? Set(groups.map(\.id)).subtracting(list.groups.map(\.id)) : []
            for id in removed {
                readAcknowledgements.remove(id: id)
                readSequences.removeValue(forKey: id)
                conversations.remove(id: id)
            }
            if !removed.isEmpty { await auth.images.clear(deactivate: false) }
            guard revision == readRevision else { return }
            let cleared = list.groups.filter { incoming in
                groups.contains { $0.id == incoming.id && ($0.historyRevision ?? 0) != (incoming.historyRevision ?? 0) }
            }
            for group in cleared { conversations.remove(id: group.id); readAcknowledgements.remove(id: group.id) }
            if !cleared.isEmpty { VoicePlayer.shared.stop(); await auth.images.clear(deactivate: false) }
            guard revision == readRevision else { return }
            let previous = Dictionary(uniqueKeysWithValues: groups.map { ($0.id, $0) })
            groups = list.groups.map { group in
                var result = group
                if let old = previous[group.id], old.lastMessageID == group.lastMessageID {
                    result.lastMessageReceiptState = ReceiptProgress.merge(old.lastMessageReceiptState, group.lastMessageReceiptState)
                }
                return result
            }
            contributorModel = list.contributorModel
            for group in groups {
                if let sequence = group.lastReadSequence, let userID = auth.user?.id {
                    readSequences[group.id] = max(readSequences[group.id] ?? 0, sequence)
                    PushNotifications.shared.noteGroupRead(id: group.id, sequence: sequence, userID: userID)
                }
            }
            for group in groups { conversations.cachedStore(for: group.id)?.reconcile(group) }
            error = nil
            hasLoaded = true
            // Keep already opened chats warm when Home observes new messages.
            warmHistories(list.groups, using: auth)
            guard revision == readRevision else { return }
            if let userID = auth.user?.id {
                for activity in (list.activity ?? []).reversed() {
                    PushNotifications.shared.presentGroupActivity(activity, userID: userID)
                }
            }
            let previewIDs = Set(groups.compactMap(\.lastMessageID))
            let unseen = previewIDs.subtracting(receivedPreviewIDs)
            if !unseen.isEmpty {
                do {
                    _ = try await GroupService.data("receipts", method: "PUT", input: ["messageIDs": Array(unseen)], auth: auth)
                    receivedPreviewIDs.formUnion(unseen)
                    receivedPreviewIDs.formIntersection(previewIDs)
                } catch { /* Retry receipt-only failures on the next list refresh. */ }
            }
        } catch is CancellationError { }
        catch {
            // Background revalidation keeps loaded groups visible through transient failures.
            guard !(hasLoaded && AuthAPI.isTransient(error)) else { return }
            self.error = error.localizedDescription
        }
    }

    private func warmHistories(_ groups: [ChatGroup], using auth: AuthStore) {
        let ownerID = auth.user?.id
        queuedWarmGroups = groups
        guard warmingTask == nil else { return }
        warmingTask = Task {
            while !Task.isCancelled, auth.state == .signedIn, auth.user?.id == ownerID, let batch = queuedWarmGroups {
                queuedWarmGroups = nil
                await withTaskGroup(of: Void.self) { tasks in
                    var inFlight = 0
                    for group in batch {
                        guard !Task.isCancelled, auth.state == .signedIn, auth.user?.id == ownerID else { break }
                        guard let chat = conversations.cachedStore(for: group.id), chat.needsRefresh(for: group) else { continue }
                        tasks.addTask { @MainActor in await chat.refresh(id: group.id, auth: auth) }
                        inFlight += 1
                        if inFlight == 4 { await tasks.next(); inFlight -= 1 }
                    }
                }
            }
            warmingTask = nil
        }
    }

}

@MainActor @Observable
final class GroupChatStore {
    func markVoiceListened(messageID: String) {
        guard !invalidated, let index = messages.firstIndex(where: { $0.id == messageID }) else { return }
        messages[index].voice?.ownListenedAt = Date().timeIntervalSince1970 * 1000
    }

    private(set) var reactions = MessageReactionStore()
    private var historyRevision = 0
    private(set) var snapshot: GroupSnapshot?
    private(set) var messages: [GroupMessage] = []
    private(set) var hasLoadedMessages = false
    private(set) var newIncomingMessageIDs: Set<String> = []
    private(set) var nextBefore: Int?
    private(set) var isLoading = false
    private(set) var isSending = false
    private(set) var isLoadingMore = false
    var error: String?
    // Keep the UUID and text after an uncertain send so Retry cannot duplicate it.
    private var accessEpoch = 0
    private var accountID: String?
    private var invalidated = false
    private var detailsRevision = 0
    private var detailsRequest: (id: UUID, task: Task<GroupSnapshot, Error>)?
    private var refreshRequest: (id: UUID, task: Task<Void, Never>)?
    var isRetained = false

    func invalidateDetails() {
        detailsRevision += 1
        detailsRequest?.task.cancel()
        detailsRequest = nil
    }

    func invalidate() {
        reactions.invalidate()
        invalidated = true
        accessEpoch += 1
        refreshRequest?.task.cancel()
        refreshRequest = nil
        invalidateDetails()
        snapshot = nil
        messages = []
        hasLoadedMessages = false
        nextBefore = nil
        newIncomingMessageIDs = []
        pending = nil
        failedVoice = nil
        pendingAccepted = false
        pendingReadIDs = []
        receivedIDs = []
        readIDs = []
        error = "This group is no longer available."
    }

    func didLeave() {
        isRetained = false
        trimHistory()
    }

    private func trimHistory() {
        guard !isRetained, !isSending, !isLoadingMore, messages.count > 100 else { return }
        messages = Array(messages.suffix(100))
        nextBefore = messages.first?.sequence
        reactions.retain(ids: messages.map(\.id))
        let retained = Set(messages.map(\.id))
        receivedIDs.formIntersection(retained)
        readIDs.formIntersection(retained)
        newIncomingMessageIDs.formIntersection(retained)
        pendingReadIDs.formIntersection(retained)
    }

    func updatePrivateSharing(agentID: String, enabled: Bool) {
        invalidateDetails()
        snapshot?.privateSharing = snapshot?.privateSharing?.map { permission in
            permission.agentID == agentID
                ? GroupPrivateSharing(agentID: agentID, enabled: enabled ? 1 : 0, available: permission.available)
                : permission
        }
    }

    func refreshDetails(id: String, auth: AuthStore) async throws {
        guard !invalidated else { throw AuthAPI.Failure.notFound }
        let revision = detailsRevision
        let request: (id: UUID, task: Task<GroupSnapshot, Error>)
        if let active = detailsRequest { request = active }
        else {
            request = (UUID(), Task { try await GroupService.read(GroupSnapshot.self, path: id, auth: auth) })
            detailsRequest = request
        }
        defer { if detailsRequest?.id == request.id { detailsRequest = nil } }
        do {
            let state = try await request.task.value
            guard !invalidated, revision == detailsRevision else { throw CancellationError() }
            snapshot = state
        } catch AuthAPI.Failure.notFound {
            guard revision == detailsRevision else { throw CancellationError() }
            invalidate()
            await auth.images.clear(deactivate: false)
            error = "This group is no longer available."
            throw AuthAPI.Failure.notFound
        } catch {
            guard !invalidated, revision == detailsRevision else { throw CancellationError() }
            throw error
        }
    }
    private var pendingReadIDs: Set<String> = []
    private var receivedIDs: Set<String> = []
    private var readIDs: Set<String> = []
    private var acknowledging: Set<String> = []

    func acknowledge(_ ids: [String], state: String, id: String, auth: AuthStore) async {
        guard !invalidated else { return }
        if state == "read" { pendingReadIDs.formUnion(Set(ids).subtracting(readIDs)) }
        let known = state == "read" ? readIDs : receivedIDs
        let unseen = Array(Set(ids).subtracting(known)).sorted()
        for offset in stride(from: 0, to: unseen.count, by: 100) {
            guard !invalidated, !Task.isCancelled else { return }
            let batch = Array(unseen[offset..<min(offset + 100, unseen.count)])
            let key = state + batch.joined(separator: "/")
            guard acknowledging.insert(key).inserted else { continue }
            let epoch = accessEpoch
            do {
                _ = try await GroupService.data("\(id)/receipts", method: "PUT",
                    input: ["messageIDs": batch, "state": state], auth: auth)
                if !invalidated, epoch == accessEpoch {
                    receivedIDs.formUnion(batch)
                    if state == "read" { readIDs.formUnion(batch); pendingReadIDs.subtract(batch) }
                    // Bound acknowledgement deduplication to the retained history plus latest preview.
                    let retained = Set(messages.map(\.id) + batch)
                    receivedIDs.formIntersection(retained)
                    readIDs.formIntersection(retained)
                }
            } catch { /* Retry acknowledgements on the next visible polling pass. */ }
            acknowledging.remove(key)
        }
        if state == "received", !pendingReadIDs.isEmpty {
            await acknowledge(Array(pendingReadIDs), state: "read", id: id, auth: auth)
        }
    }

    private var pending: (historyRevision: Int, id: String, text: String, attachment: DraftAttachment?, voice: VoiceClip?, sentAt: Double, replyTo: MessageReplyQuote?)?
    /// A voice message the server rejected; kept until the person retries (with a new ID) or discards it.
    private(set) var failedVoice: (clip: VoiceClip, replyTo: MessageReplyQuote?)?
    func discardFailedVoice() { failedVoice = nil }
    private(set) var pendingAccepted = false
    private var pendingSender: (id: String, name: String)?
    var pendingText: String? { pending.map { value in messages.contains(where: { $0.id == value.id }) ? nil : value.text } ?? nil }

    func needsRefresh(for group: ChatGroup) -> Bool {
        !invalidated && (pending != nil || !pendingReadIDs.isEmpty || group.lastMessageID != messages.last?.id || messages.contains {
            $0.userID == accountID && $0.userID != nil && $0.agentID == nil &&
                ($0.receiptState == "sent" || $0.receiptState == "received")
        })
    }

    func reconcile(_ group: ChatGroup) {
        guard !invalidated, let index = messages.firstIndex(where: { $0.id == group.lastMessageID }) else { return }
        messages[index].receiptState = ReceiptProgress.merge(messages[index].receiptState, group.lastMessageReceiptState)
        messages[index].voice = messages[index].voice?.merging(group.lastMessageVoice)
    }

    func preview(for group: ChatGroup) -> ChatGroup {
        guard !invalidated else { return group }
        var result = group
        if let message = messages.last,
           message.id == group.lastMessageID || message.createdAt >= (group.lastMessageAt ?? 0) {
            result.lastMessageID = message.id
            result.lastMessageVoice = message.voice
            result.lastMessageText = message.voice != nil ? "Voice message"
                : message.text.isEmpty ? message.attachment.map { "Attachment: " + $0.name } ?? "" : String(message.text.prefix(500))
            result.lastMessagePreview = message.agentID != nil && message.voice == nil && !message.text.isEmpty
                ? String(MessageMarkdown.plainText(message.text).prefix(500)) : result.lastMessageText
            result.lastMessageAt = message.createdAt
            result.lastMessageSenderName = message.senderName
            result.lastMessageUserID = message.userID
            result.lastMessageReceiptState = message.id == group.lastMessageID ?
                ReceiptProgress.merge(message.receiptState, group.lastMessageReceiptState) : message.receiptState
        }
        if let pending, !messages.contains(where: { $0.id == pending.id }) {
            result.lastMessageID = pending.id
            result.lastMessageVoice = pending.voice?.metadata
            result.lastMessageText = pending.voice != nil ? "Voice message"
                : pending.text.isEmpty ? pending.attachment.map { "Attachment: " + $0.name } ?? "" : pending.text
            result.lastMessagePreview = result.lastMessageText
            result.lastMessageAt = pending.sentAt
            result.lastMessageUserID = pendingSender?.id
            result.lastMessageSenderName = pendingSender?.name
            result.lastMessageReceiptState = "sent"
        }
        return result
    }
    var pendingID: String? { pending?.id }
    var pendingAttachment: DraftAttachment? { pending?.attachment }
    var pendingVoice: VoiceClip? { pending?.voice }
    var pendingSentAt: Double? { pending?.sentAt }
    var pendingReplyTo: MessageReplyQuote? { pending?.replyTo }

    func refresh(id: String, auth: AuthStore) async {
        guard !invalidated else { return }
        if let request = refreshRequest { await request.task.value; return }
        let request = (id: UUID(), task: Task { await self.performRefresh(id: id, auth: auth) })
        refreshRequest = request
        await request.task.value
        if refreshRequest?.id == request.id { refreshRequest = nil }
    }

    private func performRefresh(id: String, auth: AuthStore) async {
        guard !invalidated else { return }
        accountID = auth.user?.id
        isLoading = true
        let epoch = accessEpoch
        defer { isLoading = false; trimHistory() }
        do {
            async let details: Void = refreshDetails(id: id, auth: auth)
            let page = try await GroupService.read(GroupMessagesPage.self, path: "\(id)/messages", auth: auth)
            try await details
            var incoming = page.messages
            // Catch up across multiple pages after the app spent time in the background.
            var cursor = page.nextBefore
            if let latest = messages.last?.sequence {
                while let before = cursor, (incoming.first?.sequence ?? latest) > latest {
                    try Task.checkCancellation()
                    let (data, _) = try await auth.withSession { api, token in
                        try await api.send(path: "groups/\(id)/messages", token: token,
                                           query: [URLQueryItem(name: "before", value: String(before))])
                    }
                    let older = try JSONDecoder().decode(GroupMessagesPage.self, from: data)
                    guard (older.historyRevision ?? 0) == (page.historyRevision ?? 0) else { return }
                    incoming.insert(contentsOf: older.messages, at: 0)
                    guard older.nextBefore != cursor else { break }
                    cursor = older.nextBefore
                }
            }
            guard !invalidated, epoch == accessEpoch, let state = snapshot else { return }
            guard (page.historyRevision ?? 0) >= historyRevision else { return }
            if historyRevision != (page.historyRevision ?? 0) {
                reactions.invalidate(); reactions = MessageReactionStore()
                messages = []; pending = nil; failedVoice = nil; nextBefore = nil; newIncomingMessageIDs = []
                VoicePlayer.shared.stop()
                await auth.images.clear(deactivate: false)
                guard !invalidated, epoch == accessEpoch else { return }
            }
            historyRevision = page.historyRevision ?? 0
            if messages.isEmpty { nextBefore = cursor }
            let knownIDs = Set(messages.map(\.id))
            newIncomingMessageIDs.formUnion(incoming.filter {
                !knownIDs.contains($0.id) && $0.userID != auth.user?.id && $0.sequence > (state.group.lastReadSequence ?? 0)
            }.map(\.id))
            merge(incoming)
            await reactions.refresh(path: "groups/\(id)/reactions", ids: messages.map(\.id), auth: auth)
            guard !invalidated, epoch == accessEpoch else { return }
            hasLoadedMessages = true
            if let pending, messages.contains(where: { $0.id == pending.id }) {
                self.pending = nil
                pendingAccepted = false
                MessageSounds.shared.sentGroup(messageID: pending.id, groupID: id)
                if let file = pending.attachment, file.mimeType.hasPrefix("image/") {
                    await auth.images.store(file.data, for: .groupAttachment(groupID: id, messageID: pending.id))
                }
                if let clip = pending.voice { await auth.images.audio.store(clip.data, for: .groupVoice(groupID: id, messageID: pending.id)) }
                guard !invalidated, epoch == accessEpoch else { return }
            }
            // Refresh older retained outgoing receipts without refetching message bodies.
            let recentIDs = Set(incoming.map(\.id))
            let olderIDs = messages.filter { $0.userID == auth.user?.id && $0.agentID == nil && !recentIDs.contains($0.id) }.map(\.id)
            for offset in stride(from: 0, to: olderIDs.count, by: 100) {
                let ids = Array(olderIDs[offset..<min(offset + 100, olderIDs.count)])
                let encoded = String(decoding: try JSONEncoder().encode(ids), as: UTF8.self)
                let (data, _) = try await auth.withSession { api, token in
                    try await api.send(path: "groups/\(id)/receipts", token: token,
                        query: [URLQueryItem(name: "messageIDs", value: encoded)])
                }
                let updates = try JSONDecoder().decode(GroupReceiptPage.self, from: data)
                guard !invalidated, epoch == accessEpoch else { return }
                let byID = Dictionary(uniqueKeysWithValues: updates.receipts.map { ($0.id, $0) })
                for index in messages.indices {
                    if let update = byID[messages[index].id] {
                        messages[index].receiptState = ReceiptProgress.merge(messages[index].receiptState, update.receiptState)
                    }
                }
            }
            error = nil
            if !pendingReadIDs.isEmpty {
                await acknowledge(Array(pendingReadIDs), state: "read", id: id, auth: auth)
            }
        } catch is CancellationError { }
        catch AuthAPI.Failure.notFound {
            guard !invalidated, epoch == accessEpoch else { return }
            invalidate()
            await auth.images.clear(deactivate: false)
            self.error = "This group is no longer available."
        } catch {
            guard !invalidated, epoch == accessEpoch, !(hasLoadedMessages && AuthAPI.isTransient(error)) else { return }
            self.error = error.localizedDescription
        }
    }
    private func merge(_ page: [GroupMessage]) {
        var indexed = Dictionary(uniqueKeysWithValues: messages.map { ($0.id, $0) })
        for message in page {
            var merged = message
            merged.receiptState = ReceiptProgress.merge(indexed[message.id]?.receiptState, message.receiptState)
            merged.voice = merged.voice?.merging(indexed[message.id]?.voice)
            indexed[message.id] = merged
        }
        messages = indexed.values.sorted { $0.sequence < $1.sequence }
    }
    func loadMore(id: String, auth: AuthStore) async {
        guard !invalidated, !isLoadingMore, let before = nextBefore else { return }
        isLoadingMore = true
        let epoch = accessEpoch
        defer { isLoadingMore = false; trimHistory() }
        do {
            let (data, _) = try await auth.withSession { api, token in
                try await api.send(path: "groups/\(id)/messages", token: token, query: [URLQueryItem(name: "before", value: String(before))])
            }
            let page = try JSONDecoder().decode(GroupMessagesPage.self, from: data)
            guard !invalidated, epoch == accessEpoch, nextBefore == before else { return }
            guard (page.historyRevision ?? 0) == historyRevision else { return }
            merge(page.messages)
            await reactions.refresh(path: "groups/\(id)/reactions", ids: messages.map(\.id), auth: auth)
            guard !invalidated, epoch == accessEpoch else { return }
            nextBefore = page.nextBefore
        } catch is CancellationError { }
        catch AuthAPI.Failure.notFound {
            guard !invalidated, epoch == accessEpoch else { return }
            invalidate()
            await auth.images.clear(deactivate: false)
        }
        catch {
            guard !invalidated, epoch == accessEpoch else { return }
            self.error = error.localizedDescription
        }
    }
    func send(_ text: String, attachment: DraftAttachment? = nil, voice: VoiceClip? = nil, replyTo: MessageReplyQuote? = nil, id: String, auth: AuthStore) async -> Bool {
        guard !invalidated, !isSending, pending == nil || (pending?.text == text && pending?.attachment == attachment
            && pending?.voice == voice && pending?.replyTo?.messageID == replyTo?.messageID) else {
            if let voice, !invalidated, pending?.voice != voice { failedVoice = (voice, replyTo) }
            return false
        }
        isSending = true
        if voice != nil { failedVoice = nil }
        if pending == nil {
            pending = (historyRevision, UUID().uuidString.lowercased(), text, attachment, voice, Date.now.timeIntervalSince1970 * 1000, replyTo)
            pendingAccepted = false
            pendingSender = auth.user.map { ($0.id, $0.name) }
        }
        let epoch = accessEpoch
        defer { isSending = false; trimHistory() }
        let submitted = pending!
        do {
            try await auth.withSession { api, token in
                try await api.sendGroupMessage(groupID: id, historyRevision: submitted.historyRevision, id: submitted.id, text: submitted.text, attachment: submitted.attachment,
                                               voice: submitted.voice, replyToID: submitted.replyTo?.messageID, token: token)
            }
            guard !invalidated, epoch == accessEpoch else { return false }
            if pending?.id == submitted.id { pendingAccepted = true }
            error = nil
            MessageSounds.shared.sentGroup(messageID: submitted.id, groupID: id)
            if let file = submitted.attachment, file.mimeType.hasPrefix("image/") {
                await auth.images.store(file.data, for: .groupAttachment(groupID: id, messageID: submitted.id))
            }
            if let clip = submitted.voice { await auth.images.audio.store(clip.data, for: .groupVoice(groupID: id, messageID: submitted.id)) }
            await refresh(id: id, auth: auth)
            return true
        } catch is CancellationError { return false }
        catch {
            guard !invalidated, epoch == accessEpoch else { return false }
            // Polling may confirm a message even if its HTTP acknowledgement was lost.
            await refresh(id: id, auth: auth)
            guard !invalidated, epoch == accessEpoch else { return false }
            if messages.contains(where: { $0.id == submitted.id }) { pending = nil; pendingAccepted = false; return true }
            if case AuthAPI.Failure.rejected = error { pending = nil }
            if case AuthAPI.Failure.unauthorized = error { pending = nil }
            // A rejected clip is not pending anymore, but the person can still retry or discard it.
            if pending == nil, let clip = submitted.voice { failedVoice = (clip, submitted.replyTo) }
            self.error = error.localizedDescription
            return false
        }
    }
}

/// Session-owned LRU. Pending submissions must retain their idempotency state.
@MainActor @Observable
final class GroupConversationCache {
    private var entries: [String: GroupChatStore] = [:]
    /// Chat details media pages; dropped with the group's conversation.
    @ObservationIgnored let media = NavigationSnapshotCache<ChatMediaPage>()
    /// Shared task boards; dropped with the group's conversation.
    @ObservationIgnored let tasks = NavigationSnapshotCache<TaskBoard>()
    @ObservationIgnored let learning = NavigationSnapshotCache<ConversationLearningSnapshot>()
    @ObservationIgnored let documents = DocumentCaches()
    /// Shared group mini apps, keyed by `groups/<id>`; dropped with the group's conversation.
    @ObservationIgnored let miniApps = MiniAppStore()
    @ObservationIgnored private var access: UInt64 = 0
    @ObservationIgnored private var lastAccess: [String: UInt64] = [:]

    func cachedStore(for id: String) -> GroupChatStore? { entries[id] }

    func store(for id: String) -> GroupChatStore {
        access &+= 1
        lastAccess[id] = access
        if let store = entries[id] { return store }
        while entries.count >= 8, let oldest = entries.filter({
            !$0.value.isRetained && !$0.value.isSending && !$0.value.isLoadingMore
                && $0.value.pendingID == nil && $0.value.failedVoice == nil && $0.value.reactions.pending.isEmpty
        }).min(by: { (lastAccess[$0.key] ?? 0) < (lastAccess[$1.key] ?? 0) })?.key {
            lastAccess.removeValue(forKey: oldest)
            entries.removeValue(forKey: oldest)?.invalidate()
        }
        let store = GroupChatStore()
        entries[id] = store
        return store
    }

    func remove(id: String) {
        learning.remove(id: id)
        lastAccess.removeValue(forKey: id)
        entries.removeValue(forKey: id)?.invalidate()
        media.forget(.group(id))
        tasks.remove(id: "groups/\(id)")
        documents.forget("groups/\(id)")
        miniApps.forget(base: "groups/\(id)")
    }
}
