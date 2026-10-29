# Registration and first circle

New accounts can register on iOS and web with an email and password. After
registration, both clients require onboarding before showing the normal app.
Existing accounts are exempt: migration 0041 clears the new flag for rows already
present, while future inserts default to requiring onboarding. Authentication
still uses Better Auth and the existing signed sessions. Email ownership is not
verified; recovery is not configured. No mail provider is added.

## Experience

Onboarding asks for a name, age in whole years (1–120), Male/Female, preferred language, country and avatar
style: Cartoon, Anime, 3D animated movie or Realistic people. It also asks for a
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
occupations/interests, English identity descriptions and physical descriptions.
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

## Durable setup and recovery

- `GET /api/v1/onboarding/options` returns the authenticated options catalog.
- `GET /api/v1/onboarding` returns status, saved input, portrait count and final
  group ID, scoped to the current signed account.
- `POST /api/v1/onboarding` accepts exactly `name`, `age`, `gender`, `language`, `country`,
  `style`, `createGroup` (boolean), `circleType` (`friends`, `study`, `work`),
  `occupation` (string, required and nonempty for work/study), and
  `sharedMemoryConsent: true`. The previous seven-field request remains accepted
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

Identity generation persists its plan before portrait work. Five separate steps
save JPEGs under immutable IDs in the existing private bucket; retries skip
already stored images. The final D1 batch creates all five contacts, personalities,
shared agent membership and optional group, then clears `user.onboarding_required`. It is
atomic and idempotent after completion. The normal contact trigger creates each
agent, preserving shared identities rather than copies. No welcome message or
background conversation is invented during setup.

Generation continues after closing either client. Model calls have bounded
retries/timeouts (45 seconds for text, 180 seconds per portrait; step budgets
2/4 minutes). A provider request that succeeds before a storage failure can be
repeated and charged again; this is not exactly-once billing. Failed work retains
the plan and any completed images for retry. Partial images are private and not
exposed as contacts before final publication. There is no automatic expiration
of failed setup: operators must account for retained rows/images when managing
storage. Normal contact deletion removes published photos through existing paths.

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
