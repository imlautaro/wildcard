import SwiftUI

struct AccountAvatar: View {
    let user: AuthUser?
    var size: CGFloat = 44
    @Environment(AuthStore.self) private var auth
    @State private var image: UIImage?
    @State private var loadedVersion: String?

    var body: some View {
        Group {
            if let image, loadedVersion == user?.photoVersion {
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
            guard let version = user?.photoVersion else { return }
            do {
                let data = try await auth.withSession { api, token in
                    try await api.profilePhoto(version: version, token: token)
                }
                try Task.checkCancellation()
                image = UIImage(data: data)
                loadedVersion = version
            } catch { /* Keep the placeholder when the photo is unavailable. */ }
        }
    }
}
