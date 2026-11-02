import type { WorkflowStep } from 'cloudflare:workers';
import { safeErrorCode } from '../chat/meta';
import { accountModel, standardModel } from '../lib/model-preference';
import { cardLifetimes } from './cards';
import { composeCard, homeLimits, planHome, scanNews, type ComposeContext, type EarlierPost, type PlannedTopic, type QuotablePost } from './curator';
import { homeContactReady, readSignals } from './signals';
import { reviewCandidates, type ReviewCandidate } from './review';
import type { CardKind } from './cards';

export type HomeJob = { kind: 'home'; userID: string; revision: number; force: boolean };
type ComposeJob = PlannedTopic & { id: string; position: number; previous: string | null; earlier: EarlierPost[]; quotable?: QuotablePost[] };
type RunPlan = { context: ComposeContext; model: string; compose: ComposeJob[]; titles: string[] };

// Curation runs only for people who opened Home recently; a run that has not
// finished in this time is claimed again (its writes are fenced by revision).
const viewWindow = 3 * 86_400_000, staleRun = 45 * 60_000, retryDelay = 10 * 60_000;
// Posts stay in the timeline this long (docs/updates.md#posts); three earlier ones go to the composer.
export const postRetention = 14 * 86_400_000;
const earlierPosts = 3;
// Each run publishes at most one post per topic, so the revision makes a retried step rewrite its own post.
const postID = (topicID: string, revision: number, review = false) => `${topicID}-${revision}${review ? '-review' : ''}`;
export const homeEnabled = (env: Env) => env.HOME_FEED_ENABLED === 'true' && !!env.META_API_KEY?.trim();
const current = (env: Env, job: HomeJob) => env.DB.prepare(`SELECT 1 FROM home_feed WHERE user_id = ? AND revision = ? AND status = 'running'`)
  .bind(job.userID, job.revision).first();

/** Starts due curation runs; with userID, only that person's (after a request). */
export async function dispatchHome(env: Env, userID?: string) {
  if (!homeEnabled(env)) return;
  const now = Date.now();
  const { results } = await env.DB.prepare(`SELECT user_id AS userID, revision FROM home_feed
    WHERE (?4 IS NULL OR user_id = ?4) AND ((status = 'idle' AND (due_at <= ?1 OR error_code = 'HOME_NO_CONTACTS') AND viewed_at > ?2) OR (status = 'running' AND claimed_at < ?3))
      AND EXISTS (SELECT 1 FROM contact c WHERE c.user_id = home_feed.user_id AND ${homeContactReady})
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

async function finish(env: Env, job: HomeJob, error: string | null, waiting = false) {
  const now = Date.now();
  const next = await env.DB.prepare('SELECT MIN(expires_at) AS at FROM home_card WHERE user_id = ?').bind(job.userID).first<{ at: number | null }>();
  // Next automatic run when the first card goes stale, between one and twelve hours away.
  const due = waiting ? now + 60_000 : error ? now + retryDelay : Math.min(now + 12 * 3_600_000, Math.max(now + 3_600_000, next?.at ?? now + 6 * 3_600_000));
  // A request or a new topic that arrived during this run gets its own run right away.
  await env.DB.prepare(`UPDATE home_feed SET status = 'idle', generated_at = CASE WHEN ?2 IS NULL AND ?6 = 0 THEN ?3 ELSE generated_at END,
      due_at = CASE WHEN COALESCE(requested_at, 0) > claimed_at OR EXISTS (SELECT 1 FROM home_topic t WHERE t.user_id = home_feed.user_id
        AND t.status = 'active' AND t.source != 'curator' AND t.created_at > home_feed.claimed_at) THEN ?3 + 60000 ELSE ?1 END,
      progress_json = NULL, error_code = ?2, requested_at = CASE WHEN requested_at > claimed_at THEN requested_at END
    WHERE user_id = ?4 AND revision = ?5 AND status = 'running'`).bind(due, error, now, job.userID, job.revision, waiting ? 1 : 0).run();
}

// Saves the plan: topics the person or a contact asked for keep their source;
// curator topics left out of the plan are retired with their cards.
async function plan(env: Env, job: HomeJob): Promise<RunPlan | { error: string } | { waiting: true }> {
  if (!await current(env, job)) return { error: 'HOME_SUPERSEDED' };
  const signals = await readSignals(env.DB, job.userID);
  if (!signals) return { error: 'HOME_SUPERSEDED' };
  if (!signals.contacts.length) return { waiting: true };
  const model = await accountModel(env, job.userID);
  // What happened this week around their interests, so topics can react to it (docs/updates.md#news-scan).
  const news = await scanNews({ ...env, META_CHAT_MODEL: model }, signals, model, { userID: job.userID, id: `home-scan-${job.userID}-${job.revision}` });
  const planned = await planHome({ ...env, META_CHAT_MODEL: model }, signals, model, news);
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
    env.DB.prepare(`UPDATE home_feed SET briefing = ?1, suggestions_json = ?4 WHERE user_id = ?2 AND revision = ?3 AND status = 'running'`)
      .bind(planned.briefing || null, job.userID, job.revision, JSON.stringify(planned.suggestions)),
    env.DB.prepare(`DELETE FROM home_topic WHERE user_id = ? AND status = 'retired' AND updated_at < ?`).bind(job.userID, now - 7 * 86_400_000),
    env.DB.prepare(`DELETE FROM home_post WHERE user_id = ? AND created_at < ?`).bind(job.userID, now - postRetention),
  ]);
  // Compose new topics and stale cards, best first; a requested refresh also
  // renews cards older than half an hour.
  const requested = new Set(signals.topics.filter(topic => topic.source !== 'curator').map(topic => topic.id));
  const compose = topics.map((topic, position) => ({ topic, position, card: signals.cards.find(card => card.topicID === topic.id) }))
    .filter(({ card }) => !card || card.expiresAt <= now || (job.force && card.generatedAt < now - 30 * 60_000))
    // Topics someone asked for go first, so the per-run cap never delays them behind curator picks.
    .sort((a, b) => Number(requested.has(b.topic.id)) - Number(requested.has(a.topic.id)))
    .slice(0, homeLimits.composePerRun)
    .map(({ topic, position, card }) => ({ ...topic, position, previous: card?.payloadJSON ?? null,
      earlier: signals.posts.filter(post => post.topicID === topic.id).slice(0, earlierPosts).reverse()
        .map(post => ({ at: post.at, contact: post.contact, text: post.text })),
      // Other contacts' recent posts it may quote (docs/updates.md#quote-posts); never connector posts.
      quotable: signals.posts.filter(post => post.topicID !== topic.id && post.contactID !== topic.contactID && !post.connector
        && post.at > now - homeLimits.quotableFor).slice(0, homeLimits.quotable)
        .map(post => ({ id: post.id, contact: post.contact, title: post.title, text: post.text, at: post.at })) }));
  return {
    model, compose, titles: topics.map(topic => topic.title),
    context: { userID: job.userID, userName: signals.userName, timeZone: signals.timeZone, language: planned.language,
      memories: signals.memories, messages: signals.messages, contacts: signals.contacts, connectors: signals.connectors.map(connector => connector.name), news },
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
    run.titles.filter(title => title !== topic.title), model, budget, { earlier: topic.earlier, quotable: topic.quotable });
  const now = Date.now();
  const fence = `EXISTS (SELECT 1 FROM home_feed WHERE user_id = ?2 AND revision = ?3 AND status = 'running')`;
  if ('skip' in result) {
    // Nothing honest to show now: keep an earlier card for another hour, without a new revision,
    // and remember the skip for the editor. A curator topic skipped too many runs in a row is
    // retired with its card (docs/updates.md#skipped-topics).
    await env.DB.batch([
      env.DB.prepare(`UPDATE home_card SET expires_at = ?1 WHERE topic_id = ?2 AND user_id = ?3`).bind(now + 3_600_000, topic.id, job.userID),
      env.DB.prepare(`UPDATE home_topic SET skips = skips + 1, skip_reason = ?4,
          status = CASE WHEN source = 'curator' AND skips + 1 >= ?5 THEN 'retired' ELSE status END,
          updated_at = CASE WHEN source = 'curator' AND skips + 1 >= ?5 THEN ?6 ELSE updated_at END
        WHERE id = ?1 AND user_id = ?2 AND status = 'active' AND ${fence}`)
        .bind(topic.id, job.userID, job.revision, result.skip || null, homeLimits.skipsToRetire, now),
      env.DB.prepare(`DELETE FROM home_card WHERE topic_id = ?1 AND user_id = ?2
          AND EXISTS (SELECT 1 FROM home_topic WHERE id = ?1 AND user_id = ?2 AND status = 'retired')`).bind(topic.id, job.userID),
    ]);
    console.log(JSON.stringify({ event: 'home_card_skipped' }));
    return 'skipped';
  }
  if ('unchanged' in result) {
    // Nothing new since the earlier post: no post, and the card counts as fresh for its kind's lifetime,
    // so the next run is not due sooner (finish() schedules from the first expiry). Not a skip.
    const kind = (JSON.parse(topic.previous ?? '{}') as { kind?: CardKind }).kind;
    await env.DB.batch([
      env.DB.prepare(`UPDATE home_card SET expires_at = ?4 WHERE topic_id = ?1 AND user_id = ?2 AND ${fence}`)
        .bind(topic.id, job.userID, job.revision, now + (kind && cardLifetimes[kind] ? cardLifetimes[kind] : 6 * 3_600_000)),
      env.DB.prepare(`UPDATE home_topic SET skips = 0, skip_reason = NULL WHERE id = ?1 AND user_id = ?2 AND skips > 0 AND ${fence}`)
        .bind(topic.id, job.userID, job.revision),
    ]);
    console.log(JSON.stringify({ event: 'home_card_unchanged' }));
    return 'unchanged';
  }
  const { card } = result;
  await env.DB.prepare(`UPDATE home_topic SET skips = 0, skip_reason = NULL WHERE id = ?1 AND user_id = ?2 AND skips > 0 AND ${fence}`)
    .bind(topic.id, job.userID, job.revision).run();
  await env.DB.batch([env.DB.prepare(`INSERT INTO home_card (id, user_id, topic_id, contact_id, kind, position, payload_json, connector, generated_at, expires_at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10
      WHERE EXISTS (SELECT 1 FROM home_feed WHERE user_id = ?2 AND revision = ?11 AND status = 'running')
        AND EXISTS (SELECT 1 FROM home_topic WHERE id = ?3 AND user_id = ?2 AND status = 'active')
        AND EXISTS (SELECT 1 FROM contact WHERE id = ?4 AND user_id = ?2)
    ON CONFLICT(topic_id) DO UPDATE SET contact_id = excluded.contact_id, kind = excluded.kind, position = excluded.position,
      payload_json = excluded.payload_json, connector = excluded.connector, revision = home_card.revision + 1,
      generated_at = excluded.generated_at, expires_at = excluded.expires_at
    WHERE home_card.user_id = excluded.user_id`)
    .bind(crypto.randomUUID(), job.userID, topic.id, topic.contactID, card.kind, topic.position, JSON.stringify(card), result.connector ? 1 : 0,
      now, now + cardLifetimes[card.kind], job.revision),
  // The same card is appended to the timeline as a post with the contact's text.
  // A quote points at the person's own post, only while it still exists.
  env.DB.prepare(`INSERT INTO home_post (id, user_id, topic_id, contact_id, text, kind, payload_json, connector, quote_of, created_at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, (SELECT q.id FROM home_post q WHERE q.id = ?11 AND q.user_id = ?2 AND q.connector = 0), ?9
      WHERE EXISTS (SELECT 1 FROM home_feed WHERE user_id = ?2 AND revision = ?10 AND status = 'running')
        AND EXISTS (SELECT 1 FROM home_topic WHERE id = ?3 AND user_id = ?2 AND status = 'active')
        AND EXISTS (SELECT 1 FROM contact WHERE id = ?4 AND user_id = ?2)
    ON CONFLICT(id) DO UPDATE SET text = excluded.text, kind = excluded.kind, payload_json = excluded.payload_json, connector = excluded.connector,
      quote_of = excluded.quote_of
    WHERE home_post.user_id = excluded.user_id`)
    .bind(postID(topic.id, job.revision), job.userID, topic.id, topic.contactID, result.text, card.kind, JSON.stringify(card),
      result.connector ? 1 : 0, now, job.revision, result.quote)]);
  return 'published';
}

// A better-informed contact reviews one card; a revision moves the topic to that contact.
async function review(env: Env, job: HomeJob, run: RunPlan, candidate: ReviewCandidate, research: { remaining: number }): Promise<string> {
  if (!await current(env, job)) return 'HOME_SUPERSEDED';
  const row = await env.DB.prepare(`SELECT t.title, t.brief, t.reason, t.kind, card.payload_json AS payloadJSON, card.position
    FROM home_topic t JOIN home_card card ON card.topic_id = t.id AND card.user_id = t.user_id
    WHERE t.id = ? AND t.user_id = ? AND t.status = 'active' AND card.connector = 0 AND card.contact_id IS ?`)
    .bind(candidate.topicID, job.userID, candidate.authorID).first<{ title: string; brief: string; reason: string | null; kind: CardKind; payloadJSON: string; position: number }>();
  const reviewer = run.context.contacts.find(contact => contact.id === candidate.reviewerID);
  if (!row || !reviewer) return 'skipped';
  await env.DB.prepare(`UPDATE home_feed SET progress_json = ?1 WHERE user_id = ?2 AND revision = ?3 AND status = 'running'`)
    .bind(JSON.stringify({ total: 1, done: 0, title: row.title, contactID: reviewer.id }), job.userID, job.revision).run();
  const topic = { id: candidate.topicID, title: row.title, brief: row.brief, reason: row.reason ?? '', kind: row.kind,
    contactID: reviewer.id, research: false, connector: false };
  const budget = { get research() { return research.remaining; }, set research(value: number) { research.remaining = value; },
    researchID: (attempt: number) => `home-${job.userID}-${job.revision}-review-${candidate.topicID}-${attempt}`, topicID: candidate.topicID };
  const result = await composeCard({ ...env, META_CHAT_MODEL: run.model }, run.context, topic, row.payloadJSON,
    run.titles.filter(title => title !== row.title), run.model, budget, { review: { authorName: candidate.authorName, excerpts: candidate.excerpts } });
  // A reviewer's skip only means its evidence is not better; it does not count as a topic skip.
  if (!('card' in result)) return 'kept';
  const now = Date.now(), fence = `EXISTS (SELECT 1 FROM home_feed WHERE user_id = ?2 AND revision = ?3 AND status = 'running')`;
  const note = Array.from(`${reviewer.name} updated this with newer details from your chats`).slice(0, 160).join('');
  const id = postID(candidate.topicID, job.revision, true);
  await env.DB.batch([
    // The revision is a post that replies to the latest post on the topic.
    env.DB.prepare(`INSERT INTO home_post (id, user_id, topic_id, contact_id, text, kind, payload_json, connector, reply_to, created_at)
        SELECT ?4, ?2, ?1, ?5, ?6, ?7, ?8, 0,
          (SELECT p.id FROM home_post p WHERE p.topic_id = ?1 AND p.user_id = ?2 AND p.id != ?4 ORDER BY p.created_at DESC LIMIT 1), ?9
        WHERE ${fence} AND EXISTS (SELECT 1 FROM home_topic WHERE id = ?1 AND user_id = ?2 AND status = 'active')
      ON CONFLICT(id) DO UPDATE SET text = excluded.text, kind = excluded.kind, payload_json = excluded.payload_json
      WHERE home_post.user_id = excluded.user_id`)
      .bind(candidate.topicID, job.userID, job.revision, id, reviewer.id, result.text, result.card.kind, JSON.stringify(result.card), now),
    env.DB.prepare(`UPDATE home_card SET contact_id = ?4, kind = ?5, payload_json = ?6, revision = revision + 1, generated_at = ?7, expires_at = ?8
      WHERE topic_id = ?1 AND user_id = ?2 AND ${fence}`)
      .bind(candidate.topicID, job.userID, job.revision, reviewer.id, result.card.kind, JSON.stringify(result.card), now, now + cardLifetimes[result.card.kind]),
    env.DB.prepare(`UPDATE home_topic SET contact_id = ?4, reason = ?5, updated_at = ?6 WHERE id = ?1 AND user_id = ?2 AND status = 'active' AND ${fence}`)
      .bind(candidate.topicID, job.userID, job.revision, reviewer.id, note, now),
  ]);
  console.log(JSON.stringify({ event: 'home_card_reviewed', outcome: 'revised' }));
  return 'revised';
}

export async function runHome(env: Env, job: HomeJob, step: WorkflowStep) {
  let error: string | null = null;
  let waiting = false;
  try {
    const run = await step.do('home-plan', { retries: { limit: 1, delay: '15 seconds' }, timeout: '4 minutes' }, () => plan(env, job));
    if ('waiting' in run) waiting = true;
    else if ('error' in run) error = run.error;
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
      // Better-informed contacts review cards (docs/updates.md#contacts-review-cards).
      const reviews = await step.do('home-review-plan', async () => await current(env, job)
        ? reviewCandidates(env.DB, job.userID, run.context, Date.now()) : []);
      for (let index = 0; index < reviews.length; index++) {
        const outcome = await step.do(`home-review-${index}`, { retries: { limit: 1, delay: '15 seconds' }, timeout: '6 minutes' },
          () => review(env, job, run, reviews[index]!, research)).catch(cause => {
          console.error(JSON.stringify({ event: 'home_review_failed', code: safeErrorCode(cause) }));
          return 'failed';
        });
        if (outcome === 'HOME_SUPERSEDED') return;
      }
    }
  } catch (cause) {
    error = safeErrorCode(cause);
    console.error(JSON.stringify({ event: 'home_plan_failed', code: error }));
  }
  if (error === 'HOME_SUPERSEDED') return;
  // A plan checkpoint from an earlier release may still return the former error code.
  if (error === 'HOME_NO_CONTACTS') { error = null; waiting = true; }
  await step.do('home-finish', () => finish(env, job, error, waiting));
}
