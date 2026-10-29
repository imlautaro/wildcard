import Foundation
import Observation

struct MessageReaction: Decodable, Equatable, Sendable {
    let messageID: String
    let side: String
    let actorID: String
    let name: String
    let emoji: String
}

/// Owned and evicted by the existing conversation store. No private data on disk.
@MainActor @Observable
final class MessageReactionStore {
    static let emojis = ["👍", "❤️", "😂", "😮", "😢", "🙏"]
    private(set) var rows: [MessageReaction] = []
    private(set) var busy: Set<String> = []
    private(set) var pending: [String: Input] = [:]
    private(set) var errors: [String: String] = [:]
    @ObservationIgnored private var revision = 0
    @ObservationIgnored private var refreshing = false
    @ObservationIgnored private var invalidated = false
    struct Input: Encodable { let messageID: String; let side: String; let emoji: String? }
    private struct Page: Decodable { let reactions: [MessageReaction] }

    func retain(ids: [String]) {
        let known = Set(ids)
        rows.removeAll { !known.contains($0.messageID) }
    }

    func invalidate() {
        invalidated = true
        revision += 1
        rows = []
        pending = [:]
        errors = [:]
    }

    func refresh(path: String, ids: [String], auth: AuthStore) async {
        guard !invalidated, !refreshing else { return }
        refreshing = true
        let started = revision
        defer { refreshing = false }
        do {
            var fetched: [MessageReaction] = []
            for offset in stride(from: 0, to: ids.count, by: 100) {
                let batch = Array(ids[offset..<min(offset + 100, ids.count)])
                let encoded = String(decoding: try JSONEncoder().encode(batch), as: UTF8.self)
                let (data, _) = try await auth.withSession { api, token in
                    try await api.send(path: path, token: token, query: [URLQueryItem(name: "messageIDs", value: encoded)])
                }
                fetched += try JSONDecoder().decode(Page.self, from: data).reactions
            }
            guard !invalidated, started == revision else { return }
            rows = fetched
        } catch AuthAPI.Failure.notFound { invalidate() }
        catch AuthAPI.Failure.unauthorized { invalidate() }
        catch { /* Preserve the successful snapshot; the synchronizer retries. */ }
    }

    func set(path: String, messageID: String, side: String, emoji: String?, auth: AuthStore) async {
        let key = "\(messageID)/\(side)"
        guard !invalidated, !busy.contains(key), let user = auth.user else { return }
        let input = Input(messageID: messageID, side: side, emoji: emoji)
        let actorID = "user/\(user.id)"
        busy.insert(key)
        pending[key] = input
        revision += 1
        errors.removeValue(forKey: key)
        defer { busy.remove(key); revision += 1 }
        // Optimistic: show the choice at once and restore the previous one if the write fails.
        let previous = rows.first { $0.messageID == messageID && $0.side == side && $0.actorID == actorID }
        replaceOwn(messageID: messageID, side: side, actorID: actorID,
                   with: emoji.map { MessageReaction(messageID: messageID, side: side, actorID: actorID, name: user.name, emoji: $0) })
        do {
            // encodeIfPresent would omit null; the API requires an explicit removal.
            let body = try JSONSerialization.data(withJSONObject: ["messageID": messageID, "side": side, "emoji": emoji as Any? ?? NSNull()])
            _ = try await auth.withSession { api, token in
                try await api.send(path: path, method: "PUT", body: body, token: token)
            }
            guard !invalidated, auth.user?.id == user.id else { return }
            pending.removeValue(forKey: key)
        } catch AuthAPI.Failure.notFound { invalidate() }
        catch AuthAPI.Failure.unauthorized { invalidate() }
        catch {
            guard !invalidated, auth.user?.id == user.id else { return }
            replaceOwn(messageID: messageID, side: side, actorID: actorID, with: previous)
            errors[key] = error.localizedDescription
        }
    }

    private func replaceOwn(messageID: String, side: String, actorID: String, with row: MessageReaction?) {
        rows.removeAll { $0.messageID == messageID && $0.side == side && $0.actorID == actorID }
        if let row { rows.append(row) }
    }
}
