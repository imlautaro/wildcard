import { messageDelay } from '../chat/messages';
import { safeErrorCode } from '../chat/meta';
import { jobAccountID, jobModel } from '../lib/model-preference';
import { groupEnergyAvailable } from './energy';
import { maintainAgentMemories } from '../chat/agent-memory';
import { groupSourceAccess } from './request-access';
import { dispatchGroupRequests } from './request-results';
import { prepareGroupInput, type GroupDraft } from './context';
import { completeGroupDraft } from './completion';
import { deliverGroupPush } from './push';
import type { WorkflowStep } from 'cloudflare:workers';
import { dispatchAgent, releaseAttention } from '../chat/dispatch';
import { rememberGroupMessage } from './memory';

export type GroupJob = { kind: 'group'; turnID: string; attempt: number };
export async function dispatchGroup(env: Env, groupID: string) {
  const row = await env.DB.prepare(`SELECT agent_id AS id FROM group_reply WHERE group_id = ?
    AND status IN ('queued', 'running') ORDER BY sequence LIMIT 1`).bind(groupID).first<{ id: string }>();
  if (row) await dispatchAgent(env, row.id);
}
export async function recoverGroups(env: Env) {
  const { results } = await env.DB.prepare(`SELECT DISTINCT group_id AS id FROM group_reply WHERE status IN ('queued','running')
    ORDER BY created_at LIMIT 50`).all<{ id: string }>();
  for (const group of results) await dispatchGroup(env, group.id);
}

type PublishOutcome = 'published' | 'skipped' | 'changed' | 'inactive';
// Recheck attention, source-author access, shared-agent consent and Contributor
// eligibility at publication, not just before a potentially slow model request.
const publicationAccess = (contributor: boolean) => `EXISTS (SELECT 1 FROM agent_attention attention
    WHERE attention.agent_id = r.agent_id AND attention.turn_id = r.id AND attention.attempt = r.attempt)
  AND EXISTS (SELECT 1 FROM group_agent member WHERE member.group_id = r.group_id AND member.agent_id = r.agent_id)
  AND ${groupSourceAccess('r', contributor)}
  AND EXISTS (SELECT 1 FROM contact_agent agent JOIN contact owner_contact
    ON owner_contact.agent_id = agent.id AND owner_contact.user_id = agent.owner_id
    WHERE agent.id = r.agent_id AND agent.memory_shared = 1)
  AND NOT EXISTS (SELECT 1 FROM group_member member WHERE member.group_id = r.group_id
    AND ?5 = 1 AND member.contributor_consent = 0)`;
const unchangedHistory = `NOT EXISTS (SELECT 1 FROM group_message newer
  WHERE newer.group_id = r.group_id AND newer.sequence > ?6)`;

async function publishGroupDraft(env: Env, job: GroupJob, draft: GroupDraft, final = true): Promise<PublishOutcome> {
  const access = publicationAccess(env.META_CHAT_MODEL.includes('contributor'));
  const bindings = [job.turnID, job.attempt, draft.text, Date.now(), env.META_CHAT_MODEL.includes('contributor') ? 1 : 0,
    draft.throughSequence];
  // The watermark guard and insert run in the same transaction. If a message
  // arrived after review, neither publication nor a skip can complete this slot.
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO group_message (id, group_id, agent_id, sender_name, text, created_at, contributor_consent, exchange_id, requester_id)
      SELECT r.id, r.group_id, r.agent_id, a.name, ?3, ?4, ?5, source.exchange_id, source.requester_id
      FROM group_reply r JOIN contact_agent a ON a.id = r.agent_id JOIN group_message source ON source.id = r.source_id
      WHERE r.id = ?1 AND r.attempt = ?2 AND r.status = 'running' AND ?3 IS NOT NULL
      AND ${access} AND ${unchangedHistory} AND ${groupEnergyAvailable('r')} ON CONFLICT(id) DO NOTHING`).bind(...bindings),
    env.DB.prepare(`UPDATE group_reply AS r SET status = CASE WHEN ?7 = 0 AND EXISTS (SELECT 1 FROM group_message saved WHERE saved.id = r.id) THEN 'running' ELSE 'complete' END WHERE r.id = ?1 AND r.attempt = ?2 AND r.status = 'running'
      AND (EXISTS (SELECT 1 FROM group_message saved WHERE saved.id = r.id)
        OR (NOT (${groupEnergyAvailable('r')}))
        OR (?3 IS NULL AND ${access} AND ${unchangedHistory}))`).bind(...bindings, final ? 1 : 0),
    env.DB.prepare(`SELECT r.status, EXISTS (SELECT 1 FROM group_message WHERE id = r.id) AS published,
      EXISTS (SELECT 1 FROM group_message newer WHERE newer.group_id = r.group_id AND newer.sequence > ?3) AS changed
      FROM group_reply r WHERE r.id = ?1 AND r.attempt = ?2`).bind(job.turnID, job.attempt, draft.throughSequence),
  ]);
  const state = results[2].results[0] as { status: string; published: number; changed: number } | undefined;
  if (!state || state.status === 'failed' || state.status === 'queued') return 'inactive';
  if (state.published) return 'published';
  if (state.status === 'complete') return 'skipped';
  if (state.changed) return 'changed';
  throw new Error('GROUP_UNAVAILABLE_OR_CONSENT_REQUIRED');
}

async function publishGroupMessages(env: Env, job: GroupJob, step: WorkflowStep, messages: string[]) {
  for (let index = 1; index < messages.length; index++) {
    await step.sleep(`group-message-pause-${index}`, messageDelay(messages[index]));
    const id = `${job.turnID}/part/${index}`;
    const previousID = index === 1 ? job.turnID : `${job.turnID}/part/${index - 1}`;
    const published = await step.do(`group-publish-message-${index}`, async () => {
      const contributor = env.META_CHAT_MODEL.includes('contributor');
      // Stop the unsent tail if anyone else speaks. Previously delivered messages
      // remain intact, and the new input has its own reply opportunity.
      await env.DB.prepare(`INSERT INTO group_message
        (id, group_id, agent_id, sender_name, text, created_at, contributor_consent, exchange_id, requester_id)
        SELECT ?7, r.group_id, r.agent_id, agent.name, ?3, ?4, ?5, source.exchange_id, source.requester_id
        FROM group_reply r JOIN contact_agent agent ON agent.id = r.agent_id
        JOIN group_message source ON source.id = r.source_id
        JOIN group_message previous ON previous.id = ?8 AND previous.group_id = r.group_id
        WHERE r.id = ?1 AND r.attempt = ?2 AND r.status = 'running'
          AND ${publicationAccess(contributor)} AND ${groupEnergyAvailable('r')}
          AND NOT EXISTS (SELECT 1 FROM group_message newer WHERE newer.group_id = r.group_id AND newer.sequence > previous.sequence)
          AND ?6 = 0 ON CONFLICT(id) DO NOTHING`)
        .bind(job.turnID, job.attempt, messages[index], Date.now(), contributor ? 1 : 0, 0, id, previousID).run();
      return !!await env.DB.prepare('SELECT id FROM group_message WHERE id = ?').bind(id).first();
    });
    if (!published) break;
    await step.do(`group-push-message-${index}`, async () => {
      try { await deliverGroupPush(env, id); }
      catch { console.error(JSON.stringify({ event: 'group_push_deferred' })); }
    });
  }
}

// Presence belongs to the current attempt and its exclusive attention claim.
async function setGroupPresence(env: Env, job: GroupJob, status: 'online' | 'typing', throughSequence: number | null = null) {
  const result = await env.DB.prepare(`UPDATE agent_presence SET status = ?3, expires_at = ?4
    WHERE agent_id IN (SELECT r.agent_id FROM group_reply r JOIN agent_attention attention
      ON attention.agent_id = r.agent_id AND attention.turn_id = r.id AND attention.attempt = r.attempt
      WHERE r.id = ?1 AND r.attempt = ?2 AND r.status = 'running'
        AND (?5 IS NULL OR NOT EXISTS (SELECT 1 FROM group_message newer
          WHERE newer.group_id = r.group_id AND newer.sequence > ?5)))`)
    .bind(job.turnID, job.attempt, status, Date.now() + 900_000, throughSequence).run();
  return result.meta.changes > 0;
}

export async function runGroup(bindings: Env, job: GroupJob, step: WorkflowStep) {
  const model = await step.do('group-select-account-model', () => jobModel(bindings, job.turnID, true));
  const env: Env = { ...bindings, META_CHAT_MODEL: model };
  const admitted = await step.do('group-check-attention', async () => !!await env.DB.prepare(
    'SELECT turn_id FROM agent_attention WHERE turn_id = ? AND attempt = ?').bind(job.turnID, job.attempt).first());
  if (!admitted) return;
  try {
    await step.sleep('group-connect-delay', '3 seconds');
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
    const canSpeak = await step.do('group-energy-admission', async () => {
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
        const preparation = await step.do(`group-prepare-input-${review}`, {
          retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' }, timeout: '2 minutes',
        }, async () => {
          const task = await env.DB.prepare('SELECT status FROM group_reply WHERE id = ? AND attempt = ?')
            .bind(job.turnID, job.attempt).first<{ status: string }>();
          if (!task || task.status !== 'running') return null;
          // Research and deciding whether to speak are not visible typing.
          await setGroupPresence(env, job, 'online');
          return prepareGroupInput(env, job, previous);
        });
        if (!preparation) { outcome = 'inactive'; break; }
        draft = 'draft' in preparation ? preparation.draft
          : await completeGroupDraft(env, preparation.input, step, `group-draft-${review}`);
        const prepared = draft;
        const firstMessage = prepared.messages?.[0] ?? prepared.text;
        if (firstMessage) {
          const typing = await step.do(`group-mark-typing-${review}`, () => setGroupPresence(env, job, 'typing', prepared.throughSequence));
          if (typing) await step.sleep(`group-first-message-pause-${review}`, messageDelay(firstMessage));
        }
        outcome = await step.do(`group-publish-draft-${review}`, async () => publishGroupDraft(env, job, { ...prepared, text: prepared.messages?.[0] ?? prepared.text }, (prepared.messages?.length ?? 1) <= 1));
        if (outcome === 'published' && prepared.messages && prepared.messages.length > 1) {
          await step.do('group-push-first-message', async () => {
            try { await deliverGroupPush(env, job.turnID); }
            catch { console.error(JSON.stringify({ event: 'group_push_deferred' })); }
          });
          await publishGroupMessages(env, job, step, prepared.messages);
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
          // have their own rounds; close this obsolete slot and unblock the queue.
          const result = await env.DB.prepare(`UPDATE group_reply SET status = 'complete'
            WHERE id = ?1 AND attempt = ?2 AND status = 'running'
            AND EXISTS (SELECT 1 FROM agent_attention WHERE turn_id = ?1 AND attempt = ?2)
            AND NOT EXISTS (SELECT 1 FROM group_message WHERE id = ?1)`)
            .bind(job.turnID, job.attempt).run();
          if (result.meta.changes) console.log(JSON.stringify({ event: 'group_turn_superseded', reason: 'context_kept_changing' }));
        });
      }
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
  await step.do('group-release-attention', async () => {
    const task = await env.DB.prepare('SELECT group_id AS groupID FROM group_reply WHERE id = ?').bind(job.turnID).first<{ groupID: string }>();
    await env.DB.prepare(`UPDATE agent_presence SET status = 'online', expires_at = ?3
      WHERE agent_id IN (SELECT agent_id FROM agent_attention WHERE turn_id = ?1 AND attempt = ?2)`)
      .bind(job.turnID, job.attempt, Date.now() + 30_000).run();
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
        WHERE r.id = ? AND r.attempt = ? AND r.status IN ('running', 'complete')`)
        .bind(job.turnID, job.attempt).first<{ id: string; groupID: string }>();
      if (row) await maintainAgentMemories(env, row.id, await jobAccountID(env, job.turnID, true), { groupID: row.groupID });
      return true;
    });
  } catch { console.error(JSON.stringify({ event: 'agent_memory_deferred' })); }
}
