import AVFAudio
import Foundation
import Observation

/// Captures one voice message as mono 16 kHz PCM16 WAV in a protected temporary file.
/// The clip is read into memory by `takeClip()` and the file is deleted immediately.
@Observable @MainActor
final class VoiceRecorder: NSObject, AVAudioRecorderDelegate {
    enum Phase { case idle, requestingPermission, recording, ready, failed }
    private(set) var phase: Phase = .idle
    private(set) var error: String?
    /// Non-error guidance, such as after a press that was too short to record.
    var hint: String?
    private var recorder: AVAudioRecorder?
    private var ownsAudioSession = false
    private var directory: URL?
    private var file: URL?
    private var startedAt: Date?
    private var operation = UUID()

    override init() {
        super.init()
        // Recover temporary files left behind if the app was killed mid-recording.
        let keys: Set<URLResourceKey> = [.isDirectoryKey, .contentModificationDateKey]
        let root = FileManager.default.temporaryDirectory
        for folder in (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: Array(keys))) ?? [] {
            guard folder.lastPathComponent.hasPrefix("wildcard-voice-"),
                  let values = try? folder.resourceValues(forKeys: keys), values.isDirectory == true,
                  let modified = values.contentModificationDate, modified < Date().addingTimeInterval(-900) else { continue }
            try? FileManager.default.removeItem(at: folder)
        }
    }

    var isBusy: Bool { phase == .requestingPermission || phase == .recording || phase == .ready }
    var elapsed: Int { min(60, max(0, Int(startedAt.map { Date().timeIntervalSince($0) } ?? 0))) }
    static let minimumDuration: TimeInterval = 0.5
    static let shortHint = "Hold to record, release to send."

    func start() async {
        guard !isBusy else { return }
        cancel()
        let current = operation
        phase = .requestingPermission
        // The press that shows the system prompt only grants access; the next press records.
        let prompted = AVAudioApplication.shared.recordPermission == .undetermined
        let allowed = await AVAudioApplication.requestRecordPermission()
        guard current == operation, !Task.isCancelled else { return }
        guard allowed else {
            phase = .failed
            error = "Microphone access is disabled. Enable it for Wildcard in Settings to record audio."
            return
        }
        guard !prompted else {
            phase = .idle
            hint = Self.shortHint
            return
        }
        do {
            // Recording takes the shared session from any voice message that is playing.
            VoicePlayer.shared.isRecording = true
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .default)
            try session.setActive(true)
            ownsAudioSession = true
            let folder = FileManager.default.temporaryDirectory.appending(path: "wildcard-voice-\(UUID().uuidString)", directoryHint: .isDirectory)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false,
                attributes: [.posixPermissions: 0o700, .protectionKey: FileProtectionType.complete])
            directory = folder
            let url = folder.appending(path: "recording.wav")
            file = url
            let recorder = try AVAudioRecorder(url: url, settings: [
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVSampleRateKey: 16000.0,
                AVNumberOfChannelsKey: 1,
                AVLinearPCMBitDepthKey: 16,
                AVLinearPCMIsFloatKey: false,
                AVLinearPCMIsBigEndianKey: false,
            ])
            self.recorder = recorder
            recorder.delegate = self
            guard recorder.prepareToRecord() else { throw RecordingFailure() }
            try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path)
            guard recorder.record(forDuration: 60) else { throw RecordingFailure() }
            startedAt = Date()
            phase = .recording
        } catch {
            cancel()
            phase = .failed
            self.error = "Recording could not start. Check your microphone and try again."
        }
    }

    /// Ends recording; `phase` becomes `.ready` when the file is complete.
    /// Returns `false` and discards a clip shorter than half a second.
    @discardableResult
    func stop() -> Bool {
        guard phase == .recording else { return false }
        guard let startedAt, Date().timeIntervalSince(startedAt) >= Self.minimumDuration else {
            cancel()
            hint = Self.shortHint
            return false
        }
        recorder?.stop()
        return true
    }

    /// Reads the finished recording and deletes its temporary file.
    func takeClip() -> VoiceClip? {
        guard phase == .ready, let file else { return nil }
        let size = (try? file.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
        let data = (44...(2 * 1024 * 1024)).contains(size) ? try? Data(contentsOf: file) : nil
        cancel()
        guard let data, let duration = VoiceClip.wavDurationMs(data) else {
            phase = .failed
            error = "This recording could not be read. Please record again."
            return nil
        }
        guard duration >= Int(Self.minimumDuration * 1000) else {
            hint = Self.shortHint
            return nil
        }
        return VoiceClip(data: data, durationMs: min(duration, 60_000))
    }

    func cancel() {
        operation = UUID()
        recorder?.delegate = nil
        recorder?.stop()
        recorder = nil
        deactivateAudioSession()
        if let directory { try? FileManager.default.removeItem(at: directory) }
        directory = nil
        file = nil
        startedAt = nil
        phase = .idle
        error = nil
        hint = nil
    }

    private func deactivateAudioSession() {
        if VoicePlayer.shared.isRecording { VoicePlayer.shared.isRecording = false }
        guard ownsAudioSession else { return }
        ownsAudioSession = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    func handleDeactivation(_ notification: Notification) {
        // App-requested cleanup also posts this notification, possibly after a new recording starts.
        guard let context = notification.userInfo?[AVAudioSession.deactivationContextKey] as? AVAudioSession.DeactivationContext,
              context.source == .system else { return }
        guard phase == .recording else { return }
        cancel()
        phase = .failed
        error = "Recording was interrupted. Please record again."
    }

    nonisolated func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        let identifier = ObjectIdentifier(recorder)
        Task { @MainActor [weak self] in
            guard let self, let active = self.recorder, ObjectIdentifier(active) == identifier, self.phase == .recording else { return }
            self.recorder?.delegate = nil
            self.recorder = nil
            if flag {
                self.phase = .ready
                self.deactivateAudioSession()
            }
            else {
                self.cancel()
                self.phase = .failed
                self.error = "Recording could not be completed. Please record again."
            }
        }
    }

    nonisolated func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: (any Error)?) {
        let identifier = ObjectIdentifier(recorder)
        Task { @MainActor [weak self] in
            guard let self, let active = self.recorder, ObjectIdentifier(active) == identifier else { return }
            self.cancel()
            self.phase = .failed
            self.error = "Recording could not be completed. Please record again."
        }
    }

    private struct RecordingFailure: Error { }
}
