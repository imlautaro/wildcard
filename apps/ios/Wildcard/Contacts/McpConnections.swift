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
/// A connector library entry served by `GET /me/mcp`. It only prefills the connect form.
struct McpPreset: Decodable, Sendable, Identifiable {
    let id: String
    let name: String
    let description: String
    let category: String
    let url: String
    let authType: String
    let issuer: String?
    let scope: String?
    let ownClient: Bool?
    let note: String?
}
/// The account's connectors with the OAuth redirect URI and the connector library, cached together.
struct McpCatalog: Decodable, Sendable {
    let connections: [McpConnection]
    let callbackURL: String?
    let presets: [McpPreset]
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        connections = try c.decode([McpConnection].self, forKey: .connections)
        callbackURL = try c.decodeIfPresent(String.self, forKey: .callbackURL)
        presets = try c.decodeIfPresent([McpPreset].self, forKey: .presets) ?? []
    }
    private enum CodingKeys: String, CodingKey { case connections, callbackURL, presets }
}
struct McpOAuthLaunch: Decodable { let flowID: String; let launchURL: URL }
private struct McpCreated: Decodable { let id: String }
extension AuthAPI {
    func mcpCatalog(contactID: String, token: String) async throws -> McpCatalog {
        let (data, _) = try await send(path: "me/mcp", token: token)
        return try JSONDecoder().decode(McpCatalog.self, from: data)
    }
    func createMcp(contactID: String, body: Data, token: String) async throws -> String {
        let (data, _) = try await send(path: "me/mcp", method: "POST", body: body, token: token, timeout: 60)
        return try JSONDecoder().decode(McpCreated.self, from: data).id
    }
    func beginMcpOAuth(contactID: String, connectionID: String, body: Data, token: String) async throws -> McpOAuthLaunch {
        let (data, _) = try await send(path: "me/mcp/\(connectionID)/oauth/start", method: "POST", body: body, token: token, timeout: 90)
        return try JSONDecoder().decode(McpOAuthLaunch.self, from: data)
    }
    func changeMcp(contactID: String, suffix: String, method: String, body: Data?, token: String) async throws {
        _ = try await send(path: "me/mcp\(suffix)", method: method, body: body, token: token, timeout: 60)
    }
}

struct McpConnectionsView: View {
    @Environment(ContactsStore.self) private var contacts
    let contactID: String
    let cache: NavigationSnapshot<McpCatalog>
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
    @State private var browser = McpOAuthBrowser()
    @State private var isVisible = false
    @State private var busy = false
    @State private var error: String?
    @State private var toolQuery = ""
    @State private var pendingPermission: (String, McpTool)?
    @State private var pendingEnableAll: McpConnection?
    @State private var pendingDisconnect: String?
    @State private var sheet: SheetKind?
    @State private var preset: McpPreset?
    @State private var libraryQuery = ""
    private let notice = "Configure a connector once, then grant contacts access from their Connections screen. Tool approvals apply to every contact and group you authorize. Only connect servers you trust. Enabled tools can read or change external data without asking again. Data is sent to the server and processed with Standard."
    private let supported = "Remote Streamable HTTP servers with public access, a Bearer token, or OAuth. Legacy SSE and local command servers are not supported yet."

    private let libraryInfo = "Official remote MCP servers from each provider, prefilled with their endpoint and access mode. You still review the privacy terms, sign in with the provider and approve each tool. Wildcard does not operate these servers, and providers can change them."
    private var connections: [McpConnection]? { cache.value?.connections }
    private var callbackURL: String? { cache.value?.callbackURL }
    private var presets: [McpPreset] { cache.value?.presets ?? [] }
    private func presetFor(_ url: String) -> McpPreset? { presets.first { $0.url == url } }

    /// One sheet at a time: switching from a server's details to its OAuth form, or from
    /// the library to a preset's form, replaces it.
    private enum SheetKind: Identifiable {
        case detail(String), form, library
        var id: String {
            switch self {
            case .detail(let id): "detail:\(id)"
            case .form: "form"
            case .library: "library"
            }
        }
    }

    var body: some View {
        Form {
            Section {
                if connections == nil { ProgressView("Loading connections…") }
                else if connections?.isEmpty == true { Text("No connections yet.").foregroundStyle(.secondary) }
                ForEach(connections ?? []) { connection in
                    if let match = presetFor(connection.url) {
                        Button { sheet = .detail(connection.id) } label: {
                            HStack {
                                Label { Text(connection.name) } icon: { ConnectorLogo(id: match.id) }
                                Spacer(minLength: 8)
                                Text(summary(connection)).foregroundStyle(.secondary).lineLimit(1)
                                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
                            }
                            .contentShape(Rectangle())
                        }
                        .foregroundStyle(Color(uiColor: .label))
                    } else {
                        SheetRow(title: connection.name, systemImage: "link", value: summary(connection)) { sheet = .detail(connection.id) }
                    }
                }
                Button("Browse connector library", systemImage: "square.grid.2x2") { sheet = .library }
                    .disabled(presets.isEmpty)
                Button("Add custom server", systemImage: "plus") {
                    if configureID != nil || preset != nil { resetForm() }
                    sheet = .form
                }
            } header: {
                HStack {
                    Text("Servers")
                    InfoButton(title: "Connections", text: "\(notice)\n\n\(supported)")
                }
            }
            if let error, sheet == nil { Section { Text(error).foregroundStyle(.red) } }
        }
        .disabled(busy)
        .refreshable { await refresh() }
        .navigationTitle("Connections")
        .sheet(item: $sheet) { kind in
            switch kind {
            case .detail(let id): detailSheet(id)
            case .form: formSheet
            case .library: librarySheet
            }
        }
        .task(id: scenePhase) { if scenePhase == .active { await refresh() } }
        .onAppear { isVisible = true }
        .onDisappear { isVisible = false; token = ""; clientSecret = ""; browser.cancel() }
    }

    private func authLabel(_ connection: McpConnection) -> String {
        connection.authType == "oauth" ? (connection.authenticated ? "OAuth connected" : "Authorization required")
            : connection.authenticated ? "Bearer token" : "Public access"
    }
    private func summary(_ connection: McpConnection) -> String {
        let state = connection.authType == "oauth" && !connection.authenticated ? "Needs authorization" : "\(connection.tools.filter(\.allowed).count)/\(connection.tools.count) tools"
        return state
    }

    private func detailSheet(_ id: String) -> some View {
        NavigationStack {
            Group {
                if let connection = connections?.first(where: { $0.id == id }) {
                    Form {
                        Section {
                            LabeledContent("Access", value: authLabel(connection))
                            Text(connection.url).font(.footnote).foregroundStyle(.secondary).textSelection(.enabled)
                            if let issuer = connection.oauthIssuer {
                                Text("Issuer: \(issuer)\nRequested scopes: \(connection.oauthScope ?? "")").font(.footnote).foregroundStyle(.secondary).textSelection(.enabled)
                            }
                        }
                        Section {
                            if connection.authType == "oauth" {
                                if connection.oauthConfigured {
                                    HStack {
                                        Button(connection.authenticated ? "Reauthorize" : "Authorize", systemImage: "key") { Task { await authorize(connection.id) } }
                                        Spacer()
                                        InfoButton(title: "Reauthorize", text: "Reauthorizing clears existing tool permissions. Review and enable them again afterward.")
                                    }
                                }
                                Button("Configure OAuth", systemImage: "gearshape") { configure(connection); sheet = .form }
                            }
                            if !connection.tools.isEmpty {
                                Button("Enable all tools", systemImage: "checkmark.circle") { pendingEnableAll = connection }
                                    .disabled(connection.tools.allSatisfy(\.allowed) || (connection.authType == "oauth" && !connection.authenticated))
                            }
                            Button("Refresh tools", systemImage: "arrow.clockwise") { Task { await mutate("/\(connection.id)/refresh", "POST") } }
                        }
                        if !connection.tools.isEmpty {
                            Section("Tools") {
                                if visibleTools(connection).isEmpty { Text("No matches").foregroundStyle(.secondary) }
                                ForEach(visibleTools(connection)) { tool in
                                    Toggle(isOn: Binding(get: { tool.allowed }, set: { allowed in
                                        if allowed { pendingPermission = (connection.id, tool) }
                                        else { Task { await permission(connection.id, tool, false) } }
                                    })) {
                                        HStack(alignment: .firstTextBaseline) {
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(tool.name)
                                                Text(tool.allowed ? "Runs without asking" : "Asks before running").font(.caption).foregroundStyle(.secondary)
                                            }
                                            InfoButton(title: tool.name, text: "\(tool.description)\n\nInput schema\n\(tool.inputSchema.text)")
                                        }
                                    }
                                }
                            }
                        }
                        Section {
                            Button("Disconnect", systemImage: "xmark.circle", role: .destructive) { pendingDisconnect = connection.id }
                        }
                        if let error { Section { Text(error).foregroundStyle(.red) } }
                    }
                    .searchable(text: $toolQuery, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Search tools")
                    .navigationTitle(connection.name)
                } else {
                    ContentUnavailableView("Connection unavailable", systemImage: "link")
                }
            }
            .disabled(busy)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { sheet = nil } } }
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
                Button("Disconnect", role: .destructive) {
                    if let id = pendingDisconnect { Task { if await mutate("/\(id)", "DELETE") { sheet = nil } } }
                }
            } message: { Text("Future calls will be blocked. Actions already started may finish. Historical messages remain private.") }
        }
        .presentationDetents([.large])
    }

    private var formSheet: some View {
        NavigationStack {
            Form {
                if let preset {
                    Section {
                        Label { VStack(alignment: .leading, spacing: 2) { Text(preset.name); Text(preset.description).font(.caption).foregroundStyle(.secondary) } } icon: { ConnectorLogo(id: preset.id) }
                        if let note = preset.note { Text(note).font(.footnote).foregroundStyle(.secondary) }
                    }
                }
                Section {
                    TextField("Name", text: $name).disabled(configureID != nil)
                    TextField("HTTPS endpoint", text: $url).disabled(configureID != nil || preset != nil).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                    Picker("Authentication", selection: $authType) {
                        Text("Public access").tag("none")
                        Text("Bearer token").tag("bearer")
                        Text("OAuth").tag("oauth")
                    }.disabled(configureID != nil || preset != nil)
                    if authType == "bearer" { SecureField(preset == nil ? "Bearer token (optional)" : "Bearer token", text: $token).textInputAutocapitalization(.never).autocorrectionDisabled() }
                } header: {
                    HStack {
                        Text("Server")
                        InfoButton(title: "Supported servers", text: supported)
                    }
                }
                if authType == "oauth" {
                    Section {
                        if callbackURL == nil { Text("OAuth requires a public HTTPS API configuration.").font(.footnote).foregroundStyle(.red) }
                        DisclosureGroup("Advanced (optional)", isExpanded: $advancedOAuth) {
                            TextField("Authorization server (automatic when empty)", text: $issuer).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                            TextField("Scopes (automatic when empty)", text: $scope).textInputAutocapitalization(.never).autocorrectionDisabled()
                            TextField("Client ID (only if required by the provider)", text: $clientID).textInputAutocapitalization(.never).autocorrectionDisabled()
                            SecureField("Client secret (if required)", text: $clientSecret).textInputAutocapitalization(.never).autocorrectionDisabled()
                            if let callbackURL { Text("OAuth redirect URI: \(callbackURL)").font(.footnote).textSelection(.enabled) }
                        }
                    } header: {
                        HStack {
                            Text("OAuth")
                            InfoButton(title: "OAuth", text: "Wildcard discovers the OAuth settings and opens the provider's sign-in page. Authorizing an account does not enable tools. Most servers need no manual settings. If you use your own client credentials, enter their trusted authorization server too. Google requires your own registered Web OAuth client marked for an AI-powered agent and Workspace preview access.")
                        }
                    }
                }
                Section {
                    // Consent covers this text, so it stays visible beside the switch.
                    Text(notice).font(.footnote).foregroundStyle(.secondary)
                    Toggle("I accept these data access and privacy terms", isOn: $consent)
                }
                if let error { Section { Text(error).foregroundStyle(.red) } }
            }
            .disabled(busy)
            .navigationTitle(configureID != nil ? "Configure OAuth" : preset.map { "Connect \($0.name)" } ?? "Add server")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        if configureID != nil || preset != nil { resetForm() }
                        sheet = nil
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(authType == "oauth" ? "Continue" : "Connect") {
                        Task {
                            await connect()
                            if error == nil { sheet = nil }
                        }
                    }
                    .disabled(busy || !consent || name.trimmingCharacters(in: .whitespaces).isEmpty || url.isEmpty || (preset?.authType == "bearer" && token.isEmpty))
                }
            }
        }
        .presentationDetents([.large])
    }

    private var librarySheet: some View {
        let query = libraryQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        let matches = presets.filter { query.isEmpty || "\($0.name) \($0.description) \($0.category)".localizedCaseInsensitiveContains(query) }
        let categories = matches.reduce(into: [String]()) { if !$0.contains($1.category) { $0.append($1.category) } }
        let connected = Set((connections ?? []).map(\.url))
        return NavigationStack {
            List {
                if matches.isEmpty { Text("No matches").foregroundStyle(.secondary) }
                ForEach(categories, id: \.self) { category in
                    Section(category) {
                        ForEach(matches.filter { $0.category == category }) { entry in
                            Button { choose(entry) } label: {
                                HStack {
                                    Label {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(entry.name)
                                            Text(entry.description).font(.caption).foregroundStyle(.secondary)
                                        }
                                    } icon: { ConnectorLogo(id: entry.id) }
                                    Spacer(minLength: 8)
                                    if connected.contains(entry.url) { Text("Connected").font(.caption.weight(.semibold)).foregroundStyle(.green) }
                                    Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
                                }
                                .contentShape(Rectangle())
                            }
                            .foregroundStyle(Color(uiColor: .label))
                        }
                    }
                }
            }
            .searchable(text: $libraryQuery, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search connectors")
            .navigationTitle("Connector library")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { InfoButton(title: "Connector library", text: libraryInfo) }
                ToolbarItem(placement: .confirmationAction) { Button("Done") { libraryQuery = ""; sheet = nil } }
            }
        }
        .presentationDetents([.large])
    }

    private func visibleTools(_ connection: McpConnection) -> [McpTool] {
        let query = toolQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        return connection.tools.filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) || $0.description.localizedCaseInsensitiveContains(query) }
    }
    private func refresh() async {
        do {
            try await cache.refresh { try await auth.withSession { api, token in try await api.mcpCatalog(contactID: contactID, token: token) } }
            error = nil
        } catch AuthAPI.Failure.notFound { cache.invalidate(remove: true); error = "This contact is no longer available." }
        catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }
    @discardableResult private func mutate(_ suffix: String, _ method: String, _ body: [String: Any]? = nil) async -> Bool {
        guard !busy else { return false }
        busy = true; error = nil; cache.invalidate(); contacts.mcpAccessSnapshots.invalidateAll()
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
    private func resetForm() {
        configureID = nil; preset = nil
        clientID = ""; clientSecret = ""; token = ""; name = ""; url = ""; authType = "none"; issuer = ""; scope = ""; advancedOAuth = false
    }
    /// A preset prefills the form and locks its endpoint and access mode.
    private func choose(_ entry: McpPreset) {
        resetForm()
        preset = entry; name = entry.name; url = entry.url; authType = entry.authType
        issuer = entry.issuer ?? ""; scope = entry.scope ?? ""; advancedOAuth = entry.ownClient == true
        libraryQuery = ""; sheet = .form
    }
    private func configure(_ connection: McpConnection) {
        resetForm()
        configureID = connection.id; name = connection.name; url = connection.url; authType = "oauth"
        // Presets without automatic client registration need their pinned issuer and scopes again.
        preset = presetFor(connection.url)
        if let preset, preset.ownClient == true {
            advancedOAuth = true
            issuer = preset.issuer ?? ""; scope = preset.scope ?? ""
        }
    }
    private func connect() async {
        guard !busy else { return }
        busy = true; error = nil; cache.invalidate(); contacts.mcpAccessSnapshots.invalidateAll()
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
            } else { resetForm(); consent = false }
            cache.invalidate(); await refresh()
        } catch is CancellationError { cache.invalidate(); await refresh() }
        catch { clientSecret = ""; cache.invalidate(); await refresh(); self.error = error.localizedDescription }
    }
    private func authorize(_ id: String) async {
        guard !busy else { return }
        busy = true; error = nil; cache.invalidate(); contacts.mcpAccessSnapshots.invalidateAll()
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
        resetForm(); consent = false
    }
    private func permission(_ connection: String, _ tool: McpTool, _ allowed: Bool) async {
        await mutate("/\(connection)", "PATCH", ["fingerprint": tool.fingerprint, "allowed": allowed])
        pendingPermission = nil
    }
}

struct McpAccess: Decodable, Sendable, Identifiable {
    let id: String
    let name: String
    let granted: Int
    let agentID: String?
    let agentName: String?
    var identity: String { "\(agentID ?? ""):\(id)" }
}
private struct McpAccessEnvelope: Decodable { let connections: [McpAccess] }

struct McpAccessView: View {
    let path: String
    let group: Bool
    let cache: NavigationSnapshot<[McpAccess]>
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.scenePhase) private var scenePhase
    @State private var busy = false
    @State private var error: String?
    @State private var pending: McpAccess?
    var body: some View {
        Form {
            Section {
                if cache.value == nil { ProgressView("Loading connections…") }
                else if cache.value?.isEmpty == true {
                    Text(group ? "Assign a connector to one of your bots in its contact details first." : "No account connections yet.")
                        .foregroundStyle(.secondary)
                }
                ForEach(cache.value ?? [], id: \.identity) { item in
                    Toggle(isOn: Binding(get: { item.granted != 0 }, set: { _ in
                        if item.granted == 0 { pending = item }
                        else { Task { await save(item) } }
                    })) {
                        Label {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.name)
                                if let agentName = item.agentName { Text(agentName).font(.caption).foregroundStyle(.secondary) }
                            }
                        } icon: { Image(systemName: "link") }
                    }
                }
            } header: {
                HStack {
                    Text("Access")
                    InfoButton(title: "Connections", text: group
                        ? "Grant your bots access to their assigned connectors in this group. Other members can request tools; responses are visible to everyone. Only the bot owner who added it can grant access."
                        : "Configure connectors once in Account, then grant this contact access. Tool approvals are managed in Account.")
                }
            }
            if let error { Section { Text(error).foregroundStyle(.red) } }
            Section {
                NavigationLink { McpConnectionsView(contactID: "account", cache: contacts.mcpSnapshots.store(for: "account")) }
                    label: { Label("Manage account connections", systemImage: "gearshape") }
            }
        }
        .disabled(busy)
        .refreshable { await refresh() }
        .navigationTitle("Connections")
        .task(id: scenePhase) { if scenePhase == .active { await refresh() } }
        .alert("Grant connector access?", isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } })) {
            Button("Allow") { if let item = pending { Task { await save(item) } }; pending = nil }
            Button("Cancel", role: .cancel) { pending = nil }
        } message: {
            if let item = pending {
                Text(group
                     ? "Allow \(item.agentName ?? "this bot") to use \(item.name) in this group? Any human member can request enabled tools, including reads, changes and sends. Responses may expose external data to everyone in the group. This group will always use Standard. Memory stays available within this group and is never shared with other chats, even after revocation."
                     : "Allow this contact to use \(item.name)? It can use all tools enabled in Account without asking again. This private chat will always use Standard. Memory stays available within this chat and is never shared with other chats, even after revocation. Group posting and schedule creation/editing from this private chat will be disabled.")
            }
        }
    }
    private func refresh() async {
        do {
            try await cache.refresh {
                try await auth.withSession { api, token in
                    let (data, _) = try await api.send(path: path, token: token)
                    return try JSONDecoder().decode(McpAccessEnvelope.self, from: data).connections
                }
            }
            error = nil
        } catch AuthAPI.Failure.notFound { cache.invalidate(remove: true); error = "This resource is no longer available." }
        catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }
    private func save(_ item: McpAccess) async {
        guard !busy else { return }
        busy = true; error = nil; contacts.mcpAccessSnapshots.invalidateAll()
        defer { busy = false }
        do {
            var body: [String: Any] = ["allowed": item.granted == 0]
            if let agentID = item.agentID { body["agentID"] = agentID }
            let data = try JSONSerialization.data(withJSONObject: body)
            _ = try await auth.withSession { api, token in
                try await api.send(path: "\(path)/\(item.id)", method: "PATCH", body: data, token: token)
            }
            await refresh()
        } catch AuthAPI.Failure.notFound { cache.invalidate(remove: true); error = "This resource is no longer available." }
        catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }
}

/// A connector library preset's brand logo on a fixed light tile, so dark marks stay
/// legible in dark mode. Logos come from scripts/export-connector-logos.mjs; unknown IDs
/// fall back to the link symbol.
struct ConnectorLogo: View {
    let id: String
    var body: some View {
        Group {
            if let logo = UIImage(named: "ConnectorLogos/\(id)") {
                Image(uiImage: logo).resizable().scaledToFit().frame(width: 20, height: 20)
            } else {
                Image(systemName: "link").foregroundStyle(Color(white: 0.12))
            }
        }
        .frame(width: 30, height: 30)
        .background(.white, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).strokeBorder(Color(uiColor: .separator)))
        .accessibilityHidden(true)
    }
}
