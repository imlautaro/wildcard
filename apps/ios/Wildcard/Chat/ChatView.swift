import AVFAudio
import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

struct ChatView: View {
    let contactID: String
    @Environment(ConversationSync.self) private var sync
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.scenePhase) private var scenePhase
    let chat: ChatStore
    @State private var draft = ""
    @State private var attachment: DraftAttachment?
    @State private var photoSelection: PhotosPickerItem?
    @State private var showPhotoPicker = false
    @State private var showFilePicker = false
    @State private var isLoadingAttachment = false
    @State private var attachmentError: String?
    @State private var attachmentTask: Task<Void, Never>?
    @State private var draftRevision = 0
    @State private var visitID: String?
    @State private var lastComposerActivity = Date.distantPast
    @State private var isVisible = false
    @State private var animateNewMessages = false
    @State private var isAwayFromBottom = false
    @State private var composerBarHeight: CGFloat = 0
    @State private var replyTarget: MessageReplyQuote?
    @State private var highlightedMessage: String?
    @State private var quoteTask: Task<Void, Never>?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var voice = VoiceRecorder()
    @State private var voiceTask: Task<Void, Never>?
    @FocusState private var composerFocused: Bool
    @ScaledMetric(relativeTo: .body) private var composerHeight: CGFloat = 44
    @ScaledMetric(relativeTo: .body) private var sendIconSize: CGFloat = 20

    private var canSend: Bool {
        (!draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || attachment != nil) && draft.unicodeScalars.count <= 4000
            && chat.hasLoaded && !chat.hasPendingReply && !chat.isSending && !chat.isUnavailable
            && !voice.isBusy && !voice.hasRecording && !isLoadingAttachment
    }

    private var draftIsEmpty: Bool { draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && attachment == nil }
    private var canUseMicrophone: Bool {
        chat.hasLoaded && !chat.isUnavailable && !chat.isSending && !voice.isBusy && !isLoadingAttachment
    }
    private var actionEnabled: Bool {
        if voice.phase == .recording { return true }
        return draftIsEmpty ? canUseMicrophone : canSend
    }
    private var canReply: Bool { chat.hasLoaded && !chat.isUnavailable }

    private func replyPreview(_ quote: MessageReplyQuote) -> MessageReplyPreview {
        quote.side == "user"
            ? MessageReplyPreview(quote: quote, author: "You", color: .accentColor)
            : MessageReplyPreview(quote: quote, author: contacts.contact(id: contactID)?.name ?? "Contact",
                                  color: GroupMemberColor.color(groupID: contactID, identity: "contact"))
    }

    private func reply(to turn: ChatTurn, side: String) {
        guard canReply else { return }
        replyTarget = side == "assistant"
            ? .local(messageID: turn.id, side: side, text: turn.assistantText ?? "", attachment: nil)
            : .local(messageID: turn.id, side: side, text: turn.userText, attachment: turn.attachment)
        composerFocused = true
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
                    if chat.hasLoaded && chat.displayedTurns.isEmpty && !chat.isUnavailable {
                        ContentUnavailableView {
                            Label("Start a conversation", systemImage: "bubble.left.and.bubble.right")
                                .manrope(.title2, weight: .semibold)
                        } description: {
                            Text("Send your first message.").manrope()
                        }
                    }
                    ForEach(chat.displayedTurns) { turn in
                        if turn.scheduleID == nil && (!turn.userText.isEmpty || turn.attachment != nil) {
                            let quote = turn.replyTo.map(replyPreview)
                            let showQuote = { if let replyTo = turn.replyTo { showQuoted(replyTo, proxy: proxy) } }
                            VStack(spacing: 8) {
                                if let attachment = turn.attachment {
                                    ChatAttachmentView(attachment: attachment, contactID: contactID, turnID: turn.id, sentAt: turn.createdAt, caption: attachment.isImage ? turn.userText : "", readAt: turn.readAt, isSending: chat.isSubmitting(turn.id), localData: chat.outgoingMessage?.turn.id == turn.id ? chat.outgoingMessage?.attachment?.data : nil,
                                                       replyQuote: quote, onQuoteTap: showQuote)
                                }
                                if !turn.userText.isEmpty && turn.attachment?.isImage != true {
                                    MessageBubbleView(text: turn.userText, sentAt: turn.createdAt, fromUser: true, readAt: turn.readAt, isSending: chat.isSubmitting(turn.id),
                                                      replyQuote: turn.attachment == nil ? quote : nil, onQuoteTap: showQuote)
                                }
                            }
                            .swipeToReply(enabled: canReply && !chat.isSubmitting(turn.id)) { reply(to: turn, side: "user") }
                            .messageReactions(chat.reactions, path: "contacts/\(contactID)/chat/reactions", messageID: turn.id, side: "user", fromUser: true, enabled: !chat.isSubmitting(turn.id),
                                              onReply: canReply ? { reply(to: turn, side: "user") } : nil)
                            .messageHighlight(highlightedMessage == "\(turn.id)/user")
                            .id("\(turn.id)/user")
                        }
                        if let reply = turn.assistantText {
                            MessageBubbleView(text: reply, sentAt: turn.updatedAt, fromUser: false)
                                .swipeToReply(enabled: canReply) { self.reply(to: turn, side: "assistant") }
                                .messageReactions(chat.reactions, path: "contacts/\(contactID)/chat/reactions", messageID: turn.id, side: "assistant", fromUser: false,
                                                  onReply: canReply ? { self.reply(to: turn, side: "assistant") } : nil)
                                .messageHighlight(highlightedMessage == "\(turn.id)/assistant")
                                .id("\(turn.id)/assistant")
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
                        } else if turn.status == .running && chat.presence?.status == .typing {
                            ReplyTypingIndicator()
                        } else if turn.status == .failed && !chat.turns.contains(where: { $0.sequence > turn.sequence && $0.assistantText != nil }) {
                            VStack(alignment: .leading, spacing: 8) {
                                Text(turn.errorCode == "SCHEDULE_CANCELLED" ? "Scheduled message cancelled." : turn.errorCode == "GROUP_REQUEST_CANCELLED" ? "Group request cancelled." : "The reply to this message couldn't be completed.").manrope(.footnote).foregroundStyle(.secondary)
                                if turn.scheduleID == nil && turn.groupRequestID == nil && turn.id == chat.turns.last?.id {
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
                           value: chat.displayedTurns.last)
            }
            .scrollDismissesKeyboard(.interactively)
            .defaultScrollAnchor(.bottom)
            .scrollEdgeEffectStyle(.soft, for: .bottom)
            .onScrollGeometryChange(for: Bool.self) { geometry in
                geometry.contentSize.height - geometry.visibleRect.maxY > 80
            } action: { _, isAway in
                isAwayFromBottom = isAway
            }
            .onChange(of: chat.displayedTurns.last) { previous, latest in
                if !isAwayFromBottom || previous == nil || latest.map({ chat.isSubmitting($0.id) }) == true {
                    scrollToLatest(using: proxy)
                }
                sync.request(.contact(contactID))
            }
            .safeAreaBar(edge: .bottom, spacing: 0) {
                composer
                    .onGeometryChange(for: CGFloat.self) { geometry in
                        geometry.size.height
                    } action: { height in
                        composerBarHeight = height
                    }
            }
            .overlay(alignment: .bottomTrailing) {
                if isAwayFromBottom && !chat.displayedTurns.isEmpty {
                    ChatScrollToLatestButton { scrollToLatest(using: proxy) }
                    .padding(.trailing, 16)
                    .padding(.bottom, composerBarHeight + 8)
                    .transition(.opacity)
                }
            }
            .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: isAwayFromBottom)
            .refreshable { await chat.refresh(contactID: contactID, using: auth) }
        }
        .photosPicker(isPresented: $showPhotoPicker, selection: $photoSelection, matching: .images, preferredItemEncoding: .compatible)
        .fileImporter(isPresented: $showFilePicker, allowedContentTypes: DraftAttachment.types) { result in
            do { try selectFile(result.get()) }
            catch { attachmentError = error.localizedDescription }
        }
        .onChange(of: photoSelection) { _, selected in
            guard let selected else { return }
            attachmentTask?.cancel()
            isLoadingAttachment = true
            attachmentError = nil
            attachmentTask = Task {
                defer { isLoadingAttachment = false; photoSelection = nil }
                do {
                    guard let data = try await selected.loadTransferable(type: Data.self), data.count <= DraftAttachment.limit,
                          let image = UIImage(data: data) else {
                        throw AuthAPI.Failure.rejected("Choose a photo up to 5 MB.")
                    }
                    try Task.checkCancellation()
                    let scale = min(1, 2048 / max(image.size.width, image.size.height))
                    let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
                    let format = UIGraphicsImageRendererFormat()
                    format.scale = 1
                    format.opaque = true
                    let resized = UIGraphicsImageRenderer(size: size, format: format).image { context in
                        UIColor.white.setFill()
                        context.fill(CGRect(origin: .zero, size: size))
                        image.draw(in: CGRect(origin: .zero, size: size))
                    }
                    guard let bytes = resized.jpegData(compressionQuality: 0.85), bytes.count <= DraftAttachment.limit else {
                        throw AuthAPI.Failure.rejected("Choose a photo up to 5 MB.")
                    }
                    guard isVisible, !chat.isUnavailable else { return }
                    attachment = DraftAttachment(name: "Photo.jpg", mimeType: "image/jpeg", data: bytes)
                    draftRevision += 1
                } catch is CancellationError { }
                catch { attachmentError = error.localizedDescription }
            }
        }
        .onChange(of: voice.phase) { _, phase in
            if phase == .ready { transcribeRecording() }
        }
        .onChange(of: composerFocused) { _, focused in
            lastComposerActivity = focused ? .now : .distantPast
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { noteVisibleRepliesRead() }
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
            chat.isRetained = true
            sync.visible = .contact(contactID)
            sync.request(.contact(contactID))
            MessageSounds.shared.visibleContactID = contactID
            animateNewMessages = chat.hasLoaded
            noteVisibleRepliesRead()
        }
        .onChange(of: chat.hasLoaded) { _, loaded in
            if loaded { animateNewMessages = true }
        }
        .onDisappear {
            noteVisibleRepliesRead()
            isVisible = false
            chat.isRetained = false
            if sync.visible == .contact(contactID) { sync.visible = nil }
            if MessageSounds.shared.visibleContactID == contactID { MessageSounds.shared.visibleContactID = nil }
            endVisit()
            chat.clearPresence()
            cancelRecording()
            attachmentTask?.cancel()
            quoteTask?.cancel()
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
        .onChange(of: chat.turns.last(where: { $0.status == .complete })?.sequence) { _, _ in
            noteVisibleRepliesRead()
        }
    }

    private func noteVisibleRepliesRead() {
        guard isVisible, scenePhase == .active,
              let sequence = chat.turns.last(where: { $0.status == .complete })?.sequence else { return }
        contacts.noteRead(id: contactID, sequence: sequence, using: auth)
    }

    /// Scroll to a quoted message, paging earlier history within a bound when needed.
    private func showQuoted(_ quote: MessageReplyQuote, proxy: ScrollViewProxy) {
        guard quote.available else { return }
        let key = "\(quote.messageID)/\(quote.side)"
        quoteTask?.cancel()
        quoteTask = Task {
            for _ in 0..<20 where !chat.turns.contains(where: { $0.id == quote.messageID }) {
                guard let cursor = chat.nextBefore, !Task.isCancelled else { break }
                await chat.loadMore(contactID: contactID, using: auth)
                if chat.nextBefore == cursor { break }
            }
            guard !Task.isCancelled, chat.turns.contains(where: { $0.id == quote.messageID }) else { return }
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.22)) { proxy.scrollTo(key, anchor: .center) }
            highlightedMessage = key
            do { try await Task.sleep(for: .seconds(1.2)) } catch { return }
            if highlightedMessage == key {
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) { highlightedMessage = nil }
            }
        }
    }

    private func scrollToLatest(using proxy: ScrollViewProxy) {
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.22)) {
            proxy.scrollTo("latest", anchor: .bottom)
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

    private func selectFile(_ url: URL) throws {
        attachment = try DraftAttachment.load(url: url)
        attachmentError = nil
        draftRevision += 1
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
            if let attachmentError {
                Text(attachmentError).manrope(.footnote).foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if isLoadingAttachment {
                HStack { ProgressView(); Text("Preparing attachment…").manrope(.footnote); Spacer() }
            }
            if let replyTarget {
                MessageReplyComposerBar(preview: replyPreview(replyTarget)) {
                    self.replyTarget = nil
                    draftRevision += 1
                }
                .disabled(chat.isSending)
            }
            if let attachment {
                HStack(spacing: 10) {
                    if attachment.mimeType.hasPrefix("image/"), let image = UIImage(data: attachment.data) {
                        Image(uiImage: image).resizable().scaledToFill().frame(width: 48, height: 48).clipShape(RoundedRectangle(cornerRadius: 8))
                    } else { Image(systemName: "doc.richtext").font(.title2) }
                    VStack(alignment: .leading) {
                        Text(attachment.name).manrope(.footnote).lineLimit(1)
                        Text(ByteCountFormatter.string(fromByteCount: Int64(attachment.data.count), countStyle: .file))
                            .manrope(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button {
                        self.attachment = nil
                        attachmentError = nil
                        draftRevision += 1
                    } label: { Image(systemName: "xmark.circle.fill") }
                    .accessibilityLabel("Remove attachment")
                    .disabled(chat.isSending)
                }.padding(10).background(.quaternary, in: RoundedRectangle(cornerRadius: 14))
            }
            HStack(alignment: .bottom, spacing: 12) {
                Menu {
                    Button("Photo library", systemImage: "photo.on.rectangle") { showPhotoPicker = true }
                    Button("Choose file", systemImage: "doc") { showFilePicker = true }
                } label: {
                    Image(systemName: "paperclip")
                        .font(.system(size: sendIconSize, weight: .medium))
                        .frame(width: composerHeight, height: composerHeight)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .glassEffect(.regular.interactive(), in: Circle())
                .accessibilityLabel("Add attachment")
                .disabled(!chat.hasLoaded || chat.isUnavailable || chat.isSending || voice.isBusy || voice.hasRecording || isLoadingAttachment)
                TextField("Message", text: Binding(get: { draft }, set: {
                    draftRevision += 1
                    lastComposerActivity = .now
                    draft = $0
                }), axis: .vertical)
                    .focused($composerFocused)
                    .chatComposerFieldStyle()
                    .disabled(chat.isUnavailable || voice.isBusy || voice.hasRecording)
                ChatComposerActionButton(
                    symbol: voice.phase == .recording ? "stop.fill" : (draftIsEmpty ? "mic.fill" : "arrow.up"),
                    label: voice.phase == .recording ? "Stop recording and transcribe" : (draftIsEmpty ? "Record audio" : "Send message"),
                    isEnabled: actionEnabled,
                    tint: voice.phase == .recording ? .red : .accentColor
                ) {
                    if voice.phase == .recording {
                        voice.stop()
                    } else if draftIsEmpty {
                        composerFocused = false
                        voiceTask = Task { await voice.start() }
                    } else {
                        guard canSend else { return }
                        let submittedAttachment = attachment
                        let submittedReply = replyTarget
                        let submitted = draft
                        let submittedRevision = draftRevision
                        draft = ""
                        attachment = nil
                        replyTarget = nil
                        Task {
                            let accepted = await chat.send(text: submitted, attachment: submittedAttachment, replyTo: submittedReply, contactID: contactID, using: auth)
                            sync.request(.contact(contactID))
                            if !accepted, draftRevision == submittedRevision, draft.isEmpty {
                                draft = submitted
                                if attachment == nil { attachment = submittedAttachment }
                                if replyTarget == nil { replyTarget = submittedReply }
                            }
                        }
                    }
                }
            }
            if draft.unicodeScalars.count > 4000 {
                Text("Messages can contain up to 4,000 characters.").manrope(.caption).foregroundStyle(.red)
            }
        }
        .padding(.horizontal).padding(.vertical, 10)
    }
}
