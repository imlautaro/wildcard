import Foundation

struct AuthUser: Codable, Sendable {
    let id: String
    let name: String
    let email: String
    let emailVerified: Bool
    var onboardingRequired: Bool? = nil
    var chatModel: String? = nil
    var photoVersion: String? = nil
    /// "Contacts share with each other" (docs/privacy.md); absent from older responses means off.
    var contactsShare: Bool? = nil
    /// Fast mode (docs/chats.md#fast-mode); absent from older responses means off.
    var fastMode: Bool? = nil
    /// Runtime flags from `GET /me`; other profile responses omit them, so the store keeps the last value.
    var features: AccountFeatures? = nil
}

struct AccountFeatures: Codable, Equatable, Sendable {
    var voiceMessages = false
    /// Admin flag: every account is processed with Contributor; the model choice is hidden.
    var contributorOnly = false

    init() { }
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        voiceMessages = try container.decodeIfPresent(Bool.self, forKey: .voiceMessages) ?? false
        contributorOnly = try container.decodeIfPresent(Bool.self, forKey: .contributorOnly) ?? false
    }
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
        case reviewRequired
        /// A document save based on an older revision; the message explains the conflict.
        case conflict(String)
        /// A sticker cutout found no subject (HTTP 422 `NO_SUBJECT`); the person may name what to cut out.
        case noSubject(String)
        /// HTTP 429 with the server's `Retry-After` seconds when it sent one.
        case rateLimited(retryAfter: Int?, message: String)
        /// A send refused for missing Contributor consent; `group` offers Members as the fix.
        case consentRequired(message: String, group: Bool)

        var errorDescription: String? {
            switch self {
            case .invalidConfiguration: String(localized: "The API URL is missing or invalid. Check the app configuration.")
            case .insecureURL: String(localized: "The API URL must use HTTPS.")
            case .unauthorized: String(localized: "Your session has expired. Please sign in again.")
            case .notFound: String(localized: "This contact is no longer available.")
            case .rejected(let message): message
            case .invalidResponse: String(localized: "The server returned an unexpected response. Please try again.")
            case .temporarilyUnavailable: String(localized: "Groups are temporarily unavailable. Please try again.")
            case .reviewRequired: String(localized: "Review and enable this mini app first.")
            case .conflict(let message): message
            case .noSubject(let message): message
            case .consentRequired(let message, _): message
            case .rateLimited(let retryAfter, let message):
                retryAfter.map { seconds in String(localized: "Too many requests. Please wait \(seconds) seconds and try again.") } ?? message
            }
        }
    }

    /// Connectivity and availability failures that the next background poll retries.
    /// Stores keep cached content visible instead of surfacing these after a first load.
    static func isTransient(_ error: Error) -> Bool {
        if case Failure.temporarilyUnavailable = error { return true }
        guard let code = (error as? URLError)?.code else { return false }
        return [.timedOut, .notConnectedToInternet, .networkConnectionLost, .cannotConnectToHost,
                .cannotFindHost, .dnsLookupFailed, .dataNotAllowed, .internationalRoamingOff].contains(code)
    }

    private struct Credentials: Encodable {
        let name: String?
        let email: String
        let password: String
    }
    private struct UserResponse: Decodable { let user: AuthUser }
    private struct MeResponse: Decodable { let user: AuthUser; let features: AccountFeatures? }
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

    func savePrivacy(contactsShare: Bool, token: String) async throws -> AuthUser {
        let body = try JSONEncoder().encode(["contactsShare": contactsShare])
        let (data, _) = try await send(path: "me/privacy", method: "PUT", body: body, token: token)
        return try JSONDecoder().decode(UserResponse.self, from: data).user
    }

    func saveFastMode(_ fastMode: Bool, token: String) async throws -> AuthUser {
        let body = try JSONEncoder().encode(["fastMode": fastMode])
        let (data, _) = try await send(path: "me/fast-mode", method: "PUT", body: body, token: token)
        return try JSONDecoder().decode(UserResponse.self, from: data).user
    }

    func currentUser(token: String) async throws -> AuthUser {
        let (data, _) = try await send(path: "me", token: token)
        let response = try JSONDecoder().decode(MeResponse.self, from: data)
        var user = response.user
        user.features = response.features ?? AccountFeatures()
        return user
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

    /// Permanent account deletion (docs/authentication.md#deleting-your-account). A wrong
    /// password is HTTP 403, so it never reads as an expired session.
    func deleteAccount(password: String, token: String) async throws {
        let body = try JSONEncoder().encode(["password": password])
        _ = try await send(path: "me", method: "DELETE", body: body, token: token)
    }

    func signOut(token: String) async throws {
        _ = try await send(path: "auth/sign-out", method: "POST", body: Data("{}".utf8), token: token)
    }

    /// Sticker routes carry typed codes and `Retry-After`, so they bypass the generic path-based mapping.
    private static func stickerFailure(_ response: HTTPURLResponse, data: Data, path: String) -> Failure {
        let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        let message = (body?["error"] as? String).flatMap { text -> String? in
            text.isEmpty || text.unicodeScalars.count > 512 || text.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) ? nil : text
        }
        switch response.statusCode {
        case 404 where message == "Contact not found": return .notFound
        case 404: return .rejected(message ?? String(localized: "This sticker is no longer available."))
        case 422 where body?["code"] as? String == "NO_SUBJECT":
            return .noSubject(message ?? String(localized: "Could not find a subject to cut out."))
        case 429:
            return .rateLimited(retryAfter: response.value(forHTTPHeaderField: "Retry-After").flatMap { Int($0) }.map { max($0, 1) },
                                message: message ?? String(localized: "Too many requests. Please wait a minute and try again."))
        case 400, 409, 413, 415, 422: return .rejected(message ?? String(localized: "This sticker could not be used."))
        default: return .rejected(String(localized: "Stickers are unavailable right now. Please try again."))
        }
    }

    /// Sends refused for missing Contributor consent (docs/model-settings.md#sharing-and-mcp).
    private static func consentFailure(_ data: Data) -> Failure? {
        guard let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        let reason: String
        switch body["code"] as? String {
        case "CONTACT_CONTRIBUTOR_CONSENT_REQUIRED":
            reason = String(localized: "This shared contact can't reply because you accepted it without Contributor consent. Ask its creator for a new invitation and accept it with Contributor consent.")
        case "GROUP_CONTRIBUTOR_CONSENT_REQUIRED":
            reason = body["selfConsentMissing"] as? Bool == true
                ? String(localized: "Contacts can't reply in this group until you give Contributor consent. Turn it on in Members.")
                : String(localized: "Contacts can't reply in this group until every member gives Contributor consent. Members who haven't can turn it on in Members.")
        default: return nil
        }
        let message = body["contributorOnly"] as? Bool == true
            ? reason + " " + String(localized: "Contributor is on for every account right now.") : reason
        return .consentRequired(message: message, group: body["code"] as? String == "GROUP_CONTRIBUTOR_CONSENT_REQUIRED")
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
            if response.statusCode == 403, let consent = Self.consentFailure(data) { throw consent }
            if path.hasPrefix("stickers") || path.contains("/stickers") {
                throw Self.stickerFailure(response, data: data, path: path)
            }
            // Per-chat JSON export (docs/chat-export.md): the API's messages are accurate for every status.
            if path.hasSuffix("/export") {
                if response.statusCode == 429 { throw Failure.rejected(String(localized: "Too many exports. Please wait a minute and try again.")) }
                let message = try? JSONDecoder().decode(ErrorResponse.self, from: data).error
                throw Failure.rejected(message ?? String(localized: "The chat could not be exported. Please try again."))
            }
            if path.hasPrefix("onboarding") {
                let message = try? JSONDecoder().decode(ErrorResponse.self, from: data).error
                if let message, !message.isEmpty, message.count <= 512,
                   !message.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) {
                    throw Failure.rejected(message)
                }
                throw Failure.rejected(String(localized: "Setup is temporarily unavailable. Please try again."))
            }
            if path == "contacts/generation" {
                let message = try? JSONDecoder().decode(ErrorResponse.self, from: data).error
                throw Failure.rejected(message ?? String(localized: "Contact generation is temporarily unavailable. Please try again."))
            }
            if path.contains("/personality") {
                if [403, 404].contains(response.statusCode) { throw Failure.notFound }
                let message = try? JSONDecoder().decode(ErrorResponse.self, from: data).error
                throw Failure.rejected(message ?? String(localized: "Personality is temporarily unavailable. Please try again."))
            }
            if path.contains("/native-actions") || path.contains("/native-remote") {
                if [403, 404].contains(response.statusCode) { throw Failure.notFound }
                let message = try? JSONDecoder().decode(ErrorResponse.self, from: data).error
                throw Failure.rejected(message ?? String(localized: "Native requests are temporarily unavailable."))
            }
            if path.contains("/tasks") || path.contains("/documents") {
                if [403, 404].contains(response.statusCode) { throw Failure.notFound }
                if response.statusCode == 429 || response.statusCode >= 500 { throw Failure.temporarilyUnavailable }
                let message = (try? JSONDecoder().decode(ErrorResponse.self, from: data).error) ?? String(localized: "Please try again.")
                if response.statusCode == 409 && path.contains("/documents") { throw Failure.conflict(message) }
                throw Failure.rejected(message)
            }
            if path.contains("/mini-apps") {
                if [403, 404].contains(response.statusCode) { throw Failure.notFound }
                if response.statusCode >= 500 { throw Failure.temporarilyUnavailable }
                let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                if response.statusCode == 409, body?["code"] as? String == "REVIEW_REQUIRED" { throw Failure.reviewRequired }
                throw Failure.rejected(body?["error"] as? String ?? String(localized: "Mini apps are temporarily unavailable. Please try again."))
            }
            if path.contains("/mcp") {
                if response.statusCode == 404 { throw Failure.notFound }
                let message = try? JSONDecoder().decode(ErrorResponse.self, from: data).error
                throw Failure.rejected(message ?? String(localized: "Connections are temporarily unavailable. Please try again."))
            }
            if path.hasPrefix("home") {
                if response.statusCode == 429 || response.statusCode >= 500 { throw Failure.temporarilyUnavailable }
                let message = try? JSONDecoder().decode(ErrorResponse.self, from: data).error
                throw Failure.rejected(message ?? String(localized: "For you is temporarily unavailable. Please try again."))
            }
            if path.hasSuffix("/reactions") {
                if [403, 404].contains(response.statusCode) { throw Failure.notFound }
                if response.statusCode >= 500 { throw Failure.temporarilyUnavailable }
                let message = try? JSONDecoder().decode(ErrorResponse.self, from: data).error
                throw Failure.rejected(message ?? String(localized: "Reactions are temporarily unavailable. Please try again."))
            }
            if path.hasPrefix("groups") {
                if path.hasSuffix("/transcriptions"), response.statusCode == 422 {
                    let code = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["code"] as? String
                    throw Failure.rejected(code == "NO_SPEECH" ? String(localized: "No speech was detected. Please record again.") : String(localized: "The transcript is too long. Please record a shorter message."))
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
                throw Failure.rejected(String(localized: "Choose a supported model and agree to Meta's Contributor data use before enabling Contributor."))
            }
            if path == "me", method == "DELETE" {
                let code = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["code"] as? String
                switch code {
                case "INCORRECT_PASSWORD", "PASSWORD_REQUIRED": throw Failure.rejected(String(localized: "Incorrect password."))
                case "SUPER_ADMIN": throw Failure.rejected(String(localized: "Super admin accounts can't be deleted here. Remove this account from the super admin list first."))
                default:
                    if response.statusCode == 429 { throw Failure.rejected(String(localized: "Too many attempts. Please wait a minute and try again.")) }
                    throw Failure.rejected(String(localized: "Your account could not be deleted. Please try again."))
                }
            }
            if path == "me", [400, 422].contains(response.statusCode) {
                throw Failure.rejected(String(localized: "Use a name with 1–100 characters and no control characters."))
            }
            if path == "me/photo", response.statusCode == 409 {
                throw Failure.rejected(String(localized: "Your profile changed. Go back, refresh, and try again."))
            }
            if path.hasPrefix("contacts/sharing/") {
                if [400, 403, 404, 409, 413, 422, 429].contains(response.statusCode),
                   let message = try? JSONDecoder().decode(ErrorResponse.self, from: data).error,
                   !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                   message.unicodeScalars.count <= 512,
                   !message.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) {
                    throw Failure.rejected(message)
                }
                throw Failure.rejected(String(localized: "Contact sharing is temporarily unavailable. Please try again."))
            }
            if path.hasSuffix("/photo") {
                switch response.statusCode {
                case 400, 413, 415, 422: throw Failure.rejected(String(localized: "Choose a square JPEG photo smaller than 512 KB."))
                case 409: throw Failure.rejected(String(localized: "This contact changed. Go back, refresh, and try again."))
                default: break
                }
            }
            if path.hasSuffix("/transcriptions") {
                switch response.statusCode {
                case 400, 413, 415: throw Failure.rejected(String(localized: "Record a message between a quarter second and one minute long."))
                case 422:
                    let code = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["code"] as? String
                    throw Failure.rejected(code == "NO_SPEECH" ? String(localized: "No speech was detected. Please record again.") : String(localized: "The transcript is too long. Please record a shorter message."))
                case 429: throw Failure.rejected(String(localized: "Too many recordings. Wait a minute before trying again."))
                case 502, 503, 504: throw Failure.rejected(String(localized: "Transcription is unavailable right now. Please try again."))
                default: break
                }
            }
            if path.contains("/chat/") {
                if response.statusCode == 403,
                   (try? JSONDecoder().decode(ErrorResponse.self, from: data).error) == "Remote device unavailable or permission revoked" {
                    throw Failure.rejected(String(localized: "Remote device unavailable or permission revoked"))
                }
                if response.statusCode == 413 { throw Failure.rejected(String(localized: "Choose a file up to 5 MB.")) }
                if response.statusCode == 400, let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String {
                    throw Failure.rejected(message)
                }
                switch response.statusCode {
                case 400, 422: throw Failure.rejected(String(localized: "Use a message with 1–4,000 characters."))
                case 409: throw Failure.rejected(String(localized: "A reply is already in progress or the conversation changed. Refresh and try again."))
                case 503: throw Failure.rejected(String(localized: "AI replies are temporarily unavailable. Please try again later."))
                default: break
                }
            }
            // Super admins can close registration at runtime (docs/admin.md).
            if path == "auth/sign-up/email", response.statusCode == 403 {
                throw Failure.rejected(String(localized: "New accounts are not being accepted right now. Existing accounts can still sign in."))
            }
            switch response.statusCode {
            case 401: throw Failure.rejected(String(localized: "Incorrect email or password."))
            case 429: throw Failure.rejected(String(localized: "Too many attempts. Please wait a minute and try again."))
            case 400, 422:
                if path.hasPrefix("contacts") { throw Failure.rejected(String(localized: "Use a contact name with 1–100 characters and no control characters.")) }
                throw Failure.rejected(String(localized: "Check your details, or try signing in if you already have an account."))
            case 404 where path.hasPrefix("contacts/"): throw Failure.notFound
            case 409: throw Failure.rejected(String(localized: "Unable to create this account. Try signing in instead."))
            default: throw Failure.rejected(String(localized: "Unable to complete the request. Please try again later."))
            }
        }
        return (data, response)
    }
}
