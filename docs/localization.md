# Localization

The iOS app, the web app and the marketing site ship in **English** (default and
fallback) and **Spanish**. Spanish is neutral Latin American Spanish with "tú".
English text is the source; any string missing from Spanish falls back to English.

| Client | Mechanism | Language choice | Messages |
|---|---|---|---|
| iOS (`apps/ios`) | String Catalogs (`.xcstrings`), English text as key | iOS per-app language (Settings › Wildcard › Language), otherwise the device's preferred languages | `Localizable.xcstrings` per target, `InfoPlist.xcstrings` |
| Web (`apps/web`) | `@nuxtjs/i18n` 10 (vue-i18n 11), structured keys, no URL prefix | Account › Language: System (browser languages), English or Español; per browser | `apps/web/i18n/locales/<locale>/<area>.json` |
| Site (`apps/site`) | `@nuxtjs/i18n`, `/` English, `/es` Spanish, both prerendered | Language links in the footer; a first visit to `/` redirects once by browser language (cookie `wildcard_site_locale`) | `apps/site/i18n/locales/<locale>.json`; see [site](site.md#localization) |

The admin panel (`apps/admin`) stays English only.

## What is not localized

Text produced by the server or the model is not translated by the clients:

- API error messages that clients show verbatim (`{ "error": "…" }` passed through
  `serverMessage` on web and the matching iOS mapping). Client-side fallback errors
  are localized.
- Push notification and Web Push payload text built by the API, email text, and
  membership/system text the API stores as message content.
- Messages, posts, comments, documents, tasks, mini app definitions and anything
  else written by contacts or people. Contacts already reply in the language chosen
  at [onboarding](onboarding.md) or requested in the conversation; that preference is
  independent of the interface language.

Two chat-list cases are handled anyway:

- **Group activity line.** Group summaries now include `replyActivityEntries`
  (`[{ name, activity }]`, or `null`) next to the English `replyActivity` sentence.
  Current clients word the line themselves with the same rules ("Ana y Bo están
  escribiendo...": web `useReplyActivityLabel.ts`, iOS `ReplyActivityLabel.swift`).
  Older clients keep showing `replyActivity`, so the change is additive and needs no
  migration.
- **Previews the API words in English.** For non-text messages the API stores a
  fixed English label in the same `lastMessageText`/`lastMessagePreview` field as
  real text: `Voice message`, `Scheduled message`, `Group response`, `Working on a
  task`, `Sticker <emoji>`, `Attachment: <name>` and `<n> photos`. Both clients
  translate exactly those labels when displaying the row (web
  `utils/serverPreview.ts`, iOS `ServerPreviewText`) and pass anything else through.
  A message a person literally typed as one of those labels also shows translated in
  the list preview only. Comparisons against the API values (ContactsStore,
  GroupsAPI) keep using the English text.
- **Group join banners** are rebuilt by both clients from the structured `event`
  field (web `pages/groups/[id]/index.vue`, iOS `GroupChatView.eventText`); when a
  referenced member is no longer in the group they fall back to the API's English
  text.

## iOS

- `LOCALIZATION_PREFERS_STRING_CATALOGS = YES`; the project's `knownRegions`
  include `es`, and every target (app, widgets, share and notification service
  extensions) has `SWIFT_EMIT_LOC_STRINGS = YES`, so Xcode extracts new SwiftUI
  literals and `String(localized:)` calls into that target's catalog on each build.
- One `Localizable.xcstrings` per target folder: `Wildcard/`, `WildcardWidgets/`,
  `WildcardShare/`, `WildcardNotificationService/`. `WildcardNativeShared/` has no
  catalog of its own because it is compiled into all four targets (two catalogs with
  the same table name in one target would collide); its strings live in each
  target's catalog. `InfoPlist.xcstrings` in `Wildcard/` and
  `WildcardNotificationService/` translates the privacy usage descriptions.
- SwiftUI literals (`Text("Save")`, `Button`, `Label`, `.navigationTitle`,
  `.accessibilityLabel`, alerts…) are localized automatically. Strings typed as
  `String` that reach the screen (errors, option tables, built labels) use
  `String(localized:)` where the English is written. `Text(verbatim:)` and
  `Text(someString)` never localize: use them only for user, server or AI content.
- Interpolations become format specifiers (`"\(count) photos"` → `%lld photos`).
  Spanish values with two or more specifiers use positional specifiers (`%1$@`).
  Count-driven nouns use plural variations in the catalog (English variants too, so
  "1 photo" is singular). Name lists use `formatted(.list(type: .and))`; dates and
  numbers use `FormatStyle`, which follows the app language.
- Language choice: Apple's per-app language. Account › Language shows the current
  app language and opens the app's page in Settings, where iOS lists English and
  Español. There is no in-app override, so widgets, extensions, system dialogs and
  App Intents always agree with the app.
- `AppShortcuts.xcstrings` (in `Wildcard/`) holds the Siri/Shortcuts phrases, and
  the two App Intent parameter summaries (`Open ${contact}`, `Draft ${text} to
  ${contact}`) were added to the app catalog by hand because the command-line
  compiler does not emit them. Their key format is unverified until an Xcode build:
  if Xcode marks those entries stale and adds differently spelled keys, move the
  Spanish values over.
- The catalogs were generated from the compiler's extracted keys
  (`swiftc -emit-localized-strings`), so every key matches the source exactly;
  Xcode reformats them on its next build.

Adding iOS copy: write the English literal (or `String(localized:)`), build once in
Xcode so the catalog gains the key, and add the Spanish value in the catalog editor
(state *Translated*). Keys whose English changes become new keys; remove stale
ones when Xcode marks them.

## Web

- `apps/web/nuxt.config.ts` registers `@nuxtjs/i18n` with `strategy: 'no_prefix'`,
  default/fallback `en`, and one message file per area and locale (`common`,
  `errors`, `auth`, `account`, `contacts`, `chat`, `groups`, `updates`, `miniapps`).
  Each file's top-level key is its area, so keys read `chat.composer.placeholder`.
- `app/plugins/locale.ts` runs before the first render: it resolves the
  preference, loads the locale, keeps `<html lang>` current through the head manager,
  binds the global composer for `translate()`, and feeds the shared UI layer's
  built-in strings (`useUiStrings`, below). With System selected, a browser language
  change applies live.
- `useLanguage()` stores the preference in `localStorage` (`wildcard-language`:
  absent = System, `en`, `es`). Like Appearance it is per browser, not per account:
  it survives sign-out and never resets with the session. System picks the first
  browser language the app supports, else English (the same rule iOS applies).
- Components use `useI18n()` / `$t`. Code outside component setup (utils, stores,
  error mapping, callbacks after an `await`) uses `translate()` from
  `app/utils/i18n.ts`, always inside a function, never at module scope.
  `appLocale()` feeds every `Intl` formatter and UI collation; `nameList()` joins
  names. Dates in `utils/format.ts` follow the app language, not the raw browser
  locale.
- Messages follow vue-i18n syntax: `{name}` interpolation, `a | b` plural branches
  (same count in every locale), `{'@'}` for a literal `@`, no HTML (use `<i18n-t>`).

## Writing Spanish copy

- Neutral Latin American Spanish with "tú": imperatives such as "Elige", "Revisa",
  "Inténtalo de nuevo"; buttons in the infinitive ("Guardar", "Eliminar chat").
- Avoid gendering the user or a contact: "Te damos la bienvenida", invariable
  adjectives or nouns ("Paciente", "Formal", "Calma").
- Keep placeholders, the ellipsis character and brand/model names (Wildcard, Meta,
  Muse Spark, Contributor, MCP) exactly; Standard is "Estándar".
- The same English string reads the same in Spanish on every client.

| English | Spanish |
|---|---|
| contact / chat / group / member | contacto / chat / grupo / miembro |
| For you / post / comment | Para ti / publicación / comentario |
| mini app / sticker / task / document | miniapp / sticker / tarea / documento |
| connection / connector | conexión / conector |
| personality / energy / initiative / memory | personalidad / energía / iniciativa / memoria |
| scheduled message / voice message | mensaje programado / mensaje de voz |
| Keep this chat private | Mantener este chat privado |
| Contacts share with each other | Los contactos comparten entre sí |
| Appearance / Language / Account | Apariencia / Idioma / Cuenta |
| Sign in / Sign out / Create account | Iniciar sesión / Cerrar sesión / Crear cuenta |
| Done / Retry / Try again / Add | Listo / Reintentar / Intentar de nuevo / Añadir |

## Shared UI layer

`packages/ui` has no i18n dependency. Its few built-in strings (sheet close button,
select search and empty result, notice dismiss, search clear, password show/hide, default loading label)
come from `useUiStrings()`, English by default. The web plugin replaces them on each
locale change; the admin panel keeps English.

## Validation

- `node scripts/check-locales.mjs` checks the web app and the site: identical key
  sets per locale, every message compiles, placeholders and plural branches match
  English, and every literal key used in the source exists.
- `npm run typecheck:web` / `npm run typecheck:site`.
- iOS: the static Swift typecheck, and the String Catalog editor's coverage
  column after an Xcode build (Spanish should read 100%).

Device checks (not proven by static checks): on iOS set Settings › Wildcard ›
Language › Español and walk onboarding, chats, a group, For you, mini apps, Account
and a widget; on web choose Account › Language › Español, then System with a Spanish
browser, and confirm dates, plurals, the group typing line and error fallbacks.

## Caching

Translations are bundled with each client; nothing is fetched from the API. The web
loads a locale's message chunk once per page load. The language preference is a
non-private device setting and is not cleared on sign-out.
