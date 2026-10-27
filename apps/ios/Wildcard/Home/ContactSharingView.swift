import SwiftUI

struct ContactSharingView: View {
    let contactID: String
    @Environment(AuthStore.self) private var auth
    @State private var sharing: ContactSharing?
    @State private var invitation: ContactInvitation?
    @State private var shareMemory = false
    @State private var contributorConsent = false
    @State private var busy = false
    @State private var error: String?
    @State private var removal: ContactSharing.Member?

    var body: some View {
        Form {
            Section {
                Text("Everyone talks to the same contact, with shared memories and presence. Each person starts an empty, private chat and keeps their own schedules and notifications.")
                Text("The contact can recall facts learned from anyone here, including saved memories from before sharing. Chat transcripts and attachments stay private.")
                Toggle("Share existing and future memories", isOn: $shareMemory)
                if sharing?.contributorModel == true {
                    Toggle("I agree to Meta's Contributor data use", isOn: $contributorConsent)
                    Text("This installation uses a Contributor model. Messages and shared memories sent to Meta may be used to train its models.")
                        .manrope(.footnote).foregroundStyle(.secondary)
                }
                Button("Create Invitation") { createInvitation() }
                    .disabled(sharing == nil || !shareMemory || (sharing?.contributorModel == true && !contributorConsent))
            } footer: {
                Text("Invitations expire after 24 hours and can be used once. Up to four participants, including you. Anyone with the code can accept it; send it only to your intended recipient.")
            }
            if let invitation {
                Section("New Invitation") {
                    Text(invitation.code).textSelection(.enabled).font(.system(.footnote, design: .monospaced))
                    ShareLink(item: invitation.code) { Label("Share Invitation Code", systemImage: "square.and.arrow.up") }
                    Text("The recipient signs in, taps + → Join Shared Contact, and pastes this code.")
                        .manrope(.footnote).foregroundStyle(.secondary)
                }
            }
            if let sharing {
                Section("Participants") {
                    ForEach(sharing.members) { member in
                        HStack {
                            Text(member.name)
                            Spacer()
                            if member.role == "owner" { Text("Creator").foregroundStyle(.secondary) }
                            else { Button("Remove", role: .destructive) { removal = member } }
                        }
                    }
                }
                Section("Pending Invitations") {
                    ForEach(sharing.invitations) { invite in
                        HStack {
                            Text("Expires \(Date(timeIntervalSince1970: invite.expiresAt / 1000).formatted(date: .abbreviated, time: .shortened))")
                                .manrope(.footnote)
                            Spacer()
                            Button("Revoke", role: .destructive) { revoke(invitationID: invite.id) }
                        }
                    }
                }
            }
            if busy { ProgressView() }
            if let error {
                Text(error).foregroundStyle(.red).manrope(.footnote)
                Button("Retry") { Task { await load() } }
            }
        }
        .disabled(busy)
        .navigationTitle("Share Contact")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .alert("Remove participant?", isPresented: Binding(get: { removal != nil }, set: { if !$0 { removal = nil } })) {
            Button("Remove", role: .destructive) {
                let id = removal?.id
                removal = nil
                if let id { revoke(memberID: id) }
            }
            Button("Cancel", role: .cancel) { removal = nil }
        } message: {
            Text("Their access, private chat, schedules, and contributed memories will be deleted. Facts already repeated in other chats cannot be recalled.")
        }
    }

    private func load() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            sharing = try await auth.withSession { api, token in try await api.contactSharing(id: contactID, token: token) }
            error = nil
        } catch { self.error = error.localizedDescription }
    }

    private func createInvitation() {
        busy = true
        error = nil
        Task {
            do {
                invitation = try await auth.withSession { api, token in
                    try await api.inviteContact(id: contactID, contributorConsent: contributorConsent, token: token)
                }
                busy = false
                await load()
            } catch { self.error = error.localizedDescription; busy = false }
        }
    }

    private func revoke(memberID: String? = nil, invitationID: String? = nil) {
        busy = true
        error = nil
        Task {
            do {
                try await auth.withSession { api, token in
                    try await api.revokeContactAccess(id: contactID, memberID: memberID, invitationID: invitationID, token: token)
                }
                if invitationID != nil { invitation = nil }
                busy = false
                await load()
            } catch { self.error = error.localizedDescription; busy = false }
        }
    }
}

struct JoinSharedContactView: View {
    let joined: (String) -> Void
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @State private var code = ""
    @State private var preview: InvitationPreview?
    @State private var shareMemory = false
    @State private var contributorConsent = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Form {
            Section {
                TextField("Invitation code", text: $code)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .onChange(of: code) { _, _ in preview = nil; shareMemory = false; contributorConsent = false }
                Button("Preview Contact") { inspect() }.disabled(code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            if let preview {
                Section(preview.name) {
                    Text("Start your own empty chat with this contact. Its memories and presence are shared with other participants. Your schedules and notifications belong to you.")
                    Text("The contact can share remembered facts about you with other participants. Your original messages and attachments are private. The creator can remove your access.")
                    Toggle("I agree to shared memories", isOn: $shareMemory)
                    if preview.contributorModel {
                        Toggle("I agree to Meta's Contributor data use", isOn: $contributorConsent)
                        Text("Messages and shared memories sent to Meta may be used to train its models.")
                            .manrope(.footnote).foregroundStyle(.secondary)
                    }
                    Button("Join Contact") { join() }
                        .disabled(!shareMemory || (preview.contributorModel && !contributorConsent))
                }
            }
            if busy { ProgressView() }
            if let error { Text(error).manrope(.footnote).foregroundStyle(.red) }
        }
        .disabled(busy)
        .navigationTitle("Join Shared Contact")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func inspect() {
        busy = true
        error = nil
        let requestedCode = code.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            defer { busy = false }
            do {
                preview = try await auth.withSession { api, token in try await api.previewInvitation(code: requestedCode, token: token) }
            } catch { self.error = error.localizedDescription }
        }
    }

    private func join() {
        busy = true
        error = nil
        let requestedCode = code.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            defer { busy = false }
            do {
                let id = try await auth.withSession { api, token in
                    try await api.joinContact(code: requestedCode, contributorConsent: contributorConsent, token: token)
                }
                await contacts.refresh(using: auth)
                try await contacts.refreshContact(id: id, using: auth)
                joined(id)
            } catch { self.error = error.localizedDescription }
        }
    }
}
