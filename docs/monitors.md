# Page monitors

A person can attach one **page monitor** to a task assigned to a contact. The server
checks the saved public URL on a fixed interval with code only: fetch, extract text,
hash and diff. The model is not called while a page is unchanged. A new relevant change
gives the assigned contact a task turn that receives the changed lines, so it can tell
the chat what changed and why it matters. Migration 0056 adds this to the existing
tasks, D1, minute Cron and `CHAT_WORKFLOW`. No new service, binding or secret is required.

This is roadmap step 3. Static checks only; live fetching, change detection on real
sites, contact turns and both clients' presentation have not been verified.

## Using it

1. Open **Tasks**, assign a task to a contact and save.
2. Open the task again. Under **Page monitor**, enter a public `http(s)` address,
   choose **Every hour**, **Every 6 hours** (default) or **Every day**, optionally add
   comma-separated keywords, and save.
3. The first check stores a baseline. Later checks record **Unchanged**, **Earlier
   version again**, **Changed, no keyword match**, **Relevant change** or **Check
   failed** (with a code such as `REDIRECT`, `HTTP_ERROR`, `TIMEOUT`,
   `UNSUPPORTED_TYPE`). The board row and editor show the latest five checks, change
   turns used and whether a change is waiting for a turn.
4. Empty the address and save to remove the monitor. Changing the assignee removes it;
   save the assignment first, then add a monitor again.

Pausing, blocking, finishing or canceling the task stops checks; resuming or reopening
continues them. A contact that marks its monitored task done also stops monitoring, so
contacts are told to keep monitored tasks in progress until the completion condition
in the notes is met.

## Authority

- Only people can add, change or remove a monitor (versioned task PATCH fields
  `monitorURL`, `monitorKeywords`, `monitorInterval`). Contacts cannot, and assignment
  grants nothing. Every task starts without a monitor.
- The URL is exactly what the person saved (fragment removed). It must be
  credential-free `http`/`https` on a domain name: IP literals, `localhost`/`.local`
  hosts and embedded credentials are rejected. The Worker's existing
  `global_fetch_strictly_public` flag also keeps fetches on the public internet.
  Do not save URLs that contain private tokens: the address is visible to everyone who
  can see the task, and it is sent to the target site.
- Checks run only while the grantor still has access: in private chats the grantor is
  the chat's person; in groups the grantor must still be a member (any member can edit
  or remove a group monitor). Connector-isolated chats and groups are never checked.
- A pending change starts a turn only while the same conditions still hold (URL saved,
  grantor access, no isolation).
- A person can have at most 20 monitors on open tasks.
- The check sends one `GET` with `User-Agent: WildcardMonitor/1.0` and no cookies or
  account data. It does not authorize any other external action, web research or MCP.

## Change detection

| Step | Rule |
| --- | --- |
| Fetch | 10-second timeout; redirects are not followed (`REDIRECT`); non-2xx fails; only text, HTML, XML/RSS/Atom and JSON types |
| Extract | First 2 MiB of the body; HTML comments, scripts, styles, SVG, templates and iframes removed; tags stripped; entities decoded; whitespace collapsed into lines; first 64 KiB of text kept |
| Compare | SHA-256 of that text against the stored hash |
| Repeats | A hash among the last eight versions is **Earlier version again** (rotating banners, A/B pages); no turn |
| Diff | Line sets: added and removed lines, at most 40 each, 300 characters per line, 3,000 characters total |
| Relevance | With keywords, at least one added/removed line must contain a keyword (case-insensitive); otherwise any change is relevant |

Pages whose visible text changes on every load (clocks, counters, personalized
content) will produce changes; keywords narrow them. Changes beyond the first 64 KiB
of extracted text are not detected. JavaScript-rendered content is not executed.

## Contact turns and budgets

A relevant change sets a pending flag. `dispatchTasks` admits the turn under a budget
separate from the six work turns: 20 change turns over the task's lifetime and 3 per
task per rolling day, still counted in the contact's 30 task turns per day. The turn
receipt, counter increment and pending-flag clear are in the same D1 batch as the
turn, with current state, generation, blockers and budgets rechecked inside it.
Several changes before a turn coalesce into one turn that receives up to three recent
change excerpts. At the lifetime limit checks stop. These are implementation defaults.

Work IDs are `task-<taskID>-g<generation>-m<n>`. They use the existing execution
generation guards, tools and permissions of task turns (private: no MCP, mini apps,
native actions, images, schedules or group publication; groups: the hidden task
notice). Changed lines are presented as untrusted page text; contacts are told not
to follow instructions found in them and to report only what matters.

Every write from a check requires the URL and execution generation the check started
with, so a revoked or replaced URL, or paused work, cannot receive a late result.
Changing the URL increments the execution generation, clears a pending change and
deletes the stored page text; the next check starts a new baseline. Each due check is
claimed with a conditional update before fetching, so concurrent Cron runs fetch once.

## Retention

`task_monitor_state` keeps the latest extracted text (up to 64 KiB), hash, the last
eight hashes and check times for the task's current URL. `task_monitor_check` keeps
the latest 20 checks per task with outcome, HTTP status, error code and the change
excerpt. Clients receive outcomes and times, not excerpts. Both are deleted with the
task (contact, group and account cascades). Removing a monitor deletes its stored text
but keeps the check log until the task is deleted.

## API

`PATCH /contacts/:id/tasks/items/:taskID` and `/groups/:id/tasks/items/:taskID` accept,
with the task `version`: `monitorURL` (string up to 2,048 characters or `null`),
`monitorKeywords` (up to 300 or `null`) and `monitorInterval` (`60`, `360`, `1440`).
Each task in the board adds `monitorURL`, `monitorKeywords`, `monitorInterval`,
`monitorTurnsUsed`, `monitorTurnLimit`, `monitorPending` and `monitorChecks`
(latest five: `checkedAt`, `outcome`, `errorCode`, `httpStatus`).

## Cache

No new client cache: monitor fields travel in the existing task board snapshot,
refreshed every five seconds while visible, and replaced by every mutation. Editors
submit the version captured when they opened. See [caching](caching.md#task-boards).

## Cost and quotas

Checks use the existing minute Cron: at most five fetches per run (below the free
plan's 50 subrequests per invocation, shared with the other Cron tasks), plus a few
D1 reads/writes per check. Only relevant changes cause Meta inference. Workers, D1
and Workflows quotas still apply; reusing them does not guarantee free operation.

## Verification

Static only: API and web TypeScript, a full iOS Simulator Swift typecheck, and the
statements of `scripts/checks/persistent-task-sql.cjs` (now including both
dispatcher selections and admission budgets, monitor checks and board reads),
prepared both against SQLite at expression depth 100 and on local workerd D1.
Not verified: fetching real pages, extraction quality, diff noise, redirects, keyword
filtering, concurrent Cron claims, the change-turn budget under concurrency, revoke or
reassign during a fetch, pause during a change turn, group grantor departure, contact
report quality, and both clients on device/browser. Use fictional tasks and pages you
control when authorized.
