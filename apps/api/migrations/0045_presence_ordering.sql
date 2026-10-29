-- Opening a chat no longer connects its contact. Presence now follows the
-- delivery order: message received, contact online, message read, typing.
-- chat_visit rows remain the composer-activity signal for pacing and initiative.
DROP TRIGGER agent_visit_activity;

-- Follow-up typing has no reply turn or attention claim; it names its conversation.
ALTER TABLE agent_presence ADD COLUMN typing_contact_id TEXT REFERENCES contact(id) ON DELETE SET NULL;
