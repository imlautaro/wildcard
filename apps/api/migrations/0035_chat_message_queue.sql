ALTER TABLE chat_visit ADD COLUMN typing_at INTEGER;
DROP INDEX chat_one_active_turn_idx;
CREATE INDEX chat_active_turn_idx ON chat_turn(contact_id, sequence) WHERE status IN ('queued', 'running');
