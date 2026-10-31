import { validWorkflowID } from './workflow-ids';

// D1 triggers persist external cleanup in the same transaction as deletion.
// Never discard a failed job; Cron retries with bounded backoff and concurrency.
export async function cleanResources(env: Env, scope?: string): Promise<void> {
  const { results } = await env.DB.prepare(`SELECT kind, resource, scope, attempts, revision, settle_at AS settleAt FROM resource_cleanup
    WHERE next_at <= ?1 AND (?2 IS NULL OR scope = ?2 OR EXISTS (SELECT 1 FROM resource_cleanup_scope s
      WHERE s.kind=resource_cleanup.kind AND s.resource=resource_cleanup.resource AND s.scope=?2))
    ORDER BY CASE kind WHEN 'workflow' THEN 0 ELSE 1 END, next_at LIMIT 40`)
    .bind(Date.now(), scope ?? null).all<{ kind: string; resource: string; scope: string; attempts: number; revision: number; settleAt: number }>();
  for (let offset = 0; offset < results.length; offset += 4) {
    await Promise.all(results.slice(offset, offset + 4).map(async (job) => {
      try {
        if (job.kind === 'workflow') {
          try {
            const generation = job.resource.startsWith('generation:');
            const id = generation ? job.resource.slice('generation:'.length) : job.resource;
            // Legacy task IDs could not be created. They have no external state
            // to delete; retrying their validation error would hold clear forever.
            if (validWorkflowID(id)) {
              const instance = generation ? await env.ONBOARDING_WORKFLOW.get(id) : await env.CHAT_WORKFLOW.get(id);
              await instance.delete();
            }
          }
          catch (error) {
            // Missing instances were never dispatched, expired, or already deleted.
            if (!(error instanceof Error) || !/instance.*(not[ _.-]?found|does not exist)|not[ _.-]?found.*instance|workflow[._-]not_found/i.test(error.message)) throw error;
          }
          await env.DB.prepare('DELETE FROM agent_attention WHERE workflow_id = ?').bind(job.resource).run();
        } else if (job.kind === 'prefix') {
          const page = await env.CONTACT_PHOTOS.list({ prefix: job.resource, limit: 100 });
          if (page.objects.length) await env.CONTACT_PHOTOS.delete(page.objects.map(object => object.key));
          if (page.truncated) return; // Start again at the first surviving key next time.
          if (Date.now()<job.settleAt) {
            await env.DB.prepare('UPDATE resource_cleanup SET next_at=? WHERE kind=? AND resource=? AND revision=?')
              .bind(job.settleAt,job.kind,job.resource,job.revision).run();
            return; // Sweep again after uploads already in flight have settled.
          }
        } else {
          // A reused object is never removed while another message references it.
          const used = await env.DB.prepare(`SELECT 1 FROM chat_turn WHERE json_extract(attachment_json,'$.key')=?1
            UNION ALL SELECT 1 FROM chat_turn t,json_each(COALESCE(t.assistant_messages_json,'[]')) p WHERE json_extract(p.value,'$.attachment.key')=?1
              OR EXISTS (SELECT 1 FROM json_each(COALESCE(json_extract(p.value,'$.attachments'),'[]')) a WHERE json_extract(a.value,'$.key')=?1)
            UNION ALL SELECT 1 FROM group_message WHERE json_extract(attachment_json,'$.key')=?1
              OR EXISTS (SELECT 1 FROM json_each(COALESCE(attachments_json,'[]')) a WHERE json_extract(a.value,'$.key')=?1) LIMIT 1`).bind(job.resource).first();
          if (!used) {
            await env.CONTACT_PHOTOS.delete(job.resource);
            if (Date.now()<job.settleAt) {
              await env.DB.prepare('UPDATE resource_cleanup SET next_at=? WHERE kind=? AND resource=? AND revision=?')
                .bind(job.settleAt,job.kind,job.resource,job.revision).run();
              return; // Keep the registry until the final pass, including a lost upload response.
            }
            await env.DB.prepare('DELETE FROM chat_attachment_object WHERE object_key = ?').bind(job.resource).run();
          }
        }
        await env.DB.prepare('DELETE FROM resource_cleanup WHERE kind = ? AND resource = ? AND revision=?').bind(job.kind, job.resource,job.revision).run();
      } catch {
        await env.DB.prepare('UPDATE resource_cleanup SET attempts = attempts + 1, next_at = ? WHERE kind = ? AND resource = ? AND revision = ?')
          .bind(Date.now() + Math.min(3600000, 1000 * 2 ** Math.min(job.attempts, 12)), job.kind, job.resource, job.revision).run();
        console.error(JSON.stringify({ event: 'resource_cleanup_deferred', kind: job.kind }));
      }
    }));
  }
  await env.DB.batch([
    env.DB.prepare(`UPDATE contact SET clearing=0 WHERE clearing=1 AND NOT EXISTS (SELECT 1 FROM resource_cleanup j WHERE j.kind='workflow' AND
      (j.scope=contact.id OR EXISTS(SELECT 1 FROM resource_cleanup_scope s WHERE s.kind=j.kind AND s.resource=j.resource AND s.scope=contact.id)))`),
    env.DB.prepare(`UPDATE chat_group SET clearing=0 WHERE clearing=1 AND NOT EXISTS (SELECT 1 FROM resource_cleanup j WHERE j.kind='workflow' AND
      (j.scope=chat_group.id OR EXISTS(SELECT 1 FROM resource_cleanup_scope s WHERE s.kind=j.kind AND s.resource=j.resource AND s.scope=chat_group.id)))`),
  ]);
}

export async function clearContact(env: Env, id: string, userID: string, clearMemory: boolean, historyRevision: number) {
  const db = env.DB;
  const statements = [db.prepare('UPDATE contact SET clearing=1, history_revision=CASE WHEN history_revision=?3 THEN history_revision+1 ELSE NULL END WHERE id=?1 AND user_id=?2').bind(id,userID,historyRevision)];
  if (clearMemory) statements.push(db.prepare('DELETE FROM retained_contact_memory WHERE contact_id=?').bind(id));
  else {
    statements.push(db.prepare(`INSERT INTO retained_contact_memory(contact_id,user_id,category,memory_key,kind,content,updated_at)
      SELECT contact_id,user_id,'human',memory_key,kind,content,updated_at FROM contact_memory WHERE contact_id=?1
      ON CONFLICT(contact_id,category,memory_key) DO UPDATE SET kind=excluded.kind,content=excluded.content,updated_at=excluded.updated_at`).bind(id));
    for (const [table, category] of [['agent_memory','self'],['agent_local_memory','local_self']]) {
      statements.push(db.prepare(`INSERT INTO retained_contact_memory(contact_id,user_id,category,memory_key,kind,content,updated_at)
        SELECT t.contact_id,t.user_id,'${category}',m.memory_key,m.kind,m.content,m.updated_at FROM ${table} m
        JOIN agent_memory_event e ON e.sequence=m.source_event_sequence JOIN chat_turn t ON t.id=e.private_turn_id
        WHERE t.contact_id=?1 ${category==='local_self' ? "AND m.scope_key='private:'||t.contact_id" : ''}
        ON CONFLICT(contact_id,category,memory_key) DO UPDATE SET kind=excluded.kind,content=excluded.content,updated_at=excluded.updated_at`).bind(id));
    }
  }
  for (const table of ['conversation_initiative','chat_visit','mini_app','task_list','chat_document','native_remote_grant']) {
    statements.push(db.prepare(`DELETE FROM ${table} WHERE contact_id=?`).bind(id));
  }
  statements.push(db.prepare('DELETE FROM chat_turn WHERE contact_id=?').bind(id));
  statements.push(db.prepare('DELETE FROM contact_schedule WHERE contact_id=?').bind(id));
  statements.push(db.prepare('DELETE FROM contact_memory_state WHERE contact_id=?').bind(id));
  statements.push(db.prepare('DELETE FROM chat_workflow_instance WHERE contact_id=?').bind(id));
  statements.push(db.prepare(`UPDATE contact SET onboarding_chat=0, last_read_sequence=0,last_reply_read_at=NULL,initiative_paused=0 WHERE id=?`).bind(id));
  statements.push(db.prepare(`INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
    SELECT 'object',object_key,?1 FROM chat_attachment_object WHERE scope=?1`).bind(id));
  statements.push(db.prepare(`DELETE FROM retained_contact_memory AS m WHERE contact_id=?1 AND rowid NOT IN
    (SELECT keep.rowid FROM retained_contact_memory keep WHERE keep.contact_id=m.contact_id AND keep.category=m.category
      ORDER BY keep.updated_at DESC,keep.memory_key LIMIT 64)`).bind(id));
  await db.batch(statements);
  await cleanResources(env,id);
}

export async function clearGroup(env: Env, id: string, clearMemory: boolean, historyRevision: number) {
  const db=env.DB;
  const statements=[db.prepare('UPDATE chat_group SET clearing=1,history_revision=CASE WHEN history_revision=?2 THEN history_revision+1 ELSE NULL END WHERE id=?1').bind(id,historyRevision)];
  if (clearMemory) statements.push(db.prepare('DELETE FROM retained_group_memory WHERE group_id=?').bind(id));
  else {
    for (const [table,category] of [['group_memory','human'],['group_local_memory','local_human']]) {
      statements.push(db.prepare(`INSERT INTO retained_group_memory(group_id,agent_id,user_id,category,memory_key,kind,content,updated_at,contributor_consent)
        SELECT gm.group_id,m.agent_id,m.user_id,'${category}',m.memory_key,m.kind,m.content,m.updated_at,gm.contributor_consent
        FROM ${table} m JOIN group_message gm ON gm.id=m.source_id WHERE gm.group_id=?1
        ON CONFLICT(group_id,agent_id,user_id,category,memory_key) DO UPDATE SET kind=excluded.kind,content=excluded.content,
          updated_at=excluded.updated_at,contributor_consent=excluded.contributor_consent`).bind(id));
    }
    for (const [table,category] of [['agent_memory','self'],['agent_local_memory','local_self']]) {
      statements.push(db.prepare(`INSERT INTO retained_group_memory(group_id,agent_id,user_id,category,memory_key,kind,content,updated_at,contributor_consent)
        SELECT gm.group_id,m.agent_id,g.owner_id,'${category}',m.memory_key,m.kind,m.content,m.updated_at,gm.contributor_consent
        FROM ${table} m JOIN agent_memory_event e ON e.sequence=m.source_event_sequence
        JOIN group_message gm ON gm.id=e.group_message_id JOIN chat_group g ON g.id=gm.group_id
        WHERE gm.group_id=?1 ${category==='local_self' ? "AND m.scope_key='group:'||gm.group_id" : ''}
        ON CONFLICT(group_id,agent_id,user_id,category,memory_key) DO UPDATE SET kind=excluded.kind,content=excluded.content,
          updated_at=excluded.updated_at,contributor_consent=excluded.contributor_consent`).bind(id));
    }
  }
  for (const table of ['mini_app','task_list','chat_document','group_request','group_post','group_message','chat_workflow_instance']) {
    statements.push(db.prepare(`DELETE FROM ${table} WHERE group_id=?`).bind(id));
  }
  statements.push(db.prepare('UPDATE group_member SET last_read_sequence=0 WHERE group_id=?').bind(id));
  statements.push(db.prepare(`INSERT OR IGNORE INTO resource_cleanup(kind,resource,scope)
    SELECT 'object',object_key,?1 FROM chat_attachment_object WHERE scope=?1`).bind(id));
  statements.push(db.prepare(`DELETE FROM retained_group_memory AS m WHERE group_id=?1 AND rowid NOT IN
    (SELECT keep.rowid FROM retained_group_memory keep WHERE keep.group_id=m.group_id AND keep.agent_id=m.agent_id
      AND keep.user_id=m.user_id AND keep.category=m.category ORDER BY keep.updated_at DESC,keep.memory_key LIMIT 64)`).bind(id));
  await db.batch(statements);
  await cleanResources(env,id);
}

export async function discardWorkflow(env: Env, id: string, scope: string) {
  await env.DB.prepare(`INSERT INTO resource_cleanup(kind,resource,scope) VALUES('workflow',?,?)
    ON CONFLICT(kind,resource) DO UPDATE SET revision=resource_cleanup.revision+1,next_at=0`).bind(id,scope).run();
  await cleanResources(env,scope);
}

export async function cleanupPending(db: D1Database, scope: string): Promise<boolean> {
  return !!await db.prepare(`SELECT 1 FROM resource_cleanup j WHERE j.scope=?1 OR EXISTS
    (SELECT 1 FROM resource_cleanup_scope s WHERE s.kind=j.kind AND s.resource=j.resource AND s.scope=?1) LIMIT 1`).bind(scope).first();
}
