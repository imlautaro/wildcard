import SwiftUI

struct AccountView: View {
    @Environment(PushNotifications.self) private var push
    @Environment(\.openURL) private var openURL
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
            Section("Notifications") {
                LabeledContent("Push notifications", value: push.status)
                Button("Enable notifications") {
                    Task { await push.activate(using: auth, requestPermission: true) }
                }
                .disabled(push.isBusy)
                Button("Open notification settings") {
                    if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
                }
                if let error = push.error { Text(error).foregroundStyle(.red) }
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
