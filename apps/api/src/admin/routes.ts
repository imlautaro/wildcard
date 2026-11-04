import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { readBearerSession } from '../lib/session';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { cleanResources } from '../chat/cleanup';
import { isSettingKey, listSettings, readSetting } from './settings';
import { isRecord } from '../chat/meta';
import { prepareMiniApp } from '../miniapps/tools';

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
      (SELECT COUNT(*) FROM chat_group) AS groupCount,
      (SELECT COUNT(*) FROM waitlist_entry) AS waitlist`).bind(weekAgo),
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

// Early-access waitlist (docs/admin.md#waitlist), newest first. Same cursor and
// search shape as /users. Entries are not accounts; deleting one only removes the row.
type WaitlistRow = { id: string; email: string; name: string; platform: string; note: string | null; locale: string; createdAt: number; updatedAt: number };
admin.get('/waitlist', async (c) => {
  const query = (c.req.query('q') ?? '').trim().slice(0, 100);
  const cursor = /^(\d{1,16}):([\w-]{1,64})$/.exec(c.req.query('before') ?? '');
  if (c.req.query('before') && !cursor) return c.json({ error: 'Invalid cursor' }, 400);
  const pattern = `%${query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
  const [entries, total] = await c.env.DB.batch<Record<string, unknown>>([
    c.env.DB.prepare(`SELECT id, email, name, platform, note, locale, created_at AS createdAt, updated_at AS updatedAt
      FROM waitlist_entry
      WHERE (?1 = '' OR email LIKE ?2 ESCAPE '\\' OR name LIKE ?2 ESCAPE '\\')
        AND (?3 IS NULL OR created_at < ?3 OR (created_at = ?3 AND id < ?4))
      ORDER BY created_at DESC, id DESC LIMIT ?5`)
      .bind(query, pattern, cursor ? Number(cursor[1]) : null, cursor?.[2] ?? '', pageSize + 1),
    c.env.DB.prepare('SELECT COUNT(*) AS total FROM waitlist_entry'),
  ]);
  const results = (entries?.results ?? []) as WaitlistRow[];
  const page = results.slice(0, pageSize);
  const last = page.at(-1);
  return c.json({
    entries: page,
    total: Number(total?.results[0]?.total ?? 0),
    next: results.length > pageSize && last ? `${last.createdAt}:${last.id}` : null,
  });
});

admin.delete('/waitlist/:id', async (c) => {
  const id = c.req.param('id');
  const entry = await c.env.DB.prepare('SELECT id FROM waitlist_entry WHERE id = ?').bind(id).first<{ id: string }>();
  if (!entry) return c.json({ error: 'This entry is no longer on the waitlist.' }, 404);
  // The event keeps the entry ID only, so a removed person's email does not outlive the row.
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO admin_event (id, actor_id, action, target, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), c.get('admin'), 'waitlist.delete', entry.id, null, Date.now()),
    c.env.DB.prepare('DELETE FROM waitlist_entry WHERE id = ?').bind(id),
  ]);
  return c.json({ deleted: true });
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

// Mini app lab: imports generated specs into one of the calling admin's OWN chats so
// they can be tried on a device through the normal Contact → Mini apps list. Never
// another account's contacts. State-only apps; same parsing and offline verification
// as create_mini_app; the per-chat cap of 20 still applies. Rows use `lab:<uuid>` ids
// and no turn, so no chat bubble shows a card.
const labCap = 20;
const labTimeZone = (value: unknown) => {
  if (value === undefined) return 'UTC';
  if (typeof value !== 'string' || value.length > 64) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return value; } catch { return null; }
};

admin.get('/lab/contacts', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT c.id, COALESCE(c.alias, c.name) AS name,
      (SELECT COUNT(*) FROM mini_app a WHERE a.contact_id = c.id AND a.user_id = c.user_id) AS miniApps,
      (SELECT COUNT(*) FROM mini_app a WHERE a.contact_id = c.id AND a.user_id = c.user_id AND a.id LIKE 'lab:%') AS labApps
    FROM contact c WHERE c.user_id = ? ORDER BY COALESCE(c.alias, c.name) COLLATE NOCASE, c.id LIMIT 200`)
    .bind(c.get('admin')).all<{ id: string; name: string; miniApps: number; labApps: number }>();
  return c.json({ contacts: results });
});

admin.post('/lab/contacts/:id/mini-apps', bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json({ error: 'Bundle too large (1 MB max).' }, 413) }), async (c) => {
  const actor = c.get('admin');
  const admission = await admitAuthRequest(c.env.DB, actor, 'admin-mini-app-lab', 10);
  if (!admission.allowed) {
    c.header('Retry-After', String(admission.retryAfter));
    return c.json({ error: 'Too many imports. Please wait a minute.' }, 429);
  }
  const contactID = c.req.param('id');
  const contact = await c.env.DB.prepare('SELECT id, clearing FROM contact WHERE id = ? AND user_id = ?')
    .bind(contactID, actor).first<{ id: string; clearing: number }>();
  if (!contact) return c.json({ error: 'Contact not found in your account.' }, 404);
  if (contact.clearing) return c.json({ error: 'This chat is being cleared. Try again shortly.' }, 409);
  const body = await c.req.json<unknown>().catch(() => null);
  if (!isRecord(body) || Object.keys(body).some((key) => !['apps', 'replace', 'timeZone'].includes(key))
    || !Array.isArray(body.apps) || !body.apps.length || body.apps.length > labCap
    || (body.replace !== undefined && typeof body.replace !== 'boolean')) {
    return c.json({ error: `Provide apps (1–${labCap} entries of {title, spec}), and optionally replace and timeZone.` }, 422);
  }
  const timeZone = labTimeZone(body.timeZone);
  if (!timeZone) return c.json({ error: 'Invalid timeZone.' }, 422);

  type Result = { title: string; ok: boolean; id?: string; problems?: string[] };
  const results: Result[] = [];
  const accepted: { index: number; id: string; title: string; specJSON: string }[] = [];
  body.apps.forEach((entry, index) => {
    const title = isRecord(entry) && typeof entry.title === 'string' ? entry.title.trim() : '';
    if (!isRecord(entry) || !title || [...title].length > 60 || !isRecord(entry.spec)) {
      results.push({ title: title || `App ${index + 1}`, ok: false, problems: ['Each app needs a title (1–60 characters) and a spec object.'] });
      return;
    }
    const prepared = prepareMiniApp({ ...entry.spec, title }, timeZone, new Map());
    if ('response' in prepared) {
      const response = prepared.response as { error?: unknown; problems?: unknown };
      const problems = [String(response.error ?? 'Invalid spec.'), ...(Array.isArray(response.problems) ? response.problems.map(String) : [])];
      results.push({ title, ok: false, problems });
      return;
    }
    if (prepared.parsed.tools.length) {
      results.push({ title, ok: false, problems: ['Lab apps are state-only: remove mcp steps and remote actions.'] });
      return;
    }
    const id = `lab:${crypto.randomUUID()}`;
    accepted.push({ index: results.length, id, title, specJSON: JSON.stringify(prepared.parsed.spec) });
    results.push({ title, ok: true, id });
  });

  // One transaction: optional replacement, then inserts that each re-check the cap,
  // so concurrent chat creations cannot push the chat past 20. Lists sort by
  // updated_at descending, so the first bundle entry gets the newest timestamp.
  const now = Date.now();
  const statements = [
    ...(body.replace ? [c.env.DB.prepare("DELETE FROM mini_app WHERE contact_id = ? AND user_id = ? AND id LIKE 'lab:%'").bind(contactID, actor)] : []),
    ...accepted.map((app, order) => c.env.DB.prepare(`INSERT INTO mini_app (id, contact_id, user_id, turn_id, revision, title, spec_json, tools_json, approved_revision, created_at, updated_at)
      SELECT ?1, ?2, ?3, NULL, 1, ?4, ?5, '[]', 1, ?6, ?6
      WHERE (SELECT COUNT(*) FROM mini_app WHERE contact_id = ?2 AND user_id = ?3) < ${labCap} RETURNING id`)
      .bind(app.id, contactID, actor, app.title, app.specJSON, now + accepted.length - order)),
  ];
  let outcomes: D1Result[] = [];
  if (statements.length) {
    try { outcomes = await c.env.DB.batch(statements); }
    catch { return c.json({ error: 'Could not import. The chat may be being cleared; try again.' }, 409); }
  }
  const offset = body.replace ? 1 : 0;
  accepted.forEach((app, order) => {
    if (outcomes[offset + order]?.results.length) return;
    results[app.index] = { title: app.title, ok: false, problems: [`This chat already has ${labCap} mini apps. Delete some or use "Replace previous lab apps".`] };
  });
  const imported = results.filter((result) => result.ok).length;
  await c.env.DB.prepare('INSERT INTO admin_event (id, actor_id, action, target, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), actor, 'mini_app.lab_import', contactID, JSON.stringify({ imported, rejected: results.length - imported, replaced: !!body.replace }), now).run();
  return c.json({ results });
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
