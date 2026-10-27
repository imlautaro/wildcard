import SwiftUI

struct GroupMembersView: View {
    let groupID: String
    @Environment(AuthStore.self) private var auth
    @Environment(GroupsStore.self) private var groups
    @Environment(\.dismiss) private var dismiss
    @State private var snapshot: GroupSnapshot?
    @State private var shareMemory = false
    @State private var contributorConsent = false
    @State private var busy = false
    @State private var editingIdentity = false
    @State private var error: String?
    @State private var confirmingDelete = false
    @State private var confirmingLeave = false
    @State private var removal: GroupMember?
    private var owner: Bool { snapshot?.group.ownerID == auth.user?.id }
    var body: some View {
        Form {
            if let error { Text(error).foregroundStyle(.red) }
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
            } else if error == nil { ProgressView("Loading group…") }
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
        .task { await reload() }
        .refreshable { await reload() }
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
        snapshot = try await GroupService.read(GroupSnapshot.self, path: groupID, auth: auth)
        await groups.refresh(using: auth)
    }
    private func reload() async {
        do {
            snapshot = try await GroupService.read(GroupSnapshot.self, path: groupID, auth: auth)
            error = nil
        }
        catch AuthAPI.Failure.notFound { snapshot = nil; error = "This group is no longer available." }
        catch { self.error = error.localizedDescription }
    }
    private func mutate(_ suffix: String, method: String, input: [String: Any]? = nil, close: Bool = false) {
        guard !busy, !editingIdentity else { return }
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                _ = try await GroupService.data(groupID + (suffix.isEmpty ? "" : "/\(suffix)"), method: method, input: input, auth: auth)
                await groups.refresh(using: auth)
                if close { await auth.images.clear(deactivate: false); dismiss() } else { await reload() }
            } catch { self.error = error.localizedDescription }
        }
    }
}
