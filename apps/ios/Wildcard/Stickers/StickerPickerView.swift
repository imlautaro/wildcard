import SwiftUI

/// The sticker sheet opened by the composer's sticker button. `contact` is set in private chats only and adds a
/// tab with that contact's stickers. Lists come from the session-owned `StickerStore`: a reopened sheet
/// draws its cached stickers (also an empty library) at once and revalidates in the background.
struct StickerPickerView: View {
    struct ContactTab { let id: String; let name: String }
    let contact: ContactTab?
    /// False while the chat cannot send (a send is in flight, the chat is unavailable).
    let canSend: Bool
    let onSelect: (Sticker) -> Void
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.dismiss) private var dismiss
    @State private var tab = Tab.mine
    @State private var path: [Route] = []
    @State private var libraryError: String?
    @State private var contactError: String?
    @State private var actionError: String?
    @State private var editing: Sticker?
    @State private var deleting: Sticker?
    @State private var loadingLibrary = false
    @State private var loadingContact = false

    private enum Tab: Hashable { case mine, contact }
    private enum Route: Hashable { case create }
    private var store: StickerStore { contacts.stickers }
    private let columns = [GridItem(.adaptive(minimum: 84), spacing: 10)]

    var body: some View {
        NavigationStack(path: $path) {
            VStack(spacing: 0) {
                if let contact {
                    Picker("Stickers", selection: $tab) {
                        Text("My stickers").tag(Tab.mine)
                        Text(contact.name).tag(Tab.contact)
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal).padding(.bottom, 8)
                }
                if let actionError {
                    Text(actionError).manrope(.footnote).foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal).padding(.bottom, 6)
                }
                if tab == .mine || contact == nil { mine } else if let contact { contactTab(contact) }
            }
            .navigationTitle("Stickers")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
            .navigationDestination(for: Route.self) { _ in
                StickerCreateView(store: store) { path.removeAll() }
            }
        }
        .sheet(item: $editing) { sticker in
            StickerEmojiEditor(sticker: sticker, store: store)
        }
        .confirmationDialog("Delete this sticker?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                            titleVisibility: .visible, presenting: deleting) { sticker in
            Button("Delete", role: .destructive) { delete(sticker) }
        } message: { _ in
            Text("Messages you already sent keep their sticker.")
        }
        .task { await loadLibrary() }
        .task(id: tab) { if tab == .contact { await loadContact() } }
        .refreshable { if tab == .contact { await loadContact() } else { await loadLibrary() } }
    }

    // MARK: My stickers

    @ViewBuilder private var mine: some View {
        if let library = store.library.value {
            ScrollView {
                LazyVGrid(columns: columns, spacing: 10) {
                    createTile(library)
                    ForEach(library.stickers) { sticker in
                        Button {
                            guard canSend else { return }
                            onSelect(sticker)
                        } label: {
                            StickerImageView(resource: sticker.imageResource)
                                .aspectRatio(1, contentMode: .fit)
                                .padding(6)
                                .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 14))
                        }
                        .buttonStyle(.plain)
                        .disabled(!canSend || store.busy.contains(sticker.id))
                        .opacity(store.busy.contains(sticker.id) ? 0.4 : 1)
                        .accessibilityLabel("Send sticker \(sticker.emoji)")
                        .contextMenu {
                            Button("Change emoji", systemImage: "face.smiling") { editing = sticker }
                            Button("Delete", systemImage: "trash", role: .destructive) { deleting = sticker }
                        }
                    }
                }
                .padding(.horizontal).padding(.bottom, 16)
                if library.stickers.isEmpty {
                    Text("No stickers yet. Create one from a photo.").manrope(.footnote).foregroundStyle(.secondary)
                        .multilineTextAlignment(.center).padding(.top, 8)
                }
            }
        } else if let libraryError {
            ContentUnavailableView {
                Label("Stickers unavailable", systemImage: "exclamationmark.triangle")
            } description: {
                Text(libraryError)
            } actions: {
                Button("Retry") { Task { await loadLibrary() } }
            }
        } else {
            ProgressView("Loading stickers…").frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func createTile(_ library: StickerLibrary) -> some View {
        Button { path.append(.create) } label: {
            VStack(spacing: 6) {
                Image(systemName: library.isFull ? "tray.full" : "plus").font(.title2.weight(.semibold))
                Text(library.isFull ? "Library full" : "Create sticker").manrope(.caption, weight: .semibold).multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .aspectRatio(1, contentMode: .fit)
            .background(Color.accentColor.opacity(0.14), in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        .disabled(library.isFull)
        .accessibilityHint(library.isFull ? "Delete a sticker first. The library holds up to \(library.limit)." : "")
    }

    private func loadLibrary() async {
        guard !loadingLibrary else { return }
        loadingLibrary = true
        defer { loadingLibrary = false }
        do { try await store.loadLibrary(using: auth); libraryError = nil }
        catch is CancellationError { }
        catch { libraryError = error.localizedDescription }
    }

    private func delete(_ sticker: Sticker) {
        actionError = nil
        Task {
            do { try await store.delete(sticker, using: auth) }
            catch is CancellationError { }
            catch { actionError = error.localizedDescription }
        }
    }

    // MARK: Contact stickers

    @ViewBuilder private func contactTab(_ contact: ContactTab) -> some View {
        let snapshot = store.contactLibraries.store(for: contact.id)
        if let stickers = snapshot.value {
            ScrollView {
                if stickers.isEmpty {
                    ContentUnavailableView {
                        Label("No stickers yet", systemImage: "face.smiling")
                    } description: {
                        Text("\(contact.name) has no stickers to share with you yet.")
                    }
                } else {
                    LazyVGrid(columns: columns, spacing: 10) {
                        ForEach(stickers) { sticker in contactTile(sticker, contact: contact) }
                    }
                    .padding(.horizontal).padding(.bottom, 16)
                }
            }
        } else if let contactError {
            ContentUnavailableView {
                Label("Stickers unavailable", systemImage: "exclamationmark.triangle")
            } description: {
                Text(contactError)
            } actions: {
                Button("Retry") { Task { await loadContact() } }
            }
        } else {
            ProgressView("Loading stickers…").frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func contactTile(_ sticker: Sticker, contact: ContactTab) -> some View {
        let saved = store.isSaved(sticker)
        let saving = store.busy.contains("contact/\(sticker.id)")
        return Button {
            guard !saved, !saving else { return }
            actionError = nil
            Task {
                do { try await store.save(sticker, contactID: contact.id, using: auth) }
                catch is CancellationError { }
                catch { actionError = error.localizedDescription }
            }
        } label: {
            StickerImageView(resource: .contactSticker(contactID: contact.id, stickerID: sticker.id, digest: sticker.digest))
                .aspectRatio(1, contentMode: .fit)
                .padding(6)
                .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 14))
                .overlay(alignment: .bottomTrailing) {
                    Group {
                        if saving { ProgressView().controlSize(.small) }
                        else if saved { Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.accentColor) }
                        else { Image(systemName: "plus.circle.fill").foregroundStyle(.secondary) }
                    }
                    .padding(6)
                    .background(.regularMaterial, in: Circle())
                    .padding(4)
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(saved ? "\(sticker.emoji) sticker, saved to my stickers" : "Save \(sticker.emoji) sticker to my stickers")
    }

    private func loadContact() async {
        guard let contact, !loadingContact else { return }
        loadingContact = true
        defer { loadingContact = false }
        do { try await store.loadContact(contact.id, using: auth); contactError = nil }
        catch is CancellationError { }
        catch AuthAPI.Failure.notFound { store.forget(contactID: contact.id); contactError = String(localized: "This contact is no longer available.") }
        catch { contactError = error.localizedDescription }
    }
}

/// Change the emoji of one library sticker.
private struct StickerEmojiEditor: View {
    let sticker: Sticker
    let store: StickerStore
    @Environment(AuthStore.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @State private var emoji: String?
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    StickerImageView(resource: sticker.imageResource, maxPixelSize: 300, maxSide: 120)
                    StickerEmojiChooser(selection: $emoji)
                    if let error { Text(error).manrope(.footnote).foregroundStyle(.red) }
                }
                .padding()
            }
            .navigationTitle("Change emoji")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(saving) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(saving || emoji == nil || emoji == sticker.emoji)
                }
            }
            .onAppear { if emoji == nil { emoji = sticker.emoji } }
        }
        .presentationDetents([.medium, .large])
        .interactiveDismissDisabled(saving)
    }

    private func save() {
        guard let emoji = StickerEmoji.validated(emoji ?? "") else { return }
        saving = true
        error = nil
        Task {
            defer { saving = false }
            do { try await store.changeEmoji(sticker, to: emoji, using: auth); dismiss() }
            catch is CancellationError { }
            catch { self.error = error.localizedDescription }
        }
    }
}
