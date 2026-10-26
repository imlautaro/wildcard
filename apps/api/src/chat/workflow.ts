import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { enqueueReply, deliverPush } from '../push/delivery';
import { activeTurn, type ChatJob } from './data';
import { museReply, type ModelMessage } from './meta';

export class ChatWorkflow extends WorkflowEntrypoint<Env, ChatJob> {
  async run(event: WorkflowEvent<ChatJob>, step: WorkflowStep) {
    const job = event.payload;
    try {
      await step.do('mark-running', async () => {
        await this.env.DB.prepare(`UPDATE chat_turn SET status = 'running', updated_at = ?1
          WHERE id = ?2 AND attempt = ?3 AND status = 'queued'`)
          .bind(Date.now(), job.turnID, job.attempt).run();
        return true;
      });
      await step.do('generate-and-save', {
        retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
        timeout: '3 minutes',
      }, async () => {
        const turn = await activeTurn(this.env.DB, job);
        if (!turn || turn.status === 'complete' || turn.status === 'failed') return false;
        const contact = await this.env.DB.prepare('SELECT name FROM contact WHERE id = ?1 AND user_id = ?2')
          .bind(turn.contactID, turn.userID).first<{ name: string }>();
        if (!contact) return false;
        const { results } = await this.env.DB.prepare(`SELECT user_text AS userText, assistant_text AS assistantText
          FROM chat_turn WHERE contact_id = ?1 AND user_id = ?2 AND sequence < ?3 AND status = 'complete'
          ORDER BY sequence DESC LIMIT 20`).bind(turn.contactID, turn.userID, turn.sequence)
          .all<{ userText: string; assistantText: string }>();
        const history: ModelMessage[] = [];
        let remaining = 60_000;
        for (const prior of results) {
          const length = prior.userText.length + prior.assistantText.length;
          if (length > remaining) break;
          history.unshift({ role: 'user', content: prior.userText }, { role: 'assistant', content: prior.assistantText });
          remaining -= length;
        }
        const reply = await museReply(this.env.META_API_KEY, [
          { role: 'system', content: `You are a helpful private conversational assistant. Your contact display name is ${JSON.stringify(contact.name)}. Only use the conversation provided; do not claim access to other users, sensors, or external tools.` },
          ...history,
          { role: 'user', content: turn.userText },
        ], this.env.META_CHAT_MODEL);
        // Save before checkpointing. A replay sees completion and skips another call.
        const now = Date.now();
        await this.env.DB.batch([this.env.DB.prepare(`UPDATE chat_turn SET assistant_text = ?1, status = 'complete', error_code = NULL, updated_at = ?2
          WHERE id = ?3 AND attempt = ?4 AND status = 'running'`)
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
  }
}
