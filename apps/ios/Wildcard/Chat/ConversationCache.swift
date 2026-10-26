import Foundation

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
