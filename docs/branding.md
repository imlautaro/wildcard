# App branding

The logo supplied on October 29, 2026 is bundled locally across the clients:

- iOS app icon: `apps/ios/Wildcard/Wildcard.icon`, copied from the supplied
  Icon Composer package, including its layer scale, appearance and material settings.
- iOS SwiftUI splash: `WildcardLaunchMark.imageset/mark.svg`, using the transparent
  `isotype.svg` export supplied after the native launch issue. Native
  launch uses PNG renditions of that source in `apps/ios/Wildcard/LaunchResources`.
  Both screens fit the 56:53 mark into approximately 105.66 × 100 points on the
  existing blue background.
- Web sign-in and registration: `apps/web/public/icon.svg`, using the supplied
  background-inclusive icon unchanged at 64 × 64 pixels.
- Web and admin browser tabs: each app's `public/favicon.svg`, using the supplied
  favicon unchanged. The web favicon was replaced with the October 30, 2026
  supplied file at the user’s web-only request; admin retains the prior favicon.
  Both Nuxt configurations append the first 12 characters of
  its SHA-256 digest as a version query to refresh previously cached favicons.

These are public bundled assets and require no account cache or network-backed
feature cache. For a shared favicon refresh, update both copies and their version
queries together; honor an explicitly web-only or admin-only request. Preserve the distinct spacing of the favicon and full icon.

Static verification covers SVG/XML and JSON parsing, source equality, Icon Composer
layer references, and removal of the previous logo path. Builds, browser rendering,
and device appearance have not been verified. After installing the iOS update,
check the home-screen icon in default/dark/tinted appearances and the transition
between native launch and SwiftUI splash. After publishing web/admin, check browser
tabs and the web sign-in/registration screen in both color schemes.

## Native launch resource refresh

The native storyboard is named `WildcardLaunch.storyboard`, selected by
`UILaunchStoryboardName = WildcardLaunch` in `apps/ios/Config/Info.plist`.
SwiftUI uses the vector `WildcardLaunchMark`. The storyboard references
`WildcardLaunchIsotype.png` directly in the app bundle, with 1x/2x/3x PNG resources
under `apps/ios/Wildcard/LaunchResources`. Xcode's synchronized app group copies
these resources into the bundle. The native image uses its original white pixels
on transparency and does not depend on template tinting or asset catalog lookup.

The previous catalog-based PNG fix still displayed only blue on the user's
physical device after uninstalling and cleaning the build folder. Inspection of
that existing device build confirmed the correct Info.plist key, compiled
storyboard, PNG catalog rendition and image reference. Missing source files and
an outdated launch key did not explain that build. The precise runtime cause
remains unconfirmed. On October 29, 2026, the user confirmed that direct bundle
loading displays the native launch logo successfully.

The user supplied a new `isotype.svg` export with a 56:53 canvas. It is retained
as `WildcardLaunchMark.imageset/mark.svg` and is the source for both native PNGs
and the SwiftUI splash. The Icon Composer app icon and web assets are unchanged.
Regenerate the checked-in PNG source assets with `rsvg-convert` (macOS:
`brew install librsvg`) from the repository root:

```sh
for scale in 1 2 3; do
  suffix="@${scale}x"
  if [ "$scale" -eq 1 ]; then suffix=""; fi
  rsvg-convert --width "$((112 * scale))" --height "$((106 * scale))" \
    --output "apps/ios/Wildcard/LaunchResources/WildcardLaunchIsotype${suffix}.png" \
    apps/ios/Wildcard/Assets.xcassets/WildcardLaunchMark.imageset/mark.svg
done
```

All renditions preserve the transparent background and white mark. The layout
keeps the mark 100 points high at the source aspect ratio. The user confirmed
the native logo appears after this change. No build or Simulator run was performed
by the coding agent. Both color appearances, supported orientations, and transition
alignment have not been independently verified.
