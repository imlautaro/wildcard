import SwiftUI

struct ContentView: View {
    @Environment(AuthStore.self) private var auth

    var body: some View {
        Group {
            switch auth.state {
            case .restoring:
                ProgressView("Restoring your session")
            case .signedOut:
                AuthenticationView()
            case .unavailable:
                ContentUnavailableView {
                    Label("Unable to restore session", systemImage: "wifi.exclamationmark")
                        .manrope(.title2, weight: .semibold)
                } description: {
                    Text(auth.error ?? "Please try again when you are connected.")
                } actions: {
                    Button("Try again") { Task { await auth.restore() } }
                }
            case .signedIn:
                NavigationStack {
                    Form {
                        if let user = auth.user {
                            Section {
                                LabeledContent("Name", value: user.name)
                                LabeledContent("Email", value: user.email)
                                LabeledContent("Email verified", value: user.emailVerified ? "Yes" : "No")
                            } header: {
                                Text("Account").manrope(.footnote, weight: .semibold)
                            }
                        }
                        if let error = auth.error {
                            Text(error).foregroundStyle(.red)
                        }
                        Section {
                            Button("Sign out", role: .destructive) { Task { await auth.signOut() } }
                                .disabled(auth.isBusy)
                            if auth.isBusy { ProgressView() }
                        }
                    }
                    .navigationTitle("Account")
                }
            }
        }
    }
}
