import AVFAudio
import Foundation
import Observation

/// Plays voice messages and voice samples. Only one plays at a time across the app;
/// starting another stops the current one. The `.playback` session is released whenever
/// nothing plays, and recording always takes precedence.
@Observable @MainActor
final class VoicePlayer: NSObject, AVAudioPlayerDelegate {
    static let shared = VoicePlayer()
    private(set) var currentKey: String?
    private(set) var isPlaying = false
    private var player: AVAudioPlayer?
    private var ownsAudioSession = false
    /// Set by `VoiceRecorder` while it owns the `.record` session.
    var isRecording = false {
        didSet {
            guard isRecording else { return }
            stop()
            ownsAudioSession = false
        }
    }

    private override init() {
        super.init()
        let center = NotificationCenter.default
        center.addObserver(forName: AVAudioSession.didBecomeInactiveNotification, object: nil, queue: .main) { notification in
            // System deactivation (calls, other apps) stops output; reflect it as paused instead of resuming later.
            guard let context = notification.userInfo?[AVAudioSession.deactivationContextKey] as? AVAudioSession.DeactivationContext,
                  context.source == .system else { return }
            Task { @MainActor in VoicePlayer.shared.pause() }
        }
        center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { notification in
            let reason = (notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt)
                .flatMap(AVAudioSession.RouteChangeReason.init(rawValue:))
            // Unplugged headphones must not continue on the speaker.
            if reason == .oldDeviceUnavailable { Task { @MainActor in VoicePlayer.shared.pause() } }
        }
    }

    func isCurrent(_ key: String) -> Bool { currentKey == key }
    func isPlaying(_ key: String) -> Bool { isPlaying && currentKey == key }
    func currentTime(for key: String) -> TimeInterval { currentKey == key ? player?.currentTime ?? 0 : 0 }

    /// Starts `data` for `key`, or resumes it when `key` is paused. Returns `false` when the audio cannot play.
    @discardableResult
    func play(_ data: Data, key: String) -> Bool {
        guard !isRecording else { return false }
        do {
            if currentKey == key, let player {
                try activateAudioSession()
                guard player.play() else { throw PlaybackFailure() }
                isPlaying = true
                return true
            }
            stop()
            let player = try AVAudioPlayer(data: data)
            player.delegate = self
            try activateAudioSession()
            guard player.prepareToPlay(), player.play() else { throw PlaybackFailure() }
            self.player = player
            currentKey = key
            isPlaying = true
            return true
        } catch {
            stop()
            return false
        }
    }

    func pause() {
        guard isPlaying else { return }
        player?.pause()
        isPlaying = false
        deactivateAudioSession()
    }

    func stop() {
        player?.delegate = nil
        player?.stop()
        player = nil
        currentKey = nil
        isPlaying = false
        deactivateAudioSession()
    }

    private func activateAudioSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .spokenAudio)
        try session.setActive(true)
        ownsAudioSession = true
    }

    private func deactivateAudioSession() {
        guard ownsAudioSession, !isRecording else { return }
        ownsAudioSession = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        let identifier = ObjectIdentifier(player)
        Task { @MainActor [weak self] in
            guard let self, let active = self.player, ObjectIdentifier(active) == identifier else { return }
            self.stop()
        }
    }

    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: (any Error)?) {
        let identifier = ObjectIdentifier(player)
        Task { @MainActor [weak self] in
            guard let self, let active = self.player, ObjectIdentifier(active) == identifier else { return }
            self.stop()
        }
    }

    private struct PlaybackFailure: Error { }
}
