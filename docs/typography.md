# Typography

The iOS app bundles the Manrope variable TrueType font from
[Google Fonts](https://github.com/google/fonts/tree/main/ofl/manrope), with its
SIL Open Font License in `apps/ios/Wildcard/Fonts/OFL.txt`. No runtime font download
or access to the archived project is required.

`Config/Info.plist` registers `Manrope.ttf` through `UIAppFonts`. The Xcode app's
synchronized source folder includes the font as a resource; the Info.plist lives
outside that folder to avoid copying it as a regular resource. Generated app
metadata is merged with this plist in Debug and Release. The API URL is an explicit
`WildcardAPIURL` entry referencing `$(WILDCARD_API_URL)` in the same source plist.

`AppTypography` uses the font's actual PostScript name `Manrope-ExtraLight` and
sets the variable `wght` axis explicitly (400 regular through 800 extra bold).
Use `.manrope(.body)` or `.manrope(.largeTitle, weight: .bold)` for new SwiftUI
styles. The root view supplies the default body face; explicit title and footnote
styles use the same helper. SF Symbols remain system-rendered icons.

SwiftUI uses `ScaledMetric` relative to each semantic text style. Native navigation
titles and bar buttons use `UIFontMetrics`, with appearance configuration refreshed
when Dynamic Type changes. No font is installed globally on the device.

During implementation the font metadata, plist registration, and Swift types were
checked statically. No iOS build, simulator, or visual/device test was run.
