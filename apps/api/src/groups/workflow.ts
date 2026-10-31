import { generatedImages } from '../photos/generation';
import { learnFromReply, recordLearningQuestion } from '../chat/learning';
import { messageDelay, recordingDelay } from '../chat/messages';
import { safeErrorCode } from '../chat/meta';
import { jobAccountID, jobModel } from '../lib/model-preference';
import { groupEnergyAvailable } from './energy';
import { maintainAgentMemories } from '../chat/agent-memory';
import { groupSourceAccess } from './request-access';
import { dispatchGroupRequests } from './request-results';
import { prepareGroupInput, visibleMessage, type GroupDraft } from './context';
import { completeGroupDraft } from './completion';
import { deliverGroupPush } from './push';
import type { WorkflowStep } from 'cloudflare:workers';
import { dispatchAgent, releaseAttention } from '../chat/dispatch';
import { rememberGroupMessage } from './memory';
import { connectAgent, markRecording } from '../chat/presence';
import { voiceRepliesAvailable } from '../voice/catalog';
import { storedAttachment, type Attachment } from '../chat/attachments';
import { speakMessage, transcribeVoice, voiceSuitable } from '../voice/speech';
import { planRound } from './planning';
import { earlierTurn, newerGroupMessage, setGroupPresence } from './presence';
import { claimPublication, closeTerminalContinuations, publicationAccess, releasePublication } from './lane';

export type GroupJob = { kind: 'group'; turnID: string; attempt: number };
export async function dispatchGroup(env: Env, groupID: string) {
  // A planned round runs its speakers concurrently (rank orders publication);
  // keep in sync with the group admission bound in chat/dispatch.ts.
  const { results } = await env.DB.prepare(`SELECT agent_id AS id FROM group_reply WHERE group_id = ?
    AND status IN ('queued', 'running') ORDER BY sequence LIMIT 4`).bind(groupID).all<{ id: string }>();
  // Admissions are atomic in dispatchAgent, including concurrent dispatch/recovery.
  await Promise.all(results.map(row => dispatchAgent(env, row.id)));
}
export async function recoverGroups(env: Env) {
  const { results } = await env.DB.prepare(`SELECT DISTINCT group_id AS id FROM group_reply WHERE status IN ('queued','running')
    ORDER BY created_at LIMIT 50`).all<{ id: string }>();
  for (const group of results) await dispatchGroup(env, group.id);
}

type PublishOutcome = 'published' | 'skipped' | 'changed' | 'inactive';

const unchangedHistory = `NOT EXISTS (${newerGroupMessage('?6')})`;

function groupLearningUnchanged(draft: GroupDraft) {
  const f = draft.learningFence;
  if (!f) return '1'; // Legacy checkpoints contain no learned context.
  if (!Number.isSafeInteger(f.person) || !Number.isSafeInteger(f.audience)) return '0';
  return `EXISTS (SELECT 1 FROM chat_group g JOIN group_member m ON m.group_id = g.id
    JOIN group_message source ON source.id = r.source_id AND source.user_id = m.user_id
    WHERE g.id = r.group_id AND g.learning_revision = ${f.audience} AND m.learning_revision = ${f.person})`;
}

async function publishGroupDraft(env: Env, job: GroupJob, draft: GroupDraft, final = true, voice: Attachment | null = null): Promise<PublishOutcome> {
  const contributor = env.META_CHAT_MODEL.includes('contributor');
  const access = `(${publicationAccess(contributor)}) AND (${groupLearningUnchanged(draft)})`;
  let attachment: Attachment | null = voice;
  let album: Attachment[] = [];
  // draft.attachment marks that the draft carries generated images; the album is
  // re-resolved here so revoked references or replaced avatars drop their images.
  if (draft.attachment && draft.text) {
    const scope = await env.DB.prepare(`SELECT r.agent_id AS agentID, r.group_id AS groupID,
      COALESCE(source.user_id, source.requester_id) AS userID FROM group_reply r
      JOIN group_message source ON source.id = r.source_id WHERE r.id = ? AND r.attempt = ?`)
      .bind(job.turnID, job.attempt).first<{ agentID: string; groupID: string; userID: string }>();
    if (scope) album = await generatedImages(env, { ...scope, contributor, beforeSequence: draft.throughSequence + 1, turnID: job.turnID, attempt: job.attempt });
    attachment = album[0] ?? null;
  }
  const bindings = [job.turnID, job.attempt, draft.text, Date.now(), env.META_CHAT_MODEL.includes('contributor') ? 1 : 0,
    draft.throughSequence];
  // The watermark guard and insert run in the same transaction. If a message
  // arrived after review, neither publication nor a skip can complete this slot.
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE group_reply AS r SET status = 'failed' WHERE r.id = ?1 AND r.attempt = ?2 AND r.status = 'running'
      AND NOT (${groupLearningUnchanged(draft)})`).bind(job.turnID, job.attempt),
    env.DB.prepare(`INSERT INTO group_message (id, group_id, agent_id, sender_name, text, created_at, contributor_consent, exchange_id, requester_id, reply_to_id, attachment_json, attachments_json)
      SELECT r.id, r.group_id, r.agent_id, a.name, ?3, ?4, ?5, source.exchange_id, source.requester_id,
        (SELECT gm.id FROM group_message gm WHERE gm.id = ?7 AND gm.group_id = r.group_id
          AND gm.sequence <= ?6 AND gm.task_id IS NULL AND ${visibleMessage.replaceAll('?3', '?5')}), ?8, ?9
      FROM group_reply r JOIN contact_agent a ON a.id = r.agent_id JOIN group_message source ON source.id = r.source_id
      WHERE r.id = ?1 AND r.attempt = ?2 AND r.status = 'running' AND ?3 IS NOT NULL
      AND ${access} AND ${unchangedHistory} AND ${groupEnergyAvailable('r')} ON CONFLICT(id) DO NOTHING`).bind(...bindings, draft.replyToID ?? null, attachment ? JSON.stringify(attachment) : null, album.length > 1 ? JSON.stringify(album) : null),
    env.DB.prepare(`UPDATE group_reply AS r SET status = CASE WHEN ?7 = 0 AND EXISTS (SELECT 1 FROM group_message saved WHERE saved.id = r.id) THEN 'running' ELSE 'complete' END WHERE r.id = ?1 AND r.attempt = ?2 AND r.status = 'running'
      AND (EXISTS (SELECT 1 FROM group_message saved WHERE saved.id = r.id)
        OR (NOT (${groupEnergyAvailable('r')}))
        OR (?3 IS NULL AND ${access} AND ${unchangedHistory}))`).bind(...bindings, final ? 1 : 0),
    env.DB.prepare(`SELECT r.status, EXISTS (SELECT 1 FROM group_message WHERE id = r.id) AS published,
      EXISTS (${newerGroupMessage('?3')}) AS changed
      FROM group_reply r WHERE r.id = ?1 AND r.attempt = ?2`).bind(job.turnID, job.attempt, draft.throughSequence),
    ...(draft.invitesReply === false ? [closeTerminalContinuations(env.DB, job.turnID)] : []),
    ...recordLearningQuestion(env.DB, 'group', job.turnID, draft.learningQuestion, Date.now()),
  ]);
  const state = results[3].results[0] as { status: string; published: number; changed: number } | undefined;
  if (!state || state.status === 'failed' || state.status === 'queued') return 'inactive';
  if (state.published) return 'published';
  if (state.status === 'complete') return 'skipped';
  if (state.changed) return 'changed';
  throw new Error('GROUP_UNAVAILABLE_OR_CONSENT_REQUIRED');
}

async function publishGroupMessages(env: Env, job: GroupJob, step: WorkflowStep, messages: string[], invitesReply?: boolean, learningFence?: GroupDraft['learningFence'], learningQuestion?: GroupDraft['learningQuestion']) {
  for (let index = 1; index < messages.length; index++) {
    const id = `${job.turnID}/part/${index}`;
    const previousID = index === 1 ? job.turnID : `${job.turnID}/part/${index - 1}`;
    const typing = await step.do(`group-compose-message-${index}`, async () => {
      const previous = await env.DB.prepare('SELECT sequence FROM group_message WHERE id = ?').bind(previousID).first<{ sequence: number }>();
      return !!previous && await setGroupPresence(env, job, 'typing', previous.sequence);
    });
    if (!typing) break;
    await step.sleep(`group-message-pause-${index}`, messageDelay(messages[index], job.turnID));
    const published = await step.do(`group-publish-message-${index}`, async () => {
      const contributor = env.META_CHAT_MODEL.includes('contributor');
      // Stop the unsent tail if anyone else speaks. Previously delivered messages
      // remain intact, and the new input has its own reply opportunity.
      await env.DB.batch([env.DB.prepare(`INSERT INTO group_message
        (id, group_id, agent_id, sender_name, text, created_at, contributor_consent, exchange_id, requester_id)
        SELECT ?7, r.group_id, r.agent_id, agent.name, ?3, ?4, ?5, source.exchange_id, source.requester_id
        FROM group_reply r JOIN contact_agent agent ON agent.id = r.agent_id
        JOIN group_message source ON source.id = r.source_id
        JOIN group_message previous ON previous.id = ?8 AND previous.group_id = r.group_id
        WHERE r.id = ?1 AND r.attempt = ?2 AND r.status = 'running'
          AND ${publicationAccess(contributor)} AND ${groupLearningUnchanged({ text: null, throughSequence: 0, learningFence })} AND ${groupEnergyAvailable('r')}
          AND NOT EXISTS (SELECT 1 FROM group_message newer WHERE newer.group_id = r.group_id AND newer.sequence > previous.sequence)
          AND ?6 = 0 ON CONFLICT(id) DO NOTHING`)
        .bind(job.turnID, job.attempt, messages[index], Date.now(), contributor ? 1 : 0, 0, id, previousID),
        ...(invitesReply === false ? [closeTerminalContinuations(env.DB, id)] : []),
        ...recordLearningQuestion(env.DB, 'group', job.turnID, learningQuestion, Date.now()),
      ]);
      return !!await env.DB.prepare('SELECT id FROM group_message WHERE id = ?').bind(id).first();
    });
    if (!published) break;
    await step.do(`group-push-message-${index}`, async () => {
      try { await deliverGroupPush(env, id); }
      catch { console.error(JSON.stringify({ event: 'group_push_deferred' })); }
    });
  }
}

type Reader = { agentID: string; groupID: string; sequence: number };

// People's voice messages up to this round's trigger are transcribed once, by the
// oldest unfinished turn. Concurrent preparers wait for that transcript or for
// their predecessor to finish, preventing duplicate provider calls.
async function listenGroup(env: Env, job: GroupJob, step: WorkflowStep) {
  const pending = await step.do('group-voice-pending', async () => {
    const { results } = await env.DB.prepare(`SELECT gm.id, json_extract(gm.attachment_json, '$.durationMs') AS durationMs
      FROM group_reply r JOIN group_message source ON source.id = r.source_id
      JOIN group_message gm ON gm.group_id = r.group_id AND gm.sequence <= source.sequence
      WHERE r.id = ?1 AND r.attempt = ?2 AND r.status = 'running' AND gm.user_id IS NOT NULL
        AND gm.voice_transcribed_at IS NULL AND json_extract(gm.attachment_json, '$.mimeType') LIKE 'audio/%'
        AND EXISTS (SELECT 1 FROM agent_attention WHERE turn_id = ?1 AND attempt = ?2)
      ORDER BY gm.sequence DESC LIMIT 3`).bind(job.turnID, job.attempt).all<{ id: string; durationMs: number }>();
    return results;
  });
  if (!pending.length) return;
  let admitted = false;
  for (let wait = 0; wait < 180; wait++) {
    admitted = await step.do(`group-voice-admission-${wait}`, async () => !await env.DB.prepare(`SELECT 1
      FROM group_reply current JOIN group_reply prior ON prior.group_id = current.group_id
      WHERE current.id = ?1 AND prior.sequence < current.sequence AND prior.status IN ('queued','running')
        AND EXISTS (SELECT 1 FROM group_message voice WHERE voice.group_id = current.group_id
          AND voice.id IN (SELECT value FROM json_each(?2)) AND voice.voice_transcribed_at IS NULL) LIMIT 1`)
      .bind(job.turnID, JSON.stringify(pending.map(message => message.id))).first());
    if (admitted) break;
    await step.sleep(`group-voice-wait-${wait}`, '5 seconds');
  }
  if (!admitted) throw new Error('GROUP_VOICE_WAIT_EXPIRED');
  await step.sleep('group-listen-delay', '1 second');
  const listenedAt = await step.do('group-mark-listened', async () => {
    const now = Date.now();
    await env.DB.prepare(`UPDATE group_message SET voice_listened_at = COALESCE(voice_listened_at, ?1)
      WHERE id IN (SELECT value FROM json_each(?2))`).bind(now, JSON.stringify(pending.map(message => message.id))).run();
    return now;
  });
  try {
    await step.do('group-transcribe-voice', { retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' }, timeout: '4 minutes' }, async () => {
      for (const { id } of pending) {
        const row = await env.DB.prepare('SELECT attachment_json AS attachmentJSON FROM group_message WHERE id = ? AND voice_transcribed_at IS NULL')
          .bind(id).first<{ attachmentJSON: string | null }>();
        const audio = row && storedAttachment(row);
        if (!audio) continue;
        const transcript = await transcribeVoice(env, audio);
        await env.DB.prepare('UPDATE group_message SET text = ?, voice_transcribed_at = ? WHERE id = ? AND voice_transcribed_at IS NULL')
          .bind(transcript, Date.now(), id).run();
      }
      return true;
    });
  } catch { console.error(JSON.stringify({ event: 'group_voice_transcription_deferred' })); }
  // Listen to the newest clip before deciding whether to speak.
  await pauseGroupUntil(step, 'group-listen-pause', listenedAt + Math.min(pending[0].durationMs ?? 0, 60_000));
}

async function pauseGroupUntil(step: WorkflowStep, name: string, deadline: number) {
  const remaining = await step.do(`${name}-remaining`, async () => Math.max(0, deadline - Date.now()));
  if (remaining > 0) await step.sleep(name, remaining);
}

async function connectGroupReaders(env: Env, job: GroupJob) {
  const { results } = await env.DB.prepare(`SELECT DISTINCT receipt.recipient_id AS agentID, r.group_id AS groupID,
      source.sequence AS sequence
    FROM group_reply r JOIN group_message source ON source.id = r.source_id
    JOIN group_message gm ON gm.group_id = r.group_id AND gm.sequence <= source.sequence
    JOIN group_message_receipt receipt ON receipt.message_id = gm.id AND receipt.recipient_kind = 'agent'
    JOIN group_agent member ON member.group_id = r.group_id AND member.agent_id = receipt.recipient_id
    WHERE r.id = ?1 AND r.attempt = ?2 AND r.status = 'running' AND receipt.read_at IS NULL
      AND EXISTS (SELECT 1 FROM agent_attention WHERE turn_id = ?1 AND attempt = ?2)`)
    .bind(job.turnID, job.attempt).all<Reader>();
  if (results.length) await env.DB.batch(results.map(reader => connectAgent(env.DB, reader.agentID, Date.now() + 30_000)));
  return results;
}

async function markGroupRead(env: Env, job: GroupJob, readers: Reader[]) {
  await env.DB.batch(readers.map(reader => env.DB.prepare(`UPDATE group_message_receipt SET
      delivered_at = COALESCE(delivered_at, ?1), read_at = ?1
    WHERE recipient_kind = 'agent' AND recipient_id = ?2 AND read_at IS NULL
      AND message_id IN (SELECT id FROM group_message WHERE group_id = ?3 AND sequence <= ?4)
      AND EXISTS (SELECT 1 FROM agent_presence p WHERE p.agent_id = ?2 AND p.status != 'offline')
      AND EXISTS (SELECT 1 FROM agent_attention WHERE turn_id = ?5 AND attempt = ?6)`)
    .bind(Date.now(), reader.agentID, reader.groupID, reader.sequence, job.turnID, job.attempt)));
}

// The running reply's agent when its contact's creator turned on voice messages.
function groupVoiceScope(env: Env, job: GroupJob) {
  return env.DB.prepare(`SELECT r.agent_id AS agentID, r.group_id AS groupID FROM group_reply r
    JOIN contact_agent a ON a.id = r.agent_id JOIN contact owner_contact ON owner_contact.agent_id = a.id AND owner_contact.user_id = a.owner_id
    WHERE r.id = ? AND r.attempt = ? AND r.status = 'running' AND owner_contact.voice_messages_enabled = 1`)
    .bind(job.turnID, job.attempt).first<{ agentID: string; groupID: string }>();
}

export async function runGroup(bindings: Env, job: GroupJob, step: WorkflowStep) {
  const model = await step.do('group-select-account-model', () => jobModel(bindings, job.turnID, true));
  const env: Env = { ...bindings, META_CHAT_MODEL: model };
  const admitted = await step.do('group-check-attention', async () => !!await env.DB.prepare(
    'SELECT turn_id FROM agent_attention WHERE turn_id = ? AND attempt = ?').bind(job.turnID, job.attempt).first());
  if (!admitted) return;
  try {
    // Delivered → online → read → typing, as in private chats.
    await step.sleep('group-connect-delay', '1 second');
    await step.do('group-mark-running', async () => {
      await env.DB.batch([
        env.DB.prepare(`UPDATE group_reply SET status = 'running' WHERE id = ? AND attempt = ? AND status = 'queued'`)
          .bind(job.turnID, job.attempt),
        env.DB.prepare(`INSERT INTO agent_presence (agent_id, status, expires_at)
          SELECT agent_id, 'online', ?3 FROM group_reply WHERE id = ?1 AND attempt = ?2 AND status = 'running'
          AND EXISTS (SELECT 1 FROM agent_attention WHERE turn_id = ?1 AND attempt = ?2)
          ON CONFLICT(agent_id) DO UPDATE SET status = 'online', expires_at = excluded.expires_at`)
          .bind(job.turnID, job.attempt, Date.now() + 900_000),
      ]);
    });
    // Every contact in the group sees the round's message together, so the
    // receipt can turn Read before anyone types. Each connects before reading.
    const readers = await step.do('group-connect-readers', () => connectGroupReaders(env, job));
    if (readers.length) {
      await step.sleep('group-read-delay', '1 second');
      await step.do('group-mark-read', () => markGroupRead(env, job, readers));
    }
    await listenGroup(env, job, step);
    // The round coordinator picks speakers; an unselected slot ends here quietly.
    const slot = await planRound(env, job, step);
    if (slot.kind === 'skip') {
      await step.do('group-round-skip', () => env.DB.prepare(`UPDATE group_reply SET status = 'complete'
        WHERE id = ? AND attempt = ? AND status = 'running'`).bind(job.turnID, job.attempt).run().then(() => true));
    }
    const canSpeak = slot.kind !== 'skip' && await step.do('group-energy-admission', async () => {
      const row = await env.DB.prepare(`UPDATE group_reply AS r SET status = 'complete'
        WHERE r.id = ?1 AND r.attempt = ?2 AND r.status = 'running' AND NOT (${groupEnergyAvailable('r')})
        RETURNING id`).bind(job.turnID, job.attempt).first();
      return !row;
    });
    if (canSpeak) {
      await refreshSelfMemory(env, job, step, 'group-refresh-self-memory');
      let draft: GroupDraft | undefined;
      let outcome: PublishOutcome = 'changed';
      // Each draft/review is durable independently, so successful model calls are
      // not repeated when a later publish step retries or the Workflow resumes.
      for (let review = 0; review <= 2; review++) {
        const previous = draft;
        let preparation = await step.do(`group-prepare-input-${review}`, {
          retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' }, timeout: '2 minutes',
        }, async () => {
          const task = await env.DB.prepare('SELECT status FROM group_reply WHERE id = ? AND attempt = ?')
            .bind(job.turnID, job.attempt).first<{ status: string }>();
          if (!task || task.status !== 'running') return null;
          // Deciding whether to speak is not visible typing. A first planned
          // speaker is answering, so it types while its reply is generated.
          const typingSince = slot.kind === 'planned' && slot.rank === 1 && !previous
            && await setGroupPresence(env, job, 'typing') ? Date.now() : null;
          if (!typingSince) await setGroupPresence(env, job, 'online');
          const prepared = await prepareGroupInput(env, job, previous);
          return 'input' in prepared && typingSince ? { input: { ...prepared.input, typingSince } } : prepared;
        });
        if (!preparation) { outcome = 'inactive'; break; }
        let completed = 'draft' in preparation ? preparation.draft
          : await completeGroupDraft(env, preparation.input, step, `group-draft-${review}`);
        if (completed.deferActions) {
          // Only the second preparer can defer. Hold its attention claim while the
          // older turn finishes, so neither a third preparer nor duplicate actions enter.
          let ready = false;
          for (let wait = 0; wait < 180; wait++) {
            ready = await step.do(`group-action-lane-${review}-${wait}`, async () => !await env.DB.prepare(`SELECT 1
              FROM group_reply current JOIN group_reply prior ON prior.group_id = current.group_id
              WHERE current.id = ? AND ${earlierTurn}
                AND prior.status IN ('queued','running') LIMIT 1`).bind(job.turnID).first());
            if (ready) break;
            await step.sleep(`group-action-wait-${review}-${wait}`, '5 seconds');
          }
          if (!ready) throw new Error('GROUP_ACTION_WAIT_EXPIRED');
          preparation = await step.do(`group-action-refresh-${review}`, () => prepareGroupInput(env, job, previous));
          completed = 'draft' in preparation ? preparation.draft
            : await completeGroupDraft(env, preparation.input, step, `group-action-draft-${review}`);
          if (completed.deferActions) throw new Error('GROUP_ACTION_LANE_CHANGED');
        }
        draft = { ...completed, ...('input' in preparation ? { learningFence: preparation.input.learningFence } : {}) };
        // Later-ranked speakers of a planned round read this draft before deciding.
        const readyDraft = draft;
        await step.do(`group-draft-ready-${review}`, () => env.DB.prepare(`UPDATE group_reply SET draft_json = ?3, draft_ready_at = ?4
          WHERE id = ?1 AND attempt = ?2 AND plan_rank IS NOT NULL`).bind(job.turnID, job.attempt,
          JSON.stringify({ messages: readyDraft.messages ?? (readyDraft.text ? [readyDraft.text] : []),
            contributor: env.META_CHAT_MODEL.includes('contributor') }), Date.now()).run().then(() => true));
        // Ready drafts acquire the publication lane in readiness order. The
        // other agent keeps preparing, but cannot invalidate this draft's review
        // or execute shared actions out of order. Human traffic can still interrupt.
        let publicationReady = false;
        for (let wait = 0; wait < 180; wait++) {
          publicationReady = await step.do(`group-publication-lane-${review}-${wait}`, () => claimPublication(env, job));
          if (publicationReady) break;
          const active = await step.do(`group-publication-active-${review}-${wait}`, async () => !!await env.DB.prepare(
            "SELECT 1 FROM group_reply WHERE id = ? AND attempt = ? AND status = 'running'").bind(job.turnID, job.attempt).first());
          if (!active) break;
          await step.sleep(`group-publication-wait-${review}-${wait}`, '1 second');
        }
        if (!publicationReady) throw new Error('GROUP_PUBLICATION_WAIT_EXPIRED');
        const stale = await step.do(`group-ready-history-${review}`, async () => !!await env.DB.prepare(`SELECT 1
          FROM group_reply r WHERE r.id = ?1 AND EXISTS (${newerGroupMessage('?2')})`).bind(job.turnID, draft!.throughSequence).first());
        if (stale) { outcome = 'changed'; continue; }
        const prepared = draft;
        const firstMessage = prepared.messages?.[0] ?? prepared.text;
        const single = (prepared.messages?.length ?? 1) <= 1;
        const spokenText = prepared.messages?.[0] ?? prepared.text;
        // Only single-message replies without a generated image can be spoken.
        const spoken = !!(single && spokenText && !prepared.attachment && voiceSuitable(spokenText));
        if (firstMessage) {
          const recording = await step.do(`group-composition-mode-${review}`, async () =>
            !!(spoken && await groupVoiceScope(env, job) && await voiceRepliesAvailable(env)));
          // Recording replaces Typing for a spoken reply (a first planned speaker
          // already typed during generation).
          const typing = await step.do(`group-mark-typing-${review}`, async () => {
            const marked = await setGroupPresence(env, job, 'typing', prepared.throughSequence);
            if (marked && recording) await markRecording(env.DB, job.turnID, job.attempt);
            return marked;
          });
          // Typing already visible during generation counts toward the pause.
          if (typing) await pauseGroupUntil(step, `group-first-message-pause-${review}`, recording
            ? Date.now() + recordingDelay(firstMessage)
            : (prepared.typingSince ?? Date.now()) + messageDelay(firstMessage, job.turnID));
        }
        const voice = spoken && spokenText
          ? await step.do(`group-voice-message-${review}`, { retries: { limit: 0, delay: '1 second' }, timeout: '2 minutes' }, async () => {
            const scope = await groupVoiceScope(env, job);
            return scope ? speakMessage(env, { turnID: job.turnID, attempt: job.attempt, agentID: scope.agentID, text: spokenText,
              key: `group-attachments/${scope.groupID}/${scope.agentID}/${encodeURIComponent(job.turnID)}/voice-a${job.attempt}-${review}` }) : null;
          }).catch(() => null) : null;
        outcome = await step.do(`group-publish-draft-${review}`, async () => publishGroupDraft(env, job, { ...prepared, text: spokenText }, single, voice));
        if (outcome === 'published' && prepared.messages && prepared.messages.length > 1) {
          await step.do('group-push-first-message', async () => {
            try { await deliverGroupPush(env, job.turnID); }
            catch { console.error(JSON.stringify({ event: 'group_push_deferred' })); }
          });
          await publishGroupMessages(env, job, step, prepared.messages, prepared.invitesReply, prepared.learningFence, prepared.learningQuestion);
          await step.do('group-complete-message-burst', async () => {
            await env.DB.prepare(`UPDATE group_reply SET status = 'complete'
              WHERE id = ?1 AND attempt = ?2 AND status = 'running'
              AND EXISTS (SELECT 1 FROM group_message WHERE id = ?1)`)
              .bind(job.turnID, job.attempt).run();
          });
        }
        if (outcome !== 'changed') break;
      }
      if (outcome === 'changed') {
        await step.do('group-supersede-changing-turn', async () => {
          // Never publish the last unchecked draft. New human messages already
          // have their own rounds. Keep an undelivered required response visible
          // as failed; optional obsolete slots can finish silently.
          const result = await env.DB.prepare(`UPDATE group_reply SET status = ?3
            WHERE id = ?1 AND attempt = ?2 AND status = 'running'
            AND EXISTS (SELECT 1 FROM agent_attention WHERE turn_id = ?1 AND attempt = ?2)
            AND NOT EXISTS (SELECT 1 FROM group_message WHERE id = ?1)`)
            .bind(job.turnID, job.attempt, draft?.responseRequired ? 'failed' : 'complete').run();
          if (result.meta.changes) console.log(JSON.stringify({ event: 'group_turn_superseded', reason: 'context_kept_changing', responseRequired: !!draft?.responseRequired }));
        });
      }
      await step.do('group-release-publication', () => releasePublication(env, job));
      await step.do('group-deliver-push', async () => {
        try { await deliverGroupPush(env, job.turnID); }
        catch { console.error(JSON.stringify({ event: 'group_push_deferred' })); }
      });
      try {
        await step.do('group-remember', { retries: { limit: 1, delay: '5 seconds' }, timeout: '1 minute' }, async () => {
          await rememberGroupMessage(env, job.turnID, job.attempt);
        });
      } catch { console.error(JSON.stringify({ event: 'group_memory_deferred' })); }
    }
  } catch (error) {
    await step.do('group-save-failure', async () => {
      console.error(JSON.stringify({ event: 'group_reply_failed', code: safeErrorCode(error) }));
      await env.DB.prepare(`UPDATE group_reply SET status = 'failed' WHERE id = ? AND attempt = ? AND status IN ('queued','running')`)
        .bind(job.turnID, job.attempt).run();
    });
  }
  const published = await step.do('group-has-publication', async () => !!await env.DB.prepare(
    'SELECT id FROM group_message WHERE id = ?').bind(job.turnID).first());
  if (published) await refreshSelfMemory(env, job, step, 'group-remember-self-reply');
  try {
    await step.do('group-review-conversation-learning', { retries: { limit: 0, delay: '1 second' }, timeout: '1 minute' },
      () => learnFromReply(env, job.turnID, job.attempt, true));
  } catch { console.error(JSON.stringify({ event: 'conversation_learning_deferred' })); }
  await step.do('group-release-attention', async () => {
    const task = await env.DB.prepare('SELECT group_id AS groupID FROM group_reply WHERE id = ?').bind(job.turnID).first<{ groupID: string }>();
    await env.DB.prepare(`UPDATE agent_presence SET status = 'online', expires_at = ?3
      WHERE agent_id IN (SELECT agent_id FROM agent_attention WHERE turn_id = ?1 AND attempt = ?2)`)
      .bind(job.turnID, job.attempt, Date.now() + 30_000).run();
    await releasePublication(env, job);
    await releaseAttention(env, job);
    if (task) await dispatchGroup(env, task.groupID);
  });
  await step.do('group-dispatch-private-results', async () => {
    try { await dispatchGroupRequests(env); }
    catch { console.error(JSON.stringify({ event: 'group_result_dispatch_deferred' })); }
  });
}

async function refreshSelfMemory(env: Env, job: GroupJob, step: WorkflowStep, name: string) {
  try {
    await step.do(name, { retries: { limit: 1, delay: '5 seconds' }, timeout: '1 minute' }, async () => {
      const row = await env.DB.prepare(`SELECT r.agent_id AS id, r.group_id AS groupID FROM group_reply r
        JOIN agent_attention attention ON attention.turn_id = r.id AND attention.attempt = r.attempt
        WHERE r.id = ? AND r.attempt = ? AND r.status IN ('running', 'complete')
          AND ${groupSourceAccess('r', env.META_CHAT_MODEL.includes('contributor'))}`)
        .bind(job.turnID, job.attempt).first<{ id: string; groupID: string }>();
      if (row) await maintainAgentMemories(env, row.id, await jobAccountID(env, job.turnID, true), { groupID: row.groupID });
      return true;
    });
  } catch { console.error(JSON.stringify({ event: 'agent_memory_deferred' })); }
}
