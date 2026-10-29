import SwiftUI

struct AccountView: View {
    @Environment(PushNotifications.self) private var push
    @Environment(\.openURL) private var openURL
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts

    @State private var chatModel = "muse-spark-1.3"
    @State private var contributorConsent = false
    @State private var savingModel = false
    @State private var modelError: String?
    @State private var editingIdentity = false
    @State private var refreshingProfile = true
    @State private var showingModel = false
    @State private var showingNotifications = false

    private static let models = [
        (value: "muse-spark-1.3", label: "Standard", detail: "Meta does not train on your data."),
        (value: "muse-spark-1.3-contributor", label: "Contributor", detail: "Meta may train models on what you send."),
    ]
    private var currentModel: String { auth.user?.chatModel ?? "muse-spark-1.3" }

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
                    LabeledContent {
                        Text(user.email)
                    } label: {
                        HStack {
                            Label("Email", systemImage: "envelope")
                            InfoButton(title: "Your profile", text: "Group members and people you share contacts with can see your name and photo.")
                        }
                    }
                }
            }
            Section {
                SheetRow(title: "Chat model", systemImage: "cpu",
                         value: Self.models.first { $0.value == currentModel }?.label ?? currentModel) {
                    chatModel = currentModel
                    contributorConsent = false
                    modelError = nil
                    showingModel = true
                }
                .disabled(refreshingProfile || auth.isBusy)
                SheetRow(title: "Notifications", systemImage: "bell", value: push.status) { showingNotifications = true }
                NavigationLink { McpConnectionsView(contactID: "account", cache: contacts.mcpSnapshots.store(for: "account")) }
                    label: { Label("Connections", systemImage: "link") }
                NavigationLink(value: HomeDestination.nativeExperiments) { Label("Native experiments", systemImage: "iphone") }
            }
            Section {
                Button("Sign out", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) {
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
        .sheet(isPresented: $showingModel) { modelSheet }
        .sheet(isPresented: $showingNotifications) { notificationsSheet }
        .task {
            refreshingProfile = true
            defer { refreshingProfile = false }
            chatModel = auth.user?.chatModel ?? "muse-spark-1.3"
            try? await auth.refreshProfile()
            chatModel = auth.user?.chatModel ?? "muse-spark-1.3"
        }
    }

    private var modelSheet: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Chat model", selection: $chatModel) {
                        ForEach(Self.models, id: \.value) { model in
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Muse Spark 1.3 · \(model.label)")
                                Text(model.detail).manrope(.caption).foregroundStyle(.secondary)
                            }
                            .tag(model.value)
                        }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                    .onChange(of: chatModel) { _, _ in contributorConsent = false }
                    if chatModel == "muse-spark-1.3-contributor" && chatModel != auth.user?.chatModel {
                        Toggle("I agree to Meta's Contributor data use", isOn: $contributorConsent)
                    }
                }
                if let modelError { Text(modelError).foregroundStyle(.red) }
            }
            .disabled(savingModel)
            .navigationTitle("Chat model")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { showingModel = false }.disabled(savingModel) }
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 4) {
                        Text("Chat model").manrope(.headline, weight: .semibold)
                        InfoButton(title: "Chat model", text: "Contributor allows Meta to use submitted messages, files, context and responses to train models. Standard does not. Applies to new chat jobs, schedules and group exchanges you start; jobs already started keep their model. Shared data may still use Contributor when you separately consent. MCP chats always use Standard.")
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(savingModel ? "Saving…" : "Save") {
                        savingModel = true
                        modelError = nil
                        Task {
                            defer { savingModel = false }
                            do {
                                try await auth.saveModel(chatModel, contributorConsent: contributorConsent)
                                showingModel = false
                            } catch { modelError = error.localizedDescription }
                        }
                    }
                    .disabled(savingModel || chatModel == currentModel || (chatModel == "muse-spark-1.3-contributor" && !contributorConsent))
                }
            }
        }
        .presentationDetents([.medium])
    }

    private var notificationsSheet: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Push notifications", value: push.status)
                    LabeledContent("App icon badge", value: push.badgeStatus)
                }
                Section {
                    Button("Enable notifications", systemImage: "bell.badge") {
                        Task { await push.activate(using: auth, requestPermission: true) }
                    }
                    .disabled(push.isBusy)
                    if push.badgeStatus != "Enabled" {
                        Button("Enable app icon badge", systemImage: "app.badge") {
                            Task { await push.activate(using: auth, requestPermission: true) }
                        }
                        .disabled(auth.isBusy || push.isBusy)
                    }
                    Button("Open notification settings", systemImage: "gear") {
                        if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
                    }
                }
                if let error = push.error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle("Notifications")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { showingNotifications = false } } }
        }
        .presentationDetents([.medium])
    }
}
