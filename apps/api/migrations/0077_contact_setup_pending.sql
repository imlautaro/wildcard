-- First-circle contacts appear in the chat list as soon as their identities exist and
-- stay disabled while their portrait is generated (docs/onboarding.md#progressive-setup).
-- 1 = still being created: messages are rejected until it becomes 0.
ALTER TABLE contact ADD COLUMN setup_pending INTEGER NOT NULL DEFAULT 0 CHECK (setup_pending IN (0, 1));
