-- One image attempt per private initiative episode, separate from its human reply.
CREATE TABLE generated_initiative_image (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL UNIQUE REFERENCES chat_turn(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'complete', 'failed')),
  attachment_json TEXT,
  references_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  CHECK (status != 'complete' OR attachment_json IS NOT NULL)
);
