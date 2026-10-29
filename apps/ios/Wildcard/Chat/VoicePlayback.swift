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
    private(set) var playbackRate: Float = 1
    private var preferenceOwner: String?
    private var ratePreferenceKey: String? { preferenceOwner.map { "voicePlaybackRate.v1.\($0)" } }
    var playbackRateLabel: String { playbackRate == 1.5 ? "1.5x" : playbackRate == 2 ? "2x" : "1x" }
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

    /// Only a numeric listening preference persists; audio/session state never goes into defaults.
    func activate(userID: String?) {
        guard preferenceOwner != userID else { return }
        stop()
        preferenceOwner = userID
        let saved = ratePreferenceKey.map { UserDefaults.standard.float(forKey: $0) } ?? 1
        playbackRate = [Float(1), 1.5, 2].contains(saved) ? saved : 1
    }

    func cyclePlaybackRate() {
        guard preferenceOwner != nil else { return }
        playbackRate = playbackRate == 1 ? 1.5 : playbackRate == 1.5 ? 2 : 1
        player?.rate = playbackRate
        if let ratePreferenceKey { UserDefaults.standard.set(playbackRate, forKey: ratePreferenceKey) }
    }

    func isCurrent(_ key: String) -> Bool { currentKey == key }
    func isPlaying(_ key: String) -> Bool { isPlaying && currentKey == key }
    func seek(_ seconds: TimeInterval, for key: String) {
        guard currentKey == key, let player, seconds.isFinite else { return }
        player.currentTime = min(player.duration, max(0, seconds))
    }

    func duration(for key: String) -> TimeInterval? { currentKey == key ? player?.duration : nil }
    func currentTime(for key: String) -> TimeInterval { currentKey == key ? player?.currentTime ?? 0 : 0 }

    /// Starts `data` for `key`, or resumes it when `key` is paused. Returns `false` when the audio cannot play.
    @discardableResult
    func play(_ data: Data, key: String) -> Bool {
        guard !isRecording else { return false }
        do {
            if currentKey == key, let player {
                try activateAudioSession()
                player.rate = playbackRate
                guard player.play() else { throw PlaybackFailure() }
                isPlaying = true
                return true
            }
            stop()
            let player = try AVAudioPlayer(data: data)
            player.delegate = self
            player.enableRate = true
            player.rate = playbackRate
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
