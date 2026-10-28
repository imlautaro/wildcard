import Foundation

struct AuthUser: Codable, Sendable {
    let id: String
    let name: String
    let email: String
    let emailVerified: Bool
    var chatModel: String? = nil
    var photoVersion: String? = nil
}

struct AuthAPI: Sendable {
    enum Failure: LocalizedError {
        case invalidConfiguration
        case insecureURL
        case unauthorized
        case notFound
        case rejected(String)
        case invalidResponse
        case temporarilyUnavailable

        var errorDescription: String? {
            switch self {
            case .invalidConfiguration: "The API URL is missing or invalid. Check the app configuration."
            case .insecureURL: "The API URL must use HTTPS."
            case .unauthorized: "Your session has expired. Please sign in again."
            case .notFound: "This contact is no longer available."
            case .rejected(let message): message
            case .invalidResponse: "The server returned an unexpected response. Please try again."
            case .temporarilyUnavailable: "Groups are temporarily unavailable. Please try again."
            }
        }
    }

    private struct Credentials: Encodable {
        let name: String?
        let email: String
        let password: String
    }
    private struct UserResponse: Decodable { let user: AuthUser }
    private struct ErrorResponse: Decodable { let error: String }

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

    func saveModel(_ model: String, contributorConsent: Bool, token: String) async throws -> AuthUser {
        struct Input: Encodable { let chatModel: String; let contributorConsent: Bool }
        let body = try JSONEncoder().encode(Input(chatModel: model, contributorConsent: contributorConsent))
        let (data, _) = try await send(path: "me/model", method: "PUT", body: body, token: token)
        return try JSONDecoder().decode(UserResponse.self, from: data).user
    }

    func currentUser(token: String) async throws -> AuthUser {
        let (data, _) = try await send(path: "me", token: token)
        return try JSONDecoder().decode(UserResponse.self, from: data).user
    }

    func saveProfile(name: String, token: String) async throws -> AuthUser {
        let body = try JSONEncoder().encode(["name": name])
        let (data, _) = try await send(path: "me", method: "PATCH", body: body, token: token)
        return try JSONDecoder().decode(UserResponse.self, from: data).user
    }

    func profilePhoto(version: String, token: String) async throws -> Data {
        let (data, _) = try await send(path: "me/photo", token: token,
                                     query: [URLQueryItem(name: "version", value: version)])
        return data
    }

    func saveProfilePhoto(data: Data?, token: String) async throws -> AuthUser {
        let (response, _) = try await send(path: "me/photo", method: data == nil ? "DELETE" : "PUT",
                                         body: data, token: token, contentType: "image/jpeg")
        return try JSONDecoder().decode(UserResponse.self, from: response).user
    }

    func signOut(token: String) async throws {
        _ = try await send(path: "auth/sign-out", method: "POST", body: Data("{}".utf8), token: token)
    }

    func send(path: String, method: String = "GET", body: Data? = nil, token: String? = nil, query: [URLQueryItem] = [], contentType: String = "application/json", timeout: TimeInterval = 30) async throws -> (Data, HTTPURLResponse) {
        guard let baseURL, baseURL.host != nil else { throw Failure.invalidConfiguration }
        #if DEBUG
        let isLoopback = ["localhost", "127.0.0.1", "::1"].contains(baseURL.host ?? "")
        guard baseURL.scheme == "https" || (baseURL.scheme == "http" && isLoopback) else { throw Failure.insecureURL }
        #else
        guard baseURL.scheme == "https" else { throw Failure.insecureURL }
        #endif
        guard var components = URLComponents(url: baseURL.appending(path: "api/v1/\(path)"), resolvingAgainstBaseURL: false) else { throw Failure.invalidConfiguration }
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else { throw Failure.invalidConfiguration }
        var request = URLRequest(url: url)
        request.timeoutInterval = timeout
        request.httpMethod = method
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        // SwiftUI cancels view tasks during navigation. URLSession reports that as
        // URLError.cancelled rather than CancellationError; keep one cancellation
        // contract for callers so normal navigation never becomes an error banner.
        try Task.checkCancellation()
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            if Task.isCancelled || (error as? URLError)?.code == .cancelled {
                throw CancellationError()
            }
            throw error
        }
        try Task.checkCancellation()
        guard let response = response as? HTTPURLResponse else { throw Failure.invalidResponse }
        if response.statusCode == 401, token != nil { throw Failure.unauthorized }
        guard (200..<300).contains(response.statusCode) else {
            if path.contains("/native-actions") || path.contains("/native-remote") {
                if [403, 404].contains(response.statusCode) { throw Failure.notFound }
                let message = try? JSONDecoder().decode(ErrorResponse.self, from: data).error
                throw Failure.rejected(message ?? "Native requests are temporarily unavailable.")
            }
            if path.contains("/mcp") {
                if response.statusCode == 404 { throw Failure.notFound }
                let message = try? JSONDecoder().decode(ErrorResponse.self, from: data).error
                throw Failure.rejected(message ?? "Connections are temporarily unavailable. Please try again.")
            }
            if path.hasSuffix("/reactions") {
                if [403, 404].contains(response.statusCode) { throw Failure.notFound }
                if response.statusCode >= 500 { throw Failure.temporarilyUnavailable }
                let message = try? JSONDecoder().decode(ErrorResponse.self, from: data).error
                throw Failure.rejected(message ?? "Reactions are temporarily unavailable. Please try again.")
            }
            if path.hasPrefix("groups") {
                if path.hasSuffix("/transcriptions"), response.statusCode == 422 {
                    let code = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["code"] as? String
                    throw Failure.rejected(code == "NO_SPEECH" ? "No speech was detected. Please record again." : "The transcript is too long. Please record a shorter message.")
                }
                if response.statusCode == 404 && method == "GET" && !path.contains("/photos/") { throw Failure.notFound }
                if response.statusCode == 429 || response.statusCode >= 500 { throw Failure.temporarilyUnavailable }
                if [400, 403, 404, 409, 413, 422].contains(response.statusCode),
                   let message = try? JSONDecoder().decode(ErrorResponse.self, from: data).error,
                   message.unicodeScalars.count <= 512,
                   !message.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) {
                    throw Failure.rejected(message)
                }
                throw Failure.temporarilyUnavailable
            }
            if path == "me/model", response.statusCode == 422 {
                throw Failure.rejected("Choose a supported model and agree to Meta's Contributor data use before enabling Contributor.")
            }
            if path.hasPrefix("auth/sign-up"), response.statusCode == 403 {
                throw Failure.rejected("New account registration is closed.")
            }
            if path == "me", [400, 422].contains(response.statusCode) {
                throw Failure.rejected("Use a name with 1–100 characters and no control characters.")
            }
            if path == "me/photo", response.statusCode == 409 {
                throw Failure.rejected("Your profile changed. Go back, refresh, and try again.")
            }
            if path.hasPrefix("contacts/sharing/") {
                if [400, 403, 404, 409, 413, 422, 429].contains(response.statusCode),
                   let message = try? JSONDecoder().decode(ErrorResponse.self, from: data).error,
                   !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                   message.unicodeScalars.count <= 512,
                   !message.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) {
                    throw Failure.rejected(message)
                }
                throw Failure.rejected("Contact sharing is temporarily unavailable. Please try again.")
            }
            if path.hasSuffix("/photo") {
                switch response.statusCode {
                case 400, 413, 415, 422: throw Failure.rejected("Choose a square JPEG photo smaller than 512 KB.")
                case 409: throw Failure.rejected("This contact changed. Go back, refresh, and try again.")
                default: break
                }
            }
            if path.hasSuffix("/transcriptions") {
                switch response.statusCode {
                case 400, 413, 415: throw Failure.rejected("Record a message between a quarter second and one minute long.")
                case 422:
                    let code = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["code"] as? String
                    throw Failure.rejected(code == "NO_SPEECH" ? "No speech was detected. Please record again." : "The transcript is too long. Please record a shorter message.")
                case 429: throw Failure.rejected("Too many recordings. Wait a minute before trying again.")
                case 502, 503, 504: throw Failure.rejected("Transcription is unavailable right now. Please try again.")
                default: break
                }
            }
            if path.contains("/chat/") {
                if response.statusCode == 413 { throw Failure.rejected("Choose a file up to 5 MB.") }
                if response.statusCode == 400, let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String {
                    throw Failure.rejected(message)
                }
                switch response.statusCode {
                case 400, 422: throw Failure.rejected("Use a message with 1–4,000 characters.")
                case 409: throw Failure.rejected("A reply is already in progress or the conversation changed. Refresh and try again.")
                case 503: throw Failure.rejected("AI replies are temporarily unavailable. Please try again later.")
                default: break
                }
            }
            switch response.statusCode {
            case 401: throw Failure.rejected("Incorrect email or password.")
            case 429: throw Failure.rejected("Too many attempts. Please wait a minute and try again.")
            case 400, 422:
                if path.hasPrefix("contacts") { throw Failure.rejected("Use a contact name with 1–100 characters and no control characters.") }
                throw Failure.rejected("Check your details, or try signing in if you already have an account.")
            case 404 where path.hasPrefix("contacts/"): throw Failure.notFound
            case 409: throw Failure.rejected("Unable to create this account. Try signing in instead.")
            default: throw Failure.rejected("Unable to complete the request. Please try again later.")
            }
        }
        return (data, response)
    }
}
