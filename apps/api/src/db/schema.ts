import { desc, sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const date = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
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

export const contact = sqliteTable('contact', {
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
]);

export const chatTurn = sqliteTable('chat_turn', {
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
  uniqueIndex('chat_one_active_turn_idx').on(table.contactId).where(sql`${table.status} IN ('queued', 'running')`),
  index('chat_contact_sequence_idx').on(table.contactId, desc(table.sequence)),
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
