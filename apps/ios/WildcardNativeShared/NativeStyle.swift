import SwiftUI

// Shared visual vocabulary for native tools in the app, widgets and Live Activities.
// Extensions do not bundle Manrope or the asset catalog, so colors are literal here.
nonisolated enum NativeStyle {
    static let accent = Color(red: 4 / 255, green: 93 / 255, blue: 227 / 255)

    static func symbol(for kind: String) -> String {
        switch kind {
        case "focus": "scope"
        case "recipe": "fork.knife"
        case "timer": "timer"
        case "alarm": "alarm.fill"
        case "calendar": "calendar"
        case "reminder": "checklist"
        case "location_reminder": "mappin.and.ellipse"
        case "speech": "speaker.wave.2.fill"
        default: "iphone"
        }
    }

    static func tint(for kind: String) -> Color {
        switch kind {
        case "focus": .indigo
        case "recipe": .orange
        case "timer", "alarm": Color(red: 1, green: 0.58, blue: 0)
        case "calendar": .red
        case "reminder": accent
        case "location_reminder": .green
        case "speech": .purple
        default: accent
        }
    }

    static func remaining(_ seconds: Double) -> String {
        Duration.seconds(max(0, seconds.rounded())).formatted(.time(pattern: seconds >= 3600 ? .hourMinuteSecond : .minuteSecond))
    }
}

/// Rounded tile with a white symbol, after Settings-style icons.
struct NativeGlyph: View {
    let kind: String
    var size: CGFloat = 28
    var symbol: String? = nil

    var body: some View {
        Image(systemName: symbol ?? NativeStyle.symbol(for: kind))
            .font(.system(size: size * 0.5, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(NativeStyle.tint(for: kind).gradient, in: RoundedRectangle(cornerRadius: size * 0.27, style: .continuous))
            .accessibilityHidden(true)
    }
}
