import SwiftUI

/// A sticker picture loaded through the shared account-scoped `PrivateImageCache`; no view-local download.
/// Reopened views draw synchronously from the decoded cache.
struct StickerImageView: View {
    let resource: CachedImageResource
    var maxPixelSize = 300
    /// When set, the loaded picture is aspect-fit inside this square and the placeholder fills it.
    var maxSide: CGFloat? = nil
    @Environment(AuthStore.self) private var auth
    @State private var image: UIImage?
    @State private var failed = false
    @State private var attempt = 0

    private var shown: UIImage? { image ?? auth.images.cachedImage(resource, maxPixelSize: maxPixelSize) }

    var body: some View {
        ZStack {
            if let shown {
                Image(uiImage: shown).resizable().scaledToFit()
                    .frame(maxWidth: maxSide, maxHeight: maxSide)
            } else if failed {
                Button { attempt += 1 } label: {
                    Image(systemName: "arrow.clockwise").padding(12)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Retry loading sticker")
            } else {
                ProgressView()
            }
        }
        // Fill the cell while loading (the picker sizes tiles with an aspect ratio); fixed square for messages.
        .frame(maxWidth: maxSide == nil ? .infinity : nil, maxHeight: maxSide == nil ? .infinity : nil)
        .frame(width: shown == nil ? maxSide : nil, height: shown == nil ? maxSide : nil)
        // The previous picture stays while the resource changes (an optimistic bubble becoming the stored message
        // shows the same bytes), so the swap draws no spinner frame.
        .task(id: "\(auth.user?.id ?? "")/\(resource.key)/\(attempt)") {
            guard auth.images.cachedImage(resource, maxPixelSize: maxPixelSize) == nil else { return }
            failed = false
            do { image = try await auth.cachedImage(resource, maxPixelSize: maxPixelSize) }
            catch is CancellationError { }
            catch { if !Task.isCancelled { failed = true } }
        }
    }
}

/// A sticker message: the bare transparent picture with no bubble, rim or tail. The time and receipt sit
/// below it; a quoted message shows in a small bubble above. Quotes, replies, reactions and the message
/// menu wrap this view at the call site like any other message. The picture does not open the photo viewer.
struct StickerMessageView: View {
    let attachment: ChatAttachment
    /// The message attachment's cache resource (the same keys other attachments use).
    let resource: CachedImageResource
    /// Passed only while the message is outgoing: the library sticker the picker already loaded. It is preferred
    /// over `resource` for as long as the caller supplies it, like `localData` for photos.
    var localResource: CachedImageResource? = nil
    let sentAt: Double
    var fromUser = true
    var receiptState: String? = nil
    var readAt: Double? = nil
    var isSending = false
    var showsReceipt = true
    var senderName: String? = nil
    var senderColor: Color? = nil
    var replyQuote: MessageReplyPreview? = nil
    var onQuoteTap: (() -> Void)? = nil
    static let maxSide: CGFloat = 160
    @ScaledMetric(relativeTo: .body) private var side: CGFloat = StickerMessageView.maxSide

    var body: some View {
        HStack {
            if fromUser { Spacer(minLength: 40) }
            VStack(alignment: fromUser ? .trailing : .leading, spacing: 4) {
                if let senderName { MessageSenderNameView(name: senderName, color: senderColor) }
                if let replyQuote {
                    MessageReplyQuoteView(preview: replyQuote, action: onQuoteTap)
                        .frame(maxWidth: 240)
                        .background(fromUser ? Color("OutgoingMessageBackground") : Color(uiColor: .secondarySystemBackground),
                                    in: RoundedRectangle(cornerRadius: 12))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                StickerImageView(resource: localResource ?? resource, maxPixelSize: 520, maxSide: side)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Sticker \(attachment.sticker?.emoji ?? "")")
                MessageMetadataView(sentAt: sentAt, fromUser: fromUser, receiptState: receiptState, readAt: readAt,
                                    isSending: isSending, showsReceipt: showsReceipt)
            }
            if !fromUser { Spacer(minLength: 40) }
        }
        .frame(maxWidth: .infinity, alignment: fromUser ? .trailing : .leading)
    }
}
