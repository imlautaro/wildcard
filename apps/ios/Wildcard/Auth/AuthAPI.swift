import Foundation

struct AuthUser: Codable, Sendable {
    let id: String
    let name: String
    let email: String
    let emailVerified: Bool
}

struct AuthAPI: Sendable {
    enum Failure: LocalizedError {
        case invalidConfiguration
        case unauthorized
        case rejected(String)
        case invalidResponse

        var errorDescription: String? {
            switch self {
            case .invalidConfiguration: "The API URL must use HTTPS."
            case .unauthorized: "Your session has expired. Please sign in again."
            case .rejected(let message): message
            case .invalidResponse: "The server returned an unexpected response. Please try again."
            }
        }
    }

    private struct Credentials: Encodable {
        let name: String?
        let email: String
        let password: String
    }
    private struct UserResponse: Decodable { let user: AuthUser }

    private let session: URLSession
    private let baseURL: URL?

    init() {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCache = nil
        configuration.timeoutIntervalForRequest = 30
        session = URLSession(configuration: configuration)
        baseURL = (Bundle.main.object(forInfoDictionaryKey: "WildcardAPIURL") as? String).flatMap(URL.init(string:))
    }

    func authenticate(email: String, password: String, name: String?) async throws -> (AuthUser, String) {
        let path = name == nil ? "auth/sign-in/email" : "auth/sign-up/email"
        let body = try JSONEncoder().encode(Credentials(name: name, email: email, password: password))
        let (data, response) = try await send(path: path, method: "POST", body: body)
        guard let token = response.value(forHTTPHeaderField: "set-auth-token"), !token.isEmpty else {
            throw Failure.invalidResponse
        }
        return (try JSONDecoder().decode(UserResponse.self, from: data).user, token)
    }

    func currentUser(token: String) async throws -> AuthUser {
        let (data, _) = try await send(path: "me", token: token)
        return try JSONDecoder().decode(UserResponse.self, from: data).user
    }

    func signOut(token: String) async throws {
        _ = try await send(path: "auth/sign-out", method: "POST", body: Data("{}".utf8), token: token)
    }

    private func send(path: String, method: String = "GET", body: Data? = nil, token: String? = nil) async throws -> (Data, HTTPURLResponse) {
        guard let baseURL, baseURL.host != nil else { throw Failure.invalidConfiguration }
        #if DEBUG
        let isLoopback = ["localhost", "127.0.0.1", "::1"].contains(baseURL.host ?? "")
        guard baseURL.scheme == "https" || (baseURL.scheme == "http" && isLoopback) else { throw Failure.invalidConfiguration }
        #else
        guard baseURL.scheme == "https" else { throw Failure.invalidConfiguration }
        #endif
        var request = URLRequest(url: baseURL.appending(path: "api/v1/\(path)"))
        request.httpMethod = method
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw Failure.invalidResponse }
        if response.statusCode == 401, token != nil { throw Failure.unauthorized }
        guard (200..<300).contains(response.statusCode) else {
            switch response.statusCode {
            case 401: throw Failure.rejected("Incorrect email or password.")
            case 429: throw Failure.rejected("Too many attempts. Please wait a minute and try again.")
            case 400, 422: throw Failure.rejected("Check your details, or try signing in if you already have an account.")
            case 409: throw Failure.rejected("Unable to create this account. Try signing in instead.")
            default: throw Failure.rejected("Unable to complete the request. Please try again later.")
            }
        }
        return (data, response)
    }
}
