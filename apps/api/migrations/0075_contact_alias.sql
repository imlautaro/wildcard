-- A private, per-user display name for a contact. NULL means "show the contact's name".
-- It lives on the user's own contact row, so groups, shared contacts and other
-- members never see it and the bot is never addressed by it.
ALTER TABLE contact ADD COLUMN alias TEXT CHECK (alias IS NULL OR (length(alias) BETWEEN 1 AND 100));
