-- Reaction activity for chat list previews ("You: reacted with 👍").
-- See docs/chats.md#chat-list-previews.
--
-- created_at: when the reaction was set or last changed. NULL for reactions written
-- before this migration; those never count as the latest activity of a chat.
-- contact_id / group_id: the conversation that owns the reacted message, copied from
-- it on write so the chat list finds the newest reaction with an index seek instead
-- of scanning every message. No foreign key: the row already cascades with its message.
ALTER TABLE message_reaction ADD COLUMN created_at INTEGER;
ALTER TABLE message_reaction ADD COLUMN contact_id TEXT;
ALTER TABLE message_reaction ADD COLUMN group_id TEXT;

UPDATE message_reaction SET contact_id = (SELECT contact_id FROM chat_turn WHERE id = message_reaction.turn_id)
  WHERE turn_id IS NOT NULL;
UPDATE message_reaction SET group_id = (SELECT group_id FROM group_message WHERE id = message_reaction.group_message_id)
  WHERE group_message_id IS NOT NULL;

CREATE INDEX reaction_contact_activity ON message_reaction(contact_id, created_at) WHERE contact_id IS NOT NULL AND created_at IS NOT NULL;
CREATE INDEX reaction_group_activity ON message_reaction(group_id, created_at) WHERE group_id IS NOT NULL AND created_at IS NOT NULL;
