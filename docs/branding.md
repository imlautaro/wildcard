# App branding

The logo supplied on October 29, 2026 is bundled locally across the clients:

- iOS app icon: `apps/ios/Wildcard/Wildcard.icon`, copied from the supplied
  Icon Composer package, including its layer scale, appearance and material settings.
- iOS native launch and SwiftUI splash: `SplashMark.imageset/mark.svg`, using the
  supplied transparent `wildcard_icon.svg`. Both screens fit the 43:40 mark into
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
