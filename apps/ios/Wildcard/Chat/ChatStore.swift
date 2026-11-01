import Foundation
import Observation

@Observable @MainActor
final class ChatStore {
    func markVoiceListened(turnID: String, part: Int) {
        guard !invalidated, let index = turns.firstIndex(where: { $0.id == turnID }),
              let count = turns[index].assistantMessages?.count, part >= 0, part < count else { return }
        turns[index].assistantMessages?[part].voice?.ownListenedAt = Date().timeIntervalSince1970 * 1000
    }

    private(set) var reactions = MessageReactionStore()
    /// Unsent composer text: kept across navigation and shown as "Draft:" in the chat list.
    var draft = ""
    struct OutgoingMessage {
        let turn: ChatTurn
        let attachment: DraftAttachment?
        var voice: VoiceClip? = nil
    }
    private(set) var outgoingMessage: OutgoingMessage?
    /// A voice message whose send failed; kept with its reply target until retried or discarded.
    private(set) var failedVoice: (clip: VoiceClip, replyTo: MessageReplyQuote?, homePost: HomePostReference?)?
    var displayedTurns: [ChatTurn] {
        guard let outgoingMessage, !turns.contains(where: { $0.id == outgoingMessage.turn.id }) else { return turns }
        return turns + [outgoingMessage.turn]
    }
    struct TimelineItem: Identifiable, Equatable {
        enum Kind: Int { case user, assistant, status }
        let turn: ChatTurn
        let kind: Kind
        let timestamp: Double
        var message: AssistantMessage? = nil
        var id: String { message?.id ?? "\(turn.id)/\(kind.rawValue)" }
    }

    // Turns remain ordered by server sequence for pagination/cache reconciliation.
    // Only the presentation is split into independently timestamped messages.
    var timelineItems: [TimelineItem] {
        let displayed = displayedTurns
        let latestTimestamp = displayed.map { max($0.createdAt, $0.updatedAt) }.max() ?? 0
        return displayed.flatMap { turn -> [TimelineItem] in
            var items = [TimelineItem(turn: turn, kind: .user, timestamp: turn.createdAt)]
            if let messages = turn.assistantMessages, !messages.isEmpty {
                items += messages.map { TimelineItem(turn: turn, kind: .assistant, timestamp: $0.createdAt, message: $0) }
            } else if turn.assistantText != nil {
                items.append(TimelineItem(turn: turn, kind: .assistant, timestamp: turn.updatedAt))
            }
            if turn.isPending || turn.status == .failed {
                items.append(TimelineItem(turn: turn, kind: .status, timestamp: latestTimestamp + 1))
            }
            return items
        }.sorted {
            if $0.timestamp != $1.timestamp { return $0.timestamp < $1.timestamp }
            if $0.kind != $1.kind { return $0.kind.rawValue < $1.kind.rawValue }
            if $0.turn.sequence != $1.turn.sequence { return $0.turn.sequence < $1.turn.sequence }
            return $0.id < $1.id
        }
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
    private var refreshRequest: (id: UUID, task: Task<Void, Never>)?
    var isRetained = false
    private var invalidated = false
    private var revision = 0
    private var historyRevision = 0
    private var submission: (historyRevision: Int, id: String, text: String, contentID: UUID?, replyKey: String?, nativeContext: NativeContext?)?
    var hasPendingReply: Bool { turns.contains(where: \.isPending) }

    func clearPresence() { presence = nil }

    func reconcile(_ contact: Contact) {
        if !invalidated, let index = turns.lastIndex(where: { ($0.assistantText == nil ? $0.createdAt : $0.updatedAt) == contact.lastMessageAt }) {
            if turns[index].assistantText == nil {
                turns[index].voice = turns[index].voice?.merging(contact.lastMessageVoice)
            } else if let part = turns[index].assistantMessages?.indices.last {
                let voice = turns[index].assistantMessages?[part].voice?.merging(contact.lastMessageVoice)
                turns[index].assistantMessages?[part].voice = voice
            }
        }
        guard !invalidated, contact.lastMessageFromUser == 1,
              let index = turns.lastIndex(where: { $0.createdAt == contact.lastMessageAt }),
              let readAt = contact.lastMessageReadAt else { return }
        turns[index].readAt = max(turns[index].readAt ?? 0, readAt)
    }

    func needsRefresh(for contact: Contact) -> Bool {
        guard !invalidated else { return false }
        guard let latest = turns.last else { return contact.lastMessageAt != nil }
        let timestamp = latest.assistantText == nil ? latest.createdAt : latest.updatedAt
        return hasPendingReply || (contact.lastMessageAt ?? 0) > timestamp
    }

    func compactHistory() {
        guard !isSending, !isLoadingMore, turns.count > 100 else { return }
        turns = Array(turns.suffix(100))
        reactions.retain(ids: turns.map(\.id))
        newReplyIDs.formIntersection(turns.map(\.id))
        nextBefore = turns.first?.sequence
    }

    func invalidate() {
        reactions.invalidate()
        invalidated = true
        refreshRequest?.task.cancel()
        refreshRequest = nil
        revision += 1
        presence = nil
        turns = []
        newReplyIDs.removeAll()
        nextBefore = nil
        submission = nil
        outgoingMessage = nil
        failedVoice = nil
        refreshedAt = nil
        isUnavailable = true
    }

    private func merge(_ incoming: [ChatTurn]) {
        var merged = Dictionary(uniqueKeysWithValues: turns.map { ($0.id, $0) })
        for turn in incoming { merged[turn.id] = merged[turn.id].map { $0.merging(turn) } ?? turn }
        turns = merged.values.sorted { $0.sequence < $1.sequence }
    }

    func refresh(contactID: String, using auth: AuthStore, force: Bool = true) async {
        guard !invalidated else { return }
        if let request = refreshRequest { await request.task.value; return }
        let request = (id: UUID(), task: Task { await self.performRefresh(contactID: contactID, using: auth, force: force) })
        refreshRequest = request
        await request.task.value
        if refreshRequest?.id == request.id { refreshRequest = nil }
    }

    private func performRefresh(contactID: String, using auth: AuthStore, force: Bool) async {
        guard !invalidated else { return }
        let freshness: TimeInterval = 2
        if !force, let refreshedAt, Date().timeIntervalSince(refreshedAt) < freshness { return }
        let started = revision
        defer { if !isRetained { compactHistory() } }
        do {
            let page = try await auth.withSession { api, token in
                try await api.chatTurns(contactID: contactID, token: token)
            }
            var incoming = page.turns
            var cursor = page.nextBefore
            if let latest = turns.last?.sequence {
                while let before = cursor, (incoming.first?.sequence ?? latest) > latest {
                    try Task.checkCancellation()
                    let older = try await auth.withSession { api, token in
                        try await api.chatTurns(contactID: contactID, before: before, token: token)
                    }
                    guard (older.historyRevision ?? 0) == (page.historyRevision ?? 0) else { return }
                    incoming.insert(contentsOf: older.turns, at: 0)
                    guard older.nextBefore != cursor else { break }
                    cursor = older.nextBefore
                }
            }
            try Task.checkCancellation()
            guard started == revision else { return }
            guard (page.historyRevision ?? 0) >= historyRevision else { return }
            if historyRevision != (page.historyRevision ?? 0) {
                reactions.invalidate(); reactions = MessageReactionStore()
                turns = []; submission = nil; outgoingMessage = nil; failedVoice = nil; nextBefore = nil
                newReplyIDs = []
                VoicePlayer.shared.stop()
                await auth.images.clear(deactivate: false)
                guard !invalidated, started == revision else { return }
            }
            if auth.user != nil {
                let completed = Set(turns.filter { $0.assistantText != nil }.map(\.id))
                for turn in incoming where turn.assistantText != nil && !completed.contains(turn.id) {
                    newReplyIDs.insert(turn.id)
                }
            }
            if !hasLoaded || turns.isEmpty { nextBefore = cursor }
            merge(incoming)
            await reactions.refresh(path: "contacts/\(contactID)/chat/reactions", ids: turns.map(\.id), auth: auth)
            guard !invalidated, started == revision else { return }
            historyRevision = page.historyRevision ?? 0
            presence = page.presence
            hasLoaded = true
            refreshedAt = .now
            error = nil
            if let userID = auth.user?.id {
                for turn in turns where newReplyIDs.contains(turn.id) {
                    MessageSounds.shared.received(turnID: turn.id, contactID: contactID, userID: userID,
                        completedAt: Date(timeIntervalSince1970: turn.updatedAt / 1000))
                }
            }
        } catch is CancellationError { }
        catch {
            guard started == revision else { return }
            if (error as? URLError)?.code == .cancelled { return }
            refreshedAt = .now
            // Background revalidation keeps the loaded history visible through transient failures.
            if hasLoaded && AuthAPI.isTransient(error) { return }
            if case AuthAPI.Failure.notFound = error {
                await auth.images.clear(deactivate: false)
                guard started == revision else { return }
                invalidate()
            }
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
            guard (page.historyRevision ?? 0) == historyRevision else { return }
            merge(page.turns)
            nextBefore = page.nextBefore
            await reactions.refresh(path: "contacts/\(contactID)/chat/reactions", ids: turns.map(\.id), auth: auth)
        } catch is CancellationError { }
        catch {
            guard started == revision, (error as? URLError)?.code != .cancelled else { return }
            self.error = error.localizedDescription
        }
    }

    func discardFailedVoice() { failedVoice = nil }

    func send(text: String, attachment: DraftAttachment? = nil, voice: VoiceClip? = nil, replyTo: MessageReplyQuote? = nil, homePost: HomePostReference? = nil, contactID: String, using auth: AuthStore) async -> Bool {
        guard !isSending, !invalidated, !isUnavailable else {
            if let voice, !invalidated { failedVoice = (voice, replyTo, homePost) }
            return false
        }
        let text = voice == nil ? text.trimmingCharacters(in: .whitespacesAndNewlines) : ""
        guard (!text.isEmpty || attachment != nil || voice != nil), text.unicodeScalars.count <= 4000 else { return false }
        // Keep the identifier across an uncertain network result to prevent duplicate sends.
        // A different quoted message or clip is different content and needs a new identifier.
        let replyKey = [replyTo.map { "\($0.messageID)/\($0.side)" }, homePost.map { "post/\($0.id)" }].compactMap { $0 }.joined(separator: "|")
        let contentID = voice?.id ?? attachment?.id
        if submission?.text != text || submission?.contentID != contentID || submission?.replyKey != replyKey {
            do { submission = (historyRevision, UUID().uuidString.lowercased(), text, contentID, replyKey, try NativeExperiments.shared.context(contactID: contactID)) }
            catch {
                self.error = error.localizedDescription
                if let voice { failedVoice = (voice, replyTo, homePost) }
                return false
            }
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
                scheduleID: nil, groupRequestID: nil, errorCode: nil, sequence: 0, id: submission.id,
                userText: text, assistantText: nil, status: .queued, attempt: 0,
                createdAt: now, readAt: nil, updatedAt: now, replyTo: replyTo, voice: voice?.metadata, homePost: homePost
            ),
            attachment: attachment,
            voice: voice
        )
        if voice != nil { failedVoice = nil }
        defer {
            isSending = false
            if outgoingMessage?.turn.id == submission.id { outgoingMessage = nil }
        }
        do {
            let turn = try await auth.withSession { api, token in
                try await api.sendMessage(contactID: contactID, historyRevision: submission.historyRevision, id: submission.id, text: text, attachment: attachment, voice: voice,
                                          replyTo: replyTo, homePost: homePost?.id, nativeContext: submission.nativeContext, token: token)
            }
            revision += 1
            guard !invalidated else { return false }
            merge([turn.turn])
            presence = turn.presence
            hasLoaded = true
            refreshedAt = nil
            self.submission = nil
            outgoingMessage = nil
            if let attachment, attachment.mimeType.hasPrefix("image/") {
                await auth.images.store(attachment.data, for: .attachment(contactID: contactID, turnID: submission.id))
            }
            if let voice { await auth.images.audio.store(voice.data, for: .userVoice(contactID: contactID, turnID: submission.id)) }
            MessageSounds.shared.sent(turnID: submission.id, contactID: contactID)
            return true
        } catch is CancellationError {
            if let voice, !invalidated { failedVoice = (voice, replyTo, homePost) }
            return false
        }
        catch {
            self.error = error.localizedDescription
            // A timeout may happen after D1 has already accepted the message.
            await refresh(contactID: contactID, using: auth)
            if turns.contains(where: { $0.id == submission.id }) {
                self.submission = nil
                self.error = nil
                if let attachment, attachment.mimeType.hasPrefix("image/") {
                    await auth.images.store(attachment.data, for: .attachment(contactID: contactID, turnID: submission.id))
                }
                if let voice { await auth.images.audio.store(voice.data, for: .userVoice(contactID: contactID, turnID: submission.id)) }
                MessageSounds.shared.sent(turnID: submission.id, contactID: contactID)
                return true
            }
            self.error = error.localizedDescription
            if let voice, !invalidated { failedVoice = (voice, replyTo, homePost) }
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
