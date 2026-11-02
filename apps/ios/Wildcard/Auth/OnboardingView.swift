import SwiftUI
import Observation

struct OnboardingInput: Codable, Sendable {
    var name = ""
    var age: Int? = nil
    var gender = "male"
    /// Suggests the app language for contacts (still editable), like the web.
    var language = Bundle.main.preferredLocalizations.first == "es" ? "es" : "en"
    var country = ""
    var style = "cartoon"
    var createGroup = true
    var circleType = "friends"
    var occupation = ""
    var sharedMemoryConsent = false
    /// false starts without AI contacts (docs/onboarding.md#progressive-setup).
    var createContacts = true
    /// Theme for the Custom style, at most 80 characters (docs/onboarding.md#character-styles).
    var customStyle = ""

    init() {}
    private enum CodingKeys: String, CodingKey {
        case name, age, gender, language, country, style, createGroup, circleType, occupation, sharedMemoryConsent, createContacts, customStyle
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
        createContacts = try values.decodeIfPresent(Bool.self, forKey: .createContacts) ?? true
        customStyle = try values.decodeIfPresent(String.self, forKey: .customStyle) ?? ""
    }
}
struct OnboardingOption: Decodable, Identifiable, Sendable {
    let code: String
    let name: String
    var id: String { code }
}
extension [OnboardingOption] {
    var pickerOptions: [SearchablePicker.Option] { map { SearchablePicker.Option(value: $0.code, label: $0.name) } }
    /// The API names languages in English; name them on device in the app's language by ISO 639-1 code.
    var languagePickerOptions: [SearchablePicker.Option] {
        Self.localized(self) { code in
            Locale.current.localizedString(forLanguageCode: code).map { name in
                // Spanish and other locales name languages in lowercase ("español").
                name.prefix(1).uppercased(with: Locale.current) + name.dropFirst()
            }
        }
    }
    /// The API names countries in English; name them on device in the app's language by region code.
    var countryPickerOptions: [SearchablePicker.Option] {
        Self.localized(self) { Locale.current.localizedString(forRegionCode: $0) }
    }
    private static func localized(_ options: [OnboardingOption], name: (String) -> String?) -> [SearchablePicker.Option] {
        options.map { SearchablePicker.Option(value: $0.code, label: name($0.code) ?? $0.name) }
            .sorted { $0.label.localizedStandardCompare($1.label) == .orderedAscending }
    }
}
extension OnboardingOption {
    /// Avatar style names by code (shared/onboarding.ts); an unknown code keeps the API's name.
    var styleName: String {
        switch code {
        case "cartoon": String(localized: "Cartoon", comment: "Avatar style")
        case "anime": String(localized: "Anime", comment: "Avatar style")
        case "3d": String(localized: "3D animated movie", comment: "Avatar style")
        case "realistic": String(localized: "Realistic people", comment: "Avatar style")
        case "pets": String(localized: "3D animated pets", comment: "Avatar style")
        case "custom": String(localized: "Custom", comment: "Avatar style")
        default: name
        }
    }
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
                    // ?custom=1: this build can send customStyle, so it is offered the Custom style.
                    let (data, _) = try await api.send(path: "onboarding/options", token: token, query: [URLQueryItem(name: "custom", value: "1")])
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
        if !input.createContacts { input.createGroup = false; input.circleType = "friends"; input.occupation = "" }
        if input.style != "custom" { input.customStyle = "" }
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
            // The person enters the app right away; contacts keep being created in Chats.
            if result.status != "failed" { try? await auth.refreshProfile() }
        } catch is CancellationError { }
        catch { if current == revision { self.error = error.localizedDescription } }
    }

    /// Follows the first circle from the chat list without loading the onboarding options.
    func refreshStatus(auth: AuthStore) async {
        let current = revision
        guard let value = try? await auth.withSession({ api, token in
            try JSONDecoder().decode(OnboardingSnapshot.self, from: try await api.send(path: "onboarding", token: token).0)
        }), current == revision else { return }
        snapshot = value
    }

    /// Retries an unfinished circle with the saved preferences (the body is ignored).
    func retry(auth: AuthStore) async {
        revision += 1
        let current = revision
        busy = true
        defer { if current == revision { busy = false } }
        do {
            let value = try await auth.withSession { api, token in
                try JSONDecoder().decode(OnboardingSnapshot.self, from: try await api.send(path: "onboarding", method: "POST", body: Data("{}".utf8), token: token).0)
            }
            if current == revision { snapshot = value; error = nil }
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
                    Text("Start with five AI contacts with different personalities, or start empty and add contacts later.")
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
                        SearchablePicker(title: "Preferred language", selection: $store.draft.language, options: options.languages.languagePickerOptions)
                        SearchablePicker(title: "Country", selection: $store.draft.country, options: options.countries.countryPickerOptions,
                                         placeholder: String(localized: "Choose your country"))
                    } header: {
                        HStack {
                            Text("About you")
                            InfoButton(title: String(localized: "About you"), text: String(localized: "Your contacts will have names common in your country and speak your preferred language. Contacts in every style are adults, usually within two years of your age, with a minimum age of 18. Gender does not determine your contacts’ personalities."))
                        }
                    }
                    .disabled(store.locked || store.busy)
                    Section {
                        Toggle("Create my first five contacts with AI", isOn: $store.draft.createContacts)
                    }
                    .disabled(store.locked || store.busy)
                    if store.draft.createContacts {
                    Section("Agent appearance") {
                        Picker("Style", selection: $store.draft.style) {
                            ForEach(options.styles) { Text($0.styleName).tag($0.code) }
                        }
                        if store.draft.style == "custom" {
                            TextField("Describe your characters (friendly robots, kittens…)", text: $store.draft.customStyle)
                                .onChange(of: store.draft.customStyle) { _, value in
                                    if value.count > 80 { store.draft.customStyle = String(value.prefix(80)) }
                                }
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
                    } header: {
                        HStack {
                            Text("Your circle")
                            InfoButton(title: String(localized: "Your circle"), text: String(localized: "Friends have varied interests. Study and work teams use your field to create complementary contacts."))
                        }
                    }
                    .disabled(store.locked || store.busy)
                    Section {
                        Toggle("I agree to create my circle with shared memory", isOn: $store.draft.sharedMemoryConsent)
                    } footer: {
                        Text("I agree to enable shared memory for my five AI contacts. If I create a group, its members can read the full group history. Facts shared in private or group chats may become shared memories recalled by these contacts in other chats; private transcripts remain access controlled. Setup uses Meta Standard processing.")
                    }
                    .disabled(store.locked || store.busy)
                    }
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
                            Button(store.busy ? "Saving…" : store.locked ? "Retry setup" : store.draft.createContacts ? "Create my circle" : "Start") {
                                // This task belongs to the session store and survives view navigation.
                                Task { await store.submit(auth: auth) }
                            }
                            .disabled(store.busy || store.draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                      || store.draft.name.count > 100 || store.draft.country.isEmpty || (store.draft.createContacts && !store.draft.sharedMemoryConsent)
                                      || (!store.locked && store.draft.createContacts && store.draft.style == "custom"
                                          && store.draft.customStyle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                                      || (!store.locked && (!(1...120).contains(store.draft.age ?? 0)
                                          || store.draft.occupation.count > 200
                                          || (store.draft.createContacts && store.draft.circleType != "friends" && store.draft.occupation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))))
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
                    // Progressive setup lets the person into the app while the circle is created.
                    if store.running { try? await auth.refreshProfile() }
                    if auth.user?.onboardingRequired == false { return }
                    do { try await Task.sleep(for: .seconds(store.running ? 3 : 10)) }
                    catch { return }
                }
            }
        }
    }
}
