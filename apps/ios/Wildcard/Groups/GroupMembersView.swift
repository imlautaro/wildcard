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
                    NavigationLink("Connections") { McpAccessView(path: "groups/\(groupID)/mcp", group: true, cache: contacts.mcpAccessSnapshots.store(for: "group:\(groupID)")) }
                    NavigationLink("Tasks") { TasksView(base: "groups/\(groupID)", snapshot: groups.conversations.tasks.store(for: "groups/\(groupID)")) }
                }
                ChatMediaSection(scope: .group(groupID), cache: groups.conversations.media, documents: groups.conversations.documents)
                Section {
                    ForEach(snapshot.privateSharing ?? []) { permission in
                        let name = snapshot.members.first { $0.kind == "agent" && $0.id == permission.agentID }?.name ?? "Contact"
                        Toggle(name, isOn: Binding(get: { permission.enabled == 1 }, set: { enabled in
                            if enabled { sharingAgent = permission.agentID }
                            else { mutate("private-sharing/\(permission.agentID)", method: "PUT", input: ["enabled": false], sharing: (permission.agentID, false)) }
                        }))
                        .disabled(permission.available != 1 && permission.enabled != 1)
                    }
                } header: { Text("Discuss my private chats") } footer: {
                    Text("Allow each contact to discuss your entire past and future private text conversation with everyone in this group, including future members. This includes personal details and temporary plans. Only your own conversation is authorized. Attachment files and scheduled messages are excluded; chats with connections stay private. Turning this off stops pending replies; messages already sent remain visible. Existing shared memories keep their current rules. Unavailable contacts need an eligible private chat.")
                }
                Section("Members") {
                    ForEach(snapshot.members, id: \.identity) { member in
                        HStack(spacing: 12) {
                            GroupAvatar(member: member, groupID: groupID)
                            VStack(alignment: .leading) {
                                Text(member.name).manrope(.body, weight: .semibold)
                                Text(member.kind == "agent" ? "Contact" : (member.id == snapshot.group.ownerID ? "Owner" : "User"))
                                    .manrope(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if owner, member.kind == "user", member.id != auth.user?.id {
                                Toggle("Can invite", isOn: Binding(get: { member.canInvite == 1 }, set: { value in
                                    mutate("members/\(member.id)", method: "PATCH", input: ["canInvite": value])
                                }))
                                .fixedSize().manrope(.caption)
                            }
                        }
                        .swipeActions {
                            if (member.kind == "agent" && (owner || member.addedBy == auth.user?.id)) || (member.kind == "user" && owner && member.id != auth.user?.id) {
                                Button("Remove", role: .destructive) { removal = member }
                            }
                        }
                    }
                }
                GroupConsentFields(contributor: snapshot.contributorModel, shareMemory: $shareMemory, contributorConsent: $contributorConsent)
                Button("Confirm consent for future messages") {
                    mutate("consent", method: "POST", input: ["shareMemory": shareMemory, "contributorConsent": contributorConsent])
                }
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
