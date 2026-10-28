export const standardModel = 'muse-spark-1.3';
export const contributorModel = 'muse-spark-1.3-contributor';
export type ChatModel = typeof standardModel | typeof contributorModel;

export function validChatModel(value: unknown): value is ChatModel {
  return value === standardModel || value === contributorModel;
}

export async function accountModel(env: Env, userID: string | null): Promise<ChatModel> {
  if (!userID) return standardModel;
  const row = await env.DB.prepare('SELECT chat_model AS model FROM user WHERE id = ?')
    .bind(userID).first<{ model: string }>();
  return row?.model === contributorModel ? contributorModel : standardModel;
}

// Copy request/job bindings; never change the shared Worker environment.
export async function accountEnvironment(env: Env, userID: string): Promise<Env> {
  return { ...env, META_CHAT_MODEL: await accountModel(env, userID) };
}

export async function jobAccountID(env: Env, turnID: string, group: boolean): Promise<string | null> {
  const row = group
    ? await env.DB.prepare(`SELECT COALESCE(source.user_id, source.requester_id, request.requester_id) AS userID
        FROM group_reply reply JOIN group_message source ON source.id = reply.source_id
        LEFT JOIN group_request request ON request.id = source.request_id WHERE reply.id = ?`)
      .bind(turnID).first<{ userID: string | null }>()
    : await env.DB.prepare('SELECT user_id AS userID FROM chat_turn WHERE id = ?')
      .bind(turnID).first<{ userID: string | null }>();
  return row?.userID ?? null;
}

export async function jobModel(env: Env, turnID: string, group: boolean): Promise<ChatModel> {
  return accountModel(env, await jobAccountID(env, turnID, group));
}
