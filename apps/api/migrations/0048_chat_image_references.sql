-- Internal descriptions are scoped through live source messages, never shared memory.
CREATE TABLE chat_image_index (
  object_key TEXT PRIMARY KEY REFERENCES chat_attachment_object(object_key) ON DELETE CASCADE,
  digest TEXT NOT NULL,
  description TEXT,
  context TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',
  lease_until INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TRIGGER chat_image_index_private_delete AFTER DELETE ON chat_turn BEGIN
  DELETE FROM chat_image_index WHERE object_key = json_extract(OLD.attachment_json, '$.key')
    OR object_key IN (SELECT json_extract(value, '$.attachment.key')
      FROM json_each(COALESCE(OLD.assistant_messages_json, '[]')));
END;
CREATE TRIGGER chat_image_index_group_delete AFTER DELETE ON group_message BEGIN
  DELETE FROM chat_image_index WHERE object_key = json_extract(OLD.attachment_json, '$.key');
END;
