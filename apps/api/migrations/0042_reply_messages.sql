-- Only the delivered prefix is exposed through chat history.
ALTER TABLE chat_turn ADD COLUMN assistant_messages_json TEXT;
