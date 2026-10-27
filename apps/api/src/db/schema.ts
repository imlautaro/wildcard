import { desc, sql } from 'drizzle-orm';
import { type AnySQLiteColumn, check, foreignKey, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const date = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  photoVersion: text('photo_version'),
  createdAt: date('created_at').notNull(),
  updatedAt: date('updated_at').notNull(),
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(),
  expiresAt: date('expires_at').notNull(),
  createdAt: date('created_at').notNull(),
  updatedAt: date('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, (table) => [index('session_user_id_idx').on(table.userId)]);

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: date('access_token_expires_at'),
  refreshTokenExpiresAt: date('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: date('created_at').notNull(),
  updatedAt: date('updated_at').notNull(),
}, (table) => [
  index('account_user_id_idx').on(table.userId),
  uniqueIndex('account_provider_id_idx').on(table.providerId, table.accountId),
]);

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: date('expires_at').notNull(),
  createdAt: date('created_at').notNull(),
  updatedAt: date('updated_at').notNull(),
}, (table) => [index('verification_identifier_idx').on(table.identifier)]);

export const contactAgent = sqliteTable('contact_agent', {
  energy: integer('energy').notNull().default(50),
  energyUpdatedAt: integer('energy_updated_at').notNull().default(0),
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  photoVersion: text('photo_version'),
  updatedAt: date('updated_at').notNull().default(sql`0`),
  memoryShared: integer('memory_shared', { mode: 'boolean' }).notNull().default(false),
}, (table) => [check('agent_energy_range', sql`${table.energy} BETWEEN 0 AND 50`), check('agent_memory_shared', sql`${table.memoryShared} IN (0, 1)`)]);

export const contact = sqliteTable('contact', {
  agentId: text('agent_id').references(() => contactAgent.id, { onDelete: 'cascade' }),
  contributorConsent: integer('contributor_consent', { mode: 'boolean' }).notNull().default(false),
  photoVersion: text('photo_version'),
  lastReadSequence: integer('last_read_sequence').notNull().default(0),
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: date('created_at').notNull(),
  updatedAt: date('updated_at').notNull(),
}, (table) => [
  index('contact_user_created_idx').on(table.userId, desc(table.createdAt), desc(table.id)),
  uniqueIndex('contact_id_user_idx').on(table.id, table.userId),
  uniqueIndex('contact_agent_user_idx').on(table.agentId, table.userId),
]);

export const contactInvite = sqliteTable('contact_invite', {
  recipientId: text('recipient_id').references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').primaryKey(),
  agentId: text('agent_id').notNull().references(() => contactAgent.id, { onDelete: 'cascade' }),
  expiresAt: date('expires_at').notNull(),
  acceptedBy: text('accepted_by').references(() => user.id, { onDelete: 'cascade' }),
  contributorConsent: integer('contributor_consent', { mode: 'boolean' }).notNull().default(false),
}, (table) => [
  index('contact_invite_agent_idx').on(table.agentId, table.expiresAt),
  index('contact_invite_inbox_idx').on(table.recipientId, table.expiresAt)
    .where(sql`${table.recipientId} IS NOT NULL AND ${table.acceptedBy} IS NULL`),
  uniqueIndex('contact_invite_pending_recipient_idx').on(table.agentId, table.recipientId)
    .where(sql`${table.recipientId} IS NOT NULL AND ${table.acceptedBy} IS NULL`),
]);

export const agentAttention = sqliteTable('agent_attention', {
  agentId: text('agent_id').primaryKey().references(() => contactAgent.id, { onDelete: 'cascade' }),
  turnId: text('turn_id').notNull().unique(),
  attempt: integer('attempt').notNull(),
  workflowId: text('workflow_id').notNull(),
  acquiredAt: date('acquired_at').notNull(),
  checkedAt: integer('checked_at').notNull().default(0),
}, (table) => [index('agent_attention_recovery_idx').on(table.checkedAt, table.acquiredAt)]);

export const agentPresence = sqliteTable('agent_presence', {
  agentId: text('agent_id').primaryKey().references(() => contactAgent.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['offline', 'online', 'typing'] }).notNull(),
  lastSeenAt: date('last_seen_at'),
  expiresAt: date('expires_at'),
}, (table) => [index('agent_presence_expiry_idx').on(table.expiresAt),
  check('agent_presence_status', sql`${table.status} IN ('offline', 'online', 'typing')`)]);

export const chatTurn = sqliteTable('chat_turn', {
  readAt: date('read_at'),
  timeZone: text('time_zone'),
  scheduleId: text('schedule_id').references((): AnySQLiteColumn => contactSchedule.id),
  scheduleRevision: integer('schedule_revision'),
  scheduledAt: date('scheduled_at'),
  scheduleInstruction: text('schedule_instruction'),
  groupRequestId: text('group_request_id').references((): AnySQLiteColumn => groupRequest.id, { onDelete: 'cascade' }),
  replyToId: text('reply_to_id').references((): AnySQLiteColumn => chatTurn.id, { onDelete: 'set null' }),
  replyToSide: text('reply_to_side'),
  sequence: integer('sequence').primaryKey({ autoIncrement: true }),
  id: text('id').notNull().unique(),
  contactId: text('contact_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  userText: text('user_text').notNull(),
  assistantText: text('assistant_text'),
  status: text('status', { enum: ['queued', 'running', 'complete', 'failed'] }).notNull(),
  attempt: integer('attempt').notNull().default(1),
  workflowId: text('workflow_id').notNull().unique(),
  errorCode: text('error_code'),
  createdAt: date('created_at').notNull(),
  updatedAt: date('updated_at').notNull(),
  checkedAt: integer('checked_at').notNull().default(0),
}, (table) => [
  foreignKey({ columns: [table.contactId, table.userId], foreignColumns: [contact.id, contact.userId] }).onDelete('cascade'),
  check('chat_status', sql`${table.status} IN ('queued', 'running', 'complete', 'failed')`),
  check('chat_attempt', sql`${table.attempt} > 0`),
  check('chat_completed_reply', sql`${table.status} != 'complete' OR ${table.assistantText} IS NOT NULL`),
  check('chat_reply_side', sql`${table.replyToSide} IN ('user', 'assistant')`),
  uniqueIndex('chat_one_active_turn_idx').on(table.contactId).where(sql`${table.status} IN ('queued', 'running')`),
  index('chat_contact_sequence_idx').on(table.contactId, desc(table.sequence)),
  uniqueIndex('chat_schedule_occurrence_idx').on(table.scheduleId, table.scheduleRevision, table.scheduledAt).where(sql`${table.scheduleId} IS NOT NULL`),
  index('chat_schedule_idx').on(table.scheduleId),
  uniqueIndex('chat_group_request_idx').on(table.groupRequestId).where(sql`${table.groupRequestId} IS NOT NULL`),
  index('chat_recovery_idx').on(table.status, table.checkedAt),
  index('chat_user_status_idx').on(table.userId, table.status),
  uniqueIndex('chat_turn_source_idx').on(table.id, table.contactId, table.userId),
]);

export const contactMemoryState = sqliteTable('contact_memory_state', {
  contactId: text('contact_id').primaryKey(),
  userId: text('user_id').notNull(),
  lastSequence: integer('last_sequence').notNull().default(0),
}, (table) => [
  foreignKey({ columns: [table.contactId, table.userId], foreignColumns: [contact.id, contact.userId] }).onDelete('cascade'),
  check('memory_cursor', sql`${table.lastSequence} >= 0`),
]);

export const contactMemory = sqliteTable('contact_memory', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contactId: text('contact_id').notNull(),
  userId: text('user_id').notNull(),
  memoryKey: text('memory_key').notNull(),
  kind: text('kind', { enum: ['fact', 'preference', 'decision', 'pending'] }).notNull(),
  content: text('content').notNull(),
  sourceTurnId: text('source_turn_id').notNull(),
  sourceQuote: text('source_quote').notNull(),
  sourceSequence: integer('source_sequence').notNull(),
  updatedAt: date('updated_at').notNull(),
}, (table) => [
  foreignKey({ columns: [table.contactId, table.userId], foreignColumns: [contact.id, contact.userId] }).onDelete('cascade'),
  foreignKey({ columns: [table.sourceTurnId, table.contactId, table.userId],
    foreignColumns: [chatTurn.id, chatTurn.contactId, chatTurn.userId] }).onDelete('cascade'),
  uniqueIndex('contact_memory_key_idx').on(table.contactId, table.userId, table.memoryKey),
  index('contact_memory_scope_idx').on(table.contactId, table.userId, desc(table.sourceSequence)),
  check('memory_key_length', sql`length(${table.memoryKey}) BETWEEN 1 AND 80`),
  check('memory_kind', sql`${table.kind} IN ('fact', 'preference', 'decision', 'pending')`),
  check('memory_content_length', sql`length(${table.content}) BETWEEN 1 AND 300`),
  check('memory_quote_length', sql`length(${table.sourceQuote}) BETWEEN 1 AND 240`),
]);

// chat_turn_search and its maintenance triggers are managed by SQL migrations.

export const pushDevice = sqliteTable('push_device', {
  id: text('id').primaryKey(),
  token: text('token').notNull(),
  environment: text('environment', { enum: ['development', 'production'] }).notNull(),
  sessionId: text('session_id').notNull().references(() => session.id, { onDelete: 'cascade' }),
  updatedAt: date('updated_at').notNull(),
}, (table) => [
  uniqueIndex('push_device_token_environment_idx').on(table.token, table.environment),
  index('push_device_session_idx').on(table.sessionId),
  check('push_environment', sql`${table.environment} IN ('development', 'production')`),
]);

export const pushDelivery = sqliteTable('push_delivery', {
  turnId: text('turn_id').notNull().references(() => chatTurn.id, { onDelete: 'cascade' }),
  deviceId: text('device_id').notNull().references(() => pushDevice.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').notNull().references(() => session.id, { onDelete: 'cascade' }),
  attempts: integer('attempts').notNull().default(0),
  nextAt: date('next_at').notNull(),
  expiresAt: date('expires_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.turnId, table.deviceId] }),
  index('push_delivery_next_idx').on(table.nextAt),
]);

// Presence triggers are maintained by the SQL migrations.
export const contactPresence = sqliteTable('contact_presence', {
  contactId: text('contact_id').primaryKey(),
  userId: text('user_id').notNull(),
  status: text('status', { enum: ['offline', 'online', 'typing'] }).notNull(),
  lastSeenAt: date('last_seen_at'),
  expiresAt: date('expires_at'),
}, (table) => [
  foreignKey({ columns: [table.contactId, table.userId], foreignColumns: [contact.id, contact.userId] }).onDelete('cascade'),
  check('presence_status', sql`${table.status} IN ('offline', 'online', 'typing')`),
  index('contact_presence_expiry_idx').on(table.expiresAt).where(sql`${table.expiresAt} IS NOT NULL`),
]);


// Activity triggers are maintained by the SQL migrations.
export const chatVisit = sqliteTable('chat_visit', {
  id: text('id').primaryKey(),
  contactId: text('contact_id').notNull(),
  userId: text('user_id').notNull(),
  readyAt: date('ready_at').notNull(),
  expiresAt: date('expires_at').notNull(),
  updatedAt: date('updated_at').notNull(),
  connected: integer('connected', { mode: 'boolean' }).notNull().default(false),
  closed: integer('closed', { mode: 'boolean' }).notNull().default(false),
}, (table) => [
  foreignKey({ columns: [table.contactId, table.userId], foreignColumns: [contact.id, contact.userId] }).onDelete('cascade'),
  index('chat_visit_expiry_idx').on(table.expiresAt),
  index('chat_visit_contact_idx').on(table.contactId, table.userId, table.expiresAt),
  index('chat_visit_user_idx').on(table.userId, table.expiresAt),
  check('visit_connected', sql`${table.connected} IN (0, 1)`),
  check('visit_closed', sql`${table.closed} IN (0, 1)`),
]);

export const contactSchedule = sqliteTable('contact_schedule', {
  id: text('id').primaryKey(),
  contactId: text('contact_id').notNull(),
  userId: text('user_id').notNull(),
  instruction: text('instruction').notNull(),
  timeZone: text('time_zone').notNull(),
  nextAt: date('next_at').notNull(),
  intervalSeconds: integer('interval_seconds'),
  status: text('status', { enum: ['active', 'completed', 'cancelled'] }).notNull().default('active'),
  revision: integer('revision').notNull().default(1),
  lastMutation: text('last_mutation').notNull(),
  createdAt: date('created_at').notNull(),
  updatedAt: date('updated_at').notNull(),
}, (table) => [
  foreignKey({ columns: [table.contactId, table.userId], foreignColumns: [contact.id, contact.userId] }).onDelete('cascade'),
  index('contact_schedule_due_idx').on(table.status, table.nextAt),
  index('contact_schedule_owner_idx').on(table.userId, table.status),
  index('contact_schedule_contact_idx').on(table.contactId, table.userId, table.createdAt),
  check('schedule_instruction_length', sql`length(${table.instruction}) BETWEEN 1 AND 1000`),
  check('schedule_interval', sql`${table.intervalSeconds} BETWEEN 600 AND 2592000`),
  check('schedule_status', sql`${table.status} IN ('active', 'completed', 'cancelled')`),
]);

export const scheduleMutation = sqliteTable('schedule_mutation', {
  id: text('id').primaryKey(),
  turnId: text('turn_id').notNull().references(() => chatTurn.id, { onDelete: 'cascade' }),
  request: text('request').notNull(),
  result: text('result'),
  createdAt: date('created_at').notNull(),
});

// Schedule cursor and cancellation triggers are maintained by SQL migrations.

export const chatGroup = sqliteTable('chat_group', {
  photoVersion: text('photo_version'),
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: date('created_at').notNull(),
}, (t) => [check('group_name_length', sql`length(${t.name}) BETWEEN 1 AND 100`)]);
export const groupMember = sqliteTable('group_member', {
  lastReadSequence: integer('last_read_sequence').notNull().default(0),
  groupId: text('group_id').notNull().references(() => chatGroup.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  canInvite: integer('can_invite').notNull().default(0),
  shareMemory: integer('share_memory').notNull(),
  contributorConsent: integer('contributor_consent').notNull().default(0),
  joinedAt: date('joined_at').notNull(),
}, (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index('group_member_user_idx').on(t.userId, t.groupId),
  check('group_read_sequence', sql`${t.lastReadSequence} >= 0`), check('group_can_invite', sql`${t.canInvite} IN (0, 1)`), check('group_share_memory', sql`${t.shareMemory} = 1`),
  check('group_contributor_consent', sql`${t.contributorConsent} IN (0, 1)`)]);
export const groupAgent = sqliteTable('group_agent', {
  groupId: text('group_id').notNull(),
  agentId: text('agent_id').notNull().references(() => contactAgent.id, { onDelete: 'cascade' }),
  addedBy: text('added_by').notNull(),
  joinedAt: date('joined_at').notNull(),
}, (t) => [primaryKey({ columns: [t.groupId, t.agentId] }),
  foreignKey({ columns: [t.groupId, t.addedBy], foreignColumns: [groupMember.groupId, groupMember.userId] }).onDelete('cascade')]);
export const groupInvite = sqliteTable('group_invite', {
  id: text('id').primaryKey(),
  groupId: text('group_id').notNull().references(() => chatGroup.id, { onDelete: 'cascade' }),
  senderId: text('sender_id').notNull(),
  recipientId: text('recipient_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  expiresAt: date('expires_at').notNull(),
}, (t) => [foreignKey({ columns: [t.groupId, t.senderId], foreignColumns: [groupMember.groupId, groupMember.userId] }).onDelete('cascade'),
  uniqueIndex('group_invite_recipient_unique').on(t.groupId, t.recipientId), index('group_invite_recipient_idx').on(t.recipientId, t.expiresAt)]);
export const groupMessage = sqliteTable('group_message', {
  exchangeId: text('exchange_id').references((): AnySQLiteColumn => groupMessage.id, { onDelete: 'set null' }),
  requesterId: text('requester_id').references(() => user.id, { onDelete: 'set null' }),
  receiptsTracked: integer('receipts_tracked').notNull().default(0),
  attachmentJSON: text('attachment_json'),
  requestId: text('request_id').references((): AnySQLiteColumn => groupRequest.id, { onDelete: 'set null' }),
  replyToId: text('reply_to_id').references((): AnySQLiteColumn => groupMessage.id, { onDelete: 'set null' }),
  sequence: integer('sequence').primaryKey({ autoIncrement: true }),
  id: text('id').notNull().unique(),
  groupId: text('group_id').notNull().references(() => chatGroup.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  agentId: text('agent_id').references(() => contactAgent.id, { onDelete: 'set null' }),
  senderName: text('sender_name').notNull(),
  contributorConsent: integer('contributor_consent').notNull().default(0),
  roundEnqueued: integer('round_enqueued').notNull().default(0),
  text: text('text').notNull(),
  createdAt: date('created_at').notNull(),
}, (t) => [index('group_message_exchange_idx').on(t.exchangeId, t.sequence), index('group_message_history_idx').on(t.groupId, desc(t.sequence)),
  uniqueIndex('group_message_request_idx').on(t.requestId).where(sql`${t.requestId} IS NOT NULL`),
  check('group_attachment_json', sql`${t.attachmentJSON} IS NULL OR json_valid(${t.attachmentJSON})`)]);
export const groupExchange = sqliteTable('group_exchange', {
  rootId: text('root_id').primaryKey().references(() => groupMessage.id, { onDelete: 'cascade' }),
  botMessages: integer('bot_messages').notNull().default(0),
}, (t) => [check('group_exchange_budget', sql`${t.botMessages} BETWEEN 0 AND 100`)]);

export const groupReply = sqliteTable('group_reply', {
  sequence: integer('sequence').primaryKey({ autoIncrement: true }),
  id: text('id').notNull().unique(),
  groupId: text('group_id').notNull(),
  agentId: text('agent_id').notNull(),
  sourceId: text('source_id').notNull().references(() => groupMessage.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('queued'),
  attempt: integer('attempt').notNull().default(1),
  workflowId: text('workflow_id').notNull().unique(),
  createdAt: date('created_at').notNull(),
}, (t) => [foreignKey({ columns: [t.groupId, t.agentId], foreignColumns: [groupAgent.groupId, groupAgent.agentId] }).onDelete('cascade'),
  uniqueIndex('group_reply_source_agent_idx').on(t.sourceId, t.agentId), index('group_reply_pending_idx').on(t.status, t.createdAt, t.sequence),
  check('group_reply_status', sql`${t.status} IN ('queued', 'running', 'complete', 'failed')`)]);
export const groupRequest = sqliteTable('group_request', {
  id: text('id').primaryKey(),
  sourceTurnId: text('source_turn_id').notNull().unique().references((): AnySQLiteColumn => chatTurn.id, { onDelete: 'cascade' }),
  groupId: text('group_id').references(() => chatGroup.id, { onDelete: 'set null' }),
  requesterId: text('requester_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  senderAgentId: text('sender_agent_id').notNull().references(() => contactAgent.id, { onDelete: 'cascade' }),
  targetAgentId: text('target_agent_id').references(() => contactAgent.id, { onDelete: 'set null' }),
  question: text('question').notNull(),
  status: text('status').notNull().default('waiting'),
  resultKind: text('result_kind'),
  createdAt: date('created_at').notNull(),
  expiresAt: date('expires_at').notNull(),
  checkedAt: date('checked_at').notNull().default(sql`0`),
}, (t) => [index('group_request_pending_idx').on(t.status, t.createdAt),
  index('group_request_recovery_idx').on(t.status, t.checkedAt, t.createdAt),
  index('group_request_group_idx').on(t.groupId, t.requesterId), index('group_request_requester_idx').on(t.requesterId, t.status),
  check('group_request_question', sql`length(${t.question}) BETWEEN 1 AND 1000`),
  check('group_request_status', sql`${t.status} IN ('waiting', 'queued', 'complete', 'cancelled')`),
  check('group_request_result', sql`${t.resultKind} IN ('answered', 'skipped', 'failed', 'expired')`),
  check('group_request_different_agents', sql`${t.senderAgentId} != ${t.targetAgentId}`),
  check('group_request_destination', sql`${t.status} = 'cancelled' OR (${t.groupId} IS NOT NULL AND ${t.targetAgentId} IS NOT NULL)`)]);
export const groupPost = sqliteTable('group_post', {
  id: text('id').primaryKey(),
  sourceTurnId: text('source_turn_id').notNull().unique().references(() => chatTurn.id, { onDelete: 'cascade' }),
  groupId: text('group_id').references(() => chatGroup.id, { onDelete: 'set null' }),
  requesterId: text('requester_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  senderAgentId: text('sender_agent_id').notNull().references(() => contactAgent.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  status: text('status').notNull().default('published'),
  createdAt: date('created_at').notNull(),
}, (t) => [index('group_post_group_idx').on(t.groupId, t.requesterId),
  check('group_post_text', sql`length(${t.text}) BETWEEN 1 AND 4000`),
  check('group_post_status', sql`${t.status} IN ('published', 'revoked')`),
  check('group_post_destination', sql`${t.status} = 'revoked' OR ${t.groupId} IS NOT NULL`)]);

export const groupMemory = sqliteTable('group_memory', {
  agentId: text('agent_id').notNull().references(() => contactAgent.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  memoryKey: text('memory_key').notNull(),
  kind: text('kind').notNull(),
  content: text('content').notNull(),
  sourceId: text('source_id').notNull().references(() => groupMessage.id, { onDelete: 'cascade' }),
  sourceQuote: text('source_quote').notNull(),
  updatedAt: date('updated_at').notNull(),
}, (t) => [primaryKey({ columns: [t.agentId, t.userId, t.memoryKey] }),
  check('group_memory_kind', sql`${t.kind} IN ('fact', 'preference', 'decision', 'pending')`),
  check('group_memory_content_length', sql`length(${t.content}) BETWEEN 1 AND 300`),
  check('group_memory_quote_length', sql`length(${t.sourceQuote}) BETWEEN 1 AND 240`)]);


// Initial read watermarks and transactional push fan-out are SQL-managed triggers.
export const groupPushDelivery = sqliteTable('group_push_delivery', {
  messageId: text('message_id').notNull().references(() => groupMessage.id, { onDelete: 'cascade' }),
  groupId: text('group_id').notNull(),
  userId: text('user_id').notNull(),
  deviceId: text('device_id').notNull().references(() => pushDevice.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').notNull().references(() => session.id, { onDelete: 'cascade' }),
  attempts: integer('attempts').notNull().default(0),
  nextAt: date('next_at').notNull(),
  expiresAt: date('expires_at').notNull(),
}, (t) => [primaryKey({ columns: [t.messageId, t.deviceId] }), index('group_push_delivery_next_idx').on(t.nextAt),
  foreignKey({ columns: [t.groupId, t.userId], foreignColumns: [groupMember.groupId, groupMember.userId] }).onDelete('cascade')]);

// SQL triggers enqueue saved replies and maintain group FTS independently of
// Workflow checkpoints. Search virtual tables/triggers live in migration 0019.
export const agentMemoryEvent = sqliteTable('agent_memory_event', {
  sequence: integer('sequence').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull().references(() => contactAgent.id, { onDelete: 'cascade' }),
  privateTurnId: text('private_turn_id').unique().references(() => chatTurn.id, { onDelete: 'cascade' }),
  groupMessageId: text('group_message_id').unique().references(() => groupMessage.id, { onDelete: 'cascade' }),
  processed: integer('processed').notNull().default(0),
}, (t) => [index('agent_memory_event_pending_idx').on(t.agentId, t.processed, t.sequence),
  check('agent_memory_event_processed', sql`${t.processed} IN (0, 1)`),
  check('agent_memory_event_source', sql`(${t.privateTurnId} IS NOT NULL) != (${t.groupMessageId} IS NOT NULL)`)]);
export const agentMemory = sqliteTable('agent_memory', {
  agentId: text('agent_id').notNull().references(() => contactAgent.id, { onDelete: 'cascade' }),
  memoryKey: text('memory_key').notNull(),
  kind: text('kind').notNull(),
  content: text('content').notNull(),
  sourceEventSequence: integer('source_event_sequence').notNull().references(() => agentMemoryEvent.sequence, { onDelete: 'cascade' }),
  sourceQuote: text('source_quote').notNull(),
  updatedAt: date('updated_at').notNull(),
}, (t) => [primaryKey({ columns: [t.agentId, t.memoryKey] }), index('agent_memory_source_idx').on(t.sourceEventSequence),
  check('agent_memory_key_length', sql`length(${t.memoryKey}) BETWEEN 1 AND 80`),
  check('agent_memory_kind', sql`${t.kind} IN ('fact', 'preference', 'decision', 'pending')`),
  check('agent_memory_content_length', sql`length(${t.content}) BETWEEN 1 AND 300`),
  check('agent_memory_quote_length', sql`length(${t.sourceQuote}) BETWEEN 1 AND 240`)]);

// Recipient membership is intentionally not a foreign key: leaving cannot promote a receipt.
export const groupMessageReceipt = sqliteTable('group_message_receipt', {
  messageId: text('message_id').notNull().references(() => groupMessage.id, { onDelete: 'cascade' }),
  recipientKind: text('recipient_kind').notNull(),
  recipientId: text('recipient_id').notNull(),
  deliveredAt: date('delivered_at'),
  readAt: date('read_at'),
}, (t) => [primaryKey({ columns: [t.messageId, t.recipientKind, t.recipientId] }),
  index('group_receipt_recipient_idx').on(t.recipientKind, t.recipientId, t.messageId),
  check('receipt_kind', sql`${t.recipientKind} IN ('user', 'agent')`),
  check('receipt_read_delivery', sql`${t.readAt} IS NULL OR ${t.deliveredAt} IS NOT NULL`)]);

export const messageReaction = sqliteTable('message_reaction', {
  turnId: text('turn_id').references(() => chatTurn.id, { onDelete: 'cascade' }),
  groupMessageId: text('group_message_id').references(() => groupMessage.id, { onDelete: 'cascade' }),
  side: text('side').notNull(),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').references(() => contactAgent.id, { onDelete: 'cascade' }),
  emoji: text('emoji').notNull(),
}, (t) => [
  uniqueIndex('reaction_identity').on(sql`COALESCE(${t.turnId}, ${t.groupMessageId})`, t.side,
    sql`COALESCE(${t.userId}, ${t.agentId})`, sql`(${t.userId} IS NOT NULL)`),
  index('reaction_turn').on(t.turnId), index('reaction_group_message').on(t.groupMessageId),
  check('reaction_side', sql`${t.side} IN ('user', 'assistant', 'group')`),
  check('reaction_emoji', sql`${t.emoji} IN ('👍', '❤️', '😂', '😮', '😢', '🙏')`),
  check('reaction_actor', sql`(${t.userId} IS NULL) != (${t.agentId} IS NULL)`),
  check('reaction_target', sql`(${t.turnId} IS NOT NULL AND ${t.groupMessageId} IS NULL AND ${t.side} IN ('user', 'assistant'))
    OR (${t.turnId} IS NULL AND ${t.groupMessageId} IS NOT NULL AND ${t.side} = 'group')`),
]);
