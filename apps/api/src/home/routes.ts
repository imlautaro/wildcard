import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { isRecord } from '../chat/meta';
import { readBearerSession } from '../lib/session';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { parseSpec } from '../miniapps/spec';
import { homeLimits } from './curator';
import { dispatchHome, homeEnabled, postRetention } from './workflow';
import { homeSetup, topicColumns, type HomeTopicRow } from './signals';
import { commentLimits, type HomeCommentJob } from './comments';

// For you feed for the signed-in person (docs/updates.md; the API keeps the `home` name). Cards come from curation
// runs; quick access and agenda are computed on each read and cost no inference.
const home = new Hono<{ Bindings: Env; Variables: { owner: string } }>();
home.use('*', bodyLimit({ maxSize: 4096, onError: c => c.json({ error: 'Request body too large' }, 413) }));
home.use('*', async (c, next) => {
  const session = await readBearerSession(c.env, c.req.raw.headers);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  c.set('owner', session.user.id);
  const reads = c.req.method === 'GET';
  if (!(await admitAuthRequest(c.env.DB, session.user.id, reads ? 'home' : 'home-write', reads ? 90 : 20)).allowed) return c.json({ error: 'Too many requests' }, 429);
  await next();
});

function zone(value: string | undefined): string | null {
  if (!value || value.length > 64) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return value; } catch { return null; }
}

type FeedRow = { status: string; generatedAt: number | null; briefing: string | null; progressJSON: string | null; errorCode: string | null; dueAt: number; requestedAt: number | null };
type CardRow = { id: string; topicID: string; contactID: string | null; contactName: string | null; photoVersion: string | null; payloadJSON: string;
  connector: number; generatedAt: number; reason: string | null; source: string; feedback: string | null };
type PostRow = { id: string; topicID: string; contactID: string | null; contactName: string | null; photoVersion: string | null; text: string | null;
  payloadJSON: string; connector: number; createdAt: number; replyTo: string | null; replyToName: string | null;
  reason: string | null; source: string; feedback: string | null };
// The newest posts the timeline shows (docs/updates.md#posts).
const timelinePosts = 50;

export async function homeFeed(env: Env, owner: string) {
  const now = Date.now();
  const [state, cards, posts, topics, apps, schedules, tasks, setup] = await Promise.all([
    env.DB.prepare(`SELECT status, generated_at AS generatedAt, briefing, progress_json AS progressJSON, error_code AS errorCode,
      due_at AS dueAt, requested_at AS requestedAt FROM home_feed WHERE user_id = ?`).bind(owner).first<FeedRow>(),
    env.DB.prepare(`SELECT card.id, card.topic_id AS topicID, card.contact_id AS contactID, COALESCE(c.alias, c.name) AS contactName, c.photo_version AS photoVersion,
        card.payload_json AS payloadJSON, card.connector, card.generated_at AS generatedAt, t.reason, t.source, t.feedback
      FROM home_card card JOIN home_topic t ON t.id = card.topic_id AND t.status = 'active'
      LEFT JOIN contact c ON c.id = card.contact_id AND c.user_id = card.user_id
      WHERE card.user_id = ? ORDER BY card.position, card.generated_at DESC LIMIT 16`).bind(owner).all<CardRow>(),
    env.DB.prepare(`SELECT p.id, p.topic_id AS topicID, p.contact_id AS contactID, COALESCE(c.alias, c.name) AS contactName, c.photo_version AS photoVersion,
        p.text, p.payload_json AS payloadJSON, p.connector, p.created_at AS createdAt, p.reply_to AS replyTo, COALESCE(rc.alias, rc.name) AS replyToName,
        t.reason, t.source, t.feedback
      FROM home_post p JOIN home_topic t ON t.id = p.topic_id AND t.status = 'active'
      LEFT JOIN contact c ON c.id = p.contact_id AND c.user_id = p.user_id
      LEFT JOIN home_post r ON r.id = p.reply_to
      LEFT JOIN contact rc ON rc.id = r.contact_id AND rc.user_id = p.user_id
      WHERE p.user_id = ? AND p.created_at > ? ORDER BY p.created_at DESC LIMIT ?`).bind(owner, now - postRetention, timelinePosts).all<PostRow>(),
    env.DB.prepare(`SELECT ${topicColumns} FROM home_topic WHERE user_id = ? AND status != 'retired' ORDER BY updated_at DESC LIMIT 40`)
      .bind(owner).all<HomeTopicRow>(),
    // Enabled mini apps the person opens, plus ones created in the last three days.
    env.DB.prepare(`SELECT a.id, a.spec_json AS specJSON, a.contact_id AS contactID, a.group_id AS groupID,
        COALESCE(c.alias, c.name, g.name) AS ownerName, COALESCE(u.opens, 0) AS opens
      FROM mini_app a LEFT JOIN mini_app_usage u ON u.app_id = a.id AND u.user_id = ?1
      LEFT JOIN contact c ON c.id = a.contact_id AND c.user_id = ?1 LEFT JOIN chat_group g ON g.id = a.group_id
      WHERE a.approved_revision = a.revision AND (u.opens > 0 OR a.created_at > ?2)
        AND (a.user_id = ?1 OR EXISTS (SELECT 1 FROM group_member m WHERE m.group_id = a.group_id AND m.user_id = ?1))
      ORDER BY COALESCE(u.opens, 0) DESC, COALESCE(u.last_opened_at, a.created_at) DESC LIMIT 8`).bind(owner, now - 3 * 86_400_000)
      .all<{ id: string; specJSON: string; contactID: string | null; groupID: string | null; ownerName: string | null; opens: number }>(),
    env.DB.prepare(`SELECT s.id, s.instruction AS title, s.next_at AS at, s.contact_id AS contactID, COALESCE(c.alias, c.name) AS name FROM contact_schedule s
      JOIN contact c ON c.id = s.contact_id AND c.user_id = s.user_id
      WHERE s.user_id = ?1 AND s.status = 'active' AND s.next_at < ?2 ORDER BY s.next_at LIMIT 4`).bind(owner, now + 2 * 86_400_000)
      .all<{ id: string; title: string; at: number; contactID: string; name: string }>(),
    env.DB.prepare(`SELECT t.id, t.title, l.contact_id AS contactID, l.group_id AS groupID, COALESCE(c.alias, c.name, g.name) AS name FROM task t
      JOIN task_list l ON l.id = t.list_id AND l.status = 'active'
      LEFT JOIN contact c ON c.id = l.contact_id AND c.user_id = ?1 LEFT JOIN chat_group g ON g.id = l.group_id
      WHERE t.assignee_kind = 'user' AND t.assignee_id = ?1 AND t.status IN ('open', 'in_progress')
        AND (l.user_id = ?1 OR EXISTS (SELECT 1 FROM group_member m WHERE m.group_id = l.group_id AND m.user_id = ?1))
      ORDER BY t.updated_at DESC LIMIT 4`).bind(owner)
      .all<{ id: string; title: string; contactID: string | null; groupID: string | null; name: string | null }>(),
    homeSetup(env.DB, owner),
  ]);
  const { results: comments } = posts.results.length ? await env.DB.prepare(`SELECT id, post_id AS postID, text, reply_text AS reply, status,
      created_at AS createdAt, replied_at AS repliedAt,
      EXISTS (SELECT 1 FROM chat_turn dm WHERE dm.home_comment_id = home_comment.id AND dm.user_id = home_comment.user_id) AS privateMessage FROM home_comment
    WHERE user_id = ? AND post_id IN (SELECT value FROM json_each(?)) ORDER BY created_at`)
    .bind(owner, JSON.stringify(posts.results.map(post => post.id)))
    .all<{ id: string; postID: string; text: string; reply: string | null; status: string; createdAt: number; repliedAt: number | null; privateMessage: number }>() : { results: [] };
  const progress = state?.progressJSON ? JSON.parse(state.progressJSON) as { total: number; done: number; title: string; contactID: string } : null;
  const contributors = new Map<string, { id: string; name: string; photoVersion: string | null }>();
  for (const card of [...cards.results, ...posts.results]) if (card.contactID && card.contactName) contributors.set(card.contactID, { id: card.contactID, name: card.contactName, photoVersion: card.photoVersion });
  return {
    enabled: homeEnabled(env),
    setup,
    status: !setup && state?.status === 'running' ? 'updating' : 'idle',
    // A requested or first run that the minute Cron has not started yet is shown as updating.
    pending: !setup && state?.status !== 'running' && !!state && state.dueAt <= now && (state.requestedAt !== null || state.generatedAt === null) && homeEnabled(env),
    generatedAt: state?.generatedAt ?? null, briefing: state?.briefing ?? null,
    error: setup || state?.errorCode === 'HOME_NO_CONTACTS' ? null : state?.errorCode ?? null,
    progress: progress ? { ...progress, contactName: [...contributors.values()].find(item => item.id === progress.contactID)?.name
      ?? (await env.DB.prepare('SELECT COALESCE(alias, name) AS name FROM contact WHERE id = ? AND user_id = ?').bind(progress.contactID, owner).first<{ name: string }>())?.name ?? null } : null,
    contributors: [...contributors.values()],
    cards: cards.results.map(card => ({ id: card.id, topicID: card.topicID, contactID: card.contactID, contactName: card.contactName,
      contactPhotoVersion: card.photoVersion, reason: card.reason, source: card.source, feedback: card.feedback, connector: card.connector === 1,
      generatedAt: card.generatedAt, content: JSON.parse(card.payloadJSON) })),
    // The timeline, newest first: each post is a contact's text with a card attached (null text: the card alone).
    posts: posts.results.map(post => ({ id: post.id, topicID: post.topicID, contactID: post.contactID, contactName: post.contactName,
      contactPhotoVersion: post.photoVersion, text: post.text, replyTo: post.replyTo ? { id: post.replyTo, contactName: post.replyToName } : null,
      reason: post.reason, source: post.source, feedback: post.feedback, connector: post.connector === 1, createdAt: post.createdAt,
      content: JSON.parse(post.payloadJSON),
      // The person's comments and the contact's replies, oldest first (docs/updates.md#comments).
      comments: comments.filter(comment => comment.postID === post.id).map(comment => ({ id: comment.id, text: comment.text, reply: comment.reply,
        status: comment.status === 'pending' && comment.createdAt < now - commentLimits.pendingFor ? 'failed' : comment.status,
        createdAt: comment.createdAt, repliedAt: comment.repliedAt,
        // The contact also wrote to the person in its private chat after this comment.
        privateMessage: comment.privateMessage === 1 })) })),
    topics: topics.results.map(topic => ({ id: topic.id, title: topic.title, source: topic.source, status: topic.status, feedback: topic.feedback,
      contactID: topic.contactID, hasCard: cards.results.some(card => card.topicID === topic.id) })),
    apps: apps.results.flatMap(app => {
      try {
        const { spec } = parseSpec(JSON.parse(app.specJSON));
        return [{ id: app.id, title: spec.title, subtitle: spec.subtitle ?? null, icon: spec.icon, contactID: app.contactID, groupID: app.groupID,
          ownerName: app.ownerName, opens: app.opens }];
      } catch { return []; }
    }),
    agenda: [
      ...schedules.results.map(row => ({ id: row.id, kind: 'schedule', title: row.title, at: row.at, contactID: row.contactID, groupID: null, name: row.name })),
      ...tasks.results.map(row => ({ id: row.id, kind: 'task', title: row.title, at: null, contactID: row.contactID, groupID: row.groupID, name: row.name })),
    ],
  };
}

// Marks the feed due now and starts the run without waiting for the minute Cron.
async function request(env: Env, ctx: { waitUntil(promise: Promise<unknown>): void }, owner: string, manual: boolean) {
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO home_feed (user_id, due_at, viewed_at, requested_at) VALUES (?1, ?2, ?2, ?3)
    ON CONFLICT(user_id) DO UPDATE SET due_at = MIN(home_feed.due_at, ?2), viewed_at = ?2,
      requested_at = COALESCE(?3, home_feed.requested_at)`).bind(owner, now, manual ? now : null).run();
  if (homeEnabled(env)) ctx.waitUntil(dispatchHome(env, owner).catch(() => console.error(JSON.stringify({ event: 'home_dispatch_deferred' }))));
}

home.get('/', async c => {
  const owner = c.get('owner'), now = Date.now();
  const timeZone = zone(c.req.query('timeZone'));
  // The first view schedules the first run; later views keep automatic runs going.
  await c.env.DB.prepare(`INSERT INTO home_feed (user_id, due_at, viewed_at, time_zone) VALUES (?1, ?2, ?2, ?3)
    ON CONFLICT(user_id) DO UPDATE SET viewed_at = ?2, time_zone = COALESCE(?3, home_feed.time_zone)
    WHERE home_feed.viewed_at < ?2 - 600000 OR (?3 IS NOT NULL AND home_feed.time_zone IS NOT ?3)`).bind(owner, now, timeZone).run();
  await markSeen(c.env, owner, now);
  const due = await c.env.DB.prepare(`SELECT 1 FROM home_feed WHERE user_id = ? AND status = 'idle' AND (due_at <= ? OR error_code = 'HOME_NO_CONTACTS')`).bind(owner, now).first();
  if (due && homeEnabled(c.env)) c.executionCtx.waitUntil(dispatchHome(c.env, owner).catch(() => console.error(JSON.stringify({ event: 'home_dispatch_deferred' }))));
  return c.json(await homeFeed(c.env, owner));
});

// Opening For you (any read of the feed, or this explicit call) clears the badge.
async function markSeen(env: Env, owner: string, now: number) {
  await env.DB.prepare('UPDATE home_feed SET seen_at = ?2 WHERE user_id = ?1').bind(owner, now).run();
}

// Number of posts published since the person last opened For you; clients poll it
// for the For you tab/button badge. It never starts a curation run.
home.get('/badge', async c => {
  const row = await c.env.DB.prepare(`SELECT COUNT(*) AS unseen FROM home_post p
    JOIN home_feed f ON f.user_id = p.user_id
    JOIN home_topic t ON t.id = p.topic_id AND t.status = 'active'
    WHERE p.user_id = ? AND p.created_at > COALESCE(f.seen_at, f.viewed_at)`).bind(c.get('owner')).first<{ unseen: number }>();
  return c.json({ unseen: homeEnabled(c.env) ? Math.min(row?.unseen ?? 0, 99) : 0 });
});

home.post('/seen', async c => {
  await markSeen(c.env, c.get('owner'), Date.now());
  return c.json({ unseen: 0 });
});

home.post('/refresh', async c => {
  const owner = c.get('owner');
  if (!homeEnabled(c.env)) return c.json({ error: 'For you is turned off.' }, 409);
  const recent = await c.env.DB.prepare('SELECT 1 FROM home_feed WHERE user_id = ? AND requested_at > ?').bind(owner, Date.now() - 60_000).first();
  if (!recent) await request(c.env, c.executionCtx, owner, true);
  return c.json(await homeFeed(c.env, owner));
});

home.post('/topics', async c => {
  const owner = c.get('owner');
  const body: unknown = await c.req.json().catch(() => null);
  if (!isRecord(body) || Object.keys(body).join(',') !== 'text' || typeof body.text !== 'string') return c.json({ error: 'Provide text.' }, 400);
  const text = body.text.replace(/\s+/g, ' ').trim();
  if (!text || Array.from(text).length > 400 || /[\u0000-\u001f\u007f]/u.test(text)) return c.json({ error: 'Describe it in 1–400 characters.' }, 422);
  const count = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM home_topic WHERE user_id = ? AND source = 'person' AND status = 'active'`)
    .bind(owner).first<{ count: number }>();
  if ((count?.count ?? 0) >= homeLimits.personTopics) return c.json({ error: `For you follows up to ${homeLimits.personTopics} of your requests. Hide one first.` }, 409);
  const now = Date.now();
  // The curator refines the title, layout and contact on the next run.
  await c.env.DB.prepare(`INSERT INTO home_topic (id, user_id, title, brief, kind, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'list', 'person', ?, ?)`).bind(crypto.randomUUID(), owner, Array.from(text).slice(0, 80).join(''), text, now, now).run();
  await request(c.env, c.executionCtx, owner, true);
  return c.json(await homeFeed(c.env, owner), 201);
});

// Comment on a post; the contact who wrote it answers in the background (docs/updates.md#comments).
home.post('/posts/:id/comments', async c => {
  const owner = c.get('owner');
  const body: unknown = await c.req.json().catch(() => null);
  if (!isRecord(body) || Object.keys(body).join(',') !== 'text' || typeof body.text !== 'string') return c.json({ error: 'Provide text.' }, 400);
  const text = body.text.trim();
  if (!text || Array.from(text).length > commentLimits.text || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) {
    return c.json({ error: `Write 1–${commentLimits.text} characters.` }, 422);
  }
  const now = Date.now();
  const post = await c.env.DB.prepare(`SELECT p.id, p.contact_id AS contactID,
      (SELECT COUNT(*) FROM home_comment WHERE post_id = p.id) AS count,
      EXISTS (SELECT 1 FROM home_comment WHERE post_id = p.id AND status = 'pending' AND created_at > ?3) AS pending
    FROM home_post p JOIN home_topic t ON t.id = p.topic_id AND t.status = 'active'
    JOIN contact ct ON ct.id = p.contact_id AND ct.user_id = p.user_id AND ct.archived_at IS NULL
    WHERE p.id = ?1 AND p.user_id = ?2`).bind(c.req.param('id'), owner, now - commentLimits.pendingFor)
    .first<{ id: string; contactID: string; count: number; pending: number }>();
  if (!post) return c.json({ error: 'This post is no longer available to comment on.' }, 404);
  if (post.pending) return c.json({ error: 'Wait for the reply before commenting again.' }, 409);
  if (post.count >= commentLimits.perPost) return c.json({ error: 'This post has reached its comment limit. Continue in the chat.' }, 409);
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO home_comment (id, user_id, post_id, contact_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(id, owner, post.id, post.contactID, text, now).run();
  const job: HomeCommentJob = { kind: 'home-comment', userID: owner, commentID: id };
  try { await c.env.CHAT_WORKFLOW.create({ id: `home-comment-${id}`, params: job }); }
  catch {
    const exists = await c.env.CHAT_WORKFLOW.get(`home-comment-${id}`).then(instance => instance.status()).then(() => true, () => false);
    if (!exists) await c.env.DB.prepare(`UPDATE home_comment SET status = 'failed', error_code = 'WORKFLOW_UNAVAILABLE' WHERE id = ? AND status = 'pending'`).bind(id).run();
  }
  return c.json(await homeFeed(c.env, owner), 201);
});

home.patch('/topics/:id', async c => {
  const owner = c.get('owner');
  const body: unknown = await c.req.json().catch(() => null);
  if (!isRecord(body) || !Object.keys(body).length || Object.keys(body).some(key => !['status', 'feedback'].includes(key))
    || (body.status !== undefined && !['active', 'hidden'].includes(String(body.status)))
    || (body.feedback !== undefined && body.feedback !== null && !['more', 'less'].includes(String(body.feedback)))) {
    return c.json({ error: 'Provide status (active or hidden) and/or feedback (more, less or null).' }, 400);
  }
  const topic = await c.env.DB.prepare(`SELECT status FROM home_topic WHERE id = ? AND user_id = ? AND status != 'retired'`)
    .bind(c.req.param('id'), owner).first<{ status: string }>();
  if (!topic) return c.json({ error: 'Topic not found' }, 404);
  const now = Date.now();
  const status = typeof body.status === 'string' ? body.status : topic.status;
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE home_topic SET status = ?1, feedback = CASE WHEN ?2 = 1 THEN ?3 ELSE feedback END, updated_at = ?4
      WHERE id = ?5 AND user_id = ?6`).bind(status, 'feedback' in body ? 1 : 0, body.feedback ?? null, now, c.req.param('id'), owner),
    // Hiding removes the card and its posts at once; the curator never brings the topic back.
    c.env.DB.prepare(`DELETE FROM home_card WHERE topic_id = ? AND user_id = ? AND ? = 'hidden'`).bind(c.req.param('id'), owner, status),
    c.env.DB.prepare(`DELETE FROM home_post WHERE topic_id = ? AND user_id = ? AND ? = 'hidden'`).bind(c.req.param('id'), owner, status),
  ]);
  if (topic.status === 'hidden' && status === 'active') await request(c.env, c.executionCtx, owner, true);
  return c.json(await homeFeed(c.env, owner));
});

export default home;
