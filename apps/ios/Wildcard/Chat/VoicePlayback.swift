import AVFAudio
import Foundation
import MediaPlayer
import Observation
import UIKit

/// One session-owned player for messages and catalog samples. Recording takes precedence.
@Observable @MainActor
final class VoicePlayer: NSObject, AVAudioPlayerDelegate {
    static let shared = VoicePlayer()
    private(set) var currentKey: String?
    /// Includes the brief, cancellable preparation period after tapping Play.
    private(set) var isPlaying = false
    private var playbackStarted: (() -> Void)?
    private(set) var failedKey: String?
    private(set) var playbackRate: Float = 1
    private var preferenceOwner: String?
    private var ratePreferenceKey: String? { preferenceOwner.map { "voicePlaybackRate.v1.\($0)" } }
    var playbackRateLabel: String { playbackRate == 1.5 ? "1.5x" : playbackRate == 2 ? "2x" : "1x" }
    private var player: AVAudioPlayer?
    private var ownsAudioSession = false
    private var isMessage = false
    private var usingReceiver = false
    private var observingOrientation = false
    private var startTask: Task<Void, Never>?
    private var proximityTask: Task<Void, Never>?
    private var artwork: MPMediaItemArtwork?
    private var artworkTask: Task<Void, Never>?
    private var progressTimer: Timer?
    var isRecording = false {
        didSet { if isRecording { stop() } }
    }

    private override init() {
        super.init()
        let center = NotificationCenter.default
        center.addObserver(forName: AVAudioSession.didBecomeInactiveNotification, object: nil, queue: .main) { notification in
            guard let context = notification.userInfo?[AVAudioSession.deactivationContextKey] as? AVAudioSession.DeactivationContext,
                  context.source == .system else { return }
            Task { @MainActor in VoicePlayer.shared.pause() }
        }
        center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { notification in
            let reason = (notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt)
                .flatMap(AVAudioSession.RouteChangeReason.init(rawValue:))
            Task { @MainActor in
                let owner = VoicePlayer.shared
                // Never expose headphone audio on the speaker after disconnection.
                if reason == .oldDeviceUnavailable { owner.pause() }
                else { owner.routeChanged() }
            }
        }
        center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { _ in
            Task { @MainActor in VoicePlayer.shared.stop() }
        }
        for name in [UIDevice.proximityStateDidChangeNotification, UIDevice.orientationDidChangeNotification,
                     UIApplication.didBecomeActiveNotification, UIApplication.didEnterBackgroundNotification] {
            center.addObserver(forName: name, object: nil, queue: .main) { _ in
                Task { @MainActor in
                    let owner = VoicePlayer.shared
                    if UIApplication.shared.applicationState == .background && !owner.isMessage { owner.pause() }
                    else { owner.updateProximityMonitoring() }
                }
            }
        }
        installRemoteCommands()
        updateNowPlaying()
    }

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
        updateNowPlaying()
    }

    func isCurrent(_ key: String) -> Bool { currentKey == key }
    func isPlaying(_ key: String) -> Bool { isPlaying && currentKey == key }
    func seek(_ seconds: TimeInterval, for key: String) {
        guard currentKey == key, let player, seconds.isFinite else { return }
        player.currentTime = min(player.duration, max(0, seconds))
        updateNowPlaying()
    }
    func duration(for key: String) -> TimeInterval? { currentKey == key ? player?.duration : nil }
    func currentTime(for key: String) -> TimeInterval { currentKey == key ? player?.currentTime ?? 0 : 0 }

    @discardableResult
    func play(_ data: Data, key: String, isMessage: Bool = false, onStarted: (() -> Void)? = nil) -> Bool {
        guard !isRecording else { return false }
        if currentKey == key, player != nil { playbackStarted = onStarted; return resume() }
        stop()
        do {
            let player = try AVAudioPlayer(data: data)
            player.delegate = self
            player.enableRate = true
            player.rate = playbackRate
            guard player.prepareToPlay() else { throw PlaybackFailure() }
            self.player = player
            playbackStarted = onStarted
            self.isMessage = isMessage
            currentKey = key
            failedKey = nil
            return resume()
        } catch {
            fail()
            return false
        }
    }

    /// The player owns this load so artwork can finish after the bubble leaves the screen.
    /// Both the synchronous lookup and async load use the existing private image cache.
    func setSenderArtwork(for key: String, resource: CachedImageResource?, auth: AuthStore) {
        guard currentKey == key, isMessage, let expectedPlayer = player else { return }
        artworkTask?.cancel()
        let cached = resource.flatMap { auth.images.cachedImage($0, maxPixelSize: 288) }
        setArtworkImage(cached ?? Self.placeholderArtwork())
        guard cached == nil, let resource else { return }
        artworkTask = Task { [weak self] in
            do {
                let image = try await auth.cachedImage(resource, maxPixelSize: 288)
                try Task.checkCancellation()
                guard let self, self.currentKey == key, self.player === expectedPlayer else { return }
                self.setArtworkImage(image)
            } catch { /* Keep the generic avatar; a missing photo must not interrupt audio. */ }
        }
    }

    private func setArtworkImage(_ image: UIImage) {
        artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        updateNowPlaying()
    }

    private static func placeholderArtwork() -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: 288, height: 288), format: format).image { context in
            UIColor.systemGray5.resolvedColor(with: UITraitCollection(userInterfaceStyle: .light)).setFill()
            context.fill(CGRect(x: 0, y: 0, width: 288, height: 288))
            let symbol = UIImage(systemName: "person.crop.circle.fill")?
                .withTintColor(.systemGray, renderingMode: .alwaysOriginal)
            symbol?.draw(in: CGRect(x: 48, y: 48, width: 192, height: 192))
        }
    }

    @discardableResult
    private func resume() -> Bool {
        guard !isRecording, let player else { return false }
        if isPlaying { return true }
        do {
            try activateAudioSession()
            if player.currentTime >= player.duration { player.currentTime = 0 }
            player.rate = playbackRate
            isPlaying = true
            updateProximityMonitoring()
            // Accessories and samples start immediately. The grace period gives the sensor
            // time to settle before the first syllable, including on resume.
            let delay = isMessage && UIDevice.current.userInterfaceIdiom == .phone && hasBuiltInOutput
            if delay {
                startTask = Task { [weak self, weak player] in
                    do { try await Task.sleep(for: .milliseconds(300)) } catch { return }
                    guard let self, let player, self.player === player, self.isPlaying else { return }
                    self.startTask = nil
                    if player.play() { self.playbackStarted?() } else { self.fail() }
                    self.updateNowPlaying()
                }
            } else {
                guard player.play() else { throw PlaybackFailure() }
                playbackStarted?()
            }
            progressTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                Task { @MainActor in self?.updateNowPlaying() }
            }
            updateNowPlaying()
            return true
        } catch {
            fail()
            return false
        }
    }

    func pause() {
        guard isPlaying else { return }
        startTask?.cancel(); startTask = nil
        player?.pause()
        isPlaying = false
        releasePlaybackResources()
        updateNowPlaying()
    }

    func stop() {
        artworkTask?.cancel(); artworkTask = nil
        artwork = nil
        startTask?.cancel(); startTask = nil
        player?.delegate = nil
        player?.stop()
        player = nil
        currentKey = nil
        failedKey = nil
        playbackStarted = nil
        isPlaying = false
        isMessage = false
        releasePlaybackResources()
        updateNowPlaying()
    }

    private func fail() {
        let key = currentKey
        stop()
        failedKey = key
    }

    private func activateAudioSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .spokenAudio)
        try session.setActive(true)
        ownsAudioSession = true
    }

    private var hasBuiltInOutput: Bool {
        let outputs = AVAudioSession.sharedInstance().currentRoute.outputs
        return !outputs.isEmpty && outputs.allSatisfy { $0.portType == .builtInSpeaker || $0.portType == .builtInReceiver }
    }

    private func routeChanged() {
        guard isPlaying else { return }
        if !hasBuiltInOutput && usingReceiver {
            do { try setReceiver(false) } catch { fail(); return }
        }
        updateProximityMonitoring()
    }

    private func updateProximityMonitoring() {
        guard isPlaying, isMessage else { disableProximity(); return }
        let device = UIDevice.current
        let foreground = UIApplication.shared.applicationState != .background
        let eligible = device.userInterfaceIdiom == .phone && hasBuiltInOutput
        if eligible && foreground && !observingOrientation {
            observingOrientation = true
            device.beginGeneratingDeviceOrientationNotifications()
        }
        // Do not arm a new ear gesture in the background (for example, in a pocket).
        // A receiver session already in progress keeps its sensor until moved away.
        let upright = device.orientation != .faceUp && device.orientation != .faceDown && device.orientation != .unknown
        let monitor = eligible && (usingReceiver || (foreground && upright))
        if !monitor {
            disableProximity()
            if usingReceiver {
                do { try setReceiver(false) } catch { fail() }
            }
            return
        }
        device.isProximityMonitoringEnabled = true
        guard device.isProximityMonitoringEnabled else { return }
        let near = device.proximityState
        proximityTask?.cancel()
        guard near != usingReceiver, foreground || !near else { return }
        proximityTask = Task { [weak self] in
            // A longer far threshold avoids loud bursts from a momentary sensor gap.
            do { try await Task.sleep(for: .milliseconds(near ? 120 : 350)) } catch { return }
            guard let self, self.isPlaying, self.hasBuiltInOutput,
                  UIDevice.current.isProximityMonitoringEnabled, UIDevice.current.proximityState == near,
                  !near || UIApplication.shared.applicationState != .background else { return }
            do {
                try self.setReceiver(near)
                if !near { self.updateProximityMonitoring() }
            } catch { self.fail() }
        }
    }

    private func setReceiver(_ enabled: Bool) throws {
        guard enabled != usingReceiver else { return }
        let session = AVAudioSession.sharedInstance()
        let wasAudible = player?.isPlaying == true
        let position = player?.currentTime ?? 0
        player?.pause()
        if enabled {
            // Receiver output requires playAndRecord; no input or recorder is created.
            // Keep accessory routes eligible if one connects during the transition.
            try session.setCategory(.playAndRecord, mode: .default, options: [.allowBluetoothA2DP, .allowAirPlay])
            try session.overrideOutputAudioPort(.none)
        } else {
            try session.setCategory(.playback, mode: .spokenAudio)
        }
        usingReceiver = enabled
        player?.currentTime = position
        player?.rate = playbackRate
        if wasAudible, player?.play() != true { throw PlaybackFailure() }
        updateNowPlaying()
    }

    private func disableProximity() {
        proximityTask?.cancel(); proximityTask = nil
        UIDevice.current.isProximityMonitoringEnabled = false
        if observingOrientation {
            UIDevice.current.endGeneratingDeviceOrientationNotifications()
            observingOrientation = false
        }
    }

    private func releasePlaybackResources() {
        progressTimer?.invalidate(); progressTimer = nil
        disableProximity()
        guard ownsAudioSession else { return }
        ownsAudioSession = false
        // Playback is paused before restoring the category; never emit a speaker burst.
        if usingReceiver { try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio) }
        usingReceiver = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func installRemoteCommands() {
        let commands = MPRemoteCommandCenter.shared()
        commands.playCommand.addTarget { _ in
            Task { @MainActor in _ = VoicePlayer.shared.resume() }
            return .success
        }
        commands.pauseCommand.addTarget { _ in
            Task { @MainActor in VoicePlayer.shared.pause() }
            return .success
        }
        commands.togglePlayPauseCommand.addTarget { _ in
            Task { @MainActor in
                let owner = VoicePlayer.shared
                if owner.isPlaying { owner.pause() } else { _ = owner.resume() }
            }
            return .success
        }
        commands.stopCommand.addTarget { _ in
            Task { @MainActor in VoicePlayer.shared.stop() }
            return .success
        }
        commands.changePlaybackPositionCommand.addTarget { event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            let position = event.positionTime
            Task { @MainActor in
                let owner = VoicePlayer.shared
                if let key = owner.currentKey { owner.seek(position, for: key) }
            }
            return .success
        }
    }

    private func updateNowPlaying() {
        let available = isMessage && player != nil
        let commands = MPRemoteCommandCenter.shared()
        commands.playCommand.isEnabled = available && !isPlaying
        commands.pauseCommand.isEnabled = available && isPlaying
        commands.togglePlayPauseCommand.isEnabled = available
        commands.stopCommand.isEnabled = available
        commands.changePlaybackPositionCommand.isEnabled = available
        guard available, let player else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }
        // The sender photo is shown at the user's request; names and transcripts stay private.
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: "Voice message",
            MPMediaItemPropertyPlaybackDuration: player.duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: player.currentTime,
            MPNowPlayingInfoPropertyPlaybackRate: player.isPlaying ? playbackRate : 0,
            MPNowPlayingInfoPropertyDefaultPlaybackRate: playbackRate
        ]
        if let artwork { info[MPMediaItemPropertyArtwork] = artwork }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        let identifier = ObjectIdentifier(player)
        Task { @MainActor [weak self] in
            guard let self, let active = self.player, ObjectIdentifier(active) == identifier else { return }
            if flag { self.stop() } else { self.fail() }
        }
    }

    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: (any Error)?) {
        let identifier = ObjectIdentifier(player)
        Task { @MainActor [weak self] in
            guard let self, let active = self.player, ObjectIdentifier(active) == identifier else { return }
            self.fail()
        }
    }
    private struct PlaybackFailure: Error { }
}
