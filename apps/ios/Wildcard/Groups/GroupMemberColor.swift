import SwiftUI
import UIKit

enum GroupMemberColor {
    // Paired dark inks and light tints keep small sender labels readable on bubbles.
    private static let palette: [(light: UInt32, dark: UInt32)] = [
        (0xA12622, 0xFFABA3),
        (0x914600, 0xFFC18A),
        (0x725600, 0xE8CF78),
        (0x48651C, 0xBDD98A),
        (0x17683E, 0x8ED8AF),
        (0x006664, 0x80D8D2),
        (0x006487, 0x8BD5F2),
        (0x2456A6, 0xA8C9FF),
        (0x5843A8, 0xC9B8FF),
        (0x793699, 0xE4AEF5),
        (0x963365, 0xF6ACD0),
        (0x825044, 0xE8BDAF)
    ]

    static func color(groupID: String, identity: String) -> Color {
        // A fixed hash gives a random-looking assignment that survives app launches,
        // renames, membership changes and history pagination without stored state.
        let hash = "\(groupID)/\(identity)".utf8.reduce(UInt64(14695981039346656037)) {
            ($0 ^ UInt64($1)) &* 1099511628211
        }
        let pair = palette[Int(hash % UInt64(palette.count))]
        return Color(uiColor: UIColor { traits in
            let rgb = traits.userInterfaceStyle == .dark ? pair.dark : pair.light
            return UIColor(red: CGFloat((rgb >> 16) & 0xFF) / 255,
                           green: CGFloat((rgb >> 8) & 0xFF) / 255,
                           blue: CGFloat(rgb & 0xFF) / 255, alpha: 1)
        })
    }
}
