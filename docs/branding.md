# App branding

The logo supplied on October 29, 2026 is bundled locally across the clients:

- iOS app icon: `apps/ios/Wildcard/Wildcard.icon`, copied from the supplied
  Icon Composer package, including its layer scale, appearance and material settings.
- iOS SwiftUI splash: `WildcardLaunchMark.imageset/mark.svg`, using the supplied
  transparent `wildcard_icon.svg`. Native launch uses PNG renditions of that source
  in `WildcardNativeLaunchMark.imageset`. Both screens fit the 43:40 mark into
  107.5 × 100 points on the existing blue background.
- Web sign-in and registration: `apps/web/public/icon.svg`, using the supplied
  background-inclusive icon unchanged at 64 × 64 pixels.
- Web and admin browser tabs: each app's `public/favicon.svg`, using the supplied
  favicon unchanged. Both Nuxt configurations append the first 12 characters of
  its SHA-256 digest as a version query to refresh previously cached favicons.

These are public bundled assets and require no account cache or network-backed
feature cache. When replacing the favicon, update both copies and their version
queries together. Preserve the distinct spacing of the favicon and full icon.

Static verification covers SVG/XML and JSON parsing, source equality, Icon Composer
layer references, and removal of the previous logo path. Builds, browser rendering,
and device appearance have not been verified. After installing the iOS update,
check the home-screen icon in default/dark/tinted appearances and the transition
between native launch and SwiftUI splash. After publishing web/admin, check browser
tabs and the web sign-in/registration screen in both color schemes.

## Native launch resource refresh

The native storyboard is named `WildcardLaunch.storyboard`, selected by
`UILaunchStoryboardName = WildcardLaunch` in `apps/ios/Config/Info.plist`.
SwiftUI uses the vector `WildcardLaunchMark`. The storyboard uses the separate
`WildcardNativeLaunchMark` PNG image set with original rendering, so the white
pixels do not depend on template tinting during native launch. Apple's
[TN3118](https://developer.apple.com/documentation/technotes/tn3118-debugging-your-apps-launch-screen)
specifies JPG or PNG asset catalog images for launch storyboards.

The first resource rename was followed by a device report of a blue background
without the logo. Static references were valid, but did not establish native SVG
rendering support. PNG renditions replace the native SVG dependency; the device
result still needs verification. No bundle ID or app data changes are required.

Regenerate the checked-in PNG source assets with `rsvg-convert` (macOS:
`brew install librsvg`) from the repository root:

```sh
for scale in 1 2 3; do
  rsvg-convert --width "$((215 * scale))" --height "$((200 * scale))" \
    --output "apps/ios/Wildcard/Assets.xcassets/WildcardNativeLaunchMark.imageset/mark@${scale}x.png" \
    apps/ios/Wildcard/Assets.xcassets/WildcardLaunchMark.imageset/mark.svg
done
```

The 215 × 200 point image set provides extra sampling at its displayed size of
107.5 × 100 points. All renditions preserve the source's transparent background
and white mark. Rebuild and install from Xcode, then verify a cold launch and the
transition to SwiftUI in both appearances. If launch resources remain stale, try
**Product → Clean Build Folder** and reinstall over the existing app first.
Static checks do not confirm device rendering or regeneration of launch snapshots.
