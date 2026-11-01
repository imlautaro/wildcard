import Foundation
import Observation

/// Session-owned sticker caches (docs/stickers.md#ios, docs/caching.md#stickers).
///
/// Owned by `ContactsStore`, which `HomeView` recreates per account (`ContentView` applies `.id(auth.user?.id)`) and
/// drops on sign-out, so nothing here outlives an account; `AuthStore.withSession` also rejects results of a
/// replaced session. Never persisted; image bytes use `PrivateImageCache`.
/// - The person's library is one `NavigationSnapshot`: reopened synchronously (also when empty),
///   revalidated in the background, deduplicated, and stale responses are rejected.
/// - Contact libraries are a `NavigationSnapshotCache` keyed by contact ID.
/// - Every mutation `replace`s the snapshot, which also cancels and ignores older in-flight loads.
@MainActor @Observable
final class StickerStore {
    let library = NavigationSnapshot<StickerLibrary>()
    let contactLibraries = NavigationSnapshotCache<[Sticker]>()
    /// Sticker IDs and contact-sticker keys with a mutation in flight.
    private(set) var busy: Set<String> = []

    var stickers: [Sticker]? { library.value?.stickers }

    func isSaved(_ sticker: Sticker) -> Bool {
        library.value?.stickers.contains { $0.digest == sticker.digest } ?? false
    }

    func loadLibrary(using auth: AuthStore) async throws {
        try await library.refresh {
            try await auth.withSession { api, token in try await api.stickerLibrary(token: token) }
        }
    }

    func loadContact(_ contactID: String, using auth: AuthStore) async throws {
        try await contactLibraries.store(for: contactID).refresh {
            try await auth.withSession { api, token in try await api.contactStickers(contactID: contactID, token: token) }
        }
    }

    // MARK: Mutations

    /// Inserts or replaces a sticker (newest first) in the cached library; without a cached library the
    /// next open loads it.
    private func upsert(_ sticker: Sticker) {
        guard var current = library.value else { return }
        current.stickers.removeAll { $0.id == sticker.id }
        current.stickers.insert(sticker, at: 0)
        library.replace(current)
    }

    private func mutate<Value>(_ key: String, _ operation: () async throws -> Value) async throws -> Value {
        guard !busy.contains(key) else { throw CancellationError() }
        busy.insert(key)
        defer { busy.remove(key) }
        return try await operation()
    }

    func create(emoji: String, png: Data, using auth: AuthStore) async throws -> Sticker {
        let sticker = try await mutate("create") {
            try await auth.withSession { api, token in try await api.createSticker(emoji: emoji, png: png, token: token) }
        }
        upsert(sticker)
        return sticker
    }

    func changeEmoji(_ sticker: Sticker, to emoji: String, using auth: AuthStore) async throws {
        let updated = try await mutate(sticker.id) {
            try await auth.withSession { api, token in try await api.updateStickerEmoji(id: sticker.id, emoji: emoji, token: token) }
        }
        guard var current = library.value, let index = current.stickers.firstIndex(where: { $0.id == updated.id }) else { return }
        current.stickers[index] = updated
        library.replace(current)
    }

    func delete(_ sticker: Sticker, using auth: AuthStore) async throws {
        do {
            try await mutate(sticker.id) {
                try await auth.withSession { api, token in try await api.deleteSticker(id: sticker.id, token: token) }
            }
        } catch AuthAPI.Failure.rejected(let message) where message.hasPrefix("Sticker not found") || message == "This sticker is no longer available." {
            // Already deleted elsewhere: the end state is the same.
        }
        guard var current = library.value else { return }
        current.stickers.removeAll { $0.id == sticker.id }
        library.replace(current)
    }

    /// "Save to my stickers" from a contact's tab. The server dedupes by digest.
    func save(_ sticker: Sticker, contactID: String, using auth: AuthStore) async throws {
        let saved = try await mutate("contact/\(sticker.id)") {
            try await auth.withSession { api, token in
                try await api.saveContactSticker(contactID: contactID, stickerID: sticker.id, token: token)
            }
        }
        upsert(saved)
    }

    /// "Save sticker" on a contact message in a private chat.
    func saveMessageSticker(contactID: String, turnID: String, part: Int, using auth: AuthStore) async throws {
        let saved = try await mutate("message/\(turnID)/\(part)") {
            try await auth.withSession { api, token in
                try await api.saveMessageSticker(contactID: contactID, turnID: turnID, part: part, token: token)
            }
        }
        upsert(saved)
    }

    /// A contact was removed or access was lost: its sticker tab is gone.
    func forget(contactID: String) { contactLibraries.remove(id: contactID) }
}
