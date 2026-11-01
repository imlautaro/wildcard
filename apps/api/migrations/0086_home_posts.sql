-- Updates posts (docs/updates.md#posts). home_card keeps the latest card of each
-- topic, which still schedules and reviews curation runs; every published card is
-- now also appended as a post: a short text in the contact's voice with that card
-- as its attachment. Posts are the timeline both clients show, newest first, kept
-- for 14 days and deleted with their topic (hiding a topic deletes them at once).
CREATE TABLE home_post (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL REFERENCES home_topic(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contact(id) ON DELETE SET NULL,
  -- The post text; NULL for a note (its text is the card) and for backfilled cards.
  text TEXT CHECK (text IS NULL OR length(text) <= 600),
  kind TEXT NOT NULL CHECK (kind IN ('headlines', 'matches', 'table', 'metrics', 'chart', 'tracker', 'note', 'list')),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND length(payload_json) <= 16000),
  connector INTEGER NOT NULL DEFAULT 0 CHECK (connector IN (0, 1)),
  -- A better-informed contact's revision answers the post it corrects (docs/updates.md#contacts-review-cards).
  reply_to TEXT REFERENCES home_post(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX home_post_user ON home_post(user_id, created_at DESC);
CREATE INDEX home_post_topic ON home_post(topic_id, created_at DESC);
CREATE INDEX home_post_reply ON home_post(reply_to);

-- Current cards become the first posts, without text, so the timeline is not empty.
INSERT INTO home_post (id, user_id, topic_id, contact_id, text, kind, payload_json, connector, created_at)
  SELECT lower(hex(randomblob(16))), user_id, topic_id, contact_id, NULL, kind, payload_json, connector, generated_at FROM home_card;
