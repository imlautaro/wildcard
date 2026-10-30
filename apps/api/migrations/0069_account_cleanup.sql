-- External deletion must survive the account and any failed storage request.
CREATE TRIGGER cleanup_user BEFORE DELETE ON user BEGIN
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
    VALUES('prefix','users/'||OLD.id||'/',OLD.id);
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
    VALUES('prefix','contacts/'||OLD.id||'/',OLD.id);
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
    VALUES('prefix','attachments/'||OLD.id||'/',OLD.id);
  -- Even a completed onboarding instance retains input and generated checkpoints.
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
    VALUES('workflow','generation:onboarding-'||OLD.id,OLD.id);
  -- SET NULL would otherwise preserve authored text, names and media in groups
  -- owned by other people. Delete while attribution and source cascades exist.
  DELETE FROM group_message WHERE user_id=OLD.id OR requester_id=OLD.id;
  -- Shared boards/documents use polymorphic attribution IDs rather than user FKs.
  -- Remove account-authored resources and work assigned to the removed person.
  DELETE FROM chat_turn WHERE task_id IN (SELECT id FROM task
    WHERE (created_by_kind='user' AND created_by_id=OLD.id)
      OR (assignee_kind='user' AND assignee_id=OLD.id)
      OR research_user_id=OLD.id OR monitor_user_id=OLD.id
      OR list_id IN (SELECT id FROM task_list WHERE created_by_kind='user' AND created_by_id=OLD.id));
  DELETE FROM group_message WHERE task_id IN (SELECT id FROM task
    WHERE (created_by_kind='user' AND created_by_id=OLD.id)
      OR (assignee_kind='user' AND assignee_id=OLD.id)
      OR research_user_id=OLD.id OR monitor_user_id=OLD.id
      OR list_id IN (SELECT id FROM task_list WHERE created_by_kind='user' AND created_by_id=OLD.id));
  DELETE FROM task WHERE (created_by_kind='user' AND created_by_id=OLD.id)
    OR (assignee_kind='user' AND assignee_id=OLD.id)
    OR research_user_id=OLD.id OR monitor_user_id=OLD.id;
  DELETE FROM task_list WHERE created_by_kind='user' AND created_by_id=OLD.id;
  DELETE FROM chat_document WHERE (created_by_kind='user' AND created_by_id=OLD.id)
    OR (updated_by_kind='user' AND updated_by_id=OLD.id);
  DELETE FROM chat_document_revision WHERE author_kind='user' AND author_id=OLD.id;
END;

CREATE TRIGGER cleanup_account_onboarding BEFORE DELETE ON account_onboarding BEGIN
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
    VALUES('workflow','generation:onboarding-'||OLD.user_id,OLD.user_id);
END;

-- A generation job can have uploaded its portrait before publishing a contact.
DROP TRIGGER cleanup_generation;
CREATE TRIGGER cleanup_generation BEFORE DELETE ON contact_generation BEGIN
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
    VALUES('workflow','generation:contact-generation-'||OLD.id,OLD.user_id);
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
    SELECT 'prefix','contacts/'||OLD.user_id||'/'||json_extract(OLD.plan_json,'$.id')||'/',OLD.user_id
    WHERE json_extract(OLD.plan_json,'$.id') IS NOT NULL;
END;

-- Recover known account-prefix/checkpoint omissions from earlier admin deletes.
-- Events intentionally contain only IDs/counts, never names or email addresses.
INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
  SELECT 'prefix','users/'||target||'/',target FROM admin_event
  WHERE action='user.delete' AND target IS NOT NULL AND NOT EXISTS(SELECT 1 FROM user WHERE id=target);
INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
  SELECT 'prefix','contacts/'||target||'/',target FROM admin_event
  WHERE action='user.delete' AND target IS NOT NULL AND NOT EXISTS(SELECT 1 FROM user WHERE id=target);
INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
  SELECT 'prefix','attachments/'||target||'/',target FROM admin_event
  WHERE action='user.delete' AND target IS NOT NULL AND NOT EXISTS(SELECT 1 FROM user WHERE id=target);
INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
  SELECT 'workflow','generation:onboarding-'||target,target FROM admin_event
  WHERE action='user.delete' AND target IS NOT NULL AND NOT EXISTS(SELECT 1 FROM user WHERE id=target);
