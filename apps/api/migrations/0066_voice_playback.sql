-- Playback is separate from reading a message or downloading its waveform.
ALTER TABLE chat_turn ADD COLUMN assistant_voice_listened_json TEXT NOT NULL DEFAULT '{}';
CREATE TABLE group_voice_playback (
  message_id TEXT NOT NULL REFERENCES group_message(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  listened_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX group_voice_playback_user ON group_voice_playback(user_id);
