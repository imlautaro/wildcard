-- Each participant has one replaceable reaction per individual message.
CREATE TABLE message_reaction (
  turn_id TEXT REFERENCES chat_turn(id) ON DELETE CASCADE,
  group_message_id TEXT REFERENCES group_message(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('user', 'assistant', 'group')),
  user_id TEXT REFERENCES user(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES contact_agent(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (emoji IN ('👍', '❤️', '😂', '😮', '😢', '🙏')),
  CHECK ((user_id IS NULL) != (agent_id IS NULL)),
  CHECK ((turn_id IS NOT NULL AND group_message_id IS NULL AND side IN ('user', 'assistant'))
    OR (turn_id IS NULL AND group_message_id IS NOT NULL AND side = 'group'))
);
CREATE UNIQUE INDEX reaction_identity ON message_reaction
  (COALESCE(turn_id, group_message_id), side, COALESCE(user_id, agent_id), (user_id IS NOT NULL));
CREATE INDEX reaction_turn ON message_reaction(turn_id);
CREATE INDEX reaction_group_message ON message_reaction(group_message_id);
