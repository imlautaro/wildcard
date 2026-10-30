import Foundation
import Observation
import SwiftUI

struct ContactPersonality: Codable, Equatable, Sendable {
    var enabled = false
    var description = ""
    var specialties = ""
    var birthDate: String? = nil
    var timeZone = "UTC"
    var traits = Dictionary(uniqueKeysWithValues: PersonalityTrait.all.map { ($0.key, 5) })

    private enum CodingKeys: String, CodingKey { case enabled, description, specialties, birthDate, timeZone, traits }
    init() {}
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        enabled = try values.decode(Bool.self, forKey: .enabled)
        description = try values.decode(String.self, forKey: .description)
        specialties = try values.decodeIfPresent(String.self, forKey: .specialties) ?? ""
        birthDate = try values.decodeIfPresent(String.self, forKey: .birthDate)
        timeZone = try values.decode(String.self, forKey: .timeZone)
        traits = try values.decode([String: Int].self, forKey: .traits)
    }
    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(enabled, forKey: .enabled)
        try values.encode(description, forKey: .description)
        try values.encode(specialties, forKey: .specialties)
        try values.encode(birthDate, forKey: .birthDate)
        try values.encode(timeZone, forKey: .timeZone)
        try values.encode(traits, forKey: .traits)
    }

    var isValid: Bool {
        guard description.unicodeScalars.count <= 2000, specialties.unicodeScalars.count <= 1000,
              !specialties.unicodeScalars.contains(where: { $0.value < 9 || (11...12).contains($0.value) || (14...31).contains($0.value) || (127...159).contains($0.value) }),
              TimeZone(identifier: timeZone) != nil,
              !description.unicodeScalars.contains(where: { $0.value < 9 || (11...12).contains($0.value) || (14...31).contains($0.value) || (127...159).contains($0.value) }),
              traits.count == PersonalityTrait.all.count,
              PersonalityTrait.all.allSatisfy({ (1...10).contains(traits[$0.key] ?? 0) }) else { return false }
        guard let birthDate else { return true }
        guard let parsed = Self.date(birthDate), Self.string(parsed) == birthDate,
              birthDate >= "1900-01-01" else { return false }
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: timeZone)
        formatter.dateFormat = "yyyy-MM-dd"
        let today = formatter.string(from: .now)
        guard let year = Int(today.prefix(4)), let birthYear = Int(birthDate.prefix(4)) else { return false }
        var anniversary = String(birthDate.suffix(5))
        if anniversary == "02-29", Self.date("\(year)-02-29") == nil { anniversary = "02-28" }
        let age = year - birthYear - (String(today.suffix(5)) < anniversary ? 1 : 0)
        return age >= 18
    }

    static func latestBirthday(timeZone: String) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let formatter = dateFormatter()
        formatter.timeZone = TimeZone(identifier: timeZone) ?? TimeZone(secondsFromGMT: 0)
        let today = date(formatter.string(from: .now)) ?? .now
        var candidate = calendar.date(byAdding: .year, value: -18, to: today) ?? today
        var profile = ContactPersonality()
        profile.timeZone = TimeZone(identifier: timeZone)?.identifier ?? "UTC"
        profile.birthDate = string(candidate)
        while !profile.isValid {
            candidate = calendar.date(byAdding: .day, value: -1, to: candidate)!
            profile.birthDate = string(candidate)
        }
        let next = calendar.date(byAdding: .day, value: 1, to: candidate)!
        profile.birthDate = string(next)
        return profile.isValid ? next : candidate
    }
    static func date(_ value: String) -> Date? {
        let formatter = dateFormatter()
        return formatter.date(from: value)
    }
    static func string(_ value: Date) -> String { dateFormatter().string(from: value) }
    private static func dateFormatter() -> DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        return formatter
    }
}

struct PersonalityTrait: Identifiable, Sendable {
    let key: String
    let label: String
    let low: String
    let high: String
    var id: String { key }
    static let all: [Self] = [
        .init(key: "energy", label: "Energy", low: "Calm", high: "Energetic"),
        .init(key: "patience", label: "Patience", low: "Restless", high: "Patient"),
        .init(key: "sensitivity", label: "Sensitivity", low: "Thick-skinned", high: "Sensitive"),
        .init(key: "expressiveness", label: "Expression", low: "Restrained", high: "Expressive"),
        .init(key: "playfulness", label: "Humor", low: "Serious", high: "Playful"),
        .init(key: "warmth", label: "Warmth", low: "Reserved", high: "Affectionate"),
        .init(key: "assertiveness", label: "Assertiveness", low: "Accommodating", high: "Direct"),
        .init(key: "curiosity", label: "Curiosity", low: "Focused", high: "Exploratory"),
        .init(key: "optimism", label: "Outlook", low: "Skeptical", high: "Optimistic"),
        .init(key: "formality", label: "Formality", low: "Casual", high: "Formal"),
        .init(key: "verbosity", label: "Detail", low: "Concise", high: "Expansive"),
        .init(key: "volatility", label: "Temper", low: "Even-tempered", high: "Quick-tempered"),
        .init(key: "resilience", label: "Recovery", low: "Slow to settle", high: "Quick to settle"),
        .init(key: "initiative", label: "Initiative", low: "Waits for you", high: "Starts conversations"),
        .init(key: "sarcasm", label: "Irony", low: "Literal", high: "Wry"),
        .init(key: "emoji", label: "Emoji", low: "Rarely", high: "Often"),
    ]
}

struct ContactPersonalitySnapshot: Codable, Equatable, Sendable {
    let personality: ContactPersonality
    let revision: Int
    let age: Int?
    let isBirthday: Bool
}

@MainActor @Observable
final class PersonalityDraft {
    var profile = ContactPersonality()
    var baseline = ContactPersonality()
    var revision = 0
    var loaded = false
    var saving = false
    var error: String?
    var saved = false
    var dirty: Bool { profile != baseline }

    func apply(_ snapshot: ContactPersonalitySnapshot) {
        profile = snapshot.personality
        if snapshot.revision == 0 { profile.timeZone = TimeZone.current.identifier }
        baseline = profile
        revision = snapshot.revision
        loaded = true
    }
}

struct GeneratedPersonality: Decodable, Sendable { let personality: ContactPersonality; let revision: Int }

extension AuthAPI {
    func contactPersonality(id: String, token: String) async throws -> ContactPersonalitySnapshot {
        let (data, _) = try await send(path: "contacts/\(id)/personality", token: token)
        return try JSONDecoder().decode(ContactPersonalitySnapshot.self, from: data)
    }

    func generatePersonality(id: String, token: String) async throws -> GeneratedPersonality {
        let (data, _) = try await send(path: "contacts/\(id)/personality/generate", method: "POST", body: Data("{}".utf8), token: token, timeout: 90)
        return try JSONDecoder().decode(GeneratedPersonality.self, from: data)
    }

    func savePersonality(id: String, personality: ContactPersonality, revision: Int, token: String) async throws -> ContactPersonalitySnapshot {
        struct Input: Encodable { let personality: ContactPersonality; let revision: Int }
        let body = try JSONEncoder().encode(Input(personality: personality, revision: revision))
        let (data, _) = try await send(path: "contacts/\(id)/personality", method: "PUT", body: body, token: token)
        return try JSONDecoder().decode(ContactPersonalitySnapshot.self, from: data)
    }
}

struct ContactPersonalityView: View {
    let contactID: String
    let cache: NavigationSnapshot<ContactPersonalitySnapshot>
    @Bindable var draft: PersonalityDraft
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.scenePhase) private var scenePhase
    @State private var loading = false
    @State private var confirmRefresh = false
    @State private var confirmGenerate = false
    @State private var showingTemperament = false
    /// IANA identifiers for the searchable time zone selector, sorted once.
    private static let knownTimeZones = TimeZone.knownTimeZoneIdentifiers.sorted()
        .map { SearchablePicker.Option(value: $0, label: $0.replacingOccurrences(of: "_", with: " ")) }
    /// Keeps a saved value the system lacks selectable.
    private var timeZoneOptions: [SearchablePicker.Option] {
        let zone = draft.profile.timeZone
        return Self.knownTimeZones.contains { $0.value == zone } ? Self.knownTimeZones
            : Self.knownTimeZones + [SearchablePicker.Option(value: zone, label: zone.replacingOccurrences(of: "_", with: " "))]
    }
    private var canEdit: Bool { contacts.contact(id: contactID)?.role == "owner" }

    var body: some View {
        Form {
            if draft.loaded {
                if canEdit {
                    Section {
                        HStack {
                            Button(draft.profile.description.isEmpty ? "Generate with AI" : "Regenerate with AI", systemImage: "sparkles") {
                                if draft.dirty { confirmGenerate = true } else { Task { await generate() } }
                            }.disabled(draft.saving || loading)
                            Spacer()
                            InfoButton(title: "Generate with AI", text: "Generate all personality fields with Meta Standard, then review and save the draft. Your contact name and adult birthday stay the same.")
                        }
                    }
                }
                Section {
                    HStack {
                        Toggle(isOn: $draft.profile.enabled) { Label("Personality experiment", systemImage: "theatermasks") }
                            .disabled(!canEdit || draft.saving)
                        InfoButton(title: "Personality experiment", text: "One shared character, with a relationship that follows each person across chats and groups. Private conversations stay private. Only its creator can edit these settings.")
                    }
                }
                Section {
                    TextEditor(text: $draft.profile.description).frame(minHeight: 120)
                        .accessibilityLabel("Stable identity")
                        .disabled(!canEdit || draft.saving)
                } header: {
                    HStack {
                        Text("Stable identity")
                        InfoButton(title: "Stable identity", text: "Briefly describe values, ways of thinking, conversational quirks and flaws. Expertise and topic interests are welcome; avoid invented jobs, studies, physical experiences or daily routines. Identity is expressed through replies and shared with everyone who talks to the contact. Conversation and mood do not rewrite it. Saving changes starts a fresh emotional history.")
                    }
                }
                Section {
                    TextEditor(text: $draft.profile.specialties).frame(minHeight: 100)
                        .accessibilityLabel("Specialties")
                        .disabled(!canEdit || draft.saving)
                } header: {
                    HStack {
                        Text("Specialties")
                        InfoButton(title: "Specialties", text: "Things this contact is especially good at. These strengths are shared with everyone and independent of temperament. They can still talk about anything. Optional, up to 1,000 characters.")
                    }
                }
                Section {
                    Toggle("Date of birth", isOn: Binding(
                        get: { draft.profile.birthDate != nil },
                        set: { draft.profile.birthDate = $0 ? ContactPersonality.string(ContactPersonality.latestBirthday(timeZone: draft.profile.timeZone)) : nil }
                    ))
                    .disabled(!canEdit || draft.saving)
                    if draft.profile.birthDate != nil {
                        DatePicker("Date of birth", selection: Binding(
                            get: { draft.profile.birthDate.flatMap(ContactPersonality.date) ?? ContactPersonality.latestBirthday(timeZone: draft.profile.timeZone) },
                            set: { draft.profile.birthDate = ContactPersonality.string($0) }
                        ), in: (ContactPersonality.date("1900-01-01") ?? .distantPast)...ContactPersonality.latestBirthday(timeZone: draft.profile.timeZone),
                           displayedComponents: .date)
                        .environment(\.timeZone, TimeZone(secondsFromGMT: 0)!)
                        .disabled(!canEdit || draft.saving)
                    }
                    SearchablePicker(title: "Time zone", selection: $draft.profile.timeZone, options: timeZoneOptions)
                        .disabled(!canEdit || draft.saving)
                    if !draft.dirty, let age = cache.value?.age {
                        LabeledContent("Age", value: "\(age)")
                        if cache.value?.isBirthday == true { Text("Birthday today") }
                    }
                } header: {
                    HStack {
                        Text("Birthday")
                        InfoButton(title: "Birthday", text: "Age is calculated from the date of birth in the birthday time zone. February 29 is observed on February 28 in other years.")
                    }
                }
                Section {
                    SheetRow(title: "Temperament", systemImage: "slider.horizontal.3", value: "\(PersonalityTrait.all.count) traits") { showingTemperament = true }
                }
            } else if loading { ProgressView("Loading personality…") }
            if let error = draft.error { Text(error).foregroundStyle(.red).manrope(.footnote) }
            if draft.loaded {
                if !draft.profile.isValid {
                    Text("Use a birthday at least 18 years ago, a valid time zone, description up to 2,000 characters, specialties up to 1,000 characters, and whole-number traits from 1 to 10.")
                        .foregroundStyle(.red).manrope(.footnote)
                }
                if draft.saved && !draft.dirty { Text("Saved.").foregroundStyle(.secondary) }
            }
        }
        .refreshable { if draft.dirty { confirmRefresh = true } else { await refresh(discard: true) } }
        .sheet(isPresented: $showingTemperament) { temperamentSheet }
        .navigationTitle("Personality")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canEdit {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(!draft.loaded || !draft.dirty || !draft.profile.isValid || draft.saving)
                }
            }
        }
        .confirmationDialog("Discard your unsaved personality changes?", isPresented: $confirmRefresh) {
            Button("Discard and refresh", role: .destructive) { Task { await refresh(discard: true) } }
        }
        .confirmationDialog("Replace your unsaved personality draft with AI generation?", isPresented: $confirmGenerate) {
            Button("Generate draft", role: .destructive) { Task { await generate() } }
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            if !draft.loaded, let value = cache.value { draft.apply(value) }
            await refresh()
        }
    }

    private var temperamentSheet: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach(PersonalityTrait.all) { trait in
                        VStack(spacing: 10) {
                            HStack { Text(trait.label); Spacer(); Text("\(draft.profile.traits[trait.key] ?? 5)").foregroundStyle(.secondary).monospacedDigit() }
                            Slider(value: Binding(
                                get: { Double(draft.profile.traits[trait.key] ?? 5) },
                                set: { draft.profile.traits[trait.key] = Int($0) }
                            ), in: 1...10, step: 1).accessibilityLabel(trait.label)
                            HStack { Text(trait.low); Spacer(); Text(trait.high) }
                                .manrope(.caption).foregroundStyle(.secondary)
                        }.padding(.vertical, 4)
                    }
                }
                .disabled(!canEdit || draft.saving)
            }
            .navigationTitle("Temperament")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    InfoButton(title: "Temperament", text: "The contact expresses tendencies through tone and timing. It does not receive these scores. Feelings settle over time. Its acting direction adapts to each person without exposing private causes. Conversations with connections stay isolated. Follow-ups still respect your initiative switch and delivery limits.")
                }
                ToolbarItem(placement: .confirmationAction) { Button("Done") { showingTemperament = false } }
            }
        }
        .presentationDetents([.large])
    }

    private func refresh(discard: Bool = false) async {
        guard !loading, !draft.saving else { return }
        loading = true
        defer { loading = false }
        do {
            try await cache.refresh {
                try await auth.withSession { api, token in try await api.contactPersonality(id: contactID, token: token) }
            }
            if (!draft.dirty || discard), let value = cache.value { draft.apply(value) }
            draft.error = nil
        } catch is CancellationError { }
        catch AuthAPI.Failure.notFound {
            contacts.forgetPersonality(id: contactID)
            draft.error = "This contact is no longer available."
        } catch { draft.error = error.localizedDescription }
    }

    private func generate() async {
        guard canEdit, !draft.saving, !loading, draft.loaded else { return }
        draft.saving = true; draft.error = nil
        let accountID = auth.user?.id, expectedRevision = draft.revision
        defer { draft.saving = false }
        do {
            let result = try await auth.withSession { api, token in try await api.generatePersonality(id: contactID, token: token) }
            guard auth.user?.id == accountID, draft.loaded else { return }
            guard result.revision == expectedRevision else {
                draft.error = "Personality changed. Refresh before generating again."
                return
            }
            draft.profile = result.personality; draft.saved = false
        } catch is CancellationError { }
        catch AuthAPI.Failure.notFound { contacts.forgetPersonality(id: contactID) }
        catch { if auth.user?.id == accountID { draft.error = error.localizedDescription } }
    }

    private func save() async {
        guard canEdit, !draft.saving, draft.profile.isValid else { return }
        draft.saving = true
        draft.error = nil
        cache.invalidate()
        defer { draft.saving = false }
        let profile = draft.profile, revision = draft.revision
        do {
            try await cache.refresh {
                try await auth.withSession { api, token in
                    try await api.savePersonality(id: contactID, personality: profile, revision: revision, token: token)
                }
            }
            if let value = cache.value { draft.apply(value); draft.saved = true }
        } catch is CancellationError { }
        catch AuthAPI.Failure.notFound { contacts.forgetPersonality(id: contactID) }
        catch { draft.error = error.localizedDescription }
    }
}
