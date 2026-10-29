-- Shared to-do lists in chats. A private list belongs to one participant's chat with a
-- contact (contact_id + user_id); a group list belongs to the group and every member
-- sees it. Contacts and humans create, assign, complete and cancel tasks.
CREATE TABLE task_list (
  id TEXT PRIMARY KEY,
  group_id TEXT REFERENCES chat_group(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contact(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES user(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled')),
  created_by_kind TEXT NOT NULL CHECK (created_by_kind IN ('user', 'agent')),
  created_by_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((group_id IS NULL) = (contact_id IS NOT NULL) AND (contact_id IS NULL) = (user_id IS NULL))
);
CREATE INDEX task_list_contact ON task_list(contact_id, user_id, updated_at);
CREATE INDEX task_list_group ON task_list(group_id, updated_at);

-- work_due_at drives contact work turns: set when a task is assigned to a contact or
-- unblocked, then pushed back after each turn for proactive review while it stays open.
CREATE TABLE task (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES task_list(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'canceled')),
  assignee_kind TEXT CHECK (assignee_kind IN ('user', 'agent')),
  assignee_id TEXT,
  result TEXT CHECK (result IS NULL OR length(result) <= 2000),
  created_by_kind TEXT NOT NULL CHECK (created_by_kind IN ('user', 'agent')),
  created_by_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  work_due_at INTEGER,
  work_reason TEXT CHECK (work_reason IS NULL OR work_reason IN ('assigned', 'unblocked', 'review')),
  work_count INTEGER NOT NULL DEFAULT 0,
  CHECK ((assignee_kind IS NULL) = (assignee_id IS NULL))
);
CREATE INDEX task_list_position ON task(list_id, position);
CREATE INDEX task_work_due ON task(work_due_at) WHERE work_due_at IS NOT NULL;
CREATE INDEX task_assignee ON task(assignee_kind, assignee_id, status);

-- A task waits until every blocker is done or canceled. Both tasks share one list.
CREATE TABLE task_dependency (
  task_id TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  blocked_by_id TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, blocked_by_id),
  CHECK (task_id != blocked_by_id)
);
CREATE INDEX task_dependency_blocker ON task_dependency(blocked_by_id);

-- Receipts for contact task tools: a replayed Workflow step with the same call
-- returns the recorded result instead of mutating again.
CREATE TABLE task_mutation (
  id TEXT PRIMARY KEY,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- One row per contact work turn, for rolling budgets.
CREATE TABLE task_work (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES contact_agent(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX task_work_agent ON task_work(agent_id, created_at);

-- Work turns: a private turn without human text, or a group "Tasks" message that
-- gives the assigned contact one reply opportunity.
ALTER TABLE chat_turn ADD COLUMN task_id TEXT REFERENCES task(id) ON DELETE SET NULL;
ALTER TABLE group_message ADD COLUMN task_id TEXT REFERENCES task(id) ON DELETE SET NULL;
