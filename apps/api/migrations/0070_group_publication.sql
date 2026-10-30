-- Two agents can prepare concurrently; only one ready draft owns publication.
-- Cascades also release reservations on clear, membership removal and deletion.
CREATE TABLE group_publication (
  group_id TEXT PRIMARY KEY NOT NULL REFERENCES chat_group(id) ON DELETE CASCADE,
  turn_id TEXT NOT NULL UNIQUE REFERENCES group_reply(id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL,
  acquired_at INTEGER NOT NULL
);
