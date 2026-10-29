# Contact-generated chat images

Private contacts and group contacts can call `generate_chat_image` when a visual
adds clear conversational value, including a direct image request. The contact
chooses the prompt and optional current profile references; ordinary chat should
not be decorated with unnecessary images. This is a model decision, not a promise
that every suitable moment will produce an image.

One response can generate one image with zero to three profile references. Private
references are limited to the current person and the contact itself. Group
references can include current human and contact members who pass the same scope,
shared-memory and Contributor checks as profile inspection. References use real
roster IDs and current photo versions; unavailable references stop the request,
without guessing an appearance or substituting somebody else. Generated pictures
are illustrations, not evidence that an event happened or that an avatar proves
someone's real appearance. Only relevant conversational information should enter
the prompt. No unrelated private history or credentials are authorized.

## Provider and durable delivery

The API uses `muse-image-1.0` with the existing `META_API_KEY`, using
`/v1/images/generations` for text and `/v1/images/edits` for references. Inputs use
private base64 data URLs, never public avatar URLs. The JSON reference shape and
output options follow the [Meta image guide](https://dev.meta.ai/docs/image-generation).
Web/image search and shell tools are disabled; the output is one square-aspect JPEG
up to the ordinary 5 MB attachment limit. Requests time out after 150 seconds and
provider JSON is bounded to 8 MB before parsing. Image generation uses Muse Image,
independently of the account's Spark Standard/Contributor text selection, as does
onboarding portrait generation. No provider conversation state is created.

Migration `0044_generated_chat_images.sql` records a reservation before a provider
request. A response has one reservation across Workflow and user retries. Completed
receipts reuse their immutable R2 object. A pending/failed or uncertain receipt
never automatically repeats a possibly billed request. A crash can therefore leave
a response without an image; a new human message can request another generation.
Only metadata and reference versions enter D1/Workflow checkpoints; image bytes
remain in R2 and in the provider request/response. Prompts are not saved in the
receipt table. Reference versions and conversation access are checked before and
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

Follow [infrastructure](infrastructure.md#contact-generated-chat-images) for migration,
required resources and automatic release. New clients can read old history without
images. Older private clients show the caption but cannot show the generated image;
old group clients already understand attachments. No new required secret, binding,
account permission or service is introduced.

Validation is static only: API/web TypeScript, complete app/shared Swift typecheck,
and SQL preparation against all local migrations. No model request, functional
test, build, device/browser run, remote migration or deployment is implied.

With fictional participants, verify text-to-image and one/three reference images;
private and group scope isolation; unavailable/replaced/removed avatars; membership
and consent revocation during generation; pending provider outcomes and retries;
caption/quote layout; received-image full-screen viewer; simultaneous human and
assistant images on one turn; successive messages; group review/skip; repeated
polling, cache reopen, earlier history, offline recovery and account switching;
conversation deletion and attachment cleanup. Confirm actual Muse Image access,
output quality and latency independently before claiming the feature works live.
