-- A contact answering a comment on its For you post can also write to the person in its
-- private chat (docs/updates.md#private-messages-from-comments). That message is a chat turn
-- the contact started (user_text '', like a conversation initiative) with home_post_id set;
-- home_comment_id names the comment that led to it, so the contact reads it as its own
-- message about the post and the post's comments can show that it wrote privately.
-- No foreign key: comments are deleted with their post after 14 days, the message stays.
ALTER TABLE chat_turn ADD COLUMN home_comment_id TEXT;
CREATE UNIQUE INDEX chat_turn_home_comment ON chat_turn(home_comment_id) WHERE home_comment_id IS NOT NULL;
