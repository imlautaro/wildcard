import SwiftUI
import UIKit

struct GroupPhotoAvatar: View {
    let group: ChatGroup?
    var size: CGFloat = 44
    @Environment(AuthStore.self) private var auth
    @State private var image: UIImage?
    @State private var loadedVersion: String?

    private var resource: CachedImageResource? {
        guard let group, let version = group.photoVersion else { return nil }
        return .groupAvatar(groupID: group.id, version: version)
    }
    private var displayedImage: UIImage? {
        if loadedVersion == group?.photoVersion, let image { return image }
        return resource.flatMap { auth.images.cachedImage($0, maxPixelSize: 288) }
    }
    var body: some View {
        Group {
            if let image = displayedImage { Image(uiImage: image).resizable().scaledToFill() }
            else {
                Image(systemName: "person.3.fill")
                    .font(.system(size: size * 0.45)).foregroundStyle(.secondary)
                    .frame(width: size, height: size)
                    .background(Color(uiColor: .secondarySystemBackground), in: Circle())
            }
        }
        .frame(width: size, height: size).clipShape(Circle()).accessibilityHidden(true)
        .task(id: resource?.key) {
            image = nil
            loadedVersion = nil
            guard let resource else { return }
            let version = group?.photoVersion
            do {
                image = try await auth.cachedImage(resource, maxPixelSize: 288)
                try Task.checkCancellation()
                loadedVersion = version
            } catch { }
        }
    }
}
