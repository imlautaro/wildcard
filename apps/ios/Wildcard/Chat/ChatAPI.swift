import Foundation

struct ChatTurn: Decodable, Identifiable, Equatable, Sendable {
    enum Status: String, Decodable, Sendable { case queued, running, complete, failed }
    let attachment: ChatAttachment?
    let scheduleID: String?
    let errorCode: String?
    let sequence: Int
    let id: String
    let userText: String
    let assistantText: String?
    let status: Status
    let attempt: Int
    let createdAt: Double
    let updatedAt: Double
    var isPending: Bool { status == .queued || status == .running }
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

    private struct TranscriptionEnvelope: Decodable { let text: String }
    private struct MessageInput: Encodable { let id: String; let text: String; let timeZone: String; let attachment: DraftAttachment? }

    func transcribeAudio(contactID: String, audio: Data, token: String) async throws -> String {
        let (data, _) = try await send(path: "contacts/\(contactID)/chat/transcriptions", method: "POST",
            body: audio, token: token, contentType: "audio/wav", timeout: 120)
        return try JSONDecoder().decode(TranscriptionEnvelope.self, from: data).text
    }

    func chatTurns(contactID: String, before: Int? = nil, token: String) async throws -> ChatPage {
        let query = before.map { [URLQueryItem(name: "before", value: String($0))] } ?? []
        let (data, _) = try await send(path: "contacts/\(contactID)/chat/turns", token: token, query: query)
        return try JSONDecoder().decode(ChatPage.self, from: data)
    }

    func sendMessage(contactID: String, id: String, text: String, attachment: DraftAttachment? = nil, token: String) async throws -> ChatSubmission {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .withoutEscapingSlashes
        let body = try encoder.encode(MessageInput(id: id, text: text, timeZone: TimeZone.current.identifier, attachment: attachment))
        let (data, _) = try await send(path: "contacts/\(contactID)/chat/turns", method: "POST", body: body, token: token, timeout: 90)
        return try JSONDecoder().decode(ChatSubmission.self, from: data)
    }

    func chatAttachment(contactID: String, turnID: String, token: String) async throws -> Data {
        let (data, _) = try await send(path: "contacts/\(contactID)/chat/turns/\(turnID)/attachment", token: token, timeout: 60)
        return data
    }

    func retryReply(contactID: String, turnID: String, token: String) async throws -> ChatSubmission {
        let (data, _) = try await send(path: "contacts/\(contactID)/chat/turns/\(turnID)/retry", method: "POST", token: token)
        return try JSONDecoder().decode(ChatSubmission.self, from: data)
    }
}
