import Foundation
import UniformTypeIdentifiers
import UIKit
import QuickLook
import SwiftUI

struct ChatAttachment: Codable, Equatable, Sendable {
    let name: String
    let mimeType: String
    let size: Int
    var isImage: Bool { mimeType.hasPrefix("image/") }
}

struct DraftAttachment: Encodable, Equatable, Sendable {
    let id = UUID()
    let name: String
    let mimeType: String
    let data: Data
    enum CodingKeys: String, CodingKey { case name, mimeType, data }
    nonisolated static let limit = 5 * 1024 * 1024
    static let types: [UTType] = [.jpeg, .png, .gif, .webP, .pdf]

    static func load(url: URL) throws -> DraftAttachment {
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        let values = try url.resourceValues(forKeys: [.fileSizeKey, .contentTypeKey, .isRegularFileKey])
        guard values.isRegularFile == true, let size = values.fileSize, size > 0, size <= limit else {
            throw AuthAPI.Failure.rejected("Choose a file up to 5 MB.")
        }
        guard let type = values.contentType, types.contains(where: { type.conforms(to: $0) }),
              let mime = type.preferredMIMEType else {
            throw AuthAPI.Failure.rejected("Choose a JPEG, PNG, GIF, WebP, or PDF.")
        }
        let bytes = try Data(contentsOf: url, options: .mappedIfSafe)
        guard bytes.count <= limit else { throw AuthAPI.Failure.rejected("Choose a file up to 5 MB.") }
        let name = String(url.lastPathComponent.prefix(180))
        return DraftAttachment(name: name, mimeType: mime, data: bytes)
    }
}

struct AttachmentQuickLook: UIViewControllerRepresentable {
    let url: URL
    func makeCoordinator() -> Coordinator { Coordinator(url: url) }
    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        return controller
    }
    func updateUIViewController(_ controller: QLPreviewController, context: Context) {}
    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        let url: URL
        init(url: URL) { self.url = url }
        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> any QLPreviewItem { url as NSURL }
    }
}

struct ChatAttachmentView: View {
    let attachment: ChatAttachment
    let contactID: String
    let turnID: String
    var groupID: String? = nil
    let sentAt: Double
    let caption: String
    var readAt: Double? = nil
    var isSending = false
    var localData: Data? = nil
    var fromUser = true
    var showsReceipt = true
    var senderName: String? = nil
    @Environment(AuthStore.self) private var auth
    @State private var loading = false
    @State private var previewURL: URL?
    @State private var error: String?
    @State private var thumbnail: UIImage?
    @State private var imageAttempt = 0
    @State private var showImage = false
    @State private var documentTask: Task<Void, Never>?

    private var imageResource: CachedImageResource {
        groupID.map { .groupAttachment(groupID: $0, messageID: turnID) } ?? .attachment(contactID: contactID, turnID: turnID)
    }
    private var imageBubbleRadius: CGFloat { caption.isEmpty && senderName == nil ? 20 : 0 }
    private var bubbleColor: Color { fromUser ? Color("OutgoingMessageBackground") : Color(uiColor: .secondarySystemBackground) }
    private var displayedThumbnail: UIImage? {
        thumbnail ?? auth.images.cachedImage(imageResource, maxPixelSize: 520)
    }

    var body: some View {
        HStack {
            if fromUser { Spacer(minLength: 40) }
            VStack(alignment: .trailing, spacing: 6) {
                if attachment.isImage {
                    if caption.isEmpty && senderName == nil {
                        imageButton
                            .messageBubbleShadow()
                    } else {
                        VStack(alignment: .leading, spacing: 0) {
                            if let senderName {
                                MessageSenderNameView(name: senderName)
                                    .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 8)
                            }
                            imageButton
                            if !caption.isEmpty {
                                MessageTextContentView(text: caption, sentAt: sentAt, fromUser: fromUser, readAt: readAt, isSending: isSending, showsReceipt: showsReceipt, fillsWidth: true)
                                    .padding(.horizontal, 16).padding(.vertical, 12)
                            }
                        }
                        .frame(maxWidth: 260)
                        .background(bubbleColor, in: MessageBubbleShape(fromUser: fromUser))
                        .overlay {
                            MessageBubbleShape(fromUser: fromUser).stroke(bubbleColor, lineWidth: 4)
                                .allowsHitTesting(false)
                        }
                        .clipShape(MessageBubbleShape(fromUser: fromUser))
                        .messageBubbleShadow()
                    }
                } else {
                    documentButton
                }
                if let error { Text(error).manrope(.caption).foregroundStyle(.red) }
            }
            if !fromUser { Spacer(minLength: 40) }
        }
        .frame(maxWidth: .infinity, alignment: fromUser ? .trailing : .leading)
        .task(id: "\(auth.user?.id ?? "")/\(turnID)/\(imageAttempt)") {
            guard attachment.isImage, thumbnail == nil else { return }
            loading = true
            error = nil
            defer { loading = false }
            do {
                if let localData {
                    let decoded = await Task.detached(priority: .userInitiated) {
                        PrivateImageCache.decode(localData, maxPixelSize: 520)
                    }.value
                    try Task.checkCancellation()
                    guard let decoded else { throw AuthAPI.Failure.rejected("This image could not be displayed.") }
                    thumbnail = decoded
                } else {
                    thumbnail = try await auth.cachedImage(imageResource, maxPixelSize: 520)
                }
            } catch is CancellationError { }
            catch {
                guard !Task.isCancelled else { return }
                self.error = error.localizedDescription
            }
        }
        .fullScreenCover(isPresented: $showImage) {
            AttachmentImageViewer(attachment: attachment, contactID: contactID, turnID: turnID, groupID: groupID)
        }
        .sheet(isPresented: Binding(get: { previewURL != nil }, set: { if !$0 { clearPreview() } })) {
            if let previewURL { AttachmentQuickLook(url: previewURL).ignoresSafeArea() }
        }
        .onDisappear {
            documentTask?.cancel()
            clearPreview()
        }
    }

    private var imageButton: some View {
        Button {
            if displayedThumbnail != nil { showImage = true }
            else { imageAttempt += 1 }
        } label: {
            Group {
                if let thumbnail = displayedThumbnail {
                    Color.clear
                        .aspectRatio(1, contentMode: .fit)
                        .overlay {
                            Image(uiImage: thumbnail).resizable().scaledToFill()
                        }
                        .clipped()
                        .overlay(alignment: .bottomTrailing) {
                            if caption.isEmpty {
                                MessageMetadataView(sentAt: sentAt, fromUser: fromUser, readAt: readAt, isSending: isSending, showsReceipt: showsReceipt)
                                    .padding(.horizontal, 7).padding(.vertical, 4)
                                    .background(.black.opacity(0.6), in: Capsule())
                                    .environment(\.colorScheme, .dark)
                                    .padding(8)
                            }
                        }
                        // The image has its own rounded corners inside a 2-point bubble-colored rim.
                        .clipShape(UnevenRoundedRectangle(
                            topLeadingRadius: 16,
                            bottomLeadingRadius: caption.isEmpty ? 16 : 2,
                            bottomTrailingRadius: caption.isEmpty ? 16 : 2,
                            topTrailingRadius: 16
                        ))
                        .padding(2)
                        .background(bubbleColor, in: MessageBubbleShape(cornerRadius: imageBubbleRadius, fromUser: fromUser))
                        .clipShape(MessageBubbleShape(cornerRadius: imageBubbleRadius, fromUser: fromUser))
                        .contentShape(MessageBubbleShape(cornerRadius: imageBubbleRadius, fromUser: fromUser))
                        .frame(maxWidth: 260, maxHeight: 260, alignment: .trailing)
                } else {
                    bubbleColor
                        .aspectRatio(1, contentMode: .fit)
                        .overlay {
                            if loading { ProgressView() }
                            else { Label("Retry image", systemImage: "arrow.clockwise").manrope(.footnote) }
                        }
                        .frame(maxWidth: 260, maxHeight: 260)
                        .background(bubbleColor, in: MessageBubbleShape(cornerRadius: imageBubbleRadius, fromUser: fromUser))
                        .clipShape(MessageBubbleShape(cornerRadius: imageBubbleRadius, fromUser: fromUser))
                }
            }
            .contentShape(MessageBubbleShape(cornerRadius: imageBubbleRadius, fromUser: fromUser))
        }
        .buttonStyle(.plain)
        .disabled(loading || isSending)
        .accessibilityLabel(displayedThumbnail == nil ? "Retry loading image" : "Open image full screen: \(attachment.name)")
    }

    private var documentButton: some View {
        Button {
            guard !loading else { return }
            loading = true
            error = nil
            documentTask = Task {
                defer { loading = false }
                do {
                    let bytes = try await auth.withSession { api, token in
                        if let groupID { return try await api.groupAttachment(groupID: groupID, messageID: turnID, token: token) }
                        return try await api.chatAttachment(contactID: contactID, turnID: turnID, token: token)
                    }
                    try Task.checkCancellation()
                    let folder = FileManager.default.temporaryDirectory.appending(path: "chat-preview-\(UUID().uuidString)")
                    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                    let url = folder.appendingPathComponent(attachment.name)
                    try bytes.write(to: url, options: [.atomic, .completeFileProtection])
                    previewURL = url
                } catch is CancellationError { }
                catch {
                    guard !Task.isCancelled else { return }
                    self.error = error.localizedDescription
                }
            }
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                if let senderName { MessageSenderNameView(name: senderName) }
                HStack {
                    if loading { ProgressView() }
                    else { Image(systemName: "doc.richtext") }
                    VStack(alignment: .leading) {
                        Text(attachment.name).lineLimit(2)
                        Text(ByteCountFormatter.string(fromByteCount: Int64(attachment.size), countStyle: .file)).font(.caption)
                    }
                    Image(systemName: isSending ? "clock" : "arrow.down.circle")
                        .accessibilityLabel(isSending ? "Sending" : "Download attachment")
                }.manrope(.footnote)
            }.padding(12)
        }
        .buttonStyle(.plain)
        .background(bubbleColor, in: MessageBubbleShape(cornerRadius: 16, fromUser: fromUser))
        .messageBubbleShadow()
        .disabled(loading || isSending)
    }

    private func clearPreview() {
        if let previewURL { try? FileManager.default.removeItem(at: previewURL.deletingLastPathComponent()) }
        previewURL = nil
    }
}

private struct AttachmentImageViewer: View {
    let attachment: ChatAttachment
    let contactID: String
    let turnID: String
    var groupID: String? = nil
    @Environment(AuthStore.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @State private var image: UIImage?
    @State private var error: String?
    @State private var attempt = 0

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            Group {
                if let image {
                    ZoomableAttachmentImage(image: image, onDismiss: { dismiss() })
                        .accessibilityLabel(attachment.name)
                } else if let error {
                    VStack(spacing: 16) {
                        Text(error).manrope().multilineTextAlignment(.center)
                        Button("Retry") { attempt += 1 }
                    }.padding(32).frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ProgressView("Loading image…").frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            Button { dismiss() } label: {
                Image(systemName: "xmark").font(.system(size: 18, weight: .semibold))
                    .frame(width: 44, height: 44)
                    .background(.ultraThinMaterial, in: Circle())
            }
            .accessibilityLabel("Close image")
            .padding(16)
        }
        .foregroundStyle(.white)
        .preferredColorScheme(.dark)
        .task(id: attempt) {
            error = nil
            do {
                let resource: CachedImageResource = groupID.map { .groupAttachment(groupID: $0, messageID: turnID) } ?? .attachment(contactID: contactID, turnID: turnID)
                image = try await auth.cachedImage(resource, maxPixelSize: 4096)
            } catch is CancellationError { }
            catch {
                guard !Task.isCancelled else { return }
                self.error = error.localizedDescription
            }
        }
    }
}

private struct ZoomableAttachmentImage: UIViewRepresentable {
    let image: UIImage
    let onDismiss: () -> Void

    func makeUIView(context: Context) -> AttachmentImageScrollView {
        AttachmentImageScrollView(image: image, onDismiss: onDismiss)
    }
    func updateUIView(_ view: AttachmentImageScrollView, context: Context) {
        view.onDismiss = onDismiss
    }
}

private final class ImageDismissGestureDelegate: NSObject, UIGestureRecognizerDelegate {
    weak var scrollView: UIScrollView?

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard let scrollView, let pan = gestureRecognizer as? UIPanGestureRecognizer,
              !scrollView.isZooming, scrollView.zoomScale <= scrollView.minimumZoomScale + 0.01 else { return false }
        let velocity = pan.velocity(in: scrollView)
        return velocity.y > 0 && velocity.y > abs(velocity.x) * 1.2
    }
}

private final class AttachmentImageScrollView: UIScrollView, UIScrollViewDelegate {
    private let imageView: UIImageView
    private var viewportSize: CGSize = .zero
    private let dismissGestureDelegate = ImageDismissGestureDelegate()
    var onDismiss: () -> Void

    init(image: UIImage, onDismiss: @escaping () -> Void) {
        self.onDismiss = onDismiss
        imageView = UIImageView(image: image)
        super.init(frame: .zero)
        imageView.contentMode = .scaleAspectFit
        addSubview(imageView)
        delegate = self
        minimumZoomScale = 1
        maximumZoomScale = 4
        showsHorizontalScrollIndicator = false
        showsVerticalScrollIndicator = false
        contentInsetAdjustmentBehavior = .never
        backgroundColor = .black
        let doubleTap = UITapGestureRecognizer(target: self, action: #selector(toggleZoom(_:)))
        doubleTap.numberOfTapsRequired = 2
        addGestureRecognizer(doubleTap)
        let dismissPan = UIPanGestureRecognizer(target: self, action: #selector(handleDismissPan(_:)))
        dismissPan.maximumNumberOfTouches = 1
        dismissGestureDelegate.scrollView = self
        dismissPan.delegate = dismissGestureDelegate
        addGestureRecognizer(dismissPan)
        // Once zoomed, this recognizer fails immediately and native panning takes over.
        panGestureRecognizer.require(toFail: dismissPan)
    }
    required init?(coder: NSCoder) { nil }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds.size != viewportSize else { return }
        viewportSize = bounds.size
        setZoomScale(1, animated: false)
        imageView.frame = CGRect(origin: .zero, size: viewportSize)
        contentSize = viewportSize
    }
    func viewForZooming(in scrollView: UIScrollView) -> UIView? { imageView }

    @objc private func handleDismissPan(_ gesture: UIPanGestureRecognizer) {
        let translation = gesture.translation(in: self)
        switch gesture.state {
        case .changed:
            imageView.transform = CGAffineTransform(translationX: translation.x * 0.15,
                                                    y: max(0, translation.y))
        case .ended:
            let velocity = gesture.velocity(in: self)
            if translation.y > 120 || (translation.y > 40 && velocity.y > 900) {
                onDismiss()
            } else {
                restoreImagePosition()
            }
        case .cancelled, .failed:
            restoreImagePosition()
        default:
            break
        }
    }

    private func restoreImagePosition() {
        guard !isZooming, zoomScale <= minimumZoomScale + 0.01 else { return }
        UIView.animate(withDuration: UIAccessibility.isReduceMotionEnabled ? 0 : 0.2,
                       delay: 0, options: [.beginFromCurrentState, .curveEaseOut]) {
            self.imageView.transform = .identity
        }
    }

    @objc private func toggleZoom(_ gesture: UITapGestureRecognizer) {
        if zoomScale > 1 { setZoomScale(1, animated: true) }
        else {
            let point = gesture.location(in: imageView)
            let size = CGSize(width: bounds.width / 2.5, height: bounds.height / 2.5)
            zoom(to: CGRect(x: point.x - size.width / 2, y: point.y - size.height / 2,
                            width: size.width, height: size.height), animated: true)
        }
    }
}
