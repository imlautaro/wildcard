ALTER TABLE user ADD COLUMN chat_model TEXT NOT NULL DEFAULT 'muse-spark-1.3'
  CHECK (chat_model IN ('muse-spark-1.3', 'muse-spark-1.3-contributor'));
