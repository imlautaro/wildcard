-- Legacy history has no recipient snapshot; never manufacture historical receipts.
ALTER TABLE group_message ADD COLUMN receipts_tracked INTEGER NOT NULL DEFAULT 0 CHECK (receipts_tracked IN (0, 1));
CREATE TABLE group_message_receipt (
  message_id TEXT NOT NULL REFERENCES group_message(id) ON DELETE CASCADE,
  recipient_kind TEXT NOT NULL CHECK (recipient_kind IN ('user', 'agent')),
  recipient_id TEXT NOT NULL,
  delivered_at INTEGER,
  read_at INTEGER,
  PRIMARY KEY (message_id, recipient_kind, recipient_id),
  CHECK (read_at IS NULL OR delivered_at IS NOT NULL)
);
CREATE INDEX group_receipt_recipient_idx ON group_message_receipt(recipient_kind, recipient_id, message_id);
CREATE TRIGGER group_message_receipt_snapshot AFTER INSERT ON group_message BEGIN
  UPDATE group_message SET receipts_tracked = 1 WHERE id = NEW.id;
  INSERT INTO group_message_receipt (message_id, recipient_kind, recipient_id)
    SELECT NEW.id, 'user', user_id FROM group_member
    WHERE group_id = NEW.group_id AND user_id IS NOT NEW.user_id;
  -- The durable group history is the agent's mailbox. Reading requires model processing.
  INSERT INTO group_message_receipt (message_id, recipient_kind, recipient_id, delivered_at)
    SELECT NEW.id, 'agent', agent_id, NEW.created_at FROM group_agent
    WHERE group_id = NEW.group_id AND agent_id IS NOT NEW.agent_id;
END;
