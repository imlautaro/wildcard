# Contact-generated chat images

Private contacts and group contacts can call `generate_chat_image` when a visual
adds clear conversational value, including a direct image request. The contact
chooses the prompt and relevant references; ordinary chat should
not be decorated with unnecessary images. This is a model decision, not a promise
that every suitable moment will produce an image.

One response makes one `generate_chat_image` call, producing one image or an
[album](#albums) of two or three images; each image has up to three references,
combining current profile photos and earlier images from the same conversation. Selfies and
requests depicting the contact itself instruct it to use its own current avatar.
Requests depicting named members instruct it to use every depicted member's current
avatar (two contacts together use both). These are explicit model instructions;
static validation does not prove that every natural-language request selects the
right identities. An unavailable required avatar is reported rather than replaced
with an invented matching appearance. If necessary references exceed the budget,
the contact asks which to prioritize.

Private profile references are limited to the current person and contact. Group
profile references can include current human and contact members who pass scope,
shared-memory and Contributor checks. Reference IDs and current photo versions are
validated before and after inference and before delivery. Old versions and missing
avatars stop generation. The provider prompt distinguishes identity references
from earlier scene/composition references. Generated pictures are illustrations,
not evidence that an event happened or that an avatar proves real appearance.

## Internal image descriptions and retrieval

`search_chat_images` searches internal visual descriptions, attributed caption or
generation context, and sender names for both human and bot photos in this exact
private chat or group. `view_chat_image` supplies selected original bytes to the
next inference. `generate_chat_image.chatImageReferences` uses message ID, side
(`user`, `assistant`, or `group`) and immutable digest from those results; it never
accepts a URL, storage key, another private conversation, or another group.
For example, a request for another angle of an earlier beach image can retrieve
that scene and combine it with the depicted contact's current avatar. Descriptions
and context are evidence for selection, not identity verification or event memory.

A private human-triggered reply and each initial group draft opportunistically
index one eligible unindexed image, newest first. Newly generated photos are also
described after generation completes. The vision request uses the actual pixels,
English visual search descriptions/tags, and attributed caption/generation context;
it uses the conversation's Standard/Contributor selection, including Standard-only
connector isolation. Descriptions are internal: public history, media endpoints,
iOS and web do not show or cache them. They never enter cross-chat shared memory.
One extra Spark vision request per newly described photo adds cost and latency.

Migration `0048_chat_image_references.sql` adds a disposable D1 index keyed by
immutable registered object and digest. Concurrent group contacts share a 60-second
indexing lease. Failed indexing never turns a completed image generation into a
failure; missing descriptions remain retryable after the lease. Descriptions are
bounded to 1600 UTF-8 bytes, context to 1800, and search to six results (up to
seven to preserve a private turn boundary). Caption and
prompt context are explicitly attributed claims; they do not establish what is
visible or whether a pictured event occurred.

Old history is indexed lazily, one missing image per search call, without an
unbounded migration or bulk model bill. `hasUnindexedImages` marks incomplete
coverage; another search may describe more. Search is lexical, using alternative
English visual terms and original caption/name words. `before` pages older source
sequences; private pagination preserves both sides of a turn at page boundaries.
Searches, image views and generation resolve live source messages with current
conversation/membership/consent checks and a bounded sequence watermark. A cached
reference cannot bypass later revocation. Up to three inspected images share an
8 MiB byte budget; generation references share three slots and 8 MiB total (each
chat image retains the 5 MiB upload limit). Bytes are loaded only inside inference
or generation steps and are never checkpointed. Index rows do not retain R2 bytes.

Deleting a source turn/group message removes its index entry immediately. Orphaned
unpublished generation descriptions follow the attachment registry's existing
24-hour grace cleanup. Already delivered derived images remain in conversation
history after their source image or avatar becomes inaccessible; reference
revocation suppresses a derived image still awaiting publication. Only relevant
conversation information is authorized in prompts and labels, never credentials or
unrelated private information.

## Provider and durable delivery

The API uses `muse-image-1.0` with the existing `META_API_KEY`, using
`/v1/images/generations` for text and `/v1/images/edits` for references. Inputs use
private base64 data URLs, never public avatar URLs. The JSON reference shape and
output options follow the [Meta image guide](https://dev.meta.ai/docs/image-generation).
Web search and shell tools are disabled; provider image search is enabled only per
image as described under [albums](#albums). Each output is one JPEG whose
aspect ratio the contact chooses from context (2:3, 3:2, 3:4, 4:3, 9:16, 16:9 or
1:1). Portrait selfies, wide scenes and square compositions are all supported;
explicit format requests take priority. The provider size sets framing rather
than exact output pixels. Output stays within the ordinary 5 MB attachment limit. Generation requests time out after 150 seconds and
provider JSON is bounded to 8 MB before parsing. Image generation uses Muse Image,
independently of the account's Spark Standard/Contributor text selection, as does
onboarding portrait generation. No provider conversation state is created.

Migration `0044_generated_chat_images.sql` records a reservation before a provider
request. A response has one reservation across Workflow and user retries. Completed
receipts reuse their immutable R2 object. A pending/failed or uncertain receipt
never automatically repeats a possibly billed request. A crash can therefore leave
a response without an image; a new human message can request another generation.
Only reference metadata and bounded description/context text enter D1; Workflow
checkpoints carry immutable references and tool results, never image bytes. Bytes
remain in R2 and in the provider request/response. Prompts are not saved in the
receipt table; bounded generation context is retained in the internal image index.
Reference versions and conversation access are checked before and
after inference and again before publication; current group membership/consent and
private turn authorization also gate publication. Replacing/removing a reference
can suppress an image still awaiting delivery. Already delivered derived images
remain ordinary conversation attachments; changing an avatar does not recall them.

In groups, generation is offered only on the initial response to a direct human
message, not bot continuations, draft reviews or designated private-return answers.
Private scheduled messages and autonomous task work cannot generate images.
Private conversation initiative can propose a contextual image without a human
image request, using the same timing, opt-out, pause, consent and outreach limits
as text. It can use current self/human avatars, but cannot retrieve earlier chat
images: its chatImageReferences must be empty. Migration 0079 reserves at most one
image attempt per source episode, separately from the direct human reply.
Failed or uncertain attempts are not regenerated by another evaluation; if the
image is unavailable the caption is also withheld. No extra follow-up entitlement
is created. New input, typing, profile/reference changes, archive, clear, model
selection or permission loss can suppress an image prepared before publication.
Image generation does not invent an offline life or establish a real event. Group
review can keep the already generated image, revise its caption or skip publication;
it never regenerates it. A later human message uses the normal stale-draft review.
The first message contains the image and caption; subsequent messages remain text.
An image message consumes the same group energy as an ordinary message.

## iOS, web and cache

Both clients display the image with its caption, optional quote and ordinary
message time. Groups reuse their existing attachment component and authorized
endpoint. Private delivered `assistantMessages[0].attachment` contains only public
attachment metadata; bytes come from the existing private turn attachment endpoint
with `?side=assistant`, which requires ownership of the same conversation. R2 keys
and digests are never exposed in history. iOS uses its incoming attachment bubble
and full-screen zoom/swipe viewer. Web uses the existing image/file viewer.
Loaded chat thumbnails preserve the complete portrait/landscape composition on
both clients, including optimistic previews, private and group images. iOS bounds
them to 260 by 360 points; web bounds their height to 400 pixels. Loading
placeholders remain stable until pixels arrive; media-gallery tiles stay square.

iOS passes `side=assistant` as a `URLQueryItem` to the shared request builder,
separate from the attachment path. Embedding the query in the path encodes the
question mark and causes a 404, surfaced as a contact-unavailable error. This
correction also covers the full-screen viewer and chat media downloads through
the same API method; web already sends the correct query. Device verification
remains pending.

Private generated images have a distinct assistant-side key/path, preventing a
human's attachment on the same turn from being reused as the generated image.
The existing account-scoped image cache handles deduplication, memory limits,
protected disk retention on iOS, eviction, cancellation, access loss and account
switching. Session conversation stores hold delivered metadata and reject stale
turns normally; no view-local download or new cache is introduced. Group images
retain their immutable message keys. The attachment registry cleanup now also
recognizes assistant message attachments, so delivered images survive cleanup;
unpublished/deleted images are eligible after its existing 24-hour grace period.
Deleting a conversation or group cascades its generation receipts. Image bytes
are removed by the existing retryable registry cleanup.

## Setup, compatibility and verification

Follow [infrastructure](infrastructure.md#contact-generated-chat-images) for migrations,
required resources and automatic release. New clients can read old history without
images. Older private clients show the caption but cannot show the generated image;
old group clients already understand attachments. No new required secret, binding,
account permission or service is introduced.

Validation for image-reference retrieval is static only: API TypeScript and SQL
preparation against all local migrations. The original retrieval change reused the existing
matching iOS/web image/caption flows without altering their UI contracts.
The 0079 refinement below also updates both clients' thumbnail framing.
No model request, functional test, build, device/browser run, remote migration or deployment is implied.

With fictional participants, verify selfies in private/groups, two named contacts,
two avatars plus an earlier scene, user and bot source images, captionless images,
old history backfill and failed description recovery, multilingual lexical search,
private turn pagination with images on both sides, reference removal during paused
publication, connector isolation and attempts to cross private/group boundaries;
then verify text-to-image and one/three reference images;
private and group scope isolation; unavailable/replaced/removed avatars; membership
and consent revocation during generation; pending provider outcomes and retries;
caption/quote layout; received-image full-screen viewer; simultaneous human and
assistant images on one turn; successive messages; group review/skip; repeated
polling, cache reopen, earlier history, offline recovery and account switching;
conversation deletion and attachment cleanup. Confirm actual Muse Image access,
output quality and latency independently before claiming the feature works live.

## Contextual framing and spontaneous images (0079)

The initiative planner returns an optional bounded image proposal with its caption,
then generation runs in a separate four-minute Workflow step with no automatic
retries. Its claim is renewed for five minutes before generation. The same private
R2 registry, immutable attachment metadata and existing assistant image endpoint
serve both clients. A source-linked D1 receipt cascades on source/history deletion;
unpublished objects follow the existing 24-hour grace cleanup. Already delivered
images remain ordinary history. No new image cache, public URL or client polling
is introduced. The planner completion budget is 4,400 tokens including reasoning
(3,400 before 0082 albums);
an image also adds the existing Muse request and bounded description call.

Verify vertical selfies, horizontal scenes, explicit square requests, extreme
portrait thumbnails/captions, optional initiative with enabled/disabled settings,
quiet hours, ignored outreach, daily limits, new input/typing and avatar replacement
during generation, failed/uncertain requests, replay and episode reservation,
clear/delete cleanup, reopen/offline and account changes with fictional data.
Static validation does not establish model choices, delivery timing or UI quality.

For 0079, API/web type checks, Swift syntax parsing, preparation of 42 initiative
SQL variants against 79 empty migrations, 12 image receipt/private access SQL
variants, lifecycle harness syntax and `git diff --check` passed. The private-clear
regression fixture now covers initiative receipts and R2 cleanup, but was not run.
No tests, builds, live inference, browser/device checks, remote migrations or
deployment were performed.

## Albums

A contact can send two or three images as one album on one message when the
content genuinely needs several distinct visuals: a comparison (for example two
engines side by side), before/after, or a short sequence of steps. The model
instruction keeps one image as the norm and forbids near-duplicate variations or
filler. This is a model decision; static validation does not prove when the model
chooses an album.

**Tool shape.** `generate_chat_image` takes `images`: 1–3 entries, each with its own
`prompt` (up to 4,000 characters), `aspectRatio`, `profileReferences`,
`chatImageReferences` (up to three references per image) and `imageSearch`. The tool
argument limit for this call is 48,000 bytes. Distinct references are loaded once
and share one 8 MiB budget across the album. Album images are independent provider
requests that run concurrently, so an album takes about as long as its slowest
image (each request keeps the 150-second timeout) and fits the existing four-minute
group/initiative steps and the private eight-minute preparation step. Provider cost
and description cost (one Spark vision request per delivered image) scale with the
number of images.

**Image search.** `imageSearch: true` sets Muse Image `enable_image_search` so
informative real-world subjects (machines, places, species, techniques) can be
grounded in public reference images. The server forces it off for any image that
has profile or chat references, so avatars and earlier conversation photos are
never combined with a public search, and the instruction forbids personal or
private details in such prompts. Results remain generated illustrations, not real
photos. Provider behavior, cost, latency and accuracy with image search enabled
are **unverified**; confirm them with live inference before relying on it.

**Receipts.** Migrations 0044/0079 keep one receipt per response or initiative
episode, so a response still never starts a second generation. Album receipts store
`attachment_json` as an array of delivered images and `references_json` as an aligned
array of per-image reference arrays; rows written before 0082 (one object, one flat
array) remain readable. R2 keys are `generated/<receipt id>/<index>.jpg`; earlier
single images keep `generated/<receipt id>.jpg`. If some images fail, the receipt
completes with the images that succeeded and the tool result tells the contact to
caption only those, without retrying. If all fail, the receipt is `failed` and any
stored object is queued for cleanup. At publication, each image is checked
individually: an image whose reference changed or whose object is missing is
dropped, and the rest of the album is still delivered.

**Message shape.** A delivered message keeps `attachment` as its first image, so
older clients, previews and existing SQL keep working, and adds `attachments` with
every image in order (including the first) only when the album has two or more
images. Private turns store this in the first assistant message JSON. Groups add the
nullable `group_message.attachments_json` column (migration
`0082_generated_image_albums.sql`); group history returns `attachments` alongside
`attachment`. Older clients show only the first image of an album with its caption.

**Endpoints and media.** `GET .../turns/:turn/attachment?side=assistant&image=N` and
`GET /groups/:id/messages/:message/attachment?image=N` select album image N (0–2).
Without `image`, the first or only image is returned, exactly as before; `part`
still selects the assistant message for voice. Chat details media lists each album
image as its own item with an `image` index. `search_chat_images`,
`view_chat_image` and generation references see every album image (the immutable
digest distinguishes them). Registry cleanup and the reused-object check recognize
album keys, so delivered album images are never removed as orphans. 0082 also
recreates the `chat_image_index` delete triggers from 0048 so deleting a turn or
group message removes the internal descriptions of every album image immediately,
not only the first.

**Group context and previews.** Group context marks an album's first image with
`albumImages`. A group preview with empty text shows "N photos"; album messages
normally carry a caption.

**Clients.** Both clients render albums of two images side by side and of three
as one wide image over two squares. Album cells crop to fill (unlike single images,
which preserve the full composition); the full-screen viewer shows each complete
image and pages through the album: swipe with a page indicator and counter on iOS
(`TabView`), and arrow buttons, keyboard arrows, horizontal swipe and a counter on
web. Chat details media cells open a single-image viewer.

**Cache.** Album images use the existing private image caches. Image 0 keeps the
original keys/paths (`contact/:id/assistant-attachment/:turn`,
`group/:id/attachment/:message`, and the same web paths), so a single image and an
album's first image share an entry; later images add `/image/N` on iOS and
`&image=N`/`?image=N` on web. No new cache, retention, eviction or account-switch
behavior is introduced; access loss and account changes clear album images like
any other chat image.

**Compatibility and rollback.** 0082 is additive (one nullable column). Workflows
checkpointed before this change still publish their single image. Rolling back to
an earlier pushed revision keeps the column and delivered JSON; old code shows the
first image of each album and ignores the rest, and its media/cleanup queries do
not see album images 2–3, which could then be removed by orphan cleanup after the
24-hour grace period. Avoid rolling back past this change once albums have been
delivered, or accept losing those extra images.

**Validation performed.** API TypeScript, web `npm run typecheck`, the whole-app
iOS `swiftc -typecheck`, migrations 0001–0082 on local workerd D1, and `EXPLAIN` on
local D1 for the changed SQL (image sources, cleanup, registry, group context
marker, receipt update), literal checks of the album JSON expansion, and the
recreated delete-trigger bodies exercised on scratch D1 tables (album rows removed,
unrelated rows kept). The real triggers were not exercised against seeded chat rows. No tests,
builds, live inference, browser/device runs, remote migration or deployment were
performed.

**Verify with fictional data:** a direct comparison request producing a two- and a
three-image album in a private chat and in a group; captions that describe each
image in order; partial failure (one image fails); an album using avatars plus an
informative image with `imageSearch`; reference revocation dropping one image;
initiative albums; full-screen paging on iOS and web, cache reopen, offline
recovery, account switching; media grid entries and downloads for images 2–3;
`search_chat_images` finding album images; conversation clear/delete cleanup; and
an older client showing only the first image.
