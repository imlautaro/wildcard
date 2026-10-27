-- A message may quote one earlier message from the same conversation.
ALTER TABLE chat_turn ADD COLUMN reply_to_id TEXT REFERENCES chat_turn(id) ON DELETE SET NULL;
ALTER TABLE chat_turn ADD COLUMN reply_to_side TEXT CHECK (reply_to_side IN ('user', 'assistant'));
ALTER TABLE group_message ADD COLUMN reply_to_id TEXT REFERENCES group_message(id) ON DELETE SET NULL;
