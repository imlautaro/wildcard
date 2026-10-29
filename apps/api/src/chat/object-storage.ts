export async function registerChatObject(env: Env, key: string, scope: string) {
  await env.DB.prepare(`INSERT INTO chat_attachment_object(object_key,created_at,scope) VALUES(?,?,?)
    ON CONFLICT(object_key) DO NOTHING`).bind(key,Date.now(),scope).run();
}
export async function discardChatObject(env: Env, key: string, scope: string) {
  await env.DB.prepare(`INSERT INTO resource_cleanup(kind,resource,scope) VALUES('object',?,?) ON CONFLICT(kind,resource) DO UPDATE SET revision=resource_cleanup.revision+1,next_at=0`).bind(key,scope).run();
}
