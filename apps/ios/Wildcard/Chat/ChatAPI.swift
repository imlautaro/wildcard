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
    /// Group quotes of a message from before the viewer joined: shown, but not tappable and without a file.
    var beforeJoin: Bool? = nil
}

/// The For you post a private message answers (docs/updates.md#continue-in-chat): the live post
/// while it exists (`available`), the snapshot saved with the message once it is gone.
struct HomePostReference: Codable, Equatable, Sendable {
    let id: String
    let available: Bool
    let title: String
    let text: String?
    let icon: String?
    let accent: String?
    let createdAt: Double

    init(id: String, available: Bool, title: String, text: String?, icon: String?, accent: String?, createdAt: Double) {
        self.id = id; self.available = available; self.title = title; self.text = text; self.icon = icon; self.accent = accent; self.createdAt = createdAt
    }

    init(post: HomePost) {
        self.init(id: post.id, available: true, title: post.content.title, text: post.text, icon: post.content.icon,
                  accent: post.content.accent, createdAt: post.createdAt)
    }
}

/// A recorded or synthesized voice message. `transcript` is `nil` until transcription
/// finishes and empty when no speech was found. `listenedAt` tracks contact listening;
/// `ownListenedAt` tracks the signed-in person playing an incoming message.
struct MessageVoice: Codable, Hashable, Sendable {
    let durationMs: Int
    var ownListenedAt: Double? = nil
    var listenedAt: Double?
    var transcript: String?

    /// History and acknowledgements may arrive out of order; listening and transcription only move forward.
    func merging(_ other: MessageVoice?) -> MessageVoice {
        guard let other else { return self }
        return MessageVoice(durationMs: durationMs, ownListenedAt: [ownListenedAt, other.ownListenedAt].compactMap { $0 }.max(), listenedAt: [listenedAt, other.listenedAt].compactMap { $0 }.max(),
                            transcript: transcript ?? other.transcript)
    }
}

struct AssistantMessage: Decodable, Equatable, Sendable, Identifiable {
    let id: String
    let text: String
    let createdAt: Double
    var replyTo: MessageReplyQuote? = nil
    var attachment: ChatAttachment? = nil
    /// A contact-generated album: every image in order, including `attachment`; nil otherwise.
    var attachments: [ChatAttachment]? = nil
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
    /// The For you post this message answers.
    var homePost: HomePostReference? = nil
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
        let previous = newer ? assistantMessages : incoming.assistantMessages
        result.assistantMessages = result.assistantMessages?.map { message in
            var merged = message
            merged.voice = message.voice?.merging(previous?.first(where: { $0.id == message.id })?.voice)
            return merged
        }
        return result
    }
}

struct ContactPresence: Decodable, Sendable {
    enum Status: String, Decodable, Sendable { case offline, online, typing }
    let status: Status
    var isRecording: Bool? = nil
    /// Researching keeps status typing, so older builds show Typing.
    var isResearching: Bool? = nil
    let lastSeenAt: Double?
    let expiresAt: Double?

    var label: String {
        switch status {
        case .online: return String(localized: "Online")
        case .typing:
            return isResearching == true ? String(localized: "Researching...")
                : isRecording == true ? String(localized: "Recording...") : String(localized: "Typing...")
        case .offline:
            guard let lastSeenAt else { return String(localized: "Offline") }
            let date = Date(timeIntervalSince1970: lastSeenAt / 1000)
            let time = date.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits))
            if Calendar.current.isDateInToday(date) { return String(localized: "Last seen today at \(time)") }
            if Calendar.current.isDateInYesterday(date) { return String(localized: "Last seen yesterday at \(time)") }
            let day = date.formatted(date: .abbreviated, time: .omitted)
            return String(localized: "Last seen \(day) at \(time)")
        }
    }
}

struct ChatSubmission: Decodable, Sendable {
    let turn: ChatTurn
    let presence: ContactPresence?
}

struct ChatPage: Decodable, Sendable {
    var historyRevision: Int? = nil
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
    private struct MessageInput: Encodable { let historyRevision: Int; let id: String; let text: String; let timeZone: String; let attachment: DraftAttachment?; var voice: VoiceInput? = nil; var sticker: StickerSend? = nil; let replyTo: ReplyInput?; var homePost: String? = nil; let nativeContext: NativeContext? }

    func chatTurns(contactID: String, before: Int? = nil, token: String) async throws -> ChatPage {
        let query = before.map { [URLQueryItem(name: "before", value: String($0))] } ?? []
        let (data, _) = try await send(path: "contacts/\(contactID)/chat/turns", token: token, query: query)
        return try JSONDecoder().decode(ChatPage.self, from: data)
    }

    func sendMessage(contactID: String, historyRevision: Int = 0, id: String, text: String, attachment: DraftAttachment? = nil, voice: VoiceClip? = nil, sticker: Sticker? = nil, replyTo: MessageReplyQuote? = nil, homePost: String? = nil, nativeContext: NativeContext? = nil, token: String) async throws -> ChatSubmission {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .withoutEscapingSlashes
        let timeZone = TimeZone.current.identifier
        let reply = replyTo.map { ReplyInput(messageID: $0.messageID, side: $0.side) }
        let body = try encoder.encode(MessageInput(historyRevision: historyRevision, id: id, text: text, timeZone: timeZone, attachment: attachment,
                                                   voice: voice.map { VoiceInput(data: $0.data) }, sticker: sticker.map { StickerSend(id: $0.id) },
                                                   replyTo: reply, homePost: homePost, nativeContext: nativeContext))
        let data: Data
        do {
            data = try await send(path: "contacts/\(contactID)/chat/turns", method: "POST", body: body, token: token, timeout: 90).0
        } catch Failure.rejected(let message) where message == "Invalid native device capabilities" && nativeContext?.automaticKinds != nil {
            // Older APIs reject the optional field before accepting a turn. Preserve the submission ID and all other fields.
            var legacyContext = nativeContext
            legacyContext?.automaticKinds = nil
            let legacyBody = try encoder.encode(MessageInput(historyRevision: historyRevision, id: id, text: text, timeZone: timeZone, attachment: attachment,
                                                             voice: voice.map { VoiceInput(data: $0.data) }, sticker: sticker.map { StickerSend(id: $0.id) },
                                                             replyTo: reply, homePost: homePost, nativeContext: legacyContext))
            data = try await send(path: "contacts/\(contactID)/chat/turns", method: "POST", body: legacyBody, token: token, timeout: 90).0
        } catch Failure.notFound where sticker != nil {
            // The route answers 404 "Choose a sticker from your library" (deleted on another device); a missing contact is
            // reported by the next history refresh.
            throw Failure.rejected(String(localized: "This sticker is no longer in your library."))
        }
        return try JSONDecoder().decode(ChatSubmission.self, from: data)
    }

    /// `part` selects one message of a multi-message reply (contact voice messages);
    /// `image` selects one image of a contact-generated album (0 is the first or only one).
    func chatAttachment(contactID: String, turnID: String, assistant: Bool = false, part: Int? = nil, image: Int = 0, token: String) async throws -> Data {
        var query = assistant ? [URLQueryItem(name: "side", value: "assistant")] : []
        if let part { query.append(URLQueryItem(name: "part", value: String(part))) }
        if image > 0 { query.append(URLQueryItem(name: "image", value: String(image))) }
        let (data, _) = try await send(path: "contacts/\(contactID)/chat/turns/\(turnID)/attachment", token: token, query: query, timeout: 60)
        return data
    }

    func retryReply(contactID: String, turnID: String, token: String) async throws -> ChatSubmission {
        let (data, _) = try await send(path: "contacts/\(contactID)/chat/turns/\(turnID)/retry", method: "POST", token: token)
        return try JSONDecoder().decode(ChatSubmission.self, from: data)
    }
}
