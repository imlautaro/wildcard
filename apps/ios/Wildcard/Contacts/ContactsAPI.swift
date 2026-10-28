import Foundation

struct Contact: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    var agentID: String? = nil
    var role: String? = nil
    var photoVersion: String? = nil
    let createdAt: Double
    let updatedAt: Double
    var lastMessagePreview: String? = nil
    var lastMessageText: String?
    var lastMessageAt: Double?
    var unreadCount: Int?
    var lastMessageFromUser: Int? = nil
    var lastMessageReadAt: Double? = nil
    var lastReadSequence: Int?
    var canManage: Bool { role != "member" }
}

struct ContactsPage: Decodable, Sendable {
    let contacts: [Contact]
    let totalUnreadCount: Int?
    let nextCursor: String?
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

    func contactEnergy(id: String, reset: Bool = false, token: String) async throws -> ContactEnergy {
        let suffix = reset ? "/reset" : ""
        let (data, _) = try await send(path: "contacts/\(id)/energy\(suffix)", method: reset ? "POST" : "GET", token: token)
        return try JSONDecoder().decode(EnergyEnvelope.self, from: data).energy
    }

    func deleteContact(id: String, token: String) async throws {
        _ = try await send(path: "contacts/\(id)", method: "DELETE", token: token)
    }
}
