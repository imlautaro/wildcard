// Real migration, publication SQL and Workflow with fictional data and simulated services.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const capturedSQL = new Map();
const { fixture, source } = require('./group-publication.cjs');
let checks = 0;
async function check(name, run) {
  const f = fixture();
  const prepare = f.env.DB.prepare;
  f.env.DB.prepare = sql => {
    let parameters = 0;
    for (const match of sql.matchAll(/\?(\d+)?/g)) parameters = match[1] ? Math.max(parameters, +match[1]) : parameters + 1;
    capturedSQL.set(sql, { sql, parameters });
    return prepare(sql);
  };
  try {
    vm.runInContext(source('groups/workflow.ts'), f.context);
    await run(f); checks++; console.log('PASS ' + name);
    assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { f.sqlite.close(); }
}
const points = (f, id) => f.context.readEnergy(f.env.DB, id);
const maxSequence = f => f.sqlite.prepare('SELECT MAX(sequence) n FROM group_message').get().n;
function claim(f, agent) {
  f.sqlite.exec('DELETE FROM agent_attention');
  const row = f.sqlite.prepare("SELECT * FROM group_reply WHERE agent_id=? AND status='queued' ORDER BY sequence LIMIT 1").get(agent);
  assert.ok(row, 'expected a queued reply');
  f.sqlite.prepare("INSERT INTO agent_attention(agent_id,turn_id,attempt,workflow_id,acquired_at) VALUES (?,?,?,?,0)").run(agent,row.id,row.attempt,row.workflow_id);
  f.sqlite.prepare("UPDATE group_reply SET status='running' WHERE id=?").run(row.id);
  return {kind:'group',turnID:row.id,attempt:row.attempt};
}
const publish = (f, job, text='Fictional response') => f.context.publishGroupDraft(f.env, job, {text,throughSequence:maxSequence(f)});
function human(f,id='human-root') {
  f.sqlite.prepare(`INSERT INTO group_message(id,group_id,user_id,sender_name,text,created_at,contributor_consent,exchange_id,requester_id)
    VALUES (?,'group','human','Demo Human','Discuss this',0,1,?,'human')`).run(id,id);
  f.sqlite.prepare(`INSERT INTO group_reply(id,group_id,agent_id,source_id,workflow_id,created_at)
    VALUES (?,'group','sender',?,?,0)`).run('first-'+id,id,'wf-'+id);
}
(async()=>{
 await check('ordinary post spends exactly one point and queues the other bot',async f=>{
   const t=f.turn(); const r=await f.call(t); assert.equal(r.published,true);
   assert.equal((await points(f,'sender')).points,49); assert.equal((await points(f,'target')).points,50);
   assert.equal(f.count('group_reply'),1);
   await f.call(t); assert.equal((await points(f,'sender')).points,49); assert.equal(f.count('group_reply'),1);
   const j=claim(f,'target'); assert.equal(await publish(f,j),'published');
   assert.equal((await points(f,'target')).points,49); assert.equal(f.count('group_reply'),2);
   assert.equal(await publish(f,j),'published'); assert.equal((await points(f,'target')).points,49);
 });
 await check('human-triggered reply inherits the exchange and prompts another bot',async f=>{
   human(f); assert.equal(await publish(f,claim(f,'sender')),'published');
   assert.equal(f.sqlite.prepare("SELECT agent_id FROM group_reply WHERE status='queued'").get().agent_id,'target');
 });
 await check('directed questions retain their sole first answer and then allow public conversation',async f=>{
   const result=await f.call(f.turn('Ask Bot Two its favorite color in Demo Group.'),'ask_agent_in_group',
     {groupID:'group',targetAgentID:'target',question:'What is your favorite color?'});
   assert.equal(result.replyExpected,true);assert.equal(f.count('group_reply'),1);
   assert.equal(await publish(f,claim(f,'target')),'published');
   assert.equal(f.sqlite.prepare("SELECT agent_id FROM group_reply WHERE status='queued'").get().agent_id,'sender');
   assert.equal(f.count('group_request'),1);assert.equal(f.count('group_post'),0);
 });
 await check('the same agent spends one shared balance across groups',async f=>{
   f.sqlite.exec(`INSERT INTO chat_group(id,owner_id,name,created_at) VALUES ('second','human','Other Group',0);
     INSERT INTO group_member(group_id,user_id,share_memory,contributor_consent,joined_at) VALUES ('second','human',1,1,0);
     INSERT INTO group_agent(group_id,agent_id,added_by,joined_at) VALUES ('second','sender','human',0);`);
   await f.call(f.turn());
   assert.equal((await f.call(f.turn('Say hello in Other Group.'),'send_group_message',{groupID:'second',text:'Hello there!'})).published,true);
   assert.equal((await points(f,'sender')).points,48);
   f.sqlite.exec("UPDATE chat_turn SET assistant_text='Private reply',status='complete' WHERE status='running'");
   assert.equal((await points(f,'sender')).points,48);
 });
 await check('Standard group continuations work without Contributor consent',async f=>{
   f.env.META_CHAT_MODEL='muse-spark-1.3';f.sqlite.exec('UPDATE group_member SET contributor_consent=0');
   assert.equal((await f.call(f.turn())).published,true);
   assert.equal(await publish(f,claim(f,'target')),'published');
 });
 await check('recharge includes offline time, preserves partial intervals and caps at 50',async f=>{
   const now=f.sqlite.prepare('SELECT unixepoch()*1000 n').get().n;
   f.sqlite.prepare("UPDATE contact_agent SET energy=10,energy_updated_at=? WHERE id='sender'").run(now-2*300000-120000);
   assert.equal((await points(f,'sender')).points,12);
   assert.equal((await points(f,'sender')).nextPointAt,now+180000);
   await f.call(f.turn()); assert.equal((await points(f,'sender')).points,11);
   assert.equal((await points(f,'sender')).nextPointAt,now+180000);
   f.sqlite.exec("UPDATE contact_agent SET energy_updated_at=0 WHERE id='sender'");
   assert.equal((await points(f,'sender')).points,50); assert.equal((await points(f,'sender')).nextPointAt,null);
   await f.call(f.turn()); assert.equal((await points(f,'sender')).points,49);
 });
 await check('zero energy rejects a private publication before authorization or writes',async f=>{
   f.sqlite.exec("UPDATE contact_agent SET energy=0,energy_updated_at=unixepoch()*1000 WHERE id='sender'");
   const r=await f.call(f.turn()); assert.equal(r.code,'ENERGY_EXHAUSTED');
   assert.equal(f.count('group_message'),0); assert.equal(f.state.modelCalls,0);
 });
 await check('last point allows a generated farewell, then blocks further group publications',async f=>{
   human(f); f.sqlite.exec("UPDATE contact_agent SET energy=1,energy_updated_at=unixepoch()*1000 WHERE id='sender'");
   assert.equal(await publish(f,claim(f,'sender'),'I will catch up later.'),'published');
   assert.equal((await points(f,'sender')).points,0);
   human(f,'next-human'); const j=claim(f,'sender'); assert.equal(await publish(f,j),'skipped');
   assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM group_message WHERE id=?').get(j.turnID).n,0);
   assert.equal(f.sqlite.prepare('SELECT status FROM group_reply WHERE id=?').get(j.turnID).status,'complete');
 });
 await check('continuous manual refills cannot bypass the 100-publication exchange cap',async f=>{
   await f.call(f.turn());
   for(let n=1;n<100;n++) {
     f.sqlite.exec('UPDATE contact_agent SET energy=50,energy_updated_at=unixepoch()*1000');
     const queued=f.sqlite.prepare("SELECT agent_id FROM group_reply WHERE status='queued' ORDER BY sequence LIMIT 1").get();
     assert.ok(queued); assert.equal(await publish(f,claim(f,queued.agent_id)),'published');
   }
   assert.equal(f.count('group_message'),100);
   assert.equal(f.sqlite.prepare('SELECT bot_messages FROM group_exchange').get().bot_messages,100);
   assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM group_reply WHERE status='queued'").get().n,0);
   f.sqlite.exec('UPDATE contact_agent SET energy=50'); assert.equal(f.count('group_reply'),99);
 });
 for(const mutation of ["DELETE FROM group_member WHERE user_id='human'", "UPDATE group_member SET contributor_consent=0", "DELETE FROM group_agent WHERE agent_id='sender'"]) {
   await check('continuation fails closed after '+mutation,async f=>{
     await f.call(f.turn());const j=claim(f,'target'); f.sqlite.exec(mutation);
     let result; try { result = await publish(f,j); } catch { result = 'denied'; }
     assert.notEqual(result,'published'); assert.equal(f.count('group_message'),1);
     assert.equal((await points(f,'target')).points,50);
   });
 }
 await check('stale drafts and skips do not consume energy or enqueue continuations',async f=>{
   human(f);const j=claim(f,'sender');const through=maxSequence(f);
   human(f,'new-root');
   assert.equal(await f.context.publishGroupDraft(f.env,j,{text:'Outdated',throughSequence:through}),'changed');
   assert.equal((await points(f,'sender')).points,50);
   assert.equal(await publish(f,j,null),'skipped');assert.equal(f.count('group_message'),2);
 });
 await check('one pending opportunity per bot/exchange bounds queue growth',async f=>{
   f.sqlite.exec(`INSERT INTO contact_agent(id,owner_id,name,memory_shared) VALUES ('third','human','Third',1);
     INSERT INTO contact(id,user_id,name,agent_id,created_at,updated_at) VALUES ('third-private','human','Third','third',0,0);
     INSERT INTO group_agent(group_id,agent_id,added_by,joined_at) VALUES ('group','third','human',0);`);
   await f.call(f.turn());
   for(let n=0;n<12;n++) {
     const row=f.sqlite.prepare("SELECT agent_id FROM group_reply WHERE status='queued' ORDER BY sequence LIMIT 1").get();
     await publish(f,claim(f,row.agent_id));
     assert.ok(f.sqlite.prepare("SELECT COUNT(*) n FROM group_reply WHERE status='queued'").get().n<=2);
   }
 });
 await check('SQL debit guard cannot be bypassed by direct insert and rolls back notifications',async f=>{
   f.sqlite.exec("UPDATE contact_agent SET energy=0,energy_updated_at=unixepoch()*1000 WHERE id='sender'");
   assert.throws(()=>f.sqlite.exec("INSERT INTO group_message(id,group_id,agent_id,sender_name,text,created_at) VALUES ('bypass','group','sender','Bot','Hello',0)"),/GROUP_ENERGY_EXHAUSTED/);
   assert.equal(f.count('group_message'),0);assert.equal(f.count('group_message_receipt'),0);
 });
 await check('depleted Workflow skips inference and releases attention',async f=>{
   human(f);const job=claim(f,'sender');f.sqlite.exec("UPDATE contact_agent SET energy=0,energy_updated_at=unixepoch()*1000 WHERE id='sender'");
   let modelCalls=0;let releases=0;
   f.context.prepareGroupDraft=async()=>{modelCalls++;throw Error('NO_INFERENCE_EXPECTED');};
   f.context.maintainAgentMemories=async()=>{throw Error('NO_MEMORY_EXPECTED');};
   f.context.releaseAttention=async()=>{releases++;f.sqlite.exec('DELETE FROM agent_attention');};
   f.context.dispatchAgent=async()=>{};f.context.dispatchGroupRequests=async()=>{};
   const step={sleep:async()=>{},do:async(name,...args)=>args.at(-1)()};
   await f.context.runGroup(f.env,job,step);
   assert.equal(modelCalls,0);assert.equal(releases,1);assert.equal(f.count('agent_attention'),0);
   assert.equal(f.sqlite.prepare('SELECT status FROM group_reply WHERE id=?').get(job.turnID).status,'complete');
 });
 await check('real group context distinguishes bot conversation from directed delegation and supplies energy',async f=>{
   await f.call(f.turn());const job=claim(f,'target');
   const c=vm.createContext({console,Date,JSON,Array,Number,Error,
     readEnergy:f.context.readEnergy,groupSourceAccess:f.context.groupSourceAccess,
     readMemories:async()=>[],selectMemories:()=>[],readAgentMemories:async()=>[],
     agentMemoryContext:()=>'{}',clipText:s=>s,acknowledgeAgentContext:async()=>{},
     isRecord:x=>x&&typeof x==='object'&&!Array.isArray(x),
     groupCompletion:async(env,messages)=>{c.evidence=JSON.parse(messages[1].content);c.system=messages[0].content;return JSON.stringify({action:'reply',text:'A freely generated hello.'});}});
   vm.runInContext(source('groups/context.ts'),c);
   const result=await c.prepareGroupDraft(f.env,job);
   assert.equal(result.text,'A freely generated hello.');assert.equal(c.evidence.round.trigger.directed,false);
   assert.equal(c.evidence.round.trigger.agentID,'sender');assert.equal(c.evidence.energy.points,50);
   assert.ok(c.system.includes('own words'));assert.ok(c.system.includes('nothing useful to add'));
 });
 await check('owner-only endpoints reset shared backend energy without reviving conversations',async f=>{
   class Router { constructor(){this.handlers=new Map();} use(){return this;} route(){return this;} }
   for(const method of ['get','post','put','delete','patch']) Router.prototype[method]=function(p,...handlers){this.handlers.set(method+' '+p,handlers.at(-1));return this;};
   f.context.sharing={};f.context.chats={};f.context.schedules={};
   f.context.Hono=Router;f.context.bodyLimit=()=>()=>{};f.context.admitAuthRequest=async()=>({allowed:true});
   vm.runInContext(source('routes/contacts.ts').replace(/default contacts;/,'' )+'\nglobalThis.energyRoutes=contacts;',f.context);
   const c=(id,user)=>({env:f.env,get:()=>user,req:{param:()=>id},header(){},json:(data,status=200)=>({data,status})});
   const get=f.context.energyRoutes.handlers.get('get /:id/energy');const reset=f.context.energyRoutes.handlers.get('post /:id/energy/reset');
   assert.equal((await get(c('private','other'))).status,404);
   f.sqlite.exec("INSERT INTO contact(id,user_id,name,agent_id,created_at,updated_at) VALUES ('shared','other','Bot','sender',0,0)");
   assert.equal((await get(c('shared','other'))).status,404);assert.equal((await reset(c('shared','other'))).status,404);
   await f.call(f.turn());assert.equal((await get(c('private','human'))).data.energy.points,49);
   const before=f.count('group_reply');assert.equal((await reset(c('private','human'))).data.energy.points,50);assert.equal(f.count('group_reply'),before);
   f.context.admitAuthRequest=async()=>({allowed:false,retryAfter:60});assert.equal((await reset(c('private','human'))).status,429);
 });
 if (process.env.WILDCARD_SQL_CAPTURE) require('node:fs').writeFileSync(process.env.WILDCARD_SQL_CAPTURE, JSON.stringify([...capturedSQL.values()]));
 const depth = spawnSync('python3', [path.join(__dirname, 'sql-depth.py')], {
   input: JSON.stringify([...capturedSQL.values()]), encoding: 'utf8', maxBuffer: 1024 * 1024,
 });
 assert.equal(depth.status, 0, depth.stderr);
 console.log(`PASS ${capturedSQL.size} actual SQL statements prepare at expression depth 100`);
 console.log(`${checks} energy checks passed. No live services, inference, notifications or user data.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
