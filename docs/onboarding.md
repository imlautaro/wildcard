# Registration and first circle

New accounts can register on iOS and web with an email and password. After
registration, both clients require onboarding before showing the normal app.
Existing accounts are exempt: migration 0041 clears the new flag for rows already
present, while future inserts default to requiring onboarding. Authentication
still uses Better Auth and the existing signed sessions. Email ownership is not
verified; recovery is not configured. No mail provider is added.

## Experience

Onboarding asks for a name, age in whole years (1–120), Male/Female, preferred language, country and avatar
style: Cartoon, Anime, 3D animated movie, Realistic people, 3D animated pets or Custom
(see [character styles](#character-styles)). It also asks for a
Friends, Study or Work circle and offers an independent **Create a group with my
five contacts** toggle (on by default). The circle purpose shapes contacts even
when group creation is turned off. Study asks what the user is studying; Work
asks what they do for work (1–200 characters). Friends hides this field and both
clients omit its value from submission; the server also clears it and excludes
it from generation. Study/work context shapes complementary, age-appropriate
identities, without claiming credentials or forcing every conversation into a role. The shared catalog
contains ISO 3166-1 country/territory codes and ISO 639-1 languages, with English
labels from the runtime's Intl display names. Both clients consume the same
server options. User-entered names can retain their original spelling.

The screen explicitly asks for shared-memory acceptance before submitting. It
explains that group members can read the full history and that facts from private
and group chats may become shared memories recalled elsewhere. It does not add
other human participants, send invitations or accept Contributor processing.

The server creates exactly five fictional contacts and optionally a group containing
the account and those same five agent identities. Group names are deterministic:
**Friends**, **Study Group**, or **Work Team**; the model does not choose a name. Muse Spark 1.3 Standard proposes
common given names for the selected country, a mixed-gender cast, distinct
behavioral identities, optional topic affinities, English identity descriptions and
physical descriptions. Identities use values, judgment, conversational quirks and
flaws, without assigning employment, enrollment or physical routines. Work/study
context informs subject strengths and approaches rather than a human biography.
Saved plans keep their original identities on retry; reply instructions interpret
legacy biography without claiming lived experience. See [personality](personality.md).
No external popularity ranking verifies the model's name choices. The user's
gender does not determine the cast's genders, temperaments or romantic roles.
Country determines naming context, not stereotyped appearance or behavior.
For every avatar style, new identity plans must give each contact an integer
age within two years of the user's age, clipped to 18–120, and an explicit male
or female gender. The server validates this range and a mixed-gender cast before
saving the plan. Descriptions and appearance must match each contact's age and
life stage. Legacy submissions without age retain the adult fallback (18–80). The server assigns each generated contact a random calendar birthday matching its planned age, with a minimum of 18.
The generated profiles omit the user's name/gender and direct every contact to
use the selected language by default, including in groups. Replies still depend
on the model following that direction; language is not a translation filter.

Five contrasting trait profiles (patient listener, playful adventurer, analytical
skeptic, expressive artist, practical organizer) activate the existing personality
system automatically. Text generation supplies separate identities around those
profiles. Five strengths (explanation/evidence, practical planning, creative
exploration, thoughtful communication and everyday discovery) are shuffled separately
from the temperaments and supplied alongside them when generating identities. Each
contact's strength includes related approaches, without making it a job, exclusive
role or claim of professional credentials. Descriptions retain unrelated interests
and keep these strengths appropriate to the contact's age. The assignment is saved
as `specialties` in each identity plan and then in the shared personality, so retries
reuse it. Existing completed contacts and legacy saved plans without specialties
are preserved; they are not automatically rewritten. Every contact can still talk
about any subject; the shared personality context discourages forced steering and
unsupported expertise. These are model directions, not measured capability differences.
Creators can edit identity and specialties later in **Contact details → Personality**.
Profiles have random fictional calendar birthdays matching their generated adult ages. All team-authored descriptions and
group names are English; contact names retain native spelling. An optional group starts
empty and accepts messages immediately after creation. All five contacts appear
in Contacts and immediately in Chats, with **No messages yet** and zero unread
messages. Migration 0049 adds a per-contact `onboarding_chat` marker; only newly
published onboarding contacts receive it. Other empty contacts remain hidden in
Chats. No welcome messages, receipt states or unread events are synthesized.
Rows use creation time until real activity supplies normal ordering; iOS hides
the message timestamp while empty, and web displays row creation time.

Each avatar is generated with Meta `muse-image-1.0`, not an OpenAI model, through
`POST https://api.meta.ai/v1/images/generations`. It requests one square JPEG,
base64 output and low reasoning, with reference search/web search/shell disabled.
The realistic portrait prompt is exactly:

```text
${identity.age} years old ${identity.gender} social media natural photo taken with phone. profile picture for social media. Appearance: ${identity.portrait}. Personality cues: ${identity.description}.
```

It omits the earlier head-and-shoulders, background, clothing, watermark and
fictional-person boilerplate. Other styles explicitly request age-appropriate appearance and the planned age, without the former adult-only instruction.
Only fictional contact descriptions go into portrait requests, not onboarding personal
details or existing conversations. Generated bytes are bounded to 8 MiB and a
square JPEG up to 4096 pixels because Meta's size controls aspect ratio rather
than guaranteeing dimensions. Manual uploads keep their existing 1024-pixel and
512-KiB limits. Existing private R2 routes and image caches serve the photos.

## Character styles

Besides Cartoon, Anime, 3D animated movie and Realistic people, onboarding and AI
contact generation offer (2026-10-31):

- **3D animated pets**: every contact is a pet animal (a different species each, for
  example a golden retriever, a tabby cat, a parrot, a turtle, a rabbit) drawn as a
  3D animated movie character. Names come from a pool of pet names that people in
  the selected country commonly use, in its language (an Argentine test produced
  Toby, Mate, Frida, Rocco and Gala).
- **Custom**: a text field (**Describe your characters**, 1–80 characters,
  `customStyle`) such as "friendly robots", "kittens", "the US founding fathers" or
  "girls like the Powerpuff Girls". Names, identities and portraits follow the theme.
  The name call also reports whether the theme implies a single gender
  (`themeGender`); onboarding then makes all five contacts that gender instead of the
  usual mix (the girls theme produced five female contacts named Gema, Miel, Azúcar,
  Dulce and Nova). For an individually generated contact the person still picks the
  gender.

`characterTheme` (`shared/onboarding.ts`) turns the style into a theme. Identity
generation adds `themedIdentityInstruction` (`contacts/portrait.ts`): each contact gets
a `kind` (at most 60 characters, for example "Golden retriever" or "Colonial-era
statesman") that starts its description ("Golden retriever (male), persona age 30.")
instead of "30 years old male"; age and gender remain the voice persona and the
birthday, within the usual age range. Characters stay conversational contacts under
the same identity rules. Themes naming real people or copyrighted characters produce
original characters in that spirit, style and era, never the actual people or a
likeness; the portrait prompt says the same. The custom text is treated as untrusted
creative data in every prompt. Themed onboarding plans allow 9,000 completion tokens
(7,000 otherwise) because the model reasons longer about themes; an occasional
truncated plan is retried by the existing step retries.

Compatibility: `GET /onboarding/options` lists Custom only with `?custom=1`, which
current iOS and web builds send, so older iOS builds (which cannot send
`customStyle`) only gain 3D animated pets. `POST /onboarding` and
`POST /contacts/generation` accept the optional `customStyle` and require it for the
Custom style (except onboarding without AI contacts); it is ignored for other styles.

Checked live on 2026-10-31 (Standard, the onboarding plan with names, no portraits):
pets for Argentina, "robots simpáticos", "padres fundadores de los Estados Unidos"
(after a fix, 18th-century statesmen rather than animals) and "chicas estilo las
chicas superpoderosas". Portraits for the new styles were not generated in tests.

## Progressive setup

Since 2026-10-31 nobody waits on the onboarding screen while contacts are generated
(it took several minutes: one identity call plus five sequential portraits).

- **Optional AI contacts.** The form has **Create my first five contacts with AI**
  (on by default). Turned off, it hides appearance, circle, group and shared-memory
  consent, the button reads **Start**, and `POST /onboarding` with
  `createContacts: false` completes onboarding at once: it saves the name and clears
  `onboarding_required`, with no Workflow, contacts or group. Contacts can be created
  later from Contacts.
- **Straight into the app.** With AI contacts, the submission saves the input and
  clears `onboarding_required` in the same batch, then starts the Workflow. Both
  clients refresh the profile after submitting and open Chats immediately, also
  when AI contacts are turned off. Web navigates directly to `/chats` rather than
  passing through the wide-screen For you landing page; resuming completed or
  running setup and the already-completed `/onboarding` redirect use the same route.
  The [For you first visit](updates.md#first-visit-and-empty-feeds) offers setup-aware
  welcome states if the person opens it before posts exist.
- **Disabled contacts while they are created.** After the identity plan, one atomic
  `publish-contacts` step inserts all five contacts, personalities and shared agent
  identities with `contact.setup_pending = 1` (migration 0077) and no photo version.
  The five portraits then run as parallel Workflow steps; each one stores its JPEG and
  enables its own contact (`setup_pending = 0`, photo version set unless the person
  already uploaded a photo), so the person can start talking to the first contact while
  the others are still being drawn. A portrait that still fails after its retries
  enables the contact with initials instead of failing the circle. `photo_count` now
  counts ready contacts, in any order. A final `publish-circle` step creates the
  optional group with the contacts that still exist and marks setup complete.
- **Chats while creating.** Both chat lists follow `GET /onboarding` every 3 seconds
  while status is `queued` or `generating` and show "Creating your contacts… N of 5
  ready". Before the identities exist they show five "New contact" placeholders;
  afterwards each contact row is greyed out with "Creating…" and cannot be opened
  (also in the web Contacts directory). Contacts expose `setupPending` (0 or 1); the
  contact list revalidation the clients already run picks up each contact as it
  becomes ready. `POST /contacts/:id/turns` answers 409 "This contact is still being
  created" for a pending contact.
- **Failure and retry.** On failure, published contacts are enabled (with initials if
  their portrait was missing) and the chat list shows "We could not finish creating
  your contacts" with **Retry**, which posts to `/onboarding` again: an existing,
  unfinished setup is retried with its saved preferences even though
  `onboarding_required` is already cleared (a completed one returns its status).
- **Compatibility.** Older clients send no `createContacts` (treated as true). Old
  iOS builds keep showing onboarding progress until setup completes, as before, and
  do not know `setupPending`: if one opens a pending contact, sending is refused with
  the 409 message. Workflow instances already running during the release replay with
  the new step layout; a mismatch fails them into the existing Retry path.

Not verified on devices or against a real Workflow run: checked with the API, web and
iOS static type checks, `onboarding-sql-compile.py` and the changed statements on the
local workerd D1.

## Durable setup and recovery

- `GET /api/v1/onboarding/options` returns the authenticated options catalog.
- `GET /api/v1/onboarding` returns status, saved input, portrait count and final
  group ID, scoped to the current signed account.
- `POST /api/v1/onboarding` accepts exactly `name`, `age`, `gender`, `language`, `country`,
  `style`, `createGroup` (boolean), `circleType` (`friends`, `study`, `work`),
  `occupation` (string, required and nonempty for work/study), and
  `sharedMemoryConsent: true`, plus optional `createContacts` (boolean; with `false`
  consent may be false and work/study need no occupation, see
  [progressive setup](#progressive-setup)). The previous seven-field request remains accepted
  as Friends with group creation enabled, for older installed clients. Validation and six submissions per
  account/minute bound requests. Registration allows five attempts per IP/minute.

New submissions require age. Existing persisted submissions without age remain
retryable unchanged: saved profiles/photos are reused; a new identity plan for a
legacy submission uses the adult range. A legacy saved plan without explicit
age/gender uses the phone-photo wording without inventing missing demographics.
No existing images are regenerated. The first accepted submission freezes the input. Later submissions retry the same
setup and cannot replace its identity plan. `account_onboarding` stores the input,
plan, progress and final group ID. A single deterministic Workflow ID per account
arbitrates concurrent dispatch. Cron recovers pending dispatches and records
terminal failure. A visible **Retry setup** restarts an errored/terminated instance.

Identity generation persists its plan before portrait work. Contacts are then
published disabled and enabled one by one as their portraits finish (see
[progressive setup](#progressive-setup)); five parallel steps save JPEGs under
immutable IDs in the existing private bucket and retries skip already stored images.
The final D1 batch creates the optional group and marks setup complete. Each batch is
atomic and idempotent after completion. The normal contact trigger creates each
agent, preserving shared identities rather than copies. No welcome message or
background conversation is invented during setup.

Generation continues after closing either client. Model calls have bounded
retries/timeouts (45 seconds for text, 180 seconds per portrait; step budgets
2/4 minutes). A provider request that succeeds before a storage failure can be
repeated and charged again; this is not exactly-once billing. Failed work retains
the plan and any completed images for retry. Contacts are visible but disabled until their own portrait step finishes. There is no automatic expiration
of failed setup: operators must account for retained rows/images when managing
storage. Normal contact deletion removes published photos through existing paths.
Account deletion now queues account photo prefixes and the onboarding Workflow,
even when no contact was ever published or setup already completed (migration
0069). Dispatch rechecks the parent after creation/restart and portrait steps
recheck around upload, durably queuing late instances/bytes when deletion wins.
The existing outbox/Cron retries external failures; see
[account cleanup](admin.md#deleting-an-account). These changes add no client cache
or setup UI and need fictional-data runtime verification.

## Cache and account isolation

Each client owns one in-memory setup snapshot, options catalog, draft and pending
submission per session. The first read blocks; reopens reuse options, progress
and even empty/pending results immediately, then revalidate. Unsubmitted drafts
survive navigation in memory; submitted input resumes from D1 after an app/browser
restart. There is no local persistence of onboarding personal fields. Age, circle purpose, group toggle and occupation/studies follow the same draft/snapshot/session reset rules as other fields. The D1
input is explicitly retained with the account setup for resumption and [AI contact generation](contact-generation.md); age, gender,
country and occupation/studies are not public profile fields or attached to group-member responses. Work/study context is sent to Standard identity generation; generated contacts reflect the field without embedding user personal details.

Reads are deduplicated, pending submissions survive navigation, and revisions
reject responses from before a mutation or account change. Polling refreshes
roughly every 3 seconds during work and 10 seconds otherwise; manual refresh is
available on failure. Cached content and the draft remain usable on transient
errors. Sign-out, session expiry and account switching clear all setup state and
reject late responses. A completed profile refresh opens the normal app, whose
initial contacts/groups loads discover the atomically created resources. Avatar
bytes continue to use the existing account/context/version-scoped image caches
and their protection/eviction budgets; no separate image cache is introduced.
Server authorization is checked on every request. Clients gate the app shell;
this is not an authorization boundary preventing older API clients from using
existing signed-account routes before onboarding.

## Setup, validation and limitations

See [infrastructure](infrastructure.md#account-onboarding) for migration 0041,
Workflow provisioning, secret access and automatic release. Static API/web type
checks, iOS type checking and `python3 scripts/checks/onboarding-sql-compile.py`
are appropriate without launching the app. Builds and functional tests require
the user's request under repository agreements.

Device/browser checks still required: new registration, existing-account exemption,
empty options/error recovery, every selector, age validation and age matching in all four styles, all three purposes, conditional work/study input, friends ignoring that context, setup with/without a group, simple group names, five empty Chats rows and ordinary empty-contact exclusion, consent validation, generating each
style, reopen/back navigation, offline draft retention, duplicate submits, failed
portrait retry, session expiry/account switch, final group roster, editable
personalities/specialties, distinct strengths without fixed temperament pairings, broad-topic replies without forced steering, preferred-language private/group replies and private avatar access.
Also verify restart after a dispatch outage and final transaction failure. Static
validation does not establish model quality, real provider access, UI layout,
live deployment or functional behavior. No live inference, remote migration or
release was performed during implementation.

Provider contracts checked October 28, 2026:
[Meta models](https://dev.meta.ai/docs/models),
[image generation schema](https://dev.meta.ai/docs/api-reference/images/schemas),
[Cloudflare Workflow rules](https://developers.cloudflare.com/workflows/build/rules-of-workflows/).

AI creation reuses these persisted preferences without asking for the user profile again. Unfinished legacy plans containing minors are replaced with adult plans before publication; prior unpublished photos can remain in R2 for operator cleanup. Completed circles are not automatically regenerated.

## Explanations

The onboarding form keeps the shared-memory consent text visible beside its switch or
checkbox. The notes about generated contacts (names, language, ages, gender) and about
the circle type are behind info buttons on iOS and web, as are the Your bot and manual
creation notes in Create contact. See the settings pattern in
[contacts](contacts.md#contact-details-layout).

## Conversational generation preferences

New identity descriptions retain language and regional wording preferences, with
subtle grammar and vocabulary rather than a nationality caricature. New contacts
also initialize the existing speech accent preset when the selected country has
one. The creative temperament favors fresh relevant ideas without requiring poetic
speech or maximum verbosity. Existing descriptions remain intact.

[Conversation style](conversation-style.md) can read only the language/country
codes from the retained original plan's generation preferences for existing
first-circle agents. It identifies origin by agent ID in that plan, not the mutable
chat-list onboarding flag, so clearing history does not lose the preference. It
never forwards the user's onboarding profile as conversation context or applies a
new participant's country to a shared agent. No new retention, cache or migration
is introduced. Both clients use the same server behavior; semantic/device checks
remain pending.

## Name variety

New first circles use the shared [name pool](contact-generation.md#varied-generated-names):
24 candidates per male/female gender, server-side random selection without replacement,
and a shuffled 2/3 gender mix. Names are assigned independently of the five
ordered temperaments and shuffled specialties. The identity model must keep the
assigned names/genders. Native spelling remains valid. Existing account contact
names and the human's name are excluded within the documented bounded window;
no other account's names are read. One extra Standard text completion adds latency
and cost before the immutable plan is saved. Completed contacts and saved plans
keep their names; no historical regeneration is introduced. Both clients use the
same Workflow and existing progress/cache contract. Actual cultural/name diversity,
provider failure handling and device recovery remain pending live verification.
