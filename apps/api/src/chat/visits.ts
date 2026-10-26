import type { WorkflowStep } from 'cloudflare:workers';
import { expirePresence } from './presence';

export type VisitJob = { kind: 'visit'; visitID: string; contactID: string; userID: string };
type VisitRow = { readyAt: number; expiresAt: number; connected: number; closed: number };

export async function dispatchVisit(env: Env, job: VisitJob) {
  const id = `visit-${job.visitID}`;
  try { await env.CHAT_WORKFLOW.create({ id, params: job }); }
  catch {
    // Retrying an accepted open must reuse its existing durable job.
    await (await env.CHAT_WORKFLOW.get(id)).status();
  }
}

export async function recoverVisits(env: Env) {
  const now = Date.now();
  const { results } = await env.DB.prepare(`SELECT id AS visitID, contact_id AS contactID, user_id AS userID
    FROM chat_visit WHERE connected = 0 AND closed = 0 AND ready_at <= ?1 AND expires_at > ?1
    ORDER BY ready_at LIMIT 20`).bind(now).all<Omit<VisitJob, 'kind'>>();
  for (let i = 0; i < results.length; i += 5) {
    const outcomes = await Promise.allSettled(results.slice(i, i + 5).map((row) => dispatchVisit(env, { ...row, kind: 'visit' })));
    if (outcomes.some((outcome) => outcome.status === 'rejected')) {
      console.error(JSON.stringify({ event: 'visit_dispatch_deferred' }));
    }
  }
}

export async function runVisit(env: Env, job: VisitJob, step: WorkflowStep) {
  const read = () => env.DB.prepare(`SELECT ready_at AS readyAt, expires_at AS expiresAt, connected, closed
    FROM chat_visit WHERE id = ?1 AND contact_id = ?2 AND user_id = ?3`)
    .bind(job.visitID, job.contactID, job.userID).first<VisitRow>();
  const initial = await step.do('visit-load', read);
  if (!initial || initial.closed) return;
  await step.sleepUntil('visit-connect-delay', new Date(initial.readyAt));
  let deadline = await step.do('visit-connect', async () => {
    await expirePresence(env.DB);
    const now = Date.now();
    await env.DB.prepare(`UPDATE chat_visit SET connected = 1, updated_at = ?1
      WHERE id = ?2 AND contact_id = ?3 AND user_id = ?4 AND connected = 0 AND closed = 0
        AND ready_at <= ?1 AND expires_at > ?1`)
      .bind(now, job.visitID, job.contactID, job.userID).run();
    const row = await read();
    return row?.connected ? row.expiresAt : null;
  });
  // Bound workflow steps for exceptionally long drafting sessions. Cron and
  // authoritative reads continue expiry even after the durable loop finishes.
  for (let i = 0; deadline !== null && i < 120; i++) {
    await step.sleepUntil(`visit-idle-${i}`, new Date(deadline));
    deadline = await step.do(`visit-expire-${i}`, async () => {
      await expirePresence(env.DB);
      const row = await read();
      return row && row.expiresAt > Date.now() ? row.expiresAt : null;
    });
  }
}
