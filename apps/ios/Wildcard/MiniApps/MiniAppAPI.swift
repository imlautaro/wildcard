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

/// A saved state value of a mini app; lists hold flat objects.
indirect enum MiniAppStateValue: Codable, Hashable, Sendable {
    case bool(Bool), number(Double), text(String), list([[String: MiniAppStateValue]])
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else if let value = try? container.decode(String.self) { self = .text(value) }
        else { self = .list(try container.decode([[String: MiniAppStateValue]].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .bool(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .text(let value): try container.encode(value)
        case .list(let value): try container.encode(value)
        }
    }
    /// Same display conversion as the server's resolved values.
    var scalar: MiniAppScalar {
        switch self {
        case .number(let value): .number(value)
        case .text(let value): Double(value).map { .number($0) } ?? .text(value)
        case .bool(let value): .text(value ? "true" : "false")
        case .list(let items): .number(Double(items.count))
        }
    }
    var label: String {
        switch self {
        case .number(let value): value.formatted(.number.grouping(.never))
        case .text(let value): value
        case .bool(let value): value ? "true" : "false"
        case .list(let items): "\(items.count)"
        }
    }
}
/// A literal state change the client may apply before the server confirms it.
struct MiniAppUpdate: Codable, Hashable, Sendable {
    let state: String
    let op: String
    var value: MiniAppStateValue? = nil
    var index: Int? = nil
    var field: String? = nil

    /// Mirrors the server's `applyUpdates` for literal values; the server stays authoritative.
    static func apply(_ updates: [MiniAppUpdate], to values: [String: MiniAppStateValue]) -> [String: MiniAppStateValue] {
        var next = values
        for update in updates {
            guard let current = next[update.state] else { continue }
            switch (update.op, current) {
            case ("toggle", .bool(let flag)): next[update.state] = .bool(!flag)
            case ("increment", .number(let number)), ("decrement", .number(let number)):
                var amount = 1.0
                switch update.value {
                case .number(let n)?: amount = n
                case .text(let t)?: guard let n = Double(t) else { continue }; amount = n
                case .bool?, .list?: continue
                case nil: break
                }
                next[update.state] = .number(update.op == "increment" ? number + amount : number - amount)
            case ("set", .number):
                if case .number(let n)? = update.value { next[update.state] = .number(n) }
                else if case .text(let t)? = update.value, let n = Double(t) { next[update.state] = .number(n) }
            case ("set", .text): next[update.state] = .text(update.value?.label ?? "")
            case ("set", .bool): if case .bool(let b)? = update.value { next[update.state] = .bool(b) }
            case ("clear", .list): next[update.state] = .list([])
            case ("set_items", .list(let items)):
                guard let field = update.field, let value = update.value else { continue }
                next[update.state] = .list(items.map { item in var item = item; item[field] = value; return item })
            case ("toggle_item", .list(var items)):
                guard let index = update.index, let field = update.field, items.indices.contains(index) else { continue }
                items[index][field] = .bool(items[index][field] != .bool(true))
                next[update.state] = .list(items)
            case ("remove_item", .list(var items)):
                guard let index = update.index, items.indices.contains(index) else { continue }
                items.remove(at: index)
                next[update.state] = .list(items)
            default: continue
            }
        }
        return next
    }
}

struct MiniAppOption: Decodable, Hashable, Sendable { let value: String; let label: String }
/// Checklist paths let the client re-derive rows from saved state for instant taps.
struct MiniAppChecklist: Decodable, Hashable, Sendable {
    struct Row: Decodable, Hashable, Sendable { let title: String; let subtitle: String?; let value: MiniAppScalar?; let done: Bool? }
    let state: String
    let title: String
    let subtitle: String?
    let value: String?
    let done: String?
    let removable: Bool
    let items: [Row]
    let format: String
    let currency: String?
    let empty: String

    func rows(from state: [String: MiniAppStateValue]) -> [Row] {
        guard case .list(let items)? = state[self.state] else { return self.items }
        return items.map { item in
            Row(title: item[title]?.label ?? "—", subtitle: subtitle.flatMap { item[$0]?.label }.flatMap { $0.isEmpty ? nil : $0 }, value: value.flatMap { item[$0]?.scalar },
                done: done.map { item[$0] == .bool(true) })
        }
    }
}

/// The server-resolved component tree; the renderer never evaluates app logic.
indirect enum MiniAppComponent: Decodable, Hashable, Sendable {
    case section(title: String?, children: [MiniAppComponent])
    case stat(label: String, value: MiniAppScalar?, format: String, currency: String?, caption: String?, state: String?)
    case progress(label: String, value: Double?, goal: Double, format: String, currency: String?, caption: String?, state: String?)
    case list(items: [MiniAppListRow], format: String, currency: String?, empty: String)
    case checklist(MiniAppChecklist)
    case chart(kind: String, title: String?, points: [MiniAppPoint], format: String, currency: String?)
    case text(String, style: String)
    case toggle(label: String, state: String, value: Bool)
    case choice(label: String, state: String, value: String, options: [MiniAppOption])
    case input(label: String, state: String, value: MiniAppScalar, number: Bool, placeholder: String?)
    case timer(label: String, seconds: Int)
    case action(id: String, local: Bool, label: String, confirm: String?, destructive: Bool, fields: [MiniAppField], updates: [MiniAppUpdate]?)
    case notice(code: String)
    case unsupported

    private enum Keys: String, CodingKey { case type, title, children, label, value, format, currency, caption, items, empty, kind, points, text, style, id, confirm, fields, code, state, updates, goal, options, placeholder, seconds }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        let format = try c.decodeIfPresent(String.self, forKey: .format) ?? "text"
        let currency = try c.decodeIfPresent(String.self, forKey: .currency)
        let caption = try c.decodeIfPresent(String.self, forKey: .caption)
        switch try c.decode(String.self, forKey: .type) {
        case "section": self = .section(title: try c.decodeIfPresent(String.self, forKey: .title), children: try c.decode([MiniAppComponent].self, forKey: .children))
        case "stat": self = .stat(label: try c.decode(String.self, forKey: .label), value: try c.decodeIfPresent(MiniAppScalar.self, forKey: .value), format: format, currency: currency, caption: caption,
                                  state: try c.decodeIfPresent(String.self, forKey: .state))
        case "progress": self = .progress(label: try c.decode(String.self, forKey: .label), value: try c.decodeIfPresent(Double.self, forKey: .value), goal: try c.decode(Double.self, forKey: .goal),
                                          format: format, currency: currency, caption: caption, state: try c.decodeIfPresent(String.self, forKey: .state))
        case "list": self = .list(items: try c.decode([MiniAppListRow].self, forKey: .items), format: format, currency: currency, empty: try c.decode(String.self, forKey: .empty))
        case "checklist": self = .checklist(try MiniAppChecklist(from: decoder))
        case "chart": self = .chart(kind: try c.decode(String.self, forKey: .kind), title: try c.decodeIfPresent(String.self, forKey: .title), points: try c.decode([MiniAppPoint].self, forKey: .points), format: format, currency: currency)
        case "text": self = .text(try c.decode(String.self, forKey: .text), style: try c.decode(String.self, forKey: .style))
        case "toggle": self = .toggle(label: try c.decode(String.self, forKey: .label), state: try c.decode(String.self, forKey: .state), value: try c.decode(Bool.self, forKey: .value))
        case "choice": self = .choice(label: try c.decode(String.self, forKey: .label), state: try c.decode(String.self, forKey: .state), value: try c.decode(String.self, forKey: .value),
                                      options: try c.decode([MiniAppOption].self, forKey: .options))
        case "input": self = .input(label: try c.decode(String.self, forKey: .label), state: try c.decode(String.self, forKey: .state), value: try c.decode(MiniAppScalar.self, forKey: .value),
                                    number: try c.decode(String.self, forKey: .kind) == "number", placeholder: try c.decodeIfPresent(String.self, forKey: .placeholder))
        case "timer": self = .timer(label: try c.decode(String.self, forKey: .label), seconds: try c.decode(Int.self, forKey: .seconds))
        case "action": self = .action(id: try c.decode(String.self, forKey: .id), local: try c.decodeIfPresent(String.self, forKey: .kind) == "state",
                                      label: try c.decode(String.self, forKey: .label), confirm: try c.decodeIfPresent(String.self, forKey: .confirm),
                                      destructive: try c.decode(String.self, forKey: .style) == "destructive", fields: try c.decode([MiniAppField].self, forKey: .fields),
                                      updates: try c.decodeIfPresent([MiniAppUpdate].self, forKey: .updates))
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
    let state: [String: MiniAppStateValue]?
    /// Whether the view includes connector data (and so can be stale).
    let remote: Bool?
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
    struct MiniAppOutcome: Decodable, Sendable { let status: String; let resolution: MiniAppResolution? }
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
    /// A direct edit from a component bound to state (toggle, choice, input, checklist row).
    func editMiniAppState(contactID: String, appID: String, executionID: UUID, revision: Int, inputs: [String: String], update: MiniAppUpdate, token: String) async throws -> MiniAppOutcome {
        struct Input: Encodable { let executionID: String; let revision: Int; let inputs: [String: String]; let timeZone: String; let update: MiniAppUpdate }
        let body = try JSONEncoder().encode(Input(executionID: executionID.uuidString.lowercased(), revision: revision, inputs: inputs, timeZone: TimeZone.current.identifier, update: update))
        let (data, _) = try await send(path: "contacts/\(contactID)/mini-apps/\(appID)/state", method: "POST", body: body, token: token, timeout: 60)
        return try JSONDecoder().decode(MiniAppOutcome.self, from: data)
    }
    func runMiniAppAction(contactID: String, appID: String, actionID: String, executionID: UUID, revision: Int, inputs: [String: String],
                          fields: [String: MiniAppFieldValue], token: String) async throws -> MiniAppOutcome {
        struct Input: Encodable { let executionID: String; let revision: Int; let inputs: [String: String]; let fields: [String: MiniAppFieldValue]; let timeZone: String }
        let body = try JSONEncoder().encode(Input(executionID: executionID.uuidString.lowercased(), revision: revision, inputs: inputs, fields: fields, timeZone: TimeZone.current.identifier))
        let (data, _) = try await send(path: "contacts/\(contactID)/mini-apps/\(appID)/actions/\(actionID)", method: "POST", body: body, token: token, timeout: 60)
        return try JSONDecoder().decode(MiniAppOutcome.self, from: data)
    }
}
