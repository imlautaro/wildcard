import SwiftUI

struct AccountView: View {
    @Environment(AuthStore.self) private var auth

    var body: some View {
        Form {
            if let user = auth.user {
                Section {
                    LabeledContent("Name", value: user.name)
                    LabeledContent("Email", value: user.email)
                } header: {
                    Text("Your account").manrope(.footnote, weight: .semibold)
                }
            }
            Section {
                Button("Sign out", role: .destructive) {
                    Task { await auth.signOut() }
                }
                .disabled(auth.isBusy)
                if auth.isBusy { ProgressView() }
            }
            if let error = auth.error {
                Text(error)
                    .foregroundStyle(.red)
            }
        }
    }
}
