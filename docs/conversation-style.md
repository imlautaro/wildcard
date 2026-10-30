# Natural conversation style

Private replies, group drafts/reviews and optional private initiative use shared
server-side direction on iOS and web. New messages use the revised behavior after
an API release; stored messages and creator-edited personalities are preserved.
No additional model call, service, migration, permission or client response field
is introduced. This change is local until committed, pushed and automatically
released through the existing pipeline.

## Regional language

`personality/conversation.ts` reads only validated language and country codes:

1. A creator-selected `contact_agent.speech_accent` guides regional wording in the
   matching language, in text and voice, even when voice is unavailable or off.
2. Without an accent preference, an individually generated contact uses its own
   completed `contact_generation` job's country and language.
3. First-circle contacts use the original `account_onboarding` generation
   preferences, only when their agent ID appears in the retained onboarding plan.
   Clearing a conversation resets the chat-list flag but preserves this origin.
4. Other contacts have no inferred region; their identity and current conversation
   guide language. Names, time zones and a new participant's country do not select
   a dialect.

An explicit current language request, the creator-edited identity and the language
of the conversation take precedence over the generation default. A region guides
vocabulary, grammar and forms of address when appropriate to that language. It
does not establish citizenship, background or physical experiences. Argentine and
Uruguayan Spanish receive natural voseo and appropriate plural address, without
obligatory pronouns, slang, profanity or regional catchphrases. Other supported
countries receive a validated English region label for model guidance.

The query never forwards the onboarding profile, occupation, age, gender, name or
generation JSON. These cues describe the contact's original generation settings;
they are not facts to disclose about its creator. Shared contacts retain the same
preferences across audiences. Choosing a different voice ID does not change them.
Selecting Default accent removes the speech override; generated contacts still
retain their original regional wording fallback. This also works for existing
contacts with retained generation records, without backfilling or rewriting them.

New onboarding contacts initialize the existing speech accent field when a preset
matches their country, as individually generated contacts already do. New identity
descriptions explicitly retain the language and regional wording preference.
Personality regeneration preserves existing speech preferences. Voice delivery
remains best effort; original voice samples keep their original accents.

## Individual writing habits and feedback

Each contact's ID seeds a stable combination of casing, punctuation, laughter,
acknowledgement and emphasis preferences. Enabled personality controls constrain
this combination: composed contacts favor conventional writing, reserved contacts
restrain emphasis, and playful contacts may use more written laughter. Disabled
personality still yields a stable contact-specific combination. These preferences
stay consistent across private chats, groups and retries; they are not a rotating
set of effects or a requirement to use every feature. The actual language and
regional convention determine suitable words and laughter.

Casual text may have lowercase openings, light punctuation, omitted Spanish opening
marks, occasional repeated closing marks or a stretched word, depending on that
contact's habits and the moment. These are optional. There is no spelling-error
insertion or postprocessing of generated text. Code, links, quotations, technical
notation, names, requested documents and sensitive matters retain clarity.
Spoken replies use natural clauses and ordinary punctuation, without typed laughter,
stretched spelling, emoji or invented hesitations. Replies are never padded to
qualify for the 60-character voice-note threshold.

The current audience's last eight nonempty own replies supply bounded feedback.
Repeated mentions of current participant names (including first names of at least
three characters) produce an extra instruction to omit unnecessary vocatives.
These are mention counts, not a claim to classify every name as a vocative. Several
long recent contributions trigger a fresh assessment of length, rather than
mirroring prior verbosity. These counts are transient, do not enter memory or
learning, and never transfer private text or its measurements into a group.
Initiative uses the same guidance and length feedback; its name guidance is general
rather than based on a participant-name count.

Ordinary private messages usually need one or two short sentences; ordinary group
contributions often need one. Depth comes from the current request and useful
missing content: requested explanation, multi-part questions, evidence, reasoning,
instructions or necessary sensitive nuance. The whole burst shares this budget.
High verbosity does not require extra paragraphs. No hard sentence cutoffs or lower
completion-token caps discard useful work. Creative identities influence ideas
and judgment; even legacy poetic descriptions do not require lyrical language or
unrelated metaphors. Explicit creative writing can still use imagery and length.

## Shared group conversation

The personality classifier distinguishes the trigger author from the reply's
addressee. Group-wide engagement has no forced primary individual recipient;
directed contributions can still use specific recipient directions. Private
replies retain their speaker fallback. Cached tone appraisals do not decide who
has answered since they were created.

`groups/conversation.ts` builds a deterministic participation index from the
already-authorized recent history and earlier round replies. It deduplicates
message IDs, includes both humans and agents, and lists visible contributions
after the trigger for each current member. Round context retains successive
bubbles, not just the first message of each reply, up to 64 messages (eight agents
with up to eight bubbles each), clipped to 800 UTF-8 bytes per message. It never reads private history or
expands access. An empty list is not proof of silence, and a message ID is not proof
that a particular question was answered. Internal queue status is not an answer.

The reply model reads actual message content, quotations, this index and earlier
round replies to decide who is addressed, what remains unanswered, whether its
contribution adds value and whether a question is useful. Group-wide comments go
to the shared floor. Personal questions and corrections can address individuals.
Members need not all answer an already-settled factual question; each may still
offer their own relevant perspective when it was requested. A member who speaks
last should not repeat a reciprocal question already resolved in visible history.
This applies to planning, decisions, opinions and discussion as well as greetings.

Existing consent filters, energy, exclusive attention, required opening/task
responses and atomic stale-draft publication checks remain authoritative. Reviews
rebuild current visible participation before reevaluating a stale draft. No new
group initiative or response obligation is added. Semantic decisions remain
fallible model judgments, not deterministic guarantees from queue order.

## Cache, release and verification

There is no new client download or persistent cache. Preferences are read during
server context preparation; habits are computed from identity and current traits.
Edits affect newly prepared replies; an already checkpointed draft can retain its
previous context. Old stored messages are unchanged. Accent mutation continues to
upsert the existing session contact stores, with existing deduplication,
background refresh, stale-response rejection and account/access invalidation.
The same help in the iOS and web Voice sheets describes the wording effect.

Static validation: API and web TypeScript, Swift parse, SQL EXPLAIN against all
migrations in an empty ephemeral database, and `git diff --check`. Opt-in isolated
regressions are in `scripts/checks/conversation-style.cjs`; do not run them without
the authorization required by AGENTS.md. Static success does not establish model
quality or device behavior.

After release, evaluate fictional private/group conversations over multiple turns
and contrasting personalities. Cover unnecessary names versus ambiguous recipients;
regional grammar with voice on/off and a changed accent; creative identities in
practical discussion versus requested creative writing; short social messages
versus explanations that need depth; and stable, distinct writing without all
contacts adopting the same shortcuts. For groups, vary speaker order, human and
bot answers, quoted targets, already answered parts, late new messages and partial
history. Judge unnecessary reciprocal questions, repetition and value added, not
exact wording. Voice notes must sound conversational without typed effects.

On both clients check reopen/back navigation, loaded and empty chats, explicit
refresh, failed accent mutations/offline recovery, shared access revocation and
account switching. Existing cached histories should remain usable and new replies
should use the current server behavior. Live-model and device/browser verification
remain pending; no production chats are needed for these checks.

Static checks completed locally on October 30, 2026: API/web TypeScript, Swift
parse of the edited contact view, 19 personality/group-context SQL statements and
28 onboarding statements compiled against all 67 migrations, harness syntax and
`git diff --check`. Swift parse is not a full application typecheck. The new
regression harness was written but not executed; no tests, builds, real inference,
production data access, commit, push or release were performed for this change.
