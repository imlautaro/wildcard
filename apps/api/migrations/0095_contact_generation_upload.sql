-- One Create contact form (docs/contact-generation.md): a generation job may carry an
-- uploaded photo staged at contacts/<user>/generation/<job>.jpg until it publishes.
DROP TRIGGER cleanup_generation;
CREATE TRIGGER cleanup_generation BEFORE DELETE ON contact_generation BEGIN
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
    VALUES('workflow','generation:contact-generation-'||OLD.id,OLD.user_id);
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
    SELECT 'prefix','contacts/'||OLD.user_id||'/'||json_extract(OLD.plan_json,'$.id')||'/',OLD.user_id
    WHERE json_extract(OLD.plan_json,'$.id') IS NOT NULL;
  INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
    SELECT 'object','contacts/'||OLD.user_id||'/generation/'||OLD.id||'.jpg',OLD.user_id
    WHERE json_extract(OLD.input_json,'$.photo')='upload';
END;
