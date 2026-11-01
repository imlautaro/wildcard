import { accountEnvironment } from '../lib/model-preference';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { readBearerSession } from '../lib/session';
import { contactModelAllowed } from '../chat/consent';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { validRemoteTicket } from './remote';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const remoteSettings = new Hono<{ Bindings: Env; Variables: { owner: string } }>();
remoteSettings.use('*', bodyLimit({ maxSize: 2048, onError: c => c.json({ error: 'Request body too large' }, 413) }));
remoteSettings.use('*', async (c, next) => {
  if (!await c.env.DB.prepare('SELECT id FROM contact WHERE id = ? AND user_id = ?').bind(c.req.param('id'), c.get('owner')).first()) return c.json({ error: 'Contact not found' }, 404);
  if (!await contactModelAllowed(c.env, c.req.param('id')!, c.get('owner'))) return c.json({ error: 'Contact consent required' }, 403);
  const admission = await admitAuthRequest(c.env.DB, c.get('owner'), 'native-remote-settings', 120);
  if (!admission.allowed) return c.json({ error: 'Too many requests' }, 429);
  await next();
});
remoteSettings.get('/', async c => {
  const { results: devices } = await c.env.DB.prepare(`SELECT d.installation_id AS id,
    CASE WHEN d.user_id = ?1 THEN d.name ELSE u.name || '’s ' || d.name END AS name,
    d.user_id = ?1 AS owned FROM native_remote_device d
    JOIN native_remote_access g ON g.device_id = d.id AND g.contact_id = ?2
    JOIN user u ON u.id = d.user_id
    JOIN push_device p ON p.id = d.push_device_id JOIN session s ON s.id = p.session_id AND s.user_id = d.user_id
    WHERE s.expires_at > ?3 ORDER BY d.updated_at DESC LIMIT 10`).bind(c.get('owner'), c.req.param('id'), Date.now()).all();
  const { results: participants } = await c.env.DB.prepare(`SELECT other.id, u.name FROM contact own
    JOIN contact other ON other.agent_id = own.agent_id AND other.user_id != own.user_id
    JOIN user u ON u.id = other.user_id WHERE own.id = ?1 AND own.user_id = ?2
    AND EXISTS (SELECT 1 FROM native_remote_grant g JOIN native_remote_device d ON d.id = g.device_id
      WHERE g.contact_id = own.id AND d.user_id = own.user_id)
    ORDER BY other.id LIMIT 3`)
    .bind(c.req.param('id'), c.get('owner')).all();
  const { results: delegations } = await c.env.DB.prepare(`SELECT x.id, d.installation_id AS deviceID, x.contact_id AS participantID
    FROM native_remote_delegate x JOIN native_remote_device d ON d.id = x.device_id
    WHERE d.user_id = ? AND x.owner_contact_id = ? ORDER BY x.created_at LIMIT 30`)
    .bind(c.get('owner'), c.req.param('id')).all();
  const { results: actions } = await c.env.DB.prepare(`SELECT a.id, a.turn_id AS turnID, a.kind,
    json_extract(a.payload_json, '$.title') AS title, COALESCE(d.name, 'iPhone') AS deviceName,
    CASE WHEN a.status = 'pending' AND a.expires_at <= ?3 THEN 'expired' ELSE a.status END AS status,
    a.updated_at AS updatedAt, a.fire_at AS fireAt
    FROM native_action a JOIN chat_turn t ON t.id = a.turn_id LEFT JOIN native_remote_device d ON d.id = a.remote_device_id
    WHERE a.remote_device_id IS NOT NULL AND t.contact_id = ?1 AND t.user_id = ?2 ORDER BY a.created_at DESC LIMIT 20`)
    .bind(c.req.param('id'), c.get('owner'), Date.now()).all();
  return c.json({ devices, actions, participants, delegations });
});
// Only the device account can delegate; membership never implies device access.
remoteSettings.put('/:deviceID/participants/:participantID', async c => {
  if (!uuid.test(c.req.param('deviceID')) || !uuid.test(c.req.param('participantID'))) return c.json({ error: 'Invalid participant or device' }, 400);
  const deviceKey = `${c.get('owner')}:${c.req.param('deviceID')}`;
  const saved = await c.env.DB.prepare(`INSERT INTO native_remote_delegate(id, device_id, owner_contact_id, contact_id, created_at)
    SELECT ?1, d.id, own.id, recipient.id, ?2 FROM native_remote_device d
    JOIN native_remote_grant g ON g.device_id = d.id AND g.contact_id = ?3
    JOIN contact own ON own.id = g.contact_id AND own.user_id = d.user_id
    JOIN contact recipient ON recipient.id = ?4 AND recipient.agent_id = own.agent_id AND recipient.user_id != own.user_id
    JOIN push_device p ON p.id = d.push_device_id JOIN session s ON s.id = p.session_id AND s.user_id = d.user_id
    WHERE d.id = ?5 AND d.user_id = ?6 AND s.expires_at > ?2
    ON CONFLICT(device_id, contact_id) DO UPDATE SET created_at = native_remote_delegate.created_at RETURNING id`)
    .bind(crypto.randomUUID(), Date.now(), c.req.param('id'), c.req.param('participantID'), deviceKey, c.get('owner')).first();
  return saved ? c.body(null, 204) : c.json({ error: 'Enable remote access on your iPhone and choose a current shared-contact participant' }, 409);
});
remoteSettings.delete('/:deviceID/participants/:participantID', async c => {
  await c.env.DB.prepare('DELETE FROM native_remote_delegate WHERE device_id = ? AND owner_contact_id = ? AND contact_id = ?')
    .bind(`${c.get('owner')}:${c.req.param('deviceID')}`, c.req.param('id'), c.req.param('participantID')).run();
  return c.body(null, 204);
});
remoteSettings.put('/:deviceID', async c => {
  const session = await readBearerSession(c.env, c.req.raw.headers);
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!session || !uuid.test(c.req.param('deviceID')) || !body || Object.keys(body).sort().join(',') !== 'environment,grant,kinds,name,token'
    || !['enable','refresh'].includes(String(body.grant))
    || typeof body.name !== 'string' || !body.name.trim() || body.name.length > 80 || /[\u0000-\u001f]/.test(body.name)
    || !Array.isArray(body.kinds) || body.kinds.length < 1 || body.kinds.length > 2 || body.kinds.some(k => !['timer','alarm'].includes(String(k))) || new Set(body.kinds).size !== body.kinds.length
    || typeof body.token !== 'string' || !/^[a-f0-9]{32,200}$/.test(body.token) || !['development', 'production'].includes(String(body.environment))) return c.json({ error: 'Invalid device registration' }, 400);
  const push = await c.env.DB.prepare('SELECT id FROM push_device WHERE token = ? AND environment = ? AND session_id = ?')
    .bind(body.token, body.environment, session.session.id).first<{ id: string }>();
  if (!push) return c.json({ error: 'Enable notifications on this iPhone first' }, 409);
  const deviceID = `${c.get('owner')}:${c.req.param('deviceID')}`;
  if (body.grant === 'refresh' && !await c.env.DB.prepare('SELECT 1 FROM native_remote_grant WHERE device_id = ? AND contact_id = ?').bind(deviceID, c.req.param('id')).first()) return c.json({ error: 'Remote permission was revoked. Enable it again on this iPhone.' }, 409);
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM native_remote_grant WHERE device_id = ?').bind(deviceID).first<{ n: number }>();
  if ((count?.n ?? 0) >= 20 && !await c.env.DB.prepare('SELECT 1 FROM native_remote_grant WHERE device_id = ? AND contact_id = ?').bind(deviceID, c.req.param('id')).first()) return c.json({ error: 'At most 20 contacts can control this device' }, 409);
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO native_remote_device(id, user_id, installation_id, push_device_id, name, updated_at) VALUES (?1,?2,?3,?4,?5,?6)
      ON CONFLICT(id) DO UPDATE SET push_device_id = excluded.push_device_id, name = excluded.name, updated_at = excluded.updated_at`)
      .bind(deviceID, c.get('owner'), c.req.param('deviceID'), push.id, body.name.trim(), Date.now()),
    body.grant === 'enable'
      ? c.env.DB.prepare('INSERT INTO native_remote_grant(device_id, contact_id, created_at, kinds_json) VALUES (?,?,?,?) ON CONFLICT(device_id,contact_id) DO UPDATE SET kinds_json = excluded.kinds_json').bind(deviceID, c.req.param('id'), Date.now(), JSON.stringify(body.kinds))
      : c.env.DB.prepare('UPDATE native_remote_grant SET kinds_json = ?3 WHERE device_id = ?1 AND contact_id = ?2').bind(deviceID, c.req.param('id'), JSON.stringify(body.kinds)),
  ]);
  return c.body(null, 204);
});
remoteSettings.delete('/:deviceID', async c => {
  await c.env.DB.prepare('DELETE FROM native_remote_grant WHERE device_id = ? AND contact_id = ?')
    .bind(`${c.get('owner')}:${c.req.param('deviceID')}`, c.req.param('id')).run();
  return c.body(null, 204);
});

export const remoteExecution = new Hono<{ Bindings: Env }>();
remoteExecution.use('*', bodyLimit({ maxSize: 1024, onError: c => c.json({ error: 'Request body too large' }, 413) }));
remoteExecution.post('/:actionID', async c => {
  const admission = await admitAuthRequest(c.env.DB, c.req.header('CF-Connecting-IP') ?? 'local', 'native-execution', 120);
  if (!admission.allowed) return c.json({ error: 'Too many requests' }, 429);
  const id = c.req.param('actionID');
  if (id.length > 100) return c.json({ error: 'Not found' }, 404);
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || Object.keys(body).sort().join(',') !== 'deviceID,executionID,status' || typeof body.executionID !== 'string' || !uuid.test(body.executionID)
    || typeof body.deviceID !== 'string' || !uuid.test(body.deviceID) || !['running','completed','failed','cancelled','unknown'].includes(String(body.status))) return c.json({ error: 'Invalid receipt' }, 400);
  const row = await c.env.DB.prepare(`SELECT a.remote_nonce AS nonce, a.expires_at AS expiresAt, a.kind, a.payload_json AS payloadJSON,
    a.fire_at AS fireAt, d.user_id AS userID, g.owner_contact_id AS contactID,
    t.user_id AS requesterID, t.contact_id AS requesterContactID, d.installation_id AS deviceID
    FROM native_action a JOIN chat_turn t ON t.id = a.turn_id JOIN contact c ON c.id = t.contact_id AND c.user_id = t.user_id
    JOIN native_remote_device d ON d.id = a.remote_device_id
    JOIN push_device p ON p.id = d.push_device_id JOIN session s ON s.id = p.session_id AND s.user_id = d.user_id
    JOIN native_remote_access g ON g.device_id = d.id AND g.contact_id = t.contact_id
      AND g.grant_id = COALESCE(a.remote_grant_id, d.id || ':' || t.contact_id)
    WHERE a.id = ?1 AND d.installation_id = ?2 AND s.expires_at > ?3`).bind(id, body.deviceID, Date.now())
    .first<{ nonce: string; expiresAt: number; kind: string; payloadJSON: string; fireAt: number; userID: string; contactID: string; requesterID: string; requesterContactID: string; deviceID: string }>();
  const ticket = c.req.header('Authorization')?.match(/^Native ([a-f0-9]{64})$/)?.[1];
  if (!row || !ticket || !await validRemoteTicket(c.env, id, row.nonce, ticket)) return c.json({ error: 'Unauthorized' }, 401);
  if (!await contactModelAllowed(await accountEnvironment(c.env, row.userID), row.contactID, row.userID)
    || !await contactModelAllowed(await accountEnvironment(c.env, row.requesterID), row.requesterContactID, row.requesterID)) return c.json({ error: 'Contact consent required' }, 403);
  const running = body.status === 'running';
  const updated = await c.env.DB.prepare(`UPDATE native_action SET status = ?2, execution_id = ?3, updated_at = ?4
    WHERE id = ?1 AND ${running ? "status = 'pending' AND expires_at > ?4" : "status = 'running' AND execution_id = ?3"}
    AND EXISTS (SELECT 1 FROM native_remote_access g WHERE g.device_id = native_action.remote_device_id AND g.contact_id = ?5
      AND g.grant_id = COALESCE(native_action.remote_grant_id, g.device_id || ':' || g.contact_id)
      AND EXISTS (SELECT 1 FROM json_each(g.kinds_json) WHERE value = native_action.kind))
    AND EXISTS (SELECT 1 FROM native_remote_device d JOIN push_device p ON p.id = d.push_device_id
      JOIN session s ON s.id = p.session_id AND s.user_id = d.user_id
      WHERE d.id = native_action.remote_device_id AND s.expires_at > ?4)
    RETURNING id`).bind(id, body.status, body.executionID, Date.now(), row.requesterContactID).first();
  if (!updated) return c.json({ error: 'Expired or already claimed. Never repeat execution.' }, 409);
  return c.json({ ...row, nonce: undefined, requesterID: undefined, requesterContactID: undefined, id, executionID: body.executionID });
});
