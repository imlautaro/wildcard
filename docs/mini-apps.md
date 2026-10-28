# Mini apps

A contact can build a **mini app** for one person: a counter or tracker with saved
values, or a view over that person's connected MCP tools ("make me a mini app for
last week's expenses"). A mini app is a
declarative JSON spec, not code. Its data steps form an acyclic graph, similar to
a node workflow, and its view is a tree of a closed catalog of components. Both
clients render that tree with their own native components: SwiftUI lists, grids and
Swift Charts on iOS, and the grouped-list styling of the app on web. There are no
web views, iframes or remote scripts.

A mini app opens as its own full-screen view, like an app: on iOS a
`fullScreenCover` with a close button (✕) and a ⋯ menu in the top bar, and, for
tabbed apps, a native `TabView` with one navigation stack per tab. On web it is the
`/contacts/:id/mini-apps/:appID` page with the same top bar menu, a bottom tab bar and
a composer pinned above it.

This is a first implementation. Generated spec quality from Muse Spark, live MCP
servers and device presentation have not been verified yet.

## Using it

1. In any direct private chat, ask the contact for an app, counter, tracker or
   dashboard. Mini app tools are offered for direct human messages, not for
   schedules or group work.
2. Apps that use only **state**, inputs, constant data and local actions (a
   counter with a **+** button) are enabled when created and open immediately.
3. Apps over connected data need a connector assigned to the contact with the
   relevant tools enabled (see [MCP connections](connectors.md)). The contact calls
   `list_mcp_tools`, inspects one real result with `call_mcp_tool`, then calls
   `create_mini_app`. A card appears under the reply. Open it to review the tools:
   **Runs each time you open or refresh** (reads) and **Only when you tap and
   confirm** (writes). Choose **Enable mini app**. Until then nothing loads.
4. Opening an enabled app runs its reads, applies its transforms and shows the
   result full screen. Close it with ✕ (iOS) or the back button (web). Inputs (segmented controls, a text field) reload with new values.
   Actions show a native confirmation with the text the contact wrote before
   running a write.

Contact details → **Mini apps** lists them. Each app can be disabled or deleted.
To change one, ask the contact; it can pass `miniAppID` to replace an app. Any
replacement increments the revision and requires review again.

## Spec

`create_mini_app` validates the spec on the server (`apps/api/src/miniapps/spec.ts`)
and returns precise errors to the model, listing the available ids for broken
references. Limits: 24 KB, eight state values, 12 data steps (at most four `mcp`),
four inputs, 16 actions, five tabs, six menu items, 20 top-level components per
screen, 80 components in total, and one level of sections or grids.

**State** declares saved values: `number`, `text`, `boolean` or `list`
(up to 200 flat objects, such as `{ "name": "Milk", "done": false }`). A `stat`,
`progress` or `list` can read state directly by id, data steps can use it as `from`,
and templates read it with `{"$state": id}`. State, data steps and inputs each have
their own namespace for ids, except that state and data step ids share one, because
the view reads both.

**Screens.** A spec has either `view` (one screen) or `tabs`: 2–5
`{ id, title, icon, view }` entries shown in a native bottom tab bar. Tab and tile
icons come from a closed catalog (`home`, `list`, `chart`, `check`, `star`,
`calendar`, `clock`, `money`, `cart`, `bolt`, `folder`, `person`, `chat`, `book`,
`trophy`, `heart`, `gear`, `grid`) that each client maps to SF Symbols or its own
SVG icons. `menu` lists up to six field-less action ids for the top bar ⋯ menu, such
as "Clear list" or "Reset". The app's own menu items come first, followed by
Refresh, Disable and Delete. Inputs and the "Updated" footer show on the first
screen only. A stored tabbed spec has no `view`. The resolved response carries
`tabs` and `menu`, and its `view` is the first tab's view, so older clients still
show the first screen.

**Local actions** change state without any external tool:
`{ "id": "add", "label": "+", "set": [{ "state": "count", "op": "increment" }] }`.

| Op | State | Effect |
| --- | --- | --- |
| `increment`, `decrement` | number | Default amount is 1 |
| `set` | number, text, boolean | Templated `value`, which may use form fields |
| `toggle` | boolean | |
| `append` | list | Adds an object (scalars become `{ "value": … }`) |
| `clear` | list | Removes every item |
| `set_items` | list | Sets `field` to `value` on every item, for example to restart a checklist |
| `remove_where` | list | Removes the items whose `field` equals `value`, for example completed tasks |
| `pick` | text, number | Picks one of the `value` options at random, on the server |

A local action needs no confirmation unless it declares `confirm`, for example for a
destructive reset. **Remote actions** (`connectionID`, `tool`, `arguments`) always
require `confirm`. Components bound to state (`toggle`, `choice`, `input`, and
`checklist` rows) edit it directly through `POST /:appID/state`. That route accepts
only the operation the bound component allows: flipping a toggle, choosing one of
the declared options, setting an input, or toggling/removing a checklist row.

| Step | Purpose |
| --- | --- |
| `mcp` | Call an enabled read tool with templated arguments |
| `const` | A literal or computed value |
| `select` | Pick a dot path, such as `data.expenses` |
| `filter` | Keep rows matching all conditions (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `after`, `before`) |
| `sort`, `limit` | Order rows by a field; keep the first 1–500 |
| `aggregate` | `sum`, `avg`, `min`, `max` or `count`, giving a number |
| `group` | Group rows by a field into `{ key, value, count }` |

A step's `from` may only name an earlier step or a state id, so the graph is acyclic
by construction. Templates are JSON literals plus structured expressions:
- `{"$input": id}`, `{"$state": id}`, and `{"$field": id}` (actions only).
- `{"$date": {"days": -7, "format": "date" | "datetime"}}`, relative to now in the
  viewer's time zone.
- `{"$daysSince": "YYYY-MM-DD"}` and `{"$daysUntil": …}`, in whole days from today.
- `$add`, `$sub`, `$mul`, `$div` and `$min`/`$max` over 2–8 operands, and
  `{"$round": {"value", "digits"}}`.

A missing or non-numeric operand, or division by zero, gives an empty value instead
of a guess. Nothing is evaluated as code, and there are no regular expressions or
remote references.

View components:
- `section`, and `grid` (two or three columns of cards: `stat`, `progress`,
  `chart`, `text`, field-less `action` and `tile`). Neither nests.
- `tile`: a card in a grid, or a navigation row elsewhere, with an icon, title,
  optional caption and value. It opens a tab (`tab`) or runs a field-less action.
- `composer`: a text bar pinned to the bottom of its screen, with a send button,
  for an action with exactly one text or number field (a to-do input, a log entry).
  One per screen, at the top level. When its action only appends a row with
  literal values plus that field, clients show the row immediately.
- `stat`: a lone stat becomes a large hero number, and consecutive stats share a grid.
- `progress`: the goal is a number or a number state id. `style: "ring"` draws a
  circular gauge.
- `list` (read-only) and `checklist` (list state; tap to toggle the boolean `done`
  field, swipe or ✕ to delete). When `done` is omitted, the first boolean field of
  the list's items is used.
- `chart` (`bar`, `line`, `area` or `pie`, a donut with a legend and up to 12
  slices) and `text`.
- `toggle`, `choice` (segmented) and `input`, each bound to a state value.
- `timer`: an on-device countdown with start, pause and reset. It is not saved and
  stops when the screen closes.
- `action`: consecutive buttons without fields share one row. Short symbols such as
  `+` and `−` sit side by side. The adding action (`+`, increment or append) is
  prominent. Actions with fields render as a form.
- `lesson`: a Duolingo-style quiz card. **Start** opens a full-screen flow with one
  question at a time, a progress bar and hearts (1–5, default 3). Questions are
  multiple choice (2–4 options and the index or text of the correct one) or typed
  (the expected answer plus up to five accepted spellings, compared ignoring case,
  accents, punctuation and extra spaces). **Check** shows the result and an optional
  explanation, and a wrong answer costs a heart. Running out of hearts ends the
  lesson with no score and offers **Try again**. Finishing adds the number of correct
  answers to the optional `xp` number state through the direct-edit route. That
  route accepts only `increment` by a whole number from 0 up to the lesson's question
  count. Up to 20 questions per lesson. Answers travel to the client with the
  questions, so they are not secret from the person playing.

Values carry a format (`number`, `currency` with an ISO code, `percent`, `date`,
`datetime`, `text`), which each client formats with the viewer's locale. Date-only
strings are shown as calendar days without time zone shifts. Inputs (`segmented`,
`number`, `text`) are not saved; they recompute the view.

**Tolerance for model output.** The parser accepts a few common slips instead of
spending a retry:
- A `spec` sent as a JSON string, including stray closing brackets at the end.
- A missing component or step `type` that the keys make unambiguous.
- Unknown keys on view components, which are dropped.
- Numeric option values, and `confirm: ""`/`true` on local actions.
- A filter's single-condition shorthand.
- `{field, value}` updates without `op`, meaning `set_items`.
- `$round` with a sibling `digits`.

Anything ambiguous is still rejected.

## Verification before delivery

`create_mini_app` saves an app only if it passes an offline verification
(`apps/api/src/miniapps/verify.ts`). The contact receives every problem, the app is
**not** saved, and the contact must fix it or tell the person plainly what could not
be built. Nothing remote runs during verification.

**Automatic checks**, independent of the contact's tests:
- No data step fails on first open (`PATH_NOT_FOUND`, `NOT_A_LIST`, …).
- Each `mcp` read step is checked against a result of that tool inspected with
  `call_mcp_tool` in the same turn, read from `mcp_execution`. A read with no
  inspected result is rejected.
- Every action is reachable from a button, tile, menu or composer, and every local
  action runs from the initial state with sample field values.
- A list shown on screen that starts empty has a reachable action that appends to it.
- After using every everyday action twice, the verifier warns about actions that
  change nothing, state that is never used, charts with no points and stats with no
  value. These are warnings, not errors.

**Tests** (`tests` in the spec, up to eight, stored with it) are required when an
app has local actions or editable components. Each test starts from the initial
state and runs its steps:
- `{tap, fields?}` runs a local action. Remote actions cannot be tested.
- `{edit}` sends what a bound component sends, and is accepted only if a component
  on screen allows it.
- `{input}` sets an input.

It then checks expectations:
- `{state, equals | count | includes}`.
- `{step, equals}` for a computed data step.
- `{text}`, something the screen must show, matched against raw values rather than
  formatted ones.

A failing step or expectation is reported with the actual value, for example
`Test "clear" failed: expected items to have 0 items, got 1`.

On success, the tool result includes `verified: { testsPassed, warnings }`. These
checks prove that the app behaves as its tests declare. They do not prove that the
tests capture what the person wanted; the automatic checks narrow that gap without
closing it. The evaluation script uses the same verifier.

Tool results are parsed as JSON from text blocks first, because that is the shape the
contact inspected. `structuredContent` is the fallback. A tool that returns prose
yields `RESULT_NOT_JSON`. Text extraction with a model is deliberately not supported,
because it would add inference cost and nondeterminism to every load.

## Permissions and safety

- **Grant per revision.** Approval stores `approved_revision` together with the
  fingerprints of the exact tool definitions it covers. Every load and action
  checks the following again: the revision, that the connector is still assigned
  to the contact, that the tool is still enabled on the account connector, and
  that its fingerprint is unchanged. Remote execution rediscovers the catalog in
  the same MCP session and rejects changed definitions (`TOOL_CHANGED`), as
  `call_mcp_tool` does. Arguments are validated against the tool's input schema.
  A failed check shows **Review changes to continue**.
- **This is a new execution class.** Reads of an enabled app run on open or refresh
  without a chat message. The person explicitly approves that when enabling the
  app. Read/write roles come from the spec and the person's approval, never from
  MCP annotations. One tool cannot be both a read and an action.
- **Saved state** lives in D1 (`mini_app_state`), per app and therefore per person,
  so iPhone and web show the same values. Each tap is one compare-and-swap on a
  version, with its ledger row in the same transaction. A retried execution ID
  returns its recorded result and never applies twice. Numbers stay within ±10¹² and
  text within 500 characters. Values survive revisions when the id and type are
  unchanged, and otherwise reset to `initial`. State is not sent to the model.
- **Writes** run only from an action that the person taps and confirms. The client
  creates one execution UUID per confirmed submission and reuses it for network
  retries. `mini_app_action` reserves that ID before the remote call, so a replay
  returns the recorded status and never calls the tool again. Pre-call validation
  failures are `failed`; anything after the call starts that does not return a
  result is `unknown` and is never retried automatically. As with chat tools, this
  is not an exactly-once guarantee from the provider.
- **Data scope.** Mini apps belong to one participant's private chat with the
  contact. They use that participant's connectors. Shared contacts never expose
  them to other participants, and groups have none. Resolved data goes only to the
  requesting client. It is not stored in D1, not sent to the model, and not
  extracted into memory. Only step IDs and error codes are kept (`last_error`), so
  `list_mini_apps` can help the contact repair a spec. Its output is bounded to about
20 KB; specs that do not fit are omitted.
- **Rate limits.** Per account per minute: 120 management requests (which include
  local taps and state edits), 20 loads, and 10 external actions. Each load has a 20-second MCP deadline per step, a 1 MiB transport limit,
  at most 5,000 rows per transform, 100 groups, 100 list rows, 60 chart points and
  160 KB of resolved views across all tabs.

## API

All routes require the bearer session and an owned contact:
`/api/v1/contacts/:id/mini-apps`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/` | Up to 20 apps: status (`needs_review`, `enabled`, `needs_reapproval`), inputs, tools, last issues |
| POST | `/:appID/approval` | `{ revision, allowed }`; enabling binds the current tool fingerprints |
| POST | `/:appID/resolve` | `{ inputs?, timeZone }`; returns `{ revision, inputs, resolvedAt, view, issues }`, or 409 `REVIEW_REQUIRED` |
| POST | `/:appID/actions/:actionID` | `{ executionID, revision, inputs?, fields?, timeZone }`; returns `{ status, replayed }`, plus `resolution` for local actions in apps without remote reads |
| POST | `/:appID/state` | `{ executionID, revision, timeZone, update, inputs? }`; a direct edit from a bound component. Returns `{ status, replayed }`, plus `resolution` for apps without remote reads |
| DELETE | `/:appID` | Deletes the app, its saved state and its action ledger |

## Model behavior

All direct private chats expose `create_mini_app` and `list_mini_apps`, and get
three tool-enabled rounds (scheduled turns keep two) with up to 8,192 completion
tokens, within the six-execution budget. If `create_mini_app` fails in the last
round (for example, after `list_mcp_tools` and `call_mcp_tool`), the turn gets one
more round to repair it. The system prompt (`miniAppInstruction`) and the tool
description tell the contact to mention an app only when the tool returned its
`miniAppID`. When the request needs something mini apps cannot do (camera, live AI
replies, multiplayer, notifications, arbitrary code, data without a connector),
or when verification keeps failing, the contact must say which part cannot be built
and offer the closest version. `museCompletion` accepts `create_mini_app`
arguments up to 30 KB; the earlier 1 KB limit for most tools rejected nearly every
spec. Risk: a turn can now make four model calls (up to 45 seconds each) plus MCP
calls inside the existing three-minute `prepare-reply` step. Slow turns can time out
and fall back to the existing tool-free recovery reply. Creation requires the live running turn. Each human message
can create one new app (`<turnID>:app`), so a replayed Workflow step returns the
original instead of a duplicate. Each chat holds up to 20 apps. The tool result tells
the model that the app is disabled until reviewed, so it does not claim to show data.

## Cache

Both clients keep session-owned caches: one app list per contact (up to 20 contacts,
five-second freshness, refreshed by visible chat polling) and one resolved view per
app (up to 16). A resolved view is reused for 60 seconds on navigation because each
load runs remote reads. Explicit refresh, pull to refresh, changing an input and a
completed action bypass that window. Requests are deduplicated, and responses
from an earlier input selection, an invalidated entry or a previous account are
rejected. Transient failures keep usable content visible. Approval, disabling and
deletion replace the list entry and drop its view. A 404 or `REVIEW_REQUIRED`
clears the view and revalidates the list. Contact deletion, access loss and
sign-out clear everything. Views stay in memory and are never written to disk.
See [caching](caching.md#mini-apps).

## Taps and latency

Each tap is a request. To feel instant, the server marks literal updates in the
resolved view: `updates` on actions, `state` on stats and progress, and paths on
checklists. Both clients apply those updates to the displayed state immediately,
queue the taps and send them in order, one execution ID each. Each response that
carries a `resolution` replaces the base view, so the display is always the server
state plus the taps not yet confirmed. Transient failures retry the same execution
ID up to twice. Anything else drops the pending taps and reloads. A local tap costs
about five D1 queries, and no connector lookup when the app has no tools. Updates
that are not literal (form values, `pick`, computed values) wait for the server.

## Evaluation and visual checks

`scripts/checks/mini-app-eval.mjs` generates mini apps from a list of prompts with
the real `museCompletion`, tool definitions and spec interpreter. It reads
`META_API_KEY` from the environment or the ignored `apps/api/.dev.vars` and never
prints it. It runs the same parsing and offline verification as production
(`prepareMiniApp`), including the extra repair round, and writes the verifier's
populated preview as fixtures (`app-NN.json`, with `tabs` and `menu`) plus
`results.json` with attempts, verification problems, replies and latency.
Debug iOS builds launched with `MINIAPP_FIXTURE=<path>` (for example
`SIMCTL_CHILD_MINIAPP_FIXTURE=… xcrun simctl launch …`) render a fixture with the real
renderer and no network, for Simulator screenshots.

On October 28, 2026, with `muse-spark-1.3-contributor`:
- Ten varied Spanish prompts (counter, shopping list, water, tip calculator, padel
  scoreboard, habits, mood journal, expenses, pomodoro and reading progress) went
  from 6/10 built, with frequent retries, to 10/10 built on the first attempt after
  the fixes above.
- A combined run of 20 prompts, including ten new ones (tasks with priority, days
  without smoking, bill split, weight chart, movie list, gym reps, trip savings,
  dinner roulette, morning routine and temperature converter), built 18/20. One
  failure was a provider 500, and 13 apps built on the first try. Median generation
  time was about 14 seconds, almost all model time.
- iOS Simulator and a static web preview rendered every built fixture.

Later on October 28, 2026, with full-screen layouts, verification and lessons:
- Ten layout prompts (to-do with composer and menu, habits with two tabs and a
  two-column home, expense dashboard with a donut, water ring, tip calculator,
  reading tracker with tabs, mood journal with composer, padel scoreboard, gym tracker
  with tabs and trip savings with a ring) built 9/10 verified apps, each with 2–3
  passing tests. Only two built on the first attempt. Most retries were specs sent as
  JSON text with stray tokens or unbalanced brackets. In the gym case, verification
  kept failing, and the contact told the person it could not build the tracker
  instead of presenting it. It had first created a placeholder app, which led to the
  "no placeholder apps" rule and to tolerant removal of stray bare words.
- A second run built two Duolingo-style courses (English with three six-question
  lessons, XP and a progress tab; South American capitals mixing multiple choice
  and typed answers), a to-do list using `remove_where`, and the gym and padel apps.
  Requests for a chatbot with AI replies and for camera ticket scanning were
  declined with an explanation and the closest alternative, as intended.
  Median time was about 30 seconds because of retries.

These runs did not use connectors, a real chat turn, or a physical device. The new
layouts were typechecked on iOS (Simulator SDK) and web (`vue-tsc`) but not rendered
in the Simulator or a browser.

## Setup and verification

Apply additive migrations `0037_mini_apps.sql` and `0038_mini_app_state.sql`
through the automatic commit/push release. No new service, binding or secret is needed; see
[infrastructure](infrastructure.md#mini-apps-migration-0037). Static checks performed:
API/web TypeScript, Vue template compilation of the changed pages/components, full
iOS Simulator Swift typecheck, SQL compilation of the new statements against all 37
migrations on empty SQLite, and a local run of the spec interpreter on fictional
expense data, including rejection cases and normalized-spec round trips.

Still pending: Muse Spark spec quality in the production chat prompt (the evaluation
uses a reduced system prompt); live MCP loads and actions;
iOS full-screen presentation, tab bar, composer, Charts and form presentation on a
device; web layout, bottom tab bar and composer on narrow screens;
grant invalidation after tool changes; and cache behavior across navigation, account
switching and access revocation.
