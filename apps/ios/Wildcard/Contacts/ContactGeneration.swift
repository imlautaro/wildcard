import SwiftUI
import Observation

struct ContactGenerationInput: Codable, Sendable {
    var age = 25
    var gender = "female"
    var style = "cartoon"
    var purpose = "friends"
    var language = "en"
    var country = ""
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
    var ready: Bool { !draft.country.isEmpty && (18...120).contains(draft.age) }
    func reset() {
        revision += 1; draft = ContactGenerationInput(); job = nil; options = nil
        busy = false; loading = false; initialized = false; error = nil; submissionID = nil; dismissedID = nil; created = nil
    }
    /// A finished job is never a form state: it opens the new contact when this session
    /// submitted or watched it, and otherwise leaves a fresh form for the next contact.
    private func adopt(_ fetched: ContactGenerationJob?) {
        guard let fetched, fetched.id != dismissedID else { job = nil; return }
        guard fetched.status == "complete" else { job = fetched; return }
        if job?.id == fetched.id || submissionID == fetched.id { created = fetched.contactID }
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
                    let (data, _) = try await api.send(path: "onboarding/options", token: token)
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
                if let saved = result.1.input { draft.language = saved.language; draft.country = saved.country; draft.style = saved.style }
                initialized = true
            }
            adopt(result.2)
            if let job { draft = job.input; submissionID = job.id }
            error = nil
        } catch is CancellationError { }
        catch { if current == revision { self.error = error.localizedDescription } }
    }
    func submit(auth: AuthStore) async {
        guard !busy, ready else { return }
        revision += 1; loading = false
        let current = revision
        submissionID = submissionID ?? UUID().uuidString.lowercased()
        let id = submissionID!, input = draft
        busy = true; error = nil
        defer { if current == revision { busy = false } }
        do {
            let result = try await auth.withSession { api, token in
                struct Input: Encodable { let id: String; let input: ContactGenerationInput }
                struct Envelope: Decodable { let job: ContactGenerationJob }
                let body = try JSONEncoder().encode(Input(id: id, input: input))
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
            if let options = store.options {
                Group {
                    Picker("Visual style", selection: $store.draft.style) {
                        ForEach(options.styles) { Text($0.name).tag($0.code) }
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
                    Picker("Preferred language", selection: $store.draft.language) {
                        ForEach(options.languages) { Text($0.name).tag($0.code) }
                    }
                    Picker("Country", selection: $store.draft.country) {
                        Text("Choose a country").tag("")
                        ForEach(options.countries) { Text($0.name).tag($0.code) }
                    }
                }
                .disabled(store.busy || store.job != nil)
            } else {
                ProgressView()
            }
        } header: {
            Text("Your bot")
        } footer: {
            Text("These fields describe your bot. Your saved onboarding preferences are reused without asking for your details again. Generation uses Meta Standard processing.")
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
        if store.running || store.job?.status == "failed" || store.error != nil {
            Section {
                if store.running {
                    ProgressView("Creating your contact and portrait…")
                    Text("You can close the app and return later.").font(.footnote)
                } else if store.job?.status == "failed" {
                    Text("Could not finish creating the contact. Create again to reuse the saved identity and portrait.")
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
        Button("Create") { Task { await store.submit(auth: auth) } }
            .disabled(!store.ready || store.busy || store.running)
    }
}
