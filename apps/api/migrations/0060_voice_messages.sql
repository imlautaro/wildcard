-- Voice messages (docs/voice.md). The voice is part of the shared agent identity;
-- the opt-in to voice replies belongs to each participant's conversation.
ALTER TABLE contact_agent ADD COLUMN voice_id TEXT;
ALTER TABLE contact_agent ADD COLUMN voice_name TEXT;
-- Requested demographics from AI generation, used to pick a voice later when no
-- voice could be assigned at creation (for example, before a key was configured).
ALTER TABLE contact_agent ADD COLUMN voice_profile_json TEXT CHECK (voice_profile_json IS NULL OR json_valid(voice_profile_json));
ALTER TABLE contact ADD COLUMN voice_messages_enabled INTEGER NOT NULL DEFAULT 0 CHECK (voice_messages_enabled IN (0, 1));
-- Audio lives in attachment_json (audio/wav). The transcript is saved as the
-- message text once transcribed_at is set; listened_at turns the microphone blue.
ALTER TABLE chat_turn ADD COLUMN voice_listened_at INTEGER;
ALTER TABLE chat_turn ADD COLUMN voice_transcribed_at INTEGER;
ALTER TABLE group_message ADD COLUMN voice_listened_at INTEGER;
ALTER TABLE group_message ADD COLUMN voice_transcribed_at INTEGER;
