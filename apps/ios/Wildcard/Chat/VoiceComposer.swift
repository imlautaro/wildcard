import SwiftUI

/// Composer microphone for voice messages: hold to record, release to send, slide left to
/// cancel, slide up to lock. While locked it becomes the Stop button, which stops and sends.
/// Recording ends with `recorder.phase == .ready`; the chat view takes the clip and sends it.
struct VoiceRecordButton: View {
    let recorder: VoiceRecorder
    let isEnabled: Bool
    @Binding var locked: Bool
    /// Horizontal drag for the "Slide to cancel" label; zero or negative.
    @Binding var dragOffset: CGFloat
    var onBegin: () -> Void = { }
    @GestureState private var pressing = false
    @State private var tracking = false
    @State private var cancelled = false
    @State private var pressStartedLocked = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .body) private var height: CGFloat = 44
    @ScaledMetric(relativeTo: .body) private var iconSize: CGFloat = 20
    static let cancelDistance: CGFloat = 100
    static let lockDistance: CGFloat = 80

    private var isRecording: Bool { recorder.phase == .recording || recorder.phase == .requestingPermission }

    var body: some View {
        Image(systemName: locked ? "stop.fill" : "mic.fill")
            .font(.system(size: iconSize, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: height, height: height)
            .contentShape(Circle())
            .glassEffect(.regular.tint(isRecording ? .red : .accentColor).interactive(), in: Circle())
            .scaleEffect(isRecording && !locked && !reduceMotion ? 1.15 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: isRecording)
            .opacity(isEnabled ? 1 : 0.4)
            .overlay(alignment: .top) {
                if recorder.phase == .recording && !locked {
                    VStack(spacing: 2) {
                        Image(systemName: "lock.open")
                        Image(systemName: "chevron.up")
                    }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 8).padding(.horizontal, 6)
                    .glassEffect(.regular, in: Capsule())
                    .offset(y: -height - 12)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                    .transition(.opacity)
                }
            }
            .gesture(
                DragGesture(minimumDistance: 0)
                    .updating($pressing) { _, state, _ in state = true }
                    .onChanged(changed)
                    .onEnded { _ in release() }
            )
            // A gesture the system cancels never reports its end; treat it as a release.
            .onChange(of: pressing) { _, isPressing in
                if !isPressing { release() }
            }
            .onChange(of: recorder.phase) { _, phase in
                if phase != .recording && phase != .requestingPermission { locked = false; dragOffset = 0 }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(locked ? "Stop and send voice message" : (isRecording ? "Send voice message" : "Record voice message"))
            .accessibilityHint(isRecording ? "" : "Hold to record, release to send. Activate to record hands-free.")
            .accessibilityAddTraits(.isButton)
            .accessibilityAction {
                // VoiceOver records in locked mode: activate to start, activate again to send.
                if isRecording { _ = recorder.stop() }
                else if isEnabled {
                    onBegin()
                    locked = true
                    recorder.start()
                }
            }
            .disabled(!isEnabled)
    }

    private func changed(_ value: DragGesture.Value) {
        if !tracking {
            tracking = true
            cancelled = false
            pressStartedLocked = locked
            guard !locked, isEnabled, !recorder.isBusy else { cancelled = !locked; return }
            onBegin()
            recorder.start()
        }
        guard !cancelled, !pressStartedLocked, !locked else { return }
        dragOffset = min(0, value.translation.width)
        if value.translation.width < -Self.cancelDistance {
            cancelled = true
            dragOffset = 0
            recorder.cancel()
        } else if value.translation.height < -Self.lockDistance, recorder.phase == .recording {
            dragOffset = 0
            locked = true
        }
    }

    private func release() {
        guard tracking else { return }
        tracking = false
        dragOffset = 0
        guard !cancelled else { return }
        if pressStartedLocked {
            if recorder.phase == .recording { _ = recorder.stop() }
            return
        }
        guard !locked else { return }
        switch recorder.phase {
        case .recording: _ = recorder.stop()
        case .requestingPermission:
            recorder.cancel()
            recorder.hint = VoiceRecorder.shortHint
        default: break
        }
    }
}

/// Replaces the text field while recording: pulsing dot, timer, and either the slide hint
/// or, when locked, a Delete button.
struct VoiceRecordingBar: View {
    let recorder: VoiceRecorder
    let locked: Bool
    let dragOffset: CGFloat
    let onDelete: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .body) private var height: CGFloat = 44

    var body: some View {
        HStack(spacing: 10) {
            TimelineView(.animation(minimumInterval: 1 / 15, paused: reduceMotion)) { context in
                let wave = (sin(context.date.timeIntervalSinceReferenceDate * .pi) + 1) / 2
                Circle().fill(.red).frame(width: 10, height: 10)
                    .opacity(reduceMotion ? 1 : 0.3 + 0.7 * wave)
            }
            .accessibilityHidden(true)
            TimelineView(.periodic(from: .now, by: 0.5)) { _ in
                Text(VoiceDuration.format(seconds: recorder.elapsed)).monospacedDigit()
                    .accessibilityLabel("Recording, \(recorder.elapsed) seconds")
            }
            Spacer(minLength: 8)
            if locked {
                Button(role: .destructive, action: onDelete) {
                    Label("Delete", systemImage: "trash")
                }
                .accessibilityLabel("Delete recording")
            } else {
                Text("‹ Slide to cancel").foregroundStyle(.secondary)
                    .offset(x: dragOffset)
                    .opacity(1 - min(0.7, Double(-dragOffset / VoiceRecordButton.cancelDistance)))
                    .accessibilityHidden(true)
                Spacer(minLength: 0)
            }
        }
        .manrope()
        .padding(.horizontal, 14)
        .frame(maxWidth: .infinity, minHeight: height)
        .glassEffect(.regular, in: Capsule())
    }
}

enum VoiceDuration {
    static func format(seconds: Int) -> String { "\(seconds / 60):\(String(format: "%02d", seconds % 60))" }
    static func format(milliseconds: Int) -> String { format(seconds: Int((Double(milliseconds) / 1000).rounded())) }
}

/// Composer row for a voice message that could not be sent: Retry or Delete.
struct FailedVoiceMessageRow: View {
    let clip: VoiceClip
    let isBusy: Bool
    let retry: () -> Void
    let discard: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "mic.fill").foregroundStyle(.red)
            Text("Voice message (\(VoiceDuration.format(milliseconds: clip.durationMs))) not sent.")
            Spacer()
            Button("Retry", action: retry).disabled(isBusy)
            Button("Delete", role: .destructive, action: discard).disabled(isBusy)
        }
        .manrope(.footnote)
    }
}
