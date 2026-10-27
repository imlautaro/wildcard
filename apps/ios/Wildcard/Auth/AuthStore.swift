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
                state = .signedOut
                return
            }
            token = savedToken
            user = try await api.currentUser(token: savedToken)
            state = .signedIn
        } catch AuthAPI.Failure.unauthorized {
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
            user = newUser
            state = .signedIn
        } catch {
            self.error = error.localizedDescription
        }
    }

    func saveProfile(name: String) async throws {
        user = try await withSession { api, token in
            try await api.saveProfile(name: name, token: token)
        }
    }

    func saveProfilePhoto(data: Data?) async throws {
        user = try await withSession { api, token in
            try await api.saveProfilePhoto(data: data, token: token)
        }
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
