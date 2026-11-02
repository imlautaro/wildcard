import SwiftUI
import Observation

struct ContactGenerationInput: Codable, Sendable {
    var age = 25
    var gender = "female"
    var style = "cartoon"
    /// Theme for the Custom style; sent only with that style.
    var customStyle: String? = nil
    var purpose = "friends"
    var language = "en"
    var country = ""
    /// Chosen name; nil generates one with AI.
    var name: String? = nil
    /// "generate", "upload" or "none"; jobs from older clients omit it and generated a portrait.
    var photo: String? = "generate"
}
struct ContactGenerationJob: Decodable, Sendable {
    let id: String
    let status: String
    let contactID: String?
    let input: ContactGenerationInput
}
@MainActor @Observable
final class ContactGenerationStore {
    var draft = ContactGenerationInput()
    /// The cropped JPEG for "Upload a photo"; kept with the draft until the job is submitted.
    var upload: Data?
    private(set) var job: ContactGenerationJob?
    private(set) var busy = false
    private(set) var options: OnboardingOptions?
    var error: String?
    /// The contact a job submitted or watched in this session just created; the form opens its chat.
    var created: String?
    private var initialized = false
    private var loading = false
    private var revision = 0
    private var submissionID: String?
    private var dismissedID: String?
    var running: Bool { ["queued", "generating"].contains(job?.status ?? "") }
    /// An empty name is generated; a typed one must be a valid contact name.
    var nameValid: Bool {
        let name = (draft.name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return name.isEmpty || ProfileIdentityView<EmptyView>.validatedName(name) != nil
    }
    var ready: Bool {
        !draft.country.isEmpty && (18...120).contains(draft.age)
            && (draft.style != "custom" || !(draft.customStyle ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            // A submitted job (a failed one being retried) already has its photo on the server.
            && nameValid && (draft.photo != "upload" || upload != nil || job != nil)
    }
    func reset() {
        revision += 1; draft = ContactGenerationInput(); upload = nil; job = nil; options = nil
        busy = false; loading = false; initialized = false; error = nil; submissionID = nil; dismissedID = nil; created = nil
    }
    /// A finished job is never a form state: it opens the new contact when this session
    /// submitted or watched it, and otherwise leaves a fresh form for the next contact.
    private func adopt(_ fetched: ContactGenerationJob?) {
        guard let fetched, fetched.id != dismissedID else { job = nil; return }
        guard fetched.status == "complete" else { job = fetched; return }
        if job?.id == fetched.id || submissionID == fetched.id {
            created = fetched.contactID
            // The next contact starts without this one's name or photo.
            draft.name = nil; upload = nil
            if draft.photo == "upload" { draft.photo = "generate" }
        }
        dismissedID = fetched.id; job = nil; submissionID = nil
    }
    func refresh(auth: AuthStore) async {
        guard !loading, !busy else { return }
        loading = true
        let current = revision
        defer { if current == revision { loading = false } }
        do {
            let cached = options
            let result = try await auth.withSession { api, token in
                let choices: OnboardingOptions
                if let cached { choices = cached }
                else {
                    let (data, _) = try await api.send(path: "onboarding/options", token: token, query: [URLQueryItem(name: "custom", value: "1")])
                    choices = try JSONDecoder().decode(OnboardingOptions.self, from: data)
                }
                let (preferences, _) = try await api.send(path: "onboarding", token: token)
                let saved = try JSONDecoder().decode(OnboardingSnapshot.self, from: preferences)
                let (data, _) = try await api.send(path: "contacts/generation", token: token)
                struct Envelope: Decodable { let job: ContactGenerationJob? }
                return (choices, saved, try JSONDecoder().decode(Envelope.self, from: data).job)
            }
            guard current == revision else { return }
            options = result.0
            if !initialized {
                if let saved = result.1.input { draft.language = saved.language; draft.country = saved.country; draft.style = saved.style; draft.customStyle = saved.customStyle.isEmpty ? nil : saved.customStyle }
                initialized = true
            }
            adopt(result.2)
            if let job { draft = job.input; draft.photo = draft.photo ?? "generate"; submissionID = job.id }
            error = nil
        } catch is CancellationError { }
        catch { if current == revision { self.error = error.localizedDescription } }
    }
    func submit(auth: AuthStore) async {
        guard !busy, ready else { return }
        revision += 1; loading = false
        let current = revision
        submissionID = submissionID ?? UUID().uuidString.lowercased()
        let id = submissionID!
        var input = draft
        if input.style != "custom" { input.customStyle = nil }
        input.name = ProfileIdentityView<EmptyView>.validatedName(input.name ?? "")
        // Retrying a submitted upload job may omit the photo: the server reuses its staged copy.
        let upload = input.photo == "upload" ? self.upload?.base64EncodedString() : nil
        busy = true; error = nil
        defer { if current == revision { busy = false } }
        do {
            let result = try await auth.withSession { api, token in
                struct Input: Encodable { let id: String; let input: ContactGenerationInput; let upload: String? }
                struct Envelope: Decodable { let job: ContactGenerationJob }
                let body = try JSONEncoder().encode(Input(id: id, input: input, upload: upload))
                let (data, _) = try await api.send(path: "contacts/generation", method: "POST", body: body, token: token)
                return try JSONDecoder().decode(Envelope.self, from: data).job
            }
            guard current == revision else { return }
            adopt(result)
        } catch is CancellationError { }
        catch { if current == revision { self.error = error.localizedDescription } }
    }
}

struct ContactGenerationSection: View {
    /// Opens the chat with the contact this form created.
    let onCreated: (String) -> Void
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        @Bindable var store = auth.contactGeneration
        // This section always exists, so it owns polling and the hand-off to the new chat.
        Section {
            if store.busy || store.running {
                ContactGenerationProgressView(running: store.running)
            } else if let options = store.options {
                Group {
                    Picker("Visual style", selection: $store.draft.style) {
                        ForEach(options.styles) { Text($0.name).tag($0.code) }
                    }
                    if store.draft.style == "custom" {
                        TextField("Describe your character (a friendly robot, a kitten…)", text: Binding(
                            get: { store.draft.customStyle ?? "" },
                            set: { store.draft.customStyle = String($0.prefix(80)) }))
                    }
                    Picker("Relationship", selection: $store.draft.purpose) {
                        Text("Friend").tag("friends")
                        Text("Study partner").tag("study")
                        Text("Work colleague").tag("work")
                    }
                    Stepper("Age: \(store.draft.age)", value: $store.draft.age, in: 18...120)
                    Picker("Gender", selection: $store.draft.gender) {
                        Text("Male").tag("male"); Text("Female").tag("female")
                    }
                    SearchablePicker(title: String(localized: "Preferred language"), selection: $store.draft.language, options: options.languages.pickerOptions)
                    SearchablePicker(title: String(localized: "Country"), selection: $store.draft.country, options: options.countries.pickerOptions,
                                     placeholder: String(localized: "Choose a country"))
                }
                .disabled(store.busy || store.job != nil)
            } else {
                ProgressView()
            }
        } header: {
            HStack {
                Text("Your bot")
                InfoButton(title: String(localized: "Your bot"), text: String(localized: "These fields describe your bot. Your saved onboarding preferences are reused without asking for your details again. Generation uses Meta Standard processing."))
            }
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled {
                await store.refresh(auth: auth)
                do { try await Task.sleep(for: .seconds(store.running ? 3 : 10)) } catch { return }
            }
        }
        .onChange(of: store.created, initial: true) { _, id in
            guard let id else { return }
            store.created = nil
            Task { await contacts.refresh(using: auth, force: true) }
            onCreated(id)
        }
        if store.job?.status == "failed" || store.error != nil {
            Section {
                if !store.busy && store.job?.status == "failed" {
                    Text("Could not finish creating the contact. Create again to reuse what was already generated.")
                }
                if let error = store.error { Text(error).foregroundStyle(.red); Button("Refresh") { Task { await store.refresh(auth: auth) } } }
            }
        }
    }
}

/// The Create toolbar action for AI mode, matching manual creation.
struct ContactGenerationCreateButton: View {
    @Environment(AuthStore.self) private var auth

    var body: some View {
        let store = auth.contactGeneration
        Button(store.busy || store.running ? "Creating…" : "Create") { Task { await store.submit(auth: auth) } }
            .disabled(!store.ready || store.busy || store.running)
    }
}

/// Indeterminate activity: rotating descriptions do not imply server-reported stages.
private struct ContactGenerationProgressView: View {
    let running: Bool
    @Environment(\.scenePhase) private var scenePhase
    @State private var messageIndex = 0
    private let messages = [
        String(localized: "A unique personality is on the way, plus anything you left empty."),
        String(localized: "Your contact is being created with the preferences you chose."),
        String(localized: "This can take a few minutes. We are still working on your contact."),
    ]

    var body: some View {
        VStack(spacing: 20) {
            ProgressView().controlSize(.large).tint(.accentColor)
                .accessibilityLabel("Creating your contact")
            Text(running ? "Creating your contact…" : "Starting contact creation…")
                .font(.title3.weight(.semibold)).accessibilityAddTraits(.isHeader)
            Text(running ? messages[messageIndex] : String(localized: "Sending your request…"))
                .foregroundStyle(.secondary)
                .frame(minHeight: 64)
            if running {
                Text("You can leave this screen or close the app. Creation will continue in the background.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(5)) } catch { return }
                messageIndex = (messageIndex + 1) % messages.count
            }
        }
    }
}

/// Visual style for "Generate with AI" on an existing contact's photo
/// (docs/contact-generation.md#ai-photo-for-an-existing-contact).
struct ContactPhotoGenerationSheet: View {
    let generate: (_ style: String, _ customStyle: String?) -> Void
    @Environment(AuthStore.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @State private var style: String?
    @State private var customStyle = ""
    private var trimmedCustomStyle: String { customStyle.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        let store = auth.contactGeneration
        NavigationStack {
            Form {
                Section {
                    if let options = store.options {
                        Picker("Visual style", selection: Binding(get: { style ?? store.draft.style }, set: { style = $0 })) {
                            ForEach(options.styles) { Text($0.name).tag($0.code) }
                        }
                        if (style ?? store.draft.style) == "custom" {
                            TextField("Describe your character (a friendly robot, a kitten…)", text: Binding(
                                get: { customStyle }, set: { customStyle = String($0.prefix(80)) }))
                        }
                    } else {
                        ProgressView()
                    }
                } footer: {
                    Text("A new portrait is created from this contact's personality. It replaces the current photo for everyone who has this contact.")
                }
            }
            .navigationTitle("Generate with AI")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Generate") {
                        let chosen = style ?? store.draft.style
                        generate(chosen, chosen == "custom" ? trimmedCustomStyle : nil)
                        dismiss()
                    }
                    .disabled(store.options == nil || ((style ?? store.draft.style) == "custom" && trimmedCustomStyle.isEmpty))
                }
            }
            .task {
                if customStyle.isEmpty { customStyle = store.draft.customStyle ?? "" }
                if store.options == nil { await store.refresh(auth: auth) }
                if customStyle.isEmpty { customStyle = store.draft.customStyle ?? "" }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
