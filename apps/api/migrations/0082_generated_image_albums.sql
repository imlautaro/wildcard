-- Contact-generated albums: up to three images in one message.
-- See docs/generated-images.md#albums.

-- A group message keeps its first image in attachment_json, so existing clients,
-- previews and SQL keep working. attachments_json holds every album image,
-- including the first, and is NULL for ordinary single-attachment messages.
ALTER TABLE group_message ADD COLUMN attachments_json TEXT
  CHECK (attachments_json IS NULL OR (json_valid(attachments_json) AND json_type(attachments_json) = 'array'));

-- generated_chat_image and generated_initiative_image keep one receipt per
-- response or initiative episode. Their attachment_json now stores a JSON array of
-- generated images and references_json an aligned array of reference arrays.
-- Rows written before this migration hold one object and one flat reference
-- array; the API reads both shapes, so no data rewrite is needed.

-- Deleting a source turn or group message removes the internal descriptions of
-- every album image immediately, not only the first (0048 handled one image).
DROP TRIGGER IF EXISTS chat_image_index_private_delete;
CREATE TRIGGER chat_image_index_private_delete AFTER DELETE ON chat_turn BEGIN
  DELETE FROM chat_image_index WHERE object_key = json_extract(OLD.attachment_json, '$.key')
    OR object_key IN (SELECT json_extract(value, '$.attachment.key')
      FROM json_each(COALESCE(OLD.assistant_messages_json, '[]')))
    OR object_key IN (SELECT json_extract(album.value, '$.key')
      FROM json_each(COALESCE(OLD.assistant_messages_json, '[]')) part,
        json_each(COALESCE(json_extract(part.value, '$.attachments'), '[]')) album);
END;
DROP TRIGGER IF EXISTS chat_image_index_group_delete;
CREATE TRIGGER chat_image_index_group_delete AFTER DELETE ON group_message BEGIN
  DELETE FROM chat_image_index WHERE object_key = json_extract(OLD.attachment_json, '$.key')
    OR object_key IN (SELECT json_extract(value, '$.key') FROM json_each(COALESCE(OLD.attachments_json, '[]')));
END;
