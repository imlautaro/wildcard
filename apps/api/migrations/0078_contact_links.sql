-- Linked contacts (docs/contacts.md#linked-contacts): a person can give two of their own
-- contacts access to each other. One row per pair, stored in a fixed order, so a link
-- is always mutual. Deleting either contact or the account removes it.
CREATE TABLE contact_link (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  contact_a TEXT NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  contact_b TEXT NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, contact_a, contact_b),
  CHECK (contact_a < contact_b)
);
CREATE INDEX contact_link_b ON contact_link(user_id, contact_b);

-- What one linked contact asked or told another on the person's behalf. The receiving
-- contact sees recent notes in its own private turns with that person.
CREATE TABLE contact_note (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  from_contact_id TEXT NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  to_contact_id TEXT NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('ask', 'tell')),
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
  answer TEXT CHECK (answer IS NULL OR length(answer) <= 4000),
  created_at INTEGER NOT NULL
);
CREATE INDEX contact_note_to ON contact_note(user_id, to_contact_id, created_at DESC);
