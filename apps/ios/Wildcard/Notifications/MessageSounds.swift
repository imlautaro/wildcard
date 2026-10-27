import AudioToolbox
import UIKit

@MainActor
final class MessageSounds {
    static let shared = MessageSounds()
    var visibleContactID: String?
    private(set) var userID: String?
    private var activeSince: Date?
    private var receivedIDs: Set<String> = []
    private var sentIDs: Set<String> = []
    private var sounds: [String: SystemSoundID] = [:]

    func activate(userID: String?) {
        if self.userID != userID {
            receivedIDs.removeAll()
            sentIDs.removeAll()
            visibleContactID = nil
        }
        self.userID = userID
        if activeSince == nil { activeSince = .now }
    }

    func deactivate() { activeSince = nil }

    func reset() {
        userID = nil
        activeSince = nil
        visibleContactID = nil
        receivedIDs.removeAll()
        sentIDs.removeAll()
    }

    func sent(turnID: String, contactID: String) {
        guard sentIDs.insert(turnID).inserted, visibleContactID == contactID else { return }
        play("mixkit-hard-pop-click-2364")
    }

    func received(turnID: String, contactID: String, userID: String, completedAt: Date) {
        guard self.userID == userID, let activeSince,
              UIApplication.shared.applicationState == .active,
              completedAt >= activeSince,
              receivedIDs.insert(turnID).inserted else { return }
        play(visibleContactID == contactID ? "mixkit-hard-pop-click-2364" : "mixkit-alert-quick-chime-766")
    }

    private func play(_ name: String) {
        guard userID != nil, activeSince != nil, UIApplication.shared.applicationState == .active else { return }
        if sounds[name] == nil {
            guard let url = Bundle.main.url(forResource: name, withExtension: "wav") else { return }
            var sound: SystemSoundID = 0
            guard AudioServicesCreateSystemSoundID(url as CFURL, &sound) == kAudioServicesNoError else { return }
            sounds[name] = sound
        }
        if let sound = sounds[name] { AudioServicesPlaySystemSound(sound) }
    }
}
