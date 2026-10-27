import SwiftUI

struct ContactInvitationsView: View {
    @Environment(AuthStore.self) private var auth
    @Environment(ContactInvitationsStore.self) private var invitations

    var body: some View {
        List {
            if let error = invitations.error {
                Section {
                    Text(error).manrope(.footnote).foregroundStyle(.red)
                    Button("Retry") { Task { await invitations.refresh(using: auth, force: true) } }
                }
            }
            ForEach(invitations.invitations) { invitation in
                NavigationLink(value: HomeDestination.receivedInvitation(invitation)) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(invitation.contactName).manrope(.headline)
                        Text("Invited by \(invitation.senderName)").manrope(.subheadline).foregroundStyle(.secondary)
                        Text("Expires \(Date(timeIntervalSince1970: invitation.expiresAt / 1000).formatted(date: .abbreviated, time: .shortened))")
                            .manrope(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .overlay {
            if invitations.invitations.isEmpty && invitations.error == nil {
                if invitations.isLoading && !invitations.hasLoaded { ProgressView("Loading invitations…") }
                else {
                    ContentUnavailableView("No invitations", systemImage: "envelope.open",
                        description: Text("Contact invitations sent to your account appear here."))
                }
            }
        }
        .navigationTitle("Contact Invitations")
        .navigationBarTitleDisplayMode(.inline)
        .task { await invitations.refresh(using: auth, force: true) }
        .refreshable { await invitations.refresh(using: auth, force: true) }
    }
}

struct ReceivedContactInvitationView: View {
    let invitation: ReceivedContactInvitation
    let accepted: (String) -> Void
    @Environment(AuthStore.self) private var auth
    @Environment(ContactInvitationsStore.self) private var invitations
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.dismiss) private var dismiss
    @State private var shareMemory = false
    @State private var contributorConsent = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Form {
            Section {
                Text("Invited by \(invitation.senderName)")
                Text("Start your own private chat with the same contact. Its memories and presence are shared. Your schedules and notifications belong to you.")
                Text("The contact can share remembered facts about you with other participants. Original messages and attachments stay private. The creator can remove your access.")
                Toggle("I agree to shared memories", isOn: $shareMemory)
                if invitations.contributorModel {
                    Toggle("I agree to Meta's Contributor data use", isOn: $contributorConsent)
                    Text("Messages and shared memories sent to Meta may be used to train its models.")
                        .manrope(.footnote).foregroundStyle(.secondary)
                }
                Button("Accept Invitation") { accept() }
                    .disabled(!shareMemory || (invitations.contributorModel && !contributorConsent))
                Button("Decline Invitation", role: .destructive) { decline() }
            } header: {
                Text(invitation.contactName)
            } footer: {
                Text("Expires \(Date(timeIntervalSince1970: invitation.expiresAt / 1000).formatted(date: .abbreviated, time: .shortened)). Only your account can accept this invitation.")
            }
            if busy { ProgressView() }
            if let error { Text(error).manrope(.footnote).foregroundStyle(.red) }
        }
        .disabled(busy || invitations.isMutating)
        .navigationTitle("Contact Invitation")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(busy)
    }

    private func accept() {
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                let id = try await invitations.accept(id: invitation.id, contributorConsent: contributorConsent, using: auth)
                await contacts.refresh(using: auth)
                try await contacts.refreshContact(id: id, using: auth)
                accepted(id)
            } catch is CancellationError { }
            catch { self.error = error.localizedDescription }
        }
    }

    private func decline() {
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                try await invitations.decline(id: invitation.id, using: auth)
                dismiss()
            } catch is CancellationError { }
            catch { self.error = error.localizedDescription }
        }
    }
}
