import Foundation
import Observation

struct ChatGroup: Decodable, Hashable, Identifiable {
    let id: String
    let name: String
    let ownerID: String
    let createdAt: Double
    let updatedAt: Double
    let lastMessageText: String?
    let lastMessageAt: Double?
    let lastMessageSenderName: String?
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
    let id: String
    let agentID: String
    let name: String
    let status: String
}
struct GroupMessage: Decodable, Identifiable {
    let sequence: Int
    let id: String
    let userID: String?
    let agentID: String?
    let senderName: String
    let text: String
    let createdAt: Double
    let attachment: ChatAttachment?
}
struct GroupSnapshot: Decodable {
    let group: ChatGroup
    let members: [GroupMember]
    let replies: [GroupReply]
    let canInvite: Bool
    let contributorModel: Bool
}
struct GroupMessagesPage: Decodable {
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
    private var readRevision = 0
    private var reading: Set<String> = []
    private var readSequences: [String: Int] = [:]
    var totalUnreadCount: Int { groups.reduce(0) { $0 + max(0, $1.unreadCount ?? 0) } }

    func markRead(id: String, sequence: Int, using auth: AuthStore) async {
        guard sequence > (readSequences[id] ?? 0), reading.insert(id).inserted else { return }
        defer { reading.remove(id) }
        do {
            let data = try await GroupService.data("\(id)/read", method: "PUT", input: ["sequence": sequence], auth: auth)
            let state = try JSONDecoder().decode(GroupReadState.self, from: data)
            guard state.lastReadSequence >= (readSequences[id] ?? 0) else { return }
            readSequences[id] = state.lastReadSequence
            readRevision += 1
            if let index = groups.firstIndex(where: { $0.id == id }) {
                groups[index].unreadCount = state.unreadCount
                groups[index].lastReadSequence = state.lastReadSequence
            }
            if let userID = auth.user?.id {
                PushNotifications.shared.noteGroupRead(id: id, sequence: state.lastReadSequence, userID: userID)
            }
        } catch { /* Optional read synchronization retries on the next visible refresh. */ }
    }

    func refresh(using auth: AuthStore, refreshInvitations: Bool = true) async {
        guard !isLoading else { return }
        isLoading = true
        let revision = readRevision
        defer { isLoading = false }
        do {
            let list = try await GroupService.read(GroupListResponse.self, auth: auth)
            if refreshInvitations {
                let inbox = try await GroupService.read(GroupInvitationsResponse.self, path: "invitations", auth: auth)
                invitations = inbox.invitations
            }
            guard revision == readRevision else { return }
            if hasLoaded, !Set(groups.map(\.id)).subtracting(list.groups.map(\.id)).isEmpty {
                await auth.images.clear(deactivate: false)
            }
            guard revision == readRevision else { return }
            groups = list.groups
            contributorModel = list.contributorModel
            for group in groups {
                if let sequence = group.lastReadSequence, let userID = auth.user?.id {
                    readSequences[group.id] = max(readSequences[group.id] ?? 0, sequence)
                    PushNotifications.shared.noteGroupRead(id: group.id, sequence: sequence, userID: userID)
                }
            }
            if let userID = auth.user?.id {
                for activity in (list.activity ?? []).reversed() {
                    PushNotifications.shared.presentGroupActivity(activity, userID: userID)
                }
            }
            error = nil
            hasLoaded = true
        } catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }
}

@MainActor @Observable
final class GroupChatStore {
    private(set) var snapshot: GroupSnapshot?
    private(set) var messages: [GroupMessage] = []
    private(set) var newIncomingMessageIDs: Set<String> = []
    private(set) var nextBefore: Int?
    private(set) var isLoading = false
    private(set) var isSending = false
    private(set) var isLoadingMore = false
    var error: String?
    // Keep the UUID and text after an uncertain send so Retry cannot duplicate it.
    private var accessEpoch = 0
    private var pending: (id: String, text: String, attachment: DraftAttachment?, sentAt: Double)?
    var pendingText: String? { pending?.text }
    var pendingID: String? { pending?.id }
    var pendingAttachment: DraftAttachment? { pending?.attachment }
    var pendingSentAt: Double? { pending?.sentAt }

    func refresh(id: String, auth: AuthStore) async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let state = try await GroupService.read(GroupSnapshot.self, path: id, auth: auth)
            let page = try await GroupService.read(GroupMessagesPage.self, path: "\(id)/messages", auth: auth)
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
                    incoming.insert(contentsOf: older.messages, at: 0)
                    cursor = older.nextBefore
                }
            }
            snapshot = state
            if messages.isEmpty { nextBefore = page.nextBefore }
            let knownIDs = Set(messages.map(\.id))
            newIncomingMessageIDs = Set(incoming.filter {
                !knownIDs.contains($0.id) && $0.userID != auth.user?.id && $0.sequence > (state.group.lastReadSequence ?? 0)
            }.map(\.id))
            merge(incoming)
            if let pending, messages.contains(where: { $0.id == pending.id }) { self.pending = nil }
            error = nil
        } catch is CancellationError { }
        catch AuthAPI.Failure.notFound {
            accessEpoch += 1
            snapshot = nil
            nextBefore = nil
            messages = []
            newIncomingMessageIDs = []
            pending = nil
            await auth.images.clear(deactivate: false)
            self.error = "This group is no longer available."
        } catch { self.error = error.localizedDescription }
    }
    private func merge(_ page: [GroupMessage]) {
        var indexed = Dictionary(uniqueKeysWithValues: messages.map { ($0.id, $0) })
        for message in page { indexed[message.id] = message }
        messages = indexed.values.sorted { $0.sequence < $1.sequence }
    }
    func loadMore(id: String, auth: AuthStore) async {
        guard !isLoadingMore, let before = nextBefore else { return }
        isLoadingMore = true
        let epoch = accessEpoch
        defer { isLoadingMore = false }
        do {
            let (data, _) = try await auth.withSession { api, token in
                try await api.send(path: "groups/\(id)/messages", token: token, query: [URLQueryItem(name: "before", value: String(before))])
            }
            let page = try JSONDecoder().decode(GroupMessagesPage.self, from: data)
            guard epoch == accessEpoch else { return }
            merge(page.messages)
            nextBefore = page.nextBefore
        } catch { self.error = error.localizedDescription }
    }
    func send(_ text: String, attachment: DraftAttachment? = nil, id: String, auth: AuthStore) async -> Bool {
        guard !isSending, pending == nil || (pending?.text == text && pending?.attachment == attachment) else { return false }
        isSending = true
        if pending == nil { pending = (UUID().uuidString.lowercased(), text, attachment, Date.now.timeIntervalSince1970 * 1000) }
        defer { isSending = false }
        let submitted = pending!
        do {
            try await auth.withSession { api, token in
                try await api.sendGroupMessage(groupID: id, id: submitted.id, text: submitted.text, attachment: submitted.attachment, token: token)
            }
            MessageSounds.shared.sentGroup(messageID: submitted.id, groupID: id)
            if let file = submitted.attachment, file.mimeType.hasPrefix("image/") {
                await auth.images.store(file.data, for: .groupAttachment(groupID: id, messageID: submitted.id))
            }
            await refresh(id: id, auth: auth)
            return true
        } catch {
            // Polling may confirm a message even if its HTTP acknowledgement was lost.
            await refresh(id: id, auth: auth)
            if messages.contains(where: { $0.id == submitted.id }) { pending = nil; return true }
            if case AuthAPI.Failure.rejected = error { pending = nil }
            if case AuthAPI.Failure.unauthorized = error { pending = nil }
            self.error = error.localizedDescription
            return false
        }
    }
}
