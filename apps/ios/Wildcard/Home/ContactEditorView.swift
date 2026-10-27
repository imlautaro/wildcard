import SwiftUI
import PhotosUI

struct ContactEditorView: View {
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.dismiss) private var dismiss
    @FocusState private var editingName: Bool
    @State private var name: String
    @State private var error: String?
    @State private var saving = false
    @State private var contactID: String?
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var cropSource: PhotoCropSource?
    @State private var photoData: Data?
    @State private var photoChanged = false
    @State private var loadingPhoto = false
    private var canEdit: Bool { contactID.flatMap { contacts.contact(id: $0) }?.canManage ?? true }

    init(contact: Contact? = nil) {
        _contactID = State(initialValue: contact?.id)
        _name = State(initialValue: contact?.name ?? "")
    }

    var body: some View {
        Form {
            Section {
                HStack {
                    Spacer()
                    if let photoData, let image = UIImage(data: photoData) {
                        Image(uiImage: image).resizable().scaledToFill()
                            .frame(width: 96, height: 96).clipShape(Circle())
                            .accessibilityLabel("Selected contact photo")
                    } else {
                        ContactAvatar(contact: photoChanged ? nil : contactID.flatMap { contacts.contact(id: $0) }, size: 96)
                    }
                    Spacer()
                }
                .listRowBackground(Color.clear)
                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                    Label("Choose Photo", systemImage: "photo")
                }
                .disabled(saving || loadingPhoto)
                if photoData != nil || (!photoChanged && contactID.flatMap { contacts.contact(id: $0)?.photoVersion } != nil) {
                    Button("Remove Photo", role: .destructive) {
                        photoData = nil
                        photoChanged = true
                    }.disabled(saving || loadingPhoto)
                }
                if loadingPhoto { ProgressView("Loading photo…") }
            }
            .disabled(contacts.isMutating || !canEdit)

            TextField("Name", text: $name)
                .textContentType(.name)
                .textInputAutocapitalization(.words)
                .focused($editingName)
                .submitLabel(.done)
                .onSubmit(save)
                .disabled(saving || contacts.isMutating || loadingPhoto || !canEdit)
            if !canEdit {
                Text("This is a shared contact. Its creator manages its name, photo, and participants.")
                    .manrope(.footnote).foregroundStyle(.secondary)
            }
            if let error {
                Text(error).manrope(.footnote).foregroundStyle(.red)
            }
            if saving { ProgressView("Saving…") }
        }
        .navigationTitle(contactID == nil ? "Add Contact" : (canEdit ? "Edit Contact" : "Contact"))
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(saving)
        .toolbar {
            if canEdit {
                ToolbarItem(placement: .confirmationAction) {
                    Button(contactID == nil ? "Create" : "Save", action: save)
                        .disabled(saving || contacts.isMutating || loadingPhoto)
                }
            }
        }
        .task { editingName = contactID == nil }
        .onChange(of: selectedPhoto) { _, item in
            guard let item else { return }
            loadingPhoto = true
            error = nil
            Task {
                defer { loadingPhoto = false; selectedPhoto = nil }
                do {
                    guard let data = try await item.loadTransferable(type: Data.self) else { throw AuthAPI.Failure.invalidResponse }
                    let image = await Task.detached(priority: .userInitiated) { PhotoCropSource.decode(data) }.value
                    guard let image else { throw AuthAPI.Failure.rejected("This image could not be opened. Please choose another photo.") }
                    cropSource = PhotoCropSource(image: image)
                } catch { self.error = error.localizedDescription }
            }
        }
        .sheet(item: $cropSource) { source in
            PhotoCropView(source: source) { data in
                photoData = data
                photoChanged = true
            }
        }
    }

    private func save() {
        guard canEdit, !saving, !contacts.isMutating, !loadingPhoto else { return }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.unicodeScalars.count <= 100,
              !trimmed.unicodeScalars.contains(where: { $0.value < 0x20 || (0x7f...0x9f).contains($0.value) }) else {
            error = "Use a name with 1–100 characters and no control characters."
            editingName = true
            return
        }
        saving = true
        error = nil
        editingName = false
        Task {
            defer { saving = false }
            do {
                let saved = try await contacts.save(name: trimmed, contactID: contactID, using: auth)
                contactID = saved.id
                if photoChanged {
                    do { try await contacts.savePhoto(contactID: saved.id, data: photoData, using: auth) }
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
