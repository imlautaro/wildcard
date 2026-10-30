import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { readBearerSession } from '../lib/session';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { cleanResources } from '../chat/cleanup';
import { isSettingKey, listSettings, readSetting } from './settings';

type UserRow = {
  id: string; name: string; email: string; createdAt: number; onboardingRequired: number;
  contacts: number; ownedAgents: number; groupCount: number; lastActiveAt: number | null;
};

const pageSize = 50;
const admin = new Hono<{ Bindings: Env; Variables: { admin: string } }>();

// Super admins are listed by user ID in the SUPER_ADMIN_USER_IDS var, so the
// roster is versioned and reviewed with the code. Emails are unverified and
// never grant access.
export function superAdmins(env: Env): Set<string> {
  return new Set(env.SUPER_ADMIN_USER_IDS.split(',').map((id) => id.trim()).filter(Boolean));
}

admin.use('*', async (c, next) => {
  const session = await readBearerSession(c.env, c.req.raw.headers);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  if (!superAdmins(c.env).has(session.user.id)) {
    // The ID lets a new installation add its first admin to the roster.
    return c.json({ error: 'This account is not a super admin.', code: 'NOT_SUPER_ADMIN', userID: session.user.id }, 403);
  }
  c.set('admin', session.user.id);
  await next();
});

admin.get('/session', async (c) => {
  const user = await c.env.DB.prepare('SELECT id, name, email FROM user WHERE id = ?')
    .bind(c.get('admin')).first<{ id: string; name: string; email: string }>();
  return user ? c.json({ user }) : c.json({ error: 'Unauthorized' }, 401);
});

admin.get('/overview', async (c) => {
  const weekAgo = Date.now() - 7 * 86400000;
  const [totals, events] = await c.env.DB.batch<Record<string, unknown>>([
    c.env.DB.prepare(`SELECT (SELECT COUNT(*) FROM user) AS users,
      (SELECT COUNT(*) FROM user WHERE created_at >= ?) AS newUsers,
      (SELECT COUNT(*) FROM contact) AS contacts,
      (SELECT COUNT(*) FROM chat_group) AS groupCount`).bind(weekAgo),
    c.env.DB.prepare(`SELECT e.id, e.action, e.target, e.details_json AS detailsJSON, e.created_at AS createdAt,
      e.actor_id AS actorID, u.name AS actorName FROM admin_event e LEFT JOIN user u ON u.id = e.actor_id
      ORDER BY e.created_at DESC LIMIT 20`),
  ]);
  return c.json({
    totals: totals?.results[0],
    registrationEnabled: await readSetting(c.env.DB, 'registration_enabled'),
    events: (events?.results ?? []).map(({ detailsJSON, ...event }) => ({
      ...event, details: typeof detailsJSON === 'string' ? JSON.parse(detailsJSON) : null,
    })),
  });
});

// Newest first. The cursor is the last row's `createdAt:id`; `q` matches name or email.
admin.get('/users', async (c) => {
  const query = (c.req.query('q') ?? '').trim().slice(0, 100);
  const cursor = /^(\d{1,16}):([\w-]{1,64})$/.exec(c.req.query('before') ?? '');
  if (c.req.query('before') && !cursor) return c.json({ error: 'Invalid cursor' }, 400);
  const pattern = `%${query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
  const { results } = await c.env.DB.prepare(`SELECT u.id, u.name, u.email, u.created_at AS createdAt,
      u.onboarding_required AS onboardingRequired,
      (SELECT COUNT(*) FROM contact WHERE user_id = u.id) AS contacts,
      (SELECT COUNT(*) FROM contact_agent WHERE owner_id = u.id) AS ownedAgents,
      (SELECT COUNT(*) FROM group_member WHERE user_id = u.id) AS groupCount,
      (SELECT MAX(updated_at) FROM session WHERE user_id = u.id) AS lastActiveAt
    FROM user u
    WHERE (?1 = '' OR u.email LIKE ?2 ESCAPE '\\' OR u.name LIKE ?2 ESCAPE '\\')
      AND (?3 IS NULL OR u.created_at < ?3 OR (u.created_at = ?3 AND u.id < ?4))
    ORDER BY u.created_at DESC, u.id DESC LIMIT ?5`)
    .bind(query, pattern, cursor ? Number(cursor[1]) : null, cursor?.[2] ?? '', pageSize + 1).all<UserRow>();
  const page = results.slice(0, pageSize);
  const last = page.at(-1);
  const roster = superAdmins(c.env);
  return c.json({
    users: page.map((row) => ({ ...row, onboardingRequired: Boolean(row.onboardingRequired), superAdmin: roster.has(row.id) })),
    next: results.length > pageSize && last ? `${last.createdAt}:${last.id}` : null,
  });
});

// D1 deletion and external cleanup registration commit together. The outbox
// survives account deletion and retries R2/Workflow failures through Cron.
admin.delete('/users/:id', bodyLimit({ maxSize: 1024 }), async (c) => {
  const actor = c.get('admin');
  const admission = await admitAuthRequest(c.env.DB, actor, 'admin-user-delete', 10);
  if (!admission.allowed) {
    c.header('Retry-After', String(admission.retryAfter));
    return c.json({ error: 'Too many deletions. Please wait a minute.' }, 429);
  }
  const id = c.req.param('id');
  const input = await c.req.json<{ email?: unknown }>().catch(() => null);
  const target = await c.env.DB.prepare('SELECT id, email FROM user WHERE id = ?').bind(id).first<{ id: string; email: string }>();
  if (!target) return c.json({ error: 'This account no longer exists.' }, 404);
  if (typeof input?.email !== 'string' || input.email.trim().toLowerCase() !== target.email.toLowerCase()) {
    return c.json({ error: "Type the account's email to confirm." }, 422);
  }
  if (superAdmins(c.env).has(id)) {
    return c.json({ error: 'Remove this account from SUPER_ADMIN_USER_IDS before deleting it.' }, 409);
  }

  const counts = await c.env.DB.prepare(`SELECT (SELECT COUNT(*) FROM contact WHERE user_id = ?1) AS contacts,
      (SELECT COUNT(*) FROM contact_agent WHERE owner_id = ?1) AS ownedAgents,
      (SELECT COUNT(*) FROM chat_group WHERE owner_id = ?1) AS ownedGroups`).bind(id).first();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO admin_event (id, actor_id, action, target, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), actor, 'user.delete', id, JSON.stringify(counts ?? {}), Date.now()),
    c.env.DB.prepare('DELETE FROM user WHERE id = ?').bind(id),
  ]);

  c.executionCtx.waitUntil(cleanResources(c.env));
  // A committed account deletion is distinct from asynchronous external erasure.
  return c.json({ deleted: true, cleanup: 'pending' }, 202);
});

admin.get('/settings', async (c) => c.json({ settings: await listSettings(c.env.DB) }));

admin.put('/settings/:key', bodyLimit({ maxSize: 1024 }), async (c) => {
  const key = c.req.param('key');
  if (!isSettingKey(key)) return c.json({ error: 'Unknown setting' }, 404);
  const input = await c.req.json<{ value?: unknown }>().catch(() => null);
  if (typeof input?.value !== 'boolean' || Object.keys(input).length !== 1) return c.json({ error: 'Provide a boolean value' }, 422);
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO app_setting (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
      .bind(key, String(input.value), now, c.get('admin')),
    c.env.DB.prepare('INSERT INTO admin_event (id, actor_id, action, target, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), c.get('admin'), 'setting.update', key, JSON.stringify({ value: input.value }), now),
  ]);
  return c.json({ settings: await listSettings(c.env.DB) });
});

export default admin;
