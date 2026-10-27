import SwiftUI

struct AccountAvatar: View {
    let user: AuthUser?
    var size: CGFloat = 44
    @Environment(AuthStore.self) private var auth
    @State private var image: UIImage?
    @State private var loadedVersion: String?

    private var resource: CachedImageResource? {
        guard let version = user?.photoVersion else { return nil }
        return .accountAvatar(version: version)
    }

    private var displayedImage: UIImage? {
        if loadedVersion == user?.photoVersion, let image { return image }
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
        .frame(width: size, height: size).clipShape(Circle())
        .accessibilityLabel("Your profile photo")
        .task(id: "\(user?.id ?? "")/\(user?.photoVersion ?? "")") {
            image = nil
            loadedVersion = nil
            guard let resource else { return }
            let version = user?.photoVersion
            do {
                image = try await auth.cachedImage(resource, maxPixelSize: 288)
                try Task.checkCancellation()
                loadedVersion = version
            } catch { /* Keep the placeholder when the photo is unavailable. */ }
        }
    }
}
