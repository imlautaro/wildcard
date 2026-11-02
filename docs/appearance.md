# Appearance (System, Light, Dark)

Both clients let the user pick the app theme regardless of the system setting.
**Account → Appearance** offers **System** (default, follows the device), **Light**
and **Dark**. The choice applies immediately. The **Language** row next to it is
described in [localization](localization.md).

## Storage and scope

The preference is a device setting, not an account setting: nothing is sent to the
API, it survives sign-out and applies to every account on that device or browser.
It contains no private data, so no retention decision or account isolation is needed.

| Client | Where | Value |
| --- | --- | --- |
| iOS | `UserDefaults` key `appearance` (`@AppStorage`) | `system`, `light`, `dark` |
| Web and admin | `localStorage` key `wildcard-theme` | `light` or `dark`; System removes the key |

## iOS

`Design/AppAppearance.swift`. `WildcardApp` reads the stored value and sets
`overrideUserInterfaceStyle` on every window of every connected scene (`.unspecified`
for System), on launch, on every change and whenever the scene becomes active.
Using the window override (rather than `preferredColorScheme` at the root) keeps
UIKit presentations such as alerts and Safari sheets in the chosen theme, and
resets cleanly to System. Presentations that force a scheme keep doing so (the
full-screen image viewer stays dark). The picker is a menu `Picker` row in the
Account form. The share extension, widgets and notification service run in their
own processes and keep following the system.

## Web (and admin)

The layer `packages/ui` owns it so both browser apps share one implementation:

- `app/utils/theme.ts` holds an inline script that `nuxt.config.ts` puts in `<head>`.
  It runs before the first paint, resolves the preference to
  `<html data-theme="light|dark">` (System uses `prefers-color-scheme` and keeps
  listening for changes), mirrors the preference in `data-theme-preference`, and
  creates its own `color-scheme` and `theme-color` `<meta>` tags. Those tags stay
  out of Nuxt's head manager on purpose: it reset their content after hydration.
  Other tabs follow through the `storage` event.
- `app/composables/useTheme.ts` exposes `preference` and `setPreference()`;
  `app/plugins/theme.client.ts` runs the script if it was not emitted and syncs the
  preference state across tabs.
- Dark styles key off `:root[data-theme="dark"]`, never
  `@media (prefers-color-scheme: dark)`: the dark color roles in `tokens.css`, the
  dark pane hairline in both apps' `main.css`, group sender names, reply quotes and
  update-card accents. New dark rules must use the same selector, or they will
  ignore an explicit Light or Dark choice. In scoped Vue styles,
  `:root[data-theme="dark"] .x` compiles to `:root[data-theme="dark"] .x[data-v-…]`
  (checked with `compileStyle`).
- The web app shows the picker as an Account row that opens a sheet of radio
  choices. The admin panel has no picker; it follows System, or a choice made in the
  web app on the same origin (separate origins keep separate storage).

## Verification

- iOS: whole-app `swiftc -typecheck` passes. Device behavior (switching while
  running, sheets and alerts, returning to System, relaunch) is unverified.
- Web: `typecheck:web` and `typecheck:admin` pass. On `nuxt dev` with headless
  Chrome, the resolved theme, body background, `--md-surface`, `theme-color` and
  `color-scheme` were correct for System with OS dark, Light with OS dark, Dark with
  OS light, System with OS light, and a live OS switch to dark while on System
  (2026-10-31). The Account sheet itself was not rendered (it needs a signed-in
  session); the admin panel was not loaded.
