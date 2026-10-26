import Foundation

struct ChatTurn: Decodable, Identifiable, Equatable, Sendable {
    enum Status: String, Decodable, Sendable { case queued, running, complete, failed }
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

struct ChatPage: Decodable, Sendable {
    let turns: [ChatTurn]
    let nextBefore: Int?
}

extension AuthAPI {
    private struct TurnEnvelope: Decodable { let turn: ChatTurn }
    private struct MessageInput: Encodable { let id: String; let text: String }

    func chatTurns(contactID: String, before: Int? = nil, token: String) async throws -> ChatPage {
        let query = before.map { [URLQueryItem(name: "before", value: String($0))] } ?? []
        let (data, _) = try await send(path: "contacts/\(contactID)/chat/turns", token: token, query: query)
        return try JSONDecoder().decode(ChatPage.self, from: data)
    }

    func sendMessage(contactID: String, id: String, text: String, token: String) async throws -> ChatTurn {
        let body = try JSONEncoder().encode(MessageInput(id: id, text: text))
        let (data, _) = try await send(path: "contacts/\(contactID)/chat/turns", method: "POST", body: body, token: token)
        return try JSONDecoder().decode(TurnEnvelope.self, from: data).turn
    }

    func retryReply(contactID: String, turnID: String, token: String) async throws -> ChatTurn {
        let (data, _) = try await send(path: "contacts/\(contactID)/chat/turns/\(turnID)/retry", method: "POST", token: token)
        return try JSONDecoder().decode(TurnEnvelope.self, from: data).turn
    }
}
