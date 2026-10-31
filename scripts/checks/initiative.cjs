// Opt-in regressions: real migrated SQLite and initiative Workflow, simulated model/time.
// No network, provider credentials, APNs, persistent database or user data.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { source } = require('./group-publication.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
function fixture(version = 76) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  const migrations = path.resolve(__dirname, '../../apps/api/migrations');
  for (const name of fs.readdirSync(migrations).filter(name => name.endsWith('.sql') && Number(name.slice(0, 4)) <= version).sort()) {
    sqlite.exec(fs.readFileSync(path.join(migrations, name), 'utf8'));
  }
  const DB = { prepare(sql) {
    return { args: [], bind(...args) { this.args = args; return this; },
      statement() {
        let index = 0; const args = [];
        const expanded = sql.replace(/\?(\d+)?/g, (_, n) => { args.push(this.args[n ? Number(n) - 1 : index++]); return '?'; });
        return { query: sqlite.prepare(expanded), args };
      },
      async first() { const { query, args } = this.statement(); return query.get(...args) ?? null; },
      async all() { const { query, args } = this.statement(); return { results: query.all(...args) }; },
      async run() { const { query, args } = this.statement(); return { meta: { changes: query.run(...args).changes } }; },
    };
  }, async batch(statements) {
    sqlite.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
  sqlite.exec(`INSERT INTO user(id,name,email,created_at,updated_at) VALUES ('human','Demo Human','human@example.invalid',0,0);
    INSERT INTO contact_agent(id,owner_id,name,memory_shared) VALUES ('demo-agent','human','Demo Contact',1);
    INSERT INTO contact(id,user_id,name,agent_id,created_at,updated_at) VALUES ('private','human','Demo Contact','demo-agent',0,0);`);
  const state = { logs: [] };
  const context = vm.createContext({ console: { error: value => state.logs.push(JSON.parse(value)) },
    isRecord: value => value !== null && typeof value === 'object' && !Array.isArray(value),
    safeErrorCode: error => error.message, clipText: text => text });
  return { sqlite, state, context, env: { DB, META_CHAT_MODEL: 'muse-spark-1.3-contributor' } };
}
let checks = 0;
const initialNow = Date.UTC(2026, 9, 28, 12);
async function check(name, run, version = 76) {
  const f = fixture(version);
  let now = initialNow;
  const calls = [];
  const decisionFields = { engagement: 'social', response: 'none', permission: 'unchanged' };
  let response = { ...decisionFields, kind: 'continuation', action: 'send', delaySeconds: 30, intent: 'Continue naturally', message: 'What has caught your interest today?' };
  Object.assign(f.context, {
    Date: class extends Date { static now() { return now; } },
    privateContact: async () => false,
    readPersonality: async () => ({personality:{enabled:false},revision:0}),
    personalityContext: async () => '', initiativeDelay: () => 30,
    learningContext:async()=>'', learningQuestionInstruction:'', parseLearningQuestion:()=>null, recordLearningQuestion:()=>[],
    readMemories: async () => [], selectMemories: () => [], readAgentMemories: async () => [],
    rankMemories: async (_env, memories) => memories, expressionHabits: () => '', embodiedIdentityInstruction: '',
    regionalConversation: async () => '', conversationStyle: () => '', aliasAwareness: () => '',
    messageDelay: () => '1 second',
    scheduleAllowed: () => '1',
  });
  for (const file of ['lib/model-preference.ts', 'chat/consent.ts', 'push/delivery.ts', 'chat/presence.ts', 'chat/temporal.ts', 'chat/initiative-adaptation.ts', 'chat/initiative.ts']) {
    vm.runInContext(source(file), f.context);
  }
  f.context.deliverPush = async () => {};
  f.context.museCompletion = async (env, messages, model) => {
    calls.push({ system: messages[0].content, evidence: JSON.parse(messages[1].content), model });
    return { role: 'assistant', content: JSON.stringify(response) };
  };
  f.sqlite.exec("UPDATE user SET chat_model='muse-spark-1.3-contributor' WHERE id='human'");
  const seed = (id = 'source', text = 'Hi!') => {
    f.sqlite.prepare(`INSERT INTO chat_turn(id,contact_id,user_id,user_text,status,workflow_id,created_at,updated_at,time_zone)
      VALUES (?,'private','human',?,'queued',?,?,?,'UTC')`).run(id, text, 'fixture-' + id, now, now);
    f.sqlite.prepare("UPDATE chat_turn SET status='complete',assistant_text='Hi!',updated_at=? WHERE id=?").run(now, id);
  };
  const plan = () => f.sqlite.prepare("SELECT * FROM conversation_initiative WHERE contact_id='private'").get();
  const messages = () => f.sqlite.prepare("SELECT * FROM chat_turn WHERE initiative_source_id IS NOT NULL ORDER BY sequence").all();
  const evaluate = async () => {
    const p = plan();
    assert.ok(p && p.next_at !== null && p.next_at <= now, 'evaluation must be due');
    f.sqlite.prepare('UPDATE conversation_initiative SET revision=revision+1,evaluations=evaluations+1,next_at=? WHERE contact_id=?')
      .run(now + 300000, p.contact_id);
    const job = { kind: 'initiative', contactID: p.contact_id, sourceID: p.source_id, revision: p.revision + 1 };
    const step = { do: async (name, ...args) => args.at(-1)(), sleep: async () => {} };
    await f.context.runInitiative(f.env, job, step);
    assert.deepEqual(f.state.logs, [], 'workflow must not hide a failure');
    return () => f.context.runInitiative(f.env, job, step);
  };
  try {
    await run({ ...f, seed, plan, messages, evaluate, calls,
      advance: ms => { now += ms; }, now: () => now, respond: value => {
        response = { ...decisionFields, kind: value.action === 'send' ? 'continuation' : null, ...value };
      } });
    assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
    checks++; console.log('PASS ' + name);
  } finally { f.sqlite.close(); }
}
(async () => {
  await check('new greeting is due at 30 seconds, sends a continuation and replay cannot duplicate it', async f => {
    f.seed(); assert.equal(f.plan().next_at, f.now() + 30000);
    f.advance(30000); const replay = await f.evaluate();
    assert.equal(f.messages().length, 1); assert.equal(f.plan().next_at, f.now() + 120000);
    assert.equal(f.calls[0].model, 'muse-spark-1.3-contributor');
    assert.equal(f.calls[0].evidence.timing.phase, 'initial-continuation');
    assert.match(f.calls[0].system, /bare greeting can welcome/);
    await replay(); assert.equal(f.messages().length, 1); assert.equal(f.calls.length, 1);
  });
  await check('unknown receptivity stops at two unanswered continuations despite short model delays', async f => {
    f.seed(); f.advance(30000); await f.evaluate();
    f.advance(120000); await f.evaluate();
    assert.equal(f.messages().length, 2); assert.equal(f.plan().next_at, null);
    assert.equal(f.calls[1].evidence.timing.phase, 'unanswered-follow-up');
    assert.equal(f.plan().sent, 2);
  });
  await check('AI waits and explicit stops stay intact under the faster cadence', async f => {
    f.seed(); f.advance(30000);
    f.respond({ action: 'wait', delaySeconds: 3600, intent: 'Respect requested return time', message: null });
    await f.evaluate(); assert.equal(f.messages().length, 0); assert.ok(f.plan().next_at >= f.now() + 3600000);
    f.advance(f.plan().next_at - f.now()); f.respond({ action: 'stop', delaySeconds: 30, intent: 'Wait for the user', message: null, permission: 'stop' });
    await f.evaluate(); assert.equal(f.plan().next_at, null); assert.equal(f.messages().length, 0);
  });
  await check('new human input and disabling initiative still invalidate the plan', async f => {
    f.seed(); f.advance(30000); await f.evaluate();
    f.seed('new-source'); assert.equal(f.plan().source_id, 'new-source'); assert.equal(f.plan().sent, 0);
    f.sqlite.exec("UPDATE contact SET initiative_enabled=0 WHERE id='private'");
    assert.equal(f.plan(), undefined); assert.equal(f.messages().length, 1);
  });
  await check('six wait decisions still exhaust the evaluation budget without messages', async f => {
    f.seed(); f.respond({ action: 'wait', delaySeconds: 30, intent: 'Wait briefly', message: null, engagement: 'uncertain' });
    for (let attempt = 0; attempt < 6; attempt++) { f.advance(f.plan().next_at - f.now()); await f.evaluate(); }
    assert.equal(f.plan().evaluations, 6); assert.equal(f.plan().next_at, null); assert.equal(f.messages().length, 0);
  });
  await check('an unrelated task cannot re-enable greetings after an unanswered greeting', async f => {
    f.seed(); f.respond({ action: 'send', delaySeconds: 30, intent: 'Greet once', message: 'Good afternoon!', kind: 'greeting' });
    f.advance(30000); await f.evaluate();
    assert.equal(f.plan().next_at, null);
    f.advance(4 * 3600000);
    f.seed('task-return', 'Please summarize this report.');
    f.respond({ action: 'send', delaySeconds: 30, intent: 'Try another greeting', message: 'Hello again!', kind: 'greeting',
      engagement: 'practical', response: 'unrelated' });
    f.advance(30000); await f.evaluate();
    assert.equal(f.messages().length, 1);
    assert.equal(f.plan().next_at, null);
    const feedback = f.sqlite.prepare("SELECT initiative_response,initiative_response_to_id FROM chat_turn WHERE id='task-return'").get();
    assert.equal(feedback.initiative_response, 'unrelated');
    assert.equal(feedback.initiative_response_to_id, f.messages()[0].id);
  });
  await check('closing a social exchange creates one varied future opportunity and ambient sends do not repeat', async f => {
    f.seed(); f.respond({ action: 'stop', delaySeconds: 30, intent: 'The exchange is complete', message: null });
    f.advance(30000); await f.evaluate();
    assert.equal(f.plan().mode, 'ambient');
    assert.equal(f.plan().evaluations, 0);
    assert.ok(f.plan().next_at > f.now() + 12 * 3600000);
    assert.equal(f.plan().expires_at, initialNow + 7 * 86400000);
    f.advance(f.plan().next_at - f.now());
    f.respond({ action: 'send', delaySeconds: 30, intent: 'Open a new conversation', message: 'How is your week going?', kind: 'check-in' });
    const replay = await f.evaluate();
    assert.equal(f.messages().length, 1); assert.equal(f.plan().next_at, null);
    await replay(); assert.equal(f.messages().length, 1);
  });
  await check('a conversational pause survives an unrelated task and needs explicit resumption', async f => {
    f.seed('pause', 'Please stop messaging me on your own.');
    f.respond({ action: 'stop', delaySeconds: 30, intent: 'Respect the pause', message: null, engagement: 'boundary', permission: 'stop' });
    f.advance(30000); await f.evaluate();
    const paused = () => f.sqlite.prepare("SELECT initiative_paused FROM contact WHERE id='private'").get().initiative_paused;
    assert.equal(paused(), 1);
    f.seed('task', 'Please explain this calculation.');
    f.respond({ action: 'send', delaySeconds: 30, intent: 'An unsolicited follow-up', message: 'Anything else?', engagement: 'practical' });
    f.advance(30000); await f.evaluate();
    assert.equal(paused(), 1); assert.equal(f.messages().length, 0);
    f.seed('resume', 'You can start conversations with me again.');
    f.respond({ action: 'send', delaySeconds: 30, intent: 'Resume by request', message: 'Glad to chat.', engagement: 'social', permission: 'allow' });
    f.advance(30000); await f.evaluate();
    assert.equal(paused(), 0); assert.equal(f.messages().length, 1);
  });
  await check('adaptive migration invalidates old drafts without rescheduling a stopped plan', async f => {
    f.seed();
    f.sqlite.exec("UPDATE conversation_initiative SET next_at=NULL,revision=9");
    const before = f.plan();
    f.sqlite.exec(fs.readFileSync(path.resolve(__dirname, '../../apps/api/migrations/0065_adaptive_initiative.sql'), 'utf8'));
    assert.equal(f.plan().revision, 10); assert.equal(f.plan().next_at, null);
    assert.equal(f.plan().source_id, before.source_id); assert.equal(f.plan().sent, before.sent);
    f.sqlite.exec("UPDATE contact SET archived_at=1 WHERE id='private'");
    assert.equal(f.plan(), undefined);
  }, 64);
  await check('learned windows follow human responses rather than the bot send hour', async f => {
    const samples = [];
    for (let daysAgo = 0; daysAgo < 3; daysAgo++) {
      const day = initialNow - daysAgo * 86400000;
      const at = (hour, minute) => new Date(day).setUTCHours(hour, minute, 0, 0);
      const outreachID = `morning-${daysAgo}`, humanID = `answer-${daysAgo}`;
      const base = { timeZone: 'UTC', replyToID: null, replyToSide: null };
      samples.push({ ...base, id: humanID, sequence: 10 - daysAgo * 2, createdAt: at(10, 17), repliedAt: at(10, 18),
        human: 1, proactive: 0, kind: null, engagement: 'social', response: 'engaged', responseTo: outreachID });
      samples.push({ ...base, id: outreachID, sequence: 9 - daysAgo * 2, createdAt: at(6, 0), repliedAt: at(6, 0),
        human: 0, proactive: 1, kind: 'greeting', engagement: null, response: null, responseTo: null });
    }
    const windows = f.context.activityWindows(samples, 'UTC', initialNow);
    assert.equal(windows.learned, true);
    assert.ok(windows.weights[10] > windows.weights[6]);
    assert.equal(f.context.activityWindows(samples.slice(0, 2), 'UTC', initialNow).learned, false);
    assert.equal(f.context.activityWindows(samples, 'America/Argentina/Buenos_Aires', initialNow).learned, false);
    const policy = f.context.adaptivePolicy(samples, 'answer-0', { enabled: false }, initialNow, false);
    const candidate = f.context.nextAmbientOpportunity({ samples, timeZone: 'UTC', policy,
      earliest: initialNow + 22 * 3600000, expiresAt: initialNow + 7 * 86400000, seed: 'fictional-opportunity' });
    assert.equal(typeof candidate, 'number');
    assert.ok(new Date(candidate).getUTCHours() >= 8 && new Date(candidate).getUTCHours() < 22);
    assert.equal(f.context.nextAmbientOpportunity({ samples, timeZone: null, policy,
      earliest: initialNow, expiresAt: initialNow + 86400000, seed: 'unknown-zone' }), null);
  });
  await check('upgrade advances only untouched episodes and preserves selected waits and stopped plans', async f => {
    f.seed(); assert.equal(f.plan().next_at, f.now() + 120000);
    for (const [contact, next, evaluations] of [['waiting', f.now() + 3600000, 1], ['stopped', null, 1], ['leased', f.now() + 300000, 1]]) {
      f.sqlite.prepare(`INSERT INTO contact(id,user_id,name,created_at,updated_at) VALUES (?,'human',?,0,0)`)
        .run(contact, contact);
      f.sqlite.prepare(`INSERT INTO chat_turn(id,contact_id,user_id,user_text,assistant_text,status,workflow_id,created_at,updated_at)
        VALUES (?,?,'human','Hi!','Hi!','complete',?,0,0)`).run(contact + '-source', contact, contact + '-workflow');
      f.sqlite.prepare(`INSERT INTO conversation_initiative(contact_id,source_id,anchor_id,revision,evaluations,next_at,expires_at)
        VALUES (?,?,?,1,?,?,?)`).run(contact, contact + '-source', contact + '-source', evaluations, next, f.now() + 86400000);
    }
    const before = f.sqlite.prepare("SELECT * FROM conversation_initiative WHERE contact_id!='private' ORDER BY contact_id").all();
    f.sqlite.exec(fs.readFileSync(path.resolve(__dirname, '../../apps/api/migrations/0033_faster_conversation_initiative.sql'), 'utf8'));
    assert.equal(f.plan().next_at, f.now() + 30000);
    assert.deepEqual(f.sqlite.prepare("SELECT * FROM conversation_initiative WHERE contact_id!='private' ORDER BY contact_id").all(), before);
    f.seed('new-source'); assert.equal(f.plan().next_at, f.now() + 30000);
  }, 32);
  console.log(`${checks} initiative regressions passed. Model quality, Cron timing and devices require separate live verification.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
