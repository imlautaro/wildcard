import type { ModelTool } from '../chat/meta';
import { cardKinds } from './cards';
import { homeLimits } from './curator';

// A contact in a private chat can put something on the person's Home when they
// want to keep following it. The curator refines it and picks the contact that
// prepares its card on the next run (docs/home.md).
export const homeInstruction = 'The person has a Home screen that their contacts curate together with cards about what they care about (news, scores, prices, processes they wait on, notes). '
  + 'When the person asks to follow, track or keep an eye on something over time, or to see it on Home, call add_to_home with a short title, a brief of what the card should show, and the best kind. '
  + 'Do not add things they did not show ongoing interest in. Afterwards mention briefly that it will appear on their Home.';

export const homeTool: ModelTool = { type: 'function', function: { name: 'add_to_home',
  description: 'Add a topic to the person\'s Home so their contacts keep a card about it up to date.',
  parameters: { type: 'object', additionalProperties: false, required: ['title', 'brief', 'kind'], properties: {
    title: { type: 'string', minLength: 1, maxLength: 60, description: 'Short card title in the person\'s language.' },
    brief: { type: 'string', minLength: 1, maxLength: 400, description: 'What the card should show and why it matters to them.' },
    kind: { type: 'string', enum: [...cardKinds], description: 'headlines (news), matches (sports), table, metrics (key figures), chart (a figure over time), tracker (progress of a process or wait), note, list.' },
  } } } };

export async function addToHome(env: Env, scope: { userID: string; contactID: string }, args: Record<string, unknown>): Promise<string> {
  const clean = (value: unknown) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  const title = clean(args.title), brief = clean(args.brief);
  if (Object.keys(args).some(key => !['title', 'brief', 'kind'].includes(key)) || !title || Array.from(title).length > 60
    || !brief || Array.from(brief).length > 400 || !(cardKinds as readonly string[]).includes(String(args.kind))) {
    return JSON.stringify({ added: false, error: 'Provide title (max 60), brief (max 400) and a valid kind.' });
  }
  const now = Date.now();
  const existing = await env.DB.prepare(`SELECT id, status FROM home_topic WHERE user_id = ? AND lower(title) = lower(?) AND status != 'retired'`)
    .bind(scope.userID, title).first<{ id: string; status: string }>();
  if (existing?.status === 'hidden') return JSON.stringify({ added: false, error: 'The person hid this from Home. Do not add it again unless they ask.' });
  const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM home_topic WHERE user_id = ? AND source = 'contact' AND status = 'active'`)
    .bind(scope.userID).first<{ count: number }>();
  if (!existing && (count?.count ?? 0) >= homeLimits.contactTopics) return JSON.stringify({ added: false, error: 'Home already follows many suggested topics.' });
  await env.DB.batch([
    existing
      ? env.DB.prepare(`UPDATE home_topic SET brief = ?, kind = ?, contact_id = ?, updated_at = ? WHERE id = ?`)
        .bind(brief, args.kind, scope.contactID, now, existing.id)
      : env.DB.prepare(`INSERT INTO home_topic (id, user_id, title, brief, kind, source, contact_id, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, 'contact', id, ?, ? FROM contact WHERE id = ? AND user_id = ?`)
        .bind(crypto.randomUUID(), scope.userID, title, brief, args.kind, now, now, scope.contactID, scope.userID),
    // Runs start only once the person opens Home (viewed_at), never for an unseen feed.
    env.DB.prepare(`INSERT INTO home_feed (user_id, due_at, viewed_at) VALUES (?1, ?2, 0)
      ON CONFLICT(user_id) DO UPDATE SET due_at = MIN(home_feed.due_at, ?2)`).bind(scope.userID, now),
    // A topic with a card is composed again so the new brief shows.
    env.DB.prepare(`UPDATE home_card SET expires_at = MIN(expires_at, ?) WHERE topic_id = ?`).bind(now, existing?.id ?? ''),
  ]);
  return JSON.stringify({ added: true, updated: !!existing, note: 'It will appear on their Home after the next update, usually within a few minutes.' });
}
