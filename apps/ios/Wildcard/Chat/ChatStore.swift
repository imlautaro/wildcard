import Foundation
import Observation

@Observable @MainActor
final class ChatStore {
    struct OutgoingMessage {
        let turn: ChatTurn
        let attachment: DraftAttachment?
    }
    private(set) var outgoingMessage: OutgoingMessage?
    var displayedTurns: [ChatTurn] {
        guard let outgoingMessage, !turns.contains(where: { $0.id == outgoingMessage.turn.id }) else { return turns }
        return turns + [outgoingMessage.turn]
    }
    func isSubmitting(_ turnID: String) -> Bool {
        outgoingMessage?.turn.id == turnID && !turns.contains(where: { $0.id == turnID })
    }

    private(set) var presence: ContactPresence?
    private(set) var turns: [ChatTurn] = []
    private(set) var hasLoaded = false
    private(set) var newReplyIDs: Set<String> = []
    private(set) var isLoadingMore = false
    private(set) var isSending = false
    private(set) var nextBefore: Int?
    private(set) var isUnavailable = false
    var error: String?
    private var refreshedAt: Date?
    private var isRefreshing = false
    private var invalidated = false
    private var revision = 0
    private var submission: (id: String, text: String, attachmentID: UUID?)?
    var hasPendingReply: Bool { turns.contains(where: \.isPending) }

    func clearPresence() { presence = nil }

    func compactHistory() {
        guard !isSending, !isLoadingMore, turns.count > 100 else { return }
        turns = Array(turns.suffix(100))
        newReplyIDs.formIntersection(turns.map(\.id))
        nextBefore = turns.first?.sequence
    }

    func invalidate() {
        invalidated = true
        revision += 1
        presence = nil
        turns = []
        newReplyIDs.removeAll()
        nextBefore = nil
        submission = nil
        outgoingMessage = nil
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
                    newReplyIDs.insert(turn.id)
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

    func send(text: String, attachment: DraftAttachment? = nil, contactID: String, using auth: AuthStore) async -> Bool {
        guard !isSending, !hasPendingReply, !invalidated, !isUnavailable else { return false }
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (!text.isEmpty || attachment != nil), text.unicodeScalars.count <= 4000 else { return false }
        // Keep the identifier across an uncertain network result to prevent duplicate sends.
        if submission?.text != text || submission?.attachmentID != attachment?.id {
            submission = (UUID().uuidString.lowercased(), text, attachment?.id)
        }
        guard let submission else { return false }
        isSending = true
        revision += 1
        error = nil
        // Keep local presentation separate from persisted history and its server sequences.
        let now = Date.now.timeIntervalSince1970 * 1000
        outgoingMessage = OutgoingMessage(
            turn: ChatTurn(
                attachment: attachment.map { ChatAttachment(name: $0.name, mimeType: $0.mimeType, size: $0.data.count) },
                scheduleID: nil, errorCode: nil, sequence: 0, id: submission.id,
                userText: text, assistantText: nil, status: .queued, attempt: 0,
                createdAt: now, readAt: nil, updatedAt: now
            ),
            attachment: attachment
        )
        defer {
            isSending = false
            if outgoingMessage?.turn.id == submission.id { outgoingMessage = nil }
        }
        do {
            let turn = try await auth.withSession { api, token in
                try await api.sendMessage(contactID: contactID, id: submission.id, text: text, attachment: attachment, token: token)
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
