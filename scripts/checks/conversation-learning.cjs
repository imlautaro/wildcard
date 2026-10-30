// Opt-in: node scripts/checks/conversation-learning.cjs (Node 24+).
// Fictional data, real migrated SQLite, simulated inference, no network or credentials.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { fixture, source } = require('./group-publication.cjs');
let checks = 0;
async function check(name, run) {
  const f = fixture(), calls = [], answers = [];
  const c = vm.createContext({ console, Date, JSON, TextEncoder, TextDecoder,
    isRecord: x => x !== null && typeof x === 'object' && !Array.isArray(x),
    byteLength: x => Buffer.byteLength(x), clipText: x => x,
    embodiedIdentityInstruction: '', readPersonality: async () => ({ personality: { description: 'A thoughtful fictional contact.' } }),
    museCompletion: async (_env, messages, model) => {
      calls.push({ model, data: JSON.parse(messages[1].content) });
      const answer = answers.shift(); assert.ok(answer, 'unexpected inference');
      return typeof answer === 'function' ? answer() : { content: JSON.stringify(answer) };
    },
  });
  vm.runInContext(source('chat/learning.ts'), c);
  const env = { ...f.env, META_CHAT_MODEL: 'muse-spark-1.3' };
  const scope = { kind: 'contact', id: 'private', agentID: 'sender', userID: 'human' };
  const now = Date.now();
  function turns() {
    for (let n = 1; n <= 3; n++) f.sqlite.prepare(`INSERT INTO chat_turn
      (id, contact_id, user_id, user_text, assistant_text, status, workflow_id, created_at, updated_at)
      VALUES (?, 'private', 'human', ?, 'Happy to help.', 'complete', ?, ?, ?)`)
      .run('sample-' + n, n === 3 ? 'I would like better headphones for music.' : 'Keep it brief, please.', 'sample-wf-' + n, now + n, now + n);
  }
  const question = { key: 'music_taste', kind: 'question', text: 'Which music does this person enjoy?', confidence: 'tentative',
    evidence: [{ id: 'sample-3', side: 'human', quote: 'better headphones for music' }],
    opportunity: 'When discussing music or headphones for listening.', avoid: 'Urgent work, closure, or an unanswered question.', status: 'pending', answer: '' };
  try { await run({ ...f, c, env, scope, now, calls, answers, turns, question }); checks++; console.log('PASS ' + name); }
  finally { f.sqlite.close(); }
}

(async () => {
  await check('incremental review learns grounded curiosity and does not repeat inference without new input', async f => {
    f.turns(); f.answers.push({ items: [f.question] });
    await f.c.maintainLearning(f.env, f.scope);
    assert.equal(f.calls.length, 1);
    assert.match(await f.c.learningContext(f.env, f.scope), /music_taste/);
    await f.c.maintainLearning(f.env, f.scope);
    assert.equal(f.calls.length, 1);
    assert.equal(f.count('contact_memory'), 0, 'derived learning is not factual memory');
    assert.equal(await f.c.learningContext(f.env, { ...f.scope, userID: 'other' }), '');
    assert.equal(await f.c.learningSnapshot(f.env.DB, 'contact', 'private', 'other'), null);
  });
  await check('reset during inference cannot resurrect learning from older messages', async f => {
    f.turns();
    f.answers.push(() => {
      f.sqlite.exec(`UPDATE contact SET learning_revision = learning_revision + 1,
        learning_since = (SELECT MAX(sequence) FROM chat_turn) WHERE id = 'private'; DELETE FROM conversation_learning;`);
      return { content: JSON.stringify({ items: [f.question] }) };
    });
    await f.c.maintainLearning(f.env, f.scope);
    assert.equal(f.count('conversation_learning'), 0);
    await f.c.maintainLearning(f.env, f.scope);
    assert.equal(f.calls.length, 1, 'reset excludes the old history');
  });
  await check('connector isolation rejects Contributor and permits only local Standard learning', async f => {
    f.turns(); f.sqlite.exec("INSERT INTO mcp_private_contact(contact_id) VALUES ('private')");
    await f.c.maintainLearning({ ...f.env, META_CHAT_MODEL: 'muse-spark-1.3-contributor' }, f.scope);
    assert.equal(f.calls.length, 0);
    f.answers.push({ items: [f.question] }); await f.c.maintainLearning(f.env, f.scope);
    assert.equal(f.calls[0].model, 'muse-spark-1.3');
    assert.equal(await f.c.learningContext({ ...f.env, META_CHAT_MODEL: 'muse-spark-1.3-contributor' }, f.scope), '');
  });
  await check('Standard-derived profiles never enter Contributor context', async f => {
    f.turns(); f.answers.push({ items: [f.question] }); await f.c.maintainLearning(f.env, f.scope);
    assert.ok(!(await f.c.learningContext({ ...f.env, META_CHAT_MODEL: 'muse-spark-1.3-contributor' }, f.scope)).includes('music_taste'));
  });
  await check('question records require an actual published quote and publication replay is idempotent', async f => {
    f.turns(); f.answers.push({ items: [f.question] }); await f.c.maintainLearning(f.env, f.scope);
    const question = { key: 'music_taste', quote: 'What music do you enjoy?' };
    await f.env.DB.batch(f.c.recordLearningQuestion(f.env.DB, 'contact', 'sample-3', question, f.now));
    let items = JSON.parse(f.sqlite.prepare('SELECT profile_json FROM conversation_learning').get().profile_json);
    assert.equal(items[0].status, 'pending');
    f.sqlite.prepare("UPDATE chat_turn SET assistant_text = ?, assistant_messages_json = ? WHERE id = 'sample-3'")
      .run(question.quote, JSON.stringify([{ text: question.quote }]));
    await f.env.DB.batch(f.c.recordLearningQuestion(f.env.DB, 'contact', 'sample-3', question, f.now));
    const saved = f.sqlite.prepare('SELECT revision, profile_json FROM conversation_learning').get();
    assert.equal(JSON.parse(saved.profile_json)[0].status, 'asked');
    await f.env.DB.batch(f.c.recordLearningQuestion(f.env.DB, 'contact', 'sample-3', question, f.now));
    assert.deepEqual(f.sqlite.prepare('SELECT revision, profile_json FROM conversation_learning').get(), saved);
  });
  await check('group learning uses only the attributed human in that group and is removed on access loss', async f => {
    f.sqlite.exec("INSERT INTO group_member(group_id,user_id,share_memory,contributor_consent,joined_at) VALUES ('group','other',1,1,0)");
    for (let n = 1; n <= 3; n++) f.sqlite.prepare(`INSERT INTO group_message
      (id,group_id,user_id,sender_name,text,created_at,contributor_consent) VALUES (?, 'group', 'human', 'Demo Human', 'Keep it brief, please.', ?, 1)`)
      .run('group-' + n, f.now + n);
    f.sqlite.prepare(`INSERT INTO group_message(id,group_id,user_id,sender_name,text,created_at,contributor_consent)
      VALUES ('other-message','group','other','Other Human','Unrelated personal preference.',?,1)`).run(f.now);
    const group = { ...f.scope, kind: 'group', id: 'group' };
    f.answers.push({ items: [{ ...f.question, key: 'preferred_detail', text: 'Which topics welcome more detail?',
      evidence: [{ id: 'group-3', side: 'human', quote: 'Keep it brief' }] }] });
    await f.c.maintainLearning(f.env, group);
    assert.equal(f.calls[0].data.samples.length, 3);
    assert.ok(!JSON.stringify(f.calls[0].data).includes('Unrelated personal preference'));
    assert.equal((await f.c.learningSnapshot(f.env.DB, 'group', 'group', 'other')).profiles.length, 0);
    assert.ok(!(await f.c.learningContext(f.env, f.scope)).includes('preferred_detail'));
    f.sqlite.exec("DELETE FROM group_member WHERE group_id = 'group' AND user_id = 'other'");
    assert.equal(f.count('conversation_learning'), 0);
  });
  await check('unsupported evidence and assistant-authored human facts are rejected; asked questions cannot be requeued', async f => {
    const row = { id: 'sample-3', sequence: 3, human: 'I like music.', assistant: 'What music?', at: f.now };
    assert.equal(f.c.parseLearning({ items: [f.question] }, [row], [], f.now), null);
    assert.equal(f.c.parseLearning({ items: [{ ...f.question, kind: 'observation', evidence: [{ id: row.id, side: 'assistant', quote: 'What music?' }] }] }, [row], [], f.now), null);
    const asked = { ...f.question, status: 'asked', evidence: [{ id: row.id, side: 'assistant', quote: 'What music?' }], updatedAt: f.now, expiresAt: f.now + 86400000 };
    assert.equal(f.c.parseLearning({ items: [{ ...asked, status: 'pending' }] }, [row], [asked], f.now), null);
    assert.equal(f.c.parseLearning({ items: [] }, [row], [asked], f.now)[0].status, 'asked');
    assert.throws(() => f.c.parseLearningQuestion({ key: 'music_taste', quote: 'Not published' }, ['Something else.']));
  });
  await check('expiry and source deletion remove derived content', async f => {
    f.turns(); f.answers.push({ items: [f.question] }); await f.c.maintainLearning(f.env, f.scope);
    f.sqlite.exec("UPDATE conversation_learning SET profile_json = json_set(profile_json, '$[0].expiresAt', 1)");
    await f.c.pruneLearning(f.env.DB);
    assert.equal(JSON.parse(f.sqlite.prepare('SELECT profile_json FROM conversation_learning').get().profile_json).length, 0);
    f.sqlite.exec("DELETE FROM chat_turn WHERE id = 'sample-3'");
    assert.equal(f.count('conversation_learning'), 0);
  });
  console.log(`${checks} conversation learning checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
