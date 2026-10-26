import SwiftUI
import UIKit

struct ContactAvatar: View {
    let contact: Contact?
    var size: CGFloat = 44
    @Environment(AuthStore.self) private var auth
    @Environment(ContactsStore.self) private var contacts
    @State private var image: UIImage?
    @State private var loadedVersion: String?

    var body: some View {
        Group {
            if let image, loadedVersion == contact?.photoVersion {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Image(systemName: "person.crop.circle.fill")
                    .resizable().scaledToFit().foregroundStyle(.secondary)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityHidden(true)
        .task(id: "\(contact?.id ?? "")/\(contact?.photoVersion ?? "")") {
            image = nil
            loadedVersion = nil
            guard let contact, let version = contact.photoVersion else { return }
            do {
                let data = try await contacts.photo(for: contact, using: auth)
                try Task.checkCancellation()
                image = UIImage(data: data)
                loadedVersion = version
            } catch { /* Keep the placeholder when a photo is unavailable. */ }
        }
    }
}
