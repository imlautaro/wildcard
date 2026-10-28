import SwiftUI

struct AccountView: View {
    @Environment(PushNotifications.self) private var push
    @Environment(\.openURL) private var openURL
    @Environment(AuthStore.self) private var auth

    @State private var chatModel = "muse-spark-1.3"
    @State private var contributorConsent = false
    @State private var savingModel = false
    @State private var modelError: String?
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
            Section {
                Picker("Chat model", selection: $chatModel) {
                    Text("Muse Spark 1.3 · Standard").tag("muse-spark-1.3")
                    Text("Muse Spark 1.3 · Contributor").tag("muse-spark-1.3-contributor")
                }
                .onChange(of: chatModel) { _, _ in contributorConsent = false }
                if chatModel == "muse-spark-1.3-contributor" && chatModel != auth.user?.chatModel {
                    Toggle("I agree to Meta's Contributor data use", isOn: $contributorConsent)
                }
                Button(savingModel ? "Saving…" : "Save model") {
                    savingModel = true
                    modelError = nil
                    Task {
                        defer { savingModel = false }
                        do { try await auth.saveModel(chatModel, contributorConsent: contributorConsent) }
                        catch { modelError = error.localizedDescription }
                    }
                }
                .disabled(chatModel == (auth.user?.chatModel ?? "muse-spark-1.3") || (chatModel == "muse-spark-1.3-contributor" && !contributorConsent))
                if let modelError { Text(modelError).foregroundStyle(.red) }
            } header: {
                Text("Chat model")
            } footer: {
                Text("Contributor allows Meta to use submitted messages, files, context and responses to train models. Standard does not. Applies to new chat jobs, schedules and group exchanges you start; jobs already started keep their model. Shared data may still use Contributor when you separately consent. MCP chats always use Standard.")
            }
            .disabled(savingModel || refreshingProfile || auth.isBusy)
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
                .disabled(auth.isBusy || editingIdentity || refreshingProfile || savingModel)
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
            chatModel = auth.user?.chatModel ?? "muse-spark-1.3"
            try? await auth.refreshProfile()
            chatModel = auth.user?.chatModel ?? "muse-spark-1.3"
        }
    }
}
