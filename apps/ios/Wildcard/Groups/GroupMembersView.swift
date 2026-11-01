import SwiftUI

struct GroupMembersView: View {
    let groupID: String
    @Environment(AuthStore.self) private var auth
    @Environment(GroupsStore.self) private var groups
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.dismiss) private var dismiss
    let store: GroupChatStore
    private var snapshot: GroupSnapshot? { store.snapshot }
    @State private var shareMemory = false
    @State private var contributorConsent = false
    @State private var busy = false
    @State private var editingIdentity = false
    @State private var error: String?
    @State private var confirmingDelete = false
    @State private var confirmingLeave = false
    @State private var removal: GroupMember?
    @State private var sharingAgent: String?
    @State private var showingSharing = false
    @State private var showingConsent = false
    private static let sharingInfo = "Allow each contact to discuss your entire past and future private text conversation with everyone in this group, including future members. This includes personal details and temporary plans. Only your own conversation is authorized. Attachment files and scheduled messages are excluded; chats with connections stay private. Turning this off stops pending replies; messages already sent remain visible. Existing shared memories keep their current rules. Unavailable contacts need an eligible private chat."
    private var sharingSummary: String {
        let permissions = snapshot?.privateSharing ?? []
        return permissions.isEmpty ? "No contacts" : "\(permissions.filter { $0.enabled == 1 }.count) of \(permissions.count) on"
    }
    private var owner: Bool { snapshot?.group.ownerID == auth.user?.id }
    var body: some View {
        Form {
            if let error = error ?? store.error { Text(error).foregroundStyle(.red) }
            if let snapshot {
                Section {
                    ProfileIdentityView(name: snapshot.group.name, hasPhoto: snapshot.group.photoVersion != nil,
                                        canEdit: owner && !busy, isWorking: $editingIdentity,
                                        saveName: { name in
                        _ = try await GroupService.data(groupID, method: "PATCH", input: ["name": name], auth: auth)
                        try await refreshIdentity()
                    }, savePhoto: { data in
                        let version = try await auth.withSession { api, token in
                            try await api.saveGroupPhoto(id: groupID, data: data, token: token)
                        }
                        if let data, let version { await auth.images.store(data, for: .groupAvatar(groupID: groupID, version: version)) }
                        try await refreshIdentity()
                    }) { GroupPhotoAvatar(group: self.snapshot?.group, size: 96) }
                    .listRowBackground(Color.clear).listRowSeparator(.hidden)
                }
                Section {
                    SheetRow(title: "Discuss my private chats", systemImage: "bubble.left.and.bubble.right", value: sharingSummary) { showingSharing = true }
                    NavigationLink { ConversationLearningView(base: "groups/\(groupID)", cache: groups.conversations.learning.store(for: groupID)) }
                        label: { Label("Conversation learning", systemImage: "lightbulb") }
                    NavigationLink { McpAccessView(path: "groups/\(groupID)/mcp", group: true, cache: contacts.mcpAccessSnapshots.store(for: "group:\(groupID)")) }
                        label: { Label("Connections", systemImage: "link") }
                    NavigationLink { MiniAppListView(base: "groups/\(groupID)") } label: { Label("Mini apps", systemImage: "square.grid.2x2") }
                    NavigationLink { TasksView(base: "groups/\(groupID)", snapshot: groups.conversations.tasks.store(for: "groups/\(groupID)")) }
                        label: { Label("Tasks", systemImage: "checklist") }
                    SheetRow(title: "Shared memory consent", systemImage: "hand.raised", value: "Review") {
                        shareMemory = false; contributorConsent = false; showingConsent = true
                    }
                }
                Section("Members") {
                    ForEach(snapshot.members, id: \.identity) { member in
                        let canInvite = owner && member.kind == "user" && member.id != auth.user?.id
                        let canRemove = (member.kind == "agent" && (owner || member.addedBy == auth.user?.id)) || (member.kind == "user" && owner && member.id != auth.user?.id)
                        HStack(spacing: 12) {
                            GroupAvatar(member: member, groupID: groupID)
                            VStack(alignment: .leading) {
                                Text(member.name).manrope(.body, weight: .semibold)
                                Text(member.kind == "agent" ? "Contact" : (member.id == snapshot.group.ownerID ? "Owner" : member.canInvite == 1 ? "Can invite" : "Member"))
                                    .manrope(.caption).foregroundStyle(.secondary)
                                if member.joinedWithoutHistory {
                                    Text("Joined without earlier messages").manrope(.caption).foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            if canInvite || canRemove {
                                Menu {
                                    if canInvite {
                                        Button(member.canInvite == 1 ? "Stop allowing invites" : "Allow invites", systemImage: "envelope") {
                                            mutate("members/\(member.id)", method: "PATCH", input: ["canInvite": member.canInvite != 1])
                                        }
                                    }
                                    if canRemove { Button("Remove from group", systemImage: "person.badge.minus", role: .destructive) { removal = member } }
                                } label: {
                                    Image(systemName: "ellipsis").frame(width: 32, height: 32).contentShape(Rectangle())
                                }
                                .tint(.secondary)
                                .accessibilityLabel("Manage \(member.name)")
                            }
                        }
                    }
                }
                ChatMediaSection(scope: .group(groupID), cache: groups.conversations.media, documents: groups.conversations.documents)
                Section { ChatExportRow(scope: .group(groupID)) }
                Section {
                    if owner { Button("Delete group", role: .destructive) { confirmingDelete = true } }
                    else { Button("Leave group", role: .destructive) { confirmingLeave = true } }
                }
            } else if error == nil && store.error == nil { ProgressView("Loading group…") }
        }
        .disabled(busy)
        .navigationTitle(snapshot?.group.name ?? "Group details").navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(busy || editingIdentity)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    NavigationLink("Invite a user", value: HomeDestination.groupInviteUser(groupID))
                    NavigationLink("Add your contact", value: HomeDestination.groupAddContact(groupID))
                } label: { Image(systemName: "plus") }
                .tint(Color(uiColor: .label))
                .accessibilityLabel("Add group member")
                .disabled(snapshot?.canInvite != true || busy || editingIdentity)
            }
        }
        .onAppear { store.isRetained = true }
        .onDisappear { store.didLeave() }
        .task { await reload() }
        .refreshable { await reload() }
        .sheet(isPresented: $showingSharing) {
            NavigationStack {
                Form {
                    Section {
                        ForEach(snapshot?.privateSharing ?? []) { permission in
                            let name = snapshot?.members.first { $0.kind == "agent" && $0.id == permission.agentID }?.name ?? "Contact"
                            Toggle(isOn: Binding(get: { permission.enabled == 1 }, set: { enabled in
                                if enabled { sharingAgent = permission.agentID }
                                else { mutate("private-sharing/\(permission.agentID)", method: "PUT", input: ["enabled": false], sharing: (permission.agentID, false)) }
                            })) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(name)
                                    if permission.available != 1 && permission.enabled != 1 {
                                        Text("Needs an eligible private chat").font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                            }
                            .disabled(permission.available != 1 && permission.enabled != 1)
                        }
                        if snapshot?.privateSharing?.isEmpty ?? true { Text("Add a contact to manage private chat sharing.").foregroundStyle(.secondary) }
                    }
                    if let error { Text(error).foregroundStyle(.red) }
                }
                .disabled(busy)
                .navigationTitle("Private chats")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) { InfoButton(title: "Discuss my private chats", text: Self.sharingInfo) }
                    ToolbarItem(placement: .confirmationAction) { Button("Done") { showingSharing = false } }
                }
                .alert("Allow private chat sharing?", isPresented: Binding(get: { sharingAgent != nil }, set: { if !$0 { sharingAgent = nil } })) {
                    Button("Allow") {
                        guard let agentID = sharingAgent else { return }
                        sharingAgent = nil
                        mutate("private-sharing/\(agentID)", method: "PUT", input: ["enabled": true], sharing: (agentID, true))
                    }
                    Button("Cancel", role: .cancel) { sharingAgent = nil }
                } message: {
                    Text("This contact may discuss your entire past and future private text conversation with everyone in this group, including future members. This includes personal details and temporary plans. You can turn this off later, but messages already sent remain visible.")
                }
            }
            .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $showingConsent) {
            NavigationStack {
                Form {
                    // Consent covers this text, so GroupConsentFields keeps it visible.
                    GroupConsentFields(contributor: snapshot?.contributorModel == true, shareMemory: $shareMemory, contributorConsent: $contributorConsent,
                        seesEarlierMessages: !(snapshot?.members.first { $0.kind == "user" && $0.id == auth.user?.id }?.joinedWithoutHistory ?? false),
                        alreadyMember: true)
                    if let error { Text(error).foregroundStyle(.red) }
                }
                .disabled(busy)
                .navigationTitle("Shared memory")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { showingConsent = false } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Confirm") {
                            mutate("consent", method: "POST", input: ["shareMemory": shareMemory, "contributorConsent": contributorConsent])
                            showingConsent = false
                        }
                        .disabled(busy)
                    }
                }
            }
            .presentationDetents([.medium, .large])
        }
        .alert("Delete group?", isPresented: $confirmingDelete) {
            Button("Delete", role: .destructive) { mutate("", method: "DELETE", close: true) }
            Button("Cancel", role: .cancel) { }
        } message: { Text("This deletes the group, its messages and memories sourced from those messages for everyone.") }
        .alert("Leave group?", isPresented: $confirmingLeave) {
            Button("Leave", role: .destructive) { mutate("members/\(auth.user?.id ?? "")", method: "DELETE", close: true) }
            Button("Cancel", role: .cancel) { }
        } message: { Text("Your contacts leave with you. Your messages remain in the group. Your contributed group memories stop being available to contacts, but replies already sent remain visible.") }
        .alert("Remove member?", isPresented: Binding(get: { removal != nil }, set: { if !$0 { removal = nil } })) {
            Button("Remove", role: .destructive) {
                guard let member = removal else { return }
                removal = nil
                mutate("\(member.kind == "agent" ? "agents" : "members")/\(member.id)", method: "DELETE")
            }
            Button("Cancel", role: .cancel) { removal = nil }
        } message: { Text("This removes group access. Previous messages stay visible. Removing a user also removes the contacts they added.") }
    }
    private func refreshIdentity() async throws {
        store.invalidateDetails()
        try await store.refreshDetails(id: groupID, auth: auth)
        await groups.refresh(using: auth)
    }
    private func reload() async {
        do {
            try await store.refreshDetails(id: groupID, auth: auth)
            error = nil
        }
        catch AuthAPI.Failure.notFound { error = "This group is no longer available." }
        catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }
    private func mutate(_ suffix: String, method: String, input: [String: Any]? = nil, close: Bool = false, sharing: (String, Bool)? = nil) {
        guard !busy, !editingIdentity else { return }
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                _ = try await GroupService.data(groupID + (suffix.isEmpty ? "" : "/\(suffix)"), method: method, input: input, auth: auth)
                groups.conversations.learning.remove(id: groupID)
                if let sharing { store.updatePrivateSharing(agentID: sharing.0, enabled: sharing.1) }
                store.invalidateDetails()
                if close { groups.conversations.remove(id: groupID) }
                await groups.refresh(using: auth)
                if close { await auth.images.clear(deactivate: false); dismiss() } else { await reload() }
            } catch is CancellationError { }
            catch { self.error = error.localizedDescription }
        }
    }
}
