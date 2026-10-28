-- Keep the existing episode and anti-insistence limits; start new reviews sooner.
DROP TRIGGER initiative_after_reply;
CREATE TRIGGER initiative_after_reply AFTER UPDATE OF status ON chat_turn
WHEN NEW.status = 'complete' AND OLD.status != 'complete'
  AND NEW.assistant_text IS NOT NULL AND NEW.schedule_id IS NULL AND NEW.group_request_id IS NULL
  AND NEW.initiative_source_id IS NULL AND (NEW.user_text != '' OR NEW.attachment_json IS NOT NULL)
  AND EXISTS (SELECT 1 FROM contact WHERE id = NEW.contact_id AND initiative_enabled = 1)
  AND NOT EXISTS (SELECT 1 FROM chat_turn WHERE contact_id = NEW.contact_id AND sequence > NEW.sequence)
BEGIN
  INSERT OR REPLACE INTO conversation_initiative
    (contact_id, source_id, anchor_id, next_at, expires_at)
    VALUES (NEW.contact_id, NEW.id, NEW.id, NEW.updated_at + 30000, NEW.updated_at + 86400000);
END;

-- Only advance episodes that have never been evaluated. Preserve AI-selected waits,
-- stopped episodes, active Workflow leases, counters and all published messages.
UPDATE conversation_initiative SET next_at = MIN(next_at,
  (SELECT updated_at + 30000 FROM chat_turn WHERE id = conversation_initiative.anchor_id))
WHERE evaluations = 0 AND sent = 0 AND next_at IS NOT NULL;
