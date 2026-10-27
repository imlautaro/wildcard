import { scheduleAllowed } from '../schedules/data';
import { runVisit, type VisitJob } from './visits';
import { expirePresence, markTyping } from './presence';
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { enqueueReply, deliverPush } from '../push/delivery';
import { activeTurn, type ChatJob } from './data';
import { contactReply } from './context';
import { maintainMemories } from './memory';

export class ChatWorkflow extends WorkflowEntrypoint<Env, ChatJob | VisitJob> {
  async run(event: WorkflowEvent<ChatJob | VisitJob>, step: WorkflowStep) {
    if ('kind' in event.payload) {
      await runVisit(this.env, event.payload, step);
      return;
    }
    const job = event.payload;
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
        await this.env.DB.batch([this.env.DB.prepare(`UPDATE chat_turn SET assistant_text = ?1, status = 'complete', error_code = NULL, updated_at = ?2
          WHERE id = ?3 AND attempt = ?4 AND status = 'running' AND ${scheduleAllowed('chat_turn')}`)
          .bind(reply, now, job.turnID, job.attempt),
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

  private async refreshMemory(job: ChatJob, step: WorkflowStep, name: string, includeCurrent: boolean) {
    try {
      await step.do(name, { retries: { limit: 1, delay: '5 seconds' }, timeout: '1 minute' }, async () => {
        const turn = await activeTurn(this.env.DB, job);
        if (!turn || (includeCurrent && turn.status !== 'complete') || turn.status === 'failed') return false;
        await maintainMemories(this.env, { contactID: turn.contactID, userID: turn.userID,
          beforeSequence: turn.sequence + (includeCurrent ? 1 : 0) });
        return true;
      });
    } catch {
      console.error(JSON.stringify({ event: 'chat_memory_deferred' }));
    }
  }
}
