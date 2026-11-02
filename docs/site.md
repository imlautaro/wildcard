# Marketing site

`apps/site` is the public marketing website: one long landing page in English that
presents what is unique about Wildcard (independent contacts with their own memory,
initiative, sharing, groups, For you, per-contact connectors, open source and
self-hosting) with animated scenes built in HTML, CSS and JavaScript. It has no API
access, no account state and no network-backed data, so the session caching rules
in [caching](caching.md) don't apply: every page is static.

## Structure

| Path | Contents |
| --- | --- |
| `nuxt.config.ts` | Extends the [design system layer](design-system.md) (`../../packages/ui`), adds site-only icons to the bundle, prerenders every page. |
| `app/utils/site.ts` | Installation-specific values: web app URL, repository URL, `repositoryPublic`, `iosUrl`, section navigation. |
| `app/utils/cast.ts` | The example contacts used in the scenes, each labeled with a real portrait style. |
| `app/utils/siteIcons.ts` | Solar and `logos` glyphs outside the shared registry, rendered with `SiteIcon`. |
| `app/composables/useScene.ts` | The scene timeline: beats with delays, play while visible, pause off screen, loop, final state for SSR and reduced motion. |
| `app/plugins/reveal.client.ts` | Fade-in on scroll for `.reveal` elements (marked with `data-in`). |
| `app/components/*Scene.vue`, `MoreGrid.vue` | The animated scenes. `ContactAvatar.vue` draws the example portraits as inline SVG. |
| `app/assets/css/site.css` | Marketing layout and the chat vocabulary shared with the web app (bubbles, typing dots, banners). |

The site reuses the layer's tokens, Manrope, Solar icons, `AppButton`, `AppIcon`,
`.chip`, `.avatar`, `.badge` and `details` styles, and copies the web app's bubble
rules, so a design-system change shows up here too. Avoid class names the layer
already uses (for example `.center`, `.meter`, `.field`); `site.css` documents the
rule. Dark styles use `:root[data-theme="dark"]` like the apps; the footer and the
nav carry the same System/Light/Dark switch (stored per browser under
`wildcard-theme`, on the site's own origin).

### Scenes and motion

Each scene is a list of beats driven by `useScene`. The server renders the final
beat, so the prerendered HTML (and a browser without JavaScript) shows the whole
story. In the browser, a scene that starts off screen resets and plays once a third
of it is visible; it pauses off screen and loops while visible. With
`prefers-reduced-motion: reduce` scenes stay on their final beat, reveals start
visible and CSS animations stop on their last frame. Never add `.reveal`-style
classes from plain DOM code to an element with a `:class` binding: Vue rewrites
the attribute and drops them (use an attribute instead, as the reveal plugin does).

### Example portraits

The six example contacts are hand-drawn SVG placeholders, one per real style
(Cartoon, Anime, 3D animated movie, Realistic people, 3D animated pets, Custom).
They are illustrations, not generated output. To show real generated portraits, add
the images under `apps/site/public/contacts/` and set `photo: '/contacts/<file>'` on
the cast member in `app/utils/cast.ts`.

## Copy rules

The copy must stay true to the feature guides. Notable limits it respects:

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

November 1, 2026: `npm run typecheck:site` passes. The page ran under `nuxt dev` and
was captured in headless Chrome at 1280 px and 390 px, light and dark, with reduced
motion (final states) and with motion (memory and group scenes mid-animation and
looping): no console errors and no horizontal overflow at 390 px. `npm run build:site`
prerendered the page and `wrangler dev` served it with the Worker configuration (200
for `/`, 404 page for unknown paths, production hydration without console errors).
Not verified: the Workers Builds release, Safari and Firefox, real phones and screen
readers.
