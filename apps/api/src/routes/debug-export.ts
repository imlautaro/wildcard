import { Hono } from 'hono';

// Server-owned SQL and explicit column allowlists. Never accept table/column SQL
// from the request or export authentication, connector credentials or global memory.
const contacts = 'SELECT id FROM contact WHERE user_id = ?1 AND clearing = 0';
const groups = `SELECT g.id FROM chat_group g JOIN group_member m ON m.group_id = g.id
  WHERE m.user_id = ?1 AND g.clearing = 0`;
const scope = `(r.user_id = ?1 AND r.contact_id IN (${contacts})) OR r.group_id IN (${groups})`;
const lists = `SELECT r.id FROM task_list r WHERE ${scope}`;
const tasks = `SELECT id FROM task WHERE list_id IN (${lists})`;
const documents = `SELECT r.id FROM chat_document r WHERE ${scope}`;
const apps = `SELECT r.id FROM mini_app r WHERE ${scope}`;
type Dataset = { table: string; columns: string; where: string };
const debugDatasets: Record<string, Dataset> = {
  user: { table: 'user',
    columns: 'r.id, r.name, r.email, r.chat_model, r.created_at, r.updated_at',
    where: `r.id = ?1` },
  contact: { table: 'contact',
    columns: 'r.id, r.user_id, r.name, r.created_at, r.updated_at, r.last_read_sequence, r.photo_version, r.agent_id, r.contributor_consent, r.initiative_enabled, r.last_reply_read_at, r.onboarding_chat, r.voice_messages_enabled, r.archived_at, r.history_revision, r.clearing, r.initiative_paused, r.learning_enabled, r.learning_revision, r.learning_since, r.welcome_due_at, r.welcome_attempts, r.reengaged_at',
    where: `r.id IN (${contacts})` },
  contact_agent: { table: 'contact_agent',
    columns: 'r.id, r.name, r.photo_version, r.memory_shared, r.energy, r.energy_updated_at, r.voice_id, r.voice_name, r.speech_accent',
    where: `r.id IN (SELECT agent_id FROM contact WHERE id IN (${contacts})) OR r.id IN (SELECT agent_id FROM group_agent WHERE group_id IN (${groups}))` },
  chat_turn: { table: 'chat_turn',
    columns: 'r.sequence, r.id, r.contact_id, r.user_id, r.user_text, r.assistant_text, r.status, r.attempt, r.workflow_id, r.error_code, r.created_at, r.updated_at, r.checked_at, r.time_zone, r.schedule_id, r.schedule_revision, r.scheduled_at, r.schedule_instruction, r.attachment_json, r.read_at, r.group_request_id, r.reply_to_id, r.reply_to_side, r.initiative_source_id, r.tools_started, r.assistant_messages_json, r.task_id, r.origin_group_id, r.voice_listened_at, r.voice_transcribed_at, r.initiative_kind, r.initiative_engagement, r.initiative_response, r.initiative_response_to_id, r.initiative_feedback_at, r.assistant_voice_listened_json',
    where: `r.contact_id IN (${contacts}) AND r.user_id = ?1` },
  chat_group: { table: 'chat_group',
    columns: 'r.id, r.owner_id, r.name, r.created_at, r.photo_version, r.history_revision, r.clearing, r.learning_revision',
    where: `r.id IN (${groups})` },
  group_member: { table: 'group_member',
    columns: 'r.group_id, r.user_id, r.can_invite, r.share_memory, r.contributor_consent, r.joined_at',
    where: `r.group_id IN (${groups})` },
  own_group_settings: { table: 'group_member',
    columns: 'r.group_id, r.user_id, r.last_read_sequence, r.archived_at, r.learning_enabled, r.learning_revision, r.learning_since, r.welcome_due_at, r.welcome_attempts, r.reengaged_at',
    where: `r.user_id = ?1 AND r.group_id IN (${groups})` },
  group_agent: { table: 'group_agent',
    columns: 'r.group_id, r.agent_id, r.added_by, r.joined_at',
    where: `r.group_id IN (${groups})` },
  group_message: { table: 'group_message',
    columns: 'r.sequence, r.id, r.group_id, r.user_id, r.agent_id, r.sender_name, r.contributor_consent, r.round_enqueued, r.text, r.created_at, r.attachment_json, r.attachments_json, r.request_id, r.receipts_tracked, r.exchange_id, r.requester_id, r.reply_to_id, r.task_id, r.voice_listened_at, r.voice_transcribed_at',
    where: `r.group_id IN (${groups})` },
  group_reply: { table: 'group_reply',
    columns: 'r.sequence, r.id, r.group_id, r.agent_id, r.source_id, r.status, r.attempt, r.workflow_id, r.created_at, r.plan_rank, r.plan_role, r.plan_angle, r.plan_tools, r.draft_ready_at',
    where: `r.group_id IN (${groups})` },
  group_round: { table: 'group_round',
    columns: 'r.source_id, r.group_id, r.claimed_by, r.claimed_at, r.status, r.plan_json, r.planned_at',
    where: `r.group_id IN (${groups})` },
  group_exchange: { table: 'group_exchange',
    columns: 'r.root_id, r.bot_messages',
    where: `r.root_id IN (SELECT id FROM group_message WHERE group_id IN (${groups}))` },
  group_publication: { table: 'group_publication',
    columns: 'r.group_id, r.turn_id, r.attempt, r.acquired_at',
    where: `r.group_id IN (${groups})` },
  message_reaction: { table: 'message_reaction',
    columns: 'r.turn_id, r.group_message_id, r.side, r.user_id, r.agent_id, r.emoji',
    where: `r.turn_id IN (SELECT id FROM chat_turn WHERE user_id = ?1 AND contact_id IN (${contacts}))
      OR r.group_message_id IN (SELECT id FROM group_message WHERE group_id IN (${groups}))` },
  group_message_receipt: { table: 'group_message_receipt',
    columns: 'r.message_id, r.recipient_kind, r.recipient_id, r.delivered_at, r.read_at',
    where: `r.message_id IN (SELECT id FROM group_message WHERE group_id IN (${groups}))` },
  group_request: { table: 'group_request',
    columns: 'r.id, r.source_turn_id, r.group_id, r.requester_id, r.sender_agent_id, r.target_agent_id, r.question, r.status, r.result_kind, r.created_at, r.expires_at, r.checked_at',
    where: `r.requester_id = ?1 AND r.source_turn_id IN (SELECT id FROM chat_turn WHERE user_id = ?1 AND contact_id IN (${contacts}))` },
  contact_memory: { table: 'contact_memory',
    columns: 'r.id, r.contact_id, r.user_id, r.memory_key, r.kind, r.content, r.source_turn_id, r.source_quote, r.source_sequence, r.updated_at',
    where: `r.user_id = ?1 AND r.contact_id IN (${contacts})` },
  contact_memory_state: { table: 'contact_memory_state',
    columns: 'r.contact_id, r.user_id, r.last_sequence',
    where: `r.user_id = ?1 AND r.contact_id IN (${contacts})` },
  retained_contact_memory: { table: 'retained_contact_memory',
    columns: 'r.contact_id, r.user_id, r.category, r.memory_key, r.kind, r.content, r.updated_at',
    where: `r.user_id = ?1 AND r.contact_id IN (${contacts})` },
  mcp_private_contact: { table: 'mcp_private_contact',
    columns: 'r.contact_id',
    where: `r.contact_id IN (${contacts})` },
  mcp_private_group: { table: 'mcp_private_group',
    columns: 'r.group_id',
    where: `r.group_id IN (${groups})` },
  contact_schedule: { table: 'contact_schedule',
    columns: 'r.id, r.contact_id, r.user_id, r.instruction, r.time_zone, r.next_at, r.interval_seconds, r.status, r.revision, r.created_at, r.updated_at, r.recipient_user_id',
    where: `r.user_id = ?1 AND r.contact_id IN (${contacts})` },
  conversation_initiative: { table: 'conversation_initiative',
    columns: 'r.contact_id, r.source_id, r.anchor_id, r.revision, r.evaluations, r.sent, r.next_at, r.expires_at, r.intent, r.mode, r.reengage',
    where: `r.contact_id IN (${contacts})` },
  conversation_learning: { table: 'conversation_learning',
    columns: 'r.scope_key, r.agent_id, r.user_id, r.contact_id, r.group_id, r.revision, r.through_sequence, r.attempted_at, r.reviewed_at, r.isolated, r.contributor_eligible, r.profile_json',
    where: `r.user_id = ?1 AND (r.contact_id IN (${contacts}) OR r.group_id IN (${groups}))` },
  agent_personality: { table: 'agent_personality',
    columns: 'r.agent_id, r.profile_json, r.revision, r.updated_at',
    where: `r.agent_id IN (SELECT agent_id FROM contact WHERE id IN (${contacts}))` },
  contact_presence: { table: 'contact_presence',
    columns: 'r.contact_id, r.user_id, r.status, r.last_seen_at, r.expires_at',
    where: `r.user_id = ?1 AND r.contact_id IN (${contacts})` },
  group_private_sharing: { table: 'group_private_sharing',
    columns: 'r.group_id, r.agent_id, r.user_id, r.contact_id, r.created_at',
    where: `r.user_id = ?1 AND r.group_id IN (${groups})` },
  mini_app: { table: 'mini_app',
    columns: 'r.id, r.contact_id, r.user_id, r.group_id, r.reply_id, r.agent_id, r.turn_id, r.revision, r.title, r.spec_json, r.tools_json, r.approved_revision, r.last_error, r.created_at, r.updated_at',
    where: `r.id IN (${apps})` },
  mini_app_state: { table: 'mini_app_state',
    columns: 'r.app_id, r.values_json, r.version, r.last_execution, r.updated_at',
    where: `r.app_id IN (${apps})` },
  mini_app_action: { table: 'mini_app_action',
    columns: 'r.id, r.app_id, r.revision, r.action_id, r.arguments_json, r.status, r.created_at, r.updated_at',
    where: `r.app_id IN (${apps})` },
  chat_document: { table: 'chat_document',
    columns: 'r.id, r.group_id, r.contact_id, r.user_id, r.title, r.body, r.revision, r.source_id, r.created_by_kind, r.created_by_id, r.updated_by_kind, r.updated_by_id, r.created_at, r.updated_at, r.research_json',
    where: `r.id IN (${documents})` },
  chat_document_revision: { table: 'chat_document_revision',
    columns: 'r.document_id, r.revision, r.title, r.body, r.summary, r.author_kind, r.author_id, r.created_at',
    where: `r.document_id IN (${documents})` },
  task_list: { table: 'task_list',
    columns: 'r.id, r.group_id, r.contact_id, r.user_id, r.title, r.status, r.created_by_kind, r.created_by_id, r.created_at, r.updated_at',
    where: `r.id IN (${lists})` },
  task: { table: 'task',
    columns: 'r.id, r.list_id, r.position, r.title, r.notes, r.status, r.assignee_kind, r.assignee_id, r.result, r.created_by_kind, r.created_by_id, r.version, r.created_at, r.updated_at, r.completed_at, r.work_due_at, r.work_reason, r.work_count, r.work_state, r.next_step, r.evidence, r.blocked_reason, r.work_generation, r.research_query, r.research_user_id, r.research_count, r.monitor_url, r.monitor_keywords, r.monitor_interval, r.monitor_user_id, r.monitor_due_at, r.monitor_pending_at, r.monitor_turns, r.document_id, r.review_rounds, r.review_feedback',
    where: `r.list_id IN (${lists})` },
  task_work: { table: 'task_work',
    columns: 'r.id, r.task_id, r.agent_id, r.reason, r.created_at, r.generation',
    where: `r.task_id IN (${tasks})` },
  task_monitor_check: { table: 'task_monitor_check',
    columns: 'r.id, r.task_id, r.url, r.generation, r.outcome, r.http_status, r.error_code, r.excerpt, r.checked_at',
    where: `r.task_id IN (${tasks})` },
  task_dependency: { table: 'task_dependency',
    columns: 'r.task_id, r.blocked_by_id',
    where: `r.task_id IN (${tasks}) AND r.blocked_by_id IN (${tasks})` },
  web_research: { table: 'web_research',
    columns: 'r.id, r.budget_id, r.user_id, r.agent_id, r.chat_turn_id, r.group_reply_id, r.group_source_id, r.query, r.title, r.model, r.status, r.result_json, r.error_code, r.document_id, r.created_at, r.task_id, r.task_generation, r.delivery',
    where: `r.user_id = ?1 AND (r.chat_turn_id IN (SELECT id FROM chat_turn WHERE contact_id IN (${contacts}) AND user_id = ?1) OR r.group_reply_id IN (SELECT id FROM group_reply WHERE group_id IN (${groups})) OR r.task_id IN (${tasks}))` },
  home_feed: { table: 'home_feed',
    columns: 'r.user_id, r.status, r.revision, r.due_at, r.claimed_at, r.requested_at, r.generated_at, r.viewed_at, r.time_zone, r.briefing, r.progress_json, r.error_code',
    where: 'r.user_id = ?1' },
  home_topic: { table: 'home_topic',
    columns: 'r.id, r.user_id, r.title, r.brief, r.reason, r.kind, r.source, r.contact_id, r.status, r.feedback, r.pinned, r.created_at, r.updated_at, r.skips, r.skip_reason',
    where: 'r.user_id = ?1' },
  home_card: { table: 'home_card',
    columns: 'r.id, r.user_id, r.topic_id, r.contact_id, r.kind, r.position, r.payload_json, r.connector, r.revision, r.generated_at, r.expires_at',
    where: 'r.user_id = ?1' },
  home_post: { table: 'home_post',
    columns: 'r.id, r.user_id, r.topic_id, r.contact_id, r.text, r.kind, r.payload_json, r.connector, r.reply_to, r.created_at',
    where: 'r.user_id = ?1' },
  home_comment: { table: 'home_comment',
    columns: 'r.id, r.user_id, r.post_id, r.contact_id, r.text, r.reply_text, r.status, r.error_code, r.created_at, r.replied_at',
    where: 'r.user_id = ?1' },
  mini_app_usage: { table: 'mini_app_usage',
    columns: 'r.app_id, r.user_id, r.opens, r.last_opened_at',
    where: 'r.user_id = ?1' },
};

const debugExport = new Hono<{ Bindings: Env; Variables: { owner: string } }>();

// Mounted under /me after its bearer-session middleware.
debugExport.get('/', async (c) => {
  const owner = c.get('owner');
  const dataset = c.req.query('dataset');
  if (!dataset) {
    const result = await c.env.DB.prepare(`SELECT 'contact' AS kind, id, history_revision AS revision, clearing
      FROM contact WHERE user_id = ?1 UNION ALL
      SELECT 'group' AS kind, g.id, g.history_revision AS revision, g.clearing
      FROM chat_group g JOIN group_member m ON m.group_id = g.id WHERE m.user_id = ?1
      ORDER BY kind, id`).bind(owner).all();
    if (result.results.some(row => row.clearing)) return c.json({ error: 'Chat cleanup is in progress. Try the export again shortly.' }, 409);
    return c.json({ schemaVersion: 1, accountId: owner, datasets: Object.keys(debugDatasets), scopes: result.results });
  }
  if (!Object.hasOwn(debugDatasets, dataset)) return c.json({ error: 'Unknown export dataset.' }, 400);
  const cursor = c.req.query('cursor') ?? '0';
  if (!/^\d{1,16}$/.test(cursor) || !Number.isSafeInteger(Number(cursor))) return c.json({ error: 'Invalid export cursor.' }, 400);
  const spec = debugDatasets[dataset]!;
  // Small pages also bound document/mini-app payloads. rowid keysets avoid OFFSET
  // skips when earlier rows are deleted. Authorization is rechecked on every page.
  const result = await c.env.DB.prepare(`SELECT r.rowid AS export_cursor, ${spec.columns}
    FROM ${spec.table} r WHERE (${spec.where}) AND r.rowid > ?2 ORDER BY r.rowid LIMIT 25`)
    .bind(owner, Number(cursor)).all<Record<string, unknown> & { export_cursor: number }>();
  const rows = result.results.map(({ export_cursor: _cursor, ...row }) => row);
  return c.json({ accountId: owner, rows, nextCursor: rows.length === 25 ? String(result.results.at(-1)!.export_cursor) : null });
});

export default debugExport;
