-- Only onboarding contacts appear in Chats before their first message.
ALTER TABLE contact ADD COLUMN onboarding_chat INTEGER NOT NULL DEFAULT 0 CHECK (onboarding_chat IN (0, 1));
