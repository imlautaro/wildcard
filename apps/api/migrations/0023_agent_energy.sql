-- Shared group energy. Recharge uses server time, including offline time.
ALTER TABLE contact_agent ADD COLUMN energy INTEGER NOT NULL DEFAULT 50 CHECK (energy BETWEEN 0 AND 50);
ALTER TABLE contact_agent ADD COLUMN energy_updated_at INTEGER NOT NULL DEFAULT 0;
UPDATE contact_agent SET energy_updated_at = unixepoch() * 1000;
CREATE TRIGGER agent_energy_initialize AFTER INSERT ON contact_agent BEGIN
  UPDATE contact_agent SET energy_updated_at = unixepoch() * 1000 WHERE id = NEW.id;
END;
ALTER TABLE group_message ADD COLUMN exchange_id TEXT REFERENCES group_message(id) ON DELETE SET NULL;
ALTER TABLE group_message ADD COLUMN requester_id TEXT REFERENCES user(id) ON DELETE SET NULL;
CREATE INDEX group_message_exchange_idx ON group_message(exchange_id, sequence);
CREATE TABLE group_exchange (
  root_id TEXT PRIMARY KEY NOT NULL REFERENCES group_message(id) ON DELETE CASCADE,
  bot_messages INTEGER NOT NULL DEFAULT 0 CHECK (bot_messages BETWEEN 0 AND 100)
);
-- Preserve active original rounds without replaying historical conversations.
UPDATE group_message SET exchange_id = id, requester_id = user_id WHERE user_id IS NOT NULL;
UPDATE group_message SET exchange_id = id, requester_id =
  COALESCE((SELECT requester_id FROM group_post WHERE id = group_message.id),
           (SELECT requester_id FROM group_request WHERE id = group_message.id))
  WHERE id IN (SELECT id FROM group_post UNION ALL SELECT id FROM group_request);
UPDATE group_message SET exchange_id = (SELECT source_id FROM group_reply WHERE id = group_message.id),
  requester_id = (SELECT source.requester_id FROM group_reply r JOIN group_message source ON source.id = r.source_id
    WHERE r.id = group_message.id)
  WHERE id IN (SELECT id FROM group_reply) AND exchange_id IS NULL;
INSERT INTO group_exchange(root_id, bot_messages)
  SELECT exchange_id, MIN(100, SUM(agent_id IS NOT NULL)) FROM group_message
  WHERE exchange_id IS NOT NULL GROUP BY exchange_id;
-- Charge only a new, committed publication; duplicate IDs, retries and skips cost nothing.
CREATE TRIGGER group_energy_guard BEFORE INSERT ON group_message
WHEN NEW.agent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM group_message WHERE id = NEW.id) BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM contact_agent a WHERE a.id = NEW.agent_id
    AND MIN(50, a.energy + MAX(0, (unixepoch() * 1000 - a.energy_updated_at) / 300000)) > 0)
    THEN RAISE(ABORT, 'GROUP_ENERGY_EXHAUSTED') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM group_exchange WHERE root_id = NEW.exchange_id AND bot_messages >= 100)
    THEN RAISE(ABORT, 'GROUP_EXCHANGE_EXHAUSTED') END;
END;
CREATE TRIGGER group_energy_and_continuation AFTER INSERT ON group_message BEGIN
  INSERT INTO group_exchange(root_id) SELECT NEW.exchange_id WHERE NEW.exchange_id IS NOT NULL
    ON CONFLICT(root_id) DO NOTHING;
  UPDATE contact_agent SET
    energy = MIN(50, energy + MAX(0, (unixepoch() * 1000 - energy_updated_at) / 300000)) - 1,
    energy_updated_at = CASE
      WHEN energy + MAX(0, (unixepoch() * 1000 - energy_updated_at) / 300000) >= 50 THEN unixepoch() * 1000
      ELSE energy_updated_at + MAX(0, (unixepoch() * 1000 - energy_updated_at) / 300000) * 300000 END
    WHERE id = NEW.agent_id;
  UPDATE group_exchange SET bot_messages = bot_messages + 1
    WHERE root_id = NEW.exchange_id AND NEW.agent_id IS NOT NULL;
  -- One pending opportunity per agent/exchange avoids an exponentially growing queue.
  -- Directed questions keep their designated first answer and private result.
  INSERT INTO group_reply(id, group_id, agent_id, source_id, workflow_id, created_at)
    SELECT 'auto-' || NEW.sequence || '-' || ga.agent_id, ga.group_id, ga.agent_id, NEW.id,
      'auto-' || NEW.sequence || '-' || ga.agent_id || '-1', NEW.created_at
    FROM group_agent ga JOIN contact_agent a ON a.id = ga.agent_id
    JOIN group_exchange exchange ON exchange.root_id = NEW.exchange_id
    WHERE ga.group_id = NEW.group_id AND NEW.agent_id IS NOT NULL AND ga.agent_id != NEW.agent_id
      AND NEW.request_id IS NULL AND NEW.requester_id IS NOT NULL AND exchange.bot_messages < 100
      AND a.memory_shared = 1 AND EXISTS (SELECT 1 FROM contact WHERE agent_id = a.id AND user_id = a.owner_id)
      AND MIN(50, a.energy + MAX(0, (unixepoch() * 1000 - a.energy_updated_at) / 300000)) > 0
      AND (SELECT COUNT(*) FROM group_reply WHERE group_id = NEW.group_id AND status IN ('queued','running')) < 57
      AND NOT EXISTS (SELECT 1 FROM group_reply pending JOIN group_message source ON source.id = pending.source_id
        WHERE pending.agent_id = ga.agent_id AND source.exchange_id = NEW.exchange_id AND pending.status IN ('queued','running'))
    ORDER BY ga.joined_at, ga.agent_id ON CONFLICT(source_id, agent_id) DO NOTHING;
END;
