# Home

Home is a personal, adaptive feed that a person's contacts build together. Each
card is about something the person actually cares about (their team's league, the
processing times of an application they are waiting on, the exchange rates they
follow, a trip) and is prepared by the contact best suited to it, with its own
layout. Home also gives quick access to the mini apps the person opens most and an
agenda of upcoming schedules and tasks assigned to them.

On iOS, Home is the first tab of the signed-in shell. On the web, Home fills the
content pane at `/` beside the chat list on wide screens, and opens at `/home` from
the house button in the chat list header (or **Menu → Home**) on narrow screens.

This is a first implementation (2026-10-30). See [verification](#verification).

## Using it

- **Cards** appear as contacts finish them; a status pill shows who is preparing
  what ("Lucía is preparing Barça este finde · 2/5"). The first card is the lead
  card. Each card shows its contact, when it was prepared, why it is on Home and
  its sources.
- **Pull to refresh** (iOS) or **Update now** (web, and iOS **⋯ → Update now**)
  asks the contacts to refresh cards older than 30 minutes. Requests within a
  minute of the previous one are ignored.
- **Follow something** (**+**): describe what to follow ("processing times for my
  I-130"). The curator picks the layout and the contact on the next run.
- **Card menu** (⋯ or long press on iOS): **Message {contact}**, **More like
  this**, **Less like this**, **Hide from Home**. Hidden topics never come back
  unless the person shows them again in **Home topics**.
- **Notes** can suggest a reply. Tapping it opens the chat with the message in the
  composer (only if the composer is empty); it is never sent automatically.
- **From a chat**: when the person asks a contact to keep an eye on something or to
  put it on Home, the contact calls `add_to_home`. The topic is attributed to that
  contact and stays until hidden.
- **Your apps**: enabled mini apps the person has opened, most used first, plus
  ones created in the last three days. Tiles open the mini app full screen (iOS) or
  its page (web).
- **Coming up**: up to four active schedules due in the next 48 hours and up to
  four open tasks assigned to the person, each opening its chat.

Fixed interface copy is English like the rest of the app; card text is written by
the contacts in the language the person uses with them.

## Cards

Cards are declarative data from a closed catalog, validated by
`apps/api/src/home/cards.ts`, and drawn natively by each client (SwiftUI, Swift
Charts and Liquid Glass controls on iOS; Material 3 surfaces and inline SVG on the
web). No HTML, scripts or remote resources are rendered; links are opened only on
tap and only when they are credential-free public `http(s)` URLs.

| Kind | Layout | Typical use |
| --- | --- | --- |
| `headlines` | Lead story (with the link preview image when available) and up to four more rows | News about a league, a company, a policy |
| `matches` | Fixtures/results with scores and a status capsule (red when live) | A team's next game and recent results |
| `table` | Compact table with an optional highlighted row | Standings, comparisons |
| `metrics` | Up to six figure tiles with change and trend | Exchange rates, monthly spending |
| `chart` | Line/area or bar chart with a headline value | A rate or balance over time |
| `tracker` | Big figure, progress bar and a step timeline | Processing time of an application, a shipment |
| `note` | A short personal note from the contact with an optional suggested reply | A tip or reminder grounded in memory |
| `list` | Numbered rows with detail and trailing value | Trip checklist, releases, events |

Every card has a title, optional subtitle, an icon and an accent from closed sets,
and up to five sources. A card is at most 12,000 characters of JSON. Freshness per
kind: matches and metrics 2 hours, headlines 4 hours, chart 6 hours, note, table
and list 12 hours, tracker 24 hours.

## How curation works

A **curation run** is a `kind: 'home'` instance of the existing `CHAT_WORKFLOW`
(`apps/api/src/home/workflow.ts`), started by the minute Cron (`dispatchHome`) or
directly by an API request, with one durable step per stage:

1. **Plan** (one model call, structured output). The editor reads the person's
   [signals](#what-home-reads) and returns 2–8 topics in order, each with a layout,
   the contact that prepares it, whether it needs web research or a connector, a
   reason shown to the person, plus a one-sentence briefing for the header. Topics
   the person or a contact asked for are always kept; curator topics left out are
   retired with their cards once those cards are stale (a fresh card is never
   discarded by one plan). Retired topics are deleted after seven days. Hidden topics are given to the editor as "do not
   recreate".
2. **Compose** (one step per card, at most six per run, requested topics first, then
   in plan order). Only new
   topics, expired cards and, after a manual update, cards older than 30 minutes are
   composed. The assigned contact writes the card in its own voice, with its
   personality and specialties, the relevant things contacts remember about the
   person, the previous card and the titles of the other cards. It may call
   `research_web` (one search per card, four per run) and, for connector topics,
   `list_mcp_tools`/`call_mcp_tool` (three reads per card), then answers with a card
   or skips. An invalid card gets one repair round; a skip keeps the earlier card
   for another hour. Each card is saved as soon as it is ready, so the feed fills
   progressively.
3. **Finish**. The next automatic run is due when the first card expires (between
   one and twelve hours later), or ten minutes after a failed run.

Runs are fenced by a per-person revision: a newer claim makes an older instance's
writes no-ops, and a run that has not finished after 45 minutes can be claimed
again. Automatic runs happen only while the person opened Home in the last three
days; a feed that was never opened never runs.

Triggers: the first Home view, **Update now**/pull to refresh, following a topic,
showing a hidden topic again, a contact's `add_to_home` (picked up by the minute
Cron once the person has opened Home) and card expiry.

## What Home reads

Only the person's own rows: their contacts (name, personality description and
specialties, which connectors each contact has), what any of their contacts
remembers about them (up to 60 recent `contact_memory` facts across all their
contacts), their own last 30 private messages and 12 group messages, their
connectors' approved read tools, their mini apps and usage, their active schedules
and their Home topics, feedback and current cards.

Connector-isolated private chats and groups (`mcp_private_contact`,
`mcp_private_group`) are excluded from these signals, so their history never reaches
a Contributor call. Pooling what the person's own contacts know about the person is
intended: the contacts curate Home together. Home never reads other participants' memories or
messages from shared contacts or groups, and its output is never written back into
contact memory. Card JSON is stored in D1 (`home_card`) until it is replaced,
retired, hidden or the account is deleted.

## Connectors on Home

A connector topic lets the assigned contact read the person's own data, for example
an exchange-rate tool or last month's spending from a personal finance connector.

- Any of the person's account connectors can be used, whether or not the tool is
  assigned to that contact (decision for this first version: no per-contact
  restriction on Home).
- Only tools approved in **Connections** that Home considers reads are listed or
  called: the server annotates them `readOnlyHint` without `destructiveHint`, or the
  tool name starts with a read verb (`get`, `list`, `search`, `fetch`, `read`,
  `query`, `find`, `lookup`, `price`, `rate`, `balance`, …) and contains no write verb
  (`create`, `update`, `delete`, `send`, `pay`, `transfer`, `set`, …). This is a
  heuristic over untrusted metadata, not a guarantee; only approve trusted tools.
- Every call rediscovers the catalog and requires the approved fingerprint, the same
  read classification and a schema-valid input. Results enter the model context with
  the same 24 KB text/structured limits as chats.
- Connector cards are produced with `muse-spark-1.3` Standard regardless of the
  account's model preference, as in connector-isolated chats. Other cards use the
  account's model (Contributor when the person chose it).
- The `add_to_home` chat tool is not offered in connector-isolated chats, so their
  private history does not reach the curator.

## Web research and budgets

`research_web` on Home calls the same research model as conversational research
with a public query written by the contact (instructions forbid personal details).
Each search reserves one slot of the account's and the global daily web research
budget (`web_research_usage`, 30 and 300 per 24 hours) and one of Home's own 12 per
person per 24 hours (`home_research`). Findings are saved with the reservation, so a
retried Workflow step reuses them instead of searching again. Saved findings are
deleted after two days (bounded cleanup on later reservations). `WEB_RESEARCH_ENABLED`
also disables Home searches.

Cost bounds per run: one planning call, at most six cards, four model rounds per
card, four searches and three connector reads per card.

## API

All routes require the bearer session (the web proxies them with its cookie).
Reads are limited to 90 per minute, writes to 20 per minute.

| Route | Purpose |
| --- | --- |
| `GET /api/v1/home?timeZone=…` | The feed: `enabled`, `status`, `pending`, `briefing`, `progress`, `contributors`, `cards`, `topics`, `apps`, `agenda`. Records the view and the time zone, and starts a due run. |
| `POST /api/v1/home/refresh` | Request an update (409 when Home updates are turned off). Returns the feed. |
| `POST /api/v1/home/topics` `{ text }` | Follow something (1–400 characters, at most 20 active requests). Returns the feed (201). |
| `PATCH /api/v1/home/topics/:id` `{ status?, feedback? }` | `status`: `active` or `hidden`; `feedback`: `more`, `less` or `null`. Hiding deletes the card. Returns the feed. |

`enabled` is `false` when `HOME_FEED_ENABLED` is not `"true"` or no model key is
configured; apps and agenda are still returned. `pending` is true when a first or
requested run is due but not yet claimed, so clients can show progress at once.

Mini app opens are counted in `POST …/mini-apps/:appID/resolve` (reloads within ten
minutes count as one visit) in `mini_app_usage`.

## Caching

Both clients keep one session-owned feed in memory (`HomeFeedStore` on iOS,
`useHome` on the web), dropped on sign-out and account switch. It is never written
to disk because cards can contain connector data.

- Navigation shows the last feed synchronously; the first load shows placeholders.
- Background revalidation after 60 seconds while Home is visible, every 4 seconds
  while a run is in progress or pending. Requests are deduplicated.
- Every mutation returns the whole feed, which replaces the cached one; a newer
  mutation rejects older in-flight reads.
- Transient failures keep usable cards visible; only a first load shows the error.
- On the web, `/` mounts the feed only on wide screens, so a hidden feed never
  polls or counts as a Home visit.
- Link preview images reuse the existing link preview cache and the private image
  cache (iOS) / private image loader (web).

## Infrastructure

Migration `0074_home_feed.sql` adds `home_feed`, `home_topic`, `home_card`,
`home_research` and `mini_app_usage`; every row cascades with the account. The
versioned `HOME_FEED_ENABLED` var in `apps/api/wrangler.jsonc` turns curation runs
on (`"true"`) or off. Runs use the existing `CHAT_WORKFLOW`, minute Cron, D1 and
`META_API_KEY`; no new service, binding or secret. See
[infrastructure](infrastructure.md#home-feed-migration-0074).

## Verification

Performed on 2026-10-30, before any release:

- API, web and full iOS static type checks.
- Migrations 0001–0074 applied to a scratch local workerd D1; the real signal,
  feed, dispatch, claim, chat tool, plan and compose statements executed with
  bound parameters against seeded fictional data through `getPlatformProxy`.
- A complete local curation run (plan + five cards) against that D1 with the live
  `muse-spark-1.3-contributor` model and web research: Spanish (Argentina) cards for
  a La Liga fixture (`matches`), I-130 processing times (`tracker`), exchange rates
  (`metrics`, with explicitly dated figures when today's value was not found), a
  Champions League topic added through `add_to_home`, and a note. About 128 seconds.

- Local web rendering (desktop light and phone-width dark) with headless Chrome
  against a scratch D1 seeded with those cards plus fictional chart/table fixtures,
  quick access tiles and agenda items; two CSS defects found there were fixed.

Not verified: deployed behavior, iOS rendering on a simulator or device, Workflow replay in Cloudflare, connector reads against a live MCP server, and concurrency between Cron
and request-triggered dispatches. Card accuracy depends on the research provider;
figures can be days old, which cards are instructed to state.

## Limitations

- Native device reminders (EventKit) are not read; the agenda covers server-side
  schedules and tasks.
- Group mini apps appear in quick access, but group conversations are not used as
  topics beyond the person's own group messages.
- Push notifications for new cards and Home widgets are not implemented.
- The read-tool classification for connectors is a heuristic (see above).
