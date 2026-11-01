import Foundation
import Observation

@MainActor
@Observable
final class AuthStore {
    enum State { case restoring, signedOut, signedIn, unavailable }
    private(set) var state: State = .restoring
    private(set) var user: AuthUser?
    private(set) var isBusy = false
    var error: String?
    let images = PrivateImageCache()
    let onboarding = OnboardingStore()
    let contactGeneration = ContactGenerationStore()
    private let api = AuthAPI()
    private var token: String?

    func restore() async {
        guard !isBusy else { return }
        isBusy = true
        state = .restoring
        error = nil
        defer { isBusy = false }
        do {
            guard let savedToken = try SessionKeychain.load() else {
                onboarding.reset(); contactGeneration.reset()
                await images.clear()
                state = .signedOut
                return
            }
            token = savedToken
            let restoredUser = try await api.currentUser(token: savedToken)
            if user?.id != restoredUser.id { onboarding.reset(); contactGeneration.reset() }
            user = restoredUser
            images.activate(userID: restoredUser.id)
            state = .signedIn
        } catch AuthAPI.Failure.unauthorized {
            onboarding.reset(); contactGeneration.reset()
            await images.clear()
            do {
                try SessionKeychain.delete()
                token = nil
                user = nil
                state = .signedOut
            } catch {
                self.error = error.localizedDescription
                state = .unavailable
            }
        } catch {
            self.error = error.localizedDescription
            state = .unavailable
        }
    }

    func authenticate(email: String, password: String, name: String?) async {
        guard !isBusy else { return }
        isBusy = true
        error = nil
        defer { isBusy = false }
        do {
            let (newUser, newToken) = try await api.authenticate(email: email, password: password, name: name)
            do {
                try SessionKeychain.save(newToken)
            } catch {
                try? await api.signOut(token: newToken)
                throw error
            }
            token = newToken
            if user?.id != newUser.id { onboarding.reset(); contactGeneration.reset() }
            var profile = newUser
            profile.onboardingRequired = true
            profile.features = AccountFeatures()
            do { profile = try await api.currentUser(token: newToken) }
            catch AuthAPI.Failure.unauthorized {
                try SessionKeychain.delete()
                token = nil
                throw AuthAPI.Failure.unauthorized
            } catch { /* Keep setup gated until the next profile refresh. */ }
            user = profile
            images.activate(userID: newUser.id)
            state = .signedIn
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Only `GET /me` returns feature flags; keep them across other profile responses.
    private func keepingFeatures(_ updated: AuthUser) -> AuthUser {
        var result = updated
        if result.features == nil, user?.id == updated.id { result.features = user?.features }
        return result
    }

    func saveModel(_ model: String, contributorConsent: Bool) async throws {
        user = keepingFeatures(try await withSession { api, token in
            try await api.saveModel(model, contributorConsent: contributorConsent, token: token)
        })
    }

    /// "Contacts share with each other" (docs/privacy.md). The response is authoritative.
    func savePrivacy(contactsShare: Bool) async throws {
        user = keepingFeatures(try await withSession { api, token in
            try await api.savePrivacy(contactsShare: contactsShare, token: token)
        })
    }

    func saveProfile(name: String) async throws {
        user = keepingFeatures(try await withSession { api, token in
            try await api.saveProfile(name: name, token: token)
        })
    }

    func saveProfilePhoto(data: Data?) async throws {
        let updated = try await withSession { api, token in
            try await api.saveProfilePhoto(data: data, token: token)
        }
        if let data, let version = updated.photoVersion {
            await images.store(data, for: .accountAvatar(version: version))
        }
        guard state == .signedIn, user?.id == updated.id else { throw CancellationError() }
        user = keepingFeatures(updated)
    }

    func refreshProfile() async throws {
        user = try await withSession { api, token in try await api.currentUser(token: token) }
    }

    func signOut() async {
        guard !isBusy, let token else { return }
        isBusy = true
        error = nil
        defer { isBusy = false }
        do {
            do { try await api.signOut(token: token) }
            catch AuthAPI.Failure.unauthorized { /* The session is already invalid. */ }
            onboarding.reset(); contactGeneration.reset()
            await images.clear()
            try SessionKeychain.delete()
            self.token = nil
            user = nil
            state = .signedOut
        } catch {
            self.error = error.localizedDescription
        }
    }

    func withSession<Value>(_ operation: (AuthAPI, String) async throws -> Value) async throws -> Value {
        guard state == .signedIn, let credential = token else { throw AuthAPI.Failure.unauthorized }
        do {
            let result = try await operation(api, credential)
            guard token == credential, state == .signedIn else { throw CancellationError() }
            return result
        } catch {
            guard token == credential else { throw CancellationError() }
            if case AuthAPI.Failure.unauthorized = error {
                onboarding.reset(); contactGeneration.reset()
                await images.clear()
                do {
                    try SessionKeychain.delete()
                    token = nil
                    user = nil
                    state = .signedOut
                } catch {
                    self.error = error.localizedDescription
                    state = .unavailable
                }
            }
            throw error
        }
    }
}
