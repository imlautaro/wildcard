import SwiftUI

struct GroupMembersView: View {
    let groupID: String
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(GroupsStore.self) private var groups
    @Environment(\.dismiss) private var dismiss
    @State private var snapshot: GroupSnapshot?
    @State private var email = ""
    @State private var selectedContact = ""
    @State private var shareMemory = false
    @State private var contributorConsent = false
    @State private var busy = false
    @State private var error: String?
    @State private var confirmingDelete = false
    @State private var confirmingLeave = false
    @State private var removal: GroupMember?
    private var owner: Bool { snapshot?.group.ownerID == auth.user?.id }
    var body: some View {
        NavigationStack {
            Form {
                if let error { Text(error).foregroundStyle(.red) }
                if let snapshot {
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
                    if snapshot.canInvite {
                        Section("Invite a user") {
                            TextField("Existing account email", text: $email)
                                .keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                            Button("Send invitation") {
                                mutate("invitations", method: "POST", input: ["email": email])
                            }
                            .disabled(email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                        Section("Add your contact") {
                            Picker("Contact", selection: $selectedContact) {
                                Text("Choose a contact").tag("")
                                ForEach(contacts.contacts.filter { contact in
                                    contact.canManage && !snapshot.members.contains { $0.kind == "agent" && $0.id == contact.agentID }
                                }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }) { contact in
                                    Text(contact.name).tag(contact.id)
                                }
                            }
                            Text("Adding your contact shares its existing and future memories with the group. It remains the same contact in your other chats.")
                                .manrope(.footnote).foregroundStyle(.secondary)
                            Toggle("I accept sharing this contact's existing and future memories", isOn: $shareMemory)
                            if snapshot.contributorModel {
                                Toggle("I accept Contributor data use", isOn: $contributorConsent)
                            }
                            Button("Add contact") {
                                mutate("agents", method: "POST", input: ["contactID": selectedContact, "shareMemory": shareMemory, "contributorConsent": contributorConsent])
                            }
                            .disabled(selectedContact.isEmpty)
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
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() }.disabled(busy) } }
            .task {
                await reload()
                await contacts.refresh(using: auth)
                while contacts.nextCursor != nil, !Task.isCancelled, contacts.error == nil {
                    let before = contacts.nextCursor
                    await contacts.loadMore(using: auth)
                    if before == contacts.nextCursor { break }
                }
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
        .interactiveDismissDisabled(busy)
    }
    private func reload() async {
        do { snapshot = try await GroupService.read(GroupSnapshot.self, path: groupID, auth: auth) }
        catch { self.error = error.localizedDescription }
    }
    private func mutate(_ suffix: String, method: String, input: [String: Any]? = nil, close: Bool = false) {
        guard !busy else { return }
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                _ = try await GroupService.data(groupID + (suffix.isEmpty ? "" : "/\(suffix)"), method: method, input: input, auth: auth)
                if suffix == "invitations" { email = "" }
                if suffix == "agents" { selectedContact = ""; shareMemory = false; contributorConsent = false }
                await groups.refresh(using: auth)
                if close { dismiss() } else { await reload() }
            } catch { self.error = error.localizedDescription }
        }
    }
}
