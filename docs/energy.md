# Group energy and bounded bot conversation

Each agent has one backend-owned energy balance shared by every group and participant.
Capacity is 50. Every successfully published group message costs one point, including
private-requested posts, directed questions, designated answers and ordinary replies.
Human messages, private replies, skipped drafts, failures and replayed publications cost
nothing. Bots at zero do not publish in groups; private chats remain usable.

The server restores one point per five elapsed minutes, including Offline time, up to
50. D1 stores a balance and server timestamp; reads/admission/debits compute accrued
points lazily. No device timer, app session or recurring recharge job is required.
Partial five-minute intervals survive a debit; at full capacity, accumulated surplus
time is discarded when spending a point. From zero, full recovery takes 250 minutes.

## Conversation limits

Every new human group message or private-requested public post roots an exchange.
Original human rounds retain at most one slot per snapshotted contact. An ordinary bot
publication offers other current contacts a response, excluding the author, agents
without energy and agents already queued/running in the exchange. There is at most
one pending opportunity per bot/exchange. These are opportunities, not promises:
the model may skip later bot turns that add nothing or an exchange that has ended.
The initial public post explicitly requested by a human is an opening: its admitted
responders must generate a reply while energy/access remain valid and no later human
message has arrived. Earlier similar greetings do not cancel a fresh opening. The
structured schema allows only reply (keep/revise on review) for that opening; an
unexpected skip is an error eligible for existing bounded retries, not a silently
completed turn. Later human messages restore cancellation/supersession decisions.
Replies remain model-generated with no fallback template. Relevant bot-to-bot questions
are permitted; there is no instruction to keep responding indefinitely.

Each exchange admits at most **100 published bot messages**, including its initial
private-requested post when applicable. This independent counter never resets when
energy recharges or the creator refills a bot. Queued turns at that ceiling complete
without a message. Once an exchange goes quiet, recharge/reset does not resurrect it;
a fresh human message or requested post starts a new exchange. New members are not
retroactively added to old rounds; they may receive opportunities from future bot
publications. Automatic admission leaves room under the existing group queue limit
and never starts a new exchange itself.

Directed private questions retain their original target slot and one attributed private
return. Their public answer can then start ordinary bounded group conversation; later
messages never create more private returns. Human-requested publication tools remain
unavailable to ordinary group turns or autonomous private results. Public bot text is
conversation, not permission to reveal private facts, call external services or publish
elsewhere. Current source/root/requester membership, agent sharing, ownership and
Contributor consent are checked before inference and again at publication.

The model receives its current energy in draft/review context. At five points or less,
it may wrap up or skip an ordinary bot exchange; at one point its published reply should
end its participation in its own words without inviting more discussion. There is no
farewell template and no extra message after zero. A farewell is a model behavior,
not a guarantee: the server guarantees the debit/zero and exchange limits regardless
of generated text. A literal human-requested post still preserves the authorized text.

## Creator controls and client cache

Authenticated creator endpoints, scoped through their own contact:

- `GET /api/v1/contacts/:id/energy` returns `{energy: {points, capacity,
  rechargeIntervalSeconds, nextPointAt}}`. `nextPointAt` is a server Unix millisecond
  timestamp or null at capacity.
- `POST /api/v1/contacts/:id/energy/reset` sets the same agent's balance to 50 and resets
  its recharge timestamp. Maximum 12 resets per account/minute; 429 includes Retry-After.
  Reset and debit serialize through D1. A concurrent legitimate publication may already
  consume a point by the time the reset response is read.

Both recheck creator ownership and return 404 for absent/inaccessible contacts, including
shared-contact members. Responses use Cache-Control: no-store. The iOS contact editor
shows **Group Energy** and **Reset Energy to 50** only for confirmed owners. The web contact editor shows the same section with the same
snapshot rules (see [web caching](caching.md#web-app)). A session-owned
`NavigationSnapshotCache<ContactEnergy>` reuses the last server value synchronously,
including zero, and deduplicates requests. It revalidates on entry/Retry and every five
seconds while active, preserving usable values during temporary failures. It never
projects recharge or debits locally. Reset invalidates earlier reads before applying
the authoritative response. Cache revision checks reject stale responses after eviction,
removal or session teardown. Contact deletion/access loss invalidates the entry; all
entries disappear with their account's ContactsStore. Maximum eight snapshots, memory
only; no new disk storage. UI navigation needs no balance to authorize backend actions.

## Storage, release and verification

Migration `0023_agent_energy.sql` adds contact-agent energy columns, exchange/requester
lineage on group messages, a group exchange counter and transactional SQL triggers.
The debit, counter increment, bot message, receipt/push outboxes and new reply slots
commit together. Unique message and source/agent keys make replays idempotent. Agent
attention still serializes private/group work; group sequence still serializes replies.
Existing Cron recovers persisted replies if immediate dispatch fails. No new binding,
secret, service, provider or provisioning is needed; see [infrastructure](infrastructure.md).

Existing agents start at 50 without charging historical messages. Historical lineage
and counters are backfilled without enqueueing old messages. Previously queued rounds
can finish under the new policy. Messages from an old Worker still running during
rollout may lack lineage: they are charged but do not start automatic continuation.
Do not mix old and new code permanently. Group deletion cascades counters; message
root deletion clears lineage. Balances are retained with agents and deleted with them.

Opt-in checks: `node scripts/checks/group-energy.cjs`, plus the publication/receipt
checks. They use actual migrations, SQL, tool/context code and simulated providers on
in-memory SQLite, covering offline recharge, fractional time, last/zero energy,
replay, stale drafts, permission loss, queue bounds, cap despite refills, owner access
and reset throttling. The energy script also invokes Python 3's built-in SQLite to
prepare captured context/publication/admission SQL with `SQLITE_LIMIT_EXPR_DEPTH=100`,
matching D1's expression depth limit. Authorization branches use UNION ALL to keep
nested receipt checks within that limit. A deployed greeting previously enqueued a
reply but failed during context SQL preparation before inference; the new depth check
reproduced that failure before the query repair. Three corrected statements were also
compiled with EXPLAIN in remote D1, with zero application rows read/written. These
checks do not establish natural model behavior or a complete conversation round trip.
Failed attempts remain failed; a fresh message starts a new attempt after release.

After an authorized automatic release, with fictional accounts and an installed iOS
build, verify: privately requested hello with three bots; human-started conversation;
free-form farewell near zero; private reply at zero; account-wide balance across two
groups; no app open during conversation/recharge; creator details/reset; reopening,
background/resume, offline/retry and account switching; membership/consent revocation;
directed answer/private return; eventual silence and no resurrection after refill.
No live conversation, notification, provider call or device verification is implied by
isolated checks.
