# AI contact creation

Both clients offer **Manually** and **Generate with AI** in Create contact. Manual
creation keeps the existing name/photo flow. AI creation asks only about the bot:
visual style (Cartoon, Anime, 3D animated movie, Realistic people), relationship
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

A new identity has a generated name, portrait, enabled personality, specialties,
time zone and all sixteen temperament traits. Muse Spark 1.3 Standard creates text;
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
A final atomic batch publishes one contact, its personality and the completed job.
The contact trigger creates one agent; sharing later grants access to that same
agent. New contacts retain ordinary memory-sharing defaults; no group, consent,
welcome message or unread event is invented. Published photos reuse private R2
routes and existing image caches. Deleting a contact clears the job's contact link.
Completed job/plan rows and failed unpublished portraits are retained with the
account/job, with no automatic expiry. Account deletion cascades job rows; private
R2 cleanup for abandoned/deleted accounts remains an operator responsibility,
as for failed onboarding assets. A provider success followed by storage failure
can repeat a billable request. This is not exactly-once inference billing.

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
in D1; creating another contact clears the completed selection in memory and uses
a fresh ID. The server's single-active-job constraint arbitrates other devices.
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
