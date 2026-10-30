import SwiftUI

struct ContactEditorView: View {
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var error: String?
    @State private var saving = false
    @State private var contactID: String?
    @State private var photoData: Data?
    @State private var photoChanged = false
    @State private var editingIdentity = false
    @State private var creationMode = "manual"
    /// Opens the chat with a contact this editor created.
    private let onCreated: ((String) -> Void)?
    private var canEdit: Bool { contactID.flatMap { contacts.contact(id: $0) }?.canManage ?? true }

    init(contact: Contact? = nil, onCreated: ((String) -> Void)? = nil) {
        _contactID = State(initialValue: contact?.id)
        _name = State(initialValue: contact?.name ?? "")
        self.onCreated = onCreated
    }

    var body: some View {
        Form {
            if contactID == nil {
                Section {
                    Picker("Create contact", selection: $creationMode) {
                        Text("Manually").tag("manual")
                        Text("Generate with AI").tag("ai")
                    }
                }
            }
            if contactID == nil && creationMode == "ai" {
                ContactGenerationSection { id in onCreated?(id) ?? dismiss() }
            }
            if contactID != nil || creationMode == "manual" {
            Section {
                ProfileIdentityView(
                    name: name,
                    hasPhoto: photoData != nil || (!photoChanged && contactID.flatMap { contacts.contact(id: $0)?.photoVersion } != nil),
                    canEdit: canEdit && !saving && !contacts.isMutating,
                    isWorking: $editingIdentity,
                    saveName: { name = $0 },
                    savePhoto: { photoData = $0; photoChanged = true }
                ) {
                    if let photoData, let image = UIImage(data: photoData) {
                        Image(uiImage: image).resizable().scaledToFill()
                            .frame(width: 96, height: 96).clipShape(Circle())
                            .accessibilityLabel("Selected contact photo")
                    } else {
                        ContactAvatar(contact: photoChanged ? nil : contactID.flatMap { contacts.contact(id: $0) }, size: 96)
                    }
                }
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }
            }
            if let contactID {
                Section {
                    Toggle(isOn: Binding(
                        get: { contacts.contact(id: contactID)?.initiativeEnabled != 0 },
                        set: { enabled in
                            guard !contacts.isMutating else { return }
                            Task {
                                do { try await contacts.setInitiative(contactID: contactID, enabled: enabled, using: auth) }
                                catch is CancellationError { }
                                catch { self.error = error.localizedDescription }
                            }
                        }
                    )) {
                        HStack {
                            Label("Conversation initiative", systemImage: "bubble.left.and.text.bubble.right")
                            InfoButton(title: "Conversation initiative", text: "Allow occasional follow-ups and new conversations. Timing adapts to this chat and the contact's personality. Unanswered greetings stop further social openers until you engage again. Ask the contact to pause, or turn this off to stop initiative. Applies only to your private chat.")
                        }
                    }
                    .disabled(saving || contacts.isMutating)
                    if auth.user?.features?.voiceMessages == true {
                        ContactVoiceRows(contactID: contactID, disabled: saving) { self.error = $0 }
                    }
                    if contacts.contact(id: contactID)?.role == "owner" {
                        ContactEnergyRow(contactID: contactID, cache: contacts.energySnapshots.store(for: contactID))
                    }
                }
                Section {
                    NavigationLink {
                        ContactPersonalityView(contactID: contactID, cache: contacts.personalitySnapshot(id: contactID),
                                               draft: contacts.personalityDraft(id: contactID))
                    } label: { Label("Personality", systemImage: "person") }
                    NavigationLink { ConversationLearningView(base: "contacts/\(contactID)", cache: contacts.learningSnapshots.store(for: contactID)) }
                        label: { Label("Conversation learning", systemImage: "lightbulb") }
                    NavigationLink { McpAccessView(path: "contacts/\(contactID)/mcp", group: false, cache: contacts.mcpAccessSnapshots.store(for: "contact:\(contactID)")) }
                        label: { Label("Connections", systemImage: "link") }
                    NavigationLink { MiniAppListView(base: "contacts/\(contactID)") } label: { Label("Mini apps", systemImage: "square.grid.2x2") }
                    NavigationLink { TasksView(base: "contacts/\(contactID)", snapshot: contacts.taskSnapshots.store(for: "contacts/\(contactID)")) }
                        label: { Label("Tasks", systemImage: "checklist") }
                }
                ChatMediaSection(scope: .contact(contactID), cache: contacts.mediaSnapshots, documents: contacts.documentCaches)
                Section {
                    NavigationLink(value: HomeDestination.nativeTools(contactID)) {
                        Label { Text("Native experiments") } icon: { NativeGlyph(kind: "default", size: 28, symbol: "iphone") }
                    }
                }
            }
            if !canEdit {
                Text("Shared contact · managed by its creator")
                    .manrope(.footnote).foregroundStyle(.secondary)
            }
            if let error {
                Text(error).manrope(.footnote).foregroundStyle(.red)
            }
            if saving { ProgressView("Saving…") }
        }
        .task(id: contactID) {
            guard let contactID else { return }
            // Feature flags come only from `GET /me`; revalidate them so the Voice section follows the admin switch.
            async let profile: Void? = try? auth.refreshProfile()
            do { try await contacts.refreshContact(id: contactID, using: auth, force: false) }
            catch is CancellationError { }
            catch { self.error = error.localizedDescription }
            _ = await profile
        }
        .navigationTitle(contactID == nil ? "Add Contact" : (canEdit ? "Edit Contact" : "Contact"))
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(saving)
        .toolbar {
            if contactID == nil && creationMode == "ai" {
                ToolbarItem(placement: .confirmationAction) { ContactGenerationCreateButton() }
            } else if canEdit {
                ToolbarItem(placement: .confirmationAction) {
                    Button(contactID == nil ? "Create" : "Save", action: save)
                        .disabled(saving || contacts.isMutating || editingIdentity)
                }
            }
        }
    }

    private func save() {
        guard canEdit, !saving, !contacts.isMutating, !editingIdentity else { return }
        let creating = contactID == nil
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.unicodeScalars.count <= 100,
              !trimmed.unicodeScalars.contains(where: { $0.value < 0x20 || (0x7f...0x9f).contains($0.value) }) else {
            error = "Use a name with 1–100 characters and no control characters."
            return
        }
        saving = true
        error = nil
        Task {
            defer { saving = false }
            do {
                let saved = try await contacts.save(name: trimmed, contactID: contactID, using: auth)
                contactID = saved.id
                if photoChanged {
                    do { try await contacts.savePhoto(contactID: saved.id, data: photoData, using: auth) }
                    catch is CancellationError { return }
                    catch {
                        self.error = "Contact saved, but the photo could not be saved. \(error.localizedDescription) Tap Save to retry."
                        return
                    }
                }
                if creating, let onCreated { onCreated(saved.id) } else { dismiss() }
            } catch is CancellationError {
                // Navigation/session changes must not report a server error.
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

/// Creator-only Group energy row: the row shows the points and polls every five seconds
/// while visible; its sheet has the meter, next recharge and Reset (web: ContactEnergySection).
private struct ContactEnergyRow: View {
    let contactID: String
    let cache: NavigationSnapshot<ContactEnergy>
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.scenePhase) private var scenePhase
    @State private var busy = false
    @State private var error: String?
    @State private var presented = false

    var body: some View {
        SheetRow(title: "Group energy", systemImage: "bolt",
                 value: cache.value.map { "\($0.points) / \($0.capacity)" } ?? (busy ? "Loading…" : "—")) { presented = true }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await refresh()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(5)) }
                catch { return }
                await refresh()
            }
        }
        .sheet(isPresented: $presented) {
            NavigationStack {
                Form {
                    Section {
                        if let energy = cache.value {
                            HStack(alignment: .firstTextBaseline, spacing: 4) {
                                Text("\(energy.points)").manrope(.largeTitle, weight: .semibold)
                                Text("/ \(energy.capacity)").manrope(.title3).foregroundStyle(.secondary)
                            }
                            ProgressView(value: Double(energy.points), total: Double(energy.capacity))
                                .tint(energy.points <= 5 ? .orange : .green)
                            if let timestamp = energy.nextPointAt {
                                Text("Next point at \(Date(timeIntervalSince1970: timestamp / 1000).formatted(date: .omitted, time: .shortened))")
                                    .manrope(.footnote).foregroundStyle(.secondary)
                            }
                        } else if busy {
                            ProgressView("Loading energy…")
                        }
                        Button("Reset to 50", systemImage: "arrow.clockwise") { Task { await refresh(reset: true) } }
                            .disabled(busy || cache.value == nil)
                    }
                    if let error {
                        Section {
                            Text(error).manrope(.footnote).foregroundStyle(.red)
                            Button("Retry") { Task { await refresh() } }.disabled(busy)
                        }
                    }
                }
                .navigationTitle("Group energy")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        InfoButton(title: "Group energy", text: "Each group message uses one point. One point recharges every five minutes, even offline. Private replies do not use energy.")
                    }
                    ToolbarItem(placement: .confirmationAction) { Button("Done") { presented = false } }
                }
            }
            .presentationDetents([.medium])
        }
    }

    private func refresh(reset: Bool = false) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        if reset { cache.invalidate() }
        do {
            try await cache.refresh {
                try await auth.withSession { api, token in
                    try await api.contactEnergy(id: contactID, reset: reset, token: token)
                }
            }
            error = nil
        } catch is CancellationError { }
        catch AuthAPI.Failure.notFound {
            contacts.energySnapshots.remove(id: contactID)
            error = "This contact is no longer available to its creator."
        }
        catch { self.error = error.localizedDescription }
    }
}

/// Voice replies: each participant's own opt-in toggle, and a row whose sheet holds the
/// accent and the shared voice its creator chooses.
private struct ContactVoiceRows: View {
    // Keep codes and labels aligned with shared/voice.ts.
    private let accents: [(code: String, name: String)] = [
        ("AR", "Argentine"),
        ("UY", "Uruguayan"),
        ("MX", "Mexican"),
        ("ES", "Spanish (Spain)"),
        ("CL", "Chilean"),
        ("CO", "Colombian"),
        ("PE", "Peruvian"),
        ("VE", "Venezuelan"),
        ("US", "American"),
        ("GB", "British"),
        ("AU", "Australian"),
        ("IE", "Irish"),
        ("BR", "Brazilian"),
        ("PT", "Portuguese (Portugal)"),
        ("FR", "French"),
        ("IT", "Italian"),
        ("DE", "German"),
    ]
    let contactID: String
    let disabled: Bool
    let report: (String) -> Void
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    private var contact: Contact? { contacts.contact(id: contactID) }

    @State private var presented = false
    private var accentName: String { accents.first { $0.code == contact?.speechAccent }?.name ?? "Default accent" }

    var body: some View {
        Toggle(isOn: Binding(
            get: { contact?.voiceMessagesEnabled == 1 },
            set: { enabled in
                guard !contacts.isMutating else { return }
                Task {
                    do { try await contacts.setVoiceMessages(contactID: contactID, enabled: enabled, using: auth) }
                    catch is CancellationError { }
                    catch { report(error.localizedDescription) }
                }
            }
        )) {
            HStack {
                Label("Voice messages", systemImage: "mic")
                InfoButton(title: "Voice messages", text: "With voice messages on, \(contact?.name ?? "this contact") sometimes answers your private chat with a short voice message. In groups, the creator's setting applies.")
            }
        }
        .disabled(disabled || contacts.isMutating)
        SheetRow(title: "Voice", systemImage: "person.wave.2", value: "\(accentName) · \(contact?.voiceName ?? "Automatic voice")") { presented = true }
            .sheet(isPresented: $presented) {
                NavigationStack {
                    Form {
                        SearchablePicker(title: "Accent", selection: Binding(
                            get: { contact?.speechAccent ?? "" },
                            set: { accent in
                                guard !contacts.isMutating else { return }
                                Task {
                                    do { try await contacts.setSpeechAccent(contactID: contactID, accent: accent, using: auth) }
                                    catch is CancellationError { }
                                    catch { report(error.localizedDescription) }
                                }
                            }
                        ), options: [SearchablePicker.Option(value: "", label: "Default accent")]
                            + accents.map { SearchablePicker.Option(value: $0.code, label: $0.name) })
                        .disabled(disabled || contacts.isMutating || contact?.canManage != true)
                        if contact?.canManage == true {
                            NavigationLink {
                                ContactVoicePickerView(contactID: contactID, catalog: contacts.voiceCatalog.store(for: "voices"))
                            } label: {
                                LabeledContent("Voice", value: contact?.voiceName ?? "Automatic")
                            }
                            .disabled(disabled)
                        } else {
                            LabeledContent("Voice", value: contact?.voiceName ?? "Automatic")
                        }
                    }
                    .navigationTitle("Voice")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            InfoButton(title: "Voice", text: "Accent guides regional wording in text and voice, without forcing slang or changing the language. Audio results depend on the voice; samples keep their original accent. " + (contact?.canManage == true ? "Everyone who chats with this contact hears the voice you choose." : "The contact's creator chooses its voice."))
                        }
                        ToolbarItem(placement: .confirmationAction) { Button("Done") { presented = false } }
                    }
                }
                .presentationDetents([.medium, .large])
            }
    }
}

/// Creator-only voice picker with a sample for each catalog voice.
private struct ContactVoicePickerView: View {
    let contactID: String
    let catalog: NavigationSnapshot<[VoiceOption]>
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @State private var loading = false
    @State private var error: String?
    @State private var savingID: String?
    @State private var sampleLoading: String?
    @State private var sampleTask: Task<Void, Never>?
    @State private var query = ""
    private var player: VoicePlayer { VoicePlayer.shared }
    private var visibleVoices: [VoiceOption] {
        let term = query.trimmingCharacters(in: .whitespaces)
        guard !term.isEmpty else { return catalog.value ?? [] }
        return (catalog.value ?? []).filter { "\($0.name) \($0.summary)".range(of: term, options: [.caseInsensitive, .diacriticInsensitive]) != nil }
    }

    var body: some View {
        List {
            if let voices = catalog.value {
                if voices.isEmpty {
                    Text("No voices are available.").manrope().foregroundStyle(.secondary)
                } else if visibleVoices.isEmpty {
                    Text("No matches").manrope().foregroundStyle(.secondary)
                }
                ForEach(visibleVoices) { voice in
                    HStack(spacing: 12) {
                        Button { choose(voice) } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(voice.name).manrope()
                                    if !voice.summary.isEmpty {
                                        Text(voice.summary).manrope(.caption).foregroundStyle(.secondary)
                                    }
                                }
                                Spacer()
                                if savingID == voice.id { ProgressView() }
                                else if contacts.contact(id: contactID)?.voiceID == voice.id {
                                    Image(systemName: "checkmark").foregroundStyle(Color.accentColor)
                                        .accessibilityLabel("Selected")
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(savingID != nil || contacts.isMutating)
                        sampleButton(voice)
                    }
                }
            } else if loading {
                ProgressView("Loading voices…")
            }
            if let error {
                Section {
                    Text(error).manrope(.footnote).foregroundStyle(.red)
                    Button("Retry") { Task { await refresh() } }.disabled(loading)
                }
            }
        }
        // Voice catalogs are long; search name and description, like long selectors.
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search voices")
        .navigationTitle("Voice")
        .navigationBarTitleDisplayMode(.inline)
        .task { await refresh() }
        .refreshable { await refresh(force: true) }
        .onDisappear {
            sampleTask?.cancel()
            if player.currentKey?.contains("/voices/") == true { player.stop() }
        }
    }

    private func sampleButton(_ voice: VoiceOption) -> some View {
        let resource = VoiceAudioResource.voicePreview(voiceID: voice.id)
        let key = "\(auth.user?.id ?? "")/\(resource.key)"
        return Button {
            if player.isPlaying(key) { player.pause(); return }
            sampleTask?.cancel()
            sampleLoading = voice.id
            sampleTask = Task {
                defer { if sampleLoading == voice.id { sampleLoading = nil } }
                do {
                    let data = try await auth.voiceAudio(resource)
                    try Task.checkCancellation()
                    if !player.play(data, key: key) {
                        error = "This sample could not be played."
                        await auth.images.audio.remove(resource)
                    }
                } catch is CancellationError { }
                catch { self.error = error.localizedDescription }
            }
        } label: {
            Group {
                if sampleLoading == voice.id { ProgressView() }
                else { Image(systemName: player.isPlaying(key) ? "pause.circle.fill" : "play.circle.fill").font(.title2) }
            }
            .frame(width: 32, height: 32)
        }
        .buttonStyle(.borderless)
        .accessibilityLabel(player.isPlaying(key) ? "Pause sample of \(voice.name)" : "Play sample of \(voice.name)")
    }

    /// The catalog is reused for the session; an explicit refresh revalidates it.
    private func refresh(force: Bool = false) async {
        guard force || catalog.value == nil, !loading else { return }
        loading = true
        defer { loading = false }
        do {
            try await catalog.refresh {
                try await auth.withSession { api, token in try await api.voices(token: token) }
            }
            error = nil
        } catch is CancellationError { }
        catch { self.error = catalog.value == nil ? error.localizedDescription : nil }
    }

    private func choose(_ voice: VoiceOption) {
        guard savingID == nil, contacts.contact(id: contactID)?.voiceID != voice.id else { return }
        savingID = voice.id
        error = nil
        Task {
            defer { savingID = nil }
            do { try await contacts.setVoice(contactID: contactID, voiceID: voice.id, using: auth) }
            catch is CancellationError { }
            catch { self.error = error.localizedDescription }
        }
    }
}
