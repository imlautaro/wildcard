import SwiftUI
import UIKit

struct ContactAvatar: View {
    let contact: Contact?
    var size: CGFloat = 44
    @Environment(AuthStore.self) private var auth
    @State private var image: UIImage?
    @State private var loadedVersion: String?

    private var resource: CachedImageResource? {
        guard let contact, let version = contact.photoVersion else { return nil }
        return .contactAvatar(contactID: contact.id, version: version)
    }

    private var displayedImage: UIImage? {
        if loadedVersion == contact?.photoVersion, let image { return image }
        return resource.flatMap { auth.images.cachedImage($0, maxPixelSize: 288) }
    }

    var body: some View {
        Group {
            if let image = displayedImage {
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
            guard let resource else { return }
            let version = contact?.photoVersion
            do {
                image = try await auth.cachedImage(resource, maxPixelSize: 288)
                try Task.checkCancellation()
                loadedVersion = version
            } catch { /* Keep the placeholder when a photo is unavailable. */ }
        }
    }
}
