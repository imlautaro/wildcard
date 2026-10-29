-- Outbox rows intentionally have no parent FK: external cleanup survives cascades.
ALTER TABLE contact ADD COLUMN archived_at INTEGER;
ALTER TABLE contact ADD COLUMN history_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contact ADD COLUMN clearing INTEGER NOT NULL DEFAULT 0 CHECK (clearing IN (0,1));
ALTER TABLE group_member ADD COLUMN archived_at INTEGER;
CREATE TABLE resource_cleanup (
  kind TEXT NOT NULL CHECK (kind IN ('workflow','object','prefix')),
  resource TEXT NOT NULL,
  scope TEXT NOT NULL,
  next_at INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  settle_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000 + 300000),
  PRIMARY KEY(kind, resource)
);
CREATE INDEX resource_cleanup_due ON resource_cleanup(next_at);
CREATE TABLE chat_workflow_instance (
  id TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES contact(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES chat_group(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES contact_agent(id) ON DELETE CASCADE,
  turn_id TEXT REFERENCES chat_turn(id) ON DELETE CASCADE,
  reply_id TEXT REFERENCES group_reply(id) ON DELETE CASCADE
);
INSERT OR IGNORE INTO chat_workflow_instance(id,contact_id,agent_id,turn_id)
  SELECT t.workflow_id,t.contact_id,c.agent_id,t.id FROM chat_turn t JOIN contact c ON c.id=t.contact_id;
INSERT OR IGNORE INTO chat_workflow_instance(id,group_id,agent_id,reply_id)
  SELECT workflow_id,group_id,agent_id,id FROM group_reply;
CREATE TRIGGER cleanup_workflow BEFORE DELETE ON chat_workflow_instance BEGIN
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
    VALUES ('workflow',OLD.id,COALESCE(OLD.contact_id,OLD.group_id,OLD.agent_id));
END;
CREATE TRIGGER cleanup_private_turn BEFORE DELETE ON chat_turn BEGIN
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope) VALUES ('workflow',OLD.workflow_id,OLD.contact_id);
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
    SELECT 'object',json_extract(OLD.attachment_json,'$.key'),OLD.contact_id WHERE json_extract(OLD.attachment_json,'$.key') IS NOT NULL;
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
    SELECT 'object',json_extract(value,'$.attachment.key'),OLD.contact_id FROM json_each(COALESCE(OLD.assistant_messages_json,'[]'))
    WHERE json_extract(value,'$.attachment.key') IS NOT NULL;
  DELETE FROM task_mutation WHERE substr(id,1,length(OLD.id)+1)=OLD.id||':';
  DELETE FROM document_mutation WHERE substr(id,1,length(OLD.id)+1)=OLD.id||':';
END;
CREATE TRIGGER cleanup_group_reply BEFORE DELETE ON group_reply BEGIN
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope) VALUES ('workflow',OLD.workflow_id,OLD.group_id);
  DELETE FROM task_mutation WHERE substr(id,1,length(OLD.id)+1)=OLD.id||':';
  DELETE FROM document_mutation WHERE substr(id,1,length(OLD.id)+1)=OLD.id||':';
END;
CREATE TRIGGER cleanup_group_message BEFORE DELETE ON group_message BEGIN
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
    SELECT 'object',json_extract(OLD.attachment_json,'$.key'),OLD.group_id WHERE json_extract(OLD.attachment_json,'$.key') IS NOT NULL;
END;
CREATE TRIGGER cleanup_generated_image BEFORE DELETE ON generated_chat_image BEGIN
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
    VALUES ('object','generated/'||OLD.id||'.jpg',COALESCE(OLD.chat_turn_id,OLD.group_reply_id));
END;
CREATE TRIGGER cleanup_agent BEFORE DELETE ON contact_agent BEGIN
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope) VALUES ('prefix','contacts/'||OLD.owner_id||'/'||OLD.id||'/',OLD.id);
  -- Authored group content belongs to this agent's deletion, including media.
  DELETE FROM group_message WHERE agent_id=OLD.id;
  DELETE FROM mini_app WHERE agent_id=OLD.id;
  DELETE FROM task WHERE assignee_kind='agent' AND assignee_id=OLD.id;
END;
CREATE TRIGGER cleanup_group BEFORE DELETE ON chat_group BEGIN
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope) VALUES ('prefix','groups/'||OLD.id||'/',OLD.id);
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope) VALUES ('prefix','group-attachments/'||OLD.id||'/',OLD.id);
END;
-- Extracted knowledge can survive history removal only after an explicit keep-memory
-- operation. No transcript, quote, attachment, or searchable source is retained.
CREATE TABLE retained_contact_memory (
  contact_id TEXT NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('human','self','local_self')),
  memory_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(contact_id,category,memory_key)
);
CREATE TRIGGER block_clearing_turn BEFORE INSERT ON chat_turn
WHEN EXISTS(SELECT 1 FROM contact WHERE id=NEW.contact_id AND clearing=1) BEGIN
  SELECT RAISE(ABORT,'Chat cleanup is in progress');
END;

CREATE TRIGGER register_private_workflow AFTER INSERT ON chat_turn BEGIN
  INSERT OR IGNORE INTO chat_workflow_instance(id,contact_id,agent_id,turn_id)
    SELECT NEW.workflow_id,NEW.contact_id,agent_id,NEW.id FROM contact WHERE id=NEW.contact_id;
END;
CREATE TRIGGER register_private_retry AFTER UPDATE OF workflow_id ON chat_turn BEGIN
  INSERT OR IGNORE INTO chat_workflow_instance(id,contact_id,agent_id,turn_id)
    SELECT NEW.workflow_id,NEW.contact_id,agent_id,NEW.id FROM contact WHERE id=NEW.contact_id;
END;
CREATE TRIGGER register_group_workflow AFTER INSERT ON group_reply BEGIN
  INSERT OR IGNORE INTO chat_workflow_instance(id,group_id,agent_id,reply_id)
    VALUES(NEW.workflow_id,NEW.group_id,NEW.agent_id,NEW.id);
END;
CREATE TRIGGER register_group_retry AFTER UPDATE OF workflow_id ON group_reply BEGIN
  INSERT OR IGNORE INTO chat_workflow_instance(id,group_id,agent_id,reply_id)
    VALUES(NEW.workflow_id,NEW.group_id,NEW.agent_id,NEW.id);
END;
CREATE TRIGGER register_initiative_workflow AFTER UPDATE OF revision ON conversation_initiative WHEN NEW.evaluations>OLD.evaluations BEGIN
  INSERT OR IGNORE INTO chat_workflow_instance(id,contact_id,agent_id,turn_id)
    SELECT 'initiative-'||NEW.source_id||'-'||NEW.revision,NEW.contact_id,agent_id,NEW.source_id FROM contact WHERE id=NEW.contact_id;
END;
-- Lock every private resource producer while the old workflows are being deleted.
CREATE TRIGGER block_clearing_list BEFORE INSERT ON task_list
WHEN EXISTS(SELECT 1 FROM contact WHERE id=NEW.contact_id AND clearing=1) BEGIN SELECT RAISE(ABORT,'Chat cleanup is in progress'); END;
CREATE TRIGGER block_clearing_document BEFORE INSERT ON chat_document
WHEN EXISTS(SELECT 1 FROM contact WHERE id=NEW.contact_id AND clearing=1) BEGIN SELECT RAISE(ABORT,'Chat cleanup is in progress'); END;
CREATE TRIGGER block_clearing_app BEFORE INSERT ON mini_app
WHEN EXISTS(SELECT 1 FROM contact WHERE id=NEW.contact_id AND clearing=1) BEGIN SELECT RAISE(ABORT,'Chat cleanup is in progress'); END;
CREATE TRIGGER block_clearing_schedule BEFORE INSERT ON contact_schedule
WHEN EXISTS(SELECT 1 FROM contact WHERE id=NEW.contact_id AND clearing=1) BEGIN SELECT RAISE(ABORT,'Chat cleanup is in progress'); END;
CREATE TRIGGER block_clearing_visit BEFORE INSERT ON chat_visit
WHEN EXISTS(SELECT 1 FROM contact WHERE id=NEW.contact_id AND clearing=1) BEGIN SELECT RAISE(ABORT,'Chat cleanup is in progress'); END;

ALTER TABLE chat_group ADD COLUMN history_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_group ADD COLUMN clearing INTEGER NOT NULL DEFAULT 0 CHECK(clearing IN (0,1));
CREATE TABLE retained_group_memory (
  group_id TEXT NOT NULL REFERENCES chat_group(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES contact_agent(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN ('human','local_human','self','local_self')),
  memory_key TEXT NOT NULL,kind TEXT NOT NULL,content TEXT NOT NULL,updated_at INTEGER NOT NULL,
  contributor_consent INTEGER NOT NULL,
  PRIMARY KEY(group_id,agent_id,user_id,category,memory_key)
);
CREATE TRIGGER cleanup_retained_group_member AFTER DELETE ON group_member BEGIN
  DELETE FROM retained_group_memory WHERE group_id=OLD.group_id AND user_id=OLD.user_id;
END;
CREATE TRIGGER cleanup_retained_group_agent AFTER DELETE ON group_agent BEGIN
  DELETE FROM retained_group_memory WHERE group_id=OLD.group_id AND agent_id=OLD.agent_id;
END;
CREATE TRIGGER block_clearing_group_message BEFORE INSERT ON group_message
WHEN EXISTS(SELECT 1 FROM chat_group WHERE id=NEW.group_id AND clearing=1) BEGIN SELECT RAISE(ABORT,'Chat cleanup is in progress'); END;
CREATE TRIGGER block_clearing_group_list BEFORE INSERT ON task_list
WHEN EXISTS(SELECT 1 FROM chat_group WHERE id=NEW.group_id AND clearing=1) BEGIN SELECT RAISE(ABORT,'Chat cleanup is in progress'); END;
CREATE TRIGGER block_clearing_group_document BEFORE INSERT ON chat_document
WHEN EXISTS(SELECT 1 FROM chat_group WHERE id=NEW.group_id AND clearing=1) BEGIN SELECT RAISE(ABORT,'Chat cleanup is in progress'); END;
CREATE TRIGGER block_clearing_group_app BEFORE INSERT ON mini_app
WHEN EXISTS(SELECT 1 FROM chat_group WHERE id=NEW.group_id AND clearing=1) BEGIN SELECT RAISE(ABORT,'Chat cleanup is in progress'); END;
CREATE TRIGGER cleanup_private_resources BEFORE DELETE ON contact BEGIN
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope) VALUES ('prefix','attachments/'||OLD.user_id||'/'||OLD.id||'/',OLD.id);
END;

INSERT OR IGNORE INTO chat_workflow_instance(id,contact_id,agent_id,turn_id)
  WITH RECURSIVE attempts(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM attempts WHERE n<(SELECT COALESCE(MAX(attempt),1) FROM chat_turn))
  SELECT 'chat-'||t.id||'-a'||n,t.contact_id,c.agent_id,t.id FROM chat_turn t JOIN contact c ON c.id=t.contact_id JOIN attempts ON n<=t.attempt;
INSERT OR IGNORE INTO chat_workflow_instance(id,group_id,agent_id,reply_id)
  WITH RECURSIVE attempts(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM attempts WHERE n<(SELECT COALESCE(MAX(attempt),1) FROM group_reply))
  SELECT r.id||'-'||n,r.group_id,r.agent_id,r.id FROM group_reply r JOIN attempts ON n<=r.attempt;

CREATE TRIGGER retained_human_superseded AFTER INSERT ON contact_memory BEGIN
  DELETE FROM retained_contact_memory WHERE contact_id=NEW.contact_id AND category='human' AND memory_key=NEW.memory_key;
END;
CREATE TRIGGER retained_group_superseded AFTER INSERT ON group_memory BEGIN
  DELETE FROM retained_group_memory WHERE agent_id=NEW.agent_id AND user_id=NEW.user_id AND category='human' AND memory_key=NEW.memory_key;
END;
CREATE TRIGGER retained_group_local_superseded AFTER INSERT ON group_local_memory BEGIN
  DELETE FROM retained_group_memory WHERE group_id=NEW.group_id AND agent_id=NEW.agent_id AND user_id=NEW.user_id AND category='local_human' AND memory_key=NEW.memory_key;
END;
CREATE TRIGGER retained_self_superseded AFTER INSERT ON agent_memory BEGIN
  DELETE FROM retained_contact_memory WHERE category='self' AND memory_key=NEW.memory_key AND contact_id IN(SELECT id FROM contact WHERE agent_id=NEW.agent_id);
  DELETE FROM retained_group_memory WHERE category='self' AND agent_id=NEW.agent_id AND memory_key=NEW.memory_key;
END;
CREATE TRIGGER retained_local_self_superseded AFTER INSERT ON agent_local_memory BEGIN
  DELETE FROM retained_contact_memory WHERE category='local_self' AND 'private:'||contact_id=NEW.scope_key AND memory_key=NEW.memory_key;
  DELETE FROM retained_group_memory WHERE category='local_self' AND 'group:'||group_id=NEW.scope_key AND agent_id=NEW.agent_id AND memory_key=NEW.memory_key;
END;

ALTER TABLE chat_attachment_object ADD COLUMN scope TEXT;
CREATE INDEX chat_attachment_scope ON chat_attachment_object(scope);
-- Capture old object rows that are still referenced, without inspecting R2.
UPDATE chat_attachment_object SET scope=COALESCE(
  (SELECT contact_id FROM chat_turn WHERE json_extract(attachment_json,'$.key')=object_key LIMIT 1),
  (SELECT t.contact_id FROM chat_turn t,json_each(COALESCE(t.assistant_messages_json,'[]')) p WHERE json_extract(p.value,'$.attachment.key')=object_key LIMIT 1),
  (SELECT group_id FROM group_message WHERE json_extract(attachment_json,'$.key')=object_key LIMIT 1));
CREATE TRIGGER cleanup_pending_contact_objects BEFORE DELETE ON contact BEGIN
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope) SELECT 'object',object_key,OLD.id FROM chat_attachment_object WHERE scope=OLD.id;
  DELETE FROM contact_generation WHERE contact_id=OLD.id OR json_extract(plan_json,'$.id')=OLD.id;
END;
CREATE TRIGGER cleanup_pending_group_objects BEFORE DELETE ON chat_group BEGIN
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope) SELECT 'object',object_key,OLD.id FROM chat_attachment_object WHERE scope=OLD.id;
  DELETE FROM group_request WHERE group_id=OLD.id;
  DELETE FROM group_post WHERE group_id=OLD.id;
END;
CREATE TRIGGER cleanup_generation BEFORE DELETE ON contact_generation BEGIN
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope) VALUES('workflow','generation:contact-generation-'||OLD.id,OLD.user_id);
END;
-- Concurrent clear requests must not perform conflicting keep/delete-memory choices.
CREATE TRIGGER private_clear_once BEFORE UPDATE OF clearing ON contact WHEN OLD.clearing=1 AND NEW.clearing=1 BEGIN SELECT RAISE(ABORT,'Chat cleanup is in progress'); END;
CREATE TRIGGER group_clear_once BEFORE UPDATE OF clearing ON chat_group WHEN OLD.clearing=1 AND NEW.clearing=1 BEGIN SELECT RAISE(ABORT,'Chat cleanup is in progress'); END;

INSERT OR IGNORE INTO chat_workflow_instance(id,contact_id,agent_id,turn_id)
  WITH RECURSIVE revisions(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM revisions WHERE n<12)
  SELECT 'initiative-'||t.id||'-'||n,t.contact_id,c.agent_id,t.id FROM chat_turn t JOIN contact c ON c.id=t.contact_id
  JOIN revisions WHERE t.schedule_id IS NULL AND t.group_request_id IS NULL AND t.task_id IS NULL AND t.initiative_source_id IS NULL;

CREATE TRIGGER cleanup_onboarding_contact BEFORE DELETE ON contact BEGIN
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
    SELECT 'workflow','generation:onboarding-'||OLD.user_id,OLD.id FROM account_onboarding a
    WHERE a.user_id=OLD.user_id AND EXISTS(SELECT 1 FROM json_each(a.plan_json,'$.contacts') WHERE json_extract(value,'$.id')=OLD.id);
  UPDATE account_onboarding SET plan_json=json_set(plan_json,'$.contacts',json(COALESCE(
    (SELECT json_group_array(json(value)) FROM json_each(plan_json,'$.contacts') WHERE json_extract(value,'$.id')!=OLD.id),'[]')))
    WHERE user_id=OLD.user_id AND status='complete' AND plan_json IS NOT NULL;
END;
