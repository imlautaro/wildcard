-- Existing invitation codes remain unbound. New directed requests belong to an
-- immutable account ID resolved from its current email address at creation.
ALTER TABLE contact_invite ADD COLUMN recipient_id TEXT REFERENCES user(id) ON DELETE CASCADE;
CREATE INDEX contact_invite_inbox_idx ON contact_invite(recipient_id, expires_at)
  WHERE recipient_id IS NOT NULL AND accepted_by IS NULL;
CREATE UNIQUE INDEX contact_invite_pending_recipient_idx ON contact_invite(agent_id, recipient_id)
  WHERE recipient_id IS NOT NULL AND accepted_by IS NULL;
