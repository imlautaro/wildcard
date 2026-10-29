import SwiftUI

/// A voice message bubble: play/pause, progress, elapsed time while playing (duration
/// otherwise), send time and receipts. Outgoing bubbles show a microphone that turns the
/// read-check color once a contact has listened. Audio comes from `localData` (an outgoing
/// clip) or the account's protected voice cache.
struct VoiceMessageView: View {
    let resource: VoiceAudioResource
    let voice: MessageVoice
    let sentAt: Double
    let fromUser: Bool
    var receiptState: String? = nil
    var readAt: Double? = nil
    var isSending = false
    var showsReceipt = true
    var localData: Data? = nil
    var senderName: String? = nil
    var senderColor: Color? = nil
    var replyQuote: MessageReplyPreview? = nil
    var onQuoteTap: (() -> Void)? = nil
    @Environment(AuthStore.self) private var auth
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var loading = false
    @State private var failed = false
    @State private var loadTask: Task<Void, Never>?
    @ScaledMetric(relativeTo: .body) private var buttonSize: CGFloat = 36

    private var player: VoicePlayer { VoicePlayer.shared }
    private var key: String { "\(auth.user?.id ?? "")/\(resource.key)" }
    private var isPlaying: Bool { player.isPlaying(key) }
    private var duration: TimeInterval { Double(voice.durationMs) / 1000 }

    var body: some View {
        HStack {
            if fromUser { Spacer(minLength: 40) }
            VStack(alignment: .leading, spacing: 6) {
                if let senderName { MessageSenderNameView(name: senderName, color: senderColor) }
                if let replyQuote { MessageReplyQuoteView(preview: replyQuote, action: onQuoteTap) }
                HStack(alignment: .center, spacing: 10) {
                    playButton
                    TimelineView(.animation(minimumInterval: 0.1, paused: !isPlaying)) { _ in
                        let elapsed = player.currentTime(for: key)
                        VStack(alignment: .leading, spacing: 6) {
                            ProgressView(value: duration > 0 ? min(1, elapsed / duration) : 0)
                                .tint(fromUser ? Color.accentColor : Color.secondary)
                                .accessibilityHidden(true)
                            HStack(alignment: .lastTextBaseline, spacing: 4) {
                                if fromUser {
                                    Image(systemName: "mic.fill")
                                        .font(.caption2)
                                        .foregroundStyle(voice.listenedAt != nil ? MessageReceiptView.readColor(colorScheme) : Color.secondary)
                                        .accessibilityLabel(voice.listenedAt != nil ? "Listened" : "Not listened yet")
                                }
                                Text(isPlaying ? VoiceDuration.format(seconds: Int(elapsed)) : VoiceDuration.format(milliseconds: voice.durationMs))
                                    .manrope(.caption2).monospacedDigit()
                                    .foregroundStyle(.secondary)
                                Spacer(minLength: 8)
                                MessageMetadataView(sentAt: sentAt, fromUser: fromUser, receiptState: receiptState, readAt: readAt,
                                                    isSending: isSending, showsReceipt: showsReceipt)
                            }
                        }
                    }
                }
                .frame(width: 220)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .foregroundStyle(Color.primary)
            .background(fromUser ? Color("OutgoingMessageBackground") : Color(uiColor: .secondarySystemBackground),
                        in: MessageBubbleShape(fromUser: fromUser))
            if !fromUser { Spacer(minLength: 40) }
        }
        .transition(reduceMotion ? .opacity : .opacity.combined(with: .offset(x: fromUser ? 8 : -8, y: 4)))
        .onDisappear { loadTask?.cancel() }
    }

    private var playButton: some View {
        Button(action: toggle) {
            ZStack {
                if loading { ProgressView() }
                else {
                    Image(systemName: failed ? "arrow.clockwise" : (isPlaying ? "pause.fill" : "play.fill"))
                        .font(.system(size: buttonSize * 0.45, weight: .semibold))
                }
            }
            .frame(width: buttonSize, height: buttonSize)
            .background(Color.primary.opacity(0.08), in: Circle())
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(loading)
        .accessibilityLabel(failed ? "Retry loading voice message" : (isPlaying ? "Pause voice message" : "Play voice message"))
        .accessibilityValue(VoiceDuration.format(milliseconds: voice.durationMs))
    }

    private func toggle() {
        if isPlaying { player.pause(); return }
        // A paused clip resumes from the player, even if its bytes left the memory cache.
        if player.isCurrent(key) {
            player.play(Data(), key: key)
            return
        }
        if let localData {
            failed = !player.play(localData, key: key)
            return
        }
        loadTask?.cancel()
        loading = true
        failed = false
        loadTask = Task {
            defer { loading = false }
            do {
                let data = try await auth.voiceAudio(resource)
                try Task.checkCancellation()
                failed = !player.play(data, key: key)
                if failed { await auth.images.audio.remove(resource) }
            } catch is CancellationError { }
            catch { failed = true }
        }
    }
}

/// Transcript of a voice message, opened from the long-press menu.
struct VoiceTranscriptSheet: View {
    let transcript: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                Group {
                    if let transcript, !transcript.isEmpty {
                        Text(transcript).manrope().textSelection(.enabled)
                    } else {
                        Text(transcript == nil ? "Transcribing…" : "No speech was detected.")
                            .manrope().foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
            }
            .navigationTitle("Transcript")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
