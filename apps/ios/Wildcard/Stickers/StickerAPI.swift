import Foundation

/// A library sticker (`GET /stickers`, `GET /contacts/:id/stickers`); see docs/stickers.md.
/// `digest` is the SHA-256 of the PNG: bytes never change for an ID, and it dedupes saves.
struct Sticker: Codable, Identifiable, Equatable, Hashable, Sendable {
    let id: String
    var emoji: String
    let width: Int
    let height: Int
    let size: Int
    /// `upload`, `avatar` or `saved`.
    let source: String
    let digest: String
    let createdAt: Double

    var imageResource: CachedImageResource { .sticker(id: id, digest: digest) }
    var chatSticker: ChatSticker { ChatSticker(id: id, emoji: emoji) }
}

/// The person's library with the server's size limit (120).
struct StickerLibrary: Equatable, Sendable {
    var stickers: [Sticker]
    var limit: Int
    var isFull: Bool { stickers.count >= limit }
}

/// `sticker: { id }` in a send request (private turn and group message).
struct StickerSend: Encodable, Sendable { let id: String }

extension AuthAPI {
    private struct LibraryResponse: Decodable { let stickers: [Sticker]; let limit: Int? }
    private struct StickersResponse: Decodable { let stickers: [Sticker] }
    private struct StickerEnvelope: Decodable { let sticker: Sticker }
    private struct CreateInput: Encodable { let emoji: String; let data: String }
    private struct EmojiInput: Encodable { let emoji: String }
    private struct SaveMessageInput: Encodable { let contactID: String; let turnID: String; let part: Int }

    static let stickerLibraryLimit = 120

    func stickerLibrary(token: String) async throws -> StickerLibrary {
        let (data, _) = try await send(path: "stickers", token: token)
        let response = try JSONDecoder().decode(LibraryResponse.self, from: data)
        return StickerLibrary(stickers: response.stickers, limit: response.limit ?? Self.stickerLibraryLimit)
    }

    func contactStickers(contactID: String, token: String) async throws -> [Sticker] {
        let (data, _) = try await send(path: "contacts/\(contactID)/stickers", token: token)
        return try JSONDecoder().decode(StickersResponse.self, from: data).stickers
    }

    func stickerImage(id: String, token: String) async throws -> Data {
        try await send(path: "stickers/\(id)/image", token: token, timeout: 60).0
    }

    func contactStickerImage(contactID: String, stickerID: String, token: String) async throws -> Data {
        try await send(path: "contacts/\(contactID)/stickers/\(stickerID)/image", token: token, timeout: 60).0
    }

    /// Returns the transparent PNG preview; nothing is stored until `createSticker`.
    func stickerCutout(jpeg: Data, subject: String?, token: String) async throws -> Data {
        let query = subject.map { [URLQueryItem(name: "subject", value: $0)] } ?? []
        return try await send(path: "stickers/cutout", method: "POST", body: jpeg, token: token, query: query,
                              contentType: "image/jpeg", timeout: 90).0
    }

    func createSticker(emoji: String, png: Data, token: String) async throws -> Sticker {
        let body = try JSONEncoder().encode(CreateInput(emoji: emoji, data: png.base64EncodedString()))
        let (data, _) = try await send(path: "stickers", method: "POST", body: body, token: token, timeout: 60)
        return try JSONDecoder().decode(StickerEnvelope.self, from: data).sticker
    }

    func updateStickerEmoji(id: String, emoji: String, token: String) async throws -> Sticker {
        let body = try JSONEncoder().encode(EmojiInput(emoji: emoji))
        let (data, _) = try await send(path: "stickers/\(id)", method: "PATCH", body: body, token: token)
        return try JSONDecoder().decode(StickerEnvelope.self, from: data).sticker
    }

    func deleteSticker(id: String, token: String) async throws {
        _ = try await send(path: "stickers/\(id)", method: "DELETE", token: token)
    }

    func saveContactSticker(contactID: String, stickerID: String, token: String) async throws -> Sticker {
        let (data, _) = try await send(path: "contacts/\(contactID)/stickers/\(stickerID)/save", method: "POST",
                                       body: Data("{}".utf8), token: token)
        return try JSONDecoder().decode(StickerEnvelope.self, from: data).sticker
    }

    /// Saves the sticker of a contact message (`part` indexes `assistantMessages`).
    func saveMessageSticker(contactID: String, turnID: String, part: Int, token: String) async throws -> Sticker {
        let body = try JSONEncoder().encode(SaveMessageInput(contactID: contactID, turnID: turnID, part: part))
        let (data, _) = try await send(path: "stickers/save", method: "POST", body: body, token: token)
        return try JSONDecoder().decode(StickerEnvelope.self, from: data).sticker
    }
}
