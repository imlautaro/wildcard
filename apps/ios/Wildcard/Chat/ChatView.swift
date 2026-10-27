import AVFAudio
import SwiftUI

struct ChatView: View {
    let contactID: String
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.scenePhase) private var scenePhase
    let chat: ChatStore
    @State private var draft = ""
    @State private var draftRevision = 0
    @State private var visitID: String?
    @State private var lastComposerActivity = Date.distantPast
    @State private var isVisible = false
    @State private var animateNewMessages = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var voice = VoiceRecorder()
    @State private var voiceTask: Task<Void, Never>?
    @FocusState private var composerFocused: Bool
    @ScaledMetric(relativeTo: .body) private var composerHeight: CGFloat = 44
    @ScaledMetric(relativeTo: .body) private var sendIconSize: CGFloat = 20

    private var canSend: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && draft.unicodeScalars.count <= 4000
            && chat.hasLoaded && !chat.hasPendingReply && !chat.isSending && !chat.isUnavailable
            && !voice.isBusy && !voice.hasRecording
    }

    private var draftIsEmpty: Bool { draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var canUseMicrophone: Bool {
        chat.hasLoaded && !chat.isUnavailable && !chat.isSending && !voice.isBusy
    }
    private var actionEnabled: Bool {
        if voice.phase == .recording { return true }
        return draftIsEmpty ? canUseMicrophone : canSend
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 16) {
                    if chat.nextBefore != nil {
                        Button("Load earlier messages") { Task { await chat.loadMore(contactID: contactID, using: auth) } }
                            .disabled(chat.isLoadingMore)
                    }
                    if !chat.hasLoaded && chat.error == nil { ProgressView("Loading messages…") }
                    if chat.hasLoaded && chat.turns.isEmpty && !chat.isUnavailable {
                        ContentUnavailableView {
                            Label("Start a conversation", systemImage: "bubble.left.and.bubble.right")
                                .manrope(.title2, weight: .semibold)
                        } description: {
                            Text("Send your first message.").manrope()
                        }
                    }
                    ForEach(chat.turns) { turn in
                        if turn.scheduleID == nil {
                            MessageBubbleView(text: turn.userText, sentAt: turn.createdAt, fromUser: true)
                        }
                        if let reply = turn.assistantText {
                            MessageBubbleView(text: reply, sentAt: turn.updatedAt, fromUser: false)
                                .task {
                                    guard chat.newReplyIDs.contains(turn.id) else { return }
                                    // Wait until the insertion/scroll animation has finished.
                                    do { try await Task.sleep(for: .milliseconds(250)) }
                                    catch { return }
                                    guard !Task.isCancelled, isVisible, scenePhase == .active,
                                          MessageSounds.shared.visibleContactID == contactID,
                                          let userID = auth.user?.id else { return }
                                    MessageSounds.shared.received(
                                        turnID: turn.id, contactID: contactID, userID: userID,
                                        completedAt: Date(timeIntervalSince1970: turn.updatedAt / 1000),
                                        replyIsVisible: true
                                    )
                                }
                        } else if turn.isPending && chat.presence?.status == .typing {
                            ReplyTypingIndicator()
                        } else if turn.status == .failed {
                            VStack(alignment: .leading, spacing: 8) {
                                Text(turn.errorCode == "SCHEDULE_CANCELLED" ? "Scheduled message cancelled." : "The reply could not be completed.").manrope(.footnote).foregroundStyle(.secondary)
                                if turn.scheduleID == nil && turn.id == chat.turns.last?.id {
                                    Button("Retry reply") { Task { await chat.retry(turn, contactID: contactID, using: auth) } }
                                        .disabled(chat.isSending || chat.hasPendingReply)
                                }
                            }.frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    Color.clear.frame(height: 1).id("latest")
                }
                .padding()
                .animation(animateNewMessages ? .easeOut(duration: reduceMotion ? 0.15 : 0.22) : nil,
                           value: chat.turns.last)
            }
            .scrollDismissesKeyboard(.interactively)
            .defaultScrollAnchor(.bottom)
            .scrollEdgeEffectStyle(.soft, for: .bottom)
            .onChange(of: chat.turns.last) { _, _ in
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.22)) { proxy.scrollTo("latest", anchor: .bottom) }
                Task { try? await contacts.refreshContact(id: contactID, using: auth) }
            }
            .safeAreaBar(edge: .bottom, spacing: 0) { composer }
            .refreshable { await chat.refresh(contactID: contactID, using: auth) }
        }
        .onChange(of: voice.phase) { _, phase in
            if phase == .ready { transcribeRecording() }
        }
        .onChange(of: composerFocused) { _, focused in
            lastComposerActivity = focused ? .now : .distantPast
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { endVisit(); chat.clearPresence() }
            if phase == .background { cancelRecording() }
        }
        .onChange(of: chat.isUnavailable) { _, unavailable in
            if unavailable { cancelRecording() }
        }
        .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.didBecomeInactiveNotification)) { _ in
            voice.interrupt()
        }
        .onAppear {
            isVisible = true
            MessageSounds.shared.visibleContactID = contactID
            animateNewMessages = chat.hasLoaded
        }
        .onChange(of: chat.hasLoaded) { _, loaded in
            if loaded { animateNewMessages = true }
        }
        .onDisappear {
            isVisible = false
            if MessageSounds.shared.visibleContactID == contactID { MessageSounds.shared.visibleContactID = nil }
            endVisit()
            chat.clearPresence()
            cancelRecording()
            chat.compactHistory()
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            let id = UUID().uuidString.lowercased()
            visitID = id
            var registered = false
            var reportedActivity = Date.distantPast
            while !Task.isCancelled {
                guard isVisible, scenePhase == .active, !chat.isUnavailable, let currentVisit = visitID else { return }
                if !registered, await reportActivity("open", visit: currentVisit) != nil {
                    registered = true
                }
                if registered, composerFocused, lastComposerActivity > reportedActivity,
                   Date.now.timeIntervalSince(lastComposerActivity) < 6 {
                    let activity = lastComposerActivity
                    if let active = await reportActivity("typing", visit: currentVisit) {
                        if active { reportedActivity = activity }
                        else if visitID == currentVisit {
                            // Renew only for new interaction, never merely because the chat is still visible.
                            visitID = UUID().uuidString.lowercased()
                            registered = false
                        }
                    }
                }
                do { try await Task.sleep(for: .seconds(3)) }
                catch { return }
            }
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await chat.refresh(contactID: contactID, using: auth)
            while !Task.isCancelled {
                await chat.refresh(contactID: contactID, using: auth, force: false)
                if isVisible, scenePhase == .active,
                   let sequence = chat.turns.last(where: { $0.status == .complete })?.sequence {
                    await contacts.markRead(id: contactID, sequence: sequence, using: auth)
                }
                if chat.isUnavailable { return }
                do { try await Task.sleep(for: .seconds(3)) }
                catch { return }
            }
        }
    }

    private func reportActivity(_ kind: String, visit: String) async -> Bool? {
        do {
            return try await auth.withSession { api, token in
                try await api.chatActivity(contactID: contactID, visitID: visit, kind: kind, token: token)
            }
        } catch { return nil } // Optional presence failures never block reading or sending messages.
    }

    private func endVisit() {
        guard let id = visitID else { return }
        visitID = nil
        Task { _ = await reportActivity("leave", visit: id) }
    }

    private func cancelRecording() {
        voiceTask?.cancel()
        voiceTask = nil
        voice.cancel()
    }

    private func transcribeRecording() {
        voiceTask?.cancel()
        voiceTask = Task {
            if let text = await voice.transcribe(contactID: contactID, using: auth), !Task.isCancelled {
                draftRevision += 1
                draft = draft.isEmpty ? text : draft + " " + text
                composerFocused = true
            }
        }
    }

    private var composer: some View {
        VStack(spacing: 8) {
            if let error = chat.error {
                HStack(alignment: .top) {
                    Text(error).manrope(.footnote).foregroundStyle(.red)
                    Spacer()
                    Button("Refresh") { Task { await chat.refresh(contactID: contactID, using: auth) } }
                        .manrope(.footnote)
                }
            }
            if let error = voice.error {
                VStack(alignment: .leading, spacing: 8) {
                    Text(error).manrope(.footnote).foregroundStyle(.red)
                    if voice.hasRecording {
                        HStack {
                            Button("Retry transcription") { transcribeRecording() }
                            Button("Discard recording", role: .destructive) { cancelRecording() }
                        }.manrope(.footnote)
                    }
                }.frame(maxWidth: .infinity, alignment: .leading)
            }
            if voice.phase == .recording {
                HStack {
                    Image(systemName: "waveform").foregroundStyle(.red)
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        Text("Recording \(voice.elapsed / 60):\(String(format: "%02d", voice.elapsed % 60)) / 1:00").monospacedDigit()
                    }
                    Spacer()
                    Button("Cancel") { cancelRecording() }
                }.manrope(.footnote)
            } else if voice.phase == .transcribing || voice.phase == .ready {
                HStack {
                    ProgressView()
                    Text("Transcribing…")
                    Spacer()
                    Button("Cancel") { cancelRecording() }
                }.manrope(.footnote)
            }
            HStack(alignment: .bottom, spacing: 12) {
                TextField("Message", text: Binding(get: { draft }, set: {
                    draftRevision += 1
                    lastComposerActivity = .now
                    draft = $0
                }), axis: .vertical)
                    .manrope().lineLimit(1...6).focused($composerFocused)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .frame(minHeight: composerHeight)
                    .glassEffect(.regular, in: Capsule())
                    .disabled(chat.isUnavailable || voice.isBusy || voice.hasRecording)
                Button {
                    if voice.phase == .recording {
                        voice.stop()
                    } else if draftIsEmpty {
                        composerFocused = false
                        voiceTask = Task { await voice.start() }
                    } else {
                        guard canSend else { return }
                        let submitted = draft
                        let submittedRevision = draftRevision
                        draft = ""
                        Task {
                            let accepted = await chat.send(text: submitted, contactID: contactID, using: auth)
                            if !accepted, draftRevision == submittedRevision, draft.isEmpty {
                                draft = submitted
                            }
                        }
                    }
                } label: {
                    Image(systemName: voice.phase == .recording ? "stop.fill" : (draftIsEmpty ? "mic.fill" : "arrow.up"))
                        .font(.system(size: sendIconSize, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: composerHeight, height: composerHeight)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .glassEffect(.regular.tint(voice.phase == .recording ? .red : .accentColor).interactive(), in: Circle())
                .opacity(actionEnabled ? 1 : 0.4)
                .accessibilityLabel(voice.phase == .recording ? "Stop recording and transcribe" : (draftIsEmpty ? "Record audio" : "Send message"))
                .disabled(!actionEnabled)
            }
            if draft.unicodeScalars.count > 4000 {
                Text("Messages can contain up to 4,000 characters.").manrope(.caption).foregroundStyle(.red)
            }
        }
        .padding(.horizontal).padding(.vertical, 10)
    }
}
