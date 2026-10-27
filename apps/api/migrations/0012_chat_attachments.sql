ALTER TABLE chat_turn ADD COLUMN attachment_json TEXT CHECK (attachment_json IS NULL OR json_valid(attachment_json));
CREATE TABLE chat_attachment_object (
  object_key TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
CREATE INDEX chat_attachment_object_age_idx ON chat_attachment_object(created_at);
CREATE INDEX chat_attachment_key_idx ON chat_turn(json_extract(attachment_json, '$.key'));
