-- Learning stays inside one participant's private conversation and its history.
ALTER TABLE contact ADD COLUMN initiative_paused INTEGER NOT NULL DEFAULT 0 CHECK (initiative_paused IN (0,1));
ALTER TABLE conversation_initiative ADD COLUMN mode TEXT NOT NULL DEFAULT 'continuation' CHECK (mode IN ('continuation','ambient'));
ALTER TABLE chat_turn ADD COLUMN initiative_kind TEXT CHECK (initiative_kind IN ('continuation','greeting','check-in'));
ALTER TABLE chat_turn ADD COLUMN initiative_engagement TEXT CHECK (initiative_engagement IN ('social','practical','boundary','uncertain'));
ALTER TABLE chat_turn ADD COLUMN initiative_response TEXT CHECK (initiative_response IN ('engaged','unrelated','uncertain','none'));
ALTER TABLE chat_turn ADD COLUMN initiative_response_to_id TEXT REFERENCES chat_turn(id) ON DELETE SET NULL;
ALTER TABLE chat_turn ADD COLUMN initiative_feedback_at INTEGER;

-- A setting change resets an explicit conversational pause. Re-enabling still
-- waits for the next human exchange; it does not restart an old episode.
DROP TRIGGER initiative_setting;
CREATE TRIGGER initiative_setting AFTER UPDATE OF initiative_enabled ON contact
WHEN NEW.initiative_enabled != OLD.initiative_enabled
BEGIN
  DELETE FROM conversation_initiative WHERE contact_id = NEW.id;
  UPDATE contact SET initiative_paused = 0 WHERE id = NEW.id;
END;

CREATE TRIGGER initiative_archived AFTER UPDATE OF archived_at ON contact
WHEN NEW.archived_at IS NOT NULL
BEGIN
  DELETE FROM conversation_initiative WHERE contact_id = NEW.id;
END;
DELETE FROM conversation_initiative WHERE contact_id IN (SELECT id FROM contact WHERE archived_at IS NOT NULL);

-- Invalidate in-flight drafts without changing due dates, counters or stopped
-- plans. Old workflows cannot publish with the new policy's revision.
UPDATE conversation_initiative SET revision = revision + 1;
