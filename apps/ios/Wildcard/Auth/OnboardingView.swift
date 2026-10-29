import SwiftUI
import Observation

struct OnboardingInput: Codable, Sendable {
    var name = ""
    var age: Int? = nil
    var gender = "male"
    var language = "en"
    var country = ""
    var style = "cartoon"
    var createGroup = true
    var circleType = "friends"
    var occupation = ""
    var sharedMemoryConsent = false

    init() {}
    private enum CodingKeys: String, CodingKey {
        case name, age, gender, language, country, style, createGroup, circleType, occupation, sharedMemoryConsent
    }
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        name = try values.decode(String.self, forKey: .name)
        age = try values.decodeIfPresent(Int.self, forKey: .age)
        gender = try values.decode(String.self, forKey: .gender)
        language = try values.decode(String.self, forKey: .language)
        country = try values.decode(String.self, forKey: .country)
        style = try values.decode(String.self, forKey: .style)
        createGroup = try values.decodeIfPresent(Bool.self, forKey: .createGroup) ?? true
        circleType = try values.decodeIfPresent(String.self, forKey: .circleType) ?? "friends"
        occupation = try values.decodeIfPresent(String.self, forKey: .occupation) ?? ""
        sharedMemoryConsent = try values.decode(Bool.self, forKey: .sharedMemoryConsent)
    }
}
struct OnboardingOption: Decodable, Identifiable, Sendable {
    let code: String
    let name: String
    var id: String { code }
}
extension [OnboardingOption] {
    var pickerOptions: [SearchablePicker.Option] { map { SearchablePicker.Option(value: $0.code, label: $0.name) } }
}
struct OnboardingOptions: Decodable, Sendable {
    let countries: [OnboardingOption]
    let languages: [OnboardingOption]
    let styles: [OnboardingOption]
}
struct OnboardingSnapshot: Decodable, Sendable {
    let status: String
    let photoCount: Int
    let groupID: String?
    let input: OnboardingInput?
}

@MainActor @Observable
final class OnboardingStore {
    var draft = OnboardingInput()
    private(set) var options: OnboardingOptions?
    private(set) var snapshot: OnboardingSnapshot?
    private(set) var busy = false
    var error: String?
    private var loading = false
    private var revision = 0
    var locked: Bool { snapshot?.input != nil }
    var running: Bool { ["queued", "generating"].contains(snapshot?.status ?? "") }

    func reset() {
        revision += 1
        draft = OnboardingInput()
        options = nil
        snapshot = nil
        busy = false
        loading = false
        error = nil
    }

    func refresh(auth: AuthStore) async {
        guard !loading, !busy else { return }
        let current = revision
        loading = true
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
                let (data, _) = try await api.send(path: "onboarding", token: token)
                return (choices, try JSONDecoder().decode(OnboardingSnapshot.self, from: data))
            }
            guard current == revision else { return }
            options = result.0
            snapshot = result.1
            if let input = result.1.input { draft = input }
            error = nil
            if result.1.status == "complete" { try await auth.refreshProfile() }
        } catch is CancellationError { }
        catch { if current == revision { self.error = error.localizedDescription } }
    }

    func submit(auth: AuthStore) async {
        guard !busy else { return }
        revision += 1
        loading = false
        let current = revision
        busy = true
        error = nil
        var input = draft
        if input.circleType == "friends" { input.occupation = "" }
        defer { if current == revision { busy = false } }
        do {
            let result = try await auth.withSession { api, token in
                let body = try JSONEncoder().encode(input)
                let (data, _) = try await api.send(path: "onboarding", method: "POST", body: body, token: token)
                return try JSONDecoder().decode(OnboardingSnapshot.self, from: data)
            }
            guard current == revision else { return }
            snapshot = result
            if let input = result.input { draft = input }
        } catch is CancellationError { }
        catch { if current == revision { self.error = error.localizedDescription } }
    }
}

struct OnboardingView: View {
    @Environment(AuthStore.self) private var auth
    var body: some View {
        @Bindable var store = auth.onboarding
        NavigationStack {
            Form {
                Section {
                    Text("Make yourself at home.").manrope(.largeTitle, weight: .bold)
                    Text("Five different personalities. Add a group to bring everyone together if you like.")
                        .foregroundStyle(.secondary)
                }
                if let options = store.options {
                    Section {
                        TextField("Your name", text: $store.draft.name)
                            .textContentType(.givenName)
                        TextField("Your age", value: $store.draft.age, format: .number.grouping(.never))
                            .keyboardType(.numberPad)
                            .accessibilityLabel("Your age in years")
                        Picker("Gender", selection: $store.draft.gender) {
                            Text("Male").tag("male")
                            Text("Female").tag("female")
                        }
                        SearchablePicker(title: "Preferred language", selection: $store.draft.language, options: options.languages.pickerOptions)
                        SearchablePicker(title: "Country", selection: $store.draft.country, options: options.countries.pickerOptions,
                                         placeholder: "Choose your country")
                    } header: {
                        Text("About you")
                    } footer: {
                        Text("Your contacts will have names common in your country and speak your preferred language. Contacts in every style are adults, usually within two years of your age, with a minimum age of 18. Gender does not determine your contacts’ personalities.")
                    }
                    .disabled(store.locked || store.busy)
                    Section("Agent appearance") {
                        Picker("Style", selection: $store.draft.style) {
                            ForEach(options.styles) { Text($0.name).tag($0.code) }
                        }
                    }
                    .disabled(store.locked || store.busy)
                    Section {
                        Picker("Your circle", selection: $store.draft.circleType) {
                            Text("Friends").tag("friends")
                            Text("Study").tag("study")
                            Text("Work").tag("work")
                        }
                        if store.draft.circleType != "friends" {
                            TextField(store.draft.circleType == "study" ? "What are you studying?" : "What do you do for work?", text: $store.draft.occupation)
                        }
                        Toggle("Create a group with my five contacts", isOn: $store.draft.createGroup)
                    } footer: {
                        Text("Friends have varied interests. Study and work teams use your field to create complementary contacts.")
                    }
                    .disabled(store.locked || store.busy)
                    Section {
                        Toggle("I agree to create my circle with shared memory", isOn: $store.draft.sharedMemoryConsent)
                    } footer: {
                        Text("I agree to enable shared memory for my five AI contacts. If I create a group, its members can read the full group history. Facts shared in private or group chats may become shared memories recalled by these contacts in other chats; private transcripts remain access controlled. Setup uses Meta Standard processing.")
                    }
                    .disabled(store.locked || store.busy)
                    Section {
                        if store.running {
                            HStack {
                                ProgressView()
                                Text(store.snapshot?.status == "queued" ? "Preparing your circle…" : "Creating your circle… \(store.snapshot?.photoCount ?? 0) of 5 portraits ready.")
                            }
                            Text("You can close the app. Your circle will keep taking shape.")
                                .foregroundStyle(.secondary)
                        } else if store.snapshot?.status != "complete" {
                            if store.snapshot?.status == "failed" {
                                Text("We could not finish your circle. Retry to continue with your saved preferences and portraits.")
                            }
                            Button(store.busy ? "Saving…" : store.locked ? "Retry setup" : "Create my circle") {
                                // This task belongs to the session store and survives view navigation.
                                Task { await store.submit(auth: auth) }
                            }
                            .disabled(store.busy || store.draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                      || store.draft.name.count > 100 || store.draft.country.isEmpty || !store.draft.sharedMemoryConsent
                                      || (!store.locked && (!(1...120).contains(store.draft.age ?? 0)
                                          || store.draft.occupation.count > 200
                                          || (store.draft.circleType != "friends" && store.draft.occupation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))))
                        }
                    }
                } else {
                    ProgressView("Loading your preferences…")
                }
                if let error = store.error {
                    Section {
                        Text(error).foregroundStyle(.red)
                        Button("Refresh") { Task { await store.refresh(auth: auth) } }
                    }
                }
                Section { Button("Sign out") { Task { await auth.signOut() } } }
            }
            .navigationTitle("Your circle")
            .task {
                if store.draft.name.isEmpty, auth.user?.name != "New member" { store.draft.name = auth.user?.name ?? "" }
                while !Task.isCancelled {
                    await store.refresh(auth: auth)
                    if auth.user?.onboardingRequired == false { return }
                    do { try await Task.sleep(for: .seconds(store.running ? 3 : 10)) }
                    catch { return }
                }
            }
        }
    }
}
