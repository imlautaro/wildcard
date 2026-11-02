import Foundation

struct Contact: Codable, Hashable, Identifiable, Sendable {
    let id: String
    /// The name shown to this user: their private alias when set, otherwise the shared name.
    let name: String
    /// The shared name every participant sees (absent in snapshots from older servers).
    var realName: String? = nil
    /// This user's private display name for the contact; nobody else sees it.
    var alias: String? = nil
    var archivedAt: Double? = nil
    var historyRevision: Int? = nil
    var clearing: Int? = nil
    var onboardingChat: Int? = nil
    /// 1 while a first-circle contact is still being created; it cannot be opened yet.
    var setupPending: Int? = nil
    var isSettingUp: Bool { setupPending == 1 }
    var initiativeEnabled: Int? = nil
    /// "Keep this chat private" (0 or 1): this person's facts stay in this chat (docs/privacy.md).
    var keepPrivate: Int? = nil
    /// This participant's opt-in to voice replies (0 or 1).
    var voiceMessagesEnabled: Int? = nil
    /// The contact's shared voice; only the creator can change it.
    var speechAccent: String? = nil
    var voiceID: String? = nil
    var voiceName: String? = nil
    var agentID: String? = nil
    var role: String? = nil
    var photoVersion: String? = nil
    let createdAt: Double
    let updatedAt: Double
    var replyActivity: String? = nil
    var lastMessageVoice: MessageVoice? = nil
    /// Newest reaction in this chat; shown when newer than the last message (docs/chats.md#chat-list-previews).
    var lastReaction: LastReaction? = nil
    var lastMessagePreview: String? = nil
    var lastMessageText: String?
    var lastMessageAt: Double?
    var unreadCount: Int?
    var lastMessageFromUser: Int? = nil
    var lastMessageReadAt: Double? = nil
    var lastReadSequence: Int?
    var canManage: Bool { role != "member" }
    /// The name the creator edits and other participants see.
    var sharedName: String { realName ?? name }
}

/// The newest reaction in a chat, for the chat list (migration 0090). `name` is sent for groups only:
/// the reacting member or contact as this viewer sees it.
struct LastReaction: Codable, Hashable, Sendable {
    let at: Double
    let emoji: String
    let own: Bool
    var name: String? = nil
}

struct ContactsPage: Decodable, Sendable {
    let contacts: [Contact]
    let totalUnreadCount: Int?
    let nextCursor: String?
}

/// A catalog voice a contact's creator can choose (`GET /voices`).
struct VoiceOption: Decodable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    var gender: String? = nil
    var age: String? = nil
    var accent: String? = nil
    var description: String? = nil

    var summary: String {
        [gender, age?.replacingOccurrences(of: "_", with: " "), accent].compactMap { $0?.isEmpty == false ? $0!.capitalized : nil }
            .joined(separator: " · ")
    }
}

struct ContactEnergy: Decodable, Sendable {
    let points: Int
    let capacity: Int
    let rechargeIntervalSeconds: Int
    let nextPointAt: Double?
}

extension AuthAPI {
    private struct ContactEnvelope: Decodable { let contact: Contact }
    private struct EnergyEnvelope: Decodable { let energy: ContactEnergy }
    private struct ContactInput: Encodable { let name: String }

    func contacts(token: String, before: String? = nil) async throws -> ContactsPage {
        let query = before.map { [URLQueryItem(name: "before", value: $0)] } ?? []
        let (data, _) = try await send(path: "contacts", token: token, query: query)
        return try JSONDecoder().decode(ContactsPage.self, from: data)
    }

    func contact(id: String, token: String) async throws -> Contact {
        let (data, _) = try await send(path: "contacts/\(id)", token: token)
        return try JSONDecoder().decode(ContactEnvelope.self, from: data).contact
    }

    func saveContact(name: String, id: String?, token: String) async throws -> Contact {
        let body = try JSONEncoder().encode(ContactInput(name: name))
        let path = id.map { "contacts/\($0)" } ?? "contacts"
        let (data, _) = try await send(path: path, method: id == nil ? "POST" : "PATCH", body: body, token: token)
        return try JSONDecoder().decode(ContactEnvelope.self, from: data).contact
    }

    /// Sets or clears (nil) this user's private alias; any participant may do it.
    func setContactAlias(id: String, alias: String?, token: String) async throws -> Contact {
        let value: Any = alias ?? NSNull()
        let body = try JSONSerialization.data(withJSONObject: ["alias": value])
        let (data, _) = try await send(path: "contacts/\(id)/alias", method: "PATCH", body: body, token: token)
        return try JSONDecoder().decode(ContactEnvelope.self, from: data).contact
    }

    func setContactInitiative(id: String, enabled: Bool, token: String) async throws -> Contact {
        let body = try JSONEncoder().encode(["enabled": enabled])
        let (data, _) = try await send(path: "contacts/\(id)/initiative", method: "PUT", body: body, token: token)
        return try JSONDecoder().decode(ContactEnvelope.self, from: data).contact
    }

    func setContactPrivacy(id: String, keepPrivate: Bool, token: String) async throws -> Contact {
        let body = try JSONEncoder().encode(["keepPrivate": keepPrivate])
        let (data, _) = try await send(path: "contacts/\(id)/privacy", method: "PUT", body: body, token: token)
        return try JSONDecoder().decode(ContactEnvelope.self, from: data).contact
    }

    func setContactVoiceMessages(id: String, enabled: Bool, token: String) async throws -> Contact {
        let body = try JSONEncoder().encode(["enabled": enabled])
        let (data, _) = try await send(path: "contacts/\(id)/voice-messages", method: "PUT", body: body, token: token)
        return try JSONDecoder().decode(ContactEnvelope.self, from: data).contact
    }

    func setContactVoice(id: String, voiceID: String, token: String) async throws -> Contact {
        let body = try JSONEncoder().encode(["voiceID": voiceID])
        let (data, _) = try await send(path: "contacts/\(id)/voice", method: "PUT", body: body, token: token)
        return try JSONDecoder().decode(ContactEnvelope.self, from: data).contact
    }

    func setContactSpeechAccent(id: String, accent: String, token: String) async throws -> Contact {
        let value: Any = accent.isEmpty ? NSNull() : accent
        let body = try JSONSerialization.data(withJSONObject: ["speechAccent": value])
        let (data, _) = try await send(path: "contacts/\(id)/speech-accent", method: "PUT", body: body, token: token)
        return try JSONDecoder().decode(ContactEnvelope.self, from: data).contact
    }

    func voices(token: String) async throws -> [VoiceOption] {
        struct Envelope: Decodable { let voices: [VoiceOption] }
        let (data, _) = try await send(path: "voices", token: token)
        return try JSONDecoder().decode(Envelope.self, from: data).voices
    }

    func contactPhoto(id: String, version: String, token: String) async throws -> Data {
        let (data, _) = try await send(path: "contacts/\(id)/photo", token: token,
                                     query: [URLQueryItem(name: "version", value: version)])
        return data
    }

    func saveContactPhoto(id: String, data: Data?, token: String) async throws -> Contact {
        let (response, _) = try await send(path: "contacts/\(id)/photo", method: data == nil ? "DELETE" : "PUT",
                                           body: data, token: token, contentType: "image/jpeg")
        return try JSONDecoder().decode(ContactEnvelope.self, from: response).contact
    }

    /// Creator-only AI portrait from the saved identity; the server finishes even if this request is abandoned.
    func generateContactPhoto(id: String, style: String, customStyle: String?, token: String) async throws -> Contact {
        struct Input: Encodable { let style: String; let customStyle: String? }
        let body = try JSONEncoder().encode(Input(style: style, customStyle: style == "custom" ? customStyle : nil))
        let (response, _) = try await send(path: "contacts/\(id)/photo/generate", method: "POST", body: body, token: token, timeout: 240)
        return try JSONDecoder().decode(ContactEnvelope.self, from: response).contact
    }

    func contactEnergy(id: String, reset: Bool = false, token: String) async throws -> ContactEnergy {
        let suffix = reset ? "/reset" : ""
        let (data, _) = try await send(path: "contacts/\(id)/energy\(suffix)", method: reset ? "POST" : "GET", token: token)
        return try JSONDecoder().decode(EnergyEnvelope.self, from: data).energy
    }

    func deleteContact(id: String, token: String) async throws {
        _ = try await send(path: "contacts/\(id)", method: "DELETE", token: token)
    }
}

extension AuthAPI {
    func archiveChat(id: String, group: Bool, archived: Bool, token: String) async throws {
        let body = try JSONEncoder().encode(["archived": archived])
        _ = try await send(path: "\(group ? "groups" : "contacts")/\(id)/archive", method: "PUT", body: body, token: token)
    }
    func clearChat(id: String, group: Bool, clearMemory: Bool, historyRevision: Int, token: String) async throws {
        let body = try JSONSerialization.data(withJSONObject: ["clearMemory": clearMemory, "historyRevision": historyRevision])
        _ = try await send(path: "\(group ? "groups" : "contacts")/\(id)/clear", method: "POST", body: body, token: token)
    }
}
