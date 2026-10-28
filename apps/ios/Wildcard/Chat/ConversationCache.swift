import Foundation
import Observation

/// Owned by the signed-in shell through ContactsStore; never persisted to disk.
@MainActor @Observable
final class ConversationCache {
    // Membership is observable; recency is bookkeeping, never a render dependency.
    private var entries: [String: ChatStore] = [:]
    @ObservationIgnored private var access: UInt64 = 0
    @ObservationIgnored private var lastAccess: [String: UInt64] = [:]
    private let capacity = 8

    func cachedStore(for contactID: String) -> ChatStore? { entries[contactID] }

    func lastTurn(for contactID: String) -> ChatTurn? {
        entries[contactID]?.turns.last
    }

    func store(for contactID: String) -> ChatStore {
        access &+= 1
        lastAccess[contactID] = access
        if let store = entries[contactID] { return store }
        // Cache hits must not rewrite observable entries during SwiftUI rendering.
        while entries.count >= capacity,
              let oldest = entries.filter({ !$0.value.isRetained && !$0.value.isSending && !$0.value.isLoadingMore && $0.value.reactions.pending.isEmpty })
                .min(by: { (lastAccess[$0.key] ?? 0) < (lastAccess[$1.key] ?? 0) })?.key {
            lastAccess.removeValue(forKey: oldest)
            entries.removeValue(forKey: oldest)?.invalidate()
        }
        let store = ChatStore()
        entries[contactID] = store
        return store
    }

    func remove(contactID: String) {
        lastAccess.removeValue(forKey: contactID)
        entries.removeValue(forKey: contactID)?.invalidate()
    }

}

/// Reusable session-only snapshot cache for secondary resource screens.
@MainActor @Observable
final class NavigationSnapshot<Value: Sendable> {
    private(set) var value: Value?
    private var revision = 0
    private var invalidated = false
    private var request: (id: UUID, task: Task<Value, Error>)?

    func invalidate(remove: Bool = false) {
        revision += 1
        request?.task.cancel()
        request = nil
        if remove { value = nil }
        invalidated = remove
    }

    func refresh(fetch: @escaping @MainActor () async throws -> Value) async throws {
        guard !invalidated else { throw AuthAPI.Failure.notFound }
        let started = revision
        let active: (id: UUID, task: Task<Value, Error>)
        if let request { active = request }
        else {
            active = (UUID(), Task { try await fetch() })
            request = active
        }
        defer { if request?.id == active.id { request = nil } }
        do {
            let updated = try await active.task.value
            guard !invalidated, started == revision else { throw CancellationError() }
            value = updated
        } catch {
            guard !invalidated, started == revision else { throw CancellationError() }
            throw error
        }
    }
}

@MainActor
final class NavigationSnapshotCache<Value: Sendable> {
    private var entries: [String: NavigationSnapshot<Value>] = [:]
    private var order: [String] = []

    func store(for id: String) -> NavigationSnapshot<Value> {
        order.removeAll { $0 == id }
        order.append(id)
        if let cached = entries[id] { return cached }
        while entries.count >= 8, let oldest = order.first {
            order.removeFirst()
            entries.removeValue(forKey: oldest)?.invalidate(remove: true)
        }
        let store = NavigationSnapshot<Value>()
        entries[id] = store
        return store
    }

    func invalidateAll() {
        for entry in entries.values { entry.invalidate() }
    }

    func removeAll() {
        for entry in entries.values { entry.invalidate(remove: true) }
        entries.removeAll()
        order.removeAll()
    }

    func remove(id: String) {
        order.removeAll { $0 == id }
        entries.removeValue(forKey: id)?.invalidate(remove: true)
    }
}
