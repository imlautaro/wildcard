-- A private chat message can answer a For you post (docs/updates.md#continue-in-chat).
-- home_post_id references the post itself: while it exists, both the clients and the
-- contact read the live post (text, card and comments). Posts are deleted after 14 days
-- or with their topic, so there is no foreign key; home_post_json keeps a small snapshot
-- ({ title, text, createdAt }) to show and explain the reference after that.
ALTER TABLE chat_turn ADD COLUMN home_post_id TEXT;
ALTER TABLE chat_turn ADD COLUMN home_post_json TEXT CHECK (home_post_json IS NULL OR (json_valid(home_post_json) AND length(home_post_json) <= 2000));
