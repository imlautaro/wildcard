import Foundation
import SwiftUI

struct McpTool: Decodable, Sendable, Identifiable {
    let name: String
    let description: String
    let fingerprint: String
    let allowed: Bool
    let inputSchema: McpJSON
    var id: String { fingerprint }
}
// Preserve arbitrary JSON schemas for review without evaluating them on device.
indirect enum McpJSON: Codable, Sendable {
    case object([String: McpJSON]), array([McpJSON]), string(String), number(Double), bool(Bool), null
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode([McpJSON].self) { self = .array(v) }
        else { self = .object(try c.decode([String: McpJSON].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .object(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }
    var text: String {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return (try? String(decoding: encoder.encode(self), as: UTF8.self)) ?? "{}"
    }
}
struct McpConnection: Decodable, Sendable, Identifiable {
    let id: String
    let name: String
    let url: String
    let authenticated: Bool
    let authType: String
    let oauthStatus: String?
    let oauthConfigured: Bool
    let oauthIssuer: String?
    let oauthScope: String?
    let tools: [McpTool]
}
private struct McpEnvelope: Decodable { let connections: [McpConnection]; let callbackURL: String? }
struct McpOAuthLaunch: Decodable { let flowID: String; let launchURL: URL }
private struct McpCreated: Decodable { let id: String }
extension AuthAPI {
    func mcpConnections(contactID: String, token: String) async throws -> [McpConnection] {
        let (data, _) = try await send(path: "contacts/\(contactID)/mcp", token: token)
        return try JSONDecoder().decode(McpEnvelope.self, from: data).connections
    }
    func mcpCallbackURL(contactID: String, token: String) async throws -> String? {
        let (data, _) = try await send(path: "contacts/\(contactID)/mcp", token: token)
        return try JSONDecoder().decode(McpEnvelope.self, from: data).callbackURL
    }
    func createMcp(contactID: String, body: Data, token: String) async throws -> String {
        let (data, _) = try await send(path: "contacts/\(contactID)/mcp", method: "POST", body: body, token: token, timeout: 60)
        return try JSONDecoder().decode(McpCreated.self, from: data).id
    }
    func beginMcpOAuth(contactID: String, connectionID: String, body: Data, token: String) async throws -> McpOAuthLaunch {
        let (data, _) = try await send(path: "contacts/\(contactID)/mcp/\(connectionID)/oauth/start", method: "POST", body: body, token: token, timeout: 90)
        return try JSONDecoder().decode(McpOAuthLaunch.self, from: data)
    }
    func changeMcp(contactID: String, suffix: String, method: String, body: Data?, token: String) async throws {
        _ = try await send(path: "contacts/\(contactID)/mcp\(suffix)", method: method, body: body, token: token, timeout: 60)
    }
}

struct McpConnectionsView: View {
    let contactID: String
    let cache: NavigationSnapshot<[McpConnection]>
    @Environment(AuthStore.self) private var auth
    @Environment(\.scenePhase) private var scenePhase
    @State private var name = ""
    @State private var url = ""
    @State private var token = ""
    @State private var consent = false
    @State private var authType = "none"
    @State private var issuer = ""
    @State private var scope = ""
    @State private var clientID = ""
    @State private var clientSecret = ""
    @State private var advancedOAuth = false
    @State private var configureID: String?
    @State private var callbackURL: String?
    @State private var browser = McpOAuthBrowser()
    @State private var isVisible = false
    @State private var busy = false
    @State private var error: String?
    @State private var toolQuery = ""
    @State private var pendingPermission: (String, McpTool)?
    @State private var pendingEnableAll: McpConnection?
    @State private var pendingDisconnect: String?
    private let notice = "Only connect servers you trust. Enabled tools can read or change external data without asking again. Data is sent to the server and processed with Standard. This private chat stays excluded from shared memory, even after disconnecting. Group posting and schedule creation/editing from this chat will be disabled."

    var body: some View {
        Form {
            Section {
                Text(notice).font(.footnote)
                Text("Remote Streamable HTTP servers with public access, a Bearer token, or OAuth. Legacy SSE and local command servers are not supported yet.").font(.footnote)
                Button("Refresh connections") { Task { await refresh() } }.disabled(busy)
                if let error { Text(error).foregroundStyle(.red) }
                if cache.value == nil { ProgressView("Loading connections…") }
                else if cache.value?.isEmpty == true { Text("No connections yet.") }
            }
            if (cache.value ?? []).contains(where: { !$0.tools.isEmpty }) {
                Section { TextField("Search tools", text: $toolQuery).textInputAutocapitalization(.never).autocorrectionDisabled() }
            }
            ForEach(cache.value ?? []) { connection in
                Section(connection.name) {
                    Text(connection.url).font(.footnote).textSelection(.enabled)
                    Text(connection.authType == "oauth" ? (connection.authenticated ? "OAuth connected" : "Authorization required") : connection.authenticated ? "Bearer token" : "Public access").foregroundStyle(.secondary)
                    Text("\(connection.tools.count) tools loaded · \(connection.tools.filter(\.allowed).count) enabled").font(.footnote)
                    if !toolQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { Text("\(visibleTools(connection).count) matching").font(.footnote) }
                    if let issuer = connection.oauthIssuer { Text("Issuer: \(issuer)\nRequested scopes: \(connection.oauthScope ?? "")").font(.footnote).textSelection(.enabled) }
                    if connection.authType == "oauth" {
                        Text("Reauthorizing clears existing tool permissions. Review and enable them again afterward.").font(.footnote)
                        if connection.oauthConfigured {
                            Button("Authorize / Reauthorize") { Task { await authorize(connection.id) } }.disabled(busy)
                        }
                        Button("Configure OAuth") { configure(connection) }.disabled(busy)
                    }
                    if !connection.tools.isEmpty {
                        Button("Enable all tools") { pendingEnableAll = connection }
                            .disabled(busy || connection.tools.allSatisfy(\.allowed) || (connection.authType == "oauth" && !connection.authenticated))
                    }
                    ForEach(visibleTools(connection)) { tool in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(tool.name).font(.headline)
                            Text(tool.description).font(.footnote)
                            DisclosureGroup("Input schema") { Text(tool.inputSchema.text).font(.caption.monospaced()).textSelection(.enabled) }
                            Button(tool.allowed ? "Disable tool" : "Allow without asking again") {
                                if tool.allowed { Task { await permission(connection.id, tool, false) } }
                                else { pendingPermission = (connection.id, tool) }
                            }.disabled(busy)
                        }
                    }
                    Button("Refresh tools") { Task { await mutate("/\(connection.id)/refresh", "POST") } }.disabled(busy)
                    Button("Disconnect", role: .destructive) { pendingDisconnect = connection.id }.disabled(busy)
                }
            }
            Section(configureID == nil ? "Add MCP server" : "Configure OAuth") {
                if configureID == nil { Button("Use Gmail settings") { gmail() } }
                TextField("Name", text: $name).disabled(configureID != nil)
                TextField("HTTPS endpoint", text: $url).disabled(configureID != nil).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                Picker("Authentication", selection: $authType) {
                    Text("Public access").tag("none")
                    Text("Bearer token").tag("bearer")
                    Text("OAuth").tag("oauth")
                }.disabled(configureID != nil)
                if authType == "bearer" { SecureField("Bearer token (optional)", text: $token).textInputAutocapitalization(.never).autocorrectionDisabled() }
                if authType == "oauth" {
                    if callbackURL == nil { Text("OAuth requires a public HTTPS API configuration.").font(.footnote) }
                    Text("Wildcard discovers the OAuth settings and opens the provider's sign-in page. Authorizing an account does not enable tools.").font(.footnote)
                    DisclosureGroup("Advanced OAuth settings (optional)", isExpanded: $advancedOAuth) {
                        TextField("Authorization server (automatic when empty)", text: $issuer).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                        TextField("Scopes (automatic when empty)", text: $scope).textInputAutocapitalization(.never).autocorrectionDisabled()
                        TextField("Client ID (only if required by the provider)", text: $clientID).textInputAutocapitalization(.never).autocorrectionDisabled()
                        SecureField("Client secret (if required)", text: $clientSecret).textInputAutocapitalization(.never).autocorrectionDisabled()
                        if let callbackURL { Text("OAuth redirect URI: \(callbackURL)").font(.footnote).textSelection(.enabled) }
                        Text("Most servers need no manual settings. If you use your own client credentials, enter their trusted authorization server too. Google requires your own registered Web OAuth client marked for an AI-powered agent and Workspace preview access.").font(.footnote)
                    }
                }
                Toggle("I understand and accept the data access and privacy changes described above.", isOn: $consent)
                Button(authType == "oauth" ? "Continue to authorization" : "Connect") { Task { await connect() } }.disabled(busy || !consent || name.trimmingCharacters(in: .whitespaces).isEmpty || url.isEmpty)
                if configureID != nil { Button("Cancel configuration") { configureID = nil; clientSecret = ""; name = ""; url = "" } }
            }
        }
        .disabled(busy)
        .navigationTitle("Connections")
        .alert("Allow without asking again?", isPresented: Binding(get: { pendingPermission != nil }, set: { if !$0 { pendingPermission = nil } })) {
            Button("Allow") { if let (id, tool) = pendingPermission { Task { await permission(id, tool, true) } } }
            Button("Cancel", role: .cancel) { pendingPermission = nil }
        } message: { Text("This tool may read, change, or send external data. Only enable tools you understand and trust.") }
        .alert("Enable all tools?", isPresented: Binding(get: { pendingEnableAll != nil }, set: { if !$0 { pendingEnableAll = nil } })) {
            Button("Enable all tools") {
                if let connection = pendingEnableAll {
                    Task { await mutate("/\(connection.id)", "PATCH", ["fingerprints": connection.tools.map(\.fingerprint), "allowed": true]) }
                }
                pendingEnableAll = nil
            }
            Button("Cancel", role: .cancel) { pendingEnableAll = nil }
        } message: {
            if let connection = pendingEnableAll {
                Text("Enable all \(connection.tools.count) tools for \(connection.name) without asking again? This includes tools hidden by search. These tools may read, change, or send external data. Only enable tools you understand and trust.")
            }
        }
        .confirmationDialog("Disconnect this server?", isPresented: Binding(get: { pendingDisconnect != nil }, set: { if !$0 { pendingDisconnect = nil } }), titleVisibility: .visible) {
            Button("Disconnect", role: .destructive) { if let id = pendingDisconnect { Task { await mutate("/\(id)", "DELETE") } } }
        } message: { Text("Future calls will be blocked. Actions already started may finish. Historical messages remain private.") }
        .task(id: scenePhase) { if scenePhase == .active { await refresh() } }
        .onAppear { isVisible = true }
        .onDisappear { isVisible = false; token = ""; clientSecret = ""; browser.cancel() }
    }
    private func visibleTools(_ connection: McpConnection) -> [McpTool] {
        let query = toolQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        return connection.tools.filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) || $0.description.localizedCaseInsensitiveContains(query) }
    }
    private func refresh() async {
        do {
            try await cache.refresh { try await auth.withSession { api, token in try await api.mcpConnections(contactID: contactID, token: token) } }
            if callbackURL == nil { callbackURL = try await auth.withSession { api, token in try await api.mcpCallbackURL(contactID: contactID, token: token) } }
            error = nil
        } catch AuthAPI.Failure.notFound { cache.invalidate(remove: true); error = "This contact is no longer available." }
        catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }
    @discardableResult private func mutate(_ suffix: String, _ method: String, _ body: [String: Any]? = nil) async -> Bool {
        guard !busy else { return false }
        busy = true; error = nil; cache.invalidate()
        defer { busy = false }
        do {
            let data = try body.map { try JSONSerialization.data(withJSONObject: $0) }
            try await auth.withSession { api, token in try await api.changeMcp(contactID: contactID, suffix: suffix, method: method, body: data, token: token) }
            await refresh()
            return true
        } catch AuthAPI.Failure.notFound { cache.invalidate(remove: true); error = "This contact is no longer available."; return false }
        catch is CancellationError { return false }
        catch { self.error = error.localizedDescription; return false }
    }
    private func gmail() {
        advancedOAuth = true
        clientID = ""; clientSecret = ""
        name = "Gmail"; url = "https://gmailmcp.googleapis.com/mcp/v1"; authType = "oauth"
        issuer = "https://accounts.google.com"
        scope = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose"
    }
    private func configure(_ connection: McpConnection) {
        advancedOAuth = false
        clientID = ""; clientSecret = ""; issuer = ""; scope = ""
        configureID = connection.id; name = connection.name; url = connection.url; authType = "oauth"
        if connection.url == "https://gmailmcp.googleapis.com/mcp/v1" {
            advancedOAuth = true
            issuer = "https://accounts.google.com"
            scope = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose"
        }
    }
    private func connect() async {
        guard !busy else { return }
        busy = true; error = nil; cache.invalidate()
        defer { busy = false }
        do {
            var id = configureID
            if id == nil {
                let body = try JSONSerialization.data(withJSONObject: ["name": name, "url": url, "token": authType == "bearer" ? token : "", "authType": authType, "consent": consent])
                id = try await auth.withSession { api, token in try await api.createMcp(contactID: contactID, body: body, token: token) }
            }
            token = ""
            guard let id else { return }
            if authType == "oauth" {
                configureID = id
                var config: [String: String] = [:]
                if !issuer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { config["issuer"] = issuer.trimmingCharacters(in: .whitespacesAndNewlines) }
                if !scope.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { config["scope"] = scope.trimmingCharacters(in: .whitespacesAndNewlines) }
                if !clientID.isEmpty { config["clientID"] = clientID }
                if !clientSecret.isEmpty { config["clientSecret"] = clientSecret }
                clientSecret = ""
                try await runAuthorization(id, config)
            } else { name = ""; url = ""; consent = false }
            cache.invalidate(); await refresh()
        } catch is CancellationError { cache.invalidate(); await refresh() }
        catch { clientSecret = ""; cache.invalidate(); await refresh(); self.error = error.localizedDescription }
    }
    private func authorize(_ id: String) async {
        guard !busy else { return }
        busy = true; error = nil; cache.invalidate()
        defer { busy = false }
        do { try await runAuthorization(id); cache.invalidate(); await refresh() }
        catch is CancellationError { cache.invalidate(); await refresh() }
        catch { cache.invalidate(); await refresh(); self.error = error.localizedDescription }
    }
    private func runAuthorization(_ id: String, _ config: [String: String]? = nil) async throws {
        let startingUser = auth.user?.id
        var body: [String: Any] = [:]
        for (key, value) in config ?? [:] { body[key] = value }
        body["platform"] = "ios"
        if config != nil { body["rediscover"] = true }
        let data = try JSONSerialization.data(withJSONObject: body)
        let launch = try await auth.withSession { api, token in try await api.beginMcpOAuth(contactID: contactID, connectionID: id, body: data, token: token) }
        try Task.checkCancellation()
        guard isVisible else { throw CancellationError() }
        let callback = try await browser.open(launch.launchURL)
        try Task.checkCancellation()
        guard isVisible, startingUser == auth.user?.id, callback.scheme == "wildcard", callback.host == "mcp", callback.path == "/oauth-complete",
              let params = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems,
              params.filter({ $0.name == "flow" }).count == 1, params.filter({ $0.name == "proof" }).count == 1,
              params.first(where: { $0.name == "flow" })?.value == launch.flowID,
              let proof = params.first(where: { $0.name == "proof" })?.value else {
            throw AuthAPI.Failure.rejected("Authorization does not match this signed-in session. Return to Connections and try again.")
        }
        let completion = try JSONSerialization.data(withJSONObject: ["flowID": launch.flowID, "proof": proof])
        try await auth.withSession { api, token in try await api.changeMcp(contactID: contactID, suffix: "/\(id)/oauth/finish", method: "POST", body: completion, token: token) }
        do { try await auth.withSession { api, token in try await api.changeMcp(contactID: contactID, suffix: "/\(id)/refresh", method: "POST", body: Data("{}".utf8), token: token) } }
        catch { throw AuthAPI.Failure.rejected("Account authorized. Open Connections and refresh tools to review permissions.") }
        configureID = nil; name = ""; url = ""; consent = false
    }
    private func permission(_ connection: String, _ tool: McpTool, _ allowed: Bool) async {
        await mutate("/\(connection)", "PATCH", ["fingerprint": tool.fingerprint, "allowed": allowed])
        pendingPermission = nil
    }
}
