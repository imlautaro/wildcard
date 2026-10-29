-- One external resource can belong to both a private result and its source group.
-- Links survive source deletion and disappear only when the cleanup job drains.
CREATE TABLE resource_cleanup_scope (
  kind TEXT NOT NULL,
  resource TEXT NOT NULL,
  scope TEXT NOT NULL,
  PRIMARY KEY(kind,resource,scope),
  FOREIGN KEY(kind,resource) REFERENCES resource_cleanup(kind,resource) ON DELETE CASCADE
);
CREATE INDEX resource_cleanup_scope_owner ON resource_cleanup_scope(scope,kind,resource);
INSERT INTO resource_cleanup_scope(kind,resource,scope) SELECT kind,resource,scope FROM resource_cleanup;
CREATE TRIGGER cleanup_scope_insert AFTER INSERT ON resource_cleanup BEGIN
  INSERT OR IGNORE INTO resource_cleanup_scope(kind,resource,scope) VALUES(NEW.kind,NEW.resource,NEW.scope);
END;
CREATE TRIGGER cleanup_scope_update AFTER UPDATE OF scope ON resource_cleanup BEGIN
  INSERT OR IGNORE INTO resource_cleanup_scope(kind,resource,scope) VALUES(NEW.kind,NEW.resource,NEW.scope);
END;

-- Preserve the containing conversation before source rows disappear in FK cascades.
-- Migration 0063 is already released; repair its triggers additively.
DROP TRIGGER cleanup_private_turn;
CREATE TRIGGER cleanup_private_turn BEFORE DELETE ON chat_turn BEGIN
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope) VALUES ('workflow',OLD.workflow_id,OLD.contact_id);
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
    SELECT 'object',json_extract(OLD.attachment_json,'$.key'),OLD.contact_id WHERE json_extract(OLD.attachment_json,'$.key') IS NOT NULL;
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
    SELECT 'object',json_extract(value,'$.attachment.key'),OLD.contact_id FROM json_each(COALESCE(OLD.assistant_messages_json,'[]'))
    WHERE json_extract(value,'$.attachment.key') IS NOT NULL;
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
    SELECT 'object',COALESCE(json_extract(attachment_json,'$.key'),'generated/'||id||'.jpg'),OLD.contact_id
    FROM generated_chat_image WHERE chat_turn_id=OLD.id;
  DELETE FROM task_mutation WHERE substr(id,1,length(OLD.id)+1)=OLD.id||':';
  DELETE FROM document_mutation WHERE substr(id,1,length(OLD.id)+1)=OLD.id||':';
END;

DROP TRIGGER cleanup_group_reply;
CREATE TRIGGER cleanup_group_reply BEFORE DELETE ON group_reply BEGIN
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope) VALUES ('workflow',OLD.workflow_id,OLD.group_id);
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
    SELECT 'object',COALESCE(json_extract(attachment_json,'$.key'),'generated/'||id||'.jpg'),OLD.group_id
    FROM generated_chat_image WHERE group_reply_id=OLD.id;
  DELETE FROM task_mutation WHERE substr(id,1,length(OLD.id)+1)=OLD.id||':';
  DELETE FROM document_mutation WHERE substr(id,1,length(OLD.id)+1)=OLD.id||':';
END;

DROP TRIGGER cleanup_generated_image;
CREATE TRIGGER cleanup_generated_image BEFORE DELETE ON generated_chat_image BEGIN
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
    SELECT 'object',COALESCE(json_extract(OLD.attachment_json,'$.key'),'generated/'||OLD.id||'.jpg'),
      COALESCE((SELECT scope FROM chat_attachment_object
        WHERE object_key=COALESCE(json_extract(OLD.attachment_json,'$.key'),'generated/'||OLD.id||'.jpg')),
        (SELECT contact_id FROM chat_turn WHERE id=OLD.chat_turn_id),
        (SELECT group_id FROM group_reply WHERE id=OLD.group_reply_id),OLD.chat_turn_id,OLD.group_reply_id);
END;

-- Existing jobs can recover their conversation from the durable upload registry.
UPDATE resource_cleanup SET scope=(SELECT scope FROM chat_attachment_object WHERE object_key=resource_cleanup.resource)
  WHERE kind='object' AND EXISTS(SELECT 1 FROM chat_attachment_object WHERE object_key=resource_cleanup.resource AND scope IS NOT NULL);

-- A group request can own a reply Workflow in a participant's private chat.
-- Capture both scopes while the parent and every private result still exist.
CREATE TRIGGER cleanup_group_request_results BEFORE DELETE ON group_request BEGIN
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope) SELECT 'workflow',resource,scope FROM (SELECT t.workflow_id AS resource,t.contact_id AS scope FROM chat_turn t WHERE t.group_request_id=OLD.id
      UNION SELECT w.id,t.contact_id FROM chat_workflow_instance w JOIN chat_turn t ON t.id=w.turn_id WHERE t.group_request_id=OLD.id) WHERE resource IS NOT NULL;
  INSERT OR IGNORE INTO resource_cleanup_scope(kind,resource,scope) SELECT 'workflow',resource,OLD.group_id FROM (SELECT t.workflow_id AS resource,t.contact_id AS scope FROM chat_turn t WHERE t.group_request_id=OLD.id
      UNION SELECT w.id,t.contact_id FROM chat_workflow_instance w JOIN chat_turn t ON t.id=w.turn_id WHERE t.group_request_id=OLD.id) WHERE resource IS NOT NULL AND OLD.group_id IS NOT NULL;
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope) SELECT 'object',resource,scope FROM (SELECT json_extract(t.attachment_json,'$.key') AS resource,t.contact_id AS scope FROM chat_turn t WHERE t.group_request_id=OLD.id
      UNION SELECT json_extract(part.value,'$.attachment.key'),t.contact_id FROM chat_turn t,json_each(COALESCE(t.assistant_messages_json,'[]')) part WHERE t.group_request_id=OLD.id
      UNION SELECT COALESCE(json_extract(g.attachment_json,'$.key'),'generated/'||g.id||'.jpg'),t.contact_id
        FROM generated_chat_image g JOIN chat_turn t ON t.id=g.chat_turn_id WHERE t.group_request_id=OLD.id) WHERE resource IS NOT NULL;
  INSERT OR IGNORE INTO resource_cleanup_scope(kind,resource,scope) SELECT 'object',resource,OLD.group_id FROM (SELECT json_extract(t.attachment_json,'$.key') AS resource,t.contact_id AS scope FROM chat_turn t WHERE t.group_request_id=OLD.id
      UNION SELECT json_extract(part.value,'$.attachment.key'),t.contact_id FROM chat_turn t,json_each(COALESCE(t.assistant_messages_json,'[]')) part WHERE t.group_request_id=OLD.id
      UNION SELECT COALESCE(json_extract(g.attachment_json,'$.key'),'generated/'||g.id||'.jpg'),t.contact_id
        FROM generated_chat_image g JOIN chat_turn t ON t.id=g.chat_turn_id WHERE t.group_request_id=OLD.id) WHERE resource IS NOT NULL AND OLD.group_id IS NOT NULL;
END;

-- The shared table gained an embedding column in 0057; isolated memory has none.
-- An implicit m.* would make existing group memories prevent connector isolation.
DROP TRIGGER local_memory_group_isolated;
CREATE TRIGGER local_memory_group_isolated AFTER INSERT ON mcp_private_group BEGIN
  INSERT OR IGNORE INTO group_local_memory
    (group_id,agent_id,user_id,memory_key,kind,content,source_id,source_quote,updated_at)
    SELECT gm.group_id,m.agent_id,m.user_id,m.memory_key,m.kind,m.content,m.source_id,m.source_quote,m.updated_at FROM group_memory m JOIN group_message gm ON gm.id = m.source_id
    WHERE gm.group_id = NEW.group_id;
  INSERT OR IGNORE INTO agent_local_memory
    SELECT m.agent_id, 'group:' || NEW.group_id, m.memory_key, m.kind, m.content,
      m.source_event_sequence, m.source_quote, m.updated_at
    FROM agent_memory m JOIN agent_memory_event e ON e.sequence = m.source_event_sequence
    JOIN group_message gm ON gm.id = e.group_message_id WHERE gm.group_id = NEW.group_id;
END;
