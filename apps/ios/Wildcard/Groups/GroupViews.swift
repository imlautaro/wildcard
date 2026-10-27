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
                Text("This installation uses Meta's Contributor model. Group messages and shared memories sent to Meta may be used for model training.")
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
    var body: some View {
        Form {
            Section("Group name") { TextField("Name", text: $name).manrope() }
            GroupConsentFields(contributor: groups.contributorModel, shareMemory: $shareMemory, contributorConsent: $contributorConsent)
            if let error { Text(error).foregroundStyle(.red) }
            Button("Create group") {
                busy = true
                Task {
                    defer { busy = false }
                    do {
                        let data = try await GroupService.data(method: "POST", input: ["name": name, "shareMemory": shareMemory, "contributorConsent": contributorConsent], auth: auth)
                        let result = try JSONDecoder().decode(GroupIDResponse.self, from: data)
                        await groups.refresh(using: auth)
                        created(result.id)
                    } catch { self.error = error.localizedDescription }
                }
            }
            .disabled(busy || !groups.hasLoaded)
        }
        .disabled(busy)
        .navigationTitle("Create group").navigationBarTitleDisplayMode(.inline)
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
                            } catch { self.error = error.localizedDescription }
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
                                joined(result.id)
                            } catch { self.error = error.localizedDescription }
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
    @Environment(AuthStore.self) private var auth
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = GroupChatStore()
    @State private var draft = ""
    @State private var showingMembers = false
    @State private var nearBottom = true
    @FocusState private var composerFocused: Bool
    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    if store.nextBefore != nil {
                        Button("Load earlier messages") { Task { await store.loadMore(id: groupID, auth: auth) } }
                            .disabled(store.isLoadingMore)
                    }
                    ForEach(store.messages) { message in
                        GroupMessageRow(message: message, groupID: groupID, members: store.snapshot?.members ?? [])
                            .id(message.id)
                    }
                    if let pending = store.pendingText {
                        MessageBubbleView(text: pending, sentAt: Date.now.timeIntervalSince1970 * 1000, fromUser: true, isSending: true)
                    }
                    ForEach((store.snapshot?.replies ?? []).filter { $0.status == "running" }) { reply in
                        HStack(spacing: 6) {
                            Text(reply.name).manrope(.caption, weight: .semibold)
                            ReplyTypingIndicator()
                        }
                    }
                    ForEach((store.snapshot?.replies ?? []).filter { $0.status == "failed" }) { reply in
                        Button("Retry reply from \(reply.name)") {
                            Task {
                                do {
                                    _ = try await GroupService.data("\(groupID)/replies/\(reply.id)/retry", method: "POST", auth: auth)
                                    await store.refresh(id: groupID, auth: auth)
                                } catch { store.error = error.localizedDescription }
                            }
                        }
                        .manrope(.footnote)
                    }
                    Color.clear.frame(height: 1).id("latest")
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
            }
            .defaultScrollAnchor(.bottom)
            .scrollDismissesKeyboard(.interactively)
            .onScrollGeometryChange(for: Bool.self) { geometry in
                geometry.contentSize.height - geometry.visibleRect.maxY < 80
            } action: { _, value in nearBottom = value }
            .onChange(of: store.messages.last?.id) { _, _ in
                if nearBottom { proxy.scrollTo("latest", anchor: .bottom) }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 8) {
                    if let error = store.error {
                        Text(error).manrope(.caption).foregroundStyle(.red)
                        Button("Refresh") { Task { await store.refresh(id: groupID, auth: auth) } }.manrope(.caption)
                    }
                    if !nearBottom {
                        HStack {
                            Spacer()
                            Button { withAnimation { proxy.scrollTo("latest", anchor: .bottom) } } label: { Image(systemName: "chevron.down") }
                                .buttonStyle(.glass).tint(Color(uiColor: .label))
                        }
                    }
                    if let pending = store.pendingText, !store.isSending {
                        Button("Retry sending") { send(pending, proxy: proxy) }
                    }
                    HStack(alignment: .bottom, spacing: 10) {
                        TextField("Message", text: $draft, axis: .vertical)
                            .manrope().lineLimit(1...6).focused($composerFocused)
                            .padding(12).background(.background, in: RoundedRectangle(cornerRadius: 22))
                        Button { send(draft, proxy: proxy) } label: {
                            Image(systemName: "arrow.up").font(.headline).frame(width: 42, height: 42)
                        }
                        .buttonStyle(.glassProminent)
                        .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isSending || store.pendingText != nil || store.snapshot == nil)
                        .accessibilityLabel("Send message")
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 10).background(.bar)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Button { showingMembers = true } label: {
                    VStack(spacing: -2) {
                        Text(store.snapshot?.group.name ?? "Group").manrope(.headline, weight: .semibold).lineLimit(1)
                        GroupMarquee(text: store.snapshot?.members.map(\.name).joined(separator: ", ") ?? "Loading...")
                            .frame(width: 200, height: 20)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Group details")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showingMembers = true } label: { Image(systemName: "person.2") }
                    .tint(Color(uiColor: .label)).accessibilityLabel("Group members")
            }
        }
        .sheet(isPresented: $showingMembers, onDismiss: { Task { await store.refresh(id: groupID, auth: auth) } }) {
            GroupMembersView(groupID: groupID)
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await store.refresh(id: groupID, auth: auth)
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(3)) } catch { return }
                await store.refresh(id: groupID, auth: auth)
            }
        }
    }
    private func send(_ text: String, proxy: ScrollViewProxy) {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        if draft.trimmingCharacters(in: .whitespacesAndNewlines) == value { draft = "" }
        nearBottom = true
        Task {
            let success = await store.send(value, id: groupID, auth: auth)
            if !success, draft.isEmpty { draft = value }
            proxy.scrollTo("latest", anchor: .bottom)
        }
    }
}

private struct GroupMessageRow: View {
    let message: GroupMessage
    let groupID: String
    let members: [GroupMember]
    @Environment(AuthStore.self) private var auth
    private var own: Bool { message.userID == auth.user?.id && message.agentID == nil }
    private var sender: GroupMember? {
        members.first { $0.id == (message.agentID ?? message.userID) && $0.kind == (message.agentID == nil ? "user" : "agent") }
    }
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if !own { GroupAvatar(member: sender, groupID: groupID, size: 30) }
            VStack(alignment: .leading, spacing: 4) {
                if !own { Text(sender?.name ?? message.senderName).manrope(.caption, weight: .semibold).foregroundStyle(.secondary).padding(.leading, 12) }
                // Group receipts must not imply that every member read the message.
                HStack {
                    if own { Spacer(minLength: 40) }
                    MessageTextContentView(text: message.text, sentAt: message.createdAt, fromUser: false)
                        .padding(.horizontal, 16).padding(.vertical, 12)
                        .background(own ? Color("OutgoingMessageBackground") : Color(uiColor: .secondarySystemBackground), in: MessageBubbleShape(fromUser: own))
                        .messageBubbleShadow()
                    if !own { Spacer(minLength: 40) }
                }
            }
        }
    }
}

struct GroupAvatar: View {
    let member: GroupMember?
    let groupID: String
    var size: CGFloat = 40
    @Environment(AuthStore.self) private var auth
    @State private var image: UIImage?
    var body: some View {
        Group {
            if let image { Image(uiImage: image).resizable().scaledToFill() }
            else { Image(systemName: member?.kind == "agent" ? "person.crop.circle.fill" : "person.circle.fill").resizable().scaledToFit().foregroundStyle(.secondary) }
        }
        .frame(width: size, height: size).clipShape(Circle()).accessibilityHidden(true)
        .task(id: "\(groupID)/\(member?.identity ?? "")/\(member?.photoVersion ?? "")") {
            image = nil
            guard let member, member.photoVersion != nil else { return }
            do {
                let data = try await GroupService.data("\(groupID)/photos/\(member.kind)/\(member.id)", auth: auth)
                try Task.checkCancellation()
                image = UIImage(data: data)
            } catch { }
        }
    }
}

private struct GroupMarquee: View {
    let text: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var textWidth: CGFloat = 0
    var body: some View {
        GeometryReader { geometry in
            TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion || scenePhase != .active || textWidth <= geometry.size.width)) { context in
                let overflow = max(0, textWidth - geometry.size.width)
                let duration = Double(overflow / 24)
                let phase = context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: max(1, duration * 2 + 4))
                let offset = phase < 2 ? 0 : (phase < duration + 2 ? min(Double(overflow), (phase - 2) * 24) : max(0, Double(overflow) - (phase - duration - 4) * 24))
                Text(text).manrope(.caption).foregroundStyle(.secondary).fixedSize(horizontal: true, vertical: false)
                    .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { textWidth = $0 }
                    .offset(x: reduceMotion ? 0 : -offset)
            }
            .clipped()
        }
        .accessibilityElement(children: .ignore).accessibilityLabel(text)
    }
}
