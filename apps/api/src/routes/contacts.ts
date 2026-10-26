import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { readBearerSession } from '../lib/session';

type Contact = { id: string; name: string; createdAt: number; updatedAt: number };
const columns = 'id, name, created_at AS createdAt, updated_at AS updatedAt';
const contacts = new Hono<{ Bindings: Env; Variables: { owner: string } }>();

contacts.use('*', async (c, next) => {
  const session = await readBearerSession(c.env, c.req.raw.headers);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  c.set('owner', session.user.id);
  await next();
});
contacts.use('*', bodyLimit({ maxSize: 4096, onError: (c) => c.json({ error: 'Request body too large' }, 413) }));

function contactName(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const fields = Object.keys(value);
  if (fields.length !== 1 || fields[0] !== 'name') return null;
  const name = (value as { name: unknown }).name;
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed || Array.from(trimmed).length > 100 || /[\u0000-\u001f\u007f-\u009f]/u.test(trimmed)) return null;
  return trimmed;
}

contacts.get('/', async (c) => {
  const before = c.req.query('before');
  let timestamp = 0;
  let id = '';
  if (before !== undefined) {
    const cursor = /^(\d{1,16}):([a-f0-9-]{36})$/.exec(before);
    if (!cursor || !Number.isSafeInteger(Number(cursor[1]))) return c.json({ error: 'Invalid cursor' }, 400);
    timestamp = Number(cursor[1]);
    id = cursor[2];
  }
  const query = before === undefined
    ? c.env.DB.prepare(`SELECT ${columns} FROM contact WHERE user_id = ?1 ORDER BY created_at DESC, id DESC LIMIT 51`).bind(c.get('owner'))
    : c.env.DB.prepare(`SELECT ${columns} FROM contact WHERE user_id = ?1
        AND (created_at < ?2 OR (created_at = ?2 AND id < ?3))
        ORDER BY created_at DESC, id DESC LIMIT 51`).bind(c.get('owner'), timestamp, id);
  const { results } = await query.all<Contact>();
  const page = results.slice(0, 50);
  const last = page.at(-1);
  return c.json({ contacts: page, nextCursor: results.length > 50 && last ? `${last.createdAt}:${last.id}` : null });
});

contacts.post('/', async (c) => {
  const name = contactName(await c.req.json<unknown>().catch(() => null));
  if (!name) return c.json({ error: 'Provide only a name using 1–100 characters without control characters' }, 400);
  const now = Date.now();
  const result = await c.env.DB.prepare(`INSERT INTO contact (id, user_id, name, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?4) RETURNING ${columns}`)
    .bind(crypto.randomUUID(), c.get('owner'), name, now).first<Contact>();
  if (!result) throw new Error('Contact creation failed.');
  return c.json({ contact: result }, 201);
});

contacts.get('/:id', async (c) => {
  const result = await c.env.DB.prepare(`SELECT ${columns} FROM contact WHERE id = ?1 AND user_id = ?2`)
    .bind(c.req.param('id'), c.get('owner')).first<Contact>();
  return result ? c.json({ contact: result }) : c.json({ error: 'Contact not found' }, 404);
});

contacts.patch('/:id', async (c) => {
  const name = contactName(await c.req.json<unknown>().catch(() => null));
  if (!name) return c.json({ error: 'Provide only a name using 1–100 characters without control characters' }, 400);
  const result = await c.env.DB.prepare(`UPDATE contact SET name = ?1, updated_at = ?2
    WHERE id = ?3 AND user_id = ?4 RETURNING ${columns}`)
    .bind(name, Date.now(), c.req.param('id'), c.get('owner')).first<Contact>();
  return result ? c.json({ contact: result }) : c.json({ error: 'Contact not found' }, 404);
});

contacts.delete('/:id', async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM contact WHERE id = ?1 AND user_id = ?2 RETURNING id')
    .bind(c.req.param('id'), c.get('owner')).first<{ id: string }>();
  return result ? c.body(null, 204) : c.json({ error: 'Contact not found' }, 404);
});

export default contacts;
