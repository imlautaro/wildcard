// Opt-in regressions: node scripts/checks/conversation-style.cjs
// Fictional in-memory data, real preference SQL and deterministic direction, no network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { fixture } = require('./personality.cjs');
const root = path.resolve(__dirname, '../..');
const plain = value => JSON.parse(JSON.stringify(value));
function load(context, file) {
  const code = stripTypeScriptTypes(fs.readFileSync(path.join(root, file), 'utf8'))
    .replace(/^import[\s\S]*?;[ \t]*\n/gm, '')
    .replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)/gm, '');
  vm.runInContext(code, context, { filename: file });
}
let checks = 0;
async function check(name, run) {
  const f = fixture();
  try {
    for (const file of ['shared/onboarding.ts', 'shared/voice.ts',
      'apps/api/src/personality/conversation.ts', 'apps/api/src/groups/conversation.ts']) load(f.context, file);
    f.context.parseLearningQuestion = () => null;
    load(f.context, 'apps/api/src/chat/messages.ts');
    load(f.context, 'apps/api/src/groups/context.ts');
    load(f.context, 'apps/api/src/voice/speech.ts');
    await run(f);
    assert.equal(f.sqlite.prepare('PRAGMA foreign_key_check').all().length, 0);
    checks++;
    console.log('PASS ' + name);
  } finally { f.sqlite.close(); }
}
(async () => {
  await check('writing habits survive retries and audience changes without copying local text', f => {
    const base = { agentID: 'actor', personality: f.profile, own: [], names: [] };
    const privateText = f.context.conversationStyle({ ...base, group: false, own: ['PRIVATE_WORDING_CANARY'] });
    const groupText = f.context.conversationStyle({ ...base, group: true });
    const habits = f.context.writingHabits('actor', f.profile);
    assert.deepEqual(plain(habits), plain(f.context.writingHabits('actor', f.profile)));
    assert.ok(privateText.includes(JSON.stringify(habits)) && groupText.includes(JSON.stringify(habits)));
    assert.ok(!groupText.includes('PRIVATE_WORDING_CANARY'));
    assert.ok(!privateText.includes('PRIVATE_WORDING_CANARY'));
    const variants = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(f.context.writingHabits(`contact-${i}`, f.profile))));
    assert.ok(variants.size >= 5, 'contacts must have distinct combinations');
  });
  await check('composed and reserved traits constrain text effects; disabled personality remains stable', f => {
    f.profile.traits.formality = 10; f.profile.traits.expressiveness = 1; f.profile.traits.playfulness = 1;
    const habits = f.context.writingHabits('actor', f.profile);
    assert.equal(habits.casing, 'standard capitalization');
    assert.equal(habits.punctuation, 'conventional punctuation, even in casual text');
    assert.equal(habits.laughter, 'rare written laughter');
    f.profile.enabled = false;
    const disabled = plain(f.context.writingHabits('actor', f.profile));
    f.profile.traits.formality = 1; f.profile.traits.expressiveness = 10;
    assert.deepEqual(plain(f.context.writingHabits('actor', f.profile)), disabled);
  });
  await check('name feedback handles first names, Unicode boundaries and literal punctuation', f => {
    const base = { agentID: 'actor', personality: f.profile, group: false };
    const feedback = (names, own) => f.context.conversationStyle({ ...base, names, own }).includes('Break that pattern now');
    assert.equal(feedback(['Alex Morgan'], ['Hello Alex', 'Thanks Alex']), true);
    assert.equal(feedback(['Ann'], ['Planning', 'Annual review']), false);
    assert.equal(feedback(['A+B'], ['Hello A+B', 'Thanks A+B']), true);
    assert.equal(feedback(['Zoë'], ['Hello Zoë', 'Thanks Zoë']), true);
    assert.equal(feedback(['Alex'], ['ALEX', 'Alex']), true);
  });
  await check('long-reply feedback is local and bounded instead of changing a shared personality', f => {
    const base = { agentID: 'actor', personality: f.profile, names: [], group: true };
    const long = 'word '.repeat(60);
    assert.ok(f.context.conversationStyle({ ...base, own: [long, long, long] }).includes('Several recent replies'));
    assert.ok(!f.context.conversationStyle({ ...base, own: Array(8).fill('Brief.').concat([long, long, long]) }).includes('Several recent replies'));
    assert.ok(!f.context.conversationStyle({ ...base, own: [] }).includes('Several recent replies'));
  });
  await check('peer name repetition corrects the shared round without importing private text', f => {
    const base = { agentID: 'actor', personality: f.profile, names: ['Alex'], own: [], peers: ['Hello Alex, PEER_CANARY'] };
    const group = f.context.conversationStyle({ ...base, group: true });
    assert.ok(group.includes('Other agents have already named participants'));
    assert.ok(!group.includes('PEER_CANARY'));
    assert.ok(!f.context.conversationStyle({ ...base, group: false }).includes('Other agents have already named participants'));
  });
  await check('categorical delivery validates recipients without granting tools or entering published text', f => {
    const input = { memberIDs: ['user:alice', 'agent:peer'], allowedActions: ['reply', 'skip'],
      openingReplyRequired: false, throughSequence: 7, contextMessageIDs: [], previous: null };
    const delivery = { audience: 'group', recipientIDs: [], nameUse: 'omit', depth: 'brief', followUp: 'none' };
    const answer = { action: 'reply', delivery, messages: ['A shared thought.'], replyToID: null,
      includeImage: false, invitesReply: false, learningQuestion: null };
    const parse = value => f.context.parseGroupDecision(JSON.stringify(value), input);
    assert.equal(parse(answer).text, 'A shared thought.');
    assert.ok(!JSON.stringify(parse(answer)).includes('nameUse'));
    assert.ok(f.context.validDelivery({ ...delivery, audience: 'individual', recipientIDs: ['agent:peer'] }, input.memberIDs));
    assert.throws(() => parse({ ...answer, delivery: { ...delivery, audience: 'individual', recipientIDs: ['user:departed'] } }), /GROUP_INVALID_DECISION/);
    assert.throws(() => parse({ ...answer, delivery: { ...delivery, audience: 'none' } }), /GROUP_INVALID_DECISION/);
    assert.equal(parse({ ...answer, action: 'skip', messages: [] }).text, null);
    const { delivery: ignored, ...legacy } = answer;
    assert.equal(parse(legacy).text, 'A shared thought.');
    const schema = f.context.groupDecisionFormat(input).json_schema.schema;
    assert.ok(schema.required.includes('delivery'));
    assert.deepEqual(Array.from(schema.properties.delivery.properties.recipientIDs.items.enum), input.memberIDs);
  });
  await check('wording review flags possible routing problems without treating every mention as an error', f => {
    assert.equal(f.context.needsDeliveryReview('A shared thought.', ['Alex']), false);
    assert.equal(f.context.needsDeliveryReview('Hello Alex.', ['Alex Morgan']), true);
    assert.equal(f.context.needsDeliveryReview('What do you think?', []), true);
    assert.equal(f.context.needsDeliveryReview('Planning is complete.', ['Ann']), false);
    assert.equal(f.context.needsDeliveryReview(null, ['Alex']), false);
    assert.ok(f.context.currentAudienceInstruction('group').includes('whole group'));
    assert.equal(f.context.currentAudienceInstruction(), '');
  });
  await check('voice fitness keeps written effects as text without rewriting the message', f => {
    const plain = 'That was a useful discovery, and now we can get back to the conversation.';
    assert.equal(f.context.voiceSuitable(plain), true);
    for (const effect of [' hahaha', ' soooo', ' 🙂', ' 🇦🇷']) assert.equal(f.context.voiceSuitable(plain + effect), false);
    assert.equal(f.context.voiceSuitable('Thanks.'), false);
    assert.equal(f.context.voiceSuitable(plain + ' https://example.invalid'), false);
  });
  await check('generated regional preferences are read independently of voice opt-in without forwarding the job', async f => {
    f.sqlite.prepare(`INSERT INTO contact_generation(id,user_id,input_json,status,contact_id,updated_at)
      VALUES ('generated','owner',?,'complete','private-owner',0)`)
      .run(JSON.stringify({ country: 'AR', language: 'es', privateField: 'CREATOR_CANARY' }));
    const direction = await f.context.regionalConversation(f.DB, 'actor');
    assert.ok(direction.includes('Argentina') && direction.includes('Spanish') && direction.includes('voseo'));
    assert.ok(!direction.includes('CREATOR_CANARY') && !direction.includes('private-owner'));
    f.sqlite.prepare("UPDATE contact_agent SET speech_accent = 'MX' WHERE id = 'actor'").run();
    const override = await f.context.regionalConversation(f.DB, 'actor');
    assert.ok(override.includes('Mexico') && !override.includes('voseo'));
    f.sqlite.prepare("UPDATE contact_agent SET speech_accent = NULL WHERE id = 'actor'").run();
    assert.equal(await f.context.regionalConversation(f.DB, 'actor'), direction);
  });
  await check('onboarding fallback applies only to the original first-circle contact', async f => {
    f.sqlite.prepare(`INSERT INTO account_onboarding(user_id,input_json,plan_json,status,updated_at)
      VALUES ('owner',?,?,'complete',0)`).run(JSON.stringify({ country: 'UY', language: 'es', name: 'CREATOR_CANARY' }), JSON.stringify({ contacts: [{ id: 'peer' }] }));
    const manual = await f.context.regionalConversation(f.DB, 'actor');
    assert.ok(!manual.includes('Uruguay') && !manual.includes('CREATOR_CANARY'));
    f.sqlite.prepare("UPDATE account_onboarding SET plan_json = ? WHERE user_id = 'owner'").run(JSON.stringify({ contacts: [{ id: 'actor' }] }));
    const initial = await f.context.regionalConversation(f.DB, 'actor');
    assert.ok(initial.includes('Uruguay') && initial.includes('voseo') && !initial.includes('CREATOR_CANARY'));
    assert.ok(!(await f.context.regionalConversation(f.DB, 'peer')).includes('Uruguay'));
  });
  await check('unknown region codes cannot inject instructions or imply a dialect', f => {
    const direction = f.context.regionalDirection({ accent: 'INJECT_CANARY', country: 'INJECT_CANARY', language: 'INJECT_CANARY' });
    assert.ok(!direction.includes('INJECT_CANARY') && !direction.includes('Regional wording preference:'));
  });
  await check('group-wide tone does not force the trigger author while directed replies retain their target', f => {
    const plan = appraisal => f.context.directPerformance(f.profile, f.people, new Map(), appraisal,
      'user:alice', [], true, Date.now());
    const broad = plan(f.appraisal('neutral', { engagement: 'group', replyTargets: ['user:alice'] }));
    assert.deepEqual(plain(broad.primaryRecipients), []);
    const directed = plan(f.appraisal('neutral', { engagement: 'self', replyTargets: ['user:bob'] }));
    assert.deepEqual(plain(directed.primaryRecipients), ['user:bob']);
    const privatePlan = f.context.directPerformance(f.profile, f.people, new Map(), f.appraisal('neutral'),
      'user:alice', [], false, Date.now());
    assert.deepEqual(plain(privatePlan.primaryRecipients), ['user:alice']);
  });
  await check('participation tracks actual visible messages, independent of arrival order or duplicate context', f => {
    const members = [{ kind: 'user', id: 'alice' }, { kind: 'agent', id: 'actor' }, { kind: 'agent', id: 'waiting' }];
    const messages = [
      { id: 'bot-reply', sequence: 4, userID: null, agentID: 'actor' },
      { id: 'human-answer', sequence: 3, userID: 'alice', agentID: null },
      { id: 'trigger', sequence: 2, userID: 'alice', agentID: null },
      { id: 'old', sequence: 1, userID: null, agentID: 'actor' },
    ];
    const result = plain(f.context.groupParticipation(members, [...messages, messages[0]], 2));
    assert.equal(result.historyIsPartial, true);
    assert.deepEqual(result.members.map(m => m.visibleMessageIDsAfterTrigger), [['human-answer'], ['bot-reply'], []]);
    assert.equal(JSON.stringify(result).includes('answered'), false);
    assert.deepEqual(result, plain(f.context.groupParticipation(members, [...messages].reverse(), 2)));
    const departed = plain(f.context.groupParticipation(members.slice(0, 1), messages, 2));
    assert.equal(departed.members.length, 1);
    assert.ok(!JSON.stringify(departed).includes('bot-reply'));
  });
  await check('round history retains successive bubbles with the same group, author and consent filters', async f => {
    f.groupEvent('burst', 'alice', 'group-a');
    f.sqlite.exec(`INSERT INTO group_message(id,group_id,agent_id,sender_name,text,created_at,contributor_consent)
      VALUES ('burst/part/1','group-a','actor','Demo Character','The actual answer is in this second bubble',0,1),
        ('burst/part/2','group-a','peer','Other Character','A different author cannot extend this reply',0,1);`);
    const source = fs.readFileSync(path.join(root, 'apps/api/src/groups/context.ts'), 'utf8');
    let query = [...source.matchAll(/\.prepare\(`([^`]+)`\)/g)].map(match => match[1])
      .find(sql => sql.includes('FROM group_reply reply'));
    for (const name of ['messageColumns', 'visibleMessage']) {
      const fragment = source.match(new RegExp(`const ${name} = \u0060([^\u0060]+)\u0060`))[1];
      query = query.replace('${' + name + '}', fragment);
    }
    const through = f.sqlite.prepare("SELECT MAX(sequence) n FROM group_message WHERE group_id = 'group-a'").get().n;
    const read = () => f.DB.prepare(query).bind('group-a', through, 0, 'source-burst').all();
    assert.deepEqual((await read()).results.map(row => row.id), ['burst', 'burst/part/1']);
    f.sqlite.prepare("UPDATE group_message SET contributor_consent = 0 WHERE id = 'burst/part/1'").run();
    assert.deepEqual((await f.DB.prepare(query).bind('group-a', through, 1, 'source-burst').all()).results.map(row => row.id), ['burst']);
    f.sqlite.prepare("DELETE FROM group_agent WHERE group_id = 'group-a' AND agent_id = 'actor'").run();
    assert.deepEqual((await read()).results, []);
  });
  console.log(`Passed ${checks} conversation style regressions; model semantics are not evaluated.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
