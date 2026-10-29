-- Optional semantic ranking for human memories. Each row keeps its own int8-quantized
-- embedding, so deleting or cascading a memory deletes its vector in the same row.
-- A changed content invalidates the vector; the next authorized read re-embeds it.
-- Connector-isolated local group memories are never embedded and get no column.
ALTER TABLE contact_memory ADD COLUMN embedding BLOB;
ALTER TABLE group_memory ADD COLUMN embedding BLOB;
CREATE TRIGGER contact_memory_embedding_stale AFTER UPDATE OF content ON contact_memory
WHEN OLD.content IS NOT NEW.content BEGIN
  UPDATE contact_memory SET embedding = NULL WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER group_memory_embedding_stale AFTER UPDATE OF content ON group_memory
WHEN OLD.content IS NOT NEW.content BEGIN
  UPDATE group_memory SET embedding = NULL WHERE rowid = NEW.rowid;
END;
