CREATE TABLE push_device (
  id TEXT PRIMARY KEY NOT NULL,
  token TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('development', 'production')),
  session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX push_device_token_environment_idx ON push_device(token, environment);
CREATE INDEX push_device_session_idx ON push_device(session_id);
CREATE TABLE push_delivery (
  turn_id TEXT NOT NULL REFERENCES chat_turn(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES push_device(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (turn_id, device_id)
);
CREATE INDEX push_delivery_next_idx ON push_delivery(next_at);
