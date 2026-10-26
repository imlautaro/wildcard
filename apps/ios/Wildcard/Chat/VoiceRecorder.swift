import AVFAudio
import Foundation
import Observation

@Observable @MainActor
final class VoiceRecorder: NSObject, AVAudioRecorderDelegate {
    enum Phase { case idle, requestingPermission, recording, ready, transcribing, failed }
    private(set) var phase: Phase = .idle
    private(set) var error: String?
    private var recorder: AVAudioRecorder?
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

    var hasRecording: Bool { file != nil && (phase == .ready || phase == .transcribing || phase == .failed) }
    var isBusy: Bool { phase == .requestingPermission || phase == .recording || phase == .ready || phase == .transcribing }
    var elapsed: Int { min(60, max(0, Int(startedAt.map { Date().timeIntervalSince($0) } ?? 0))) }

    func start() async {
        guard !isBusy else { return }
        cancel()
        let current = operation
        phase = .requestingPermission
        let allowed = await AVAudioApplication.requestRecordPermission()
        guard current == operation, !Task.isCancelled else { return }
        guard allowed else {
            phase = .failed
            error = "Microphone access is disabled. Enable it for Wildcard in Settings to record audio."
            return
        }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .default)
            try session.setActive(true)
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

    func stop() {
        guard phase == .recording else { return }
        recorder?.stop()
    }

    func cancel() {
        operation = UUID()
        recorder?.delegate = nil
        recorder?.stop()
        recorder = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        if let directory { try? FileManager.default.removeItem(at: directory) }
        directory = nil
        file = nil
        startedAt = nil
        phase = .idle
        error = nil
    }

    func interrupt() {
        guard phase == .recording else { return }
        cancel()
        error = "Recording was interrupted. Please record again."
    }

    func transcribe(contactID: String, using auth: AuthStore) async -> String? {
        guard hasRecording, phase == .ready || phase == .failed, let file else { return nil }
        let current = operation
        phase = .transcribing
        error = nil
        do {
            let size = (try file.resourceValues(forKeys: [.fileSizeKey])).fileSize ?? 0
            guard (44...(2 * 1024 * 1024)).contains(size) else { throw RecordingFailure() }
            let audio = try Data(contentsOf: file)
            let text = try await auth.withSession { api, token in
                try await api.transcribeAudio(contactID: contactID, audio: audio, token: token)
            }
            try Task.checkCancellation()
            guard current == operation else { return nil }
            cancel()
            return text
        } catch {
            guard current == operation else { return nil }
            if Task.isCancelled || error is CancellationError {
                cancel()
            } else {
                phase = .failed
                self.error = (error is RecordingFailure || error is CocoaError) ? "This recording could not be read. Please record again." : error.localizedDescription
            }
            return nil
        }
    }

    nonisolated func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        let identifier = ObjectIdentifier(recorder)
        Task { @MainActor [weak self] in
            guard let self, let active = self.recorder, ObjectIdentifier(active) == identifier, self.phase == .recording else { return }
            self.recorder?.delegate = nil
            self.recorder = nil
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            if flag { self.phase = .ready }
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
