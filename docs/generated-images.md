# Contact-generated chat images

Private contacts and group contacts can call `generate_chat_image` when a visual
adds clear conversational value, including a direct image request. The contact
chooses the prompt and relevant references; ordinary chat should
not be decorated with unnecessary images. This is a model decision, not a promise
that every suitable moment will produce an image.

One response can generate one image with up to three references total, combining
current profile photos and earlier images from the same conversation. Selfies and
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
Web/image search and shell tools are disabled; the output is one square-aspect JPEG
up to the ordinary 5 MB attachment limit. Generation requests time out after 150 seconds and
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
Private scheduled messages and autonomous initiative cannot generate images. Group
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
preparation against all local migrations. This API-only change uses the existing
matching iOS/web image/caption flows and does not alter their UI contracts.
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
