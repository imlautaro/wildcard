import SwiftUI

/// Permanent self-deletion (docs/authentication.md#deleting-your-account). The current
/// password confirms it and the API checks it again. The sheet can't be dismissed while
/// the deletion runs; on success the store signs out and the app returns to sign-in.
struct DeleteAccountSheet: View {
    @Environment(AuthStore.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var deleting = false
    @State private var error: String?

    private static let consequences = [
        String(localized: "Your contacts and your chats with them, including memories, schedules, tasks, documents and mini apps."),
        String(localized: "Contacts you created also disappear for anyone you shared them with."),
        String(localized: "Groups you own, with every member's messages in them."),
        String(localized: "Your photo, attachments, stickers, connections, and the messages you sent or requested in other people's groups."),
        String(localized: "Shared task lists you created, tasks you created, were assigned or authorized for research or monitoring, documents you created or last edited, and your document revisions."),
    ]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("This permanently deletes your account and everything it owns. It can't be undone.")
                    ForEach(Self.consequences, id: \.self) { item in
                        Text(item).foregroundStyle(.secondary)
                    }
                } footer: {
                    Text("Files and background work are removed shortly afterward, with automatic retries if a service is unavailable.")
                }
                Section {
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .submitLabel(.done)
                } header: {
                    Text("Enter your password to confirm")
                }
                if let error { Text(error).foregroundStyle(.red) }
                Section {
                    Button(role: .destructive) {
                        deleting = true
                        error = nil
                        Task {
                            defer { deleting = false }
                            do { try await auth.deleteAccount(password: password) }
                            catch is CancellationError { }
                            catch { self.error = error.localizedDescription }
                        }
                    } label: {
                        HStack {
                            if deleting { Text("Deleting…") } else { Text("Delete account") }
                            if deleting { Spacer(); ProgressView() }
                        }
                    }
                    .disabled(deleting || password.isEmpty || password.count > 128)
                }
            }
            .disabled(deleting)
            .navigationTitle("Delete your account?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(deleting) }
            }
        }
        .interactiveDismissDisabled(deleting)
    }
}
