import Foundation

struct MiniAppInput: Decodable, Hashable, Sendable {
    struct Option: Decodable, Hashable, Sendable { let value: String; let label: String }
    let id: String
    let type: String
    let label: String
    let options: [Option]?
    let `default`: String
}
struct MiniAppTool: Decodable, Hashable, Sendable {
    let connectionID: String
    let connectionName: String
    let toolName: String
    let role: String
}
struct MiniApp: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    let turnID: String?
    let revision: Int
    let title: String
    let subtitle: String?
    let icon: String
    let status: String
    let inputs: [MiniAppInput]
    let tools: [MiniAppTool]
    let createdAt: Double
    let updatedAt: Double
    var isEnabled: Bool { status == "enabled" }
    /// SF Symbols for the server's closed icon catalog.
    var symbol: String {
        ["chart": "chart.bar.fill", "list": "list.bullet", "money": "banknote.fill", "calendar": "calendar", "cart": "cart.fill",
         "check": "checkmark.circle.fill", "clock": "clock.fill", "star": "star.fill", "bolt": "bolt.fill", "folder": "folder.fill"][icon] ?? "chart.bar.fill"
    }
}
struct MiniAppField: Decodable, Hashable, Sendable {
    let id: String
    let label: String
    let kind: String
    let required: Bool
}
struct MiniAppListRow: Decodable, Hashable, Sendable { let title: String; let subtitle: String?; let value: MiniAppScalar? }
struct MiniAppPoint: Decodable, Hashable, Sendable { let x: String; let y: Double }

enum MiniAppScalar: Decodable, Hashable, Sendable {
    case number(Double), text(String)
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let number = try? container.decode(Double.self) { self = .number(number) } else { self = .text(try container.decode(String.self)) }
    }
}

/// The server-resolved component tree; the renderer never evaluates app logic.
indirect enum MiniAppComponent: Decodable, Hashable, Sendable {
    case section(title: String?, children: [MiniAppComponent])
    case stat(label: String, value: MiniAppScalar?, format: String, currency: String?, caption: String?)
    case list(items: [MiniAppListRow], format: String, currency: String?, empty: String)
    case chart(kind: String, title: String?, points: [MiniAppPoint], format: String, currency: String?)
    case text(String, style: String)
    case action(id: String, label: String, confirm: String, destructive: Bool, fields: [MiniAppField])
    case notice(code: String)
    case unsupported

    private enum Keys: String, CodingKey { case type, title, children, label, value, format, currency, caption, items, empty, kind, points, text, style, id, confirm, fields, code }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        let format = try c.decodeIfPresent(String.self, forKey: .format) ?? "text"
        let currency = try c.decodeIfPresent(String.self, forKey: .currency)
        switch try c.decode(String.self, forKey: .type) {
        case "section": self = .section(title: try c.decodeIfPresent(String.self, forKey: .title), children: try c.decode([MiniAppComponent].self, forKey: .children))
        case "stat": self = .stat(label: try c.decode(String.self, forKey: .label), value: try c.decodeIfPresent(MiniAppScalar.self, forKey: .value), format: format, currency: currency, caption: try c.decodeIfPresent(String.self, forKey: .caption))
        case "list": self = .list(items: try c.decode([MiniAppListRow].self, forKey: .items), format: format, currency: currency, empty: try c.decode(String.self, forKey: .empty))
        case "chart": self = .chart(kind: try c.decode(String.self, forKey: .kind), title: try c.decodeIfPresent(String.self, forKey: .title), points: try c.decode([MiniAppPoint].self, forKey: .points), format: format, currency: currency)
        case "text": self = .text(try c.decode(String.self, forKey: .text), style: try c.decode(String.self, forKey: .style))
        case "action": self = .action(id: try c.decode(String.self, forKey: .id), label: try c.decode(String.self, forKey: .label), confirm: try c.decode(String.self, forKey: .confirm),
                                      destructive: try c.decode(String.self, forKey: .style) == "destructive", fields: try c.decode([MiniAppField].self, forKey: .fields))
        case "notice": self = .notice(code: try c.decode(String.self, forKey: .code))
        default: self = .unsupported
        }
    }
}
struct MiniAppResolution: Decodable, Sendable {
    let revision: Int
    let inputs: [String: String]
    let resolvedAt: Double
    let view: [MiniAppComponent]
}
enum MiniAppFieldValue: Encodable, Hashable, Sendable {
    case text(String), number(Double), toggle(Bool)
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .text(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .toggle(let value): try container.encode(value)
        }
    }
}

extension AuthAPI {
    private struct ListEnvelope: Decodable { let miniApps: [MiniApp] }
    private struct AppEnvelope: Decodable { let miniApp: MiniApp }
    private struct Outcome: Decodable { let status: String }
    func miniApps(contactID: String, token: String) async throws -> [MiniApp] {
        let (data, _) = try await send(path: "contacts/\(contactID)/mini-apps", token: token)
        return try JSONDecoder().decode(ListEnvelope.self, from: data).miniApps
    }
    func approveMiniApp(contactID: String, appID: String, revision: Int, allowed: Bool, token: String) async throws -> MiniApp {
        struct Input: Encodable { let revision: Int; let allowed: Bool }
        let (data, _) = try await send(path: "contacts/\(contactID)/mini-apps/\(appID)/approval", method: "POST", body: try JSONEncoder().encode(Input(revision: revision, allowed: allowed)), token: token)
        return try JSONDecoder().decode(AppEnvelope.self, from: data).miniApp
    }
    func deleteMiniApp(contactID: String, appID: String, token: String) async throws {
        _ = try await send(path: "contacts/\(contactID)/mini-apps/\(appID)", method: "DELETE", token: token)
    }
    func resolveMiniApp(contactID: String, appID: String, inputs: [String: String], token: String) async throws -> MiniAppResolution {
        struct Input: Encodable { let inputs: [String: String]; let timeZone: String }
        let body = try JSONEncoder().encode(Input(inputs: inputs, timeZone: TimeZone.current.identifier))
        let (data, _) = try await send(path: "contacts/\(contactID)/mini-apps/\(appID)/resolve", method: "POST", body: body, token: token, timeout: 60)
        return try JSONDecoder().decode(MiniAppResolution.self, from: data)
    }
    func runMiniAppAction(contactID: String, appID: String, actionID: String, executionID: UUID, revision: Int, inputs: [String: String],
                          fields: [String: MiniAppFieldValue], token: String) async throws -> String {
        struct Input: Encodable { let executionID: String; let revision: Int; let inputs: [String: String]; let fields: [String: MiniAppFieldValue]; let timeZone: String }
        let body = try JSONEncoder().encode(Input(executionID: executionID.uuidString.lowercased(), revision: revision, inputs: inputs, fields: fields, timeZone: TimeZone.current.identifier))
        let (data, _) = try await send(path: "contacts/\(contactID)/mini-apps/\(appID)/actions/\(actionID)", method: "POST", body: body, token: token, timeout: 60)
        return try JSONDecoder().decode(Outcome.self, from: data).status
    }
}
