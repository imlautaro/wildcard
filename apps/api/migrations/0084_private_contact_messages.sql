-- Durable receipts survive recipient history/contact removal to prevent replay.
ALTER TABLE chat_turn ADD COLUMN is_private_relay INTEGER NOT NULL DEFAULT 0 CHECK (is_private_relay IN (0, 1));
CREATE TABLE private_contact_message (
  source_turn_id TEXT PRIMARY KEY NOT NULL REFERENCES chat_turn(id) ON DELETE CASCADE,
  source_contact_id TEXT REFERENCES contact(id) ON DELETE SET NULL,
  target_contact_id TEXT REFERENCES contact(id) ON DELETE SET NULL,
  target_turn_id TEXT UNIQUE REFERENCES chat_turn(id) ON DELETE SET NULL,
  contributor INTEGER NOT NULL CHECK (contributor IN (0, 1)),
  created_at INTEGER NOT NULL
);
CREATE INDEX private_contact_message_target_idx ON private_contact_message(target_contact_id, created_at);
CREATE INDEX private_contact_message_budget_idx ON private_contact_message(created_at);
CREATE INDEX private_contact_message_source_idx ON private_contact_message(source_contact_id, created_at);
