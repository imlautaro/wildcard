import SwiftUI

/// A voice message bubble: sender avatar, plain play/pause, waveform progress, elapsed time while playing (duration
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
    var senderAvatar: AnyView? = nil
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
    @State private var samples: [Double]?
    @State private var visible = false
    @State private var selectedTime: TimeInterval = 0
    @ScaledMetric(relativeTo: .body) private var buttonSize: CGFloat = 44

    private var player: VoicePlayer { VoicePlayer.shared }
    private var key: String { "\(auth.user?.id ?? "")/\(resource.key)" }
    private var isPlaying: Bool { player.isPlaying(key) }
    private var duration: TimeInterval { player.duration(for: key) ?? Double(voice.durationMs) / 1000 }

    var body: some View {
        HStack {
            if fromUser { Spacer(minLength: 40) }
            VStack(alignment: .leading, spacing: 6) {
                if let senderName { MessageSenderNameView(name: senderName, color: senderColor) }
                if let replyQuote { MessageReplyQuoteView(preview: replyQuote, action: onQuoteTap) }
                TimelineView(.animation(minimumInterval: 0.05, paused: !isPlaying)) { _ in
                    let elapsed = player.isCurrent(key) ? player.currentTime(for: key) : selectedTime
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .center, spacing: 10) {
                            if fromUser { avatar }
                            playButton
                            waveform(elapsed: elapsed)
                            if !fromUser { avatar }
                        }
                        HStack(alignment: .lastTextBaseline, spacing: 4) {
                            if fromUser {
                                Image(systemName: "mic.fill")
                                    .font(.caption2)
                                    .foregroundStyle(voice.listenedAt != nil ? MessageReceiptView.readColor(colorScheme) : Color.secondary)
                                    .accessibilityLabel(voice.listenedAt != nil ? "Listened" : "Not listened yet")
                            }
                            Text(elapsed > 0 || isPlaying ? VoiceDuration.format(seconds: Int(elapsed)) : VoiceDuration.format(milliseconds: voice.durationMs))
                                .manrope(.caption2).monospacedDigit()
                                .foregroundStyle(.secondary)
                            Spacer(minLength: 4)
                            MessageMetadataView(sentAt: sentAt, fromUser: fromUser, receiptState: receiptState, readAt: readAt,
                                                isSending: isSending, showsReceipt: showsReceipt)
                        }
                    }
                }
                .frame(maxWidth: 270)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .foregroundStyle(Color.primary)
            .background(fromUser ? Color("OutgoingMessageBackground") : Color(uiColor: .secondarySystemBackground),
                        in: MessageBubbleShape(fromUser: fromUser))
            if !fromUser { Spacer(minLength: 40) }
        }
        .transition(reduceMotion ? .opacity : .opacity.combined(with: .offset(x: fromUser ? 8 : -8, y: 4)))
        .onScrollVisibilityChange(threshold: 0.1) { visible = $0 }
        .task(id: "\(key)/\(visible)") {
            guard visible else { return }
            await loadWaveform()
        }
        .onChange(of: key) { _, _ in samples = nil; selectedTime = 0 }
        .onChange(of: player.currentKey) { previous, current in
            if previous == key && current != key { selectedTime = 0 }
        }
        .onDisappear { loadTask?.cancel() }
    }

    @ViewBuilder private var avatar: some View {
        if fromUser { AccountAvatar(user: auth.user, size: 40) }
        else if let senderAvatar { senderAvatar }
        else { ContactAvatar(contact: nil, size: 40) }
    }

    private func waveform(elapsed: TimeInterval) -> some View {
        let progress = duration > 0 ? min(1, elapsed / duration) : 0
        let values = samples ?? auth.images.audio.cachedWaveform(resource) ?? [Double](repeating: 0, count: 37)
        return GeometryReader { geometry in
            let trackWidth = max(0, geometry.size.width - 12)
            let spacing = trackWidth / CGFloat(values.count)
            ZStack {
                HStack(spacing: 0) {
                    ForEach(values.indices, id: \.self) { index in
                        Capsule()
                            .fill(Double(index) / Double(values.count) < progress ? Color.accentColor : Color.secondary.opacity(0.4))
                            .frame(width: min(2.2, max(1, spacing - 1.5)), height: 3 + 19 * values[index])
                            .frame(width: spacing)
                    }
                }
                .frame(width: trackWidth)
                VoiceSeekSlider(value: progress, onChange: { fraction in
                    selectedTime = fraction * duration
                    player.seek(selectedTime, for: key)
                })
                .accessibilityLabel("Playback position")
                .accessibilityValue("\(VoiceDuration.format(seconds: Int(elapsed))) of \(VoiceDuration.format(seconds: Int(duration)))")
            }
            .frame(height: 44)
        }
        .frame(height: 44)
    }

    private func loadWaveform() async {
        let expectedKey = key
        do {
            let values = try await auth.images.audio.waveform(resource) {
                if let localData { return localData }
                return try await auth.voiceAudio(resource)
            }
            try Task.checkCancellation()
            guard key == expectedKey else { return }
            samples = values
        } catch { /* Keep a neutral baseline; playback can still be retried independently. */ }
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
            .contentShape(Rectangle())
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
            player.seek(selectedTime, for: key)
            Task { await loadWaveform() }
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
                player.seek(selectedTime, for: key)
                if !failed { await loadWaveform() }
                if failed { await auth.images.audio.remove(resource) }
            } catch is CancellationError { }
            catch { failed = true }
        }
    }
}

/// Native slider keeps a 44-point hit area and touch/VoiceOver tracking over the bars.
private struct VoiceSeekSlider: UIViewRepresentable {
    let value: Double
    let onChange: (Double) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onChange: onChange) }

    func makeUIView(context: Context) -> UISlider {
        let slider = WaveformSlider()
        slider.minimumTrackTintColor = .clear
        slider.maximumTrackTintColor = .clear
        let image = UIGraphicsImageRenderer(size: CGSize(width: 12, height: 12)).image { context in
            UIColor.white.setFill()
            context.cgContext.fillEllipse(in: CGRect(x: 0, y: 0, width: 12, height: 12))
        }.withRenderingMode(.alwaysTemplate)
        slider.setThumbImage(image, for: .normal)
        slider.setThumbImage(image, for: .highlighted)
        slider.addTarget(context.coordinator, action: #selector(Coordinator.changed(_:)), for: .valueChanged)
        return slider
    }

    func updateUIView(_ slider: UISlider, context: Context) {
        context.coordinator.onChange = onChange
        slider.thumbTintColor = UIColor(Color.accentColor)
        slider.tintColor = UIColor(Color.accentColor)
        if !slider.isTracking { slider.value = Float(value) }
    }

    final class Coordinator: NSObject {
        var onChange: (Double) -> Void
        init(onChange: @escaping (Double) -> Void) { self.onChange = onChange }
        @objc func changed(_ slider: UISlider) { onChange(Double(slider.value)) }
    }

    private final class WaveformSlider: UISlider {
        private func move(to touch: UITouch) {
            let fraction = min(1, max(0, (touch.location(in: self).x - 6) / max(1, bounds.width - 12)))
            value = Float(fraction)
            sendActions(for: .valueChanged)
        }

        override func beginTracking(_ touch: UITouch, with event: UIEvent?) -> Bool {
            move(to: touch)
            return true
        }

        override func continueTracking(_ touch: UITouch, with event: UIEvent?) -> Bool {
            move(to: touch)
            return true
        }

        override func endTracking(_ touch: UITouch?, with event: UIEvent?) {
            if let touch { move(to: touch) }
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
