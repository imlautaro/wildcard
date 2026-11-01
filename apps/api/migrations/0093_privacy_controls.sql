-- Privacy controls (docs/privacy.md).
-- contacts_share: the person lets their own contacts recall what the others know about
--   them and ask each other, as if every pair were linked. Off by default.
-- keep_private: what this person tells this contact stays in that private chat: it is not
--   used in groups, by other people who share the contact, by the person's other contacts
--   or in For you. Off by default. Stored per participant row, so each person decides.
ALTER TABLE user ADD COLUMN contacts_share INTEGER NOT NULL DEFAULT 0 CHECK (contacts_share IN (0, 1));
ALTER TABLE contact ADD COLUMN keep_private INTEGER NOT NULL DEFAULT 0 CHECK (keep_private IN (0, 1));

-- A private chat cannot keep a raw-history grant in a group ("Discuss my private chats");
-- the existing delete trigger completes that agent's pending group replies.
CREATE TRIGGER contact_keep_private_revokes_group_sharing AFTER UPDATE OF keep_private ON contact
WHEN NEW.keep_private = 1 AND OLD.keep_private = 0 BEGIN
  DELETE FROM group_private_sharing WHERE contact_id = NEW.id;
END;
