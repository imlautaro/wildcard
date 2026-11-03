# For you

For you is a personal, adaptive feed that a person's contacts build together. Each
card is about something the person actually cares about (their team's league, the
processing times of an application they are waiting on, the exchange rates they
follow, a trip) and is prepared by the contact best suited to it, with its own
layout. For you also gives quick access to the mini apps the person opens most and
an agenda of upcoming schedules and tasks assigned to them.

On iOS, For you is the second tab of the signed-in shell (Chats stays the default).
On the web it lives at `/updates`: on wide screens it is the first item of the
navigation rail and where `/` lands; on a phone-width screen it opens from the Home
button in the chat list header (or **Menu → For you**) and `/` goes to the chat list.

The feature first shipped as "Home" (default tab), became "Updates" on
2026-10-30, and was renamed "For you" with a Home icon on 2026-11-01.
Since 2026-11-02 iOS uses the `rectangle.stack` SF Symbol and web the shared `feed`
icon (Solar Feed); web lists For you below Chats in the sidebar and `/` opens Chats. This changes
labels and presentation only: `/updates`, API paths, storage, badges, navigation
defaults and session cache behavior remain unchanged.
The 2026-11-01 feed refinement removes the date, greeting, briefing and contributor
summary from both clients. The page title and feed controls lead straight into the
follow box and timeline. Timeline posts have 24 points/pixels above and 20 below,
with separators; topic threads keep their compact connected layout.
The API and storage keep that original name: `/api/v1/home`, the `home_*` tables,
`HOME_FEED_ENABLED` and the `apps/api/src/home/` module; client data types are
`HomeFeed`/`HomeCard`.

This is a first implementation (2026-10-30). See [verification](#verification).

## Using it

- **Posts** appear as contacts finish them, newest first, like a Threads or X
  timeline; a status pill shows who is preparing what ("Lucía is preparing Barça este
  finde · 2/5"). Each post is a short text from a contact, alone (a note) or with a card attached
  (see [posts](#posts)). When a run adds posts while the person is scrolled down, a
  **N new posts** pill scrolls back to the top.
- **Pull to refresh** (iOS) or **Update now** (web, and iOS **⋯ → Update now**)
  asks the contacts to refresh cards older than 30 minutes; a contact with nothing
  new posts nothing. Requests within a
  minute of the previous one are ignored.
- **Follow something** (**+**, or the "What should your contacts follow?" box above
  the timeline): describe a topic of interest. The field prompts "A topic you’re
  interested in…". The curator picks the layout and the contact on the next run.
- **Post actions**: the heart is **More like this** and the bubble (with the comment
  count) opens the post to [comment](#comments) on it. ⋯ (or a long press on iOS) offers **Message {contact}**, **Less like
  this** and **Hide from For you**. Feedback is per topic, so every post on a topic shows
  the same heart. Hidden topics never come back unless the person shows them again in
  **Topics**. On the web, **Less like this** turns that post into a
  [notice](#less-like-this) instead of leaving it unchanged.
- **Timeline** (both clients): a single column of posts, each led by the contact
  (avatar, "name › topic · age"), then its text and the card in a rounded frame. Each
  kind shows one headline, two matches, three figures or items, four table rows (plus
  the highlighted one), a compact chart or a tracker without its steps until **Show
  more**, which also reveals the reason and sources. Coming up and apps are one strip
  of chips above the timeline.
- **Threads**: tapping a post's text or age (web) or the post (iOS) opens every post on
  its topic, newest first like the timeline, joined by a line, with the cards expanded and **Reply to
  A post with **N posts in this thread** has older ones. The web
  keeps it in the address (`?thread=<topic>`), iOS pushes it on the navigation stack.
- **Notes** can suggest a reply. Tapping it opens the chat with the message in the
  composer (only if the composer is empty); it is never sent automatically.
- **From a chat**: when the person asks a contact to keep an eye on something or to
  put it in For you, the contact calls `add_to_updates`. The topic is attributed to that
  contact and stays until hidden.
- **Your apps**: enabled mini apps the person has opened, most used first, plus
  ones created in the last three days. Tiles open the mini app full screen (iOS) or
  its page (web).
- **Coming up**: up to four active schedules due in the next 48 hours and up to
  four open tasks assigned to the person, each opening its chat.
- **New-post badge**: the For you tab (iOS) and the For you button and menu item
  (web) show how many posts were published since the person last opened
  For you. Opening For you clears it. See [New-card badge](#new-card-badge).

Fixed interface copy is English like the rest of the app; card text is written by
the contacts in the language the person uses with them.

## First visit and empty feeds

After setup, both clients open **Chats**, where the existing first-circle progress,
ready contacts and retry action are available. Web onboarding navigates directly
to `/chats`, including the redirect from an already-finished `/onboarding`; normal
wide-screen `/` visits still open For you.

The feed response includes optional `setup`: `creating_contacts`, `needs_contacts`
or `null`. The server derives it from the person's current contacts and onboarding
status, with the same eligibility used for dispatch and signal selection: an
unarchived contact, not clearing history and no longer `setup_pending`.

- **Creating contacts**: "Your circle is taking shape", with **Go to Chats**.
- **No ready contacts and none being created**: "Make yourself at home", with
  **Add a contact** opening Contacts (where creation and shared-contact joining live).
- **Ready contacts without posts**: "A feed that grows with you", with **Start a
  chat** and **Follow something**. Actual feed generation still shows progress.

These are welcome states, not failures. The follow box and add/update controls
wait until contacts are ready; apps and agenda remain accessible. Cached posts
remain visible if contacts become unavailable. Older APIs' `HOME_NO_CONTACTS`
maps to the no-contact welcome state in both clients. Actual request failures
still offer Retry.

Dispatch waits for a ready contact before claiming a Workflow or invoking a model.
A feed already viewed remains due while empty, so the next GET or minute Cron can
start it when the first contact becomes ready. Legacy no-contact failures are
eligible immediately once a contact is ready. If contacts disappear between
dispatch and planning, the run finishes as waiting, without an error or advancing
`generated_at`, and becomes due again in a minute. No new schema or service is needed.

Setup snapshots use the existing session feed cache. While contacts are being
created, visible feeds poll every four seconds. Returning to a setup state
revalidates in the background immediately, and changes to contact identity/readiness
invalidate the snapshot (while mounted on web; from the iOS shell). The server,
not the client list, decides readiness. See [caching](caching.md#updates-feed).

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
| `note` | A text-first post: the contact's text alone, with a rare optional suggested reply | A take, reaction, recommendation, prediction or striking fact ([post formats](#post-formats)) |
| `list` | Numbered rows with detail and trailing value | Trip checklist, releases, events |

Every card has a title, optional subtitle, an icon and an accent from closed sets,
and up to five sources. A card is at most 12,000 characters of JSON. Freshness per
kind: matches and metrics 2 hours, headlines 4 hours, chart 6 hours, note, table
and list 12 hours, tracker 24 hours.

## Posts

Since 2026-11-01 (migration 0086) For you is a timeline. `home_card` still keeps the
latest card of each topic, which schedules runs, feeds the editor and reviews, and is
still returned as `cards`; every published card is also appended to `home_post` as a
post:

- **Text**: one or two short sentences (at most 280 characters) in the contact's
  voice, written as a standalone social timeline post: lead with the news,
  observation or opinion, without addressing the account holder, "you/your",
  private-chat callbacks, personal coaching or a closing question aimed at them.
  Card prose and note text follow the same direction, without greetings,
  signatures or hashtags. Personal context still selects relevant topics; this
  wording does not publish data, add readers or change feed access. These are model
  instructions, not a deterministic language filter; existing posts are preserved.
  A note card has no separate text: its text is the post. Cards published before posts
  existed were copied as posts without text, which show the card alone.
- **Nothing new**: a contact recomposing a topic sees its previous card and up to three
  earlier posts on the topic (dated) and may answer `{"action":"no_news"}`. Nothing is
  posted, the card counts as fresh for its kind's lifetime (so the next run is not
  due sooner) and, unlike a [skip](#skipped-topics), it is never counted against the
  topic. The composer is told never to repost the same thing in other words. A run still
  pays for the model call (and any search) that finds nothing new.
- **Replies**: a [review](#contacts-review-cards) revision is a post by the reviewer
  that replies to the latest post on the topic ("Replying to {contact}").
- **Order and retention**: the API returns the newest 50 posts of active topics from the
  last 14 days. Posts older than 14 days are deleted at the next run; hiding a topic
  deletes its posts at once and a retired topic's posts leave the timeline with it (and
  are deleted with the topic seven days later).
- **Idempotency**: a run writes at most one post per topic (`<topic>-<revision>`, plus
  `-review`), so a retried Workflow step rewrites its own post instead of adding one.

Clients fall back to one text-less post per card when the API has no `posts` field (an
API from before migration 0086), so either can be released first.

## Post formats

Since 2026-11-02 the editor and the composers are told to write For you like a
timeline people follow for its angle, not a dashboard (prompt changes only, in
`home/curator.ts` and `kindGuide` in `home/cards.ts`):

- **Text-first posts**: `note` is the native post (a take, a reaction to news, a
  recommendation, a prediction, a striking fact or a short recap; best under 280
  characters) instead of "the last resort when there is no usable data". Its suggested
  reply (`prompt`) is optional and rare. Clients already draw a note as plain post text,
  so no client change was needed.
- **Mix**: at least a third of the topics should be text-first; data layouts (matches,
  metrics, table, chart, tracker) are for figures that actually move. Interests include
  culture, people, ideas, hobbies, work fields and places, and topics must be specific.
- **Voice**: one angle per post, specific names and figures, no filler; a shared link is
  a `headlines` card with one item under the post. Briefs describe the subject rather
  than the person, and composers avoid implicit second person ("si estás…") as well as
  "you/your".
- Topics are spread across contacts so different voices post.

These are model instructions, not validation; the card catalog and limits are unchanged.
Since the same change, a note post's text (stored in its card) counts as post text for
`earlierPosts` and quoting; before, note topics never saw their earlier posts, which made
repeated notes more likely.

## Quote posts

Since migration 0096 a post may quote another contact's recent post, like a quote post
on X. Each composer (not reviews, not connector topics) receives up to six
`otherContactsPosts`: posts from the last three days on other topics, by other contacts,
never connector posts, with note text included. It may add `"quote":"q<n>"` to its
publish answer when it has something to add (agree with a twist, disagree, add a fact);
most posts quote nothing. The server maps the reference to the post ID and stores it in
`home_post.quote_of` only if that post still exists for the same person and is not a
connector post.

- **Feed**: each post has `quote: { id, contactID, contactName, contactPhotoVersion,
  text, title, createdAt } | null`, present only while the quoted post's topic is active.
  The quoted post's own deletion clears the link (`ON DELETE SET NULL`).
- **Clients**: both draw the quoted post in a bordered box (avatar, name, topic, age and
  up to four lines) below the post text, or below a note's text; tapping it opens that
  post with its comments (web `?post=<id>`, iOS `.updatesPost`). A quoted post older than
  the 50 posts the feed returns opens as "no longer available".
- **Comments**: the contact replying to a comment on a quote post also sees the quoted
  post (`yourPost.quoting`).
- Older clients ignore `quote` and show the post without it.

## News scan

Before planning, a run may scan the web for what is new around the person's main
interests, one search per interest, so topics can react to what actually happened
(`scanNews` in `home/curator.ts`):

1. If scans from the last twelve hours exist (`home_research` with `topic_id =
   'news-scan'`, up to three), they are reused at no cost.
2. Otherwise one small model call (`reasoning: minimal`) picks up to three of the
   person's strongest ongoing interests and writes one public query for each, never
   combining interests. Strongest first: requested topics, then what the person raises in
   messages or comments, then contact memories; one-off questions and passing mentions are
   not interests. It gets today's date and names the subject and current month and year in
   each query. It never includes names, contacts, private details, health or money, and
   returns no queries when interests are thin.
3. The queries run side by side through the For you research path (`homeResearch`),
   with ids fixed per revision and index, so they share the budgets and a retried step
   replays them. A failed search is left out.

The editor gets every scan (clipped) as `worldThisWeek`, labeled by interest and query.
A non-connector composer gets the scans whose interest or query matches its topic's
keywords (`whatsNewThisWeek`), or all of them shorter when none matches. Any failure plans
without them. Like composer queries, the queries are written by a model under
instructions, not filtered deterministically. The daily For you research cap is 18
(three scans every twelve hours leave composers about twelve searches a day); runs
checkpointed before per-interest scans carry a single scan and still work (`newsScans`).

## Freshness

The search provider often ranks old, well-indexed pages first, and its hits carry no
publication date (snippets are empty). Three rules keep old news from being posted as new:

- **Research reports are dated.** `researchWeb` (`research/model.ts`, shared with chat
  research) tells the model today's date and, for news questions, to prefer pages from
  the last 14 days, put a date next to every item, leave out undated or older items, and
  say in the first line when the newest coverage is older than two weeks.
- **Unconfirmed hits are never links.** When a report has no citations and no opened
  pages, research credits its top search hits as sources (`searchResultsCredited`, or a
  title-only synthesis with `synthesisCalls`).
  Those are bare titles, often years old, so For you drops them (and the report's
  "Search results this answer drew on" line): the composer gets no `sources` or
  `otherSources` and an `unconfirmed` note instead. The news scan does the same.
- **Composers apply a seven-day window.** A news item (announcement, signing, release,
  result, headline) counts as new only when the evidence dates it within the last seven
  days and it is not already among `earlierPosts`. Older or undated items appear only as
  dated background; otherwise the contact answers `no_news` or `skip`. Every `checkedAt`
  is described as the time of the search, not of the events. Figures (scores, prices,
  standings, processing times) still show the latest value with its date.

The 14- and 7-day windows are prompt rules, not deterministic filters.

## Relevance

How the editor decides what the person actually cares about:

- **Evidence strength.** The editor ranks interests: requested topics first, then
  subjects the person raises themselves in recent messages or comments on posts
  (especially repeatedly or recently), then contact memories. A one-off question, an
  errand, a passing mention or something a contact assumed is not an ongoing interest.
- **Comments are engagement.** `readSignals` adds the person's own comments on posts
  from the last 14 days (up to 15, with the post's topic and text) as
  `theirCommentsOnPosts`; the editor favors those subjects.
- **Requested topics keep their words.** For a topic whose source is `person` or
  `contact`, the plan may refine the title, kind and contact, but the stored brief is
  never overwritten. The editor's sharper brief only reaches that run's composer, which
  also gets the original as `card.requested` and is told not to drift to a related
  subject. Briefs rewritten by runs before this rule are kept as they are now.
- **Requested topics always research.** Unless it reads connectors, a requested topic
  always gets `research_web`, whatever the editor answered.
- **Focused queries.** Composers are told to name the specific subject and, for news,
  the current month and year, asking what happened in the last week.

## Topics to follow

The editor also returns up to five `suggestions` `{ title, reason }`: topics adjacent to
what the person follows (a rival team, a related creator, an upcoming event, something
from the news scan) that are not already followed or hidden. They replace the previous
list in `home_feed.suggestions_json` (migration 0096) on every plan, and `GET /home`
returns them as `suggestions`, without those whose title now matches a topic.

On the web, on screens at least 1100px wide (the pane beside the navigation rail is then
about 1000px), a sticky **Topics to follow** column sits to the right
of the timeline, like X's sidebar. **Follow** sends the title through the existing
`POST /home/topics`, which starts a run; **Follow something else** opens the Follow
sheet. The ✕ beside **Follow** (**Not interested**) calls `POST /home/suggestions/dismiss`,
which saves the suggestion as a hidden topic (`source` `curator`, no run): `GET /home`
then drops it from `suggestions` and the editor never suggests it again, like any hidden
topic. It appears as hidden in **Topics**, where **Show** follows it. The column is hidden
when there are no suggestions, during setup and on narrower screens. **Web only** by
request: iOS ignores `suggestions` for now.

## Less like this

**Less like this** records `feedback: less` on the topic, as before (the editor lowers or
drops it on the next plan). On the web the post it was chosen on then stays in place as a
short notice, "Got it. You'll see less like this.", with **Undo** (clears the feedback and
shows the post again) and ✕, which calls `POST /home/posts/:id/dismiss`: that one post gets
`home_post.dismissed_at` (migration 0098) and is no longer returned by `GET /home` or
counted by the badge, on any client; its topic and other posts are untouched. The notice
appears only once the feedback is saved and lasts until the page is reloaded; clearing the
feedback from another post of the topic also restores it. iOS keeps the menu toggle without
the notice.

## Comments

Since 2026-11-01 (migration 0086, `home_comment`) the person can comment on a post and
the contact who wrote it answers there, like the replies under a Threads post. The
bubble on a post opens it (web `?post=<id>`, iOS a pushed **Post** view) with the
comments, a composer ("Reply to {contact}…") and **Continue in chat with {contact}**.

- **One row per exchange**: the person's text (1–1,000 characters) and the contact's
  reply (`pending`, `complete` or `failed`), like a chat turn. One reply is pending at a
  time per post (`409` otherwise), at most 20 comments per post; a reply that has not
  arrived in five minutes shows as failed and no longer blocks commenting.
- **Reply**: `POST /home/posts/:id/comments` starts a `home-comment` instance of
  `CHAT_WORKFLOW` (one retry). The contact answers in its voice and the language of the
  comment, in one to three sentences unless asked for more, from its post, the card,
  earlier comments on the post and matching things contacts remember about the person.
  It may run one `research_web` search (For you daily budgets) and never invents
  figures. It cannot act from the comments: for reminders, tasks or a longer talk it
  may [write to the person privately](#private-messages-from-comments), or otherwise
  points to the private chat. Connector posts and connector-isolated contacts are answered with
  Standard and without research or memories; otherwise the account model is used,
  falling back to Standard when the contact lacks Contributor consent.
- **Continue in chat**: opens the private chat with the post attached to the next
  message ([Continue in chat](#continue-in-chat)). Independently, the contact's private chat context includes, as untrusted
  history, the two most recent posts the person commented on in the last three days
  (post text, clipped card and the comments), excluding connector posts, so the contact
  picks the discussion up without the person repeating it. Not in connector-isolated
  chats, schedules or tasks.
- **Polling**: while a reply is pending, the clients poll the feed every few seconds
  (the web restarts its timer at once instead of waiting out the 60-second one).
- **Retention**: comments are deleted with their post (14 days, hidden topic, account
  deletion).

## Private messages from comments

Since 2026-11-01 (migration 0088) the contact answering a comment can also decide to
write to the person in its private chat, as a message it starts itself. The comment
still gets its short reply ("te escribo por privado…"), and the private message arrives in
the chat with the post attached above it, like a [Continue in chat](#continue-in-chat)
message but on the contact's side.

- **When**: the model decides, through an optional `privateMessage` next to `reply` in
  the comment's JSON answer. It is told to write privately only when the conversation is
  better one-on-one (the person asks it to do something such as a reminder, task or
  plan, shares something personal, or wants a longer talk), and to set it to `null` for
  most comments. The message must stand on its own, offer the next step or ask the one
  question it needs, and never claim it already did something: tools only run once the
  person answers in the chat.
- **Limits**: at most one private message per post; only while the person allows the
  contact to message first (**Initiative**, `contact.initiative_enabled`); never for
  connector posts; not while the chat is being cleared or the contact is archived. When
  any of these rules it out, the option is not offered and the old "continue in the
  private chat" wording applies. It is not counted against, and does not start,
  [conversation initiative](initiative.md) budgets, and like new human input it ends a
  pending initiative episode in that chat; its push follows the normal reply push
  (suppressed while that chat is open).
- **Storage**: a `chat_turn` with `user_text = ''`, `status = 'complete'`, the post in
  `home_post_id`/`home_post_json`, and `home_comment_id` naming the comment. Its ID is
  `home-dm-<comment id>` and `home_comment_id` is unique, and it is written in the same D1
  batch that completes the comment, only while the comment is still pending, so a
  Workflow retry cannot send it twice.
- **Context**: in later turns the contact reads it as its own message, marked as written
  privately after a comment on that post (no "replying to your post" marker on the
  person's side); the [discussion context](#comments) still includes the comments.
- **Clients**: the feed's comments carry `privateMessage: true`, shown under the reply as
  **Messaged you privately**, which opens the chat (it does not attach the post again).
  In the chat, both clients show the post reference above the contact's first bubble
  when the turn has a `homePost` and no content from the person. Older clients ignore
  the flag and show the message without the post.

## Continue in chat

Since 2026-11-01 (migration 0087) **Continue in chat with {contact}** on a post opens the
contact's private chat with that post attached to the next message, like replying to a
story. The composer shows the post above the text field (with ✕ to drop it); the sent
message shows it above the bubble, and tapping it opens the post (web
`/updates?post=<id>`, iOS a pushed **Post** view).

- **A reference, not a quote**: `POST /contacts/:id/chat/turns` accepts
  `homePost: "<post id>"` and stores it as `chat_turn.home_post_id`. The post must be the
  person's, written by this chat's contact, and not a connector post (`400` otherwise);
  for connector posts the button only opens the chat, because connector content never
  enters a private chat.
- **The contact reads the live post**: for a message the person sends this way the chat context says it answers a
  post the contact itself published, with the post text, the clipped card and up to six
  comments, so it talks about it directly. Later turns keep a short marker with the
  post's title and text. Messages answering a post are never batched with others.
- **Expiry**: posts are deleted after 14 days or with their topic, so there is no
  foreign key. `home_post_json` keeps `{ title, text, icon, accent, createdAt }` from when
  the message was sent; afterwards turns return `homePost.available: false` with that
  snapshot ("No longer in For you") and the contact is told the post is gone and what it
  said.
- **Turns** return `homePost: { id, available, title, text, icon, accent, createdAt } | null`.
  Older clients ignore it; older APIs reject the unknown `homePost` field, so release the
  API first.

## How curation works

A **curation run** is a `kind: 'home'` instance of the existing `CHAT_WORKFLOW`
(`apps/api/src/home/workflow.ts`), started by the minute Cron (`dispatchHome`) or
directly by an API request, with one durable step per stage:

1. **Plan** (one model call, structured output). The editor reads the person's
   [signals](#what-updates-reads) and returns 2–8 topics in order, each with a layout,
   the contact that prepares it, whether it needs web research or a connector, a
   reason shown to the person, up to five [topics to follow](#topics-to-follow), plus a
   one-sentence briefing retained in the API for
   compatibility (current clients omit it from the header). It first gets the
   [news scan](#news-scan) when one is available. Topics
   the person or a contact asked for are always kept; curator topics left out are
   retired with their cards once those cards are stale (a fresh card is never
   discarded by one plan). Retired topics are deleted after seven days. Hidden topics are given to the editor as "do not
   recreate".
2. **Compose** (one step per card, at most six per run, requested topics first, then
   in plan order). Only new
   topics, expired cards and, after a manual update, cards older than 30 minutes are
   composed. The assigned contact writes the card in its own voice, with its
   personality and specialties, the relevant things contacts remember about the
   person, the previous card, its earlier posts on the topic and the titles of the other cards. It may call
   `research_web` (one search per card, four per run) and, for connector topics,
   `list_mcp_tools`/`call_mcp_tool` (three reads per card), then answers with a post
   (text and card), says there is [nothing new](#posts), or skips with a short reason. An invalid card gets one repair round; a skip keeps
   the earlier card for another hour and is remembered on the topic (see
   [skipped topics](#skipped-topics)). Each card is saved as soon as it is ready, so
   the feed fills progressively.
3. **Finish**. The next automatic run is due when the first card expires (between
   one and twelve hours later), or ten minutes after a failed run.

4. **Review** (since 2026-10-31, see [contacts review cards](#contacts-review-cards)).
   Contacts who know more about a card's topic revise it.

Runs are fenced by a per-person revision: a newer claim makes an older instance's
writes no-ops, and a run that has not finished after 45 minutes can be claimed
again. Automatic runs happen only while the person opened For you in the last three
days; a feed that was never opened never runs.

Triggers: the first For you view, **Update now**/pull to refresh, following a topic,
showing a hidden topic again, a contact's `add_to_updates` (picked up by the minute
Cron once the person has opened For you) and card expiry.

## Skipped topics

A contact composing a card may answer `{"action":"skip","reason":"..."}` when it
has nothing honest to show. Since 2026-10-31 (migration 0080) the topic keeps
`skips` (consecutive skipped runs) and `skip_reason` (the last reason, one short
English line for the editor, at most 200 characters):

- The editor sees them as `skippedRuns` and `lastSkipReason` on each topic and is
  told to reassign it to a better placed contact, rewrite the brief, or drop a
  curator topic, instead of returning it unchanged.
- A curator topic skipped three runs in a row (`homeLimits.skipsToRetire`) is
  retired with its card. Topics the person or a contact asked for are never retired
  this way; they stay until the person hides them.
- A published card resets both fields. A reviewer's skip during
  [review](#contacts-review-cards) only keeps the card and is not counted.

## Contacts review cards

A card used to be written only by the contact the editor assigned, so a contact who
knew little about a project could publish a weak card while another contact, with
whom the person had talked much more and more recently, knew better. After the cards
of a run are composed, `home/review.ts` checks the feed without any model call:

1. For up to eight non-connector cards, it builds a full-text query from the card
   title's specific words (at least four letters, common words removed) and counts,
   per contact, the person's completed private chat turns from the last 60 days that
   match, with the latest match time. Scheduled, task and group-request turns,
   archived and still-being-created contacts, and connector-isolated contacts are
   excluded.
2. A card becomes a review candidate when another contact has at least two matches,
   its latest match is newer than the card, and it has more matches or a more recent
   match than the card's author. The most recent such contact is the reviewer; at
   most two cards are reviewed per run.
3. The reviewer composes the card again with the usual card prompt, the previous card
   and up to six of its own matching conversation turns (dated, clipped to 400
   characters per side, marked untrusted), told to publish a revision only if its
   conversation adds newer or more complete facts and to skip otherwise. Web research
   and connectors are not used in a review.
4. A revision replaces the card (new revision and generation time), is posted as a reply
   to the topic's latest post (so it shows in the [badge](#new-card-badge)), moves the
   topic to the reviewer and sets the reason shown on its posts to "{contact} updated
   this with newer details from your chats". A skip
   keeps the card. Each review is its own Workflow step with one retry and the run's
   revision fence.

Reviews happen during curation runs, so a better-informed contact catches up at the
next automatic or requested run (one to twelve hours, or **Update now**), not
immediately after a chat. The reviewer reads only its own conversation with the
person, which already belongs to the person's own data used by For you.

Checked on 2026-10-31 with `muse-spark-1.3-contributor` and fictional data: given a
"Proyecto Lumen" note saying the project was still an idea, a reviewer whose chat said
the beta launched with 40 users and payments come next published a tracker with
those facts; with only an older "still thinking about the idea" excerpt it skipped.
The review SQL was run on the local workerd D1.

## What For you reads

Only the person's own rows: their contacts (name, personality description and
specialties, which connectors each contact has), what any of their contacts
remembers about them (up to 60 recent `contact_memory` facts across all their
contacts), their own last 30 private messages and 12 group messages, their
connectors' approved read tools, their mini apps and usage, their active schedules
and their Topics, feedback and current cards.

Chats the person keeps private ([privacy](privacy.md)) are excluded from memories,
messages and contact reviews. Connector-isolated private chats and groups (`mcp_private_contact`,
`mcp_private_group`) are excluded from these signals, so their history never reaches
a Contributor call. Pooling what the person's own contacts know about the person is
intended: the contacts curate For you together. For you never reads other participants' memories or
messages from shared contacts or groups, and its output is never written back into
contact memory. The [news scan](#news-scan) turns these signals into one public search
query about interests only. Card JSON is stored in D1 (`home_card`) until it is replaced,
retired, hidden or the account is deleted.

## Connectors in For you

A connector topic lets the assigned contact read the person's own data, for example
an exchange-rate tool or last month's spending from a personal finance connector.

- Any of the person's account connectors can be used, whether or not the tool is
  assigned to that contact (decision for this first version: no per-contact
  restriction in For you).
- Only tools approved in **Connections** that For you considers reads are listed or
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
- The `add_to_updates` chat tool is not offered in connector-isolated chats, so their
  private history does not reach the curator.

## Web research and budgets

`research_web` in For you calls the same research model as conversational research
with a public query written by the contact (instructions forbid personal details).
Each search reserves one slot of the account's and the global daily web research
budget (`web_research_usage`, 30 and 300 per 24 hours) and one of For you' own 18 per
person per 24 hours (`home_research`; 12 before 2026-11-02, 15 with the single-query
[news scan](#news-scan), 18 since its three per-interest searches every twelve hours on 2026-11-03). Findings are saved with the reservation, so a
retried Workflow step reuses them instead of searching again. Saved findings are
deleted after two days (bounded cleanup on later reservations). `WEB_RESEARCH_ENABLED`
also disables For you searches.

Cost bounds per run: one planning call, at most one news-scan query call and three searches
(skipped when scans from the last twelve hours exist), at most six cards, four model
rounds per card, four searches and three connector reads per card.

## API

All routes require the bearer session (the web proxies them with its cookie).
Reads are limited to 90 per minute, writes to 20 per minute.

| Route | Purpose |
| --- | --- |
| `GET /api/v1/home?timeZone=…` | The feed: `enabled`, `status`, `pending`, `briefing`, `progress`, `contributors`, `cards`, `posts` (newest first; each `{ id, topicID, contactID, contactName, contactPhotoVersion, text, replyTo, quote, reason, source, feedback, connector, createdAt, content, comments }`, comments `{ id, text, reply, status, createdAt, repliedAt }`), `suggestions` (`{ title, reason }[]`), `topics`, `apps`, `agenda`. Records the view and the time zone, and starts a due run. |
| `GET /api/v1/home/badge` | `{ unseen }`: posts of active topics published after the last visit (capped at 99, `0` when For you is off). Never starts a run. |
| `POST /api/v1/home/seen` | Record that For you was opened (clears the badge). `GET /home` records it too. |
| `POST /api/v1/home/refresh` | Request an update (409 when For you is turned off). Returns the feed. |
| `POST /api/v1/home/topics` `{ text }` | Follow something (1–400 characters, at most 20 active requests). Returns the feed (201). |
| `POST /api/v1/home/posts/:id/comments` `{ text }` | Comment on a post (1–1,000 characters); its contact answers in the background. `409` while a reply is pending or at 20 comments, `404` when the post or its contact is gone. Returns the feed (201). |
| `POST /api/v1/home/suggestions/dismiss` `{ title }` | Not interested in a [topic to follow](#topics-to-follow): saves it as a hidden topic without starting a run. `404` when it is no longer listed. Returns the feed. |
| `POST /api/v1/home/posts/:id/dismiss` | Remove one post from For you ([less like this](#less-like-this)). Returns the feed. |
| `PATCH /api/v1/home/topics/:id` `{ status?, feedback? }` | `status`: `active` or `hidden`; `feedback`: `more`, `less` or `null`. Hiding deletes the card and its posts. Returns the feed. |

`enabled` is `false` when `HOME_FEED_ENABLED` is not `"true"` or no model key is
configured; apps and agenda are still returned. `pending` is true when a first or
requested run is due but not yet claimed, so clients can show progress at once.

Mini app opens are counted in `POST …/mini-apps/:appID/resolve` (reloads within ten
minutes count as one visit) in `mini_app_usage`.

## New-card badge

Migration 0076 adds `home_feed.seen_at`, set on every feed read and by
`POST /home/seen` (feeds from before it fall back to `viewed_at`). Since migration 0086
a post counts as new when its `created_at` is later (before it, a card's `generated_at`
was counted); a topic with nothing new adds nothing. Both clients
poll `GET /home/badge` every 15 seconds while signed in and active (iOS: the signed-in
shell while the app is in the foreground; web: the chat list), not while For you is
the visible page. Opening For you sets the local count to 0 at once, increments a
badge revision so a read already in flight cannot bring the count back, and calls
`POST /home/seen`. The count lives in memory only and is dropped with the session.

## Caching

Both clients keep one session-owned feed in memory (`HomeFeedStore` on iOS,
`useHome` on the web), dropped on sign-out and account switch. It is never written
to disk because cards can contain connector data.

- Navigation shows the last feed synchronously; the first load shows placeholders.
- Background revalidation after 60 seconds while For you is visible, every 4 seconds
  while a run is in progress or pending. Requests are deduplicated.
- Every mutation returns the whole feed, which replaces the cached one; a newer
  mutation rejects older in-flight reads.
- Transient failures keep usable cards visible; only a first load shows the error.
- The feed is mounted only where a person can see it: its own page or tab. On wide web
  screens (above 860px) `/` redirects to `/updates`, so opening the web app there counts
  as a visit. On a phone-width web `/` redirects to the chat list, which never mounts
  For you, so it never polls or counts as a visit (which would keep automatic runs
  going).
- Link preview images reuse the existing link preview cache and the private image
  cache (iOS) / private image loader (web).

## Infrastructure

Migration `0074_home_feed.sql` adds `home_feed`, `home_topic`, `home_card`,
`home_research` and `mini_app_usage`; every row cascades with the account. The
versioned `HOME_FEED_ENABLED` var in `apps/api/wrangler.jsonc` turns curation runs
on (`"true"`) or off. Runs use the existing `CHAT_WORKFLOW`, minute Cron, D1 and
`META_API_KEY`; no new service, binding or secret. See
[infrastructure](infrastructure.md#updates-feed-migration-0074). Migration
`0086_home_posts.sql` adds `home_post` ([posts](#posts)), cascading with the account and
the topic, and `home_comment` ([comments](#comments)), cascading with the post.
Migration `0096_for_you_quotes_suggestions.sql` adds `home_post.quote_of`
([quote posts](#quote-posts)) and `home_feed.suggestions_json`
([topics to follow](#topics-to-follow)); both are nullable and ignored by older Workers.

## Verification

Post formats, quote posts, news scan and topics to follow, performed on 2026-11-02 on
the `for-you-content` branch, before any release:

- API and web type checks, locale check, and the whole-app iOS static type check.
- Migrations 0001–0096 on a scratch local workerd D1; the changed signal, publish
  (with `quote_of`), plan (`suggestions_json`), feed (quote join), news-scan reuse and
  comment statements prepared with `EXPLAIN` and literal values.
- Live `planHome` and `composeCard` calls with `muse-spark-1.3-contributor`, fictional
  data (Spanish, Argentina; River Plate, Rust, Babasónicos, a trip to Japan) and a
  fictional news report instead of a live scan: the plan mixed one matches card, two
  notes and a list with three specific suggestions; one composer quoted another
  contact's post ("Tomás, ni la IA arreglaba ese medio del domingo…"). A first round
  showed notes addressing the reader with implicit Spanish second person; the voice
  rules were tightened and the second round avoided it in the posts.
- The news-scan query writer, live (six calls, research reservation refused by a stub so
  no search ran), with fictional memories that included a partner's name, an employer,
  a medication and a debt: every query named only interests ("qué novedades hay esta
  semana de River Plate, lenguaje Rust y Babasónicos") and skipped the hidden topic.
  One call with a 400-token cap returned an incomplete response; the cap is now 1,024.
- Web rendering against a mock API at 1440px (light and dark), 1100px, 1060px and 420px
  with headless Chrome: quote box, Topics to follow column (sticky below the bar when
  scrolled), the ⋯ menu opening and closing, and no column below 1100px.

Not verified: the news-scan search and its eight-hour reuse, a deployed run, Follow from
the column against a real API, iOS rendering on a simulator or device, and whether
real feeds feel more interesting over days of use.

Posts, performed on 2026-11-01 on the `updates-posts` branch, before any release:

- API and web type checks, and the whole-app iOS static type check.
- Migrations 0001–0085 on a scratch local workerd D1 seeded with fictional rows, then
  0086: existing cards were copied as text-less posts. The publish, retry (same id
  rewrites), stale-revision fence, review reply, feed, badge, signals, no-news,
  hide, retention and topic-cascade statements were run with literal values.
- Live composer calls with `muse-spark-1.3-contributor` and fictional data (Spanish,
  Argentina): a first post with a matches card, `no_news` when the evidence held
  nothing newer than the earlier post, a post about only the new result when there
  was one, and a review published as a reply ("Actualizo lo de Tomás: …").
- Web rendering against a local mock API (desktop light timeline and thread, phone
  dark timeline) with headless Chrome.
- Comments: the comment, reply, feed, discussion and cascade statements on the local
  D1; two live replies through `replyToComment` against that D1 (Standard model,
  research off): it answered the match time from the card and said it did not know
  the broadcast, and for a reminder request pointed to the private chat. On the web
  mock, sending a comment showed the typing dots and then the reply without reloading.

Not verified for posts and comments: a deployed curation run or comment reply (the
Workflow path), a private chat actually continuing a discussion, research in a reply,
iOS rendering on a simulator or device, the new-posts pill on either client with live polling, and how often contacts
choose `no_news` over days of real use.

Performed on 2026-10-30, before any release:

- API, web and full iOS static type checks.
- Migrations 0001–0074 applied to a scratch local workerd D1; the real signal,
  feed, dispatch, claim, chat tool, plan and compose statements executed with
  bound parameters against seeded fictional data through `getPlatformProxy`.
- A complete local curation run (plan + five cards) against that D1 with the live
  `muse-spark-1.3-contributor` model and web research: Spanish (Argentina) cards for
  a La Liga fixture (`matches`), I-130 processing times (`tracker`), exchange rates
  (`metrics`, with explicitly dated figures when today's value was not found), a
  Champions League topic added through `add_to_updates`, and a note. About 128 seconds.

- Local web rendering (desktop light and phone-width dark) with headless Chrome
  against a scratch D1 seeded with those cards plus fictional chart/table fixtures,
  quick access tiles and agenda items; two CSS defects found there were fixed.

Not verified: deployed behavior, iOS rendering on a simulator or device, Workflow replay in Cloudflare, connector reads against a live MCP server, and concurrency between Cron
and request-triggered dispatches. Card accuracy depends on the research provider;
figures can be days old, which cards are instructed to state.

Private messages from comments (2026-11-01): API, web and iOS static type checks;
migrations through 0088 on a scratch local workerd D1, where the comment insert, the
retry and a second comment on the same post wrote exactly one message, and the feed and
history queries returned the flag and `homeCommentID`. A local `replyToComment` run
through `getPlatformProxy` with `muse-spark-1.3-contributor`: a Spanish comment asking
for a reminder and a rainy-day option got a short reply plus a private message asking to
confirm the time (nothing claimed as done); a casual comment got only a reply. Not
verified: rendering on web or iOS, push delivery, deployed behavior.

## Limitations

- The 2026-11-01 spacing, header, post-voice and first-visit refinements have only
  static validation: API/web type checks, complete iOS Simulator Swift type checking
  with the project's MainActor setting, and preparation of five changed SQL
  statements against 86 migrations in an empty in-memory SQLite schema. No builds,
  functional tests, live inference or persistent migrations were run. Browser/device layout, signup with and without AI contacts,
  readiness transitions, offline/reopen/account switching and actual generated
  wording still require functional verification with fictional data.
- Native device reminders (EventKit) are not read; the agenda covers server-side
  schedules and tasks.
- Group mini apps appear in quick access, but group conversations are not used as
  topics beyond the person's own group messages.
- Push notifications for new cards and For you widgets are not implemented.
- The read-tool classification for connectors is a heuristic (see above).
