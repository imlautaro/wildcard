import Foundation

extension AuthAPI {
    func groupPhoto(id: String, version: String, token: String) async throws -> Data {
        try await send(path: "groups/\(id)/photo", token: token,
                       query: [URLQueryItem(name: "version", value: version)]).0
    }
    func groupAttachment(groupID: String, messageID: String, token: String) async throws -> Data {
        try await send(path: "groups/\(groupID)/messages/\(messageID)/attachment", token: token, timeout: 60).0
    }
    func transcribeGroupAudio(groupID: String, audio: Data, token: String) async throws -> String {
        struct Response: Decodable { let text: String }
        let (data, _) = try await send(path: "groups/\(groupID)/transcriptions", method: "POST", body: audio,
                                       token: token, contentType: "audio/wav", timeout: 120)
        return try JSONDecoder().decode(Response.self, from: data).text
    }
    func sendGroupMessage(groupID: String, id: String, text: String, attachment: DraftAttachment?, token: String) async throws {
        struct Input: Encodable { let id: String; let text: String; let attachment: DraftAttachment? }
        let body = try JSONEncoder().encode(Input(id: id, text: text, attachment: attachment))
        _ = try await send(path: "groups/\(groupID)/messages", method: "POST", body: body, token: token, timeout: 90)
    }
    func saveGroupPhoto(id: String, data: Data?, token: String) async throws -> String? {
        struct Response: Decodable { let photoVersion: String? }
        let (response, _) = try await send(path: "groups/\(id)/photo", method: data == nil ? "DELETE" : "PUT",
                                         body: data, token: token, contentType: "image/jpeg")
        return try JSONDecoder().decode(Response.self, from: response).photoVersion
    }
}
