import { taskMembers, TaskError, type TaskActor, type TaskScope } from '../tasks/data';
import type { ResearchProvenance } from '../research/model';

// Markdown documents shared in a chat, with the same scopes as task lists. Every save
// is a compare-and-swap on `revision` and stores an attributed revision row.
export type DocumentScope = TaskScope;
export const DocumentError = TaskError;
export const documentLimits = { documents: 30, title: 200, body: 100_000, summary: 300, revisions: 50, readWindow: 12_000, edits: 20 };

type Row = { id: string; title: string; body: string; revision: number; sourceID: string | null; createdByKind: string; createdByID: string;
  updatedByKind: string; updatedByID: string; createdAt: number; updatedAt: number; researchJSON: string | null };
const columns = `d.id, d.title, d.body, d.revision, d.source_id AS sourceID, d.created_by_kind AS createdByKind, d.created_by_id AS createdByID,
  d.updated_by_kind AS updatedByKind, d.updated_by_id AS updatedByID, d.created_at AS createdAt, d.updated_at AS updatedAt, d.research_json AS researchJSON`;
const scopeWhere = (scope: DocumentScope) => scope.kind === 'group'
  ? { sql: 'd.group_id = ?', binds: [scope.groupID] }
  : { sql: 'd.contact_id = ? AND d.user_id = ?', binds: [scope.contactID, scope.userID] };

async function names(db: D1Database, scope: DocumentScope, viewerID?: string) {
  const members = new Map((await taskMembers(db, scope, viewerID)).map(member => [`${member.kind}:${member.id}`, member.name]));
  return (kind: string, id: string) => members.get(`${kind}:${id}`) ?? 'Former member';
}
// Plain text for list previews: drop Markdown markers, collapse whitespace.
const preview = (body: string) => body.replace(/[#>*_`~|[\]()-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);

export async function listDocuments(db: D1Database, scope: DocumentScope, viewerID?: string) {
  const where = scopeWhere(scope);
  const { results } = await db.prepare(`SELECT ${columns} FROM chat_document d WHERE ${where.sql} ORDER BY d.updated_at DESC LIMIT ${documentLimits.documents}`)
    .bind(...where.binds).all<Row>();
  const name = await names(db, scope, viewerID);
  return results.map(({ body, researchJSON, ...doc }) => ({ ...doc, research: researchJSON ? JSON.parse(researchJSON) as ResearchProvenance : null, length: body.length, preview: preview(body),
    createdByName: name(doc.createdByKind, doc.createdByID), updatedByName: name(doc.updatedByKind, doc.updatedByID) }));
}

export async function readDocument(db: D1Database, scope: DocumentScope, id: string, viewerID?: string) {
  const where = scopeWhere(scope);
  const doc = await db.prepare(`SELECT ${columns} FROM chat_document d WHERE d.id = ? AND ${where.sql}`).bind(id, ...where.binds).first<Row>();
  if (!doc) throw new DocumentError('Document not found in this chat.', 404);
  const { results } = await db.prepare(`SELECT revision, summary, author_kind AS authorKind, author_id AS authorID, created_at AS createdAt
    FROM chat_document_revision WHERE document_id = ? ORDER BY revision DESC LIMIT 20`).bind(id)
    .all<{ revision: number; summary: string | null; authorKind: string; authorID: string; createdAt: number }>();
  const name = await names(db, scope, viewerID);
  const { researchJSON, ...content } = doc;
  return { ...content, research: researchJSON ? JSON.parse(researchJSON) as ResearchProvenance : null,
    createdByName: name(doc.createdByKind, doc.createdByID), updatedByName: name(doc.updatedByKind, doc.updatedByID),
    revisions: results.map(revision => ({ ...revision, authorName: name(revision.authorKind, revision.authorID) })) };
}

function validTitle(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || [...value.trim()].length > documentLimits.title || value.includes('\0')) {
    throw new DocumentError(`Title must be 1–${documentLimits.title} characters.`);
  }
  return value.trim();
}
function validBody(value: unknown) {
  if (typeof value !== 'string' || value.length > documentLimits.body || value.includes('\0')) {
    throw new DocumentError(`Markdown must be a string up to ${documentLimits.body.toLocaleString('en-US')} characters.`);
  }
  return value;
}
function validSummary(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || [...value].length > documentLimits.summary) throw new DocumentError(`summary must be up to ${documentLimits.summary} characters.`);
  return value.trim();
}

export async function createDocument(db: D1Database, scope: DocumentScope, actor: TaskActor, id: string, title: unknown, body: unknown, sourceID: string | null, summary?: unknown) {
  const where = scopeWhere(scope);
  if (await db.prepare(`SELECT d.id FROM chat_document d WHERE d.id = ? AND ${where.sql}`).bind(id, ...where.binds).first()) return id;
  const count = await db.prepare(`SELECT COUNT(*) AS count FROM chat_document d WHERE ${where.sql}`).bind(...where.binds).first<{ count: number }>();
  if ((count?.count ?? 0) >= documentLimits.documents) throw new DocumentError(`This chat already has ${documentLimits.documents} documents. Delete one first.`, 409);
  const docTitle = validTitle(title), docBody = validBody(body), now = Date.now();
  await db.batch([
    db.prepare(`INSERT INTO chat_document (id, group_id, contact_id, user_id, title, body, source_id, created_by_kind, created_by_id,
      updated_by_kind, updated_by_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?8, ?9, ?10, ?10)`)
      .bind(id, scope.kind === 'group' ? scope.groupID : null, scope.kind === 'contact' ? scope.contactID : null,
        scope.kind === 'contact' ? scope.userID : null, docTitle, docBody, sourceID, actor.kind, actor.id, now),
    db.prepare(`INSERT INTO chat_document_revision (document_id, revision, title, body, summary, author_kind, author_id, created_at)
      VALUES (?, 1, ?, ?, ?, ?, ?, ?)`).bind(id, docTitle, docBody, validSummary(summary) ?? 'Created', actor.kind, actor.id, now),
  ]);
  return id;
}

/**
 * Saves a new title/body if the document is still at `baseRevision`. A conflict
 * returns 409 so the editor can reload; nothing is merged silently.
 */
export async function saveDocument(db: D1Database, scope: DocumentScope, actor: TaskActor, id: string, baseRevision: number,
  change: { title?: unknown; body?: unknown }, summary?: unknown) {
  const current = await readDocument(db, scope, id);
  if (current.revision !== baseRevision) throw new DocumentError(`The document changed (now revision ${current.revision}). Reload it and apply your change again.`, 409);
  const title = change.title === undefined ? current.title : validTitle(change.title);
  const body = change.body === undefined ? current.body : validBody(change.body);
  if (title === current.title && body === current.body) return current.revision;
  const now = Date.now(), next = baseRevision + 1;
  const [updated] = await db.batch([
    db.prepare(`UPDATE chat_document SET title = ?3, body = ?4, revision = ?5, updated_by_kind = ?6, updated_by_id = ?7, updated_at = ?8
      WHERE id = ?1 AND revision = ?2`).bind(id, baseRevision, title, body, next, actor.kind, actor.id, now),
    db.prepare(`INSERT INTO chat_document_revision (document_id, revision, title, body, summary, author_kind, author_id, created_at)
      SELECT id, revision, title, body, ?3, updated_by_kind, updated_by_id, updated_at FROM chat_document
      WHERE id = ?1 AND revision = ?2 AND updated_by_kind = ?4 AND updated_by_id = ?5 AND updated_at = ?6 ON CONFLICT DO NOTHING`)
      .bind(id, next, validSummary(summary), actor.kind, actor.id, now),
    db.prepare('DELETE FROM chat_document_revision WHERE document_id = ? AND revision <= ?').bind(id, next - documentLimits.revisions),
  ]);
  if (!updated!.meta.changes) throw new DocumentError('The document changed. Reload it and apply your change again.', 409);
  return next;
}

/** Targeted edits for contacts: each `find` must occur exactly once in the current text. */
export function applyEdits(body: string, edits: unknown) {
  if (!Array.isArray(edits) || !edits.length || edits.length > documentLimits.edits) throw new DocumentError(`edits must list 1–${documentLimits.edits} {find, replace} changes.`);
  let result = body;
  for (const [index, edit] of edits.entries()) {
    const { find, replace } = (edit ?? {}) as Record<string, unknown>;
    if (typeof find !== 'string' || !find || typeof replace !== 'string') throw new DocumentError(`Edit ${index + 1} needs find (non-empty) and replace strings.`);
    const first = result.indexOf(find);
    if (first < 0) throw new DocumentError(`Edit ${index + 1}: find text not found. Use read_document for the current text.`);
    if (result.indexOf(find, first + 1) >= 0) throw new DocumentError(`Edit ${index + 1}: find text occurs more than once; include more surrounding text.`);
    result = result.slice(0, first) + replace + result.slice(first + find.length);
  }
  return result;
}

export async function deleteDocument(db: D1Database, scope: DocumentScope, id: string) {
  await readDocument(db, scope, id);
  await db.prepare('DELETE FROM chat_document WHERE id = ?').bind(id).run();
}
