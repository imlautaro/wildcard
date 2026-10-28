# Mini apps

A contact can build a **mini app** for one person: a counter or tracker with saved
values, or a view over that person's connected MCP tools ("make me a mini app for
last week's expenses"). A mini app is a
declarative JSON spec, not code. Its data steps form an acyclic graph, similar to
a node workflow, and its view is a tree of a closed catalog of components. Both
clients render that tree with their own native components: SwiftUI lists, grids and
Swift Charts on iOS, and the grouped-list styling of the app on web. There are no
web views, iframes or remote scripts.

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
   result. Inputs (segmented controls, a text field) reload with new values.
   Actions show a native confirmation with the text the contact wrote before
   running a write.

Contact details → **Mini apps** lists them. Each app can be disabled or deleted.
To change one, ask the contact; it can pass `miniAppID` to replace an app. Any
replacement increments the revision and requires review again.

## Spec

`create_mini_app` validates the spec on the server (`apps/api/src/miniapps/spec.ts`)
and returns precise errors to the model. Limits: 16 KB, eight state values, 12 data
steps (at most four `mcp`), four inputs, four actions, 40 view components and one
level of sections.

**State** declares saved values: `[{ "id": "count", "type": "number", "initial": 0 }]`
(`number`, `text` or `boolean`). A `stat` can show a state value directly
(`"step": "count"`), and templates can read it with `{"$state": "count"}`.
**Local actions** change state without any external tool:
`{ "id": "add", "label": "+1", "set": [{ "state": "count", "op": "increment" }] }`.
The available ops are `increment`/`decrement` (default 1), `set` (with a templated
`value`, which may use form fields) and `toggle`. A local action needs no confirmation
unless it declares `confirm`, for example for a destructive reset. **Remote actions**
(`connectionID`, `tool`, `arguments`) always require `confirm`.

| Step | Purpose |
| --- | --- |
| `mcp` | Call an enabled read tool with templated arguments |
| `const` | A literal value |
| `select` | Pick a dot path, such as `data.expenses` |
| `filter` | Keep rows matching all conditions (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `after`, `before`) |
| `sort`, `limit` | Order rows by a field; keep the first 1–500 |
| `aggregate` | `sum`, `avg`, `min`, `max` or `count`, giving a number |
| `group` | Group rows by a field into `{ key, value, count }` |

A step's `from` may only name an earlier step, so the graph is acyclic by
construction. Templates are JSON literals plus three expressions: `{"$input": id}`,
`{"$date": {"days": -7, "format": "date" | "datetime"}}` (relative to now in the
viewer's time zone) and, in actions only, `{"$field": id}`. Nothing is evaluated as
code, and there are no regular expressions or remote references.

View components: `section`, `stat` (consecutive stats share one grid), `list`,
`chart` (`bar` or `line`), `text` and `action`. Values carry a format (`number`,
`currency` with an ISO code, `percent`, `date`, `datetime`, `text`), which each
client formats with the viewer's locale. Date-only strings are shown as calendar
days without time zone shifts.

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
- **Rate limits.** Per account per minute: 120 management requests, 20 loads, 120
  local state actions and 10 external actions. Each load has a 20-second MCP deadline per step, a 1 MiB transport limit,
  at most 5,000 rows per transform, 100 groups, 100 list rows, 60 chart points and
  128 KB of resolved view.

## API

All routes require the bearer session and an owned contact:
`/api/v1/contacts/:id/mini-apps`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/` | Up to 20 apps: status (`needs_review`, `enabled`, `needs_reapproval`), inputs, tools, last issues |
| POST | `/:appID/approval` | `{ revision, allowed }`; enabling binds the current tool fingerprints |
| POST | `/:appID/resolve` | `{ inputs?, timeZone }`; returns `{ revision, inputs, resolvedAt, view, issues }`, or 409 `REVIEW_REQUIRED` |
| POST | `/:appID/actions/:actionID` | `{ executionID, revision, inputs?, fields?, timeZone }`; returns `{ status, replayed }`, plus `resolution` for local actions in apps without remote reads |
| DELETE | `/:appID` | Deletes the app and its action ledger |

## Model behavior

All direct private chats expose `create_mini_app` and `list_mini_apps`. Connector
chats also get a third tool-enabled round, still within the six-execution budget. Risk: that path can now
make four model calls (up to 45 seconds each) plus MCP calls inside the existing
three-minute `prepare-reply` step. Slow turns can time out and fall back to the
existing tool-free recovery reply. Real latency has not been measured. Creation requires the live running turn. Each human message
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

## Setup and verification

Apply additive migrations `0037_mini_apps.sql` and `0038_mini_app_state.sql`
through the automatic commit/push release. No new service, binding or secret is needed; see
[infrastructure](infrastructure.md#mini-apps-migration-0037). Static checks performed:
API/web TypeScript, Vue template compilation of the changed pages/components, full
iOS Simulator Swift typecheck, SQL compilation of the new statements against all 37
migrations on empty SQLite, and a local run of the spec interpreter on fictional
expense data, including rejection cases and normalized-spec round trips.

Still pending: whether Muse Spark produces valid specs; live MCP loads and actions;
iOS sheet, Charts and form presentation on a device; web layout on narrow screens;
grant invalidation after tool changes; and cache behavior across navigation, account
switching and access revocation.
