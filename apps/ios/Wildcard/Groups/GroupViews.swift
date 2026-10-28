import AVFAudio
import PhotosUI
import UniformTypeIdentifiers
import SwiftUI
import UIKit

struct GroupConsentFields: View {
    let contributor: Bool
    @Binding var shareMemory: Bool
    @Binding var contributorConsent: Bool
    var body: some View {
        Section("Shared memory") {
            Text("Group members can see your name and profile photo. Everyone in this group can read its full history, including messages sent before they joined. Contacts use shared memories from their other conversations. What you say here can become a shared memory and be recalled in other chats with these contacts. Leaving stops access to your contributed group memories; messages remain visible in the group until it is deleted.")
                .manrope(.footnote).foregroundStyle(.secondary)
            Toggle("I accept shared memory", isOn: $shareMemory)
            if contributor {
                Text("Your selected model is Contributor. Group messages and shared memories sent to Meta may be used for model training.")
                    .manrope(.footnote).foregroundStyle(.secondary)
                Toggle("I accept Contributor data use", isOn: $contributorConsent)
            }
        }
    }
}

struct CreateGroupView: View {
    @Environment(AuthStore.self) private var auth
    @Environment(GroupsStore.self) private var groups
    let created: (String) -> Void
    @State private var name = ""
    @State private var shareMemory = false
    @State private var contributorConsent = false
    @State private var busy = false
    @State private var error: String?
    @State private var photoData: Data?
    @State private var photoChanged = false
    @State private var editingIdentity = false
    @State private var createdID: String?
    var body: some View {
        Form {
            Section {
                ProfileIdentityView(name: name, hasPhoto: photoData != nil, canEdit: !busy,
                                    isWorking: $editingIdentity, saveName: { name = $0 }, savePhoto: { photoData = $0; photoChanged = true }) {
                    if let photoData, let image = UIImage(data: photoData) {
                        Image(uiImage: image).resizable().scaledToFill().frame(width: 96, height: 96).clipShape(Circle())
                    } else { GroupPhotoAvatar(group: nil, size: 96) }
                }
                .listRowBackground(Color.clear).listRowSeparator(.hidden)
            }
            GroupConsentFields(contributor: groups.contributorModel, shareMemory: $shareMemory, contributorConsent: $contributorConsent)
            if let error { Text(error).foregroundStyle(.red) }
            Button("Create group") {
                guard !busy, !editingIdentity else { return }
                busy = true
                Task {
                    defer { busy = false }
                    do {
                        let id: String
                        if let createdID {
                            id = createdID
                            _ = try await GroupService.data(id, method: "PATCH", input: ["name": name], auth: auth)
                        } else {
                            let data = try await GroupService.data(method: "POST", input: ["name": name, "shareMemory": shareMemory, "contributorConsent": contributorConsent], auth: auth)
                            id = try JSONDecoder().decode(GroupIDResponse.self, from: data).id
                            createdID = id
                        }
                        if photoChanged {
                            let version = try await auth.withSession { api, token in try await api.saveGroupPhoto(id: id, data: photoData, token: token) }
                            if let photoData, let version { await auth.images.store(photoData, for: .groupAvatar(groupID: id, version: version)) }
                            photoChanged = false
                        }
                        await groups.refresh(using: auth)
                        created(id)
                    } catch is CancellationError { }
                    catch { self.error = error.localizedDescription }
                }
            }
            .disabled(busy || editingIdentity || !groups.hasLoaded)
        }
        .disabled(busy)
        .navigationTitle("Create group").navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(busy || editingIdentity)
        .task { await groups.refresh(using: auth) }
    }
}

struct GroupInvitationsView: View {
    @Environment(AuthStore.self) private var auth
    @Environment(GroupsStore.self) private var groups
    let joined: (String) -> Void
    @State private var selected: GroupInvitation?
    @State private var shareMemory = false
    @State private var contributorConsent = false
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        List {
            if let error = error ?? groups.error { Text(error).foregroundStyle(.red) }
            if groups.hasLoaded && groups.invitations.isEmpty { Text("No group invitations").foregroundStyle(.secondary) }
            ForEach(groups.invitations) { invitation in
                Button {
                    shareMemory = false
                    contributorConsent = false
                    selected = invitation
                } label: {
                    VStack(alignment: .leading) {
                        Text(invitation.groupName).manrope(.body, weight: .semibold)
                        Text("Invited by \(invitation.senderName)").manrope(.caption).foregroundStyle(.secondary)
                    }
                }
                .swipeActions {
                    Button("Decline", role: .destructive) {
                        Task {
                            do {
                                _ = try await GroupService.data("invitations/\(invitation.id)", method: "DELETE", auth: auth)
                                await groups.refresh(using: auth)
                            } catch is CancellationError { }
                            catch { self.error = error.localizedDescription }
                        }
                    }
                }
            }
        }
        .navigationTitle("Group Invitations").navigationBarTitleDisplayMode(.inline)
        .refreshable { await groups.refresh(using: auth) }
        .task { await groups.refresh(using: auth) }
        .sheet(item: $selected) { invitation in
            NavigationStack {
                Form {
                    Text("Join \(invitation.groupName)").manrope(.title3, weight: .semibold)
                    GroupConsentFields(contributor: groups.contributorModel, shareMemory: $shareMemory, contributorConsent: $contributorConsent)
                    if let error { Text(error).foregroundStyle(.red) }
                    Button("Accept invitation") {
                        busy = true
                        Task {
                            defer { busy = false }
                            do {
                                let data = try await GroupService.data("invitations/\(invitation.id)/accept", method: "POST", input: ["shareMemory": shareMemory, "contributorConsent": contributorConsent], auth: auth)
                                let result = try JSONDecoder().decode(GroupIDResponse.self, from: data)
                                await groups.refresh(using: auth)
                                selected = nil
                                groups.conversations.remove(id: result.id)
                                joined(result.id)
                            } catch is CancellationError { }
                            catch { self.error = error.localizedDescription }
                        }
                    }
                }
                .disabled(busy)
                .navigationTitle("Join group").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { selected = nil }.disabled(busy) } }
            }
            .interactiveDismissDisabled(busy)
        }
    }
}

struct GroupChatView: View {
    let groupID: String
    @Environment(ConversationSync.self) private var sync
    @Environment(AuthStore.self) private var auth
    @Environment(GroupsStore.self) private var groups
    @Environment(\.scenePhase) private var scenePhase
    let store: GroupChatStore
    @State private var isVisible = false
    @State private var draft = ""
    @State private var attachment: DraftAttachment?
    @State private var photoSelection: PhotosPickerItem?
    @State private var showPhotoPicker = false
    @State private var showFilePicker = false
    @State private var isLoadingAttachment = false
    @State private var attachmentError: String?
    @State private var attachmentTask: Task<Void, Never>?
    @State private var draftRevision = 0
    @State private var voice = VoiceRecorder()
    @State private var voiceTask: Task<Void, Never>?
    @State private var nearBottom = true
    @State private var composerBarHeight: CGFloat = 0
    @State private var animateNewMessages = false
    @State private var replyTarget: MessageReplyQuote?
    @State private var highlightedMessage: String?
    @State private var quoteTask: Task<Void, Never>?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @FocusState private var composerFocused: Bool
    @ScaledMetric(relativeTo: .body) private var composerControlHeight: CGFloat = 44
    @ScaledMetric(relativeTo: .caption2) private var memberLineHeight: CGFloat = 16

    private var canSend: Bool {
        (!draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || attachment != nil) && draft.unicodeScalars.count <= 4000
            && !store.isSending && store.pendingID == nil && store.snapshot != nil
            && !voice.isBusy && !voice.hasRecording && !isLoadingAttachment
    }
    private var draftIsEmpty: Bool { draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && attachment == nil }
    private var canUseMicrophone: Bool {
        store.snapshot != nil && !store.isSending && store.pendingID == nil && !voice.isBusy && !isLoadingAttachment
    }
    private var actionEnabled: Bool {
        if voice.phase == .recording { return true }
        return draftIsEmpty ? canUseMicrophone : canSend
    }
    private func failedReplies(for message: GroupMessage) -> [GroupReply] {
        (store.snapshot?.replies ?? []).filter { reply in
            reply.status == "failed" && reply.sourceID == message.id &&
            !store.messages.contains { $0.agentID == reply.agentID && $0.sequence > message.sequence }
        }
    }
    private func replyPreview(_ quote: MessageReplyQuote) -> MessageReplyPreview {
        if quote.agentID == nil, let userID = quote.userID, userID == auth.user?.id {
            return MessageReplyPreview(quote: quote, author: "You", color: .accentColor)
        }
        let member = store.snapshot?.members.first {
            $0.id == (quote.agentID ?? quote.userID) && $0.kind == (quote.agentID == nil ? "user" : "agent")
        }
        let identity = quote.agentID.map { "agent/\($0)" } ?? quote.userID.map { "user/\($0)" } ?? "message/\(quote.messageID)"
        return MessageReplyPreview(quote: quote, author: member?.name ?? quote.senderName ?? "Unknown member",
                                   color: GroupMemberColor.color(groupID: groupID, identity: identity))
    }
    private func reply(to message: GroupMessage) {
        guard store.snapshot != nil else { return }
        replyTarget = .local(messageID: message.id, side: "group", text: message.text, attachment: message.attachment,
                             userID: message.userID, agentID: message.agentID, senderName: message.senderName)
        composerFocused = true
    }
    /// Scroll to a quoted message, paging earlier history within a bound when needed.
    private func showQuoted(_ quote: MessageReplyQuote, proxy: ScrollViewProxy) {
        guard quote.available else { return }
        quoteTask?.cancel()
        quoteTask = Task {
            for _ in 0..<20 where !store.messages.contains(where: { $0.id == quote.messageID }) {
                guard let cursor = store.nextBefore, !Task.isCancelled else { break }
                await store.loadMore(id: groupID, auth: auth)
                if store.nextBefore == cursor { break }
            }
            guard !Task.isCancelled, store.messages.contains(where: { $0.id == quote.messageID }) else { return }
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.22)) { proxy.scrollTo(quote.messageID, anchor: .center) }
            highlightedMessage = quote.messageID
            do { try await Task.sleep(for: .seconds(1.2)) } catch { return }
            if highlightedMessage == quote.messageID {
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) { highlightedMessage = nil }
            }
        }
    }
    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 16) {
                    if store.nextBefore != nil {
                        Button("Load earlier messages") { Task { await store.loadMore(id: groupID, auth: auth) } }
                            .disabled(store.isLoadingMore)
                    }
                    if !store.hasLoadedMessages && store.messages.isEmpty && store.pendingText == nil && store.error == nil {
                        ProgressView("Loading messages…")
                    }
                    if store.hasLoadedMessages && store.snapshot != nil && store.messages.isEmpty && store.pendingText == nil {
                        ContentUnavailableView {
                            Label("Start a conversation", systemImage: "bubble.left.and.bubble.right")
                                .manrope(.title2, weight: .semibold)
                        } description: {
                            Text("Send your first message.").manrope()
                        }
                    }
                    ForEach(store.messages) { message in
                        GroupMessageRow(message: message, groupID: groupID, members: store.snapshot?.members ?? [],
                                        isNew: store.newIncomingMessageIDs.contains(message.id),
                                        replyQuote: message.replyTo.map(replyPreview),
                                        canReply: store.snapshot != nil,
                                        onQuoteTap: { if let quote = message.replyTo { showQuoted(quote, proxy: proxy) } },
                                        onReply: { reply(to: message) })
                            .messageHighlight(highlightedMessage == message.id)
                            .id(message.id)
                        ForEach(failedReplies(for: message)) { reply in
                            VStack(alignment: .leading, spacing: 4) {
                                Text("\(reply.name) couldn't finish replying to this message.")
                                    .foregroundStyle(.secondary)
                                Button("Retry reply") {
                                    Task {
                                        do {
                                            _ = try await GroupService.data("\(groupID)/replies/\(reply.id)/retry", method: "POST", auth: auth)
                                            await store.refresh(id: groupID, auth: auth)
                                        } catch is CancellationError { }
                                        catch { store.error = error.localizedDescription }
                                    }
                                }
                                .disabled((store.snapshot?.replies ?? []).contains { $0.status == "queued" || $0.status == "running" })
                            }
                            .manrope(.footnote)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    if let pending = store.pendingText {
                        let pendingQuote = store.pendingReplyTo.map(replyPreview)
                        if let file = store.pendingAttachment {
                            ChatAttachmentView(attachment: ChatAttachment(name: file.name, mimeType: file.mimeType, size: file.data.count),
                                               contactID: groupID, turnID: store.pendingID ?? "pending", groupID: groupID,
                                               sentAt: store.pendingSentAt ?? 0, caption: file.mimeType.hasPrefix("image/") ? pending : "",
                                               receiptState: "sent", isSending: !store.pendingAccepted, localData: file.data,
                                               replyQuote: pendingQuote)
                        }
                        if !pending.isEmpty && store.pendingAttachment?.mimeType.hasPrefix("image/") != true {
                            MessageBubbleView(text: pending, sentAt: store.pendingSentAt ?? 0, fromUser: true, receiptState: "sent", isSending: !store.pendingAccepted,
                                              replyQuote: store.pendingAttachment == nil ? pendingQuote : nil)
                        }
                    }
                    ForEach((store.snapshot?.replies ?? []).filter { $0.status == "running" }) { reply in
                        HStack(spacing: 6) {
                            Text(reply.name).manrope(.caption, weight: .semibold)
                            ReplyTypingIndicator()
                        }
                    }
                    Color.clear.frame(height: 1).id("latest")
                }
                .padding()
                .animation(animateNewMessages ? .easeOut(duration: reduceMotion ? 0.15 : 0.22) : nil,
                           value: store.messages.last?.id)
                .animation(animateNewMessages ? .easeOut(duration: reduceMotion ? 0.15 : 0.22) : nil,
                           value: store.pendingID)
            }
            .defaultScrollAnchor(.bottom)
            .scrollEdgeEffectStyle(.soft, for: .bottom)
            .scrollDismissesKeyboard(.interactively)
            .onScrollGeometryChange(for: Bool.self) { geometry in
                geometry.contentSize.height - geometry.visibleRect.maxY < 80
            } action: { _, value in nearBottom = value }
            .onChange(of: store.messages.last?.id) { previous, _ in
                if nearBottom || previous == nil { scrollToLatest(using: proxy) }
            }
            .onChange(of: store.pendingID) { _, id in
                if id != nil { scrollToLatest(using: proxy) }
            }
            .safeAreaBar(edge: .bottom, spacing: 0) {
                composer(proxy: proxy)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { composerBarHeight = $0 }
            }
            .overlay(alignment: .bottomTrailing) {
                if !nearBottom && !store.messages.isEmpty {
                    ChatScrollToLatestButton { scrollToLatest(using: proxy) }
                        .padding(.trailing, 16)
                        .padding(.bottom, composerBarHeight + 8)
                        .transition(.opacity)
                }
            }
            .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: nearBottom)
            .refreshable { await store.refresh(id: groupID, auth: auth) }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                NavigationLink(value: HomeDestination.groupDetails(groupID)) {
                    HStack(spacing: 6) {
                        GroupPhotoAvatar(group: store.snapshot?.group, size: 38)
                        VStack(alignment: .leading, spacing: -2) {
                            Text(store.snapshot?.group.name ?? "Group")
                                .manrope(.headline, weight: .semibold)
                                .foregroundStyle(Color(uiColor: .label))
                                .lineLimit(1)
                            GroupMarquee(text: store.snapshot?.members.map(\.name).joined(separator: ", ") ?? "Loading...")
                                .frame(width: 160, height: memberLineHeight)
                        }
                    }
                    .padding(.leading, -6)
                    .padding(.trailing, 8)
                }
                .tint(Color(uiColor: .label))
                .accessibilityLabel(store.snapshot?.group.name ?? "Group details")
                .accessibilityValue(store.snapshot?.members.map(\.name).joined(separator: ", ") ?? "Loading...")
            }
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
                    guard store.snapshot != nil else { return }
                    attachment = DraftAttachment(name: "Photo.jpg", mimeType: "image/jpeg", data: bytes)
                    draftRevision += 1
                } catch is CancellationError { }
                catch { attachmentError = error.localizedDescription }
            }
        }
        .onChange(of: voice.phase) { _, phase in
            if phase == .ready { transcribeRecording() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { noteVisibleMessagesRead() }
            if phase == .background { cancelRecording(); attachmentTask?.cancel() }
        }
        .onChange(of: store.hasLoadedMessages) { _, loaded in
            if loaded { animateNewMessages = true }
        }
        .onChange(of: store.snapshot?.group.id) { _, id in
            if id == nil {
                cancelRecording()
                attachmentTask?.cancel()
                attachment = nil
                replyTarget = nil
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.didBecomeInactiveNotification)) { _ in voice.interrupt() }
        .onAppear {
            store.isRetained = true
            isVisible = true
            sync.visible = .group(groupID)
            sync.request(.group(groupID))
            noteVisibleMessagesRead()
            MessageSounds.shared.visibleContactID = MessageSounds.groupConversationID(groupID)
        }
        .onDisappear {
            noteVisibleMessagesRead()
            store.didLeave()
            isVisible = false
            if sync.visible == .group(groupID) { sync.visible = nil }
            if MessageSounds.shared.visibleContactID == MessageSounds.groupConversationID(groupID) {
                MessageSounds.shared.visibleContactID = nil
            }
            cancelRecording()
            attachmentTask?.cancel()
            quoteTask?.cancel()
        }
        .task(id: "\(groupID)-\(isVisible)-\(scenePhase)-\(store.messages.last?.id ?? "")") {
            guard isVisible, scenePhase == .active else { return }
            sync.request(.group(groupID))
            while !Task.isCancelled {
                await store.acknowledge(store.messages.map(\.id), state: "received", id: groupID, auth: auth)
                animateNewMessages = true
                do { try await Task.sleep(for: .seconds(3)) } catch { return }
            }
        }
        .onChange(of: store.messages.last?.sequence) { _, _ in noteVisibleMessagesRead() }
    }

    private func noteVisibleMessagesRead() {
        guard isVisible, scenePhase == .active, let sequence = store.messages.last?.sequence else { return }
        groups.noteRead(id: groupID, sequence: sequence, using: auth)
    }
    private func composer(proxy: ScrollViewProxy) -> some View {
        VStack(spacing: 8) {
            if let error = store.error {
                HStack(alignment: .top) {
                    Text(error).manrope(.footnote).foregroundStyle(.red)
                    Spacer()
                    Button("Refresh") { Task { await store.refresh(id: groupID, auth: auth) } }
                        .manrope(.footnote)
                }
            }
            if let pending = store.pendingText, !store.isSending, !store.pendingAccepted {
                Button("Retry sending") { send(pending, file: store.pendingAttachment, reply: store.pendingReplyTo, proxy: proxy) }
                    .manrope(.footnote).frame(maxWidth: .infinity, alignment: .leading)
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
                .disabled(store.isSending)
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
                    .disabled(store.isSending)
                }.padding(10).background(.quaternary, in: RoundedRectangle(cornerRadius: 14))
            }
            HStack(alignment: .bottom, spacing: 12) {
                Menu {
                    Button("Photo library", systemImage: "photo.on.rectangle") { showPhotoPicker = true }
                    Button("Choose file", systemImage: "doc") { showFilePicker = true }
                } label: {
                    Image(systemName: "paperclip")
                        .font(.system(size: 20, weight: .medium))
                        .frame(width: composerControlHeight, height: composerControlHeight)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .glassEffect(.regular.interactive(), in: Circle())
                .accessibilityLabel("Add attachment")
                .disabled(store.snapshot == nil || store.isSending || store.pendingID != nil || voice.isBusy || voice.hasRecording || isLoadingAttachment)
                TextField("Message", text: Binding(get: { draft }, set: { draftRevision += 1; draft = $0 }), axis: .vertical)
                    .focused($composerFocused)
                    .chatComposerFieldStyle()
                    .disabled(store.snapshot == nil || voice.isBusy || voice.hasRecording)
                ChatComposerActionButton(
                    symbol: voice.phase == .recording ? "stop.fill" : (draftIsEmpty ? "mic.fill" : "arrow.up"),
                    label: voice.phase == .recording ? "Stop recording and transcribe" : (draftIsEmpty ? "Record audio" : "Send message"),
                    isEnabled: actionEnabled, tint: voice.phase == .recording ? .red : .accentColor
                ) {
                    if voice.phase == .recording { voice.stop() }
                    else if draftIsEmpty {
                        composerFocused = false
                        voiceTask = Task { await voice.start() }
                    } else {
                        guard canSend else { return }
                        send(draft, file: attachment, reply: replyTarget, proxy: proxy)
                    }
                }
            }
            if draft.unicodeScalars.count > 4000 {
                Text("Messages can contain up to 4,000 characters.").manrope(.caption).foregroundStyle(.red)
            }
        }
        .padding(.horizontal).padding(.vertical, 10)
    }

    private func scrollToLatest(using proxy: ScrollViewProxy) {
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.22)) {
            proxy.scrollTo("latest", anchor: .bottom)
        }
    }

    private func cancelRecording() {
        voiceTask?.cancel()
        voiceTask = nil
        voice.cancel()
    }
    private func transcribeRecording() {
        voiceTask?.cancel()
        voiceTask = Task {
            if let text = await voice.transcribe(contactID: groupID, groupID: groupID, using: auth), !Task.isCancelled {
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
    private func send(_ text: String, file: DraftAttachment?, reply: MessageReplyQuote?, proxy: ScrollViewProxy) {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty || file != nil else { return }
        let submittedRevision = draftRevision
        if draft.trimmingCharacters(in: .whitespacesAndNewlines) == value { draft = "" }
        if attachment == file { attachment = nil }
        if replyTarget?.messageID == reply?.messageID { replyTarget = nil }
        nearBottom = true
        Task {
            let success = await store.send(value, attachment: file, replyTo: reply, id: groupID, auth: auth)
            sync.request(.group(groupID))
            if !success, draftRevision == submittedRevision, draft.isEmpty {
                draft = value
                if attachment == nil { attachment = file }
                if replyTarget == nil { replyTarget = reply }
            }
            scrollToLatest(using: proxy)
        }
    }

}

private struct GroupMessageRow: View {
    let message: GroupMessage
    let groupID: String
    let members: [GroupMember]
    let isNew: Bool
    let replyQuote: MessageReplyPreview?
    let canReply: Bool
    let onQuoteTap: () -> Void
    let onReply: () -> Void
    @Environment(AuthStore.self) private var auth
    @Environment(GroupsStore.self) private var groups
    @Environment(\.scenePhase) private var scenePhase
    @State private var isOnScreen = false
    private var own: Bool { message.userID == auth.user?.id && message.agentID == nil }
    private var sender: GroupMember? {
        members.first { $0.id == (message.agentID ?? message.userID) && $0.kind == (message.agentID == nil ? "user" : "agent") }
    }
    private var senderColor: Color {
        let identity = message.agentID.map { "agent/\($0)" }
            ?? message.userID.map { "user/\($0)" }
            ?? "message/\(message.id)"
        return GroupMemberColor.color(groupID: groupID, identity: identity)
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if !own { GroupAvatar(member: sender, groupID: groupID, size: 30) }
            VStack(alignment: .leading, spacing: 4) {
                if let file = message.attachment {
                    ChatAttachmentView(attachment: file, contactID: groupID, turnID: message.id, groupID: groupID,
                                       sentAt: message.createdAt, caption: file.isImage ? message.text : "", receiptState: message.receiptState ?? "sent", fromUser: own, showsReceipt: own,
                                       senderName: own ? nil : (sender?.name ?? message.senderName),
                                      senderColor: senderColor, replyQuote: replyQuote, onQuoteTap: onQuoteTap)
                }
                if !message.text.isEmpty && message.attachment?.isImage != true {
                    MessageBubbleView(text: message.text, sentAt: message.createdAt, fromUser: own, receiptState: message.receiptState ?? "sent", showsReceipt: own,
                                      senderName: own ? nil : (sender?.name ?? message.senderName),
                                      senderColor: senderColor, replyQuote: message.attachment == nil ? replyQuote : nil, onQuoteTap: onQuoteTap)
                }
            }
        }
        .swipeToReply(enabled: canReply, action: onReply)
        .messageReactions(groups.conversations.store(for: groupID).reactions, path: "groups/\(groupID)/reactions", messageID: message.id, side: "group", fromUser: own,
                          onReply: canReply ? onReply : nil)
        .onScrollVisibilityChange(threshold: 0.5) { isOnScreen = $0 }
        .task(id: "\(message.id)-\(isOnScreen)-\(scenePhase)") {
            guard isOnScreen, scenePhase == .active, !own else { return }
            await groups.conversations.store(for: groupID).acknowledge([message.id], state: "read", id: groupID, auth: auth)
        }
        .task(id: message.id) {
            guard isNew, !own else { return }
            do { try await Task.sleep(for: .milliseconds(250)) } catch { return }
            guard !Task.isCancelled, MessageSounds.shared.visibleContactID == MessageSounds.groupConversationID(groupID),
                  let userID = auth.user?.id else { return }
            MessageSounds.shared.receivedGroup(messageID: message.id, groupID: groupID, userID: userID,
                completedAt: Date(timeIntervalSince1970: message.createdAt / 1000), isVisible: true)
        }
    }
}

struct GroupAvatar: View {
    let member: GroupMember?
    let groupID: String
    var size: CGFloat = 40
    @Environment(AuthStore.self) private var auth
    @State private var image: UIImage?
    @State private var loadedResource: CachedImageResource?
    private var resource: CachedImageResource? {
        guard let member, let version = member.photoVersion else { return nil }
        return .groupMemberAvatar(groupID: groupID, kind: member.kind, memberID: member.id, version: version)
    }
    private var displayedImage: UIImage? {
        guard let resource else { return nil }
        if loadedResource == resource, let image { return image }
        return auth.images.cachedImage(resource, maxPixelSize: 288)
    }
    var body: some View {
        Group {
            if let image = displayedImage { Image(uiImage: image).resizable().scaledToFill() }
            else { Image(systemName: member?.kind == "agent" ? "person.crop.circle.fill" : "person.circle.fill").resizable().scaledToFit().foregroundStyle(.secondary) }
        }
        .frame(width: size, height: size).clipShape(Circle()).accessibilityHidden(true)
        .task(id: resource) {
            image = nil
            loadedResource = nil
            guard let resource else { return }
            do {
                let loaded = try await auth.cachedImage(resource, maxPixelSize: 288)
                try Task.checkCancellation()
                image = loaded
                loadedResource = resource
            } catch { }
        }
    }
}

private struct GroupMarquee: View {
    let text: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var textWidth: CGFloat = 0
    @State private var animationStart = Date.now
    var body: some View {
        GeometryReader { geometry in
            TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion || scenePhase != .active || textWidth <= geometry.size.width)) { context in
                let overflow = max(0, textWidth - geometry.size.width)
                let duration = Double(overflow / 24)
                let phase = max(0, context.date.timeIntervalSince(animationStart))
                    .truncatingRemainder(dividingBy: max(1, duration * 2 + 4))
                let offset = phase < 2 ? 0 : (phase < duration + 2 ? (phase - 2) * 24
                    : (phase < duration + 4 ? Double(overflow) : Double(overflow) - (phase - duration - 4) * 24))
                Text(text).manrope(.caption2).foregroundStyle(.secondary).fixedSize(horizontal: true, vertical: false)
                    .onGeometryChange(for: CGFloat.self) { $0.size.width } action: {
                        textWidth = $0
                        animationStart = .now
                    }
                    .offset(x: reduceMotion ? 0 : -min(Double(overflow), max(0, offset)))
            }
            // Clip the moving text to the subtitle viewport, not its intrinsic width.
            .frame(width: geometry.size.width, height: geometry.size.height, alignment: .leading)
            .clipped()
            .onChange(of: text) { _, _ in animationStart = .now }
            .onChange(of: geometry.size.width) { _, _ in animationStart = .now }
        }
        .accessibilityElement(children: .ignore).accessibilityLabel(text)
    }
}
