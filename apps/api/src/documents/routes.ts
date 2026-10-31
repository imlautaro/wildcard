import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { TaskError, type TaskScope } from '../tasks/data';
import { createDocument, deleteDocument, listDocuments, readDocument, saveDocument } from './data';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * Human document routes under `/contacts/:id/documents` (your private chat with that
 * contact) and `/groups/:id/documents` (membership is checked by the parent router).
 * Saves carry the revision they were based on; a stale save returns 409 with the
 * current document so the editor can show it.
 */
export function documentRoutes(kind: 'contact' | 'group') {
  const routes = new Hono<{ Bindings: Env; Variables: { owner: string; documentScope: TaskScope } }>();
  routes.use('*', bodyLimit({ maxSize: 256 * 1024, onError: c => c.json({ error: 'Document is too large' }, 413) }));
  routes.use('*', async (c, next) => {
    const id = c.req.param('id')!, owner = c.get('owner');
    if (kind === 'contact' && !await c.env.DB.prepare('SELECT id FROM contact WHERE id = ? AND user_id = ?').bind(id, owner).first()) {
      return c.json({ error: 'Contact not found' }, 404);
    }
    if (c.req.method !== 'GET' && !(await admitAuthRequest(c.env.DB, owner, 'document-write', 60)).allowed) return c.json({ error: 'Too many requests' }, 429);
    c.set('documentScope', kind === 'contact' ? { kind, contactID: id, userID: owner } : { kind, groupID: id });
    await next();
  });
  routes.onError(async (error, c) => {
    if (!(error instanceof TaskError)) throw error;
    const documentID = c.req.param('documentID');
    const current = error.status === 409 && documentID ? await readDocument(c.env.DB, c.get('documentScope'), documentID, c.get('owner')).catch(() => null) : null;
    return c.json({ error: error.message, ...(current ? { document: current } : {}) }, error.status);
  });
  const json = async (request: Request) => {
    const value = await request.json<Record<string, unknown>>().catch(() => null);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TaskError('Expected a JSON object.');
    return value;
  };
  const actor = (owner: string) => ({ kind: 'user' as const, id: owner });

  routes.get('/', async c => c.json({ documents: await listDocuments(c.env.DB, c.get('documentScope'), c.get('owner')) }));
  routes.get('/:documentID', async c => c.json({ document: await readDocument(c.env.DB, c.get('documentScope'), c.req.param('documentID'), c.get('owner')) }));
  routes.post('/', async c => {
    const value = await json(c.req.raw);
    if (typeof value.id !== 'string' || !uuid.test(value.id)) throw new TaskError('Provide a document UUID.');
    const id = await createDocument(c.env.DB, c.get('documentScope'), actor(c.get('owner')), value.id.toLowerCase(), value.title, value.body ?? '', null);
    return c.json({ document: await readDocument(c.env.DB, c.get('documentScope'), id, c.get('owner')) }, 201);
  });
  routes.put('/:documentID', async c => {
    const value = await json(c.req.raw), scope = c.get('documentScope'), id = c.req.param('documentID');
    if (typeof value.baseRevision !== 'number' || !Number.isSafeInteger(value.baseRevision)) throw new TaskError('Provide the baseRevision you edited.');
    await saveDocument(c.env.DB, scope, actor(c.get('owner')), id, value.baseRevision, { title: value.title, body: value.body }, value.summary);
    return c.json({ document: await readDocument(c.env.DB, scope, id, c.get('owner')) });
  });
  routes.delete('/:documentID', async c => {
    await deleteDocument(c.env.DB, c.get('documentScope'), c.req.param('documentID'));
    return c.body(null, 204);
  });
  return routes;
}
