# Stickers

Stickers are transparent-background pictures with one emoji that says when to use them,
as in WhatsApp. People keep a **sticker library** they can use in every private chat and
group; contacts have their own library and send stickers too. Both clients (iOS and web)
offer the same behavior.

## Concepts

- **Sticker**: a PNG of at most 512 × 512 pixels and 300 KB with real transparency, plus
  one emoji (a single grapheme). The emoji is how a contact knows when a sticker fits.
- **Person library**: `owner_kind = 'user'`, up to 120 stickers, global across all chats.
- **Contact library**: `owner_kind = 'agent'`. Two kinds of entries:
  - `avatar` stickers: made by the contact from its own profile photo (up to 12). Agent-wide.
  - `saved` stickers: ones the contact kept from a person ("stole"), up to 30 per person.
    **Scoped to that person's conversation** (`scope_user_id`): other participants of a
    shared contact never see a sticker someone else's chat gave it.
- A sticker in a message is an ordinary image attachment with `sticker: { id, emoji }`.
  The bytes are **copied** into the message (`attachments/…` key), so deleting a library
  sticker keeps old messages and clearing a chat never touches the library.

## Creating a sticker (cutout)

`POST /api/v1/stickers/cutout` takes a JPEG or PNG (up to 5 MB, at most 2048 px per side,
6 MP) and returns the transparent PNG as a **preview**; nothing is stored. Flow in the
apps: **Create sticker** → choose a photo → preview on a checkerboard → choose an emoji →
**Save** (`POST /api/v1/stickers`).

How the cutout works (`apps/api/src/stickers/cutout.ts`):

1. Meta's **SAM 3.1** (`sam-3.1` through `https://api.meta.ai/v1/responses`, the existing
   `META_API_KEY`) segments `person` (or the optional `subject` noun phrase). If nothing
   matches and no subject was given, Muse Spark names the main subject (one noun phrase)
   and SAM tries again.
2. The largest confident mask wins. It is sampled bilinearly in source coordinates and becomes
   the alpha channel; the image is cropped to the subject with a 6% margin and downscaled
   to at most 512 px.
3. The result is a 256-color palette PNG with alpha (≈100–200 KB). Muse Image cannot return
   transparency and Workers have no Canvas, so the compositing is pure JS (`jpeg-js`,
   `upng-js`, `@meta-sam/parser`).

Measured on 2026-11-01 with a generated fictional portrait: ~3 s total, 512 × 512, ≈120 KB.
The cutout is rate-limited to 6 per minute per account. Failure codes: 422 `NO_SUBJECT`,
422 unsupported image, 502/503 when SAM is unavailable.

## API

All routes need the signed bearer session.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/v1/stickers` | `{ stickers: Sticker[], limit }`, newest first |
| POST | `/api/v1/stickers/cutout?subject=` | Raw `image/jpeg` or `image/png` body; returns `image/png` (headers `X-Sticker-Width/Height`) |
| POST | `/api/v1/stickers` | `{ emoji, data }` (`data` = base64 PNG); 201 `{ sticker }`, 409 when the library is full, 422 when not a transparent PNG ≤ 512 px / 300 KB |
| PATCH | `/api/v1/stickers/:id` | `{ emoji }` |
| DELETE | `/api/v1/stickers/:id` | Removes the sticker and its object |
| GET | `/api/v1/stickers/:id/image` | The PNG (private, `no-store`); clients cache by `id` + `digest` |
| POST | `/api/v1/stickers/save` | `{ contactID, turnID, part? }` saves the sticker of a contact message to the library (deduplicated by digest) |
| GET | `/api/v1/contacts/:id/stickers` | The contact's stickers visible to you: its avatar stickers and the ones it saved from you |
| GET | `/api/v1/contacts/:id/stickers/:stickerID/image` | The PNG |
| POST | `/api/v1/contacts/:id/stickers/:stickerID/save` | Copies a contact sticker into your library |

`Sticker` is `{ id, emoji, width, height, size, source: 'upload'|'avatar'|'saved', digest, createdAt }`.
Deleting or editing a sticker never changes sent messages.

### Sending

`POST /api/v1/contacts/:id/chat/turns` and `POST /api/v1/groups/:id/messages` accept
`sticker: { id }` instead of `attachment`/`voice`, with empty `text`. The server resolves the
sticker from the sender's library and stores a copy as the message attachment. History
and turn responses expose `attachment: { name, mimeType, size, sticker: { id, emoji } }`
(never the object key). `GET …/chat/turns/:id/attachment` (and `?side=assistant`) serves
the bytes like any attachment, so sticker bubbles reuse the existing attachment image
cache. Stickers are excluded from **Shared in this chat → Media**. A sticker-only message
previews as `Sticker 😂` in chat lists. Contacts send stickers only in private chats
(see [limitations](#limitations)).

## Contacts and stickers

The contact decides, in a private reply, with three tools (`apps/api/src/stickers/tools.ts`):

- `send_sticker { stickerID }`: sends one from its library as a message of its own after its
  text (or alone, with `"messages": []`). Its message text is the sticker's emoji, so chat
  lists and notifications read naturally.
- `save_sticker { messageID }`: keeps a sticker the person sent ("steals" it), scoped to
  that conversation. It becomes sendable immediately.
- `create_sticker_of_yourself { emoji, expression }`: Muse Image edits the contact's profile
  photo into the requested expression, then the cutout pipeline above makes the sticker. It
  only exists when the profile picture shows **one main character with a clear face**: a real person, a
  cartoon, pixel-art or game character, a robot or mascot with eyes all count; landscapes, logos,
  several characters or a hidden or tiny face do not. Muse Spark checks that once per photo version
  (`sticker_photo_check`); the expression keeps the picture's art style. Checked 2026-11-01 with
  generated fictional avatars (photo, pixel art, robot). A "no" verdict is trusted for six hours only (migration 0092 cleared verdicts from the first, stricter check). At most 3 creations per minute per contact. This costs one vision call,
  one image edit and one SAM request.

The model sees stickers as `[Sticker 😂]` in history; the bytes are never sent to it.
Scheduled messages, task work and initiative do not offer sticker tools.

### Habits and the reciprocity rule

Like the Emoji trait, personalities have a **Stickers** trait (1–10, “Rarely” – “Often”,
`shared/personality.ts`) with the same compatibility rules: older clients that omit it keep
the saved value, profiles saved before it infer it from Emoji, Humor, Expression and
Formality. Contacts without a configured personality get a stable level 2–7 from their ID.
`personality/expression.ts` (`stickerHabits`) draws one nudge per turn, seeded by the turn ID:

- **The person sent a sticker**: a sticker back is the default (chance 0.5 + 0.045 × level,
  95% at most), if one of the contact's fits the mood; words or a reaction otherwise.
- **Loop guard**: when the contact's previous message was a sticker **and** the person
  answered with a sticker, the exchange is complete. The prompt forbids another sticker and
  `send_sticker` is not offered, so the server enforces it too.
- **Otherwise** the personal rate (about 0.5% at level 1 up to 40% at 10), mirrored a little
  to how often the person uses stickers and corrected by the contact's own last eight
  replies so it neither floods nor forgets stickers.
- The moment always wins: no stickers in sad, tense, serious or technical replies.

These rates assume the model follows the nudge; live behavior has not been measured.

## Limitations

- Contacts send, save and create stickers only in **private chats**. In groups people can
  send stickers, and every member sees them, but group contacts do not send or save them.
- Contact stickers made from a profile photo are generated illustrations of the avatar, not
  photographs (see [generated images](generated-images.md)).
- Animated stickers are not supported. Only PNG stickers are created.

## Privacy

A sticker the contact saves from a person stays scoped to that person's conversation. A
contact's own avatar stickers are agent-wide, like its profile photo. Library objects live
under `users/<user>/stickers/` and `contacts/<owner>/<agent>/stickers/`, covered by the
account and agent cleanup sweeps; account or agent deletion also deletes the rows
(migration 0091 triggers). Stickers sent to the model's provider are limited to the cutout
(the person's uploaded photo goes to Meta's SAM and, when "person" finds nothing, to Muse
Spark); this does not grant new consent for Contributor data.

## Infrastructure and rollback

Migration `0091_stickers.sql` adds `sticker` and `sticker_photo_check`. No new bindings or
secrets: SAM, Muse Image and Muse Spark use `META_API_KEY`; objects use the private
`CONTACT_PHOTOS` bucket. New npm dependencies in `apps/api`: `@meta-sam/parser`, `jpeg-js`,
`upng-js` (and `@types/upng-js`). Availability of the `sam-3.1` model for a given Meta key
is **not verified outside the measurement above**. The schema is additive: older clients can
read sticker messages as plain PNG attachments (captionless images) but cannot create
stickers. On rollback keep the migration and objects; deleting the tables loses libraries.

## Web

Code: `ChatComposer.vue` (button), `StickerPicker.vue`, `CreateStickerDialog.vue`,
`StickerEmojiPicker.vue`, `StickerImage.vue`, `useStickers.ts` (cache), `utils/stickers.ts`
(image preparation, emoji validation, image paths) and the sticker branches of
`MessageAttachment.vue`, `MessageReactions.vue`, `pages/chats/[id].vue` and
`pages/groups/[id]/index.vue`.

### UI

- **Sticker button.** In private chats and groups, right of the message field and left of
  the send or microphone button. It is disabled while the composer is disabled or sending
  and hidden during a voice recording.
- **Picker.** An `AppSheet`: a bottom sheet on narrow screens and a centered dialog
  otherwise (one component for both, not a popover), built on `<dialog>`, so focus stays
  inside, Escape or a backdrop press closes it, and focus returns to the sticker button.
  - **My stickers**: first tile **Create sticker** (disabled when the library is full), then
    the library newest first with a count (`n of 120`). Tap sends the sticker at once and
    closes the picker. A sticker's **...** button, a long press (touch) or the context menu
    (mouse) opens its actions view: **Change emoji** (grid of 64 emoji plus a field for any
    single emoji) and **Delete** (with a confirmation line). Escape or **Back** returns to the
    grid before the next Escape closes the sheet.
  - **Contact name** tab (private chats only): the contact's stickers
    (`GET /contacts/:id/stickers`). Tap = **Save to my stickers**; tiles show **Save**,
    a spinner while saving and **Saved** once the library holds the same digest.
  - Empty states per tab, a loading indicator for a never-loaded list, an error notice
    with **Retry** (a loaded list stays visible with a warning), and an action error notice
    (library full, rate limit, unavailable) using the API's message.
- **Create sticker dialog.** Steps: choose a photo (JPEG, PNG, WebP or HEIC that the browser
  can decode) -> the browser applies EXIF orientation (`createImageBitmap` with
  `imageOrientation: 'from-image'`), downscales to at most 1536 px on the long edge,
  flattens transparency on white and encodes a JPEG (quality 0.9, stepping down so it stays
  under 5 MB) -> `POST /stickers/cutout` -> the returned PNG shows on a checkerboard ->
  choose an emoji (must be exactly one grapheme and, like the API, a pictograph, flag or
  keycap) -> **Save** (`POST /stickers` with the preview PNG as base64). On 422
  `NO_SUBJECT` the dialog shows the API message and an optional **What should be cut out?**
  field (2-40 letters, digits, spaces or hyphens, as the API accepts) with **Try again**.
  A 429 disables **Try again**/**Save** for the `Retry-After` seconds and says so; 409
  (library full), 502/503 and 422 show the API message and keep the preview or source so
  the person can retry. **Choose another photo** and **Cancel** abort the request.
- **Messages.** A sticker message (`attachment.sticker`) renders as the bare transparent
  image (at most 160 px, aspect preserved, `object-fit: contain`) with no bubble
  background, rim or tail; the time and receipt sit under it in a small pill. Quotes,
  replies, reactions, selection and the highlight when jumping to a quote work as for
  other messages (the highlight is a glow around the image). Chat-list previews and
  quotes read `Sticker` plus the emoji. Stickers are not shown in **Shared in this chat**.
- **Save sticker.** In private chats, the message menu of a contact's sticker has
  **Save sticker** (`POST /stickers/save` with `{ contactID, turnID, part }`, `part` = index in
  `assistantMessages`, so the image is requested with `?side=assistant&part=N` for parts
  after the first). A status line above the composer confirms or reports the error.
  Own stickers and group stickers have no Save action.

### Sending

`useConversation.send` and `useGroupConversation.send` take a fourth argument, a
`StickerChoice { id, emoji, path }`, and send `sticker: { id }` with empty `text` and no
attachment or voice. The pending record keeps the message UUID and the sticker ID, so the
optimistic bubble, Sent/Received checks, Retry (same UUID) and Delete behave like
attachments (see [attachments](attachments.md)); the bubble reuses the library image
path, so it needs no request. A failed sticker send offers **Retry** and **Delete** (there is
no text to edit). A 404 for a private sticker send is shown as "This sticker is no longer in
your library", because the chat route would otherwise read as a missing contact.

### Cache

Library and contact lists are session-owned and memory only (`useStickers`): synchronous
reuse on reopen (empty results included), 30-second background revalidation, request
deduplication, stale-response rejection by revision, mutation updates, and a full reset on
sign-out or account change. Image keys are account + path with the sticker digest. Details
and invalidation: [caching](caching.md#stickers).

### Limitations (web)

- The browser must be able to decode the chosen image: HEIC works in Safari only, and
  other browsers show "This image could not be read".
- The picker is a sheet or dialog, not an anchored popover; there is no drag-and-drop or
  paste of images into the picker, and no reordering or search.
- Sticker messages open no full-screen viewer.
- The 160 px size is a CSS maximum; very small stickers are not enlarged.
- Contacts do not send or save stickers in groups (server rule), so groups show only the
  person's own library.
- The personality editor lists the **Stickers** trait because it iterates the shared trait
  list (17 traits); no web code hardcodes a count.

### Manual verification checklist (not done)

Static validation only so far: `npm run typecheck` in `apps/web`. Nothing below has been
observed in a browser.

1. Button position: right of the field, left of send/mic, in a private chat and a group;
   absent on other screens; disabled while a message is sending.
2. Picker: opens as a bottom sheet below 600 px and as a dialog above; Escape, backdrop and
   the close button dismiss it; focus returns to the button; Tab stays inside.
3. My stickers: empty state; tap sends and the bubble appears at once with the cached image;
   Retry after going offline resends the same message once; Change emoji, Delete (the sent
   message keeps its image).
4. Contact tab: empty state; tap saves; **Saved** appears and persists after reopening;
   saving the same sticker twice adds no duplicate; 409 shows the library-full message.
5. Create: JPEG, PNG, WebP, a rotated EXIF photo, a large (>6 MP) photo, HEIC in Safari;
   NO_SUBJECT with and without a subject; 429 countdown; cancel during the cutout and during
   save; checkerboard preview; invalid emoji ("ab", two emoji, a digit) rejected.
6. Rendering: own and contact stickers in private and group chats, light and dark themes,
   with a reply quote, a reaction and a quote jump; sticker as a later part of a contact
   reply; **Save sticker** from an incoming sticker; Shared in this chat shows none.
7. Cache: reopen the picker (instant, no spinner), switch accounts with the picker open
   (closes, no stale stickers), sign out and in, delete a sticker used by a pending send.
8. Personality: the Temperament sheet shows 17 sliders including Stickers, saves and reloads.

## iOS

Code (`apps/ios/Wildcard`): `Stickers/StickerPickerView.swift` (sheet, tabs, emoji editor),
`StickerCreateView.swift` (create flow, `StickerSourceImage`, `StickerCreateModel`, checkerboard),
`StickerEmoji.swift` (emoji list, validation, chooser), `StickerImageView.swift` (cached picture and
the bare sticker message), `StickerStore.swift` (cache), `StickerAPI.swift` (models and routes), plus the
sticker branches of `Chat/ChatView.swift`, `Chat/ChatStore.swift`, `Chat/ChatAttachment.swift`,
`Chat/MessageReactions.swift`, `Chat/MessageReplies.swift`, `Groups/GroupViews.swift`,
`Groups/GroupsAPI.swift`, `Images/PrivateImageCache.swift` and `Auth/AuthAPI.swift`.

### UI

- **Sticker button.** A glass circle with the `face.smiling` symbol, the same 44 pt size and
  style as the attachment button, between the message field and the microphone/send button, in
  private chats and groups. It is disabled while the chat is loading, unavailable, clearing or
  sending (in groups also while a message is pending) and hidden while recording a voice message.
- **Picker.** A **sheet with medium and large detents**, not an inline panel: the composer sits in
  a `safeAreaBar` with a keyboard and the existing transcript, message-info and picker UI are sheets,
  so a panel would have to replace the keyboard and resize the history. The sheet is a
  `NavigationStack` titled **Stickers** with **Close**; **Create sticker** pushes the create flow.
  - **My stickers**: a grid whose first tile is **Create sticker** (it reads **Library full** and is
    disabled at the server limit, 120), then the library newest first. Tap sends the sticker at once
    and closes the sheet. Long press opens a context menu with **Change emoji** (a sheet with the
    emoji chooser) and **Delete** (confirmation: messages already sent keep their sticker). Empty
    library: only the create tile and a hint.
  - **Contact name** tab, **private chats only** (a segmented picker above the grid; groups show no
    tabs): the contact's stickers from `GET /contacts/:id/stickers`. Tap = **Save to my stickers**;
    a tile shows a plus, a spinner while saving and a check once the library holds a sticker with
    the same digest (the API dedupes by digest too).
  - Never-loaded lists show a spinner; a failed first load shows **Retry**; a loaded list stays
    visible through failed revalidation (errors of actions such as full library, 429 or
    unavailable appear as a red line above the grid). Pull to refresh reloads the current tab.
- **Create sticker.** `PhotosPicker` (images only, no library permission) -> `StickerSourceImage`
  decodes with ImageIO (`CGImageSourceCreateThumbnailAtIndex`, EXIF orientation applied, at most
  1536 px on the long edge, never upscaled), flattens transparency on white and encodes a JPEG at 0.9
  (stepping down to 0.75 and 0.6 if it exceeds 5 MB) -> `POST /stickers/cutout` (raw JPEG body,
  `Content-Type: image/jpeg`, optional `?subject=`) -> the returned PNG shows on a checkerboard ->
  emoji chooser (64 common emojis plus a field for any single emoji; exactly one grapheme and, like
  the API, a pictograph, flag or keycap) -> **Save** (`POST /stickers` with `{ emoji, data }`, the
  preview PNG as base64). Failures:
  - 422 `NO_SUBJECT` shows the API message, an optional **What should be cut out?** field (2-40
    letters, digits, spaces or hyphens, as the API accepts) and **Try again** (same photo, with the
    subject when given). **Choose another photo** is always available.
  - 429 reads `Retry-After` and disables Try again and Save with a countdown (60 s when the header is
    missing); 409 (library full), 413/415/422 and 5xx show the API message or "Stickers are
    unavailable right now" and keep the photo or preview so the person can retry.
  - Leaving the screen, choosing another photo or saving bumps a generation counter and cancels the
    task, so a late cutout or save response is dropped. The source JPEG and the cutout PNG live only in
    `StickerCreateModel` and are released on reset, Save and when the screen disappears.
- **Messages.** A message whose attachment has `sticker` renders as the bare transparent picture
  (`StickerMessageView`: at most 160 pt scaled with Dynamic Type, aspect-fit) with no bubble
  background, rim or tail; the time and receipt sit below it and a quote shows in a small bubble above.
  Swipe-to-reply, the quote jump, reactions and the long-press message menu work as for other
  messages. The picture does not open the photo viewer, and stickers are not listed in **Shared in
  this chat** (server rule). Quotes read `Sticker` plus the emoji.
- **Save sticker.** In private chats, the long-press message menu (the reaction popover) of a
  **contact's** sticker has **Save sticker** (`POST /stickers/save` with `{ contactID, turnID, part }`,
  `part` = index in `assistantMessages`). A status line above the composer confirms ("Saved to your
  stickers.") or shows the error. Your own stickers and group stickers have no such action.

### Sending

`ChatStore.send(sticker:)` and `GroupChatStore.send(_:sticker:)` send `sticker: { id }` with empty text
and no attachment or voice, with the optional quote (and, privately, the For you post) preserved. The
message UUID is kept across failures (`submission` privately, `pending` in groups), so retrying the
same sticker is idempotent: privately, picking the same sticker again reuses the UUID; in groups the
composer shows **Retry sending**. The optimistic bubble draws the library image from the image cache
while `isSending`; on success `PrivateImageCache.copy` re-keys the cached bytes to the message's
attachment key, so the bubble does not reload. A 404 on a private send (the sticker was deleted on
another device) is shown as "This sticker is no longer in your library."

Contact stickers are separate assistant messages that follow the contact's text, so the image is requested
with `?side=assistant&part=N`. `CachedImageResource.assistantAttachment` gained a `part` (key unchanged
for part 0); without it every assistant attachment would fetch part 0.

Chat-list previews: the server sends `Sticker 😂` for stickers you send. The client also builds a local
preview while a conversation is cached and newer than the list row (`ContactsStore.messagePreview`,
`GroupChatStore.preview`), and that now reads `Sticker` plus the emoji instead of `Attachment: Sticker.png`.
A contact's sticker previews as its emoji (the message text).

### Cache

Session-owned, memory only (`StickerStore`, owned by `ContactsStore`); full rules in
[caching](caching.md#stickers). Summary:

- One `NavigationSnapshot<StickerLibrary>` for the library and a `NavigationSnapshotCache<[Sticker]>`
  (eight contacts, least recently used) for the contact tabs. Reopening the sheet draws cached lists
  synchronously (empty ones too) and revalidates in the background on every open and pull to refresh.
- Request deduplication and stale-response rejection come from `NavigationSnapshot`; every mutation
  (`create`, `changeEmoji`, `delete`, `save`, `saveMessageSticker`) `replace`s the library value, which also
  cancels and ignores older loads.
- Pictures use `PrivateImageCache` with keys `sticker/<id>/<digest>` and
  `contact/<contact>/sticker/<id>/<digest>`; the cache is partitioned by account. Message stickers keep
  the attachment keys.
- A new account gets a fresh `ContactsStore` (`ContentView` applies `.id(auth.user?.id)`), so lists
  and the busy set never cross accounts; removing a contact drops its tab (`forget(contactID:)`).
  Clearing a chat keeps libraries (it never touches them).

### Limitations

- Contacts send, save and create stickers only in private chats (server rule); groups offer only the
  person's own library.
- The sheet is not an inline panel and has no search, reordering or drag-and-drop. The sticker icon is the
  SF Symbol `face.smiling` (no dedicated sticker symbol was verified).
- The 160 pt size is a maximum; small stickers are not enlarged. Animated stickers are not supported.
- The Photos picker returns the representation it chooses (`.compatible`); an image ImageIO cannot decode
  shows "This photo could not be prepared".
- Sticker images that the person's library no longer holds still render in old messages (messages own their
  copy); the picker never shows them.
- The Stickers personality trait is the 17th slider; iOS builds from before this change receive 17 traits
  while their validation expects 16, so they cannot save a personality until updated (like the Emoji
  trait, see [personality](personality.md)).

### Manual verification checklist (not done)

Static validation only so far (`swiftc -typecheck` with the project's isolation flags). Nothing below has
been observed on a device or simulator.

1. Button: right of the field, left of the microphone/send, in a private chat and a group, same size as
   the paperclip; hidden while recording; disabled while sending.
2. Sheet: opens with medium and large detents, closes with Close and by swipe; the keyboard dismisses.
3. My stickers: empty library shows the create tile and hint; tap sends and closes, the bubble appears
   with the picture at once and does not reload when the send completes; offline send then retry
   (private: pick the same sticker again; group: Retry sending) delivers once; context menu Change
   emoji and Delete (a sent message keeps its sticker); full library disables Create sticker.
4. Contact tab: absent in groups; empty and error states; tap saves, the check persists after reopening;
   saving the same sticker twice adds no duplicate; 409 shows the library-full message.
5. Create: JPEG, PNG with transparency, HEIC, a rotated photo and a very large photo; NO_SUBJECT with and
   without a subject; 429 countdown; leave the screen during the cutout and during Save (no late
   preview or save); invalid emoji ("ab", two emojis, a digit) keeps Save disabled; checkerboard in light
   and dark; confirm the screen does not reset while the Photos picker is presented.
6. Rendering: own and contact stickers in private and group chats with a reply quote, a reaction and a
   quote jump; a sticker that is a later part of a contact reply; Save sticker from an incoming sticker;
   no bubble, rim or tail, Dynamic Type; tapping the picture opens nothing; Shared in this chat shows none.
7. Cache: reopen the sheet (instant), another device adds a sticker then pull to refresh, sign out and in,
   switch accounts, delete a sticker used by a pending send ("no longer in your library").
8. Chat list: `Sticker 😂` for a sticker you sent, before and after the list refreshes.
9. Personality: Temperament shows 17 traits including Stickers; save and reload.
