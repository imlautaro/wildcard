import Foundation
import Observation

/// Owned by the signed-in shell through ContactsStore; never persisted to disk.
@MainActor
final class ConversationCache {
    private struct Entry {
        let store: ChatStore
        var access: UInt64
    }
    private var entries: [String: Entry] = [:]
    private var access: UInt64 = 0
    private let capacity = 8

    func lastTurn(for contactID: String) -> ChatTurn? {
        entries[contactID]?.store.turns.last
    }

    func store(for contactID: String) -> ChatStore {
        access &+= 1
        if var entry = entries[contactID] {
            entry.access = access
            entries[contactID] = entry
            return entry.store
        }
        // In-flight mutations retain their idempotency state until they finish.
        while entries.count >= capacity,
              let oldest = entries.filter({ !$0.value.store.isSending && !$0.value.store.isLoadingMore })
                .min(by: { $0.value.access < $1.value.access })?.key {
            entries.removeValue(forKey: oldest)?.store.invalidate()
        }
        let store = ChatStore()
        entries[contactID] = Entry(store: store, access: access)
        return store
    }

    func remove(contactID: String) {
        entries.removeValue(forKey: contactID)?.store.invalidate()
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

    func remove(id: String) {
        order.removeAll { $0 == id }
        entries.removeValue(forKey: id)?.invalidate(remove: true)
    }
}
