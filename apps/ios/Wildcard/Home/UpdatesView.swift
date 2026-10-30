import SwiftUI

/// The Updates tab: a feed the person's contacts curate together (see docs/updates.md).
struct UpdatesView: View {
    let store: HomeFeedStore
    @Binding var following: Bool
    @Binding var managing: Bool
    let openContact: (String) -> Void
    let openGroup: (String) -> Void
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var openedApp: HomeFeed.App?
    @State private var actionError: String?

    private var feed: HomeFeed? { store.feed }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                if let feed, feed.isUpdating { HomeStatusPill(feed: feed) }
                if let message = notice { noticeView(message) }
                if let agenda = feed?.agenda, !agenda.isEmpty { agendaSection(agenda) }
                cards
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
            .padding(.bottom, 32)
            .animation(reduceMotion ? nil : .snappy, value: feed?.cards.map(\.id))
            .animation(reduceMotion ? nil : .snappy, value: feed?.isUpdating)
        }
        .background(Color(.systemGroupedBackground))
        .refreshable { await run { try await store.requestUpdate(using: auth) } }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await store.refresh(using: auth)
            // Poll briefly while contacts are preparing cards; otherwise revalidate stale data.
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(store.feed?.isUpdating == true ? 4 : 60)) } catch { return }
                await store.refresh(using: auth, force: store.feed?.isUpdating == true)
            }
        }
        .sheet(isPresented: $following) { HomeFollowSheet(store: store) }
        .sheet(isPresented: $managing) { HomeTopicsSheet(store: store) }
        .fullScreenCover(item: $openedApp) { app in MiniAppScreen(base: app.base, appID: app.id) }
        .alert("Updates", isPresented: Binding(get: { actionError != nil }, set: { if !$0 { actionError = nil } })) {
            Button("OK") { actionError = nil }
        } message: { Text(actionError ?? "") }
    }

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: .now)
        let part = hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 19 ? "Good afternoon" : "Good evening"
        let name = auth.user?.name.split(separator: " ").first.map(String.init)
        return name.map { "\(part), \($0)" } ?? part
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(Date.now.formatted(.dateTime.weekday(.wide).month(.wide).day()).uppercased())
                .manrope(.caption, weight: .bold).foregroundStyle(.secondary).kerning(0.6)
            Text(greeting).manrope(.title, weight: .extraBold)
            if let briefing = feed?.briefing, !briefing.isEmpty {
                Text(briefing).manrope(.body).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            if let contributors = feed?.contributors, !contributors.isEmpty {
                HStack(spacing: 8) {
                    HStack(spacing: -8) {
                        ForEach(contributors.prefix(5)) { contributor in
                            ContactAvatar(contact: contacts.contact(id: contributor.id), size: 26)
                                .overlay(Circle().stroke(Color(.systemGroupedBackground), lineWidth: 2))
                        }
                    }
                    Text("Curated by \(contributors.map(\.name).formatted(.list(type: .and)))")
                        .manrope(.footnote, weight: .semibold).foregroundStyle(.secondary).lineLimit(2)
                }
                .padding(.top, 2)
                .accessibilityElement(children: .combine)
            }
        }
        .padding(.top, 8)
    }

    private var notice: String? {
        if let error = store.error, feed == nil { return error }
        guard let feed else { return nil }
        if !feed.enabled { return "Curated cards are turned off on this server. Your apps and agenda still show here." }
        if feed.isUpdating { return nil }
        switch feed.error {
        case nil: return nil
        case "HOME_NO_CONTACTS": return "Add a contact so they can start curating your updates."
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
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func agendaSection(_ agenda: [HomeFeed.AgendaItem]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Coming up").manrope(.subheadline, weight: .bold).padding(.bottom, 8)
            ForEach(Array(agenda.enumerated()), id: \.element.id) { index, item in
                if index > 0 { Divider().padding(.leading, 44) }
                Button {
                    if let id = item.contactID { openContact(id) } else if let id = item.groupID { openGroup(id) }
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: item.kind == "task" ? "checklist" : "clock.fill")
                            .font(.system(size: 14, weight: .semibold)).foregroundStyle(item.kind == "task" ? Color.orange : Color.accentColor)
                            .frame(width: 32, height: 32)
                            .background((item.kind == "task" ? Color.orange : Color.accentColor).opacity(0.14), in: Circle())
                        VStack(alignment: .leading, spacing: 1) {
                            Text(item.title).manrope(.subheadline, weight: .semibold).lineLimit(2).multilineTextAlignment(.leading)
                            Text(agendaDetail(item)).manrope(.caption).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
                    }
                    .padding(.vertical, 8)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: HomeStyle.corner, style: .continuous))
    }

    private func agendaDetail(_ item: HomeFeed.AgendaItem) -> String {
        let owner = item.name ?? ""
        if let at = item.at {
            return "\(owner) · \(Date(timeIntervalSince1970: at / 1000).formatted(.relative(presentation: .named)))"
        }
        return item.kind == "task" ? "\(owner) · Assigned to you" : owner
    }

    @ViewBuilder private var cards: some View {
        let items = feed?.cards ?? []
        if items.isEmpty {
            if feed?.isUpdating == true || (feed == nil && store.error == nil) {
                ForEach(0..<3, id: \.self) { index in HomeCardPlaceholder(height: index == 0 ? 260 : 170) }
            } else if feed?.enabled == true {
                empty
            }
            if let apps = feed?.apps, !apps.isEmpty { appsStrip(apps) }
        } else {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, card in
                HomeCardView(card: card, lead: index == 0) { action in handle(action, card: card) }
                    .transition(.opacity.combined(with: .scale(scale: 0.98)))
                if index == 0, let apps = feed?.apps, !apps.isEmpty { appsStrip(apps) }
            }
            Button { following = true } label: {
                Label("Ask your contacts to follow something", systemImage: "sparkles")
                    .manrope(.subheadline, weight: .semibold).frame(maxWidth: .infinity).padding(.vertical, 14)
            }
            .buttonStyle(.plain)
            .glassEffect(.regular.interactive(), in: Capsule())
            .padding(.top, 4)
        }
    }

    private var empty: some View {
        VStack(spacing: 12) {
            Image(systemName: "sparkles.rectangle.stack").font(.system(size: 40)).foregroundStyle(Color.accentColor)
            Text("Your contacts are getting to know you").manrope(.headline, weight: .bold).multilineTextAlignment(.center)
            Text("As you chat, they’ll bring news, figures and reminders about what matters to you here. You can also tell them what to follow.")
                .manrope(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            Button("Follow something") { following = true }.buttonStyle(.glassProminent).manrope(.subheadline, weight: .semibold)
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: HomeStyle.corner, style: .continuous))
    }

    private func appsStrip(_ apps: [HomeFeed.App]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Your apps").manrope(.subheadline, weight: .bold)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 14) {
                    ForEach(apps) { app in
                        Button { openedApp = app } label: {
                            VStack(spacing: 6) {
                                Image(systemName: MiniApp.symbol(app.icon))
                                    .font(.system(size: 24, weight: .semibold)).foregroundStyle(.white)
                                    .frame(width: 60, height: 60)
                                    .background(Color.accentColor.gradient, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                                Text(app.title).manrope(.caption, weight: .semibold).lineLimit(2).multilineTextAlignment(.center)
                                    .frame(width: 72)
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(app.title), mini app\(app.ownerName.map { " by \($0)" } ?? "")")
                    }
                }
                .padding(.vertical, 2)
            }
            .scrollClipDisabled()
        }
    }

    private func handle(_ action: HomeCardAction, card: HomeCard) {
        switch action {
        case .message:
            if let id = card.contactID { openContact(id) }
        case .reply(let prompt):
            guard let id = card.contactID else { return }
            contacts.suggestedDrafts[id] = prompt
            openContact(id)
        case .more:
            Task { await run { try await store.setTopic(card.topicID, feedback: .some(card.feedback == "more" ? nil : "more"), using: auth) } }
        case .less:
            Task { await run { try await store.setTopic(card.topicID, feedback: .some(card.feedback == "less" ? nil : "less"), using: auth) } }
        case .hide:
            Task { await run { try await store.setTopic(card.topicID, status: "hidden", using: auth) } }
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
            .fill(Color(.secondarySystemGroupedBackground))
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
                    TextField("For example: processing times for my I-130", text: $text, axis: .vertical)
                        .lineLimit(3...6).focused($focused).manrope(.body)
                } footer: {
                    Text("Your contacts decide how to show it and who keeps it up to date. Public questions may be searched on the web.")
                        .manrope(.footnote)
                }
                if let error { Section { Text(error).foregroundStyle(.red).manrope(.footnote) } }
            }
            .navigationTitle("Follow in Updates")
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

/// What Updates follows, with the option to hide or restore each topic.
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
