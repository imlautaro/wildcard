export const standardModel = 'muse-spark-1.3';
export const contributorModel = 'muse-spark-1.3-contributor';
export type ChatModel = typeof standardModel | typeof contributorModel;

export function validChatModel(value: unknown): value is ChatModel {
  return value === standardModel || value === contributorModel;
}

// Admin flag `contributor_only` (docs/admin.md): every account is processed with
// Contributor while it is on. The stored `user.chat_model` is never changed, so each
// account's own choice applies again when the flag is turned off.
const contributorOnlySetting = `(SELECT value FROM app_setting WHERE key = 'contributor_only') = 'true'`;

// SQL expression for an account's effective model; use it instead of reading
// `chat_model` directly in consent guards.
export function effectiveModelSQL(column: string): string {
  return `(CASE WHEN ${contributorOnlySetting} THEN '${contributorModel}' ELSE ${column} END)`;
}

export async function accountModel(env: Env, userID: string | null): Promise<ChatModel> {
  if (!userID) return standardModel;
  const row = await env.DB.prepare(`SELECT ${effectiveModelSQL('chat_model')} AS model FROM user WHERE id = ?`)
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
  if (group && await env.DB.prepare(`SELECT p.group_id FROM mcp_private_group p JOIN group_reply r ON r.group_id = p.group_id WHERE r.id = ?`).bind(turnID).first()) return standardModel;
  return accountModel(env, await jobAccountID(env, turnID, group));
}
