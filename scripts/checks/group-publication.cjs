// Opt-in isolated regression checks: node scripts/checks/group-publication.cjs
// No provider, Cloudflare, APNs or persistent database access.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../..');
const source = file => stripTypeScriptTypes(fs.readFileSync(path.join(root, 'apps/api/src', file), 'utf8'))
  .replace(/^import[^\n]*\n/gm, '').replace(/export /g, '');
let checks = 0;

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of fs.readdirSync(path.join(root, 'apps/api/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    sqlite.exec(fs.readFileSync(path.join(root, 'apps/api/migrations', file), 'utf8'));
  }
  const state = { modelCalls: 0, batches: 0, pushes: 0, dispatches: 0, logs: [], decision: true, evidence: null, fault: null };
  const DB = { prepare(sql) {
    return { sql, args: [], bind(...args) { this.args = args; return this; },
      execute() {
        let index = 0;
        const params = [];
        const expanded = sql.replace(/\?(\d+)?/g, (_, number) => {
          params.push(this.args[number ? Number(number) - 1 : index++]); return '?';
        });
        const stmt = sqlite.prepare(expanded);
        return { stmt, params };
      },
      async first() {
        if (state.fault === 'receipt' && sql.startsWith('SELECT post.id')) throw Error('D1_TEST_PRIVATE_TEXT');
        const { stmt, params } = this.execute(); return stmt.get(...params) ?? null;
      },
      async run() { const { stmt, params } = this.execute(); const result = stmt.run(...params); return { meta: { changes: result.changes } }; },
      async all() { const { stmt, params } = this.execute(); return { results: stmt.all(...params) }; },
    };
  }, async batch(statements) {
    state.batches++;
    if (state.fault === 'write') throw Error('D1_TEST_PRIVATE_TEXT');
    sqlite.exec('BEGIN');
    try {
      const results = statements.map(s => { const { stmt, params } = s.execute();
        if (stmt.columns().length) return {results: stmt.all(...params), meta: {changes: 0}};
        return {results: [], meta: {changes: stmt.run(...params).changes}};
      });
      sqlite.exec('COMMIT');
      if (state.fault === 'committed') throw Error('D1_TEST_PRIVATE_TEXT');
      return results;
    } catch (error) { if (sqlite.isTransaction) sqlite.exec('ROLLBACK'); throw error; }
  } };
  sqlite.exec(`INSERT INTO user(id,name,email,created_at,updated_at) VALUES
    ('human','Demo Human','human@example.invalid',0,0), ('other','Other Human','other@example.invalid',0,0);
    INSERT INTO contact_agent(id,owner_id,name,memory_shared) VALUES ('sender','human','Bot One',1), ('target','human','Bot Two',1);
    INSERT INTO contact(id,user_id,name,agent_id,created_at,updated_at) VALUES
    ('private','human','Bot One','sender',0,0), ('target-private','human','Bot Two','target',0,0);
    INSERT INTO chat_group(id,owner_id,name,created_at) VALUES ('group','human','Demo Group',0);
    INSERT INTO group_member(group_id,user_id,share_memory,contributor_consent,joined_at) VALUES ('group','human',1,1,0);
    INSERT INTO group_agent(group_id,agent_id,added_by,joined_at) VALUES ('group','sender','human',0),('group','target','human',0);`);
  const context = vm.createContext({ Error, SyntaxError, TextEncoder, TextDecoder, Response, AbortSignal,
    NonRetryableError: class extends Error {},
    console: { error(v) { state.logs.push(JSON.parse(v)); }, log(v) { state.logs.push(JSON.parse(v)); } },
    byteLength: text => Buffer.byteLength(text), clipText: text => text,
    dispatchGroup: async () => { state.dispatches++; }, deliverGroupPush: async () => { state.pushes++; },
    scheduleTools: [], groupRetrievalTools: [],
    reactionTool: {function:{name:'react_to_message'}}, nativeTools: [], mcpTools: [], miniAppTools: [], miniAppInstruction: '',
    personalityContext: async () => '',
    nativeActions: {}, remoteSettings: {}, miniApps: {}, personality: {},
    jobModel: async env => env.META_CHAT_MODEL, jobAccountID: async () => 'human', maintainAgentMemories: async () => {},
    fetch: async (url, request) => {
      assert.equal(url, 'https://api.meta.ai/v1/chat/completions');
      const body = JSON.parse(request.body);
      assert.equal(body.max_completion_tokens, 2048);
      assert.equal(body.reasoning_effort, 'low');
      state.modelCalls++;
      state.evidence = JSON.parse(body.messages[1].content);
      if (state.onAuthorize) state.onAuthorize();
      return new Response(JSON.stringify({ choices: [{ finish_reason: state.fault === 'truncated' ? 'length' : 'stop',
        message: { content: state.fault === 'json' ? '{' : JSON.stringify({ authorized: state.decision }) } }] }));
    },
  });
  for (const file of ['chat/meta.ts', 'groups/energy.ts', 'groups/request-access.ts', 'groups/requests.ts', 'chat/context.ts']) vm.runInContext(source(file), context);
  const env = { DB, META_API_KEY: 'fictional-not-a-key', META_CHAT_MODEL: 'muse-spark-1.3-contributor' };
  let counter = 0;
  function turn(text = 'Say hello in Demo Group.') {
    counter++;
    sqlite.exec(`UPDATE chat_turn SET status='complete',assistant_text='Completed' WHERE status='running'; DELETE FROM agent_attention;`);
    const id = 'turn-' + counter;
    sqlite.prepare(`INSERT INTO chat_turn(id,contact_id,user_id,user_text,status,workflow_id,created_at,updated_at)
      VALUES (?,'private','human',?,'running',?,0,0)`).run(id, text, 'workflow-' + id);
    sqlite.prepare(`INSERT INTO agent_attention(agent_id,turn_id,attempt,workflow_id,acquired_at) VALUES ('sender',?,1,?,0)`).run(id, 'workflow-' + id);
    return { id, contactID: 'private', userID: 'human', attempt: 1, sequence: Number(sqlite.prepare('SELECT sequence FROM chat_turn WHERE id=?').get(id).sequence),
      userText: text, scheduleID: null, groupRequestID: null };
  }
  async function call(t, name = 'send_group_message', args = { groupID: 'group', text: 'Hello!' }) {
    return JSON.parse(await context.executeTool(env, { agentID: 'sender' }, { id: 'tool-call', function: { name, arguments: JSON.stringify(args) } }, t));
  }
  function count(table) { return sqlite.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n; }
  return { sqlite, context, state, env, turn, call, count };
}
async function check(name, run) {
  const f = fixture();
  try { await run(f); checks++; console.log('PASS ' + name); }
  finally { f.sqlite.close(); }
}
module.exports = { fixture, source };
if (require.main === module) (async () => {
  await check('plain greeting posts and allows bounded group replies without a private return', async f => {
    const r = await f.call(f.turn());
    assert.equal(r.published, true); assert.equal(r.replyExpected, false);
    assert.equal(f.count('group_post'), 1); assert.equal(f.count('group_message'), 1); assert.equal(f.count('group_reply'), 1);
    assert.equal(f.count('agent_memory_event'), 0); assert.equal(f.state.dispatches, 1);
  });
  await check('ordinary post works with only the sending bot', async f => {
    f.sqlite.exec("DELETE FROM group_agent WHERE agent_id='target'");
    assert.equal((await f.call(f.turn())).published, true);
  });
  await check('directed question then fresh addressed statement uses separate posts', async f => {
    const q = await f.call(f.turn('Ask Bot Two its favorite color in Demo Group.'), 'ask_agent_in_group',
      { groupID: 'group', targetAgentID: 'target', question: 'Bot Two, what is your favorite color?' });
    assert.equal(q.published, true); assert.equal(q.replyExpected, true); assert.equal(f.count('group_reply'), 1);
    const t = f.turn('Tell Bot Two hello there.');
    const destinations = await f.context.recentGroupDestinations(f.env, t);
    assert.equal(destinations.length, 1); assert.equal(destinations[0].groupID, 'group');
    assert.equal(destinations[0].targetAgentID, 'target'); assert.ok(!JSON.stringify(destinations).includes('favorite color'));
    const r = await f.call(t, 'send_group_message', { groupID: 'group', text: 'Bot Two, hello!' });
    assert.equal(r.published, true); assert.equal(r.replyExpected, false);
    assert.equal(f.count('group_reply'), 2); assert.equal(f.count('group_message'), 2);
    assert.equal(f.state.evidence.recentDestinations.length, 1);
    assert.equal(f.state.evidence.recentDialogue.length, 0);
  });
  await check('replay across tools returns one original receipt', async f => {
    const t = f.turn(); await f.call(t);
    const r = await f.call(t, 'ask_agent_in_group', { groupID: 'group', targetAgentID: 'target', question: 'A different question?' });
    assert.equal(r.replyExpected, false); assert.equal(r.text, 'Hello!');
    assert.equal(f.count('group_message'), 1); assert.equal(f.state.modelCalls, 1);
  });
  await check('old nullable-target contract remains compatible', async f => {
    const r = await f.call(f.turn(), 'send_group_message', { groupID: 'group', text: 'Hello!', targetAgentID: null });
    assert.equal(r.published, true);
  });
  for (const [name, mutate, tool, args, code] of [
    ['wrong group ID', () => {}, 'send_group_message', { groupID: 'Demo Group', text: 'Hello!' }, 'DESTINATION_NOT_SHARED'],
    ['wrong target ID', () => {}, 'ask_agent_in_group', { groupID: 'group', targetAgentID: 'Bot Two', question: 'Hello?' }, 'TARGET_NOT_AVAILABLE'],
    ['revoked group consent', f => f.sqlite.exec("UPDATE group_member SET contributor_consent=0"), 'send_group_message', { groupID: 'group', text: 'Hello!' }, 'ACCESS_DENIED'],
    ['inactive source slot', f => f.sqlite.exec('DELETE FROM agent_attention'), 'send_group_message', { groupID: 'group', text: 'Hello!' }, 'SOURCE_TURN_INACTIVE'],
    ['invalid tool arguments', () => {}, 'ask_agent_in_group', { groupID: 'group', question: 'Hello?' }, 'INVALID_ARGUMENTS'],
    ['unclear semantic authorization', f => f.state.decision = false, 'send_group_message', { groupID: 'group', text: 'Hello!' }, 'AUTHORIZATION_UNCLEAR'],
  ]) await check(name + ' has its own failure code and no writes', async f => {
    const t = f.turn(); mutate(f); const r = await f.call(t, tool, args);
    assert.equal(r.code, code); assert.equal(r.published, false); assert.equal(f.state.batches, 0);
    assert.ok(f.state.logs.some(log => log.event === 'group_publication_result' && log.code === code));
    assert.equal(f.count('group_message'), 0);
  });
  await check('membership change during authorization cannot publish', async f => {
    f.state.onAuthorize = () => f.sqlite.exec("DELETE FROM group_agent WHERE agent_id='sender'");
    const r = await f.call(f.turn()); assert.equal(r.code, 'ACCESS_CHANGED'); assert.equal(f.count('group_message'), 0);
  });
  await check('revocation hides prior destination and prevents replay after rejoin', async f => {
    const t = f.turn(); await f.call(t);
    f.sqlite.exec("DELETE FROM group_agent WHERE agent_id='sender'; INSERT INTO group_agent(group_id,agent_id,added_by,joined_at) VALUES ('group','sender','human',0)");
    assert.ok((await f.call(t)).error); assert.equal(f.count('group_message'), 1);
    assert.equal((await f.context.recentGroupDestinations(f.env, f.turn())).length, 0);
  });
  for (const fault of ['truncated', 'json']) await check(fault + ' authorization fails closed before write', async f => {
    f.state.fault = fault; const r = await f.call(f.turn());
    assert.equal(r.code, 'PRE_PUBLICATION_FAILURE'); assert.equal(r.published, false); assert.equal(f.state.batches, 0);
  });
  await check('committed write error recovers original receipt', async f => {
    f.state.fault = 'committed'; const r = await f.call(f.turn());
    assert.equal(r.published, true); assert.equal(f.count('group_message'), 1);
    assert.ok(!JSON.stringify(f.state.logs).includes('PRIVATE_TEXT'));
  });
  for (const fault of ['write', 'receipt']) await check(fault + ' uncertainty is distinct from permission denial', async f => {
    f.state.fault = fault; const r = await f.call(f.turn());
    assert.equal(r.code, 'PUBLICATION_UNKNOWN'); assert.equal(r.published, null);
    assert.ok(!JSON.stringify(f.state.logs).includes('PRIVATE_TEXT'));
  });
  await check('non-owner private consent remains required for Contributor', async f => {
    f.sqlite.exec("UPDATE contact_agent SET owner_id='other' WHERE id='sender'; INSERT INTO contact(id,user_id,name,agent_id,created_at,updated_at) VALUES ('owner-private','other','Bot One','sender',0,0)");
    const t = f.turn();
    assert.equal((await f.call(t)).code, 'ACCESS_DENIED');
    f.sqlite.exec("UPDATE contact SET contributor_consent=1 WHERE id='private'");
    assert.equal((await f.call(t)).published, true);
  });
  await check('Standard does not require Contributor group consent', async f => {
    f.env.META_CHAT_MODEL = 'muse-spark-1.3';
    f.sqlite.exec('UPDATE group_member SET contributor_consent=0');
    assert.equal((await f.call(f.turn())).published, true);
  });
  await check('autonomous sources cannot use either publication mode', async f => {
    const t = f.turn(); t.scheduleID = 'fictional-schedule';
    assert.equal((await f.call(t)).code, 'AUTONOMOUS_SOURCE');
    t.scheduleID = null; t.groupRequestID = 'fictional-result';
    assert.equal((await f.call(t, 'ask_agent_in_group', { groupID: 'group', targetAgentID: 'target', question: 'Hello?' })).code, 'AUTONOMOUS_SOURCE');
    assert.equal(f.state.modelCalls, 0); assert.equal(f.state.batches, 0);
  });
  await check('tool contracts separate addressed posts from requested answers', async f => {
    const post = vm.runInContext('groupRequestTool.function.parameters', f.context);
    const question = vm.runInContext('groupQuestionTool.function.parameters', f.context);
    assert.equal(JSON.stringify(post.required), '["groupID","text"]'); assert.ok(!post.properties.targetAgentID);
    assert.equal(JSON.stringify(question.required), '["groupID","targetAgentID","question"]');
  });
  console.log(`${checks} isolated checks passed using the real SQL, migrations and tool dispatch with simulated model decisions. No live services or user data used. Semantic model accuracy and the deployed app round trip are not exercised.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
