// Opt-in: node scripts/checks/conversation-memory.cjs (Node 24+).
// Real SQL/migrations in memory, fictional messages, simulated inference, no network.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { fixture, source } = require('./group-publication.cjs');
let checks = 0;
async function check(name, run) {
  const f = fixture();
  const calls = [];
  const responses = [];
  const c = vm.createContext({ console, Date, JSON, TextEncoder, TextDecoder,
    standardModel: 'muse-spark-1.3',
    accountEnvironment: async env => ({ ...env, META_CHAT_MODEL: 'muse-spark-1.3-contributor' }),
    privateContact: async (db, id) => !!await db.prepare('SELECT 1 FROM mcp_private_contact WHERE contact_id = ?').bind(id).first(),
    contactModelAllowed: async () => true,
    isRecord: x => x !== null && typeof x === 'object' && !Array.isArray(x),
    museCompletion: async (env, messages, model) => {
      calls.push({ model, messages });
      const response = responses.shift();
      assert.ok(response, 'unexpected inference');
      if (response instanceof Error) throw response;
      if (typeof response === 'function') return response();
      return { content: JSON.stringify(response) };
    },
  });
  for (const file of ['groups/memory.ts', 'chat/memory.ts', 'chat/agent-memory.ts']) vm.runInContext(source(file), c);
  function completed(id, text, reply = 'My favorite color is green.') {
    f.sqlite.prepare(`INSERT INTO chat_turn(id,contact_id,user_id,user_text,assistant_text,status,workflow_id,created_at,updated_at)
      VALUES (?,'private','human',?,?,'running',?,0,0)`).run(id,text,reply,'wf-'+id);
    f.sqlite.prepare("UPDATE chat_turn SET status='complete' WHERE id=?").run(id);
    return Number(f.sqlite.prepare('SELECT sequence FROM chat_turn WHERE id=?').get(id).sequence);
  }
  function humanReply(group, id, text) {
    f.sqlite.prepare(`INSERT INTO group_message(id,group_id,user_id,sender_name,text,created_at,contributor_consent)
      VALUES (?,?,'human','Demo Human',?,0,1)`).run(id,group,text);
    f.sqlite.prepare(`INSERT INTO group_reply(id,group_id,agent_id,source_id,status,workflow_id,created_at)
      VALUES (?,?,'sender',?,'complete',?,0)`).run('reply-'+id,group,id,'wf-'+id);
    f.sqlite.exec('DELETE FROM agent_attention');
    f.sqlite.prepare(`INSERT INTO agent_attention(agent_id,turn_id,attempt,workflow_id,acquired_at)
      VALUES ('sender',?,1,?,0)`).run('reply-'+id,'wf-'+id);
  }
  try { await run({ ...f, c, calls, responses, completed, humanReply }); checks++; console.log('PASS '+name); }
  finally { f.sqlite.close(); }
}
(async () => {
  await check('isolated private human memory learns with Standard and stays private', async f => {
    f.sqlite.exec("INSERT INTO mcp_private_contact(contact_id) VALUES ('private')");
    const sequence = f.completed('turn','I prefer tea.');
    f.responses.push({ changes: [{ operation:'upsert',key:'drink',kind:'preference',content:'Demo Human prefers tea.',sourceTurnID:'turn',sourceQuote:'I prefer tea.' }] });
    await f.c.maintainMemories(f.env,{contactID:'private',userID:'human',beforeSequence:sequence+1});
    assert.equal(f.calls[0].model,'muse-spark-1.3');
    const scope = {contactID:'private',userID:'human',beforeSequence:sequence+1,privateConversation:true};
    assert.equal((await f.c.readMemories(f.env.DB,scope)).length,1);
    assert.equal((await f.c.readMemories(f.env.DB,{...scope,privateConversation:false})).length,0);
    f.sqlite.exec(`INSERT INTO contact(id,user_id,name,agent_id,created_at,updated_at)
      VALUES ('other-private','other','Bot One','sender',0,0)`);
    assert.equal((await f.c.readMemories(f.env.DB,{...scope,contactID:'other-private',userID:'other'})).length,0);
  });
  await check('private self memory is local and survives connector revocation', async f => {
    f.sqlite.exec("INSERT INTO mcp_private_contact(contact_id) VALUES ('private')");
    f.completed('turn','Choose a color.');
    const event = Number(f.sqlite.prepare("SELECT sequence FROM agent_memory_event WHERE private_turn_id='turn'").get().sequence);
    f.responses.push({changes:[{sourceSequence:event,key:'favorite_color',kind:'preference',content:'My favorite color is green.',quote:'My favorite color is green.'}]});
    await f.c.maintainAgentMemories(f.env,'sender','human',{contactID:'private'});
    assert.equal(f.calls[0].model,'muse-spark-1.3');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM agent_memory').get().n,0);
    assert.equal((await f.c.readAgentMemories(f.env.DB,'sender',false,'human',{contactID:'private'})).length,1);
    assert.equal((await f.c.readAgentMemories(f.env.DB,'sender',false,'human')).length,0);
    assert.equal((await f.c.readAgentMemories(f.env.DB,'sender',true,'human',{contactID:'private'})).length,0);
    f.sqlite.exec('DELETE FROM mcp_contact_access');
    assert.equal((await f.c.readAgentMemories(f.env.DB,'sender',false,'human',{contactID:'private'})).length,1);
    assert.equal((await f.c.readAgentMemories(f.env.DB,'sender',false,'other',{contactID:'private'})).length,0);
  });
  await check('two isolated groups keep independent keys without shared export', async f => {
    f.sqlite.exec(`INSERT INTO chat_group(id,owner_id,name,created_at) VALUES ('second','human','Second Group',0);
      INSERT INTO group_member(group_id,user_id,share_memory,contributor_consent,joined_at) VALUES ('second','human',1,1,0);
      INSERT INTO group_agent(group_id,agent_id,added_by,joined_at) VALUES ('second','sender','human',0);
      INSERT INTO mcp_private_group(group_id) VALUES ('group'),('second');`);
    const env = {...f.env,META_CHAT_MODEL:'muse-spark-1.3'};
    for (const [group,text] of [['group','I prefer tea.'],['second','I prefer coffee.']]) {
      f.humanReply(group,'human-'+group,text);
      f.responses.push({memories:[{key:'drink',kind:'preference',content:text,quote:text}]});
      await f.c.rememberGroupMessage(env,'reply-human-'+group,1);
    }
    assert.equal((await f.c.localGroupMemories(env.DB,'sender','group','human'))[0].content,'I prefer tea.');
    assert.equal((await f.c.localGroupMemories(env.DB,'sender','second','human'))[0].content,'I prefer coffee.');
    assert.equal((await f.c.localGroupMemories(env.DB,'sender','group','other')).length,0);
    assert.equal((await f.c.groupMemories(env.DB,'sender',false)).length,0);
    f.sqlite.exec("DELETE FROM group_agent WHERE group_id='group' AND agent_id='sender'");
    assert.equal((await f.c.localGroupMemories(env.DB,'sender','group','human')).length,0);
  });
  await check('group self memory remains in its source audience and cascades on removal', async f => {
    f.sqlite.exec(`INSERT INTO mcp_private_group(group_id) VALUES ('group');
      INSERT INTO group_message(id,group_id,agent_id,sender_name,text,created_at,contributor_consent)
      VALUES ('bot','group','sender','Bot One','I prefer green.',0,1);`);
    const event = Number(f.sqlite.prepare("SELECT sequence FROM agent_memory_event WHERE group_message_id='bot'").get().sequence);
    f.responses.push({changes:[{sourceSequence:event,key:'color',kind:'preference',content:'I prefer green.',quote:'I prefer green.'}]});
    await f.c.maintainAgentMemories(f.env,'sender','human',{groupID:'group'});
    assert.equal((await f.c.readAgentMemories(f.env.DB,'sender',false,'human',{groupID:'group'})).length,1);
    assert.equal((await f.c.readAgentMemories(f.env.DB,'sender',false,'human',{contactID:'private'})).length,0);
    f.sqlite.exec("DELETE FROM group_agent WHERE group_id='group' AND agent_id='sender'");
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM agent_local_memory').get().n,0);
  });
  await check('isolation during extraction cannot write shared group memories', async f => {
    f.humanReply('group','human','I prefer tea.');
    f.responses.push(() => {
      f.sqlite.exec("INSERT INTO mcp_private_group(group_id) VALUES ('group')");
      return {content:JSON.stringify({memories:[{key:'drink',kind:'preference',content:'Tea.',quote:'I prefer tea.'}]})};
    });
    await f.c.rememberGroupMessage({...f.env,META_CHAT_MODEL:'muse-spark-1.3'},'reply-human',1);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM group_memory').get().n,0);
  });
  await check('new isolation preserves existing self and group facts locally', async f => {
    f.completed('turn','Choose a color.');
    const event = Number(f.sqlite.prepare("SELECT sequence FROM agent_memory_event WHERE private_turn_id='turn'").get().sequence);
    f.sqlite.prepare(`INSERT INTO agent_memory(agent_id,memory_key,kind,content,source_event_sequence,source_quote,updated_at)
      VALUES ('sender','color','preference','Green.',?,'green',0)`).run(event);
    f.humanReply('group','human','I prefer tea.');
    f.sqlite.exec(`INSERT INTO group_memory(agent_id,user_id,memory_key,kind,content,source_id,source_quote,updated_at)
      VALUES ('sender','human','drink','preference','Tea.','human','tea',0);
      INSERT INTO mcp_private_contact(contact_id) VALUES ('private');
      INSERT INTO mcp_private_group(group_id) VALUES ('group');`);
    assert.equal((await f.c.readAgentMemories(f.env.DB,'sender',false,'human')).length,0);
    assert.equal((await f.c.readAgentMemories(f.env.DB,'sender',false,'human',{contactID:'private'})).length,1);
    assert.equal((await f.c.groupMemories(f.env.DB,'sender',false)).length,0);
    assert.equal((await f.c.localGroupMemories(f.env.DB,'sender','group','human')).length,1);
  });
  await check('local self keys cannot overwrite a shared identity key', async f => {
    f.completed('shared-turn','Choose a color.','I prefer blue.');
    const sharedEvent = Number(f.sqlite.prepare("SELECT sequence FROM agent_memory_event WHERE private_turn_id='shared-turn'").get().sequence);
    f.sqlite.prepare(`INSERT INTO agent_memory(agent_id,memory_key,kind,content,source_event_sequence,source_quote,updated_at)
      VALUES ('sender','color','preference','Blue.',?,'blue',0)`).run(sharedEvent);
    f.sqlite.exec(`INSERT INTO mcp_private_group(group_id) VALUES ('group');
      INSERT INTO group_message(id,group_id,agent_id,sender_name,text,created_at,contributor_consent)
      VALUES ('local','group','sender','Bot One','I prefer green.',0,1);`);
    const event = Number(f.sqlite.prepare("SELECT sequence FROM agent_memory_event WHERE group_message_id='local'").get().sequence);
    f.responses.push({changes:[{sourceSequence:event,key:'color',kind:'preference',content:'Green.',quote:'green'}]});
    await f.c.maintainAgentMemories(f.env,'sender','human',{groupID:'group'});
    assert.equal((await f.c.readAgentMemories(f.env.DB,'sender',false,'human'))[0].content,'Blue.');
    assert.equal((await f.c.readAgentMemories(f.env.DB,'sender',false,'human',{groupID:'group'}))[0].content,'Green.');
  });
  await check('failed local extraction preserves cursor for a later retry', async f => {
    f.sqlite.exec("INSERT INTO mcp_private_contact(contact_id) VALUES ('private')");
    const sequence = f.completed('turn','I prefer tea.');
    f.responses.push(Error('MODEL_TEMPORARILY_UNAVAILABLE'));
    await assert.rejects(()=>f.c.maintainMemories(f.env,{contactID:'private',userID:'human',beforeSequence:sequence+1}));
    assert.equal(f.sqlite.prepare("SELECT last_sequence n FROM contact_memory_state WHERE contact_id='private'").get().n,0);
  });
  console.log(`${checks} conversation memory checks passed; no live inference or user data.`);
})().catch(error => {console.error(error);process.exitCode=1;});
