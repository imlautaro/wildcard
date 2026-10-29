import Foundation

extension AuthAPI {
    func groupPhoto(id: String, version: String, token: String) async throws -> Data {
        try await send(path: "groups/\(id)/photo", token: token,
                       query: [URLQueryItem(name: "version", value: version)]).0
    }
    func groupAttachment(groupID: String, messageID: String, token: String) async throws -> Data {
        try await send(path: "groups/\(groupID)/messages/\(messageID)/attachment", token: token, timeout: 60).0
    }
    func sendGroupMessage(groupID: String, historyRevision: Int = 0, id: String, text: String, attachment: DraftAttachment?, voice: VoiceClip? = nil, replyToID: String? = nil, token: String) async throws {
        struct Input: Encodable { let historyRevision: Int; let id: String; let text: String; let attachment: DraftAttachment?; let voice: VoiceInput?; let replyToID: String? }
        let body = try JSONEncoder().encode(Input(historyRevision: historyRevision, id: id, text: text, attachment: attachment, voice: voice.map { VoiceInput(data: $0.data) }, replyToID: replyToID))
        _ = try await send(path: "groups/\(groupID)/messages", method: "POST", body: body, token: token, timeout: 90)
    }
    func saveGroupPhoto(id: String, data: Data?, token: String) async throws -> String? {
        struct Response: Decodable { let photoVersion: String? }
        let (response, _) = try await send(path: "groups/\(id)/photo", method: data == nil ? "DELETE" : "PUT",
                                         body: data, token: token, contentType: "image/jpeg")
        return try JSONDecoder().decode(Response.self, from: response).photoVersion
    }
}
