// Opt-in fictional regressions; no external service or real model calls.
// Run: node scripts/checks/group-concurrency.cjs
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { fixture, source } = require('./group-publication.cjs');
(async () => {
  const f = fixture();
  try {
    f.sqlite.exec(`INSERT INTO contact_agent(id,owner_id,name,memory_shared) VALUES ('third','human','Bot Three',1);
      INSERT INTO contact(id,user_id,name,agent_id,created_at,updated_at) VALUES ('third-private','human','Bot Three','third',0,0);
      INSERT INTO group_agent(group_id,agent_id,added_by,joined_at) VALUES ('group','third','human',0);
      INSERT INTO group_message(id,group_id,user_id,sender_name,text,created_at,contributor_consent)
        VALUES ('source','group','human','Demo Human','Everyone, give your perspective.',0,1);`);
    for (const [index, agent] of ['sender','target','third'].entries()) {
      f.sqlite.prepare(`INSERT INTO group_reply(id,group_id,agent_id,source_id,workflow_id,created_at)
        VALUES (?,'group',?,'source',?,0)`).run(`reply-${index}`,agent,`workflow-${index}`);
    }
    f.env.CHAT_WORKFLOW = { create: async () => ({}), get: async () => ({ status: async () => ({ status:'running' }) }) };
    f.context.validWorkflowID = () => true;
    vm.runInContext(source('chat/dispatch.ts'), f.context);
    vm.runInContext(source('groups/workflow.ts'), f.context);
    await Promise.all(['sender','target','third'].map(id => f.context.dispatchAgent(f.env,id)));
    assert.equal(f.count('agent_attention'),2,'exactly two atomic group claims');
    assert.equal(f.sqlite.prepare("SELECT 1 FROM agent_attention WHERE agent_id='third'").get(),undefined);
    f.sqlite.exec("UPDATE group_reply SET status='running' WHERE id IN (SELECT turn_id FROM agent_attention)");
    const first={kind:'group',turnID:'reply-0',attempt:1};
    const second={kind:'group',turnID:'reply-1',attempt:1};
    assert.equal(await f.context.claimPublication(f.env,second),true,'second ready draft may publish first');
    assert.equal(await f.context.claimPublication(f.env,first),false,'one publication lane');
    assert.equal(await f.context.claimPublication(f.env,second),true,'replay owns the same reservation');
    f.sqlite.exec("UPDATE group_reply SET status='complete' WHERE id='reply-1'");
    assert.equal(await f.context.claimPublication(f.env,first),true,'terminal reservation recovered');
    await f.context.releasePublication(f.env,second);
    assert.equal(f.count('group_publication'),1,'old attempt cannot release another reservation');
    await f.context.releaseAttention(f.env,second);
    await f.context.dispatchGroup(f.env,'group');
    assert.equal(f.count('agent_attention'),2,'refill only the freed preparation slot');
    assert.ok(f.sqlite.prepare("SELECT 1 FROM agent_attention WHERE agent_id='third'").get());
    f.sqlite.exec("DELETE FROM group_reply WHERE id='reply-0'");
    assert.equal(f.count('group_publication'),0,'clear/delete cascades release publication');
    assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
    console.log('PASS two preparers, readiness, exclusivity, replay, recovery, refill and cascade');
  } finally { f.sqlite.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
