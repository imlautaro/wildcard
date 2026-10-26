import SwiftUI

struct ChatView: View {
    let contactID: String
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.scenePhase) private var scenePhase
    @State private var chat = ChatStore()
    @State private var draft = ""
    @FocusState private var composerFocused: Bool

    private var canSend: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && draft.unicodeScalars.count <= 4000
            && chat.hasLoaded && !chat.hasPendingReply && !chat.isSending && !chat.isUnavailable
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
                    if chat.hasLoaded && chat.turns.isEmpty {
                        ContentUnavailableView {
                            Label("Start a conversation", systemImage: "bubble.left.and.bubble.right")
                                .manrope(.title2, weight: .semibold)
                        } description: {
                            Text("Send your first message.").manrope()
                        }
                    }
                    ForEach(chat.turns) { turn in
                        bubble(turn.userText, fromUser: true)
                        if let reply = turn.assistantText { bubble(reply, fromUser: false) }
                        else if turn.isPending {
                            HStack(spacing: 8) {
                                ProgressView()
                                Text("Thinking…").manrope(.subheadline).foregroundStyle(.secondary)
                                Spacer()
                            }
                            .accessibilityElement(children: .combine)
                        } else if turn.status == .failed {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("The reply could not be completed.").manrope(.footnote).foregroundStyle(.secondary)
                                if turn.id == chat.turns.last?.id {
                                    Button("Retry reply") { Task { await chat.retry(turn, contactID: contactID, using: auth) } }
                                        .disabled(chat.isSending || chat.hasPendingReply)
                                }
                            }.frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    Color.clear.frame(height: 1).id("latest")
                }
                .padding()
            }
            .scrollDismissesKeyboard(.interactively)
            .defaultScrollAnchor(.bottom)
            .onChange(of: chat.turns.last) { _, _ in
                withAnimation { proxy.scrollTo("latest", anchor: .bottom) }
                Task { try? await contacts.refreshContact(id: contactID, using: auth) }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) { composer }
            .refreshable { await chat.refresh(contactID: contactID, using: auth) }
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled {
                await chat.refresh(contactID: contactID, using: auth)
                if chat.isUnavailable { return }
                do { try await Task.sleep(for: .seconds(3)) }
                catch { return }
            }
        }
    }

    private func bubble(_ text: String, fromUser: Bool) -> some View {
        HStack {
            if fromUser { Spacer(minLength: 40) }
            Text(text).manrope().textSelection(.enabled)
                .padding(.horizontal, 16).padding(.vertical, 12)
                .foregroundStyle(fromUser ? Color.white : Color.primary)
                .background(fromUser ? Color.accentColor : Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 20))
            if !fromUser { Spacer(minLength: 40) }
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
            HStack(alignment: .bottom, spacing: 12) {
                TextField("Message", text: $draft, axis: .vertical)
                    .manrope().lineLimit(1...6).focused($composerFocused)
                    .padding(12)
                    .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 22))
                    .disabled(chat.isUnavailable)
                Button {
                    let submitted = draft
                    Task {
                        if await chat.send(text: submitted, contactID: contactID, using: auth), draft == submitted { draft = "" }
                    }
                } label: {
                    Image(systemName: "arrow.up").font(.system(size: 20, weight: .semibold))
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.glassProminent)
                .accessibilityLabel("Send message")
                .disabled(!canSend)
            }
            if draft.unicodeScalars.count > 4000 {
                Text("Messages can contain up to 4,000 characters.").manrope(.caption).foregroundStyle(.red)
            }
        }
        .padding(.horizontal).padding(.vertical, 10)
        .background(.bar)
    }
}
