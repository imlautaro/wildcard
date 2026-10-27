ALTER TABLE group_member ADD COLUMN last_read_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_read_sequence >= 0);
-- There was no prior group read history. Start existing members at the current
-- history boundary; never backfill push alerts for historical messages.
UPDATE group_member SET last_read_sequence = COALESCE(
  (SELECT MAX(sequence) FROM group_message WHERE group_id = group_member.group_id), 0);
CREATE TRIGGER group_member_read_start AFTER INSERT ON group_member BEGIN
  UPDATE group_member SET last_read_sequence = COALESCE(
    (SELECT MAX(sequence) FROM group_message WHERE group_id = NEW.group_id), 0)
    WHERE group_id = NEW.group_id AND user_id = NEW.user_id;
END;
CREATE TABLE group_push_delivery (
  message_id TEXT NOT NULL REFERENCES group_message(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL REFERENCES push_device(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, device_id),
  FOREIGN KEY (group_id, user_id) REFERENCES group_member(group_id, user_id) ON DELETE CASCADE
);
CREATE INDEX group_push_delivery_next_idx ON group_push_delivery(next_at);
-- Persist notification fan-out in the same transaction as every human/bot
-- message, including messages saved by Workflows started before the release.
CREATE TRIGGER group_message_push AFTER INSERT ON group_message BEGIN
  INSERT OR IGNORE INTO group_push_delivery
    (message_id, group_id, user_id, device_id, session_id, next_at, expires_at)
    SELECT NEW.id, NEW.group_id, m.user_id, d.id, s.id, NEW.created_at, NEW.created_at + 86400000
    FROM group_member m JOIN session s ON s.user_id = m.user_id AND s.expires_at > NEW.created_at
    JOIN push_device d ON d.session_id = s.id
    WHERE m.group_id = NEW.group_id AND m.user_id IS NOT NEW.user_id AND NEW.sequence > m.last_read_sequence;
END;
