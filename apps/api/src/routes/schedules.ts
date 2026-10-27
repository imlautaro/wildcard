import { Hono } from 'hono';
import { listSchedules } from '../schedules/data';
import { cancelSchedule } from '../schedules/tools';
import { admitAuthRequest } from '../lib/auth-rate-limit';

const schedules = new Hono<{ Bindings: Env; Variables: { owner: string } }>();
schedules.use('*', async (c, next) => {
  if (!await c.env.DB.prepare('SELECT id FROM contact WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), c.get('owner')).first()) return c.json({ error: 'Contact not found' }, 404);
  await next();
});
schedules.get('/', async (c) => c.json({ schedules: await listSchedules(c.env.DB,
  { contactID: c.req.param('id')!, userID: c.get('owner') }, { hideDeliveredOnce: true }) }));
schedules.delete('/:scheduleID', async (c) => {
  const admission = await admitAuthRequest(c.env.DB, c.get('owner'), 'schedule-cancel', 60);
  if (!admission.allowed) return c.json({ error: 'Too many requests' }, 429);
  const schedule = await cancelSchedule(c.env.DB, { contactID: c.req.param('id')!, userID: c.get('owner') }, c.req.param('scheduleID'));
  return schedule ? c.json({ schedule }) : c.json({ error: 'Schedule not found' }, 404);
});
export default schedules;
