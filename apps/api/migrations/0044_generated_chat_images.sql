-- One reserved provider generation per response, including across retries.
CREATE TABLE generated_chat_image (
  id TEXT PRIMARY KEY NOT NULL,
  chat_turn_id TEXT UNIQUE REFERENCES chat_turn(id) ON DELETE CASCADE,
  group_reply_id TEXT UNIQUE REFERENCES group_reply(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'complete', 'failed')),
  attachment_json TEXT,
  references_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  CHECK ((chat_turn_id IS NULL) != (group_reply_id IS NULL)),
  CHECK (status != 'complete' OR attachment_json IS NOT NULL)
);
