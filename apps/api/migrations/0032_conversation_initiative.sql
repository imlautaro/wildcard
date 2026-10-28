-- Initiative is private to each participant, even when the agent is shared.
ALTER TABLE contact ADD COLUMN initiative_enabled INTEGER NOT NULL DEFAULT 1 CHECK (initiative_enabled IN (0,1));
ALTER TABLE contact ADD COLUMN last_reply_read_at INTEGER;
ALTER TABLE chat_turn ADD COLUMN initiative_source_id TEXT REFERENCES chat_turn(id) ON DELETE SET NULL;
CREATE TABLE conversation_initiative (
  contact_id TEXT PRIMARY KEY REFERENCES contact(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES chat_turn(id) ON DELETE CASCADE,
  anchor_id TEXT NOT NULL REFERENCES chat_turn(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0,
  evaluations INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER,
  expires_at INTEGER NOT NULL,
  intent TEXT NOT NULL DEFAULT '',
  CHECK (evaluations BETWEEN 0 AND 6),
  CHECK (sent BETWEEN 0 AND 3)
);
CREATE INDEX initiative_due_idx ON conversation_initiative(next_at) WHERE next_at IS NOT NULL;
CREATE INDEX initiative_budget_idx ON chat_turn(user_id, updated_at) WHERE initiative_source_id IS NOT NULL;
-- New human input invalidates any old draft immediately, including during inference.
CREATE TRIGGER initiative_human_input AFTER INSERT ON chat_turn
WHEN NEW.user_text != '' OR NEW.attachment_json IS NOT NULL
BEGIN
  DELETE FROM conversation_initiative WHERE contact_id = NEW.contact_id;
END;
-- Start only after a real human reply completes. No backfill of old conversations.
CREATE TRIGGER initiative_after_reply AFTER UPDATE OF status ON chat_turn
WHEN NEW.status = 'complete' AND OLD.status != 'complete'
  AND NEW.assistant_text IS NOT NULL AND NEW.schedule_id IS NULL AND NEW.group_request_id IS NULL
  AND NEW.initiative_source_id IS NULL AND (NEW.user_text != '' OR NEW.attachment_json IS NOT NULL)
  AND EXISTS (SELECT 1 FROM contact WHERE id = NEW.contact_id AND initiative_enabled = 1)
  AND NOT EXISTS (SELECT 1 FROM chat_turn WHERE contact_id = NEW.contact_id AND sequence > NEW.sequence)
BEGIN
  INSERT OR REPLACE INTO conversation_initiative
    (contact_id, source_id, anchor_id, next_at, expires_at)
    VALUES (NEW.contact_id, NEW.id, NEW.id, NEW.updated_at + 120000, NEW.updated_at + 86400000);
END;
-- Toggling never resurrects a previous episode; next human reply starts fresh.
CREATE TRIGGER initiative_setting AFTER UPDATE OF initiative_enabled ON contact
WHEN NEW.initiative_enabled != OLD.initiative_enabled
BEGIN
  DELETE FROM conversation_initiative WHERE contact_id = NEW.id;
END;
