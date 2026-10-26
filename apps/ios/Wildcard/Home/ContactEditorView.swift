import SwiftUI

struct ContactEditorView: View {
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @Environment(\.dismiss) private var dismiss
    @FocusState private var editingName: Bool
    @State private var name: String
    @State private var error: String?
    @State private var saving = false
    private let contactID: String?

    init(contact: Contact? = nil) {
        contactID = contact?.id
        _name = State(initialValue: contact?.name ?? "")
    }

    var body: some View {
        Form {
            TextField("Name", text: $name)
                .textContentType(.name)
                .textInputAutocapitalization(.words)
                .focused($editingName)
                .submitLabel(.done)
                .onSubmit(save)
                .disabled(saving || contacts.isMutating)
            if let error {
                Text(error).manrope(.footnote).foregroundStyle(.red)
            }
            if saving { ProgressView("Saving…") }
        }
        .navigationTitle(contactID == nil ? "Add Contact" : "Edit Contact")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(saving)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(contactID == nil ? "Create" : "Save", action: save)
                    .disabled(saving || contacts.isMutating)
            }
        }
        .task { editingName = true }
    }

    private func save() {
        guard !saving, !contacts.isMutating else { return }
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
                try await contacts.save(name: trimmed, contactID: contactID, using: auth)
                dismiss()
            } catch is CancellationError {
                // Navigation/session changes must not report a server error.
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
