import SwiftUI

struct AccountView: View {
    @Environment(PushNotifications.self) private var push
    @Environment(\.openURL) private var openURL
    @Environment(AuthStore.self) private var auth

    var body: some View {
        Form {
            if let user = auth.user {
                Section {
                    HStack {
                        Spacer()
                        AccountAvatar(user: user, size: 96)
                        Spacer()
                    }
                    .listRowBackground(Color.clear)
                    LabeledContent("Name", value: user.name)
                    NavigationLink("Edit Profile") { AccountEditorView(user: user) }
                    LabeledContent("Email", value: user.email)
                } header: {
                    Text("Your account").manrope(.footnote, weight: .semibold)
                }
            }
            Section("Notifications") {
                LabeledContent("Push notifications", value: push.status)
                LabeledContent("App icon badge", value: push.badgeStatus)
                Button("Enable notifications") {
                    Task { await push.activate(using: auth, requestPermission: true) }
                }
                .disabled(push.isBusy)
                if push.badgeStatus != "Enabled" {
                    Button("Enable app icon badge") {
                        Task { await push.activate(using: auth, requestPermission: true) }
                    }
                    .disabled(auth.isBusy || push.isBusy)
                }
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
        .task { try? await auth.refreshProfile() }
    }
}
