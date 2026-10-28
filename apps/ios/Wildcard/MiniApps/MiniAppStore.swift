import Foundation
import Observation

/// Session-owned mini app lists and resolved views, matching the web composable.
/// Resolved views hold connector data in memory only and are never written to disk.
@MainActor @Observable
final class MiniAppStore {
    private(set) var apps: [String: [MiniApp]] = [:]
    private(set) var errors: [String: String] = [:]
    private(set) var views: [String: MiniAppResolution] = [:]
    private(set) var viewErrors: [String: String] = [:]
    private(set) var inputs: [String: [String: String]] = [:]
    private(set) var resolving: Set<String> = []
    /// A tap runs a local action, or edits state directly from a bound component.
    struct PendingTap: Sendable { let id: UUID; let actionID: String?; let updates: [MiniAppUpdate] }
    /// Local taps shown immediately and sent in order; the server's view stays authoritative.
    private(set) var pendingTaps: [String: [PendingTap]] = [:]
    @ObservationIgnored private var tapWorkers: Set<String> = []
    @ObservationIgnored private var listLoaded: [String: Date] = [:]
    @ObservationIgnored private var viewLoaded: [String: Date] = [:]
    @ObservationIgnored private var listRequests: [String: Task<Void, Never>] = [:]
    @ObservationIgnored private var viewRevisions: [String: Int] = [:]
    @ObservationIgnored private var generation = 0

    func app(contactID: String, id: String) -> MiniApp? { apps[contactID]?.first { $0.id == id } }
    func apps(contactID: String, turnID: String) -> [MiniApp] { (apps[contactID] ?? []).filter { $0.turnID == turnID } }

    func refresh(contactID: String, using auth: AuthStore, force: Bool = false) async {
        if let task = listRequests[contactID] { await task.value; return }
        if !force, let date = listLoaded[contactID], Date.now.timeIntervalSince(date) < 5 { return }
        let current = generation
        let task = Task { @MainActor in
            do {
                let values = try await auth.withSession { api, token in try await api.miniApps(contactID: contactID, token: token) }
                guard generation == current, !Task.isCancelled else { return }
                if apps.count >= 20, apps[contactID] == nil, let oldest = listLoaded.min(by: { $0.value < $1.value })?.key { forget(contactID: oldest) }
                apps[contactID] = values; listLoaded[contactID] = .now; errors[contactID] = nil
            } catch is CancellationError { }
            catch {
                guard generation == current else { return }
                listLoaded[contactID] = .now
                if AuthAPI.isTransient(error) && apps[contactID] != nil { return }
                if case AuthAPI.Failure.notFound = error { apps[contactID] = [] }
                errors[contactID] = error.localizedDescription
            }
        }
        listRequests[contactID] = task
        await task.value
        if generation == current { listRequests.removeValue(forKey: contactID) }
    }

    private func replace(_ app: MiniApp?, id: String, contactID: String) {
        if let app { apps[contactID] = (apps[contactID] ?? []).map { $0.id == id ? app : $0 } }
        else { apps[contactID]?.removeAll { $0.id == id } }
        dropView(key: "\(contactID)/\(id)")
    }
    func approve(_ app: MiniApp, contactID: String, allowed: Bool, using auth: AuthStore) async throws {
        let updated = try await auth.withSession { api, token in
            try await api.approveMiniApp(contactID: contactID, appID: app.id, revision: app.revision, allowed: allowed, token: token)
        }
        replace(updated, id: app.id, contactID: contactID)
    }
    func delete(_ app: MiniApp, contactID: String, using auth: AuthStore) async throws {
        try await auth.withSession { api, token in try await api.deleteMiniApp(contactID: contactID, appID: app.id, token: token) }
        replace(nil, id: app.id, contactID: contactID)
    }

    /// Each load re-runs the app's remote reads, so a view is reused for a minute unless refreshed.
    func resolve(_ app: MiniApp, contactID: String, inputs changed: [String: String]? = nil, force: Bool = false, using auth: AuthStore) async {
        let key = "\(contactID)/\(app.id)"
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
                try await api.resolveMiniApp(contactID: contactID, appID: app.id, inputs: inputs[key] ?? [:], token: token)
            }
            guard generation == current, viewRevisions[key] == revision else { return }
            if views.count >= 16, views[key] == nil, let oldest = viewLoaded.min(by: { $0.value < $1.value })?.key { dropView(key: oldest) }
            views[key] = value; inputs[key] = value.inputs; viewLoaded[key] = .now; viewErrors[key] = nil
        } catch is CancellationError { }
        catch {
            guard generation == current, viewRevisions[key] == revision else { return }
            viewLoaded[key] = .now
            if AuthAPI.isTransient(error) && views[key] != nil { return }
            if case AuthAPI.Failure.reviewRequired = error { views[key] = nil; await refresh(contactID: contactID, using: auth, force: true) }
            if case AuthAPI.Failure.notFound = error { views[key] = nil; await refresh(contactID: contactID, using: auth, force: true) }
            viewErrors[key] = error.localizedDescription
        }
    }

    /// The caller keeps `executionID` for one confirmed submission so a retry never runs twice.
    func run(_ app: MiniApp, contactID: String, actionID: String, executionID: UUID, fields: [String: MiniAppFieldValue], using auth: AuthStore) async throws -> String {
        let key = "\(contactID)/\(app.id)", revision = viewRevisions[key], current = generation
        let outcome = try await auth.withSession { [inputs] api, token in
            try await api.runMiniAppAction(contactID: contactID, appID: app.id, actionID: actionID, executionID: executionID,
                                           revision: app.revision, inputs: inputs[key] ?? [:], fields: fields, token: token)
        }
        // State-only apps return the updated view with the action, so a tap needs no extra load.
        if let resolution = outcome.resolution {
            if generation == current, viewRevisions[key] == revision { views[key] = resolution; viewLoaded[key] = .now; viewErrors[key] = nil }
        } else if outcome.status == "completed" { await resolve(app, contactID: contactID, force: true, using: auth) }
        return outcome.status
    }

    /// Saved state plus taps not yet confirmed, in tap order.
    func displayState(key: String) -> [String: MiniAppStateValue] {
        (pendingTaps[key] ?? []).reduce(views[key]?.state ?? [:]) { MiniAppUpdate.apply($1.updates, to: $0) }
    }

    func tap(_ app: MiniApp, contactID: String, actionID: String?, updates: [MiniAppUpdate], using auth: AuthStore) {
        let key = "\(contactID)/\(app.id)"
        guard (pendingTaps[key]?.count ?? 0) < 20 else { return }
        pendingTaps[key, default: []].append(PendingTap(id: UUID(), actionID: actionID, updates: updates))
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
                            try await api.runMiniAppAction(contactID: contactID, appID: app.id, actionID: actionID, executionID: next.id,
                                                           revision: app.revision, inputs: inputs[key] ?? [:], fields: [:], token: token)
                        } else {
                            try await api.editMiniAppState(contactID: contactID, appID: app.id, executionID: next.id, revision: app.revision, inputs: inputs[key] ?? [:], update: next.updates[0], token: token)
                        }
                    }
                    guard generation == current, pendingTaps[key]?.first?.id == next.id else { return }
                    if let resolution = outcome.resolution { views[key] = resolution; viewLoaded[key] = .now; viewErrors[key] = nil }
                    pendingTaps[key]?.removeFirst()
                    failures = 0
                    if outcome.resolution == nil, pendingTaps[key]?.isEmpty != false { await resolve(app, contactID: contactID, force: true, using: auth) }
                } catch is CancellationError { return }
                catch {
                    guard generation == current else { return }
                    failures += 1
                    // Retrying reuses the tap's execution ID, so the server never applies it twice.
                    if AuthAPI.isTransient(error) && failures < 3 { try? await Task.sleep(for: .seconds(1)); continue }
                    pendingTaps[key] = nil; viewErrors[key] = error.localizedDescription
                    await resolve(app, contactID: contactID, force: true, using: auth)
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
    func forget(contactID: String) {
        listRequests.removeValue(forKey: contactID)?.cancel()
        apps.removeValue(forKey: contactID); errors.removeValue(forKey: contactID); listLoaded.removeValue(forKey: contactID)
        for key in Set(views.keys).union(inputs.keys) where key.hasPrefix("\(contactID)/") { dropView(key: key) }
    }
    func removeAll() {
        generation += 1
        for task in listRequests.values { task.cancel() }
        listRequests.removeAll(); apps.removeAll(); errors.removeAll(); listLoaded.removeAll(); tapWorkers.removeAll()
        for key in Set(views.keys).union(inputs.keys) { dropView(key: key) }
    }
}
