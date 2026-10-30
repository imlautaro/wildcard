import SwiftUI

struct ContactSharingView: View {
    let contactID: String
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    let cache: NavigationSnapshot<ContactSharing>
    private var sharing: ContactSharing? { cache.value }
    @State private var invitation: ContactInvitation?
    @State private var shareMemory = false
    @State private var contributorConsent = false
    @State private var busy = false
    @State private var error: String?
    @State private var removal: ContactSharing.Member?
    @State private var recipientEmail = ""

    private var canInvite: Bool {
        sharing != nil && shareMemory && (sharing?.contributorModel != true || contributorConsent)
    }

    @State private var showingInvite = false
    private static let aboutSharing = "Everyone talks to the same contact, with shared memories and presence. Each person starts an empty, private chat and keeps their own schedules and notifications. Invitations appear inside Wildcard; no email is sent. They expire after 24 hours. Up to four participants, including you."

    var body: some View {
        Form {
            if let invitation {
                Section("New invitation") {
                    if let code = invitation.code {
                        Text(code).textSelection(.enabled).font(.system(.footnote, design: .monospaced))
                        HStack {
                            ShareLink(item: code) { Label("Share code", systemImage: "square.and.arrow.up") }
                            Spacer()
                            InfoButton(title: "Invitation code", text: "The recipient signs in, taps + → Join Shared Contact, and pastes this code. Anyone with this code can accept it, so share it only with your intended recipient.")
                        }
                    } else if let email = invitation.recipientEmail {
                        Label("Invitation sent to \(email)", systemImage: "checkmark.circle")
                    }
                }
            }
            if let sharing {
                Section {
                    ForEach(sharing.members) { member in
                        HStack {
                            Label(member.name, systemImage: member.role == "owner" ? "person.crop.circle.badge.checkmark" : "person.crop.circle")
                            Spacer()
                            if member.role == "owner" { Text("Creator").foregroundStyle(.secondary) }
                            else {
                                Button(role: .destructive) { removal = member } label: { Image(systemName: "person.badge.minus") }
                                    .buttonStyle(.borderless)
                                    .accessibilityLabel("Remove \(member.name)")
                            }
                        }
                    }
                    Button("Invite someone", systemImage: "person.badge.plus") {
                        shareMemory = false; contributorConsent = false; recipientEmail = ""; showingInvite = true
                    }
                } header: {
                    HStack {
                        Text("Participants")
                        InfoButton(title: "Shared contacts", text: Self.aboutSharing)
                    }
                }
                if !sharing.invitations.isEmpty {
                    Section("Pending invitations") {
                        ForEach(sharing.invitations) { invite in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(invite.recipientEmail ?? "Invitation code")
                                    Text("Expires \(Date(timeIntervalSince1970: invite.expiresAt / 1000).formatted(date: .abbreviated, time: .shortened))")
                                        .manrope(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Button(role: .destructive) { revoke(invitationID: invite.id) } label: { Image(systemName: "xmark.circle") }
                                    .buttonStyle(.borderless)
                                    .accessibilityLabel("Revoke invitation")
                            }
                        }
                    }
                }
            }
            if busy && sharing == nil { ProgressView() }
            if let error, !showingInvite {
                Text(error).foregroundStyle(.red).manrope(.footnote)
                Button("Retry") { Task { await load() } }
            }
        }
        .sheet(isPresented: $showingInvite) { inviteSheet }
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

    private var inviteSheet: some View {
        NavigationStack {
            Form {
                Section {
                    // Consent covers this text, so it stays visible beside the switches.
                    Text("The contact can recall facts learned from anyone here, including saved memories from before sharing. Chat transcripts and attachments stay private.")
                        .manrope(.footnote).foregroundStyle(.secondary)
                    Toggle("Share existing and future memories", isOn: $shareMemory)
                    if sharing?.contributorModel == true {
                        Text("Your selected model is Contributor. Messages and shared memories sent to Meta may be used to train its models.")
                            .manrope(.footnote).foregroundStyle(.secondary)
                        Toggle("I agree to Meta's Contributor data use", isOn: $contributorConsent)
                    }
                }
                Section {
                    TextField("Existing user's email", text: $recipientEmail)
                        .textContentType(.emailAddress).keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button("Send invitation", systemImage: "paperplane") { createInvitation(byEmail: true) }
                        .disabled(!canInvite || recipientEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                } header: { Text("By email") }
                Section {
                    Button("Create invitation code", systemImage: "qrcode") { createInvitation() }.disabled(!canInvite)
                } header: { Text("Or with a code") }
                if let error { Text(error).foregroundStyle(.red).manrope(.footnote) }
            }
            .disabled(busy)
            .navigationTitle("Invite")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { InfoButton(title: "Shared contacts", text: Self.aboutSharing) }
                ToolbarItem(placement: .confirmationAction) { Button("Done") { showingInvite = false } }
            }
        }
        .presentationDetents([.large])
    }

    private func load() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await cache.refresh {
                try await auth.withSession { api, token in try await api.contactSharing(id: contactID, token: token) }
            }
            error = nil
        } catch is CancellationError { }
        catch AuthAPI.Failure.notFound {
            contacts.sharingSnapshots.remove(id: contactID)
            error = "This contact is no longer available."
        }
        catch { self.error = error.localizedDescription }
    }

    private func createInvitation(byEmail: Bool = false) {
        let email = byEmail ? recipientEmail.trimmingCharacters(in: .whitespacesAndNewlines) : nil
        if let email, let ownEmail = auth.user?.email,
           email.lowercased() == ownEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
            error = "You cannot invite your own account. Enter another user's email."
            return
        }
        busy = true
        cache.invalidate()
        error = nil
        Task {
            do {
                invitation = try await auth.withSession { api, token in
                    try await api.inviteContact(id: contactID, email: email, contributorConsent: contributorConsent, token: token)
                }
                showingInvite = false
                cache.invalidate()
                busy = false
                await load()
            } catch is CancellationError { busy = false }
            catch { self.error = error.localizedDescription; busy = false }
        }
    }

    private func revoke(memberID: String? = nil, invitationID: String? = nil) {
        busy = true
        cache.invalidate()
        error = nil
        Task {
            do {
                try await auth.withSession { api, token in
                    try await api.revokeContactAccess(id: contactID, memberID: memberID, invitationID: invitationID, token: token)
                }
                if invitationID != nil { invitation = nil }
                cache.invalidate()
                busy = false
                await load()
            } catch is CancellationError { busy = false }
            catch { self.error = error.localizedDescription; busy = false }
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
            } catch is CancellationError { }
            catch { self.error = error.localizedDescription }
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
            } catch is CancellationError { }
            catch { self.error = error.localizedDescription }
        }
    }
}
