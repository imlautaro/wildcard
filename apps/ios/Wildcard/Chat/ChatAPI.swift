import Foundation

/// An earlier message quoted by a reply. The server resolves it from current history.
struct MessageReplyQuote: Codable, Equatable, Sendable {
    let messageID: String
    let side: String
    let available: Bool
    let userID: String?
    let agentID: String?
    let senderName: String?
    let text: String
    var previewText: String? = nil
    let attachment: ChatAttachment?
}

/// A recorded or synthesized voice message. `transcript` is `nil` until transcription
/// finishes and empty when no speech was found; `listenedAt` is set when a contact listens.
struct MessageVoice: Decodable, Equatable, Sendable {
    let durationMs: Int
    var listenedAt: Double?
    var transcript: String?

    /// History and acknowledgements may arrive out of order; listening and transcription only move forward.
    func merging(_ other: MessageVoice?) -> MessageVoice {
        guard let other else { return self }
        return MessageVoice(durationMs: durationMs, listenedAt: [listenedAt, other.listenedAt].compactMap { $0 }.max(),
                            transcript: transcript ?? other.transcript)
    }
}

struct AssistantMessage: Decodable, Equatable, Sendable, Identifiable {
    let id: String
    let text: String
    let createdAt: Double
    var replyTo: MessageReplyQuote? = nil
    var attachment: ChatAttachment? = nil
    var voice: MessageVoice? = nil
}

struct ChatTurn: Decodable, Identifiable, Equatable, Sendable {
    enum Status: String, Decodable, Sendable { case queued, running, complete, failed }
    let attachment: ChatAttachment?
    let scheduleID: String?
    /// Set on contact work turns for a task; they cannot be retried manually.
    var taskID: String? = nil
    /// Title of the task a work turn is for, so the chat can say what the contact is working on.
    var taskTitle: String? = nil
    let groupRequestID: String?
    let errorCode: String?
    let sequence: Int
    let id: String
    let userText: String
    let assistantText: String?
    var assistantMessages: [AssistantMessage]? = nil
    let status: Status
    let attempt: Int
    let createdAt: Double
    var readAt: Double?
    let updatedAt: Double
    var replyTo: MessageReplyQuote? = nil
    /// Set for a voice message; `userText` is empty and `attachment` is `nil`.
    var voice: MessageVoice? = nil
    var isPending: Bool { status == .queued || status == .running }

    /// History, send acknowledgements, and pagination may arrive out of order.
    func merging(_ incoming: ChatTurn) -> ChatTurn {
        guard id == incoming.id else { return incoming }
        let rank: [Status: Int] = [.queued: 0, .running: 1, .failed: 2, .complete: 3]
        let newer = incoming.attempt > attempt || (incoming.attempt == attempt &&
            (incoming.updatedAt > updatedAt || (incoming.updatedAt == updatedAt && rank[incoming.status]! >= rank[status]!)))
        var result = newer ? incoming : self
        result.readAt = [readAt, incoming.readAt].compactMap { $0 }.max()
        result.voice = result.voice?.merging(newer ? voice : incoming.voice)
        return result
    }
}

struct ContactPresence: Decodable, Sendable {
    enum Status: String, Decodable, Sendable { case offline, online, typing }
    let status: Status
    let lastSeenAt: Double?
    let expiresAt: Double?

    var label: String {
        switch status {
        case .online: return "Online"
        case .typing: return "Typing..."
        case .offline:
            guard let lastSeenAt else { return "Offline" }
            let date = Date(timeIntervalSince1970: lastSeenAt / 1000)
            let time = date.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits))
            if Calendar.current.isDateInToday(date) { return "Last seen today at \(time)" }
            if Calendar.current.isDateInYesterday(date) { return "Last seen yesterday at \(time)" }
            return "Last seen \(date.formatted(date: .abbreviated, time: .omitted)) at \(time)"
        }
    }
}

struct ChatSubmission: Decodable, Sendable {
    let turn: ChatTurn
    let presence: ContactPresence?
}

struct ChatPage: Decodable, Sendable {
    let presence: ContactPresence?
    let turns: [ChatTurn]
    let nextBefore: Int?
}

struct ChatReadState: Decodable, Sendable {
    let lastReadSequence: Int
    let totalUnreadCount: Int?
    let unreadCount: Int
}

extension AuthAPI {
    private struct ActivityInput: Encodable { let visitID: String; let kind: String }
    private struct ActivityResponse: Decodable { let active: Bool }

    func chatActivity(contactID: String, visitID: String, kind: String, token: String) async throws -> Bool {
        let body = try JSONEncoder().encode(ActivityInput(visitID: visitID, kind: kind))
        let (data, _) = try await send(path: "contacts/\(contactID)/chat/activity", method: "POST", body: body, token: token, timeout: 5)
        return try JSONDecoder().decode(ActivityResponse.self, from: data).active
    }

    func markChatRead(contactID: String, sequence: Int, token: String) async throws -> ChatReadState {
        let body = try JSONEncoder().encode(["sequence": sequence])
        let (data, _) = try await send(path: "contacts/\(contactID)/chat/read", method: "PUT", body: body, token: token)
        return try JSONDecoder().decode(ChatReadState.self, from: data)
    }

    private struct ReplyInput: Encodable { let messageID: String; let side: String }
    private struct MessageInput: Encodable { let id: String; let text: String; let timeZone: String; let attachment: DraftAttachment?; var voice: VoiceInput? = nil; let replyTo: ReplyInput?; let nativeContext: NativeContext? }

    func chatTurns(contactID: String, before: Int? = nil, token: String) async throws -> ChatPage {
        let query = before.map { [URLQueryItem(name: "before", value: String($0))] } ?? []
        let (data, _) = try await send(path: "contacts/\(contactID)/chat/turns", token: token, query: query)
        return try JSONDecoder().decode(ChatPage.self, from: data)
    }

    func sendMessage(contactID: String, id: String, text: String, attachment: DraftAttachment? = nil, voice: VoiceClip? = nil, replyTo: MessageReplyQuote? = nil, nativeContext: NativeContext? = nil, token: String) async throws -> ChatSubmission {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .withoutEscapingSlashes
        let timeZone = TimeZone.current.identifier
        let reply = replyTo.map { ReplyInput(messageID: $0.messageID, side: $0.side) }
        let body = try encoder.encode(MessageInput(id: id, text: text, timeZone: timeZone, attachment: attachment,
                                                   voice: voice.map { VoiceInput(data: $0.data) }, replyTo: reply, nativeContext: nativeContext))
        let data: Data
        do {
            data = try await send(path: "contacts/\(contactID)/chat/turns", method: "POST", body: body, token: token, timeout: 90).0
        } catch Failure.rejected(let message) where message == "Invalid native device capabilities" && nativeContext?.automaticKinds != nil {
            // Older APIs reject the optional field before accepting a turn. Preserve the submission ID and all other fields.
            var legacyContext = nativeContext
            legacyContext?.automaticKinds = nil
            let legacyBody = try encoder.encode(MessageInput(id: id, text: text, timeZone: timeZone, attachment: attachment,
                                                             voice: voice.map { VoiceInput(data: $0.data) }, replyTo: reply, nativeContext: legacyContext))
            data = try await send(path: "contacts/\(contactID)/chat/turns", method: "POST", body: legacyBody, token: token, timeout: 90).0
        }
        return try JSONDecoder().decode(ChatSubmission.self, from: data)
    }

    /// `part` selects one message of a multi-message reply (contact voice messages).
    func chatAttachment(contactID: String, turnID: String, assistant: Bool = false, part: Int? = nil, token: String) async throws -> Data {
        var query = assistant ? [URLQueryItem(name: "side", value: "assistant")] : []
        if let part { query.append(URLQueryItem(name: "part", value: String(part))) }
        let (data, _) = try await send(path: "contacts/\(contactID)/chat/turns/\(turnID)/attachment", token: token, query: query, timeout: 60)
        return data
    }

    func retryReply(contactID: String, turnID: String, token: String) async throws -> ChatSubmission {
        let (data, _) = try await send(path: "contacts/\(contactID)/chat/turns/\(turnID)/retry", method: "POST", token: token)
        return try JSONDecoder().decode(ChatSubmission.self, from: data)
    }
}
