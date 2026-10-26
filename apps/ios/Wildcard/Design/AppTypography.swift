import CoreText
import SwiftUI
import UIKit

enum AppTypography {
    enum Weight: CGFloat {
        case regular = 400
        case medium = 500
        case semibold = 600
        case bold = 700
        case extraBold = 800
    }

    static func font(size: CGFloat, weight: Weight) -> UIFont {
        let descriptor = UIFontDescriptor(name: "Manrope-ExtraLight", size: size)
            .addingAttributes([
                UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String):
                    [NSNumber(value: 0x77676874): weight.rawValue]
            ])
        return UIFont(descriptor: descriptor, size: size)
    }

    static func metrics(for style: Font.TextStyle) -> (size: CGFloat, uiStyle: UIFont.TextStyle) {
        switch style {
        case .largeTitle: (34, .largeTitle)
        case .title: (28, .title1)
        case .title2: (22, .title2)
        case .title3: (20, .title3)
        case .headline: (17, .headline)
        case .subheadline: (15, .subheadline)
        case .body: (17, .body)
        case .callout: (16, .callout)
        case .footnote: (13, .footnote)
        case .caption: (12, .caption1)
        case .caption2: (11, .caption2)
        @unknown default: (17, .body)
        }
    }

    static func configureNavigation() {
        let appearance = UINavigationBarAppearance()
        appearance.titleTextAttributes = [.font: scaledFont(.headline, weight: .semibold)]
        appearance.largeTitleTextAttributes = [.font: scaledFont(.largeTitle, weight: .bold)]
        let navigationBar = UINavigationBar.appearance()
        navigationBar.standardAppearance = appearance
        navigationBar.scrollEdgeAppearance = appearance
        navigationBar.compactAppearance = appearance
        navigationBar.compactScrollEdgeAppearance = appearance
        // Appearance proxies style new bars; update existing bars for Dynamic Type.
        for scene in UIApplication.shared.connectedScenes {
            guard let windowScene = scene as? UIWindowScene else { continue }
            for window in windowScene.windows {
                updateNavigationBars(in: window, appearance: appearance)
            }
        }
        for state: UIControl.State in [.normal, .highlighted, .disabled] {
            UIBarButtonItem.appearance().setTitleTextAttributes(
                [.font: scaledFont(.body, weight: .regular)], for: state
            )
        }
    }

    private static func updateNavigationBars(in view: UIView, appearance: UINavigationBarAppearance) {
        if let bar = view as? UINavigationBar {
            bar.standardAppearance = appearance
            bar.scrollEdgeAppearance = appearance
            bar.compactAppearance = appearance
            bar.compactScrollEdgeAppearance = appearance
            for item in bar.items ?? [] {
                let buttons = (item.leftBarButtonItems ?? []) + (item.rightBarButtonItems ?? [])
                    + [item.backBarButtonItem].compactMap { $0 }
                for button in buttons {
                    for state: UIControl.State in [.normal, .highlighted, .disabled] {
                        button.setTitleTextAttributes([.font: scaledFont(.body, weight: .regular)], for: state)
                    }
                }
            }
        }
        for child in view.subviews { updateNavigationBars(in: child, appearance: appearance) }
    }

    private static func scaledFont(_ style: Font.TextStyle, weight: Weight) -> UIFont {
        let metrics = metrics(for: style)
        return UIFontMetrics(forTextStyle: metrics.uiStyle)
            .scaledFont(for: font(size: metrics.size, weight: weight))
    }
}

private struct ManropeFont: ViewModifier {
    @ScaledMetric private var size: CGFloat
    let weight: AppTypography.Weight

    init(style: Font.TextStyle, weight: AppTypography.Weight) {
        _size = ScaledMetric(wrappedValue: AppTypography.metrics(for: style).size, relativeTo: style)
        self.weight = weight
    }

    func body(content: Content) -> some View {
        content.font(Font(AppTypography.font(size: size, weight: weight)))
    }
}

extension View {
    func manrope(_ style: Font.TextStyle = .body, weight: AppTypography.Weight = .regular) -> some View {
        modifier(ManropeFont(style: style, weight: weight))
    }
}
