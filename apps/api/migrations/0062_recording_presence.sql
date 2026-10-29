-- Recording is a bounded overlay on the existing attended typing lease.
ALTER TABLE agent_presence ADD COLUMN recording_until INTEGER;
