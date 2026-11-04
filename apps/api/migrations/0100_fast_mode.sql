-- Fast mode (docs/chats.md#fast-mode): the person's contacts skip humanlike pacing
-- (connect/read beats, reading and listening time, typing pauses between bubbles).
-- Off by default. Groups use it only when every human member turned it on.
ALTER TABLE user ADD COLUMN fast_mode INTEGER NOT NULL DEFAULT 0 CHECK (fast_mode IN (0, 1));
