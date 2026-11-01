import SwiftUI

struct InviteGroupUserView: View {
    let groupID: String
    @Environment(AuthStore.self) private var auth
    @Environment(GroupsStore.self) private var groups
    @Environment(\.dismiss) private var dismiss
    private var store: GroupChatStore { groups.conversations.store(for: groupID) }
    private var snapshot: GroupSnapshot? { store.snapshot }
    @State private var email = ""
    @State private var includeHistory = true
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Form {
            Section("Invite a user") {
                TextField("Existing account email", text: $email)
                    .keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                Text("They will receive an invitation in Wildcard and can choose whether to join the group.")
                    .manrope(.footnote).foregroundStyle(.secondary)
                GroupHistoryAccessToggle(includeHistory: $includeHistory)
                Button("Send invitation", action: invite)
                    .disabled(busy || snapshot?.canInvite != true || email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            if let error { Text(error).manrope(.footnote).foregroundStyle(.red) }
            if busy { ProgressView("Sending invitation…") }
        }
        .disabled(busy)
        .navigationTitle("Invite a user").navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(busy)
        .task {
            do { try await store.refreshDetails(id: groupID, auth: auth) }
            catch is CancellationError { }
            catch { self.error = error.localizedDescription }
        }
    }
    private func invite() {
        guard !busy, snapshot?.canInvite == true else { return }
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                _ = try await GroupService.data("\(groupID)/invitations", method: "POST", input: ["email": email, "includeHistory": includeHistory], auth: auth)
                store.invalidateDetails()
                try await store.refreshDetails(id: groupID, auth: auth)
                await groups.refresh(using: auth)
                dismiss()
            } catch is CancellationError { }
            catch { self.error = error.localizedDescription }
        }
    }
}

/// Whether a new member can read the group's messages from before they join (on by default).
struct GroupHistoryAccessToggle: View {
    @Binding var includeHistory: Bool
    var body: some View {
        Toggle("Can see earlier messages", isOn: $includeHistory)
        Text("Off: they'll only see messages from when they join.")
            .manrope(.footnote).foregroundStyle(.secondary)
    }
}

struct AddGroupContactView: View {
    let groupID: String
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(GroupsStore.self) private var groups
    private var store: GroupChatStore { groups.conversations.store(for: groupID) }
    private var snapshot: GroupSnapshot? { store.snapshot }
    @State private var error: String?
    @State private var loading = false

    private var sortedContacts: [Contact] {
        contacts.contacts.sorted {
            let order = $0.name.localizedStandardCompare($1.name)
            return order == .orderedSame ? $0.id < $1.id : order == .orderedAscending
        }
    }
    private func isMember(_ contact: Contact) -> Bool {
        guard let agentID = contact.agentID else { return false }
        return snapshot?.members.contains { $0.kind == "agent" && $0.id == agentID } == true
    }
    var body: some View {
        List {
            if let error = error ?? contacts.error {
                Text(error).manrope(.footnote).foregroundStyle(.red)
                Button("Retry") { Task { await reload() } }.disabled(loading)
            }
            Section {
                ForEach(sortedContacts) { contact in
                    let inGroup = isMember(contact)
                    NavigationLink(value: HomeDestination.groupContactConsent(groupID, contact.id)) {
                        HStack(spacing: 12) {
                            ContactAvatar(contact: contact, size: 48)
                            Text(contact.name).manrope(.body, weight: .semibold)
                                .foregroundStyle(inGroup || !contact.canManage ? .secondary : .primary)
                            Spacer(minLength: 8)
                            if inGroup {
                                Text("In group")
                                    .manrope(.caption2, weight: .semibold)
                                    .foregroundStyle(.secondary)
                                    .padding(.horizontal, 8).padding(.vertical, 4)
                                    .background(.quaternary, in: Capsule())
                            } else if !contact.canManage {
                                Text("Shared contact").manrope(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .disabled(inGroup || !contact.canManage || snapshot?.canInvite != true)
                    .accessibilityValue(inGroup ? "Already in this group" : (contact.canManage ? "" : "Only the creator can add this contact"))
                }
            } footer: {
                Text("Only contacts you created can be added. Contacts already in the group are marked and cannot be selected.")
                    .manrope(.footnote)
            }
            if loading { ProgressView("Loading contacts…") }
            if contacts.hasLoaded && contacts.nextCursor == nil && sortedContacts.isEmpty && !loading && error == nil {
                Text("No contacts yet").manrope().foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Add your contact").navigationBarTitleDisplayMode(.inline)
        .task { await reload() }
        .refreshable { await reload() }
    }
    private func reload() async {
        guard !loading else { return }
        loading = true
        error = nil
        defer { loading = false }
        do { try await store.refreshDetails(id: groupID, auth: auth) }
        catch is CancellationError { }
        catch { self.error = error.localizedDescription }
        await contacts.refresh(using: auth)
        while !Task.isCancelled, contacts.error == nil, let cursor = contacts.nextCursor {
            await contacts.loadMore(using: auth)
            if contacts.nextCursor == cursor { break }
        }
    }
}

struct AddGroupContactConsentView: View {
    let groupID: String
    let contactID: String
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(GroupsStore.self) private var groups
    @Environment(\.dismiss) private var dismiss
    private var store: GroupChatStore { groups.conversations.store(for: groupID) }
    private var snapshot: GroupSnapshot? { store.snapshot }
    @State private var shareMemory = false
    @State private var contributorConsent = false
    @State private var includeHistory = true
    @State private var busy = false
    @State private var error: String?
    private var contact: Contact? { contacts.contact(id: contactID) }
    private var inGroup: Bool {
        guard let agentID = contact?.agentID else { return false }
        return snapshot?.members.contains { $0.kind == "agent" && $0.id == agentID } == true
    }
    var body: some View {
        Form {
            Section {
                VStack(spacing: 12) {
                    ContactAvatar(contact: contact, size: 96)
                    Text(contact?.name ?? "Contact").manrope(.title2, weight: .semibold)
                }
                .frame(maxWidth: .infinity).padding(.vertical, 12)
                .listRowBackground(Color.clear)
            }
            Section("Shared memory") {
                Text("Adding this contact lets it use what group members, including you, have told it with everyone in the group, except chats kept private. It remains the same contact in your other chats.")
                    .manrope(.footnote).foregroundStyle(.secondary)
                Toggle("I accept shared memory", isOn: $shareMemory)
                if snapshot?.contributorModel == true {
                    Text("Your selected model is Contributor. Messages and memories sent to Meta may be used for model training.")
                        .manrope(.footnote).foregroundStyle(.secondary)
                    Toggle("I accept Contributor data use", isOn: $contributorConsent)
                }
            }
            Section("Group history") {
                GroupHistoryAccessToggle(includeHistory: $includeHistory)
            }
            if let error { Text(error).manrope(.footnote).foregroundStyle(.red) }
            if inGroup { Text("This contact is already in the group.").manrope(.footnote).foregroundStyle(.secondary) }
            Button("Add contact", action: addContact)
                .disabled(busy || inGroup || contact?.canManage != true || snapshot?.canInvite != true)
            if busy { ProgressView("Adding contact…") }
        }
        .disabled(busy)
        .navigationTitle("Add contact").navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(busy)
        .task {
            do {
                try await store.refreshDetails(id: groupID, auth: auth)
                try await contacts.refreshContact(id: contactID, using: auth)
            } catch is CancellationError { }
            catch { self.error = error.localizedDescription }
        }
    }
    private func addContact() {
        guard !busy, !inGroup, contact?.canManage == true, snapshot?.canInvite == true else { return }
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                _ = try await GroupService.data("\(groupID)/agents", method: "POST", input: ["contactID": contactID,
                    "shareMemory": shareMemory, "contributorConsent": contributorConsent, "includeHistory": includeHistory], auth: auth)
                store.invalidateDetails()
                try await store.refreshDetails(id: groupID, auth: auth)
                await groups.refresh(using: auth)
                dismiss()
            } catch is CancellationError { }
            catch { self.error = error.localizedDescription }
        }
    }
}
