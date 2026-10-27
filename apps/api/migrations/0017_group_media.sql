ALTER TABLE chat_group ADD COLUMN photo_version TEXT;
ALTER TABLE group_message ADD COLUMN attachment_json TEXT CHECK (attachment_json IS NULL OR json_valid(attachment_json));
