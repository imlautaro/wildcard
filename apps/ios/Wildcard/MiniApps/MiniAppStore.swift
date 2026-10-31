import Foundation
import Observation

/// Session-owned mini app lists and resolved views, matching the web composable.
/// Resolved views hold connector data in memory only and are never written to disk.
/// Lists and views are keyed by `base`: `contacts/<id>` (private apps) or `groups/<id>` (shared group apps).
@MainActor @Observable
final class MiniAppStore {
    /// Private apps live with the contacts; group apps with the group's conversation cache.
    static func store(for base: String, contacts: ContactsStore, groups: GroupsStore) -> MiniAppStore {
        base.hasPrefix("groups/") ? groups.conversations.miniApps : contacts.miniApps
    }
    private(set) var apps: [String: [MiniApp]] = [:]
    private(set) var errors: [String: String] = [:]
    private(set) var views: [String: MiniAppResolution] = [:]
    private(set) var viewErrors: [String: String] = [:]
    private(set) var inputs: [String: [String: String]] = [:]
    private(set) var resolving: Set<String> = []
    /// A tap runs a local action (with a composer's field, if any), or edits state directly from a bound component.
    struct PendingTap: Sendable { let id: UUID; let actionID: String?; let updates: [MiniAppUpdate]; var fields: [String: MiniAppFieldValue] = [:] }
    /// Local taps shown immediately and sent in order; the server's view stays authoritative.
    private(set) var pendingTaps: [String: [PendingTap]] = [:]
    @ObservationIgnored private var tapWorkers: Set<String> = []
    @ObservationIgnored private var listLoaded: [String: Date] = [:]
    @ObservationIgnored private var viewLoaded: [String: Date] = [:]
    @ObservationIgnored private var listRequests: [String: Task<Void, Never>] = [:]
    @ObservationIgnored private var viewRevisions: [String: Int] = [:]
    @ObservationIgnored private var generation = 0

    func app(base: String, id: String) -> MiniApp? { apps[base]?.first { $0.id == id } }
    func apps(base: String, turnID: String) -> [MiniApp] { (apps[base] ?? []).filter { $0.turnID == turnID } }
    func apps(base: String, replyID: String) -> [MiniApp] { (apps[base] ?? []).filter { $0.replyID == replyID } }

    func refresh(base: String, using auth: AuthStore, force: Bool = false) async {
        if let task = listRequests[base] { await task.value; return }
        if !force, let date = listLoaded[base], Date.now.timeIntervalSince(date) < 5 { return }
        let current = generation
        let task = Task { @MainActor in
            do {
                let values = try await auth.withSession { api, token in try await api.miniApps(base: base, token: token) }
                guard generation == current, !Task.isCancelled else { return }
                if apps.count >= 20, apps[base] == nil, let oldest = listLoaded.min(by: { $0.value < $1.value })?.key { forget(base: oldest) }
                apps[base] = values; listLoaded[base] = .now; errors[base] = nil
            } catch is CancellationError { }
            catch {
                guard generation == current else { return }
                listLoaded[base] = .now
                if AuthAPI.isTransient(error) && apps[base] != nil { return }
                if case AuthAPI.Failure.notFound = error { apps[base] = [] }
                errors[base] = error.localizedDescription
            }
        }
        listRequests[base] = task
        await task.value
        if generation == current { listRequests.removeValue(forKey: base) }
    }

    private func replace(_ app: MiniApp?, id: String, base: String) {
        if let app { apps[base] = (apps[base] ?? []).map { $0.id == id ? app : $0 } }
        else { apps[base]?.removeAll { $0.id == id } }
        dropView(key: "\(base)/\(id)")
    }
    func approve(_ app: MiniApp, base: String, allowed: Bool, using auth: AuthStore) async throws {
        let updated = try await auth.withSession { api, token in
            try await api.approveMiniApp(base: base, appID: app.id, revision: app.revision, allowed: allowed, token: token)
        }
        replace(updated, id: app.id, base: base)
    }
    func delete(_ app: MiniApp, base: String, using auth: AuthStore) async throws {
        try await auth.withSession { api, token in try await api.deleteMiniApp(base: base, appID: app.id, token: token) }
        replace(nil, id: app.id, base: base)
    }

    /// Each load re-runs the app's remote reads, so a view is reused for a minute unless refreshed.
    func resolve(_ app: MiniApp, base: String, inputs changed: [String: String]? = nil, force: Bool = false, using auth: AuthStore) async {
        let key = "\(base)/\(app.id)"
        let inputsChanged = changed != nil && changed != inputs[key]
        if resolving.contains(key) && !inputsChanged { return }
        if !force, !inputsChanged, views[key]?.revision == app.revision, let date = viewLoaded[key], Date.now.timeIntervalSince(date) < 60 { return }
        if let changed { inputs[key] = changed }
        let revision = (viewRevisions[key] ?? 0) + 1
        viewRevisions[key] = revision
        resolving.insert(key)
        defer { if viewRevisions[key] == revision { resolving.remove(key) } }
        let current = generation
        do {
            let value = try await auth.withSession { [inputs] api, token in
                try await api.resolveMiniApp(base: base, appID: app.id, inputs: inputs[key] ?? [:], token: token)
            }
            guard generation == current, viewRevisions[key] == revision else { return }
            if views.count >= 16, views[key] == nil, let oldest = viewLoaded.min(by: { $0.value < $1.value })?.key { dropView(key: oldest) }
            views[key] = value; inputs[key] = value.inputs; viewLoaded[key] = .now; viewErrors[key] = nil
        } catch is CancellationError { }
        catch {
            guard generation == current, viewRevisions[key] == revision else { return }
            viewLoaded[key] = .now
            if AuthAPI.isTransient(error) && views[key] != nil { return }
            if case AuthAPI.Failure.reviewRequired = error { views[key] = nil; await refresh(base: base, using: auth, force: true) }
            if case AuthAPI.Failure.notFound = error { views[key] = nil; await refresh(base: base, using: auth, force: true) }
            viewErrors[key] = error.localizedDescription
        }
    }

    /// The caller keeps `executionID` for one confirmed submission so a retry never runs twice.
    func run(_ app: MiniApp, base: String, actionID: String, executionID: UUID, fields: [String: MiniAppFieldValue], row: MiniAppRowRef? = nil, using auth: AuthStore) async throws -> String {
        let key = "\(base)/\(app.id)", revision = viewRevisions[key], current = generation
        let outcome = try await auth.withSession { [inputs] api, token in
            try await api.runMiniAppAction(base: base, appID: app.id, actionID: actionID, executionID: executionID,
                                           revision: app.revision, inputs: inputs[key] ?? [:], fields: fields, row: row, token: token)
        }
        // State-only apps return the updated view with the action, so a tap needs no extra load.
        if let resolution = outcome.resolution {
            if generation == current, viewRevisions[key] == revision { views[key] = resolution; viewLoaded[key] = .now; viewErrors[key] = nil }
        } else if outcome.status == "completed" { await resolve(app, base: base, force: true, using: auth) }
        return outcome.status
    }

    /// Saved state plus taps not yet confirmed, in tap order.
    func displayState(key: String) -> [String: MiniAppStateValue] {
        (pendingTaps[key] ?? []).reduce(views[key]?.state ?? [:]) { MiniAppUpdate.apply($1.updates, to: $0) }
    }

    func tap(_ app: MiniApp, base: String, actionID: String?, updates: [MiniAppUpdate], fields: [String: MiniAppFieldValue] = [:], using auth: AuthStore) {
        let key = "\(base)/\(app.id)"
        guard (pendingTaps[key]?.count ?? 0) < 20 else { return }
        pendingTaps[key, default: []].append(PendingTap(id: UUID(), actionID: actionID, updates: updates, fields: fields))
        guard !tapWorkers.contains(key) else { return }
        tapWorkers.insert(key)
        let current = generation
        Task { @MainActor in
            defer { if generation == current { tapWorkers.remove(key) } }
            var failures = 0
            while generation == current, let next = pendingTaps[key]?.first {
                do {
                    let outcome = try await auth.withSession { [inputs] api, token in
                        if let actionID = next.actionID {
                            try await api.runMiniAppAction(base: base, appID: app.id, actionID: actionID, executionID: next.id,
                                                           revision: app.revision, inputs: inputs[key] ?? [:], fields: next.fields, token: token)
                        } else {
                            try await api.editMiniAppState(base: base, appID: app.id, executionID: next.id, revision: app.revision, inputs: inputs[key] ?? [:], update: next.updates[0], token: token)
                        }
                    }
                    guard generation == current, pendingTaps[key]?.first?.id == next.id else { return }
                    if let resolution = outcome.resolution { views[key] = resolution; viewLoaded[key] = .now; viewErrors[key] = nil }
                    pendingTaps[key]?.removeFirst()
                    failures = 0
                    if outcome.resolution == nil, pendingTaps[key]?.isEmpty != false { await resolve(app, base: base, force: true, using: auth) }
                } catch is CancellationError { return }
                catch {
                    guard generation == current else { return }
                    failures += 1
                    // Retrying reuses the tap's execution ID, so the server never applies it twice.
                    if AuthAPI.isTransient(error) && failures < 3 { try? await Task.sleep(for: .seconds(1)); continue }
                    pendingTaps[key] = nil; viewErrors[key] = error.localizedDescription
                    await resolve(app, base: base, force: true, using: auth)
                    return
                }
            }
        }
    }

    private func dropView(key: String) {
        pendingTaps.removeValue(forKey: key)
        viewRevisions[key] = (viewRevisions[key] ?? 0) + 1
        views.removeValue(forKey: key); viewErrors.removeValue(forKey: key); inputs.removeValue(forKey: key)
        viewLoaded.removeValue(forKey: key); resolving.remove(key)
    }
    func forget(base: String) {
        listRequests.removeValue(forKey: base)?.cancel()
        apps.removeValue(forKey: base); errors.removeValue(forKey: base); listLoaded.removeValue(forKey: base)
        for key in Set(views.keys).union(inputs.keys) where key.hasPrefix("\(base)/") { dropView(key: key) }
    }
    func removeAll() {
        generation += 1
        for task in listRequests.values { task.cancel() }
        listRequests.removeAll(); apps.removeAll(); errors.removeAll(); listLoaded.removeAll(); tapWorkers.removeAll()
        for key in Set(views.keys).union(inputs.keys) { dropView(key: key) }
    }
}
