-- Home: a personal feed that a person's contacts curate together (docs/home.md).
-- One feed row per person schedules curation runs; topics are what the feed
-- follows (asked by the person, suggested by a contact in chat, or chosen by the
-- curator); each card is the latest rendering of one topic by one contact.
CREATE TABLE home_feed (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running')),
  -- Increments on every claim; a Workflow instance only writes for its own revision.
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  due_at INTEGER NOT NULL,
  claimed_at INTEGER,
  requested_at INTEGER,
  generated_at INTEGER,
  viewed_at INTEGER NOT NULL,
  time_zone TEXT CHECK (time_zone IS NULL OR length(time_zone) <= 64),
  briefing TEXT CHECK (briefing IS NULL OR length(briefing) <= 400),
  progress_json TEXT CHECK (progress_json IS NULL OR json_valid(progress_json)),
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) <= 80)
);
CREATE INDEX home_feed_due ON home_feed(status, due_at);

CREATE TABLE home_topic (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  brief TEXT NOT NULL CHECK (length(brief) <= 600),
  -- Why this is on Home, shown to the person (written by the curator).
  reason TEXT CHECK (reason IS NULL OR length(reason) <= 160),
  kind TEXT NOT NULL CHECK (kind IN ('headlines', 'matches', 'table', 'metrics', 'chart', 'tracker', 'note', 'list')),
  source TEXT NOT NULL CHECK (source IN ('person', 'contact', 'curator')),
  -- The contact that suggested it in chat, or the one the curator last assigned.
  contact_id TEXT REFERENCES contact(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'retired')),
  feedback TEXT CHECK (feedback IS NULL OR feedback IN ('more', 'less')),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX home_topic_user ON home_topic(user_id, status, updated_at DESC);

CREATE TABLE home_card (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL UNIQUE REFERENCES home_topic(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contact(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('headlines', 'matches', 'table', 'metrics', 'chart', 'tracker', 'note', 'list')),
  position INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND length(payload_json) <= 16000),
  -- Whether connector data shaped this card; such cards are produced with Standard.
  connector INTEGER NOT NULL DEFAULT 0 CHECK (connector IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  generated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX home_card_user ON home_card(user_id, position);

-- Home searches share the account and global web research budget
-- (web_research_usage); this ledger adds Home's own smaller daily cap.
CREATE TABLE home_research (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  topic_id TEXT,
  -- Saved findings let a retried Workflow step reuse a search instead of paying again.
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  created_at INTEGER NOT NULL
);
CREATE INDEX home_research_user ON home_research(user_id, created_at);

-- How often each person opens each mini app, for Home quick access. Group apps
-- are shared, so usage is per person.
CREATE TABLE mini_app_usage (
  app_id TEXT NOT NULL REFERENCES mini_app(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  opens INTEGER NOT NULL DEFAULT 0 CHECK (opens >= 0),
  last_opened_at INTEGER NOT NULL,
  PRIMARY KEY (app_id, user_id)
);
CREATE INDEX mini_app_usage_user ON mini_app_usage(user_id, last_opened_at DESC);
