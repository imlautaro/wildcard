// Opt-in regressions: real migrated SQLite and initiative Workflow, simulated model/time.
// No network, provider credentials, APNs, persistent database or user data.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { source } = require('./group-publication.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
function fixture(version = 33) {
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
    try { for (const statement of statements) await statement.run(); sqlite.exec('COMMIT'); }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
  sqlite.exec(`INSERT INTO user(id,name,email,created_at,updated_at) VALUES ('human','Demo Human','human@example.invalid',0,0);
    INSERT INTO contact(id,user_id,name,created_at,updated_at) VALUES ('private','human','Demo Contact',0,0);`);
  const state = { logs: [] };
  const context = vm.createContext({ console: { error: value => state.logs.push(JSON.parse(value)) },
    isRecord: value => value !== null && typeof value === 'object' && !Array.isArray(value),
    safeErrorCode: error => error.message, clipText: text => text });
  return { sqlite, state, context, env: { DB, META_CHAT_MODEL: 'muse-spark-1.3-contributor' } };
}
let checks = 0;
const initialNow = Date.UTC(2026, 9, 28, 12);
async function check(name, run, version = 33) {
  const f = fixture(version);
  let now = initialNow;
  const calls = [];
  let response = { action: 'send', delaySeconds: 30, intent: 'Continue naturally', message: 'What has caught your interest today?' };
  Object.assign(f.context, {
    Date: class extends Date { static now() { return now; } },
    privateContact: async () => false,
    readPersonality: async () => ({personality:{enabled:false}}),
    personalityContext: async () => '', initiativeDelay: () => 30,
    readMemories: async () => [], selectMemories: () => [], readAgentMemories: async () => [],
    scheduleAllowed: () => '1',
  });
  for (const file of ['lib/model-preference.ts', 'chat/consent.ts', 'push/delivery.ts', 'chat/initiative.ts']) {
    vm.runInContext(source(file), f.context);
  }
  f.context.deliverPush = async () => {};
  f.context.museCompletion = async (env, messages, model) => {
    calls.push({ system: messages[0].content, evidence: JSON.parse(messages[1].content), model });
    return { role: 'assistant', content: JSON.stringify(response) };
  };
  f.sqlite.exec("UPDATE user SET chat_model='muse-spark-1.3-contributor' WHERE id='human'");
  const seed = (id = 'source') => {
    f.sqlite.prepare(`INSERT INTO chat_turn(id,contact_id,user_id,user_text,status,workflow_id,created_at,updated_at,time_zone)
      VALUES (?,'private','human','Hi!','queued',?,?,?,'UTC')`).run(id, 'fixture-' + id, now, now);
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
    const step = { do: async (name, ...args) => args.at(-1)() };
    await f.context.runInitiative(f.env, job, step);
    assert.deepEqual(f.state.logs, [], 'workflow must not hide a failure');
    return () => f.context.runInitiative(f.env, job, step);
  };
  try {
    await run({ ...f, seed, plan, messages, evaluate, calls,
      advance: ms => { now += ms; }, now: () => now, respond: value => { response = value; } });
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
    assert.match(f.calls[0].system, /greeting is an opening/);
    await replay(); assert.equal(f.messages().length, 1); assert.equal(f.calls.length, 1);
  });
  await check('unanswered follow-ups slow down and stop at three messages despite short model delays', async f => {
    f.seed(); f.advance(30000); await f.evaluate();
    f.advance(120000); await f.evaluate();
    assert.equal(f.messages().length, 2); assert.equal(f.plan().next_at, f.now() + 600000);
    assert.equal(f.calls[1].evidence.timing.phase, 'unanswered-follow-up');
    f.advance(600000); await f.evaluate();
    assert.equal(f.messages().length, 3); assert.equal(f.plan().sent, 3); assert.equal(f.plan().next_at, null);
  });
  await check('AI waits and explicit stops stay intact under the faster cadence', async f => {
    f.seed(); f.advance(30000);
    f.respond({ action: 'wait', delaySeconds: 3600, intent: 'Respect requested return time', message: null });
    await f.evaluate(); assert.equal(f.messages().length, 0); assert.equal(f.plan().next_at, f.now() + 3600000);
    f.advance(3600000); f.respond({ action: 'stop', delaySeconds: 30, intent: 'Wait for the user', message: null });
    await f.evaluate(); assert.equal(f.plan().next_at, null); assert.equal(f.messages().length, 0);
  });
  await check('new human input and disabling initiative still invalidate the plan', async f => {
    f.seed(); f.advance(30000); await f.evaluate();
    f.seed('new-source'); assert.equal(f.plan().source_id, 'new-source'); assert.equal(f.plan().sent, 0);
    f.sqlite.exec("UPDATE contact SET initiative_enabled=0 WHERE id='private'");
    assert.equal(f.plan(), undefined); assert.equal(f.messages().length, 1);
  });
  await check('six wait decisions still exhaust the evaluation budget without messages', async f => {
    f.seed(); f.respond({ action: 'wait', delaySeconds: 30, intent: 'Wait briefly', message: null });
    for (let attempt = 0; attempt < 6; attempt++) { f.advance(30000); await f.evaluate(); }
    assert.equal(f.plan().evaluations, 6); assert.equal(f.plan().next_at, null); assert.equal(f.messages().length, 0);
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
