import Foundation
import Observation

@Observable @MainActor
final class ChatStore {
    private(set) var presence: ContactPresence?
    private(set) var turns: [ChatTurn] = []
    private(set) var hasLoaded = false
    private(set) var isLoadingMore = false
    private(set) var isSending = false
    private(set) var nextBefore: Int?
    private(set) var isUnavailable = false
    var error: String?
    private var refreshedAt: Date?
    private var isRefreshing = false
    private var invalidated = false
    private var revision = 0
    private var submission: (id: String, text: String)?
    var hasPendingReply: Bool { turns.contains(where: \.isPending) }

    func clearPresence() { presence = nil }

    func compactHistory() {
        guard !isSending, !isLoadingMore, turns.count > 100 else { return }
        turns = Array(turns.suffix(100))
        nextBefore = turns.first?.sequence
    }

    func invalidate() {
        invalidated = true
        revision += 1
        presence = nil
        turns = []
        nextBefore = nil
        submission = nil
        refreshedAt = nil
        isUnavailable = true
    }

    private func merge(_ incoming: [ChatTurn]) {
        var merged = Dictionary(uniqueKeysWithValues: turns.map { ($0.id, $0) })
        for turn in incoming { merged[turn.id] = turn }
        turns = merged.values.sorted { $0.sequence < $1.sequence }
    }

    func refresh(contactID: String, using auth: AuthStore, force: Bool = true) async {
        guard !invalidated, !isRefreshing else { return }
        let freshness: TimeInterval = 2
        if !force, let refreshedAt, Date().timeIntervalSince(refreshedAt) < freshness { return }
        isRefreshing = true
        defer { isRefreshing = false }
        let started = revision
        do {
            let page = try await auth.withSession { api, token in
                try await api.chatTurns(contactID: contactID, token: token)
            }
            try Task.checkCancellation()
            guard started == revision else { return }
            if hasLoaded, let userID = auth.user?.id {
                let completed = Set(turns.filter { $0.assistantText != nil }.map(\.id))
                for turn in page.turns where turn.assistantText != nil && !completed.contains(turn.id) {
                    MessageSounds.shared.received(turnID: turn.id, contactID: contactID, userID: userID,
                                                  completedAt: Date(timeIntervalSince1970: turn.updatedAt / 1000))
                }
            }
            if !hasLoaded || turns.isEmpty || !page.turns.contains(where: { row in turns.contains(where: { $0.id == row.id }) }) {
                revision += 1
                turns = page.turns
                nextBefore = page.nextBefore
            } else { merge(page.turns) }
            presence = page.presence
            hasLoaded = true
            refreshedAt = .now
            error = nil
        } catch is CancellationError { }
        catch {
            guard started == revision else { return }
            if (error as? URLError)?.code == .cancelled { return }
            refreshedAt = .now
            if case AuthAPI.Failure.notFound = error { invalidate() }
            presence = nil
            self.error = error.localizedDescription
        }
    }

    func loadMore(contactID: String, using auth: AuthStore) async {
        guard !invalidated, !isSending, let before = nextBefore, !isLoadingMore else { return }
        isLoadingMore = true
        let started = revision
        defer { isLoadingMore = false }
        do {
            let page = try await auth.withSession { api, token in
                try await api.chatTurns(contactID: contactID, before: before, token: token)
            }
            try Task.checkCancellation()
            guard started == revision else { return }
            merge(page.turns)
            nextBefore = page.nextBefore
        } catch is CancellationError { }
        catch {
            guard started == revision, (error as? URLError)?.code != .cancelled else { return }
            self.error = error.localizedDescription
        }
    }

    func send(text: String, contactID: String, using auth: AuthStore) async -> Bool {
        guard !isSending, !hasPendingReply, !invalidated, !isUnavailable else { return false }
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text.count <= 4000 else { return false }
        // Keep the identifier across an uncertain network result to prevent duplicate sends.
        if submission?.text != text { submission = (UUID().uuidString.lowercased(), text) }
        guard let submission else { return false }
        isSending = true
        revision += 1
        error = nil
        defer { isSending = false }
        do {
            let turn = try await auth.withSession { api, token in
                try await api.sendMessage(contactID: contactID, id: submission.id, text: text, token: token)
            }
            revision += 1
            guard !invalidated else { return false }
            merge([turn.turn])
            presence = turn.presence
            hasLoaded = true
            refreshedAt = nil
            self.submission = nil
            MessageSounds.shared.sent(turnID: submission.id, contactID: contactID)
            return true
        } catch is CancellationError { return false }
        catch {
            self.error = error.localizedDescription
            // A timeout may happen after D1 has already accepted the message.
            await refresh(contactID: contactID, using: auth)
            if turns.contains(where: { $0.id == submission.id }) {
                self.submission = nil
                self.error = nil
                MessageSounds.shared.sent(turnID: submission.id, contactID: contactID)
                return true
            }
            self.error = error.localizedDescription
            return false
        }
    }

    func retry(_ turn: ChatTurn, contactID: String, using auth: AuthStore) async {
        guard !isSending, !hasPendingReply, !invalidated else { return }
        isSending = true
        revision += 1
        defer { isSending = false }
        do {
            let updated = try await auth.withSession { api, token in
                try await api.retryReply(contactID: contactID, turnID: turn.id, token: token)
            }
            revision += 1
            guard !invalidated else { return }
            merge([updated.turn])
            presence = updated.presence
            refreshedAt = nil
            error = nil
        } catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }
}
