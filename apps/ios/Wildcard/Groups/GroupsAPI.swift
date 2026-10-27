import Foundation
import Observation

struct ChatGroup: Decodable, Hashable, Identifiable {
    let id: String
    let name: String
    let ownerID: String
    let createdAt: Double
    let updatedAt: Double
    let lastMessageText: String?
    let photoVersion: String?
}
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
struct GroupListResponse: Decodable { let groups: [ChatGroup]; let contributorModel: Bool }
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

    func refresh(using auth: AuthStore) async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let list = try await GroupService.read(GroupListResponse.self, auth: auth)
            let inbox = try await GroupService.read(GroupInvitationsResponse.self, path: "invitations", auth: auth)
            if hasLoaded, !Set(groups.map(\.id)).subtracting(list.groups.map(\.id)).isEmpty {
                await auth.images.clear(deactivate: false)
            }
            groups = list.groups
            contributorModel = list.contributorModel
            invitations = inbox.invitations
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
            merge(incoming)
            if let pending, messages.contains(where: { $0.id == pending.id }) { self.pending = nil }
            error = nil
        } catch is CancellationError { }
        catch AuthAPI.Failure.notFound {
            accessEpoch += 1
            snapshot = nil
            nextBefore = nil
            messages = []
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
