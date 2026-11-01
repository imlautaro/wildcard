import ImageIO
import Observation
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// Prepares a chosen photo for `POST /stickers/cutout`: at most 1536 px on the long edge with the EXIF
/// orientation applied, transparency flattened on white, JPEG at ~0.9 quality and under 5 MB.
enum StickerSourceImage {
    nonisolated static let maxEdge = 1536
    nonisolated static let maxBytes = 5 * 1024 * 1024

    nonisolated static func jpeg(from data: Data) -> Data? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int, width > 0, height > 0,
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: min(maxEdge, max(width, height)),
                kCGImageSourceShouldCacheImmediately: true,
              ] as CFDictionary),
              let context = CGContext(data: nil, width: image.width, height: image.height, bitsPerComponent: 8, bytesPerRow: 0,
                                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
        else { return nil }
        let rect = CGRect(x: 0, y: 0, width: image.width, height: image.height)
        context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        context.fill(rect)
        context.draw(image, in: rect)
        guard let flat = context.makeImage() else { return nil }
        for quality in [0.9, 0.75, 0.6] {
            let output = NSMutableData()
            guard let destination = CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
            CGImageDestinationAddImage(destination, flat, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
            guard CGImageDestinationFinalize(destination) else { return nil }
            if output.length <= maxBytes { return output as Data }
        }
        return nil
    }
}

/// State of one create-sticker session. Source photo and cutout live in memory only and are released when the
/// session ends. Every async step checks `generation`, so a response that arrives after the person chose another
/// photo, went back or closed the sheet is dropped.
@MainActor @Observable
final class StickerCreateModel {
    enum Phase: Equatable { case choosing, preparing, cuttingOut, preview, saving }
    private(set) var phase = Phase.choosing
    private(set) var cutout: UIImage?
    private(set) var error: String?
    private(set) var noSubject = false
    /// Seconds the server asked to wait (HTTP 429); actions stay disabled meanwhile.
    private(set) var cooldown = 0
    var subject = ""
    var emoji: String?
    private var source: Data?
    private var png: Data?
    private var generation = 0
    private var task: Task<Void, Never>?
    private var cooldownTask: Task<Void, Never>?

    var trimmedSubject: String { subject.trimmingCharacters(in: .whitespacesAndNewlines) }
    /// Same rule as the server: 2–40 letters, digits, spaces or hyphens.
    var subjectIsValid: Bool {
        (2...40).contains(trimmedSubject.count) && trimmedSubject.allSatisfy { $0.isLetter || $0.isNumber || $0 == " " || $0 == "-" }
    }
    var canRetry: Bool { source != nil && cooldown == 0 && (phase == .choosing || phase == .preview) }
    var isBusy: Bool { phase == .preparing || phase == .cuttingOut || phase == .saving }

    /// Ends the session and drops every in-flight result and in-memory image.
    func reset() {
        generation += 1
        task?.cancel(); task = nil
        cooldownTask?.cancel(); cooldownTask = nil
        source = nil; png = nil; cutout = nil
        phase = .choosing
        error = nil; noSubject = false; cooldown = 0
        subject = ""; emoji = nil
    }

    func choose(_ item: PhotosPickerItem, using auth: AuthStore) {
        reset()
        let mine = generation
        phase = .preparing
        task = Task {
            do {
                guard let data = try await item.loadTransferable(type: Data.self), !data.isEmpty else {
                    throw AuthAPI.Failure.rejected("This photo could not be loaded. Choose another one.")
                }
                try Task.checkCancellation()
                let jpeg = await Task.detached(priority: .userInitiated) { StickerSourceImage.jpeg(from: data) }.value
                try Task.checkCancellation()
                guard mine == generation else { return }
                guard let jpeg else { throw AuthAPI.Failure.rejected("This photo could not be prepared. Choose another one.") }
                source = jpeg
                await runCutout(subject: nil, generation: mine, using: auth)
            } catch is CancellationError { }
            catch {
                guard mine == generation else { return }
                phase = .choosing
                self.error = error.localizedDescription
            }
        }
    }

    /// Cuts out again from the same photo, optionally naming the subject.
    func retry(using auth: AuthStore) {
        guard canRetry, source != nil else { return }
        let named = noSubject && subjectIsValid ? trimmedSubject : nil
        task?.cancel()
        let mine = generation
        task = Task { await runCutout(subject: named, generation: mine, using: auth) }
    }

    private func runCutout(subject named: String?, generation mine: Int, using auth: AuthStore) async {
        guard mine == generation, let source else { return }
        phase = .cuttingOut
        error = nil
        let accountID = auth.user?.id
        do {
            let bytes = try await auth.withSession { api, token in try await api.stickerCutout(jpeg: source, subject: named, token: token) }
            try Task.checkCancellation()
            let image = await Task.detached(priority: .userInitiated) { PrivateImageCache.decode(bytes, maxPixelSize: 1024) }.value
            try Task.checkCancellation()
            guard mine == generation, auth.user?.id == accountID else { return }
            guard let image else { throw AuthAPI.Failure.rejected("The cutout could not be displayed. Please try again.") }
            png = bytes
            cutout = image
            noSubject = false
            phase = .preview
        } catch is CancellationError { }
        catch {
            guard mine == generation else { return }
            cutout = nil; png = nil
            if case AuthAPI.Failure.noSubject = error { noSubject = true } else { noSubject = false }
            if case AuthAPI.Failure.rateLimited(let seconds, _) = error { startCooldown(seconds ?? 60) }
            self.error = error.localizedDescription
            phase = .choosing
        }
    }

    private func startCooldown(_ seconds: Int) {
        cooldownTask?.cancel()
        cooldown = min(max(seconds, 1), 300)
        let mine = generation
        cooldownTask = Task {
            while !Task.isCancelled, mine == generation, cooldown > 0 {
                do { try await Task.sleep(for: .seconds(1)) } catch { return }
                if mine == generation { cooldown -= 1 }
            }
        }
    }

    /// Saves the previewed cutout with the chosen emoji. Returns true when the sticker was created.
    func save(using auth: AuthStore, store: StickerStore) async -> Bool {
        guard phase == .preview, let png, let emoji = StickerEmoji.validated(emoji ?? ""), cooldown == 0 else { return false }
        let mine = generation
        phase = .saving
        error = nil
        do {
            _ = try await store.create(emoji: emoji, png: png, using: auth)
            guard mine == generation else { return true }
            reset()
            return true
        } catch is CancellationError {
            if mine == generation { phase = .preview }
            return false
        } catch {
            guard mine == generation else { return false }
            if case AuthAPI.Failure.rateLimited(let seconds, _) = error { startCooldown(seconds ?? 60) }
            self.error = error.localizedDescription
            phase = .preview
            return false
        }
    }

    func discardCutout() {
        guard !isBusy else { return }
        png = nil; cutout = nil; emoji = nil; error = nil; noSubject = false
        phase = .choosing
    }
}

struct CheckerboardView: View {
    var size: CGFloat = 12
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Canvas { context, canvas in
            let light = colorScheme == .dark ? Color(white: 0.28) : Color(white: 0.92)
            let dark = colorScheme == .dark ? Color(white: 0.2) : Color(white: 0.82)
            context.fill(Path(CGRect(origin: .zero, size: canvas)), with: .color(light))
            var row = 0
            var y: CGFloat = 0
            while y < canvas.height {
                var column = 0
                var x: CGFloat = 0
                while x < canvas.width {
                    if (row + column) % 2 == 1 { context.fill(Path(CGRect(x: x, y: y, width: size, height: size)), with: .color(dark)) }
                    x += size; column += 1
                }
                y += size; row += 1
            }
        }
        .accessibilityHidden(true)
    }
}

/// Create-sticker flow: choose a photo, preview the cutout on a checkerboard, choose an emoji, save.
/// Pushed inside the picker's navigation stack; `onSaved` runs after a successful save.
struct StickerCreateView: View {
    let store: StickerStore
    let onSaved: () -> Void
    @Environment(AuthStore.self) private var auth
    @State private var model = StickerCreateModel()
    @State private var item: PhotosPickerItem?

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                stage
                if model.noSubject { subjectField }
                if let error = model.error {
                    Text(error).manrope(.footnote).foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                switch model.phase {
                case .choosing, .preparing, .cuttingOut:
                    choose
                case .preview, .saving:
                    emojiSection
                }
            }
            .padding()
        }
        .navigationTitle("Create sticker")
        .navigationBarTitleDisplayMode(.inline)
        .scrollDismissesKeyboard(.interactively)
        .onChange(of: item) { _, selected in
            guard let selected else { return }
            model.choose(selected, using: auth)
            item = nil
        }
        // Leaving the screen ends the session: late responses are dropped and the photo is released.
        .onDisappear { model.reset() }
    }

    @ViewBuilder private var stage: some View {
        ZStack {
            CheckerboardView()
            if let cutout = model.cutout {
                Image(uiImage: cutout).resizable().scaledToFit().padding(12)
                    .accessibilityLabel("Sticker preview")
            } else if model.phase == .preparing || model.phase == .cuttingOut {
                VStack(spacing: 10) {
                    ProgressView()
                    Text(model.phase == .preparing ? "Preparing photo…" : "Cutting out the subject…").manrope(.footnote)
                }
                .padding(16)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "scissors").font(.title)
                    Text("Choose a photo to cut out").manrope(.footnote)
                }
                .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: 320)
        .aspectRatio(1, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .frame(maxWidth: .infinity)
    }

    private var subjectField: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("What should be cut out? (optional)", text: Bindable(model).subject)
                .manrope()
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
            Text("Name it with 2–40 letters, for example “dog” or “red car”.").manrope(.caption).foregroundStyle(.secondary)
        }
    }

    private var choose: some View {
        VStack(spacing: 10) {
            if model.noSubject {
                Button("Try again", systemImage: "arrow.clockwise") { model.retry(using: auth) }
                    .buttonStyle(.borderedProminent)
                    .disabled(!model.canRetry || (!model.trimmedSubject.isEmpty && !model.subjectIsValid))
            } else if model.canRetry, model.error != nil {
                Button("Try again", systemImage: "arrow.clockwise") { model.retry(using: auth) }
                    .buttonStyle(.borderedProminent)
            }
            if model.noSubject || model.error != nil {
                photoButton.buttonStyle(.bordered)
            } else {
                photoButton.buttonStyle(.borderedProminent)
            }
            if model.cooldown > 0 {
                Text("You can try again in \(model.cooldown) s.").manrope(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private var photoButton: some View {
        let title = model.canRetry || model.noSubject ? "Choose another photo" : "Choose photo"
        return PhotosPicker(selection: $item, matching: .images, preferredItemEncoding: .compatible) {
            Label(title, systemImage: "photo.on.rectangle")
                .frame(maxWidth: .infinity)
        }
        .disabled(model.isBusy)
    }

    private var emojiSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Pick an emoji").manrope(.headline, weight: .semibold)
            Text("The emoji says when to use the sticker.").manrope(.footnote).foregroundStyle(.secondary)
            StickerEmojiChooser(selection: Bindable(model).emoji)
            HStack(spacing: 12) {
                PhotosPicker(selection: $item, matching: .images, preferredItemEncoding: .compatible) {
                    Label("Other photo", systemImage: "photo.on.rectangle").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(model.isBusy)
                Button {
                    Task {
                        if await model.save(using: auth, store: store) { onSaved() }
                    }
                } label: {
                    HStack {
                        if model.phase == .saving { ProgressView() }
                        Text("Save").frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(model.phase != .preview || StickerEmoji.validated(model.emoji ?? "") == nil || model.cooldown > 0)
            }
            if model.cooldown > 0 {
                Text("You can save again in \(model.cooldown) s.").manrope(.caption).foregroundStyle(.secondary)
            }
        }
    }
}
