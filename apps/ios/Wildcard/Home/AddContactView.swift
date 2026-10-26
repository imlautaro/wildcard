import SwiftUI

struct AddContactView: View {
    @State private var name = ""

    var body: some View {
        Form {
            TextField("Name", text: $name)
                .textContentType(.name)
                .textInputAutocapitalization(.words)
                .submitLabel(.done)
        }
        .navigationTitle("Add Contact")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                // Contact creation will be connected in a future feature.
                Button("Create") {}
                    .disabled(true)
            }
        }
    }
}
