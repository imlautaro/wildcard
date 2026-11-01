import SwiftUI

/// The For you tab: a timeline of posts the person's contacts write together, newest first
/// (see docs/updates.md#posts). Tapping a post opens its topic as a thread.
struct UpdatesView: View {
    let store: HomeFeedStore
    @Binding var following: Bool
    @Binding var managing: Bool
    let openChats: () -> Void
    let openContact: (String) -> Void
    let openGroup: (String) -> Void
    let openThread: (String) -> Void
    let openPost: (String) -> Void
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var openedApp: HomeFeed.App?
    @State private var actionError: String?
    // "N new posts": posts that arrive while the person is scrolled down are announced instead of
    // appearing silently above them; at the top they just show.
    @State private var known: Set<String> = []
    @State private var fresh = 0
    @State private var scrolled = false

    private var feed: HomeFeed? { store.feed }
    private var posts: [HomePost] { feed?.timeline ?? [] }
    private var busy: Bool { feed?.setupState == "creating_contacts" || feed?.isUpdating == true || feed?.isReplying == true }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 14) {
                        if feed?.setupState == nil { composer }
                        if let feed, feed.isUpdating { HomeStatusPill(feed: feed) }
                        if let message = notice { noticeView(message) }
                    }
                    .padding(.horizontal, 16)
                    .id("updates-top")
                    strip
                    timeline
                }
                .padding(.top, 4)
                .padding(.bottom, 32)
                .animation(reduceMotion ? nil : .snappy, value: posts.map(\.id))
                .animation(reduceMotion ? nil : .snappy, value: feed?.isUpdating)
            }
            .onScrollGeometryChange(for: Bool.self) { $0.contentOffset.y + $0.contentInsets.top > 120 } action: { _, value in
                scrolled = value
                if !value { fresh = 0 }
            }
            .overlay(alignment: .top) {
                if fresh > 0 {
                    Button {
                        fresh = 0
                        withAnimation(reduceMotion ? nil : .snappy) { proxy.scrollTo("updates-top", anchor: .top) }
                    } label: {
                        Label(fresh == 1 ? "1 new post" : "\(fresh) new posts", systemImage: "arrow.up")
                            .manrope(.subheadline, weight: .semibold)
                            .padding(.horizontal, 16).padding(.vertical, 10)
                    }
                    .buttonStyle(.glassProminent)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
        }
        .background(Color(.systemBackground))
        .onChange(of: posts.map(\.id), initial: true) { _, ids in
            let added = ids.filter { !known.contains($0) }
            let first = known.isEmpty
            known.formUnion(added)
            if !first, !added.isEmpty, scrolled { fresh += added.count }
        }
        .refreshable { await run { try await store.requestUpdate(using: auth) } }
        // Restarts when a run starts or ends, so Update now never waits out a 60-second sleep.
        .task(id: "\(scenePhase)-\(busy)") {
            guard scenePhase == .active else { return }
            await store.refresh(using: auth, force: busy || feed?.setupState != nil)
            // Poll briefly while contacts are preparing posts or answering; otherwise revalidate stale data.
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(busy ? 4 : 60)) } catch { return }
                await store.refresh(using: auth, force: busy)
            }
        }
        .sheet(isPresented: $following) { HomeFollowSheet(store: store) }
        .sheet(isPresented: $managing) { HomeTopicsSheet(store: store) }
        .fullScreenCover(item: $openedApp) { app in MiniAppScreen(base: app.base, appID: app.id) }
        .alert("For you", isPresented: Binding(get: { actionError != nil }, set: { if !$0 { actionError = nil } })) {
            Button("OK") { actionError = nil }
        } message: { Text(actionError ?? "") }
    }

    /// Like a social app's "What's new?" box: opens the follow sheet.
    private var composer: some View {
        Button { following = true } label: {
            HStack(spacing: 12) {
                AccountAvatar(user: auth.user, size: 36)
                Text("What should your contacts follow?").manrope(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                Spacer(minLength: 8)
                Text("Follow").manrope(.subheadline, weight: .semibold)
                    .padding(.horizontal, 14).padding(.vertical, 7)
                    .overlay(Capsule().strokeBorder(Color.secondary.opacity(0.3)))
            }
            .padding(.leading, 8).padding(.trailing, 6).padding(.vertical, 6)
            .overlay(Capsule().strokeBorder(Color.secondary.opacity(0.25)))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Follow something in For you")
    }

    private var notice: String? {
        if let error = store.error, feed == nil { return error }
        guard let feed else { return nil }
        if !feed.enabled { return "Curated cards are turned off on this server. Your apps and agenda still show here." }
        if feed.setupState != nil || feed.isUpdating { return nil }
        switch feed.error {
        case nil: return nil
        default: return "Your contacts couldn’t finish your updates. They’ll try again in a few minutes."
        }
    }

    private func noticeView(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "info.circle.fill").foregroundStyle(.secondary)
            Text(message).manrope(.footnote).frame(maxWidth: .infinity, alignment: .leading)
            if store.error != nil && feed == nil { Button("Retry") { Task { await store.refresh(using: auth, force: true) } }.manrope(.footnote, weight: .semibold) }
        }
        .padding(14)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    /// Coming up and the person's apps as one thin strip of chips above the timeline, like the web.
    @ViewBuilder private var strip: some View {
        let agenda = feed?.agenda ?? [], apps = feed?.apps ?? []
        if !agenda.isEmpty || !apps.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(agenda) { item in
                        Button {
                            if let id = item.contactID { openContact(id) } else if let id = item.groupID { openGroup(id) }
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: item.kind == "task" ? "checklist" : "clock.fill")
                                    .font(.system(size: 12, weight: .semibold)).foregroundStyle(item.kind == "task" ? Color.orange : Color.accentColor)
                                    .frame(width: 28, height: 28)
                                    .background((item.kind == "task" ? Color.orange : Color.accentColor).opacity(0.14), in: Circle())
                                VStack(alignment: .leading, spacing: 0) {
                                    Text(item.title).manrope(.footnote, weight: .semibold).lineLimit(1)
                                    Text(agendaDetail(item)).manrope(.caption2).foregroundStyle(.secondary).lineLimit(1)
                                }
                                .frame(maxWidth: 200, alignment: .leading)
                            }
                            .padding(.leading, 6).padding(.trailing, 12).padding(.vertical, 6)
                            .background(Color(.secondarySystemBackground), in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityElement(children: .combine)
                    }
                    ForEach(apps) { app in
                        Button { openedApp = app } label: {
                            HStack(spacing: 8) {
                                Image(systemName: MiniApp.symbol(app.icon))
                                    .font(.system(size: 12, weight: .semibold)).foregroundStyle(.white)
                                    .frame(width: 28, height: 28)
                                    .background(Color.accentColor.gradient, in: Circle())
                                Text(app.title).manrope(.footnote, weight: .semibold).lineLimit(1)
                            }
                            .padding(.leading, 6).padding(.trailing, 12).padding(.vertical, 6)
                            .background(Color(.secondarySystemBackground), in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(app.title), mini app\(app.ownerName.map { " by \($0)" } ?? "")")
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    private func agendaDetail(_ item: HomeFeed.AgendaItem) -> String {
        let owner = item.name ?? ""
        if let at = item.at {
            return "\(owner) · \(Date(timeIntervalSince1970: at / 1000).formatted(.relative(presentation: .named)))"
        }
        return item.kind == "task" ? "\(owner) · Assigned to you" : owner
    }

    @ViewBuilder private var timeline: some View {
        if posts.isEmpty {
            Group {
                if feed?.setupState != nil {
                    empty
                } else if feed?.isUpdating == true || (feed == nil && store.error == nil) {
                    ForEach(0..<3, id: \.self) { index in HomeCardPlaceholder(height: index == 0 ? 220 : 150) }
                } else if feed?.enabled == true {
                    empty
                }
            }
            .padding(.horizontal, 16)
        } else {
            let counts = Dictionary(grouping: posts, by: \.topicID).mapValues(\.count)
            LazyVStack(alignment: .leading, spacing: 0) {
                Divider()
                ForEach(posts) { post in
                    HomePostView(post: post, threadCount: counts[post.topicID] ?? 0) { action in handle(action, post: post) }
                        .padding(.top, 12).padding(.bottom, 16)
                        .transition(.opacity)
                    Divider()
                }
            }
        }
    }

    private var empty: some View {
        VStack(spacing: 12) {
            Image(systemName: "house").font(.system(size: 40)).foregroundStyle(Color.accentColor)
            Text(emptyTitle).manrope(.headline, weight: .bold).multilineTextAlignment(.center)
            Text(emptyMessage)
                .manrope(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            if feed?.setupState == "needs_contacts" {
                NavigationLink(value: HomeDestination.contacts) { Text("Add a contact") }
                    .buttonStyle(.glassProminent).manrope(.subheadline, weight: .semibold)
            } else if feed?.setupState == "creating_contacts" {
                Button("Go to Chats", action: openChats).buttonStyle(.glassProminent).manrope(.subheadline, weight: .semibold)
            } else {
                Button("Start a chat", action: openChats).buttonStyle(.glassProminent).manrope(.subheadline, weight: .semibold)
                Button("Follow something") { following = true }.manrope(.subheadline, weight: .semibold)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: HomeStyle.corner, style: .continuous))
    }

    private var emptyTitle: String {
        switch feed?.setupState {
        case "needs_contacts": "Make yourself at home"
        case "creating_contacts": "Your circle is taking shape"
        default: "A feed that grows with you"
        }
    }

    private var emptyMessage: String {
        switch feed?.setupState {
        case "needs_contacts": "Add your first contact and start a conversation. This feed will fill with posts about the things you’re into."
        case "creating_contacts": "Your contacts are being created. Head to Chats to meet each one as soon as they’re ready. Posts will appear here as you get to know them."
        default: "Chat with your contacts or follow a topic you’re into. They’ll bring fresh posts here when there’s something to share."
        }
    }

    private func handle(_ action: HomeCardAction, post: HomePost) {
        Task {
            await run { try await store.perform(action, on: post, auth: auth, contacts: contacts, openContact: openContact, openThread: openThread, openPost: openPost) }
        }
    }

    private func run(_ operation: () async throws -> Void) async {
        do { try await operation() }
        catch is CancellationError {}
        catch { actionError = error.localizedDescription }
    }
}

/// Live progress while contacts prepare cards.
private struct HomeStatusPill: View {
    let feed: HomeFeed
    @Environment(ContactsStore.self) private var contacts

    var body: some View {
        HStack(spacing: 10) {
            if let progress = feed.progress {
                ContactAvatar(contact: contacts.contact(id: progress.contactID), size: 24)
                Text("\(progress.contactName ?? "A contact") is preparing \(progress.title)")
                    .manrope(.footnote, weight: .semibold).lineLimit(1)
                Spacer(minLength: 4)
                Text("\(min(progress.done + 1, progress.total))/\(progress.total)").manrope(.caption, weight: .bold).monospacedDigit().foregroundStyle(.secondary)
            } else {
                ProgressView().controlSize(.small)
                Text("Your contacts are preparing updates…").manrope(.footnote, weight: .semibold)
                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .glassEffect(.regular, in: Capsule())
        .transition(.move(edge: .top).combined(with: .opacity))
        .accessibilityElement(children: .combine)
    }
}

private struct HomeCardPlaceholder: View {
    let height: CGFloat
    @State private var dim = false

    var body: some View {
        RoundedRectangle(cornerRadius: HomeStyle.corner, style: .continuous)
            .fill(Color(.secondarySystemBackground))
            .frame(height: height)
            .overlay(alignment: .topLeading) {
                VStack(alignment: .leading, spacing: 10) {
                    RoundedRectangle(cornerRadius: 6).fill(Color.primary.opacity(0.08)).frame(width: 160, height: 16)
                    RoundedRectangle(cornerRadius: 6).fill(Color.primary.opacity(0.06)).frame(height: 12)
                    RoundedRectangle(cornerRadius: 6).fill(Color.primary.opacity(0.06)).frame(width: 220, height: 12)
                }
                .padding(18)
            }
            .opacity(dim ? 0.55 : 1)
            .animation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: dim)
            .onAppear { dim = true }
            .accessibilityHidden(true)
    }
}

/// Tell the contacts what to follow; the curator picks the layout and the contact.
struct HomeFollowSheet: View {
    let store: HomeFeedStore
    @Environment(AuthStore.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("A topic you’re interested in…", text: $text, axis: .vertical)
                        .lineLimit(3...6).focused($focused).manrope(.body)
                } footer: {
                    Text("Your contacts decide how to show it and who keeps it up to date. Public questions may be searched on the web.")
                        .manrope(.footnote)
                }
                if let error { Section { Text(error).foregroundStyle(.red).manrope(.footnote) } }
            }
            .navigationTitle("Follow in For you")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        Task {
                            do { try await store.follow(text.trimmingCharacters(in: .whitespacesAndNewlines), using: auth); dismiss() }
                            catch { self.error = error.localizedDescription }
                        }
                    }
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isMutating)
                }
            }
            .onAppear { focused = true }
        }
        .presentationDetents([.medium])
    }
}

/// What For you follows, with the option to hide or restore each topic.
struct HomeTopicsSheet: View {
    let store: HomeFeedStore
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.dismiss) private var dismiss
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                let topics = store.feed?.topics ?? []
                Section {
                    ForEach(topics.filter { $0.status == "active" }) { topic in row(topic) }
                } header: { Text("Following") } footer: {
                    Text("Your contacts add and retire their own picks as your interests change. Topics you or a contact asked for stay until you hide them.")
                }
                let hidden = topics.filter { $0.status == "hidden" }
                if !hidden.isEmpty {
                    Section("Hidden") { ForEach(hidden) { topic in row(topic) } }
                }
                if let error { Section { Text(error).foregroundStyle(.red) } }
            }
            .manrope()
            .navigationTitle("Topics")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }

    private func row(_ topic: HomeFeed.Topic) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(topic.title).manrope(.body, weight: .semibold)
                Text(origin(topic)).manrope(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button(topic.status == "hidden" ? "Show" : "Hide") {
                Task {
                    do { try await store.setTopic(topic.id, status: topic.status == "hidden" ? "active" : "hidden", using: auth) }
                    catch { self.error = error.localizedDescription }
                }
            }
            .buttonStyle(.bordered).controlSize(.small)
            .disabled(store.isMutating)
        }
    }

    private func origin(_ topic: HomeFeed.Topic) -> String {
        let pending = topic.status == "active" && !topic.hasCard ? " · Waiting for its first card" : ""
        switch topic.source {
        case "person": return "You asked\(pending)"
        case "contact": return "Suggested by \(topic.contactID.flatMap { contacts.contact(id: $0)?.name } ?? "a contact")\(pending)"
        default: return "Picked by your contacts\(pending)"
        }
    }
}

extension HomeFeedStore {
    /// What a post's buttons do, shared by the timeline and a thread.
    func perform(_ action: HomeCardAction, on post: HomePost, auth: AuthStore, contacts: ContactsStore,
                 openContact: (String) -> Void, openThread: (String) -> Void, openPost: (String) -> Void) async throws {
        switch action {
        case .message:
            if let id = post.contactID { openContact(id) }
        case .reply(let prompt):
            guard let id = post.contactID else { return }
            contacts.suggestedDrafts[id] = prompt
            openContact(id)
        case .thread:
            openThread(post.topicID)
        case .comment:
            openPost(post.id)
        case .more:
            try await setTopic(post.topicID, feedback: .some(post.feedback == "more" ? nil : "more"), using: auth)
        case .less:
            try await setTopic(post.topicID, feedback: .some(post.feedback == "less" ? nil : "less"), using: auth)
        case .hide:
            try await setTopic(post.topicID, status: "hidden", using: auth)
        }
    }
}

/// Every post on one topic, newest first like the timeline, joined by a line like a thread (docs/updates.md#posts).
/// It reads the session's cached feed, so it opens at once and follows the timeline's mutations.
struct HomeThreadView: View {
    let store: HomeFeedStore
    let topicID: String
    let openContact: (String) -> Void
    let openPost: (String) -> Void
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @State private var actionError: String?

    private var posts: [HomePost] { (store.feed?.timeline ?? []).filter { $0.topicID == topicID } }

    var body: some View {
        ScrollView {
            if posts.isEmpty {
                ContentUnavailableView("This thread isn’t in For you anymore", systemImage: "house",
                                       description: Text("Its topic was hidden or retired, or its posts are older than two weeks."))
                    .padding(.top, 60)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(posts.enumerated()), id: \.element.id) { index, post in
                        HomePostView(post: post, inThread: true, chained: index < posts.count - 1) { action in
                            Task {
                                do { try await store.perform(action, on: post, auth: auth, contacts: contacts, openContact: openContact, openThread: { _ in }, openPost: openPost) }
                                catch is CancellationError {}
                                catch { actionError = error.localizedDescription }
                            }
                        }
                    }
                }
                .padding(.bottom, 32)
            }
        }
        .background(Color(.systemBackground))
        .navigationTitle(posts.first?.content.title ?? "Thread")
        .navigationBarTitleDisplayMode(.inline)
        .alert("For you", isPresented: Binding(get: { actionError != nil }, set: { if !$0 { actionError = nil } })) {
            Button("OK") { actionError = nil }
        } message: { Text(actionError ?? "") }
    }
}

/// One post with its comments (docs/updates.md#comments), like the replies of a Threads post: the
/// person's comment, then the answer of the contact who wrote the post, written in the background.
/// It reads the session's cached feed and polls while a reply is pending. "Continue in chat" opens
/// the contact's private chat, which already knows about this discussion.
struct HomePostDetailView: View {
    let store: HomeFeedStore
    let postID: String
    let openContact: (String) -> Void
    let openThread: (String) -> Void
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.scenePhase) private var scenePhase
    @State private var text = ""
    @State private var sending = false
    @State private var actionError: String?
    @FocusState private var focused: Bool

    private var post: HomePost? { store.feed?.timeline.first { $0.id == postID } }
    private var comments: [HomeComment] { post?.comments ?? [] }
    private var waiting: Bool { comments.contains { $0.status == "pending" } }
    private var name: String { post?.contactName ?? "this contact" }
    private var threadCount: Int { post.map { post in store.feed?.timeline.filter { $0.topicID == post.topicID }.count ?? 0 } ?? 0 }

    var body: some View {
        ScrollView {
            if let post {
                VStack(alignment: .leading, spacing: 0) {
                    HomePostView(post: post, threadCount: threadCount, inThread: true, chained: !comments.isEmpty) { action in
                        Task {
                            do {
                                try await store.perform(action, on: post, auth: auth, contacts: contacts, openContact: openContact,
                                                        openThread: openThread, openPost: { _ in focused = true })
                            }
                            catch is CancellationError {}
                            catch { actionError = error.localizedDescription }
                        }
                    }
                    VStack(alignment: .leading, spacing: 14) {
                        ForEach(comments) { comment in
                            row(user: true, name: "You", at: comment.createdAt) { Text(comment.text) }
                            row(user: false, name: name, at: comment.repliedAt) {
                                switch comment.status {
                                case "complete": Text(comment.reply ?? "")
                                case "pending": TypingDots().accessibilityLabel("\(name) is replying")
                                default: Text("\(name) couldn’t answer this one. Try again or continue in the chat.").italic().foregroundStyle(.secondary)
                                }
                            }
                        }
                        if let id = post.contactID {
                            Button { openContact(id) } label: {
                                Label("Continue in chat with \(name)", systemImage: "bubble.left")
                                    .manrope(.subheadline, weight: .semibold).padding(.horizontal, 6).padding(.vertical, 4)
                            }
                            .buttonStyle(.glass)
                        }
                        if threadCount > 1 {
                            Button("See all \(threadCount) posts on \(post.content.title)") { openThread(post.topicID) }
                                .manrope(.subheadline, weight: .semibold).buttonStyle(.plain).foregroundStyle(.tint)
                        }
                    }
                    .padding(.leading, 64).padding(.trailing, 16).padding(.top, 8)
                }
                .padding(.bottom, 24)
            } else {
                ContentUnavailableView("This post isn’t in For you anymore", systemImage: "house",
                                       description: Text("Its topic was hidden or retired, or the post is older than two weeks."))
                    .padding(.top, 60)
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color(.systemBackground))
        .safeAreaInset(edge: .bottom) { if post?.contactID != nil { composer } }
        .navigationTitle("Post")
        .navigationBarTitleDisplayMode(.inline)
        // Poll while the contact is answering, like the timeline does while a run is in progress.
        .task(id: "\(scenePhase)-\(waiting)") {
            guard scenePhase == .active, waiting else { return }
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(3)) } catch { return }
                await store.refresh(using: auth, force: true)
            }
        }
        .alert("For you", isPresented: Binding(get: { actionError != nil }, set: { if !$0 { actionError = nil } })) {
            Button("OK") { actionError = nil }
        } message: { Text(actionError ?? "") }
    }

    private func row(user: Bool, name: String, at: Double?, @ViewBuilder content: () -> some View) -> some View {
        HStack(alignment: .top, spacing: 10) {
            if user { AccountAvatar(user: auth.user, size: 30) }
            else { ContactAvatar(contact: post?.contactID.flatMap { contacts.contact(id: $0) }, size: 30) }
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(name).manrope(.subheadline, weight: .bold)
                    if let at { Text(HomePostView.age(at)).manrope(.subheadline).foregroundStyle(.secondary) }
                }
                content().manrope(.body).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 8) {
            TextField(waiting ? "\(name) is replying…" : "Reply to \(name)…", text: $text, axis: .vertical)
                .lineLimit(1...5).focused($focused).manrope(.body).disabled(waiting)
                .padding(.horizontal, 14).padding(.vertical, 10)
            Button { Task { await send() } } label: {
                Image(systemName: "arrow.up").font(.body.weight(.bold)).frame(width: 34, height: 34)
            }
            .buttonStyle(.glassProminent)
            .buttonBorderShape(.circle)
            .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || waiting || sending)
            .accessibilityLabel("Send comment")
            .padding(5)
        }
        .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .padding(.horizontal, 12).padding(.bottom, 8)
    }

    private func send() async {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, !waiting, !sending else { return }
        sending = true
        defer { sending = false }
        do { try await store.comment(on: postID, text: String(value.prefix(1000)), using: auth); text = "" }
        catch { actionError = error.localizedDescription }
    }
}

/// Three pulsing dots while a contact is writing a reply.
private struct TypingDots: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var on = false

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { index in
                Circle().fill(Color.secondary).frame(width: 6, height: 6)
                    .opacity(on ? 1 : 0.3)
                    .animation(reduceMotion ? nil : .easeInOut(duration: 0.6).repeatForever().delay(Double(index) * 0.15), value: on)
            }
        }
        .padding(.vertical, 6)
        .onAppear { on = true }
    }
}
