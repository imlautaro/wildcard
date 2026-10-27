// Deterministic dependencies for the production stores. No real network or accounts.
import Foundation
import Observation

struct ChatAttachment: Codable, Equatable, Sendable {
    let name: String; let mimeType: String; let size: Int
}
struct DraftAttachment: Encodable, Equatable, Sendable {
    let id = UUID(); let name: String; let mimeType: String; let data: Data
}
struct ContactSchedule: Sendable {}
struct ContactSharing: Sendable {}
struct AuthUser { let id = "fictional-user"; let name = "Test User" }
enum ImageResource {
    case attachment(contactID: String, turnID: String)
    case contactAvatar(contactID: String, version: String)
    case groupAttachment(groupID: String, messageID: String)
}
@MainActor final class PrivateImageCache {
    func clear(deactivate: Bool = true) async {}
    func store(_ data: Data, for resource: ImageResource) async {}
}
@MainActor final class AuthStore {
    enum State { case signedIn, signedOut }
    var state = State.signedIn
    var user: AuthUser? = AuthUser()
    let images = PrivateImageCache()
    let api = AuthAPI()
    func withSession<T>(_ operation: (AuthAPI, String) async throws -> T) async throws -> T {
        let value = try await operation(api, "fictional-token")
        guard state == .signedIn else { throw CancellationError() }
        return value
    }
}
@MainActor final class MessageSounds {
    static let shared = MessageSounds()
    var onSent: ((String) -> Void)?
    var onReceived: ((String) -> Void)?
    func sent(turnID: String, contactID: String) { onSent?(turnID) }
    func received(turnID: String, contactID: String, userID: String, completedAt: Date) { onReceived?(turnID) }
    func sentGroup(messageID: String, groupID: String) { onSent?(messageID) }
}
@MainActor final class PushNotifications {
    enum Conversation: Equatable { case contact(String), group(String) }
    static let shared = PushNotifications()
    var onActivity: ((GroupActivity) -> Void)?
    func noteGroupRead(id: String, sequence: Int, userID: String) {}
    func presentGroupActivity(_ activity: GroupActivity, userID: String) { onActivity?(activity) }
}

@MainActor final class Network {
    static let shared = Network()
    var calls: [String: Int] = [:]
    var handler: (String, String, Data?, [URLQueryItem]) async throws -> Data = { _, _, _, _ in Data() }
    func respond(_ path: String, method: String, body: Data? = nil, query: [URLQueryItem] = []) async throws -> Data {
        calls[method + " " + path, default: 0] += 1
        if path.hasSuffix("/reactions") { return Data("{\"reactions\":[]}".utf8) }
        return try await handler(path, method, body, query)
    }
    func reset() {
        calls = [:]
        MessageSounds.shared.onSent = nil
        MessageSounds.shared.onReceived = nil
        PushNotifications.shared.onActivity = nil
    }
}
struct AuthAPI: Sendable {
    enum Failure: Error { case notFound, unauthorized, rejected(String), temporarilyUnavailable }
    func send(path: String, method: String = "GET", body: Data? = nil, token: String,
              query: [URLQueryItem] = []) async throws -> (Data, Int) {
        (try await Network.shared.respond(path, method: method, body: body, query: query), 200)
    }
    func chatTurns(contactID: String, before: Int? = nil, token: String) async throws -> ChatPage {
        let query = before.map { [URLQueryItem(name: "before", value: String($0))] } ?? []
        return try JSONDecoder().decode(ChatPage.self, from: await send(path: "contacts/\(contactID)/chat/turns", token: token, query: query).0)
    }
    func contacts(token: String, before: String? = nil) async throws -> ContactsPage {
        try JSONDecoder().decode(ContactsPage.self, from: await send(path: "contacts", token: token).0)
    }
    func contact(id: String, token: String) async throws -> Contact {
        try JSONDecoder().decode(Contact.self, from: await send(path: "contacts/\(id)", token: token).0)
    }
    func sendMessage(contactID: String, id: String, text: String, attachment: DraftAttachment?, token: String) async throws -> ChatSubmission {
        try JSONDecoder().decode(ChatSubmission.self, from: await send(path: "contacts/\(contactID)/chat/turns", method: "POST", body: try JSONEncoder().encode(["id": id]), token: token).0)
    }
    func retryReply(contactID: String, turnID: String, token: String) async throws -> ChatSubmission { throw Failure.rejected("Unused") }
    func sendGroupMessage(groupID: String, id: String, text: String, attachment: DraftAttachment?, token: String) async throws {
        _ = try await send(path: "groups/\(groupID)/messages", method: "POST", body: try JSONEncoder().encode(["id": id]), token: token)
    }
    func markChatRead(contactID: String, sequence: Int, token: String) async throws -> ChatReadState {
        try JSONDecoder().decode(ChatReadState.self, from: await send(path: "contacts/\(contactID)/chat/read", method: "PUT", body: try JSONEncoder().encode(["sequence": sequence]), token: token).0)
    }
    func saveContact(name: String, id: String?, token: String) async throws -> Contact { throw Failure.rejected("Unused") }
    func saveContactPhoto(id: String, data: Data?, token: String) async throws -> Contact { throw Failure.rejected("Unused") }
    func deleteContact(id: String, token: String) async throws { throw Failure.rejected("Unused") }
}

@MainActor final class Gate {
    private var waiter: CheckedContinuation<Void, Never>?
    private var released = false
    var waiting: Bool { waiter != nil }
    func wait() async { if !released { await withCheckedContinuation { waiter = $0 } } }
    func release() { released = true; waiter?.resume(); waiter = nil }
}

@main struct Checks {
    static var count = 0
    static func check(_ value: @autoclosure () -> Bool, _ message: String) {
        guard value() else { fatalError("FAIL: " + message) }
        count += 1
        FileHandle.standardOutput.write(Data(("PASS: " + message + "\n").utf8))
    }
    static func settle(line: UInt = #line, _ condition: () -> Bool) async {
        let clock = ContinuousClock()
        let deadline = clock.now.advanced(by: .seconds(3))
        while clock.now < deadline {
            if condition() { return }
            try? await Task.sleep(for: .milliseconds(1))
        }
        fatalError("A deterministic task did not reach checkpoint at line \(line)")
    }
    static func json(_ value: Any) -> Data { try! JSONSerialization.data(withJSONObject: value) }
    static func turn(_ sequence: Int, id: String? = nil, status: String = "queued", updated: Int? = nil,
                     read: Int? = nil, attempt: Int = 1) -> [String: Any] {
        ["sequence": sequence, "id": id ?? "turn-\(sequence)", "userText": "Message \(sequence)",
         "assistantText": status == "complete" ? "Reply \(sequence)" : NSNull(), "status": status,
         "attempt": attempt, "createdAt": sequence * 100, "updatedAt": updated ?? sequence * 100,
         "readAt": read.map { $0 as Any } ?? NSNull()]
    }
    static func page(_ turns: [[String: Any]], before: Int? = nil) -> Data {
        json(["turns": turns, "nextBefore": before.map { $0 as Any } ?? NSNull()])
    }
    static func contact(_ timestamp: Int = 100, read: Int? = nil, unread: Int = 0, outgoing: Int = 1) -> [String: Any] {
        ["id": "c", "name": "Fictional Contact", "createdAt": 1, "updatedAt": 1,
         "lastMessageAt": timestamp, "lastMessageText": outgoing == 1 ? "Message 1" : "Reply 1",
         "lastMessageFromUser": outgoing, "lastMessageReadAt": read.map { $0 as Any } ?? NSNull(),
         "unreadCount": unread, "lastReadSequence": 0]
    }
    static func group(_ messageID: String? = "m1", receipt: String = "sent", at: Int = 100) -> [String: Any] {
        ["id": "g", "name": "Fictional Group", "ownerID": "fictional-user", "createdAt": 1,
         "updatedAt": 1, "lastMessageID": messageID.map { $0 as Any } ?? NSNull(), "lastMessageAt": at,
         "lastMessageText": "Group message", "lastMessageUserID": "fictional-user",
         "lastMessageReceiptState": receipt, "lastReadSequence": 0]
    }
    static func message(_ sequence: Int, id: String? = nil, receipt: String = "sent", own: Bool = true) -> [String: Any] {
        ["sequence": sequence, "id": id ?? "m\(sequence)", "userID": own ? "fictional-user" : "fictional-other",
         "senderName": "Fictional Sender", "text": "Group message", "createdAt": sequence * 100, "receiptState": receipt]
    }
    static func snapshot(_ id: String? = "m1", receipt: String = "sent") -> Data {
        json(["group": group(id, receipt: receipt), "members": [], "replies": [], "canInvite": true, "contributorModel": false])
    }
    static func groupPage(_ messages: [[String: Any]], before: Int? = nil) -> Data {
        json(["messages": messages, "nextBefore": before.map { $0 as Any } ?? NSNull()])
    }
    static func decode<T: Decodable>(_ type: T.Type, _ value: Any) -> T { try! JSONDecoder().decode(type, from: json(value)) }

    static func main() async {
        let net = Network.shared
        let auth = AuthStore()
        let original = decode(ChatTurn.self, turn(1, status: "complete", updated: 300, read: 250))
        let stale = decode(ChatTurn.self, turn(1, status: "running", updated: 200))
        check(original.merging(stale).status == .complete && original.merging(stale).readAt == 250,
              "Delayed history cannot regress a completed turn or its read receipt")
        let readOnly = decode(ChatTurn.self, turn(1, status: "running", updated: 100, read: 400))
        check(original.merging(readOnly).status == .complete && original.merging(readOnly).readAt == 400,
              "Receipt evidence advances independently of the turn timestamp")
        let retry = decode(ChatTurn.self, turn(1, status: "queued", updated: 100, attempt: 2))
        check(original.merging(retry).attempt == 2 && original.merging(retry).status == .queued,
              "An actual retry with a higher attempt can return to queued")
        check(ReceiptProgress.merge("read", "sent") == "read" && ReceiptProgress.merge(nil, "received") == "received",
              "Group receipts preserve the strongest evidence")

        net.reset()
        let chat = ChatStore()
        let readGate = Gate()
        net.handler = { _, _, _, _ in await readGate.wait(); return page([turn(1)]) }
        let first = Task { await chat.refresh(contactID: "c", using: auth) }
        await settle { readGate.waiting }
        let second = Task { await chat.refresh(contactID: "c", using: auth) }
        await Task.yield()
        second.cancel()
        readGate.release()
        await first.value; await second.value
        check(net.calls["GET contacts/c/chat/turns"] == 1 && chat.hasLoaded,
              "Concurrent history consumers share one request; navigation cancellation preserves the result")

        net.handler = { _, _, _, _ in page([turn(1, status: "complete", updated: 200, read: 150)]) }
        var receivedAfterMerge = false
        MessageSounds.shared.onReceived = { _ in receivedAfterMerge = chat.turns.last?.status == .complete }
        await chat.refresh(contactID: "c", using: auth)
        check(receivedAfterMerge, "Private receive sounds are requested after history is committed")
        chat.reconcile(decode(Contact.self, contact(100, read: 500)))
        check(chat.turns.last?.readAt == 500, "Home receipt evidence updates the matching private turn")

        let contacts = ContactsStore()
        net.reset()
        net.handler = { path, _, _, _ in path == "contacts" ? json(["contacts": [contact()], "totalUnreadCount": 0]) : page([turn(1, read: 800)]) }
        await contacts.refresh(using: auth)
        let cached = contacts.conversations.store(for: "c")
        await cached.refresh(contactID: "c", using: auth)
        check(contacts.preview(for: contacts.contacts[0]).lastMessageReadAt == 800,
              "Home immediately projects the read state from its session chat")
        net.handler = { _, _, _, _ in json(["contacts": [contact(200, unread: 1, outgoing: 0)], "totalUnreadCount": 1]) }
        // Supply history through the same production store when Home detects a reply.
        net.handler = { path, _, _, _ in
            path == "contacts" ? json(["contacts": [contact(200, unread: 1, outgoing: 0)], "totalUnreadCount": 1]) :
                page([turn(1, status: "complete", updated: 200)])
        }
        await contacts.refresh(using: auth)
        await settle { cached.turns.last?.assistantText == "Reply 1" }
        check(cached.turns.last?.assistantText == "Reply 1", "Home warms a cached private history before reopening")

        net.reset()
        let groupChat = GroupChatStore()
        net.handler = { path, _, _, _ in path == "groups/g" ? snapshot() : groupPage([message(1, receipt: "read")]) }
        await groupChat.refresh(id: "g", auth: auth)
        net.handler = { path, _, _, _ in path == "groups/g" ? snapshot() : groupPage([message(1, receipt: "sent")]) }
        await groupChat.refresh(id: "g", auth: auth)
        check(groupChat.messages[0].receiptState == "read", "Delayed group history cannot regress a read check")
        let summary = decode(ChatGroup.self, group())
        check(groupChat.preview(for: summary).lastMessageReceiptState == "read", "Home and group bubbles share receipt evidence")
        groupChat.reconcile(decode(ChatGroup.self, group("different", receipt: "read")))
        check(groupChat.messages.count == 1, "A preview for another message never fabricates a history row")

        net.reset()
        let sending = GroupChatStore()
        let postGate = Gate()
        let historyGate = Gate()
        var postedID = ""
        var soundAfterAcceptance = false
        net.handler = { path, method, body, _ in
            if method == "POST" {
                postedID = (try! JSONSerialization.jsonObject(with: body!) as! [String: String])["id"]!
                await postGate.wait(); return json(["id": postedID])
            }
            if path == "groups/g" { return snapshot(nil) }
            await historyGate.wait()
            return groupPage([message(1, id: postedID)])
        }
        MessageSounds.shared.onSent = { _ in
            soundAfterAcceptance = sending.pendingAccepted || sending.messages.contains { $0.id == postedID }
        }
        let send = Task { await sending.send("Group message", id: "g", auth: auth) }
        await settle { postGate.waiting }
        check(sending.pendingID == postedID && !sending.pendingAccepted, "Optimistic group sends remain unconfirmed until HTTP acceptance")
        postGate.release()
        await settle { historyGate.waiting }
        check(sending.pendingAccepted && soundAfterAcceptance,
              "HTTP acceptance clears Sending before sound while history remains delayed")
        check(sending.preview(for: summary).lastMessageID == postedID,
              "Home projects the acknowledged optimistic group message while history catches up")
        historyGate.release()
        let sent = await send.value
        check(sent && sending.pendingID == nil && sending.messages.count == 1,
              "History replaces the optimistic group message without duplication")

        net.reset()
        let groups = GroupsStore()
        let retained = groups.conversations.store(for: "g")
        net.handler = { path, _, _, _ in
            if path == "groups" { return json(["groups": [group()], "contributorModel": false]) }
            if path == "groups/g" { return snapshot() }
            if path == "groups/receipts" { return Data() }
            return groupPage([message(1)])
        }
        await groups.refresh(using: auth, refreshInvitations: false)
        await settle { retained.messages.count == 1 }
        check(retained.messages.count == 1, "A Home group preview refresh warms the existing session history")
        net.handler = { path, _, _, _ in
            if path == "groups" { return json(["groups": [group("m2", at: 200)], "contributorModel": false]) }
            if path == "groups/g" { return snapshot("m2") }
            if path == "groups/receipts" { return Data() }
            return groupPage([message(1), message(2, own: false)])
        }
        await groups.refresh(using: auth, refreshInvitations: false)
        await settle { retained.messages.last?.id == "m2" }
        check(retained.messages.last?.id == "m2", "Returning from Home needs no extra poll for the already observed group reply")
        net.handler = { path, _, _, _ in
            if path == "groups" { return json(["groups": [group("m2", receipt: "read", at: 200)], "contributorModel": false]) }
            return Data()
        }
        await groups.refresh(using: auth, refreshInvitations: false)
        check(retained.messages.last?.receiptState == "read", "Home receipt updates reconcile into the group history without a body reload")

        net.reset()
        let gap = ChatStore()
        net.handler = { _, _, _, _ in page([turn(1)]) }
        await gap.refresh(contactID: "c", using: auth)
        net.handler = { _, _, _, query in
            query.isEmpty ? page([turn(4), turn(5)], before: 4) : page([turn(2), turn(3)], before: 2)
        }
        // The last catch-up page overlaps the retained boundary.
        net.handler = { _, _, _, query in
            switch query.first?.value {
            case nil: return page([turn(4), turn(5)], before: 4)
            case "4": return page([turn(2), turn(3)], before: 2)
            default: return page([turn(1)])
            }
        }
        await gap.refresh(contactID: "c", using: auth)
        check(gap.turns.map(\.sequence) == [1, 2, 3, 4, 5], "Private catch-up bridges every missed history page")

        net.reset()
        let invalidated = GroupChatStore()
        let staleGate = Gate()
        net.handler = { path, _, _, _ in
            if path == "groups/g" { return snapshot() }
            await staleGate.wait(); return groupPage([message(1)])
        }
        let staleFetch = Task { await invalidated.refresh(id: "g", auth: auth) }
        await settle { staleGate.waiting }
        invalidated.invalidate(); staleGate.release(); await staleFetch.value
        check(invalidated.messages.isEmpty && invalidated.snapshot == nil, "Revocation rejects late group responses")

        let cache = ConversationCache()
        let pinned = cache.store(for: "visible"); pinned.isRetained = true
        for index in 0..<12 { _ = cache.store(for: "contact-\(index)") }
        check(cache.cachedStore(for: "visible") === pinned && !pinned.isUnavailable, "A visible private chat is protected from cache eviction")

        var privateHitInvalidated = false
        let renderCache = ConversationCache()
        let renderedChat = renderCache.store(for: "rendered")
        withObservationTracking {
            _ = renderCache.store(for: "rendered")
        } onChange: {
            privateHitInvalidated = true
        }
        for _ in 0..<100 { _ = renderCache.store(for: "rendered") }
        check(!privateHitInvalidated && renderCache.cachedStore(for: "rendered") === renderedChat,
              "Rendering an existing private chat does not invalidate its own observation")

        var groupHitInvalidated = false
        let groupRenderCache = GroupConversationCache()
        let renderedGroup = groupRenderCache.store(for: "rendered")
        withObservationTracking {
            _ = groupRenderCache.store(for: "rendered")
        } onChange: {
            groupHitInvalidated = true
        }
        for _ in 0..<100 { _ = groupRenderCache.store(for: "rendered") }
        check(!groupHitInvalidated && groupRenderCache.cachedStore(for: "rendered") === renderedGroup,
              "Rendering an existing group does not create an observation feedback loop")

        var cacheInsertionObserved = false
        let observableCache = ConversationCache()
        withObservationTracking {
            _ = observableCache.cachedStore(for: "new")
        } onChange: {
            Task { @MainActor in cacheInsertionObserved = true }
        }
        _ = observableCache.store(for: "new")
        await settle { cacheInsertionObserved }
        check(cacheInsertionObserved, "Home observes a cache entry created after its first render")

        net.reset()
        let readContacts = ContactsStore()
        net.handler = { _, _, _, _ in json(["contacts": [contact(100, unread: 1, outgoing: 0)], "totalUnreadCount": 1]) }
        await readContacts.refresh(using: auth)
        let cancelledReadGate = Gate()
        net.handler = { _, _, _, _ in
            await cancelledReadGate.wait()
            try Task.checkCancellation()
            return json(["lastReadSequence": 1, "unreadCount": 0, "totalUnreadCount": 0])
        }
        let leavingChat = Task { await readContacts.markRead(id: "c", sequence: 1, using: auth) }
        await settle { cancelledReadGate.waiting }
        leavingChat.cancel()
        cancelledReadGate.release()
        await leavingChat.value
        check(readContacts.contact(id: "c")?.unreadCount == 0 && readContacts.totalUnreadCount == 0,
              "Leaving a private chat cannot cancel its read acknowledgement or leave Home unread")

        net.reset()
        let coalescedReads = ContactsStore()
        net.handler = { _, _, _, _ in json(["contacts": [contact(200, unread: 2, outgoing: 0)], "totalUnreadCount": 2]) }
        await coalescedReads.refresh(using: auth)
        let firstReadGate = Gate()
        var readSequences: [Int] = []
        net.handler = { _, _, body, _ in
            let sequence = (try! JSONSerialization.jsonObject(with: body!) as! [String: Int])["sequence"]!
            readSequences.append(sequence)
            if sequence == 1 { await firstReadGate.wait() }
            return json(["lastReadSequence": sequence, "unreadCount": 2 - sequence, "totalUnreadCount": 2 - sequence])
        }
        let firstRead = coalescedReads.noteRead(id: "c", sequence: 1, using: auth)!
        await settle { firstReadGate.waiting }
        let latestRead = coalescedReads.noteRead(id: "c", sequence: 2, using: auth)!
        firstReadGate.release()
        await firstRead.value; await latestRead.value
        check(readSequences == [1, 2] && coalescedReads.totalUnreadCount == 0,
              "A newer read observed during an acknowledgement is sent next instead of dropped")

        net.reset()
        let failedReadContacts = ContactsStore()
        net.handler = { _, _, _, _ in json(["contacts": [contact(100, unread: 1, outgoing: 0)], "totalUnreadCount": 1]) }
        await failedReadContacts.refresh(using: auth)
        var attempts = 0
        net.handler = { _, _, _, _ in
            attempts += 1
            if attempts == 1 { throw URLError(.networkConnectionLost) }
            return json(["lastReadSequence": 1, "unreadCount": 0, "totalUnreadCount": 0])
        }
        await failedReadContacts.markRead(id: "c", sequence: 1, using: auth)
        check(failedReadContacts.totalUnreadCount == 1, "Failed reads retain the server count until acknowledgement")
        failedReadContacts.retryPendingReads()
        await settle { failedReadContacts.totalUnreadCount == 0 }
        check(attempts == 2, "A failed private read retries from Home without reopening the chat")

        net.reset()
        let staleReadContacts = ContactsStore()
        let unreadSnapshot = json(["contacts": [contact(100, unread: 1, outgoing: 0)], "totalUnreadCount": 1])
        net.handler = { _, _, _, _ in unreadSnapshot }
        await staleReadContacts.refresh(using: auth)
        let staleListGate = Gate()
        net.handler = { path, _, _, _ in
            if path == "contacts" { await staleListGate.wait(); return unreadSnapshot }
            return json(["lastReadSequence": 1, "unreadCount": 0, "totalUnreadCount": 0])
        }
        let staleList = Task { await staleReadContacts.refresh(using: auth) }
        await settle { staleListGate.waiting }
        await staleReadContacts.markRead(id: "c", sequence: 1, using: auth)
        staleListGate.release(); await staleList.value
        check(staleReadContacts.totalUnreadCount == 0 && staleReadContacts.contacts[0].unreadCount == 0,
              "A pre-read Home response cannot resurrect the cleared badge")

        net.reset()
        let readGroups = GroupsStore()
        var unreadGroup = group()
        unreadGroup["unreadCount"] = 1
        net.handler = { path, _, _, _ in
            path == "groups" ? json(["groups": [unreadGroup], "contributorModel": false]) : Data()
        }
        await readGroups.refresh(using: auth, refreshInvitations: false)
        let groupReadGate = Gate()
        net.handler = { _, _, _, _ in
            await groupReadGate.wait(); try Task.checkCancellation()
            return json(["lastReadSequence": 1, "unreadCount": 0])
        }
        let leavingGroup = Task { await readGroups.markRead(id: "g", sequence: 1, using: auth) }
        await settle { groupReadGate.waiting }
        leavingGroup.cancel(); groupReadGate.release(); await leavingGroup.value
        check(readGroups.totalUnreadCount == 0, "Leaving a group cannot cancel the unread acknowledgement")

        net.reset()
        let receiptChat = GroupChatStore()
        net.handler = { path, _, _, _ in path == "groups/g" ? snapshot() : groupPage([message(1, own: false)]) }
        await receiptChat.refresh(id: "g", auth: auth)
        let visibleReadGate = Gate()
        var receiptAttempts = 0
        net.handler = { path, method, _, _ in
            if method == "PUT" {
                receiptAttempts += 1
                if receiptAttempts == 1 { await visibleReadGate.wait(); try Task.checkCancellation() }
                return Data()
            }
            return path == "groups/g" ? snapshot() : groupPage([message(1, own: false)])
        }
        let rowRead = Task { await receiptChat.acknowledge(["m1"], state: "read", id: "g", auth: auth) }
        await settle { visibleReadGate.waiting }
        rowRead.cancel(); visibleReadGate.release(); await rowRead.value
        check(receiptChat.needsRefresh(for: summary), "An observed but unacknowledged group row keeps a retry intent")
        await receiptChat.refresh(id: "g", auth: auth)
        check(receiptAttempts == 2 && !receiptChat.needsRefresh(for: summary),
              "Cached group refresh retries an observed row receipt after navigation")

        let lru = ConversationCache()
        let groupLRU = GroupConversationCache()
        for index in 0..<8 { _ = lru.store(for: "\(index)"); _ = groupLRU.store(for: "\(index)") }
        _ = lru.store(for: "0"); _ = groupLRU.store(for: "0")
        _ = lru.store(for: "8"); _ = groupLRU.store(for: "8")
        check(lru.cachedStore(for: "0") != nil && lru.cachedStore(for: "1") == nil &&
              groupLRU.cachedStore(for: "0") != nil && groupLRU.cachedStore(for: "1") == nil,
              "Non-observable recency bookkeeping preserves LRU eviction in both caches")

        net.reset()
        let stalledListContacts = ContactsStore()
        let stalledListGroups = GroupsStore()
        let stalledListSync = ConversationSync()
        net.handler = { _, _, _, _ in json(["contacts": [contact(100, unread: 1, outgoing: 0)], "totalUnreadCount": 1]) }
        await stalledListContacts.refresh(using: auth)
        let pendingListGate = Gate()
        var readWhileListStalled = 0
        net.handler = { path, method, _, _ in
            if method == "PUT" {
                readWhileListStalled += 1
                if readWhileListStalled == 1 { throw URLError(.networkConnectionLost) }
                return json(["lastReadSequence": 1, "unreadCount": 0, "totalUnreadCount": 0])
            }
            if path == "groups" { return json(["groups": [], "contributorModel": false]) }
            await pendingListGate.wait()
            return json(["contacts": [contact(100, unread: 1, outgoing: 0)], "totalUnreadCount": 1])
        }
        let stalledListRun = Task { await stalledListSync.run(contacts: stalledListContacts, groups: stalledListGroups, auth: auth) }
        await settle { pendingListGate.waiting }
        await stalledListContacts.markRead(id: "c", sequence: 1, using: auth)
        await settle { stalledListContacts.totalUnreadCount == 0 }
        check(readWhileListStalled == 2 && pendingListGate.waiting,
              "The foreground timer retries a read even while Home's list request is stalled")
        stalledListRun.cancel(); pendingListGate.release(); await stalledListRun.value

        net.reset()
        let uncertain = GroupChatStore()
        var submittedIDs: [String] = []
        net.handler = { path, method, body, _ in
            if method == "POST" {
                submittedIDs.append((try! JSONSerialization.jsonObject(with: body!) as! [String: String])["id"]!)
                throw AuthAPI.Failure.temporarilyUnavailable
            }
            return path == "groups/g" ? snapshot(nil) : groupPage([])
        }
        _ = await uncertain.send("Uncertain message", id: "g", auth: auth)
        _ = await uncertain.send("Uncertain message", id: "g", auth: auth)
        check(submittedIDs.count == 2 && submittedIDs[0] == submittedIDs[1] && uncertain.pendingID != nil,
              "A transient server failure preserves the group idempotency key across retry")

        net.reset()
        let eventsContacts = ContactsStore(); let eventsGroups = GroupsStore(); let eventsSync = ConversationSync()
        let eventGate = Gate()
        var contactReadCount = 0
        net.handler = { path, _, _, _ in
            if path == "groups" { return json(["groups": [], "contributorModel": false]) }
            contactReadCount += 1
            if contactReadCount == 1 { await eventGate.wait() }
            return json(["contacts": [], "totalUnreadCount": 0])
        }
        let eventsRun = Task { await eventsSync.run(contacts: eventsContacts, groups: eventsGroups, auth: auth) }
        await settle { eventGate.waiting }
        eventsSync.request()
        eventGate.release()
        await settle { contactReadCount >= 2 }
        check(contactReadCount >= 2, "A wake during a suspended request produces a subsequent synchronization pass")
        eventsRun.cancel(); await eventsRun.value

        net.reset()
        let slowHistory = Gate()
        let freeContacts = ContactsStore(); let freeGroups = GroupsStore(); let freeSync = ConversationSync()
        freeSync.visible = .contact("slow")
        net.handler = { path, _, _, _ in
            if path == "groups" { return json(["groups": [], "contributorModel": false]) }
            if path == "contacts" { return json(["contacts": [], "totalUnreadCount": 0]) }
            if path == "contacts/slow/chat/turns" { await slowHistory.wait() }
            return page([turn(1)])
        }
        let freeRun = Task { await freeSync.run(contacts: freeContacts, groups: freeGroups, auth: auth) }
        await settle { slowHistory.waiting && freeContacts.hasLoaded }
        freeSync.visible = .contact("fast")
        freeSync.request(.contact("fast"))
        await settle { freeContacts.conversations.cachedStore(for: "fast")?.hasLoaded == true }
        check((net.calls["GET contacts"] ?? 0) >= 2 && slowHistory.waiting,
              "A slow conversation cannot block Home refreshes or opening another private chat")
        freeRun.cancel(); slowHistory.release(); await freeRun.value

        net.reset()
        let laneGate = Gate()
        let laneContacts = ContactsStore(); let laneGroups = GroupsStore(); let sync = ConversationSync()
        net.handler = { path, _, _, _ in
            if path == "groups" { await laneGate.wait(); return json(["groups": [], "contributorModel": false]) }
            return json(["contacts": [], "totalUnreadCount": 0])
        }
        let run = Task { await sync.run(contacts: laneContacts, groups: laneGroups, auth: auth) }
        await settle { laneGate.waiting && laneContacts.hasLoaded }
        sync.request(.contact("c"))
        // A targeted wake while the other lane is blocked must not wait for groups.
        await settle { (net.calls["GET contacts"] ?? 0) >= 2 }
        check(laneContacts.hasLoaded && !laneGroups.hasLoaded, "A blocked group request does not stall private synchronization")
        run.cancel(); laneGate.release(); await run.value
        print("\(count) synchronization checks passed")
    }
}
