import Foundation

struct ContactInvitation: Decodable, Sendable {
    let code: String?
    let recipientEmail: String?
    let expiresAt: Double
}

struct InvitationPreview: Decodable, Sendable {
    let name: String
    let expiresAt: Double
    let contributorModel: Bool
}

struct ContactSharing: Decodable, Sendable {
    struct Member: Decodable, Identifiable, Sendable {
        let id: String
        let name: String
        let role: String
    }
    struct Invitation: Decodable, Identifiable, Sendable {
        let id: String
        let expiresAt: Double
        let recipientEmail: String?
    }
    let members: [Member]
    let invitations: [Invitation]
    let contributorModel: Bool
}

struct ReceivedContactInvitation: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    let contactName: String
    let senderName: String
    let expiresAt: Double
}

struct ContactInvitationInbox: Decodable, Sendable {
    let invitations: [ReceivedContactInvitation]
    let contributorModel: Bool
}

extension AuthAPI {
    private struct SharingInput: Encodable {
        var code: String? = nil
        var email: String? = nil
        var invitationID: String? = nil
        var shareMemory = true
        let contributorConsent: Bool
    }
    private struct JoinedContact: Decodable { let contactID: String }

    func contactSharing(id: String, token: String) async throws -> ContactSharing {
        let (data, _) = try await send(path: "contacts/sharing/\(id)", token: token)
        return try JSONDecoder().decode(ContactSharing.self, from: data)
    }

    func inviteContact(id: String, email: String? = nil, contributorConsent: Bool, token: String) async throws -> ContactInvitation {
        let body = try JSONEncoder().encode(SharingInput(email: email, contributorConsent: contributorConsent))
        let (data, _) = try await send(path: "contacts/sharing/\(id)/invitations", method: "POST", body: body, token: token)
        return try JSONDecoder().decode(ContactInvitation.self, from: data)
    }

    func previewInvitation(code: String, token: String) async throws -> InvitationPreview {
        let body = try JSONEncoder().encode(["code": code])
        let (data, _) = try await send(path: "contacts/sharing/preview", method: "POST", body: body, token: token)
        return try JSONDecoder().decode(InvitationPreview.self, from: data)
    }

    func joinContact(code: String, contributorConsent: Bool, token: String) async throws -> String {
        let body = try JSONEncoder().encode(SharingInput(code: code, contributorConsent: contributorConsent))
        let (data, _) = try await send(path: "contacts/sharing/accept", method: "POST", body: body, token: token)
        return try JSONDecoder().decode(JoinedContact.self, from: data).contactID
    }

    func contactInvitationInbox(token: String) async throws -> ContactInvitationInbox {
        let (data, _) = try await send(path: "contacts/sharing/inbox", token: token)
        return try JSONDecoder().decode(ContactInvitationInbox.self, from: data)
    }

    func acceptContactInvitation(id: String, contributorConsent: Bool, token: String) async throws -> String {
        let body = try JSONEncoder().encode(SharingInput(invitationID: id, contributorConsent: contributorConsent))
        let (data, _) = try await send(path: "contacts/sharing/accept", method: "POST", body: body, token: token)
        return try JSONDecoder().decode(JoinedContact.self, from: data).contactID
    }

    func declineContactInvitation(id: String, token: String) async throws {
        _ = try await send(path: "contacts/sharing/inbox/\(id)", method: "DELETE", token: token)
    }

    func revokeContactAccess(id: String, memberID: String? = nil, invitationID: String? = nil, token: String) async throws {
        let path: String
        if let memberID { path = "contacts/sharing/\(id)/members/\(memberID)" }
        else if let invitationID { path = "contacts/sharing/\(id)/invitations/\(invitationID)" }
        else { throw Failure.invalidResponse }
        _ = try await send(path: path, method: "DELETE", token: token)
    }
}
