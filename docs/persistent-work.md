# Persistent task work

Tasks already continue through D1, the minute Cron and `CHAT_WORKFLOW` after the
app closes. Migration 0054 adds explicit progress and execution controls to that
same task, private chat or group. No new service is required. This increment is a
foundation for roadmap step 2; public background research and per-job external
tool grants remain pending.

## State and progress

- The task title is the objective; use notes to describe completion conditions.
- `nextStep`, `evidence` and `result` retain progress across work turns. Evidence is
  bounded plain text, such as source message/document IDs, dated observations or
  URLs. It is attributed working material, not independently verified truth or
  permission to act. Each field is optional and limited to 2,000 characters. The shared model board
  clips progress fields to 300 characters; an assigned work trigger includes its
  full next step and evidence.
- Task status remains To do, In progress, Done or Canceled. Separately, `workState`
  is `active`, `paused` or `blocked`. A blocked task requires `blockedReason`; its
  assignee can record that missing input/permission prevents progress. Only a
  person can pause or resume. Resuming clears the blocked reason.
- Dependency blockers remain separate: completing/canceling the last prerequisite
  makes active work due, but never resumes paused or explicitly blocked work.
- Both clients show work turns used, next step and blocked reason in the board;
  evidence is editable in the task editor. The editor offers Pause work, Resume
  work and Cancel task. Resume is disabled when the work budget is exhausted.

The PATCH route accepts `workState`, `nextStep`, `evidence` and `blockedReason`
alongside existing fields and requires the edited task version. Contacts can use
`update_task` to record progress or block their own work, but cannot resume it.
Human controls are authenticated through the same private/group task scope.
An optimistic edit token guards follow-up scheduling/dependency writes, so a
losing version check cannot modify those rows after another edit wins.

## Budgets and execution authority

The default is six work turns over a task's lifetime, plus 30 per contact per
rolling day. These are implementation limits, not product decisions or monetary
caps. Pause/resume, reassignment, progress edits and reopening never refund turns.
0054 preserves the greater of the stored count and all existing work receipts,
including earlier assignment cycles. Existing tasks move to generation 1 while
pre-control receipts keep generation 0: old queued/running attempts stop under the
new guards, and the next scheduled review uses remaining budget. Tasks already over six show exhaustion and
receive no new turns. A reserved turn remains spent if access changes or it fails.
Creating a new task is not a supported way for contacts to bypass this boundary.

Each reservation stores an execution generation. Pausing, resuming, blocking,
canceling, reassigning and reopening change it. A person's completion or edit to
the objective/notes/dependencies also invalidates previous work. Contact progress edits and
the contact completing its own task preserve its generation so it can report the
result. Work IDs use task ID, generation and monotonically retained turn count.

The dispatcher rechecks task/list state, generation, assignee, blockers, work
count and daily ledger inside the turn insertion transaction. The work receipt,
count and next review are recorded in the same batch. Group admission checks
shared-memory and Contributor consent before creating its internal notice.
Connector-isolated groups retain Standard without granting background MCP.

Private turns check current generation before preparation, each reply-model call,
each tool admission and the atomic reply write. Groups use current source access
before preparation, each evidence/decision model request, each tool and the final
write. Shared-memory maintenance and group image-index admission also recheck
current access. A stopped generation cannot become valid again after resume.
Already delivered messages remain history. A queued/running chat indicator can
remain briefly until its Workflow observes the invalid generation and exits.

Pause/cancel is cooperative: a model request or tool admitted just before the
change can finish, be charged and persist internal results. Further admissions
and unpublished replies are rejected. These controls do not abort provider work
or undo document edits already started. Existing reply/tool limits and receipts
remain; this change does not introduce an exact per-job token budget or make
every private model round independently checkpointed.

## Tools and permissions

Autonomous work retains bounded internal retrieval, task and document tools.
Contacts can read saved reports and record a deliverable in their own chat.
Task turns do not gain web research, MCP, mini apps, generated images, native
actions, schedule mutations or publication into another conversation. Group task triggers
now explicitly exclude MCP, image/app creation and private-message capabilities;
execution admission also checks current source authority for older checkpoints.
No new cross-chat memory access or external-write grant is implied by assignment.

## Provisioning, cache and verification

Apply 0054 after 0053 through the existing migration/release process; see
[infrastructure](infrastructure.md#persistent-task-controls-migration-0054).
Both clients reuse their session-owned task board and five-second foreground
revalidation. Every mutation returns a complete board and follows existing
conflict, late-response, access-loss and account-reset rules. Progress remains in
D1 with the task and is removed by the existing contact/group/account cascades;
there is no new private client disk store. See [caching](caching.md#task-boards).

Static validation can check API/web TypeScript, Swift typechecking, and SQL
preparation against the complete empty migrated schema at expression depth 100.
It cannot establish live model quality, replay behavior or client presentation.
Before functional sign-off, use fictional tasks to verify work with apps closed,
interruption/resume, concurrent dispatch, the sixth turn, reassignment/reopening
without refunds, blockers, human pause during inference and between messages,
blocked-input recovery, canceled lists, consent revocation, stale edits, offline
navigation and account changes on both clients. Runtime tests, builds, provider
inference and remote migrations/releases require their own authorized scope.

Cloudflare references checked October 29, 2026:
[Workflow replay/idempotency rules](https://developers.cloudflare.com/workflows/build/rules-of-workflows/)
and [Workflows pricing](https://developers.cloudflare.com/workflows/reference/pricing/).
Existing services still consume their account quotas; reusing them does not
guarantee free operation. Meta inference is separate.
