# Design system (Wildcard UI)

`packages/ui` is a [Nuxt layer](https://nuxt.com/docs/guide/going-further/layers)
that both browser apps extend: `apps/web` and `apps/admin` declare
`extends: ['../../packages/ui']` in `nuxt.config.ts`. The layer is the single source
of the web look: Material 3 components, Material Symbols icons and the press ripple,
with a Wildcard customization layer on top (type, spacing, shape, elevation and
motion). iOS keeps its native SwiftUI design; this document applies to the browser
apps only.

## What the layer provides

| Path in `packages/ui` | Contents |
| --- | --- |
| `nuxt.config.ts` | `$meta.name: 'ui'` (alias `#layers/ui`), `@nuxt/icon` in client-bundle mode, the three CSS files, shared `<head>` (viewport, font preload, and the inline theme script that sets `data-theme` and the color-scheme/theme-color tags). |
| `app/assets/css/tokens.css` | Cascade layer order, `@font-face`, color roles (light and dark), spacing, type, shape, elevation and motion tokens. |
| `app/assets/css/base.css` | Reset, document typography, focus ring, scrollbars, Material checkbox and radio, utilities (`.visually-hidden`, `.muted`, `.small`, `.code`, `.tabular`). |
| `app/assets/css/components.css` | Every component class (catalog below). |
| `app/components/` | The Vue components (catalog below). |
| `app/plugins/ripple.client.ts` | The press ripple. |
| `app/utils/theme.ts`, `app/composables/useTheme.ts`, `app/plugins/theme.client.ts` | Appearance preference (System, Light, Dark); see [appearance](appearance.md). |
| `app/utils/icons.ts` | The icon registry (`appIcons`, `AppIconName`), auto-imported in both apps. |
| `public/fonts/` | Manrope (SIL OFL) served by both apps. |

Apps add their own `app/assets/css/main.css` for app-specific surfaces (the web chat
shell, conversation, mini apps; the admin rail, users table and stats). Favicons stay
per app.

### Cascade layers

All layer rules live in CSS cascade layers declared once in `tokens.css`:
`ui.reset`, `ui.tokens`, `ui.base`, `ui.components`, `ui.utilities`. App CSS and
scoped component styles stay **unlayered**, so they always override the layer
regardless of specificity or load order. (Nuxt concatenates `css` arrays with the
app's entries before the layer's, so source order alone would let the layer win.)
Consequences:

- Override a layer style from an app with any selector; no `!important` needed.
- Don't wrap app CSS in `@layer`, or the layer would start winning ties again.
- Don't use `!important` inside the layer: layered `!important` beats unlayered
  `!important`.

## Tokens

Use tokens, never raw values, for color, spacing, type, radius, elevation and motion.

- **Color roles** (`--md-*`): the Material 3 tonal-spot scheme seeded with the brand
  blue `#045de3` (the iOS AccentColor, kept as the light primary), with neutrals
  that carry a faint blue cast. Includes `primary`, `secondary`, `tertiary`, `error`,
  the custom `success` and `warning` roles with their containers, the full surface
  container ladder (`surface-container-lowest` … `highest`, `surface-dim`,
  `surface-bright`), `outline`, `outline-variant`, the inverse roles and `scrim`.
  Dark roles apply under `:root[data-theme="dark"]`, set from the user's
  System/Light/Dark preference ([appearance](appearance.md)); never write dark rules
  as `@media (prefers-color-scheme: dark)`. Older aliases (`--accent`, `--surface`,
  `--separator`, `--danger`, …) still resolve; use the `--md-*` roles in new code.
- **Spacing** (`--space-*`): a 4 px grid — `0-5` 2, `1` 4, `1-5` 6, `2` 8, `3` 12,
  `4` 16, `5` 20, `6` 24, `8` 32, `10` 40, `12` 48, `16` 64.
- **Type** (`--type-*`, used with `font:`): `display-small`, `headline-medium`,
  `headline-small`, `title-large`, `title-medium`, `title-small`, `body-large`,
  `body-medium`, `body-small`, `label-large`, `label-medium`, `label-small`, all in
  Manrope with slightly heavier weights than Roboto needs. Pair large sizes with
  `--tracking-display`, `--tracking-headline` or `--tracking-title`, and labels with
  `--tracking-label`.
- **Shape** (`--md-shape-*`): `xs` 4, `s` 8, `m` 12, `l` 16, `l-plus` 20, `xl` 28,
  `xl-plus` 32, `full`. Segmented lists use `--ui-group-radius` (24) outside and
  `--ui-group-item-radius` (6) between items, separated by `--ui-group-gap` (2).
- **Elevation** (`--md-elevation-1` … `4`): soft layered shadows tinted with the
  neutral hue (`--ui-shadow`) rather than pure black; stronger in dark mode.
- **Motion**: `--md-ease` (standard), `--md-ease-decelerate` (entering),
  `--md-ease-accelerate` (leaving), `--ui-ease-spring` (shape morphs and toggles,
  slight overshoot); durations `--md-motion-short` 150 ms, `medium` 250 ms, `long`
  400 ms. Every animation has a `prefers-reduced-motion` fallback.
- **Layout**: `--ui-bar-height` 64, `--ui-page-width` 720, `--ui-page-width-wide`
  1120, `--ui-page-gutter` (16, 24 from 600 px), `--ui-pane-gap` (8, 12 from
  1280 px), `--ui-pane-radius` 24.

## The Wildcard customization

What makes the apps look like Wildcard rather than stock Material 3, all expressed as
tokens and component rules:

- **Shape morph on press.** Buttons, icon buttons and the FAB morph from a pill (or
  circle) toward a 12 px rounded square while pressed and spring back on release
  (Material 3 Expressive). The ripple and state layer follow the animated radius.
- **Segmented lists.** Settings read as one 24 px rounded block whose rows meet with
  6 px inner corners and 2 px gaps; whole rows (including switch, radio and checkbox
  rows) take the state layer and ripple.
- **Switches with a check.** The handle grows when on, shows a check, and grows a
  little more while pressed.
- **Tinted elevation and a hairline in dark mode.** Panes and sheets keep depth
  without harsh black shadows; dark content panes get a subtle outline instead.
- **Menus with inset items.** Popovers, context menus and select listboxes share one
  16 px surface with rounded, inset items, and ease in from their origin.
- **Sheets that ease in.** Dialogs fade and rise on open (`@starting-style`); bottom
  sheets slide up and show a drag handle.
- **Typography.** Manrope with tighter tracking on titles and headlines, tabular
  figures for times and counts.
- **Details.** A tapered spinner in the current text color, quiet scrollbars, a
  tinted text selection, empty states with a tonal icon disc, auth cards on a soft
  primary glow.

## Components

Vue components are auto-imported in both apps. Prefer them to hand-written markup:
their props are typed, so the type checker rejects unknown variants and icon names.
Each renders the classes in `components.css`, which stay available for markup that a
component can't express (see "Classes without a component").

| Component | Use | Key props and slots |
| --- | --- | --- |
| `AppIcon` | Material Symbols (Rounded) glyph. | `name`, `filled` |
| `AppButton` | Every text button. One filled action per task area. | `variant` (`filled`, `tonal`, `outlined`, `text`, `danger`, `danger-tonal`, `danger-text`), `size` (`small`, `medium`, `large`), `icon`, `trailing-icon`, `to` (renders a link), `type`, `block`, `loading`, `disabled` |
| `AppIconButton` | Every icon-only button. | `icon`, `label` (accessible name and tooltip), `variant` (`standard`, `filled`, `tonal`, `outlined`), `size`, `to`, `selected` (toggle: `aria-pressed` + filled glyph), `danger`, `badge`, `badge-label`, `tooltip` |
| `AppTopBar` | The top app bar of a page or panel. | `title`, `subtitle`; slots `leading` (navigation), `title` (custom title), default (actions, 4 px apart) |
| `AppListGroup` | A segmented list section. | `title`, `info` (adds an `InfoButton`), `footer`; slots default (rows), `title`, `footer`; other attributes (`role`, `aria-label`) go to the rows block |
| `AppListItem` | A row in a list group: navigation, action, sheet opener or static. | `icon`, `to`/`href` (navigation, chevron), `opens` (opens a sheet, chevron), `danger`, `plain` (static), `supporting`, `value` (current setting), `disabled`; slots `leading`, `supporting`, `trailing` |
| `AppSwitch` | A switch row for settings that apply immediately. | `label` or default slot, `icon`, `supporting`, `info`, `v-model` **or** `checked` + `@change` (receives the native event; a bound `checked` always wins, so handlers can revert a failed save), `disabled`, `busy` |
| `AppTextField` | Outlined text field with a floating label. | `label`, `v-model`, `multiline`, `supporting`, `error`; other attributes go to the input |
| `AppSearchField` | Full-round search bar with a clear button. | `label`, `placeholder`, `v-model`; other attributes go to the input |
| `AppSelect` | Material select (menu listbox) for every choice list. | `options`, `v-model`, `label`, `variant` (`outlined`, `plain`, `tonal`), `placeholder` |
| `AppSegmented` | Two to five mutually exclusive options. | `options`, `v-model`, `label` |
| `AppSheet` | Dialog (wide screens) / bottom sheet (narrow). | `title`, `icon` + `danger` (basic dialog with a centered icon and no close button), `wide`; slots default, `header`, `actions`; emits `close` |
| `InfoButton` | Explains a setting in a sheet instead of a footer paragraph. | `label`, `text` |
| `AppNotice` | Inline feedback. | `tone` (`error`, `warning`, `success`, `info`), `icon`, `dismissible`; slot `actions`; emits `dismiss` |
| `AppEmptyState` | Empty or failed content. | `icon`, `title`, `text`; slots default, `actions` |
| `AppLoading` | First-load spinner with a label. | `label` (default "Loading…"), `fill` (page placeholder padding) |
| `AppChip` | Compact status label. | `tone` (`neutral`, `primary`, `success`, `warning`, `error`), `icon` |
| `AppMenuItem` | An item of a `.menu` popover or context menu. | `icon`, `to`, `danger`, `disabled` |

Web-only components build on these: `PageBar` (an `AppTopBar` with the responsive
Back button), `AppAvatar` (private image cache), `IdentityEditor`, the chat and
mini-app components.

### Classes without a component

| Class | Use |
| --- | --- |
| `.page` / `.page-inner` (`.wide`) | Scrolling page and its centered column. |
| `.field` (`> label`, `.lead-icon`), `.two-line` (`.small` supporting line), `.toggle-label` | Custom rows inside a `.group` (inputs, read-only values, activity rows). |
| `.choice-row` | Radio option with a title and a detail line. |
| `.check-row` | Consent checkbox beside its explanation. |
| `.text-block` | Paragraphs inside a group. |
| `.menu` + `.menu-divider` | Popover and context menu surface (items are `AppMenuItem`). |
| `.badge` | Count beside a row or inside a custom control. |
| `.fab` | Extended floating action button. |
| `.link-button` | Compact inline text action inside text, notices and status lines. |
| `.code-box`, `details > summary` | Copyable code; disclosure. |
| `.actions-row` (`.split`) | End-aligned buttons after a section. |
| `.card` (`.outlined`), `.divider`, `.spinner` (`.large`), `.meter`, `.avatar` | Containers and indicators. |
| `.auth` / `.auth-card` (`.mark`, `.lead`) | Sign-in and blocking screens. |
| `.large-title`, `.section-label`, `.group-title`, `.group-footer` | Headings and captions outside `AppListGroup`. |

## Spacing rules

- Pages: `AppTopBar` (or `PageBar`) above a `.page` > `.page-inner`. The inner
  column is 720 px (1120 with `.wide`) with the responsive gutter and 64 px of bottom
  room.
- Sections: `AppListGroup` handles its rhythm — 20 px above a title, 8 px between the
  title and the rows, 4 px before a footer, 16 px after it. Consecutive groups
  without titles are 20 px apart, and so is a group that follows other content (an
  identity header, a media grid); after a title, notice, search field or segmented
  control it sits flush. Don't add `margin-top` inline styles between groups.
- Notices take a 16 px bottom margin in page flow; inside the chat list they inset
  12 px from the sides.
- Bars: icon buttons are 40 px with 4 px between them; a leading title aligns with
  the 16 px content gutter.
- Rows are at least 56 px tall (64 for choices, 76 for chat-list rows), with 16 px
  horizontal padding and 16 px between a leading icon and the text.
- Sheets: 24 px side padding (20 on phones), actions end-aligned 8 px apart.
- Inline `style="margin…"` or `style="padding…"` in templates is a smell: use a
  component, a layer class, or a scoped rule with `--space-*` tokens.

## State layers and ripple

Interactive classes (`.button`, `.icon-button`, `.link-button`, `.button-row`, `.fab`,
`.menu-item`, `.select-option`, `.segmented button`, `label.toggle`,
`label.choice-row`, `label.check-row`) get a `currentColor` overlay: 8 % on hover,
10 % on focus and press. `plugins/ripple.client.ts` adds the press ripple with one
delegated `pointerdown` listener; its host list must match the selectors in
`components.css`. App-specific elements opt in with `data-ripple` (for example chat
rows, the composer's send button and mini-app controls) and opt out with
`data-no-ripple`. Touch presses wait 90 ms and cancel when the pointer moves more
than 10 px, so starting a scroll doesn't flash a row. Disabled controls (including
rows whose control is disabled) and `prefers-reduced-motion` get no ripple. The wave
renders in its own clipping layer, so hosts keep `overflow: visible` (badges).

## Icons

`AppIcon` renders Material Symbols (Rounded) through `@nuxt/icon` in SVG mode, so CSS
that sizes `svg` applies. `app/utils/icons.ts` maps each semantic name to an outline
and a filled symbol. The layer's `nuxt.config.ts` bundles exactly those icons into
the client of both apps (about 140 glyphs, ~70 KB uncompressed): the provider is
`none` with no API fallback and no server bundle, so the apps never call Iconify and
the Workers don't carry the collection. The admin bundles the full shared set too;
that is the cost of one registry. Add an icon only after confirming its name in
`node_modules/@iconify-json/material-symbols/icons.json`.

## Adding to the system

1. Put tokens in `tokens.css` and component rules in `components.css`, inside the
   existing `@layer` blocks.
2. If the component is interactive, add its selector to the state-layer lists in
   `components.css` and to `rippleHosts` in the plugin, or use `data-ripple`.
3. Wrap repeated markup with behavior or variants in an `App*` component in
   `app/components/`, typed so misuse fails the type check.
4. Update the tables above, then run `npm run typecheck:web` and
   `npm run typecheck:admin`: both apps compile the layer.

## Verification

October 30, 2026: `npm run typecheck:web` and `npm run typecheck:admin` pass, and
both reject unknown component variants and icon names. Both apps ran locally
(`nuxt dev` against `wrangler dev` with local D1) and were captured in headless
Chrome at 1280 px and 390 px, in light and dark: web chat list, conversation,
account, Chat model sheet (dialog and bottom sheet), contact details, group details,
contacts, connections, personality, Updates, sign-in; admin overview, users, flags,
delete dialog and sign-in. Not verified: real touch devices, Safari and Firefox,
screen readers, the production build, and every remaining screen (mini apps, tasks,
documents, onboarding, invitations, MCP flows), which were migrated and type-checked
but not viewed.
