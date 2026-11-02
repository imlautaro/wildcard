import SwiftUI
import UIKit

/// Appearance preference (System, Light or Dark), stored per device in
/// UserDefaults and shared by every account on it, like the web setting
/// (`wildcard-theme` in localStorage). Applied as the windows' interface style
/// override so UIKit presentations (alerts, Safari sheets) follow it too; a
/// presentation can still force its own scheme (the image viewer stays dark).
enum AppAppearance: String, CaseIterable, Identifiable {
    case system, light, dark

    static let storageKey = "appearance"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .system: String(localized: "System", comment: "Appearance option")
        case .light: String(localized: "Light", comment: "Appearance option")
        case .dark: String(localized: "Dark", comment: "Appearance option")
        }
    }

    private var interfaceStyle: UIUserInterfaceStyle {
        switch self {
        case .system: .unspecified
        case .light: .light
        case .dark: .dark
        }
    }

    /// Overrides every window of every connected scene; `.system` clears the override.
    func apply() {
        for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
            for window in scene.windows where window.overrideUserInterfaceStyle != interfaceStyle {
                window.overrideUserInterfaceStyle = interfaceStyle
            }
        }
    }
}
