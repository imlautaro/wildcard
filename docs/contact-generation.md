# AI contact creation

Both clients offer **Manually** and **Generate with AI** in Create contact. Both modes
are one form with the same **Create** action; creating opens the new contact's chat
(iOS replaces the add-contact screen with it). Manual creation keeps the existing
name/photo flow. AI creation asks only about the bot:
visual style (Cartoon, Anime, 3D animated movie, Realistic people, 3D animated pets or
Custom with a theme of up to 80 characters; see
[character styles](onboarding.md#character-styles)), relationship
(Friend, Study partner, Work colleague), integer age 18–120, gender, preferred
language and country. Language/country/style initially reuse the saved onboarding
preferences; they remain editable bot settings. No user demographics are asked
again. Accounts predating onboarding can choose the same bot fields without
completing a user questionnaire.

`account_onboarding.input_json` already persists onboarding inputs after completion.
It is retained for this feature and resumption, not exposed as a public profile.
Standard identity generation receives saved age, language, country and, for a
study/work contact, occupation/studies. Friends omit occupation/studies. User name,
email, conversations and credentials are excluded. Existing personality generation
receives the creator's onboarding context and the contact's saved personality,
never private chat history. Inputs are untrusted prompt data. Model instructions
avoid copying user personal details into the generated shared identity; this needs
live semantic verification.

New identity generation, personality regeneration and onboarding share guidance for
a concise behavioral identity: values, judgment, conversational quirks and flaws.
Optional interests are topics to discuss, not physical activities the contact performs.
Expertise and strengths remain configurable through specialties, without fabricated
credentials or lived experience. Regeneration replaces old biography in the draft
rather than paraphrasing it; it still requires Save. Saved job plans remain immutable,
so retries with a preexisting plan can retain an older identity. Shared conversation
instructions also handle those legacy profiles. No schema, API or cache changes.
Live semantic checks of generation and replies remain pending.

A new identity has a generated name, portrait, enabled personality, specialties,
time zone and all seventeen temperament traits (a generated profile that omits Emoji or Stickers gets an inferred value). Muse Spark 1.3 Standard creates text;
the existing Muse Image integration creates the portrait. The server chooses a
random valid civil birthday giving exactly the requested age in the bot's generated
time zone and persists it with the plan before image work. Onboarding also assigns
random birthdays, with ages clamped to at least 18 in every visual style. New
birthday edits below 18 are rejected by the API and both editors. Legacy saved
personality rows remain readable; an invalid underage birthday must be corrected
before saving. Generated replacement personalities correct such birthdays.

## Durable creation

Migration `0052_contact_generation.sql` adds private account-scoped jobs with
immutable input/plan and a unique active job per account (including failed jobs).
Clients send a UUID submission ID, retain it through uncertain responses, and
recover the latest job from D1 after restart. `POST /api/v1/contacts/generation`
accepts `{ id, input }`; `GET` returns `{ job }`, including status and final
`contactID`. The existing `ONBOARDING_WORKFLOW` accepts an optional generation ID;
older onboarding instances retain their original branch. The existing minute Cron
recovers queued dispatches and records terminal Workflow failures. Retry restarts
the same instance and reuses saved text and any completed portrait.

Text and portrait steps have bounded retries and 2/4 minute budgets, respectively.
A final atomic batch publishes one contact, its personality and the completed job. It also schedules the contact's [welcome message](initiative.md#welcome-messages) about one minute later (migration 0094).
The contact trigger creates one agent; sharing later grants access to that same
agent. New contacts retain ordinary memory-sharing defaults; no group, consent,
welcome message or unread event is invented. Published photos reuse private R2
routes and existing image caches. Deleting a generated contact removes its job and
queues its Workflow checkpoints for deletion. Completed job/plan rows and failed
unpublished portraits remain with a live account/job without automatic expiry.
Migration 0069 registers unpublished portrait prefixes on job deletion and account
prefixes/onboarding checkpoints on account deletion in the durable cleanup outbox.
Dispatch rechecks job existence after creation or restart, including a lost create
acknowledgement. Portrait steps recheck after generation and after upload and queue
late bytes for removal. External failures retry through Cron; account deletion
acceptance does not imply immediate R2/Workflow completion. See
[admin cleanup](admin.md#deleting-an-account). Abandoned jobs on accounts that still
exist retain their normal retry state. A provider success followed by storage failure
can repeat a billable request. This is not exactly-once inference billing.

The publish batch also turns on [voice messages](voice.md) for the creator's
conversation and stores the requested gender and age as the agent's voice profile.
Migration 0061 also initializes a shared speech accent from the explicitly chosen
bot country when supported by `shared/voice.ts`; other countries use Voice default.
The creator can change or clear it in contact details on either client. It is a
speech preference, not a stored nationality. Existing contacts are not backfilled.
A separate best-effort step then assigns a matching ElevenLabs voice, preferring
conversational descriptions within the demographic pool when available. When the
feature is unavailable, the voice is chosen when it is first needed.
First-circle onboarding contacts get the same profile and opt-in, with no accent
inferred from the user's country. Personality regeneration preserves the saved accent.


### Visible creation activity

On iOS and web, submitting immediately replaces the bot fields with a prominent
indeterminate spinner, **Starting contact creation…** and **Sending your request…**.
After the durable job is confirmed, the heading becomes **Creating your contact…**
and explanatory messages rotate every five seconds. These describe the overall
work, not measured stages or a completion percentage. The panel explains that
creation can take a few minutes and, after confirmation, continues when leaving
the screen or closing the app. The Create action reads **Creating…** and the mode
selector is disabled until the request/job is no longer active. Reopening with
cached active state selects AI mode and shows activity immediately. Success still
opens the chat; errors retain the existing retry/refresh flow.

The message index is presentation-only view state. Its timer stops on unmount
(and while iOS is inactive); it does not request data, change job status, persist
progress or create a cache. Existing session stores, polling, submission IDs,
account reset and stale-response guards remain authoritative. Web exposes changing
copy through a polite status region and respects reduced motion for the spinner;
iOS uses the native accessible activity indicator. Verify immediate submission,
slow/uncertain requests, retry, queued/running recovery, completion, narrow screens,
large text, reduced motion, screen readers, offline recovery and account switching
with fictional data on both clients; static checks do not establish these behaviors.

## Existing personalities

Only the creator sees **Generate with AI / Regenerate with AI** in Personality.
`POST /api/v1/contacts/:id/personality/generate` returns `{ personality, revision }`
as an editable draft, without saving. It replaces identity, specialties, zone and
all traits, enables personality, and preserves the name and an existing adult
birthday; missing/underage birthdays receive a random adult replacement. Dirty
drafts ask before replacement. Review, regenerate or use the existing Save action.
Saving uses the existing revision comparison and resets emotional observations.
Generation rechecks ownership/access and the saved revision after inference;
concurrent changes return a conflict. Six generation attempts per account/minute
bound both creation and personality requests. Personality requests have the
existing bounded text inference timeout; iOS allows 90 seconds for transport.
A transient generation failure preserves the saved profile and current draft.

## Caches and verification

Creation has one session-owned draft, options snapshot, current job and pending
submission ID: `AuthStore.contactGeneration` on iOS, `useContactGeneration` on web.
Reopens render cached data immediately, then deduplicate/revalidate in the
background; polling is 3 seconds during generation and 10 seconds otherwise.
Unsubmitted fields stay in memory only. A submitted job survives process restart
in D1. While it runs, the form shows progress and stays locked. A completed job is
never shown as a form state: when this session submitted or watched it, the form opens
the new contact's chat; otherwise (for example after a restart) the form starts fresh
with a new submission ID. A failed job keeps its inputs, and **Create** retries the same
job. The server's single-active-job constraint arbitrates other devices.
Transient failures retain data, offer Refresh/Retry, and revision counters reject
responses from before a mutation/account reset. Confirmed session loss/account
switch clears all creation data. The completed contact refreshes the existing
contact store. Job/draft data is not paginated or stored on local disk; the server
returns one latest job, not job history. Existing protected image cache budgets,
account/context/version keys and eviction remain unchanged.

Generated personality drafts and in-flight generation use the existing eight-entry
session personality cache; generating entries are protected from eviction.
Background refresh cannot overwrite a dirty/generated draft or change its baseline
revision. Access loss/deletion clears that entry. No generated profile is persisted
until Save; a response lost on restart requires regeneration and may incur another
inference. Server permissions remain authoritative.

Static checks: API/web TypeScript, full Swift type check, existing onboarding and
personality SQL preparation, and
`python3 scripts/checks/contact-generation-sql-compile.py`. These do not establish
provider quality, actual Workflow execution, device layout or browser behavior.
Functional verification still needs fictional data: both modes, every selector,
exact birthday ages/time zones/leap days, regeneration of empty/populated profiles,
manual edits below 18, dirty draft review, conflicts, retries, duplicate submission,
background completion/restart, back navigation, offline recovery, deletion,
shared-member read-only access and account switching. No tests/builds, real
inference, remote migration or release are implied by these static checks.

See [infrastructure](infrastructure.md#ai-contact-generation) for installation and
release compatibility.

## Varied generated names

New creation and first-circle onboarding share `contacts/names.ts`. Before identity
generation, one Standard completion proposes 24 distinct plausible local given
names per requested gender (24 for a single contact, 48 for the mixed first circle).
The server validates native spelling/length, filters case/accent/spacing variants,
requires at least twelve usable candidates per gender, shuffles with cryptographic
rejection sampling and selects without replacement. Identity generation receives
the assigned names/genders and must retain them. Names do not choose temperament,
appearance or interests. This avoids repeatedly accepting the identity model's
first few preferred names without maintaining a narrow country-specific name list.
The pool is model-generated; cultural fit and actual diversity need live evaluation.

Exclusions use at most 256 most recently updated contact names in this account,
including shared contacts, plus locally filtered onboarding-user names. Only
contact names, requested country/language/genders go to the name-pool completion;
additional human-name exclusions remain server-side. There is no cross-account
name lookup, private history, email, global popularity table or candidate cache.
Exclusion beyond that bounded account window is not guaranteed. Name collisions
are not forbidden for manual contacts or preexisting identities.

The selected name is saved with the ordinary immutable identity plan before portrait
work; retry with a saved plan retains it. A failure before plan persistence can
regenerate a pool and incur another call. Existing contacts, saved plans and
personality regeneration retain their names. The extra completion adds bounded
latency and model cost to new creation/onboarding, within their existing two-minute
identity step; no new binding, migration, setting or response field is introduced.
iOS/web reuse their current generation progress, submission IDs, job cache and
completed-contact refresh. Static checks do not prove that every requested locale
produces a valid or sufficiently varied pool. Fictional live checks should repeat
both creation paths for the same and different locales, exercise used-name filtering,
malformed/undersized pools, persisted retries and personality regeneration.
