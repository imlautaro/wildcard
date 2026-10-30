import type { WorkflowStep } from 'cloudflare:workers';
import { safeErrorCode } from '../chat/meta';
import { accountModel, standardModel } from '../lib/model-preference';
import { cardLifetimes } from './cards';
import { composeCard, homeLimits, planHome, type ComposeContext, type PlannedTopic } from './curator';
import { readSignals } from './signals';

export type HomeJob = { kind: 'home'; userID: string; revision: number; force: boolean };
type ComposeJob = PlannedTopic & { id: string; position: number; previous: string | null };
type RunPlan = { context: ComposeContext; model: string; compose: ComposeJob[]; titles: string[] };

// Curation runs only for people who opened Home recently; a run that has not
// finished in this time is claimed again (its writes are fenced by revision).
const viewWindow = 3 * 86_400_000, staleRun = 45 * 60_000, retryDelay = 10 * 60_000;
export const homeEnabled = (env: Env) => env.HOME_FEED_ENABLED === 'true' && !!env.META_API_KEY?.trim();
const current = (env: Env, job: HomeJob) => env.DB.prepare(`SELECT 1 FROM home_feed WHERE user_id = ? AND revision = ? AND status = 'running'`)
  .bind(job.userID, job.revision).first();

/** Starts due curation runs; with userID, only that person's (after a request). */
export async function dispatchHome(env: Env, userID?: string) {
  if (!homeEnabled(env)) return;
  const now = Date.now();
  const { results } = await env.DB.prepare(`SELECT user_id AS userID, revision FROM home_feed
    WHERE (?4 IS NULL OR user_id = ?4) AND ((status = 'idle' AND due_at <= ?1 AND viewed_at > ?2) OR (status = 'running' AND claimed_at < ?3))
    ORDER BY due_at LIMIT 5`).bind(now, now - viewWindow, now - staleRun, userID ?? null).all<{ userID: string; revision: number }>();
  const outcomes = await Promise.allSettled(results.map(async row => {
    const claimed = await env.DB.prepare(`UPDATE home_feed SET status = 'running', revision = revision + 1, claimed_at = ?1,
        progress_json = NULL, error_code = NULL
      WHERE user_id = ?2 AND revision = ?3 RETURNING revision, requested_at AS requestedAt`)
      .bind(now, row.userID, row.revision).first<{ revision: number; requestedAt: number | null }>();
    if (!claimed) return;
    const job: HomeJob = { kind: 'home', userID: row.userID, revision: claimed.revision, force: (claimed.requestedAt ?? 0) > now - 10 * 60_000 };
    const id = `home-${row.userID}-${claimed.revision}`;
    try { await env.CHAT_WORKFLOW.create({ id, params: job }); }
    catch {
      // The acknowledgement can be lost after the instance exists; only release the claim when it does not.
      const exists = await env.CHAT_WORKFLOW.get(id).then(instance => instance.status()).then(() => true, () => false);
      if (!exists) await env.DB.prepare(`UPDATE home_feed SET status = 'idle', due_at = ?1 WHERE user_id = ?2 AND revision = ?3 AND status = 'running'`)
        .bind(now + 60_000, row.userID, claimed.revision).run();
    }
  }));
  if (outcomes.some(outcome => outcome.status === 'rejected')) console.error(JSON.stringify({ event: 'home_dispatch_deferred' }));
}

async function finish(env: Env, job: HomeJob, error: string | null) {
  const now = Date.now();
  const next = await env.DB.prepare('SELECT MIN(expires_at) AS at FROM home_card WHERE user_id = ?').bind(job.userID).first<{ at: number | null }>();
  // Next automatic run when the first card goes stale, between one and twelve hours away.
  const due = error ? now + retryDelay : Math.min(now + 12 * 3_600_000, Math.max(now + 3_600_000, next?.at ?? now + 6 * 3_600_000));
  // A request or a new topic that arrived during this run gets its own run right away.
  await env.DB.prepare(`UPDATE home_feed SET status = 'idle', generated_at = CASE WHEN ?2 IS NULL THEN ?3 ELSE generated_at END,
      due_at = CASE WHEN COALESCE(requested_at, 0) > claimed_at OR EXISTS (SELECT 1 FROM home_topic t WHERE t.user_id = home_feed.user_id
        AND t.status = 'active' AND t.source != 'curator' AND t.created_at > home_feed.claimed_at) THEN ?3 + 60000 ELSE ?1 END,
      progress_json = NULL, error_code = ?2, requested_at = CASE WHEN requested_at > claimed_at THEN requested_at END
    WHERE user_id = ?4 AND revision = ?5 AND status = 'running'`).bind(due, error, now, job.userID, job.revision).run();
}

// Saves the plan: topics the person or a contact asked for keep their source;
// curator topics left out of the plan are retired with their cards.
async function plan(env: Env, job: HomeJob): Promise<RunPlan | { error: string }> {
  if (!await current(env, job)) return { error: 'HOME_SUPERSEDED' };
  const signals = await readSignals(env.DB, job.userID);
  if (!signals) return { error: 'HOME_SUPERSEDED' };
  if (!signals.contacts.length) return { error: 'HOME_NO_CONTACTS' };
  const model = await accountModel(env, job.userID);
  const planned = await planHome({ ...env, META_CHAT_MODEL: model }, signals, model);
  const now = Date.now();
  const topics = planned.topics.map(topic => ({ ...topic, id: topic.id ?? crypto.randomUUID() }));
  const kept = new Set(topics.map(topic => topic.id));
  const fence = `EXISTS (SELECT 1 FROM home_feed WHERE user_id = ?2 AND revision = ?3 AND status = 'running')`;
  await env.DB.batch([
    ...topics.map((topic, position) => env.DB.prepare(`INSERT INTO home_topic (id, user_id, title, brief, reason, kind, source, contact_id, created_at, updated_at)
        SELECT ?1, ?2, ?4, ?5, ?6, ?7, 'curator', ?8, ?9, ?9 WHERE ${fence} AND EXISTS (SELECT 1 FROM contact WHERE id = ?8 AND user_id = ?2)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, brief = excluded.brief, reason = excluded.reason, kind = excluded.kind,
        contact_id = excluded.contact_id, updated_at = excluded.updated_at
      WHERE home_topic.user_id = excluded.user_id AND home_topic.status = 'active'`)
      .bind(topic.id, job.userID, job.revision, topic.title, topic.brief, topic.reason || null, topic.kind, topic.contactID, now + position)),
    ...topics.map((topic, position) => env.DB.prepare(`UPDATE home_card SET position = ?4 WHERE topic_id = ?1 AND user_id = ?2 AND ${fence}`)
      .bind(topic.id, job.userID, job.revision, position)),
    // A curator topic left out is retired only once its card is stale, so one
    // inconsistent plan never throws away fresh cards.
    ...signals.topics.filter(topic => topic.source === 'curator' && topic.status === 'active' && !kept.has(topic.id)
      && (signals.cards.find(card => card.topicID === topic.id)?.expiresAt ?? 0) <= now).flatMap(topic => [
      env.DB.prepare(`DELETE FROM home_card WHERE topic_id = ?1 AND user_id = ?2 AND ${fence}`).bind(topic.id, job.userID, job.revision),
      env.DB.prepare(`UPDATE home_topic SET status = 'retired', updated_at = ?4 WHERE id = ?1 AND user_id = ?2 AND ${fence}`)
        .bind(topic.id, job.userID, job.revision, now),
    ]),
    env.DB.prepare(`UPDATE home_feed SET briefing = ?1 WHERE user_id = ?2 AND revision = ?3 AND status = 'running'`)
      .bind(planned.briefing || null, job.userID, job.revision),
    env.DB.prepare(`DELETE FROM home_topic WHERE user_id = ? AND status = 'retired' AND updated_at < ?`).bind(job.userID, now - 7 * 86_400_000),
  ]);
  // Compose new topics and stale cards, best first; a requested refresh also
  // renews cards older than half an hour.
  const requested = new Set(signals.topics.filter(topic => topic.source !== 'curator').map(topic => topic.id));
  const compose = topics.map((topic, position) => ({ topic, position, card: signals.cards.find(card => card.topicID === topic.id) }))
    .filter(({ card }) => !card || card.expiresAt <= now || (job.force && card.generatedAt < now - 30 * 60_000))
    // Topics someone asked for go first, so the per-run cap never delays them behind curator picks.
    .sort((a, b) => Number(requested.has(b.topic.id)) - Number(requested.has(a.topic.id)))
    .slice(0, homeLimits.composePerRun)
    .map(({ topic, position, card }) => ({ ...topic, position, previous: card?.payloadJSON ?? null }));
  return {
    model, compose, titles: topics.map(topic => topic.title),
    context: { userID: job.userID, userName: signals.userName, timeZone: signals.timeZone, language: planned.language,
      memories: signals.memories, messages: signals.messages, contacts: signals.contacts, connectors: signals.connectors.map(connector => connector.name) },
  };
}

async function compose(env: Env, job: HomeJob, run: RunPlan, index: number, research: { remaining: number }): Promise<string> {
  const topic = run.compose[index]!;
  if (!await current(env, job)) return 'HOME_SUPERSEDED';
  await env.DB.prepare(`UPDATE home_feed SET progress_json = ?1 WHERE user_id = ?2 AND revision = ?3 AND status = 'running'`)
    .bind(JSON.stringify({ total: run.compose.length, done: index, title: topic.title, contactID: topic.contactID }), job.userID, job.revision).run();
  // Connector data is processed with Standard, as in connector-isolated chats.
  const model = topic.connector ? standardModel : run.model;
  const budget = { get research() { return research.remaining; }, set research(value: number) { research.remaining = value; },
    researchID: (attempt: number) => `home-${job.userID}-${job.revision}-${topic.id}-${attempt}`, topicID: topic.id };
  const result = await composeCard({ ...env, META_CHAT_MODEL: model }, run.context, topic, topic.previous,
    run.titles.filter(title => title !== topic.title), model, budget);
  const now = Date.now();
  if (!result) {
    // Nothing honest to show now: keep an earlier card for another hour, without a new revision.
    await env.DB.prepare(`UPDATE home_card SET expires_at = ?1 WHERE topic_id = ?2 AND user_id = ?3`).bind(now + 3_600_000, topic.id, job.userID).run();
    return 'skipped';
  }
  const { card } = result;
  await env.DB.prepare(`INSERT INTO home_card (id, user_id, topic_id, contact_id, kind, position, payload_json, connector, generated_at, expires_at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10
      WHERE EXISTS (SELECT 1 FROM home_feed WHERE user_id = ?2 AND revision = ?11 AND status = 'running')
        AND EXISTS (SELECT 1 FROM home_topic WHERE id = ?3 AND user_id = ?2 AND status = 'active')
        AND EXISTS (SELECT 1 FROM contact WHERE id = ?4 AND user_id = ?2)
    ON CONFLICT(topic_id) DO UPDATE SET contact_id = excluded.contact_id, kind = excluded.kind, position = excluded.position,
      payload_json = excluded.payload_json, connector = excluded.connector, revision = home_card.revision + 1,
      generated_at = excluded.generated_at, expires_at = excluded.expires_at
    WHERE home_card.user_id = excluded.user_id`)
    .bind(crypto.randomUUID(), job.userID, topic.id, topic.contactID, card.kind, topic.position, JSON.stringify(card), result.connector ? 1 : 0,
      now, now + cardLifetimes[card.kind], job.revision).run();
  return 'published';
}

export async function runHome(env: Env, job: HomeJob, step: WorkflowStep) {
  let error: string | null = null;
  try {
    const run = await step.do('home-plan', { retries: { limit: 1, delay: '15 seconds' }, timeout: '4 minutes' }, () => plan(env, job));
    if ('error' in run) error = run.error;
    else {
      const research = { remaining: homeLimits.researchPerRun };
      for (let index = 0; index < run.compose.length; index++) {
        // Each card is its own checkpoint, so a crash never repeats published cards
        // and the feed fills progressively while clients poll.
        const outcome = await step.do(`home-compose-${index}`, { retries: { limit: 1, delay: '15 seconds' }, timeout: '6 minutes' }, async () => {
          const outcome = await compose(env, job, run, index, research);
          return { outcome, research: research.remaining };
        }).catch(cause => {
          console.error(JSON.stringify({ event: 'home_card_failed', code: safeErrorCode(cause) }));
          return { outcome: 'failed', research: research.remaining };
        });
        research.remaining = outcome.research;
        if (outcome.outcome === 'HOME_SUPERSEDED') return;
      }
    }
  } catch (cause) {
    error = safeErrorCode(cause);
    console.error(JSON.stringify({ event: 'home_plan_failed', code: error }));
  }
  if (error === 'HOME_SUPERSEDED') return;
  await step.do('home-finish', () => finish(env, job, error));
}
