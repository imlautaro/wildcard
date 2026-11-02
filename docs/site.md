# Marketing site

Automatic builds use the [dependency-specific watch paths](infrastructure.md#build-watch-paths)
recorded in [workers-build-paths.json](workers-build-paths.json). Keep root `/` and
include the shared Nuxt layer `packages/ui/*` alongside this app and root build
inputs. Preview builds remain disabled.

`apps/site` is the public marketing website: one long landing page, in English at `/`
and Spanish at `/es` (see [Localization](#localization)), that presents what is
unique about Wildcard (independent contacts with their own memory, initiative,
sharing, groups, For you, per-contact connectors, open source and self-hosting) with
animated scenes built in HTML, CSS and JavaScript. It has no API
access, no account state and no network-backed data, so the session caching rules
in [caching](caching.md) don't apply: every page is static.

The footer and Open source section link to the published documentation in the
current language (`/en` or `/es`). Set the documentation origin in `site.docsUrl`
in `app/utils/site.ts` for an independent installation.

## Structure

| Path | Contents |
| --- | --- |
| `nuxt.config.ts` | Extends the [design system layer](design-system.md) (`../../packages/ui`), adds site-only icons to the bundle, configures `@nuxtjs/i18n`, prerenders every page. |
| `app/utils/site.ts` | Installation-specific values: the site's own URL (`url`, used for canonical and hreflang links), web app URL, repository URL, `repositoryPublic`, `iosUrl`, section anchors. |
| `i18n/locales/<locale>.json`, `i18n/i18n.config.ts` | All copy, one file per locale; vue-i18n options (English fallback). |
| `app/app.vue` | Per-locale head: title, description, Open Graph, `<html lang>`, hreflang, canonical. |
| `app/components/LanguageSwitch.vue` | Language links in the footer. |
| `app/utils/cast.ts` | The example contacts, their unified cartoon portraits and their Create anyone style variants. |
| `app/utils/siteIcons.ts` | Solar and `logos` glyphs outside the shared registry, rendered with `SiteIcon`. |
| `app/composables/useScene.ts` | The scene timeline: beats with delays, play while visible, pause off screen, loop, final state for SSR and reduced motion. |
| `app/plugins/reveal.client.ts` | Fade-in on scroll for `.reveal` elements (marked with `data-in`). |
| `app/components/*Scene.vue`, `MoreGrid.vue` | The animated scenes. `ContactAvatar.vue` shows the example portraits from `public/contacts/`. |
| `app/assets/css/site.css` | Marketing layout and the chat vocabulary shared with the web app (bubbles, typing dots, banners). |

The site reuses the layer's tokens, Manrope, Solar icons, `AppButton`, `AppIcon`,
`.chip`, `.avatar`, `.badge` and `details` styles, and copies the web app's bubble
rules, so a design-system change shows up here too. Avoid class names the layer
already uses (for example `.center`, `.meter`, `.field`); `site.css` documents the
rule. Dark styles use `:root[data-theme="dark"]` like the apps; the footer
carries the System/Light/Dark switch (stored per browser under
`wildcard-theme`, on the site's own origin).

### Scenes and motion

Each scene is a list of beats driven by `useScene`. The server renders the final
beat, so the prerendered HTML (and a browser without JavaScript) shows the whole
story. In the browser, a scene that starts off screen resets and plays when it
enters the viewport; it pauses off screen and loops while visible. Leaving during
a loop fade clears the fade and resets the scene so it cannot stay transparent. With
`prefers-reduced-motion: reduce` scenes stay on their final beat, reveals start
visible and CSS animations stop on their last frame. Scroll reveals observe new
page elements after both initial mounting and client navigation, including locale
changes. Sections are visible by default; the finite entrance animation runs only
after observation, so missing initialization cannot leave the page hidden. Never add `.reveal`-style
classes from plain DOM code to an element with a `:class` binding: Vue rewrites
the attribute and drops them (use an attribute instead, as the reveal plugin does).

Chat scenes use `useChatScene` to insert a typed draft, a send-button press and
then the outgoing bubble before continuing the original story beats. Each phone
has its own composer; draft text uses the same localized message as the bubble.
These beats share `useScene` visibility and reduced-motion behavior; final states
show the complete conversation with empty composers.

### Example portraits

The six example contacts use a single Cartoon art direction across the site:
clean outlines, rounded shapes, flat warm colors and pale cream backgrounds.
These portraits live in `apps/site/public/contacts/cartoon/`. The **Create anyone**
scene alone uses the original style examples in `public/contacts/`: Cartoon (Mila),
Realistic people (Theo), 3D animated movie (Ivy), Custom "retro video game robots"
(Pixel), Anime (Nova) and 3D animated pets (Coco). `ContactAvatar` defaults to the
unified set; only `CreatorScene` requests `showcase` portraits. Names, roles and
character identities remain the same across scenes.

Both sets use the app's real portrait generator,
`apps/api/src/contacts/portrait.ts` (Meta `muse-image-1.0` with the same style prompts
and request options as contact creation). Appearance and personality text are
hand-written for these fictional examples; in the app, Muse Spark writes that
text. Generated images are resized to 384 px JPEGs.

To regenerate or add one, edit the `cast` list in
`apps/site/scripts/generate-portraits.mjs` and run
`node apps/site/scripts/generate-portraits.mjs [id …]` from the repository root.
This generates the unified cartoon set. Use `--showcase` to regenerate the
Create anyone variants in their individual styles. The script reads `META_API_KEY`
from `apps/api/.dev.vars` without printing it, bundles the generator with esbuild
(stubbing `cloudflare:workflows`), calls the paid image API once per portrait and
resizes with macOS `sips`. Set `PORTRAITS_OUT` to try a prompt without replacing the
site's files. Generation failures return a nonzero exit code. Add new contacts and
both portrait paths to `app/utils/cast.ts`.

### Sticker and chat-image examples

`MoreGrid` uses generated assets in `apps/site/public/features/`, rather than avatar
circles or gradient placeholders. The sticker tile shows Coco and Pixel expression
cutouts with real alpha transparency. Pictures and selfies shows Ivy in a park,
Mila at a cafe and an illustrated bakery. Selfies use the unified cartoon avatars
as identity references; all subjects are fictional and images are generated scenes.

Run `node apps/site/scripts/generate-feature-assets.mjs [asset-id …]` to regenerate
these examples. IDs are `coco-sticker`, `pixel-sticker`, `ivy-selfie`, `mila-selfie`
and `bakery`. It reads the same local `META_API_KEY` as the portrait script and
calls paid Meta APIs; `FEATURE_ASSETS_OUT` can redirect the output. Generate the
cartoon portraits first. Sticker generation uses the app's `photoShowsFace`,
`expressionImage` (Muse Image), and `cutout` (SAM 3.1) helpers, including the default
subject fallback and PNG encoding. Chat images use the exact `requestImage` helper
from `photos/generation.ts`, exposed only in the temporary esbuild bundle, with
portrait framing and avatar references for selfies. No provider requests are
reimplemented and no production chats, D1 records or R2 objects are created. The
script saves the actual transparent PNGs and resizes JPEG images to 640 px with
macOS `sips`; failures return a nonzero exit code. These are static local assets,
loaded lazily by the cards, with no runtime model calls.

## Localization

The site uses `@nuxtjs/i18n` with the `prefix_except_default` strategy: English
(`en`, `lang="en-US"`) is the default at `/`, Spanish (`es`) lives at `/es`. Both are
prerendered (`nitro.prerender.routes`); `autoSubfolderIndex: false` emits `es.html`, so
the Worker's `auto-trailing-slash` asset handling serves `/es` itself instead of
redirecting it to `/es/`. Each page carries absolute hreflang alternates (`en`,
`en-US`, `es`, `x-default`), a canonical URL and `og:locale` built from `site.url`
(`i18n.baseUrl`). Section links use `localePath('/')`, so they become `/es#memory` on
the Spanish page; links to the web app and the repository are the same in every
language. The 404 page is a client-rendered shell and follows the URL's locale.

- **Switcher:** the footer lists English and Español with `aria-current` on the
  current one. The top bar has no language or appearance selectors. Each
  link carries `lang` and `hreflang`, and is a plain prerendered link, so it works
  without JavaScript.
- **Browser language:** `detectBrowserLanguage` redirects a first visit to `/` once,
  in the browser (the site is static, so there is no server redirect), to `/es` when
  the browser prefers Spanish. Visiting a locale or using the switcher stores it in
  the `wildcard_site_locale` cookie on the site's origin, and the root then follows
  the cookie. During that redirect Vue reports a hydration mismatch in the console
  (the English HTML hydrates in Spanish just before navigating); it has no visible
  effect.
- **Messages:** `apps/site/i18n/locales/en.json` and `es.json`, keyed by section and
  scene. To add a string, add the same key to both files and use `t('key')` in the
  component (inside `computed` for data arrays, so a language switch re-renders the
  nav and footer, which don't remount). Messages contain no HTML: for emphasis or
  links inside a sentence, use `<i18n-t keypath="…">` with named slots. Escape
  `@ { } |` as `{'@'}`. Names of the example contacts, brands, model names and
  terminal commands stay untranslated.
- **Spanish copy** follows the same copy rules below and the conventions in
  [localization](localization.md): neutral Latin American Spanish with "tú".
- **Validation:** `node scripts/check-locales.mjs apps/site` (key parity, message
  syntax, placeholders, unknown keys) and `npm run typecheck:site`.

## Copy rules

The copy must stay true to the feature guides. They apply to every language. Notable limits it respects:

- Initiative is for private chats, stops after one unanswered spontaneous message,
  and can be turned off per contact ([initiative](initiative.md)).
- Timers and alarms on another person's phone need an iPhone whose owner allowed
  that participant ([native remote](native-remote.md)); sharing alone grants nothing.
- Private context reaches a group only through the opt-in "Discuss my private chats"
  ([privacy](privacy.md)); "Catch me up" needs linked contacts or "Contacts share
  with each other".
- Connector chats are isolated from shared memory ([connectors](connectors.md)).
- "Retro video game robots" is an example of the Custom style, not a built-in style
  ([contact generation](contact-generation.md)).
- Voices use ElevenLabs, so the Meta section lists only the Meta models in use.
- Brand marks: Meta `logos:meta-icon`, Apple `logos:apple` and ElevenLabs
  `simple-icons:elevenlabs` (single-color marks take the text color via `.mono`).

## Local development

```sh
npm ci
npm run dev:site        # http://localhost:3002
npm run typecheck:site
npm run build:site      # nuxt generate → apps/site/.output/public
npm run preview --workspace @wildcard/site   # serves the build with wrangler dev on :3003
```

## Deployment

See [Marketing site Worker](infrastructure.md#marketing-site-worker). The site is a
static-assets-only Worker (`wildcard-site`) released by its own Workers Builds
project; it needs no binding, secret or migration.

## Verification

November 1, 2026 (localization): `node scripts/check-locales.mjs apps/site` and
`npm run typecheck:site` pass. `npm run build:site` prerendered `index.html` and
`es.html` with the expected `lang`, hreflang, canonical, title and description; the
English page's visible text matched the previous build except for the language
switcher. Under `wrangler dev`, `/` and `/es` answer 200 and `/es/` redirects to `/es`.
In headless Chrome: no console errors on `/` or `/es` (390 px to 1280 px, no
horizontal overflow, the nav fits from 900 px), the switcher moves between locales
and sets the cookie, a Spanish browser is redirected from `/` to `/es` (with the
hydration warning described above), and a stored English choice is kept.

November 1, 2026: `npm run typecheck:site` passes. The page ran under `nuxt dev` and
was captured in headless Chrome at 1280 px and 390 px, light and dark, with reduced
motion (final states) and with motion (memory and group scenes mid-animation and
looping): no console errors and no horizontal overflow at 390 px. `npm run build:site`
prerendered the page and `wrangler dev` served it with the Worker configuration (200
for `/`, 404 page for unknown paths, production hydration without console errors).
The existing Worker was connected to Workers Builds through the dashboard on
November 1, 2026, with production builds enabled for `imlautaro/wildcard` / `main`,
the documented commands, root `/`, previews disabled and build caching enabled.
Cloudflare reports that the next push starts the first build. The connection was
verified in Settings; no push or deployment was performed for this configuration.
Not verified: the first Workers Builds release, Safari and Firefox, real phones
and screen readers.
