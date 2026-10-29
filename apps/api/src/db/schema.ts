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
  chatModel: text('chat_model').notNull().default('muse-spark-1.3'),
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
  initiativeEnabled: integer('initiative_enabled', { mode: 'boolean' }).notNull().default(true),
  lastReplyReadAt: date('last_reply_read_at'),
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
  typingContactId: text('typing_contact_id').references(() => contact.id, { onDelete: 'set null' }),
}, (table) => [index('agent_presence_expiry_idx').on(table.expiresAt),
  check('agent_presence_status', sql`${table.status} IN ('offline', 'online', 'typing')`)]);

export const chatTurn = sqliteTable('chat_turn', {
  toolsStarted: integer('tools_started', { mode: 'boolean' }).notNull().default(false),
  initiativeSourceId: text('initiative_source_id').references((): AnySQLiteColumn => chatTurn.id, { onDelete: 'set null' }),
  readAt: date('read_at'),
  timeZone: text('time_zone'),
  scheduleId: text('schedule_id').references((): AnySQLiteColumn => contactSchedule.id),
  scheduleRevision: integer('schedule_revision'),
  scheduledAt: date('scheduled_at'),
  scheduleInstruction: text('schedule_instruction'),
  nativeContextJson: text('native_context_json'),
  groupRequestId: text('group_request_id').references((): AnySQLiteColumn => groupRequest.id, { onDelete: 'cascade' }),
  taskId: text('task_id').references((): AnySQLiteColumn => task.id, { onDelete: 'set null' }),
  // A private message a contact sent from this group (migration 0051).
  originGroupId: text('origin_group_id').references((): AnySQLiteColumn => chatGroup.id, { onDelete: 'set null' }),
  replyToId: text('reply_to_id').references((): AnySQLiteColumn => chatTurn.id, { onDelete: 'set null' }),
  replyToSide: text('reply_to_side'),
  sequence: integer('sequence').primaryKey({ autoIncrement: true }),
  id: text('id').notNull().unique(),
  contactId: text('contact_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  userText: text('user_text').notNull(),
  assistantText: text('assistant_text'),
  assistantMessagesJson: text('assistant_messages_json'),
  status: text('status', { enum: ['queued', 'running', 'complete', 'failed'] }).notNull(),
  attempt: integer('attempt').notNull().default(1),
  workflowId: text('workflow_id').notNull().unique(),
  errorCode: text('error_code'),
  createdAt: date('created_at').notNull(),
  updatedAt: date('updated_at').notNull(),
  checkedAt: integer('checked_at').notNull().default(0),
}, (table) => [
  foreignKey({ columns: [table.contactId, table.userId], foreignColumns: [contact.id, contact.userId] }).onDelete('cascade'),
  check('chat_tools_started', sql`${table.toolsStarted} IN (0, 1)`),
  check('chat_status', sql`${table.status} IN ('queued', 'running', 'complete', 'failed')`),
  check('chat_attempt', sql`${table.attempt} > 0`),
  check('chat_completed_reply', sql`${table.status} != 'complete' OR ${table.assistantText} IS NOT NULL`),
  check('chat_reply_side', sql`${table.replyToSide} IN ('user', 'assistant')`),
  index('chat_active_turn_idx').on(table.contactId, table.sequence).where(sql`${table.status} IN ('queued', 'running')`),
  index('chat_contact_sequence_idx').on(table.contactId, desc(table.sequence)),
  uniqueIndex('chat_schedule_occurrence_idx').on(table.scheduleId, table.scheduleRevision, table.scheduledAt).where(sql`${table.scheduleId} IS NOT NULL`),
  index('chat_schedule_idx').on(table.scheduleId),
  uniqueIndex('chat_group_request_idx').on(table.groupRequestId).where(sql`${table.groupRequestId} IS NOT NULL`),
  index('chat_recovery_idx').on(table.status, table.checkedAt),
  index('chat_user_status_idx').on(table.userId, table.status),
  index('initiative_budget_idx').on(table.userId, table.updatedAt).where(sql`${table.initiativeSourceId} IS NOT NULL`),
  index('group_private_message_budget_idx').on(table.userId, table.updatedAt).where(sql`${table.originGroupId} IS NOT NULL`),
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
  typingAt: date('typing_at'),
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
  taskId: text('task_id').references((): AnySQLiteColumn => task.id, { onDelete: 'set null' }),
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

export const groupLocalMemory = sqliteTable('group_local_memory', {
  groupId: text('group_id').notNull().references(() => chatGroup.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').notNull().references(() => contactAgent.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  memoryKey: text('memory_key').notNull(),
  kind: text('kind').notNull(),
  content: text('content').notNull(),
  sourceId: text('source_id').notNull().references(() => groupMessage.id, { onDelete: 'cascade' }),
  sourceQuote: text('source_quote').notNull(),
  updatedAt: date('updated_at').notNull(),
}, (t) => [primaryKey({ columns: [t.groupId, t.agentId, t.userId, t.memoryKey] }), index('group_local_memory_source').on(t.sourceId),
  check('group_local_memory_key_length', sql`length(${t.memoryKey}) BETWEEN 1 AND 80`),
  check('group_local_memory_kind', sql`${t.kind} IN ('fact', 'preference', 'decision', 'pending')`),
  check('group_local_memory_content_length', sql`length(${t.content}) BETWEEN 1 AND 300`),
  check('group_local_memory_quote_length', sql`length(${t.sourceQuote}) BETWEEN 1 AND 240`)]);

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

export const agentLocalMemory = sqliteTable('agent_local_memory', {
  agentId: text('agent_id').notNull().references(() => contactAgent.id, { onDelete: 'cascade' }),
  scopeKey: text('scope_key').notNull(),
  memoryKey: text('memory_key').notNull(),
  kind: text('kind').notNull(),
  content: text('content').notNull(),
  sourceEventSequence: integer('source_event_sequence').notNull().references(() => agentMemoryEvent.sequence, { onDelete: 'cascade' }),
  sourceQuote: text('source_quote').notNull(),
  updatedAt: date('updated_at').notNull(),
}, (t) => [primaryKey({ columns: [t.agentId, t.scopeKey, t.memoryKey] }), index('agent_local_memory_source').on(t.sourceEventSequence),
  check('agent_local_memory_scope', sql`${t.scopeKey} LIKE 'private:%' OR ${t.scopeKey} LIKE 'group:%'`),
  check('agent_local_memory_key_length', sql`length(${t.memoryKey}) BETWEEN 1 AND 80`),
  check('agent_local_memory_kind', sql`${t.kind} IN ('fact', 'preference', 'decision', 'pending')`),
  check('agent_local_memory_content_length', sql`length(${t.content}) BETWEEN 1 AND 300`),
  check('agent_local_memory_quote_length', sql`length(${t.sourceQuote}) BETWEEN 1 AND 240`)]);

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

export const mcpPrivateContact = sqliteTable('mcp_private_contact', {
  contactId: text('contact_id').primaryKey().references(() => contact.id, { onDelete: 'cascade' }),
});
export const mcpConnector = sqliteTable('mcp_connector', {
  id: text('id').primaryKey(),
  credentialScope: text('credential_scope').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), url: text('url').notNull(), credential: text('credential'),
  authType: text('auth_type').notNull().default('none'),
  toolsJson: text('tools_json').notNull().default('[]'), createdAt: integer('created_at').notNull(),
}, t => [index('mcp_connector_owner').on(t.userId, t.createdAt)]);
export const mcpExecution = sqliteTable('mcp_execution', {
  turnId: text('turn_id').notNull().references(() => chatTurn.id, { onDelete: 'cascade' }),
  slot: integer('slot').notNull(), connectionId: text('connection_id').notNull(),
  toolName: text('tool_name').notNull(), argumentsJson: text('arguments_json').notNull(), resultJson: text('result_json'),
  uncertain: integer('uncertain').notNull().default(1), authGeneration: text('auth_generation'),
}, t => [primaryKey({ columns: [t.turnId, t.slot] }), uniqueIndex('mcp_execution_action').on(t.turnId, t.connectionId, t.toolName, t.argumentsJson)]);

export const mcpOAuth = sqliteTable('mcp_oauth', {
  connectionId: text('connection_id').primaryKey().references(() => mcpConnector.id, { onDelete: 'cascade' }),
  configJson: text('config_json').notNull(), tokensJson: text('tokens_json'), expiresAt: integer('expires_at'),
  generation: text('generation').notNull(), refreshLock: text('refresh_lock'), lockedUntil: integer('locked_until'),
});
export const mcpOAuthFlow = sqliteTable('mcp_oauth_flow', {
  id: text('id').primaryKey(), connectionId: text('connection_id').notNull().unique().references(() => mcpConnector.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').notNull().references(() => session.id, { onDelete: 'cascade' }),
  generation: text('generation').notNull(), launchHash: text('launch_hash').unique(), stateHash: text('state_hash').notNull().unique(),
  browserHash: text('browser_hash'), proofHash: text('proof_hash'), payloadJson: text('payload_json').notNull(), expiresAt: integer('expires_at').notNull(),
}, t => [index('mcp_oauth_flow_expiry').on(t.expiresAt)]);

export const mcpContactAccess = sqliteTable('mcp_contact_access', {
  contactId: text('contact_id').notNull().references(() => contact.id, { onDelete: 'cascade' }),
  connectionId: text('connection_id').notNull().references(() => mcpConnector.id, { onDelete: 'cascade' }),
  generation: text('generation').notNull(),
}, t => [primaryKey({ columns: [t.contactId, t.connectionId] })]);
export const mcpGroupAccess = sqliteTable('mcp_group_access', {
  groupId: text('group_id').notNull(), agentId: text('agent_id').notNull(),
  connectionId: text('connection_id').notNull().references(() => mcpConnector.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }), generation: text('generation').notNull(),
}, t => [primaryKey({ columns: [t.groupId, t.agentId, t.connectionId] }),
  foreignKey({ columns: [t.groupId, t.agentId], foreignColumns: [groupAgent.groupId, groupAgent.agentId] }).onDelete('cascade')]);
export const mcpPrivateGroup = sqliteTable('mcp_private_group', {
  groupId: text('group_id').primaryKey().references(() => chatGroup.id, { onDelete: 'cascade' }),
});
export const mcpGroupExecution = sqliteTable('mcp_group_execution', {
  turnId: text('turn_id').notNull().references(() => groupReply.id, { onDelete: 'cascade' }),
  slot: integer('slot').notNull(), connectionId: text('connection_id').notNull(), toolName: text('tool_name').notNull(),
  argumentsJson: text('arguments_json').notNull(), resultJson: text('result_json'), uncertain: integer('uncertain').notNull().default(1),
  authGeneration: text('auth_generation'), accessGeneration: text('access_generation').notNull(),
}, t => [primaryKey({ columns: [t.turnId, t.slot] }), uniqueIndex('mcp_group_execution_action').on(t.turnId, t.connectionId, t.toolName, t.argumentsJson)]);

export const nativeRemoteDevice = sqliteTable('native_remote_device', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  installationId: text('installation_id').notNull(), pushDeviceId: text('push_device_id').notNull().references(() => pushDevice.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), updatedAt: date('updated_at').notNull(),
}, t => [uniqueIndex('native_remote_installation').on(t.userId, t.installationId)]);
export const nativeRemoteGrant = sqliteTable('native_remote_grant', {
  deviceId: text('device_id').notNull().references(() => nativeRemoteDevice.id, { onDelete: 'cascade' }),
  contactId: text('contact_id').notNull().references(() => contact.id, { onDelete: 'cascade' }), createdAt: date('created_at').notNull(),
  kindsJson: text('kinds_json').notNull().default('["timer","alarm"]'),
}, t => [primaryKey({ columns: [t.deviceId, t.contactId] })]);

// Device action proposals remain separate from model execution and private memory.
export const nativeAction = sqliteTable('native_action', {
  id: text('id').primaryKey(),
  turnId: text('turn_id').notNull().references(() => chatTurn.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), payloadJson: text('payload_json').notNull(),
  remoteDeviceId: text('remote_device_id'),
  remoteNonce: text('remote_nonce'), fireAt: date('fire_at'), pushAttempts: integer('push_attempts').notNull().default(0), pushNextAt: date('push_next_at'),
  status: text('status').notNull().default('pending'), executionId: text('execution_id'),
  createdAt: date('created_at').notNull(), updatedAt: date('updated_at').notNull(), expiresAt: date('expires_at').notNull(),
}, t => [uniqueIndex('native_action_kind').on(t.turnId, t.kind), index('native_action_turn').on(t.turnId, t.createdAt),
  index('native_action_remote_pending').on(t.status, t.pushNextAt).where(sql`${t.remoteDeviceId} IS NOT NULL`)]);

// Mini app specs and grants; resolved connector data is never stored (migration 0037).
// A row belongs to one private chat (contact + user) or to a group (migration 0050).
export const miniApp = sqliteTable('mini_app', {
  id: text('id').primaryKey(),
  contactId: text('contact_id').references(() => contact.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
  groupId: text('group_id').references(() => chatGroup.id, { onDelete: 'cascade' }),
  replyId: text('reply_id').references(() => groupReply.id, { onDelete: 'set null' }),
  agentId: text('agent_id').references(() => contactAgent.id, { onDelete: 'set null' }),
  turnId: text('turn_id').references(() => chatTurn.id, { onDelete: 'set null' }),
  revision: integer('revision').notNull().default(1), title: text('title').notNull(),
  specJson: text('spec_json').notNull(), toolsJson: text('tools_json').notNull(),
  approvedRevision: integer('approved_revision'), lastError: text('last_error'),
  createdAt: date('created_at').notNull(), updatedAt: date('updated_at').notNull(),
}, t => [check('mini_app_revision', sql`${t.revision} >= 1`), index('mini_app_contact').on(t.contactId, t.userId, t.updatedAt),
  index('mini_app_group').on(t.groupId, t.updatedAt).where(sql`${t.groupId} IS NOT NULL`),
  check('mini_app_owner', sql`(${t.groupId} IS NULL AND ${t.contactId} IS NOT NULL AND ${t.userId} IS NOT NULL)
    OR (${t.groupId} IS NOT NULL AND ${t.contactId} IS NULL AND ${t.userId} IS NULL AND ${t.toolsJson} = '[]')`)]);
export const miniAppAction = sqliteTable('mini_app_action', {
  id: text('id').primaryKey(),
  appId: text('app_id').notNull().references(() => miniApp.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull(), actionId: text('action_id').notNull(), argumentsJson: text('arguments_json').notNull(),
  status: text('status').notNull(), createdAt: date('created_at').notNull(), updatedAt: date('updated_at').notNull(),
}, t => [check('mini_app_action_status', sql`${t.status} IN ('running', 'completed', 'failed', 'unknown')`), index('mini_app_action_app').on(t.appId, t.createdAt)]);

// Saved values for local mini app actions (migration 0038).
export const miniAppState = sqliteTable('mini_app_state', {
  appId: text('app_id').primaryKey().references(() => miniApp.id, { onDelete: 'cascade' }),
  valuesJson: text('values_json').notNull(), version: integer('version').notNull().default(0),
  lastExecution: text('last_execution'), updatedAt: date('updated_at').notNull(),
});

// Episode creation/invalidation triggers live in migration 0032.
export const conversationInitiative = sqliteTable('conversation_initiative', {
  contactId: text('contact_id').primaryKey().references(() => contact.id, { onDelete: 'cascade' }),
  sourceId: text('source_id').notNull().references(() => chatTurn.id, { onDelete: 'cascade' }),
  anchorId: text('anchor_id').notNull().references(() => chatTurn.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull().default(0),
  evaluations: integer('evaluations').notNull().default(0),
  sent: integer('sent').notNull().default(0),
  nextAt: date('next_at'),
  expiresAt: date('expires_at').notNull(),
  intent: text('intent').notNull().default(''),
}, table => [
  check('initiative_evaluations', sql`${table.evaluations} BETWEEN 0 AND 6`),
  check('initiative_sent', sql`${table.sent} BETWEEN 0 AND 3`),
  index('initiative_due_idx').on(table.nextAt).where(sql`${table.nextAt} IS NOT NULL`),
]);

export const agentPersonality = sqliteTable('agent_personality', {
  agentId: text('agent_id').primaryKey().references(() => contactAgent.id, { onDelete: 'cascade' }),
  profileJson: text('profile_json').notNull(),
  revision: integer('revision').notNull().default(1),
  updatedAt: date('updated_at').notNull(),
}, table => [check('personality_profile_json', sql`json_valid(${table.profileJson})`),
  check('personality_revision', sql`${table.revision} > 0`)]);

export const personalityEvent = sqliteTable('personality_event', {
  agentId: text('agent_id').notNull().references(() => contactAgent.id, { onDelete: 'cascade' }),
  sourceId: text('source_id').notNull(),
  contactId: text('contact_id').references(() => contact.id, { onDelete: 'cascade' }),
  groupId: text('group_id').references(() => chatGroup.id, { onDelete: 'cascade' }),
  privateTurnId: text('private_turn_id').references(() => chatTurn.id, { onDelete: 'cascade' }),
  groupReplyId: text('group_reply_id').references(() => groupReply.id, { onDelete: 'cascade' }),
  speakerId: text('speaker_id').notNull(),
  profileRevision: integer('profile_revision').notNull(),
  appraisalJson: text('appraisal_json').notNull(),
  createdAt: date('created_at').notNull(),
  contributor: integer('contributor', { mode: 'boolean' }).notNull(),
}, table => [primaryKey({ columns: [table.agentId, table.sourceId] }),
  index('personality_private_idx').on(table.agentId, table.contactId, desc(table.createdAt)),
  index('personality_group_idx').on(table.agentId, table.groupId, desc(table.createdAt)),
  index('personality_expiry_idx').on(table.createdAt),
  index('personality_relationship_idx').on(table.agentId, table.speakerId, desc(table.createdAt), table.sourceId),
  check('personality_event_json', sql`json_valid(${table.appraisalJson})`),
  check('personality_event_contributor', sql`${table.contributor} IN (0, 1)`),
  check('personality_event_scope', sql`(${table.contactId} IS NOT NULL AND ${table.privateTurnId} IS NOT NULL AND ${table.groupId} IS NULL AND ${table.groupReplyId} IS NULL)
    OR (${table.groupId} IS NOT NULL AND ${table.groupReplyId} IS NOT NULL AND ${table.contactId} IS NULL AND ${table.privateTurnId} IS NULL)`),
]);

export const generatedChatImage = sqliteTable('generated_chat_image', {
  id: text('id').primaryKey(),
  chatTurnId: text('chat_turn_id').unique().references(() => chatTurn.id, { onDelete: 'cascade' }),
  groupReplyId: text('group_reply_id').unique().references(() => groupReply.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['pending', 'complete', 'failed'] }).notNull(),
  attachmentJson: text('attachment_json'),
  referencesJson: text('references_json').notNull().default('[]'),
  createdAt: date('created_at').notNull(),
}, table => [
  check('generated_image_scope', sql`(${table.chatTurnId} IS NULL) != (${table.groupReplyId} IS NULL)`),
  check('generated_image_status', sql`${table.status} IN ('pending', 'complete', 'failed')`),
  check('generated_image_complete', sql`${table.status} != 'complete' OR ${table.attachmentJson} IS NOT NULL`),
]);

export const taskList = sqliteTable('task_list', {
  id: text('id').primaryKey(),
  groupId: text('group_id').references(() => chatGroup.id, { onDelete: 'cascade' }),
  contactId: text('contact_id').references(() => contact.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(), status: text('status').notNull().default('active'),
  createdByKind: text('created_by_kind').notNull(), createdById: text('created_by_id').notNull(),
  createdAt: date('created_at').notNull(), updatedAt: date('updated_at').notNull(),
}, t => [check('task_list_title', sql`length(${t.title}) BETWEEN 1 AND 200`), check('task_list_status', sql`${t.status} IN ('active', 'canceled')`),
  check('task_list_creator', sql`${t.createdByKind} IN ('user', 'agent')`),
  check('task_list_scope', sql`(${t.groupId} IS NULL) = (${t.contactId} IS NOT NULL) AND (${t.contactId} IS NULL) = (${t.userId} IS NULL)`),
  index('task_list_contact').on(t.contactId, t.userId, t.updatedAt), index('task_list_group').on(t.groupId, t.updatedAt)]);
export const task = sqliteTable('task', {
  id: text('id').primaryKey(),
  listId: text('list_id').notNull().references(() => taskList.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(), title: text('title').notNull(), notes: text('notes'),
  status: text('status').notNull().default('open'), assigneeKind: text('assignee_kind'), assigneeId: text('assignee_id'), result: text('result'),
  createdByKind: text('created_by_kind').notNull(), createdById: text('created_by_id').notNull(), version: integer('version').notNull().default(1),
  createdAt: date('created_at').notNull(), updatedAt: date('updated_at').notNull(), completedAt: date('completed_at'),
  workDueAt: date('work_due_at'), workReason: text('work_reason'), workCount: integer('work_count').notNull().default(0),
  workState: text('work_state').notNull().default('active'), nextStep: text('next_step'), evidence: text('evidence'), blockedReason: text('blocked_reason'),
  workGeneration: integer('work_generation').notNull().default(0), mutationToken: text('mutation_token'),
  researchQuery: text('research_query'), researchUserId: text('research_user_id').references(() => user.id, { onDelete: 'set null' }),
  researchCount: integer('research_count').notNull().default(0),
}, t => [check('task_title', sql`length(${t.title}) BETWEEN 1 AND 300`), check('task_notes', sql`${t.notes} IS NULL OR length(${t.notes}) <= 2000`),
  check('task_status', sql`${t.status} IN ('open', 'in_progress', 'done', 'canceled')`),
  check('task_assignee_kind', sql`${t.assigneeKind} IN ('user', 'agent')`), check('task_result', sql`${t.result} IS NULL OR length(${t.result}) <= 2000`),
  check('task_creator', sql`${t.createdByKind} IN ('user', 'agent')`),
  check('task_work_reason', sql`${t.workReason} IS NULL OR ${t.workReason} IN ('assigned', 'unblocked', 'review')`),
  check('task_research_query', sql`${t.researchQuery} IS NULL OR length(${t.researchQuery}) BETWEEN 1 AND 600`),
  check('task_research_count', sql`${t.researchCount} BETWEEN 0 AND 1`),
  check('task_work_state', sql`${t.workState} IN ('active', 'paused', 'blocked')`),
  check('task_next_step', sql`${t.nextStep} IS NULL OR length(${t.nextStep}) <= 2000`),
  check('task_evidence', sql`${t.evidence} IS NULL OR length(${t.evidence}) <= 2000`),
  check('task_blocked_reason', sql`${t.blockedReason} IS NULL OR length(${t.blockedReason}) <= 2000`),
  check('task_assignee', sql`(${t.assigneeKind} IS NULL) = (${t.assigneeId} IS NULL)`),
  index('task_list_position').on(t.listId, t.position), index('task_work_due').on(t.workDueAt).where(sql`${t.workDueAt} IS NOT NULL`),
  index('task_assignee').on(t.assigneeKind, t.assigneeId, t.status)]);
export const taskDependency = sqliteTable('task_dependency', {
  taskId: text('task_id').notNull().references(() => task.id, { onDelete: 'cascade' }),
  blockedById: text('blocked_by_id').notNull().references(() => task.id, { onDelete: 'cascade' }),
}, t => [primaryKey({ columns: [t.taskId, t.blockedById] }), check('task_dependency_self', sql`${t.taskId} != ${t.blockedById}`),
  index('task_dependency_blocker').on(t.blockedById)]);
export const taskMutation = sqliteTable('task_mutation', {
  id: text('id').primaryKey(), resultJson: text('result_json').notNull(), createdAt: date('created_at').notNull(),
});
export const taskWork = sqliteTable('task_work', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => task.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').notNull().references(() => contactAgent.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull(), createdAt: date('created_at').notNull(),
  generation: integer('generation').notNull().default(0),
}, t => [index('task_work_agent').on(t.agentId, t.createdAt)]);
export const chatDocument = sqliteTable('chat_document', {
  id: text('id').primaryKey(),
  groupId: text('group_id').references(() => chatGroup.id, { onDelete: 'cascade' }),
  contactId: text('contact_id').references(() => contact.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(), body: text('body').notNull(), revision: integer('revision').notNull().default(1), sourceId: text('source_id'),
  createdByKind: text('created_by_kind').notNull(), createdById: text('created_by_id').notNull(),
  updatedByKind: text('updated_by_kind').notNull(), updatedById: text('updated_by_id').notNull(),
  createdAt: date('created_at').notNull(), updatedAt: date('updated_at').notNull(),
}, t => [check('chat_document_title', sql`length(${t.title}) BETWEEN 1 AND 200`), check('chat_document_body', sql`length(${t.body}) <= 100000`),
  check('chat_document_revision', sql`${t.revision} >= 1`), check('chat_document_creator', sql`${t.createdByKind} IN ('user', 'agent')`),
  check('chat_document_updater', sql`${t.updatedByKind} IN ('user', 'agent')`),
  check('chat_document_scope', sql`(${t.groupId} IS NULL) = (${t.contactId} IS NOT NULL) AND (${t.contactId} IS NULL) = (${t.userId} IS NULL)`),
  index('chat_document_contact').on(t.contactId, t.userId, t.updatedAt), index('chat_document_group').on(t.groupId, t.updatedAt)]);
export const chatDocumentRevision = sqliteTable('chat_document_revision', {
  documentId: text('document_id').notNull().references(() => chatDocument.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull(), title: text('title').notNull(), body: text('body').notNull(), summary: text('summary'),
  authorKind: text('author_kind').notNull(), authorId: text('author_id').notNull(), createdAt: date('created_at').notNull(),
}, t => [primaryKey({ columns: [t.documentId, t.revision] }), check('chat_document_summary', sql`${t.summary} IS NULL OR length(${t.summary}) <= 300`),
  check('chat_document_author', sql`${t.authorKind} IN ('user', 'agent')`)]);
export const documentMutation = sqliteTable('document_mutation', {
  id: text('id').primaryKey(), resultJson: text('result_json').notNull(), createdAt: date('created_at').notNull(),
});
