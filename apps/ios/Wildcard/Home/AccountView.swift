import SwiftUI

struct AccountView: View {
    @Environment(PushNotifications.self) private var push
    @Environment(\.openURL) private var openURL
    @Environment(AuthStore.self) private var auth

    @State private var editingIdentity = false
    @State private var refreshingProfile = true

    var body: some View {
        Form {
            if let user = auth.user {
                Section {
                    ProfileIdentityView(
                        name: user.name,
                        hasPhoto: user.photoVersion != nil,
                        canEdit: !auth.isBusy && !refreshingProfile,
                        isWorking: $editingIdentity,
                        saveName: { try await auth.saveProfile(name: $0) },
                        savePhoto: { try await auth.saveProfilePhoto(data: $0) }
                    ) {
                        AccountAvatar(user: user, size: 96)
                    }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                }
                Section {
                    LabeledContent("Email", value: user.email)
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
                .disabled(auth.isBusy || editingIdentity || refreshingProfile)
                if auth.isBusy { ProgressView() }
            }
            if let error = auth.error {
                Text(error)
                    .foregroundStyle(.red)
            }
        }
        .task {
            refreshingProfile = true
            defer { refreshingProfile = false }
            try? await auth.refreshProfile()
        }
    }
}
