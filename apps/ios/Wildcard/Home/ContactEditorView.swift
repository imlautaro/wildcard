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
    private var canEdit: Bool { contactID.flatMap { contacts.contact(id: $0) }?.canManage ?? true }

    init(contact: Contact? = nil) {
        _contactID = State(initialValue: contact?.id)
        _name = State(initialValue: contact?.name ?? "")
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
                ContactGenerationSection()
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
            if let contactID, contacts.contact(id: contactID)?.role == "owner" {
                ContactEnergySection(contactID: contactID, cache: contacts.energySnapshots.store(for: contactID))
            }
            if let contactID {
                Section {
                    Toggle("Conversation initiative", isOn: Binding(
                        get: { contacts.contact(id: contactID)?.initiativeEnabled != 0 },
                        set: { enabled in
                            guard !contacts.isMutating else { return }
                            Task {
                                do { try await contacts.setInitiative(contactID: contactID, enabled: enabled, using: auth) }
                                catch is CancellationError { }
                                catch { self.error = error.localizedDescription }
                            }
                        }
                    ))
                    .disabled(saving || contacts.isMutating)
                } footer: {
                    Text("Allow thoughtful follow-ups when you have not replied. Stops after a few unanswered messages. Applies only to your private chat.")
                }
                Section {
                    NavigationLink("Connections") { McpAccessView(path: "contacts/\(contactID)/mcp", group: false, cache: contacts.mcpAccessSnapshots.store(for: "contact:\(contactID)")) }
                    NavigationLink("Personality") {
                        ContactPersonalityView(contactID: contactID, cache: contacts.personalitySnapshot(id: contactID),
                                               draft: contacts.personalityDraft(id: contactID))
                    }
                    NavigationLink("Mini apps") { MiniAppListView(base: "contacts/\(contactID)") }
                    NavigationLink("Tasks") { TasksView(base: "contacts/\(contactID)", snapshot: contacts.taskSnapshots.store(for: "contacts/\(contactID)")) }
                }
                ChatMediaSection(scope: .contact(contactID), cache: contacts.mediaSnapshots, documents: contacts.documentCaches)
                Section {
                    NavigationLink(value: HomeDestination.nativeTools(contactID)) {
                        Label { Text("Native experiments") } icon: { NativeGlyph(kind: "default", size: 28, symbol: "iphone") }
                    }
                }
            }
            if !canEdit {
                Text("This is a shared contact. Its creator manages its name, photo, and participants.")
                    .manrope(.footnote).foregroundStyle(.secondary)
            }
            if let error {
                Text(error).manrope(.footnote).foregroundStyle(.red)
            }
            if saving { ProgressView("Saving…") }
        }
        .task(id: contactID) {
            guard let contactID else { return }
            do { try await contacts.refreshContact(id: contactID, using: auth, force: false) }
            catch is CancellationError { }
            catch { self.error = error.localizedDescription }
        }
        .navigationTitle(contactID == nil ? "Add Contact" : (canEdit ? "Edit Contact" : "Contact"))
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(saving)
        .toolbar {
            if canEdit && (contactID != nil || creationMode == "manual") {
                ToolbarItem(placement: .confirmationAction) {
                    Button(contactID == nil ? "Create" : "Save", action: save)
                        .disabled(saving || contacts.isMutating || editingIdentity)
                }
            }
        }
    }

    private func save() {
        guard canEdit, !saving, !contacts.isMutating, !editingIdentity else { return }
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
                dismiss()
            } catch is CancellationError {
                // Navigation/session changes must not report a server error.
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

private struct ContactEnergySection: View {
    let contactID: String
    let cache: NavigationSnapshot<ContactEnergy>
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.scenePhase) private var scenePhase
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Section("Group Energy") {
            if let energy = cache.value {
                LabeledContent("Energy", value: "\(energy.points) / \(energy.capacity)")
                ProgressView(value: Double(energy.points), total: Double(energy.capacity))
                    .tint(energy.points <= 5 ? .orange : .green)
                Text("Each group message uses one point. One point recharges every five minutes, even offline. Private replies do not use energy.")
                    .manrope(.footnote).foregroundStyle(.secondary)
                if let timestamp = energy.nextPointAt {
                    Text("Next point: \(Date(timeIntervalSince1970: timestamp / 1000).formatted(date: .omitted, time: .shortened))")
                        .manrope(.footnote).foregroundStyle(.secondary)
                }
            } else if busy {
                ProgressView("Loading energy…")
            }
            Button("Reset Energy to 50") { Task { await refresh(reset: true) } }
                .disabled(busy || cache.value == nil)
            if let error {
                Text(error).manrope(.footnote).foregroundStyle(.red)
                Button("Retry") { Task { await refresh() } }.disabled(busy)
            }
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await refresh()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(5)) }
                catch { return }
                await refresh()
            }
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
