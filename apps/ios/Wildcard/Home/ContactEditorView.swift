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
    private var canEdit: Bool { contactID.flatMap { contacts.contact(id: $0) }?.canManage ?? true }

    init(contact: Contact? = nil) {
        _contactID = State(initialValue: contact?.id)
        _name = State(initialValue: contact?.name ?? "")
    }

    var body: some View {
        Form {
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
