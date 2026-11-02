import Foundation
import Observation

@MainActor
@Observable
final class ContactInvitationsStore {
    private(set) var invitations: [ReceivedContactInvitation] = []
    private(set) var contributorModel = false
    private(set) var hasLoaded = false
    private(set) var isLoading = false
    private(set) var isMutating = false
    private(set) var error: String?
    private var refreshedAt: Date?
    private var revision = 0

    func refresh(using auth: AuthStore, force: Bool = false) async {
        guard !isLoading, !isMutating else { return }
        if !force, let refreshedAt, Date.now.timeIntervalSince(refreshedAt) < 15 { return }
        let request = revision
        isLoading = true
        defer { isLoading = false }
        do {
            let inbox = try await auth.withSession { api, token in try await api.contactInvitationInbox(token: token) }
            guard request == revision, !Task.isCancelled else { return }
            invitations = inbox.invitations
            contributorModel = inbox.contributorModel
            refreshedAt = .now
            hasLoaded = true
            error = nil
        } catch is CancellationError { }
        catch { if request == revision { self.error = error.localizedDescription; refreshedAt = .now } }
    }

    func accept(id: String, contributorConsent: Bool, using auth: AuthStore) async throws -> String {
        try beginMutation()
        defer { isMutating = false }
        let contactID = try await auth.withSession { api, token in
            try await api.acceptContactInvitation(id: id, contributorConsent: contributorConsent, token: token)
        }
        invitations.removeAll { $0.id == id }
        return contactID
    }

    func decline(id: String, using auth: AuthStore) async throws {
        try beginMutation()
        defer { isMutating = false }
        try await auth.withSession { api, token in try await api.declineContactInvitation(id: id, token: token) }
        invitations.removeAll { $0.id == id }
    }

    private func beginMutation() throws {
        guard !isMutating else { throw AuthAPI.Failure.rejected(String(localized: "Please wait for the current invitation change to finish.")) }
        revision += 1
        isMutating = true
        refreshedAt = nil
        error = nil
    }
}
