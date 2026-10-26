import Foundation

struct Contact: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    let createdAt: Double
    let updatedAt: Double
}

struct ContactsPage: Decodable, Sendable {
    let contacts: [Contact]
    let nextCursor: String?
}

extension AuthAPI {
    private struct ContactEnvelope: Decodable { let contact: Contact }
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

    func deleteContact(id: String, token: String) async throws {
        _ = try await send(path: "contacts/\(id)", method: "DELETE", token: token)
    }
}
