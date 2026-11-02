-- Proactive outreach (docs/initiative.md#welcome-messages and #re-engagement).
-- A new contact can introduce itself once, and a quiet private chat can receive a
-- bounded re-engagement episode without new human input.

-- Welcome: due time, at most three claims, cancelled by any message in the chat.
ALTER TABLE contact ADD COLUMN welcome_due_at INTEGER;
ALTER TABLE contact ADD COLUMN welcome_attempts INTEGER NOT NULL DEFAULT 0
  CHECK (welcome_attempts BETWEEN 0 AND 3);
-- Last time the re-engagement sweep opened (or skipped) an episode for this chat.
-- It limits evaluations to about one per day even when the model stays silent.
ALTER TABLE contact ADD COLUMN reengaged_at INTEGER;
-- Re-engagement episodes are ambient rows with their own expiry instead of the
-- seven-day horizon of their (possibly older) source turn.
ALTER TABLE conversation_initiative ADD COLUMN reengage INTEGER NOT NULL DEFAULT 0
  CHECK (reengage IN (0, 1));
CREATE INDEX contact_welcome_due ON contact(welcome_due_at) WHERE welcome_due_at IS NOT NULL;

-- Any message in the chat, including the person writing first, cancels a pending welcome.
CREATE TRIGGER welcome_cancel_on_turn AFTER INSERT ON chat_turn
BEGIN
  UPDATE contact SET welcome_due_at = NULL WHERE id = NEW.contact_id AND welcome_due_at IS NOT NULL;
END;
CREATE TRIGGER welcome_cancel_on_setting AFTER UPDATE OF initiative_enabled ON contact
WHEN NEW.initiative_enabled = 0 AND NEW.welcome_due_at IS NOT NULL
BEGIN
  UPDATE contact SET welcome_due_at = NULL WHERE id = NEW.id;
END;
CREATE TRIGGER welcome_cancel_on_archive AFTER UPDATE OF archived_at ON contact
WHEN NEW.archived_at IS NOT NULL AND NEW.welcome_due_at IS NOT NULL
BEGIN
  UPDATE contact SET welcome_due_at = NULL WHERE id = NEW.id;
END;
