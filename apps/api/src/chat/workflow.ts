import { maintainAgentMemories } from './agent-memory';
import { dispatchGroupRequests } from '../groups/request-results';
import { groupRequestTurnAllowed } from '../groups/request-access';
import { runGroup, type GroupJob } from '../groups/workflow';
import { scheduleAllowed } from '../schedules/data';
import { runVisit, type VisitJob } from './visits';
import { expirePresence, markTyping } from './presence';
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { enqueueReply, deliverPush } from '../push/delivery';
import { activeTurn, type ChatJob } from './data';
import { contactReply } from './context';
import { maintainMemories } from './memory';
import { releaseAttention } from './dispatch';

export class ChatWorkflow extends WorkflowEntrypoint<Env, ChatJob | VisitJob | GroupJob> {
  async run(event: WorkflowEvent<ChatJob | VisitJob | GroupJob>, step: WorkflowStep) {
    if ('kind' in event.payload) {
      if (event.payload.kind === 'group') await runGroup(this.env, event.payload, step);
      else await runVisit(this.env, event.payload, step);
      return;
    }
    const job = event.payload;
    const admitted = await step.do('check-attention', async () => !!await this.env.DB.prepare(
      'SELECT turn_id FROM agent_attention WHERE turn_id = ? AND attempt = ?')
      .bind(job.turnID, job.attempt).first());
    if (!admitted) return;
    try {
      // Keep the queued agent disconnected until it actually starts handling the message.
      await step.sleep('connect-delay', '3 seconds');
      await step.do('mark-running', async () => {
        await this.env.DB.prepare(`UPDATE chat_turn SET status = 'running', updated_at = ?1
          WHERE id = ?2 AND attempt = ?3 AND status = 'queued'`)
          .bind(Date.now(), job.turnID, job.attempt).run();
        return true;
      });
      await this.refreshMemory(job, step, 'refresh-prior-memory', false);
      await this.refreshAgentMemory(job, step, 'refresh-agent-self-memory');
      await step.do('generate-and-save', {
        retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
        timeout: '3 minutes',
      }, async () => {
        const turn = await activeTurn(this.env.DB, job);
        if (!turn || turn.status === 'complete' || turn.status === 'failed') return false;
        const contact = await this.env.DB.prepare('SELECT name FROM contact WHERE id = ?1 AND user_id = ?2')
          .bind(turn.contactID, turn.userID).first<{ name: string }>();
        if (!contact) return false;
        await markTyping(this.env.DB, job);
        const reply = await contactReply(this.env, turn, contact.name);
        // Save before checkpointing. A replay sees completion and skips another call.
        const now = Date.now();
        const resultAllowed = groupRequestTurnAllowed('chat_turn', this.env.META_CHAT_MODEL.includes('contributor'));
        await this.env.DB.batch([this.env.DB.prepare(`UPDATE chat_turn SET assistant_text = ?1, status = 'complete', error_code = NULL, updated_at = ?2
          WHERE id = ?3 AND attempt = ?4 AND status = 'running' AND ${scheduleAllowed('chat_turn')} AND ${resultAllowed}`)
          .bind(reply, now, job.turnID, job.attempt),
          this.env.DB.prepare(`UPDATE chat_turn SET status = 'failed', error_code = 'GROUP_REQUEST_CANCELLED', updated_at = ?1
            WHERE id = ?2 AND attempt = ?3 AND status = 'running' AND NOT (${resultAllowed})`)
            .bind(now, job.turnID, job.attempt),
          enqueueReply(this.env.DB, job.turnID, job.attempt, now),
        ]);
        return true;
      });
    } catch {
      await step.do('save-failure', { retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' } }, async () => {
        await this.env.DB.prepare(`UPDATE chat_turn SET status = 'failed', error_code = 'GENERATION_FAILED', updated_at = ?1
          WHERE id = ?2 AND attempt = ?3 AND status IN ('queued', 'running')`)
          .bind(Date.now(), job.turnID, job.attempt).run();
        return true;
      });
    }
    // Push failures never mark an already saved reply as failed. Cron retries the outbox.
    await step.do('deliver-push', async () => {
      try { await deliverPush(this.env, job.turnID); }
      catch { console.error(JSON.stringify({ event: 'push_delivery_deferred' })); }
      return true;
    });
    await this.refreshMemory(job, step, 'remember-completed-turn', true);
    await this.refreshAgentMemory(job, step, 'remember-agent-self-reply');
    await step.do('release-attention', async () => { await releaseAttention(this.env, job); });
    await step.do('dispatch-group-results', async () => {
      try { await dispatchGroupRequests(this.env); }
      catch { console.error(JSON.stringify({ event: 'group_result_dispatch_deferred' })); }
    });
    const deadline = await step.do('presence-deadline', async () => {
      const row = await this.env.DB.prepare(`SELECT updated_at + 30000 AS expiresAt FROM chat_turn
        WHERE id = ?1 AND attempt = ?2 AND status IN ('complete', 'failed')`)
        .bind(job.turnID, job.attempt).first<{ expiresAt: number | null }>();
      return row?.expiresAt ?? null;
    });
    if (deadline !== null) {
      await step.sleepUntil('presence-idle', new Date(deadline));
      await step.do('expire-presence', async () => { await expirePresence(this.env.DB); });
    }
  }

  private async refreshAgentMemory(job: ChatJob, step: WorkflowStep, name: string) {
    try {
      await step.do(name, { retries: { limit: 1, delay: '5 seconds' }, timeout: '1 minute' }, async () => {
        const row = await this.env.DB.prepare(`SELECT c.agent_id AS id FROM chat_turn t JOIN contact c ON c.id = t.contact_id
          JOIN agent_attention attention ON attention.turn_id = t.id AND attention.attempt = t.attempt
          WHERE t.id = ? AND t.attempt = ? AND t.status IN ('running', 'complete')`)
          .bind(job.turnID, job.attempt).first<{ id: string }>();
        if (row) await maintainAgentMemories(this.env, row.id);
        return true;
      });
    } catch { console.error(JSON.stringify({ event: 'agent_memory_deferred' })); }
  }

  private async refreshMemory(job: ChatJob, step: WorkflowStep, name: string, includeCurrent: boolean) {
    try {
      await step.do(name, { retries: { limit: 1, delay: '5 seconds' }, timeout: '1 minute' }, async () => {
        const turn = await activeTurn(this.env.DB, job);
        if (!turn || turn.groupRequestID || (includeCurrent && turn.status !== 'complete') || turn.status === 'failed') return false;
        const { results } = await this.env.DB.prepare(`SELECT c.id, c.user_id AS userID FROM contact c
          WHERE c.agent_id = (SELECT agent_id FROM contact WHERE id = ?1) AND (?2 = 0 OR c.id = ?1)`)
          .bind(turn.contactID, includeCurrent ? 1 : 0).all<{ id: string; userID: string }>();
        for (const member of results) {
          await maintainMemories(this.env, { contactID: member.id, userID: member.userID,
            beforeSequence: member.id === turn.contactID ? turn.sequence + (includeCurrent ? 1 : 0) : Number.MAX_SAFE_INTEGER });
        }
        return true;
      });
    } catch {
      console.error(JSON.stringify({ event: 'chat_memory_deferred' }));
    }
  }
}
