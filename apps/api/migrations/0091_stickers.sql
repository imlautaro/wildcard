-- Stickers (docs/stickers.md): transparent PNG cutouts with an emoji that tells the
-- reader when to use them. A person's library and a contact's library share one table.
--
-- owner_kind/owner_id: 'user' + user id, or 'agent' + agent id. No foreign key, because
-- owner_id points at either table; account and contact deletion remove the rows in code
-- (stickers/data.ts) and the registry/Cron cleanup removes the objects.
-- scope_user_id: a sticker an agent saved from one person's chat is visible only in that
-- person's conversation, never to the other participants of a shared contact. NULL means
-- agent-wide (the contact's own avatar stickers).
-- object_key: the library's own R2 object. Sending or saving copies the bytes, so a
-- library change never touches chat history and clearing a chat never touches the library.
CREATE TABLE sticker (
  id TEXT PRIMARY KEY,
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('user', 'agent')),
  owner_id TEXT NOT NULL,
  scope_user_id TEXT,
  emoji TEXT NOT NULL CHECK (length(emoji) BETWEEN 1 AND 32),
  object_key TEXT NOT NULL UNIQUE,
  digest TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0),
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 512),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 512),
  source TEXT NOT NULL CHECK (source IN ('upload', 'avatar', 'saved')),
  source_photo_version TEXT,
  created_at INTEGER NOT NULL,
  CHECK (scope_user_id IS NULL OR owner_kind = 'agent')
);
CREATE INDEX sticker_owner_idx ON sticker(owner_kind, owner_id, created_at DESC);

-- Whether an agent's profile photo shows one face (the only photos stickers of the
-- contact itself can be made from), per immutable photo version.
CREATE TABLE sticker_photo_check (
  agent_id TEXT NOT NULL,
  photo_version TEXT NOT NULL,
  has_face INTEGER NOT NULL CHECK (has_face IN (0, 1)),
  checked_at INTEGER NOT NULL,
  PRIMARY KEY (agent_id, photo_version)
);

-- Objects live under users/<user>/stickers/ and contacts/<owner>/<agent>/stickers/, which the
-- account cleanup (0069) and agent cleanup (0063) prefix sweeps already cover; the agent prefix
-- is also registered explicitly in case an agent's ID differs from its owner contact's ID.
CREATE TRIGGER sticker_user_removed AFTER DELETE ON user BEGIN
  DELETE FROM sticker WHERE (owner_kind = 'user' AND owner_id = OLD.id) OR scope_user_id = OLD.id;
END;
CREATE TRIGGER sticker_agent_removed BEFORE DELETE ON contact_agent BEGIN
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
    VALUES('prefix','contacts/'||OLD.owner_id||'/'||OLD.id||'/stickers/',OLD.id);
  DELETE FROM sticker WHERE owner_kind = 'agent' AND owner_id = OLD.id;
  DELETE FROM sticker_photo_check WHERE agent_id = OLD.id;
END;
