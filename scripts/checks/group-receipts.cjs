// Opt-in isolated checks: node scripts/checks/group-receipts.cjs
// All migrations and real receipt handlers on in-memory SQLite. No external calls.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../..');
const source = file => stripTypeScriptTypes(fs.readFileSync(path.join(root, 'apps/api/src', file), 'utf8'))
  .replace(/^import[^\n]*\n/gm, '').replace(/export default \w+;/g, '').replace(/export /g, '');
const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON');
const migrations = fs.readdirSync(path.join(root,'apps/api/migrations')).filter(f => f.endsWith('.sql')).sort();
for (const f of migrations.filter(f => f < '0022')) sql.exec(fs.readFileSync(path.join(root,'apps/api/migrations',f),'utf8'));
sql.exec(`INSERT INTO user(id,name,email,created_at,updated_at) VALUES
 ('a','Alice','alice@example.invalid',0,0),('b','Bob','bob@example.invalid',0,0),('c','Casey','casey@example.invalid',0,0);
 INSERT INTO contact_agent(id,owner_id,name,memory_shared) VALUES ('bot','a','Demo Bot',1),('bot2','a','Other Bot',1);
 INSERT INTO chat_group(id,owner_id,name,created_at) VALUES ('g','a','Demo Group',0),('other','c','Other Group',0);
 INSERT INTO group_member(group_id,user_id,share_memory,contributor_consent,joined_at) VALUES ('g','a',1,1,0),('g','b',1,1,0),('other','c',1,1,0);
 INSERT INTO group_agent(group_id,agent_id,added_by,joined_at) VALUES ('g','bot','a',0),('g','bot2','a',0);
 INSERT INTO group_message(id,group_id,user_id,sender_name,text,created_at,contributor_consent) VALUES ('legacy','g','a','Alice','Old message',1,1);`);
for (const f of migrations.filter(f => f >= '0022')) sql.exec(fs.readFileSync(path.join(root,'apps/api/migrations',f),'utf8'));
const DB = { prepare(query) { return { args: [], bind(...args) {this.args=args;return this;},
 exec() {let i=0;const params=[];const expanded=query.replace(/\?(\d+)?/g,(_,n)=>{params.push(this.args[n?+n-1:i++]);return '?';});return [sql.prepare(expanded),params];},
 async run(){const [s,p]=this.exec();return s.run(...p);}, async first(){const [s,p]=this.exec();return s.get(...p)??null;},
 async all(){const [s,p]=this.exec();return {results:s.all(...p)};}};}};
class Router { constructor(){this.handlers=new Map();} use(){return this;} route(){return this;} }
for(const method of ['get','post','put','delete','patch']) Router.prototype[method]=function(p,f){this.handlers.set(method+' '+p,f);return this;};
const context=vm.createContext({Hono:Router, media:{}, reactionRoutes:()=>({}), learningRoutes:()=>({}), Date, JSON, Number, Array, String, Set,
 groupQuotes:async()=>()=>null,
 publicAttachment:()=>null, admitAuthRequest:async()=>({allowed:true})});
vm.runInContext(source('groups/receipts.ts'),context);
vm.runInContext(source('groups/retrieval.ts'),context);
vm.runInContext(source('groups/routes.ts')+'\nglobalThis.routes=groups;',context);
const state=id=>sql.prepare(`SELECT ${context.receiptState('gm')} AS state FROM group_message gm WHERE id=?`).get(id).state;
const insert=id=>sql.prepare(`INSERT INTO group_message(id,group_id,user_id,sender_name,text,created_at,contributor_consent) VALUES (?,'g','a','Alice','Hello',2,1)`).run(id);
async function ack(user,ids,read=false,group='g') {
 const handler=context.routes.handlers.get('put '+(read?'/:id/receipts':'/receipts'));
 return handler({env:{DB},get:()=>user,req:{json:async()=>({messageIDs:ids,state:read?'read':'received'}),param:()=>group},
 json:(data,status=200)=>({data,status}),body:(_,status)=>({status})});
}
// Receipt-focused runner fixture: authorization is covered by completion checks.
const runner=vm.createContext({console,Date,JSON,Error,NonRetryableError:Error,
 isRecord:value=>value!==null&&typeof value==='object'&&!Array.isArray(value),
 mcpTools:[],reactionTool:{function:{name:'react_to_message'}},
 groupRetrievalTools:vm.runInContext('groupRetrievalTools',context),
 acknowledgeAgentContext:context.acknowledgeAgentContext,acknowledgeGroupResults:context.acknowledgeGroupResults,
 executeGroupRetrieval:(...args)=>context.executeGroupRetrieval(...args),
 groupDecisionFormat:()=>({type:'json_schema'}),
 parseGroupDecision:answer=>({text:JSON.parse(answer).text,throughSequence:3}),
 safeErrorCode:error=>error.message});
vm.runInContext(source('groups/completion.ts'),runner);
runner.assertCurrentAccess=async()=>{};
const completionInput={messages:[],scope:{agentID:'bot',userID:'a',groupID:'g',reactionJob:{turnID:'fictional',attempt:1}},
 attachment:null,contextMessageIDs:[],allowedActions:['reply']};
const completionStep={do:async(name,...args)=>args.at(-1)()};
let count=0;
async function check(name,fn){await fn(); count++; console.log('PASS '+name);}
(async()=>{
 await check('legacy history remains unknown',()=>assert.equal(state('legacy'),null));
 insert('m1'); insert('m2');
 await check('snapshot excludes sender and includes two bots plus human',()=>{
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM group_message_receipt WHERE message_id='m1'").get().n,3);
  assert.equal(state('m1'),'sent');
 });
 await check('human receipt requires explicit acknowledgement and remains unread',async()=>{
  assert.equal((await ack('b',['m1'])).status,204); assert.equal(state('m1'),'received'); assert.equal(state('m2'),'sent');
 });
 await check('all human and bot reads required independently',async()=>{
  await ack('b',['m1'],true);
  await context.acknowledgeAgentContext(DB,'g','bot',['m1']); assert.equal(state('m1'),'received');
  await context.acknowledgeAgentContext(DB,'g','bot2',['m1']); assert.equal(state('m1'),'read');
 });
 await check('replay preserves first timestamps and never downgrades',async()=>{
  const before=sql.prepare("SELECT * FROM group_message_receipt WHERE message_id='m1' ORDER BY recipient_id").all();
  await ack('b',['m1']); await ack('b',['m1'],true); await context.acknowledgeAgentContext(DB,'g','bot',['m1']);
  assert.deepEqual(sql.prepare("SELECT * FROM group_message_receipt WHERE message_id='m1' ORDER BY recipient_id").all(),before);
 });
 await check('unrelated accounts and cross-group acknowledgements cannot advance receipts',async()=>{
  await ack('c',['m2'],true); await ack('b',['m2'],true,'other');
  assert.equal(state('m2'),'sent');
 });
 await check('agent context acknowledges only included message IDs',async()=>{
  assert.equal(sql.prepare("SELECT read_at FROM group_message_receipt WHERE message_id='m2' AND recipient_id='bot'").get().read_at,null);
  await context.acknowledgeAgentContext(DB,'other','bot',['m2']);
  assert.equal(sql.prepare("SELECT read_at FROM group_message_receipt WHERE message_id='m2' AND recipient_id='bot'").get().read_at,null);
 });
 await check('failed model consumption does not acknowledge tool results',async()=>{
  let calls=0;
  runner.museCompletion=async()=>{
   if(calls++===0) return {tool_calls:[{id:'lookup',function:{name:'search_group_messages',arguments:'{}'}}]};
   throw Error('SIMULATED_PROVIDER_FAILURE');
  };
  vm.runInContext(`executeGroupRetrieval = async () => JSON.stringify({results:[{messageID:'m2',groupID:'g'}]});`,context);
  await assert.rejects(()=>runner.completeGroupDraft({DB},completionInput,completionStep,'receipt'));
  assert.equal(sql.prepare("SELECT read_at FROM group_message_receipt WHERE message_id='m2' AND recipient_id='bot'").get().read_at,null);
 });
 await check('successful model consumption acknowledges only supplied tool results',async()=>{
  let calls=0;
  runner.museCompletion=async(env,messages,model,options)=>options.responseFormat
   ? {content:JSON.stringify({action:'reply',text:'Processed'})}
   : calls++===0 ? {tool_calls:[{id:'lookup',function:{name:'search_group_messages',arguments:'{}'}}]}
   : {tool_calls:[{id:'finish',function:{name:'finish_group_research',arguments:'{}'}}]};
  assert.equal((await runner.completeGroupDraft({DB},completionInput,completionStep,'receipt')).text,'Processed');
  assert.ok(sql.prepare("SELECT read_at FROM group_message_receipt WHERE message_id='m2' AND recipient_id='bot'").get().read_at);
  assert.equal(state('m2'),'sent');
 });
 await check('membership changes do not rewrite recipient snapshots or invent reads',async()=>{
  sql.exec("INSERT INTO group_member(group_id,user_id,share_memory,contributor_consent,joined_at) VALUES ('g','c',1,1,5); DELETE FROM group_member WHERE group_id='g' AND user_id='b'; DELETE FROM group_agent WHERE group_id='g' AND agent_id='bot2';");
  await ack('b',['m2'],true); await context.acknowledgeAgentContext(DB,'g','bot2',['m2']);
  assert.equal(state('m2'),'sent');assert.equal(state('m1'),'read');
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM group_message_receipt WHERE message_id='m2'").get().n,3);
 });
 await check('empty recipient set does not manufacture read confirmation',()=>{
  sql.exec("DELETE FROM group_member WHERE group_id='g' AND user_id='c'; DELETE FROM group_agent WHERE group_id='g';");
  insert('alone');assert.equal(state('alone'),'sent');
 });
 await check('bounded invalid receipt requests rejected',async()=>{
  assert.equal((await ack('a',Array(101).fill('m1'))).status,400);assert.equal((await ack('a',[])).status,400);
 });
 await check('history and Home summaries expose identical aggregate state',async()=>{
  const c={env:{DB,META_CHAT_MODEL:'muse-spark-1.3'},get:()=> 'a',req:{param:()=> 'g',query:()=>undefined},json:data=>data};
  const page=await context.routes.handlers.get('get /:id/messages')(c);
  assert.equal(page.messages.find(m=>m.id==='m1').receiptState,'read');
  const list=await context.routes.handlers.get('get /')(c);
  const g=list.groups.find(g=>g.id==='g');
  assert.equal(g.lastMessageID,'alone');assert.equal(g.lastMessageUserID,'a');
  assert.equal(g.lastMessageReceiptState,'sent');
 });
 await check('receipt-only refresh is bounded, aggregate-only and membership-scoped',async()=>{
  const handler=context.routes.handlers.get('get /:id/receipts');
  const c={env:{DB},get:()=> 'a',req:{param:()=> 'g',query:()=>JSON.stringify(['m1','legacy'])},json:(data,status=200)=>({data,status})};
  const result=await handler(c);assert.equal(result.data.receipts.length,2);
  assert.deepEqual(Object.keys(result.data.receipts[0]).sort(),['id','receiptState']);
  const denied=await handler({...c,get:()=> 'b'});assert.equal(denied.data.receipts.length,0);
  const malformed=await handler({...c,req:{param:()=> 'g',query:()=>'{'}});assert.equal(malformed.status,400);
 });
 await check('receipt rate limits fail before writes',async()=>{
  context.admitAuthRequest=async()=>({allowed:false});
  assert.equal((await ack('a',['m1'])).status,429);
  context.admitAuthRequest=async()=>({allowed:true});
 });
 await check('message and recipient snapshot roll back together',()=>{
  sql.exec('BEGIN');insert('rollback');sql.exec('ROLLBACK');
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM group_message WHERE id='rollback'").get().n,0);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM group_message_receipt WHERE message_id='rollback'").get().n,0);
 });
 await check('group deletion cascades receipt storage',()=>{
  sql.exec("DELETE FROM chat_group WHERE id='g'"); assert.equal(sql.prepare('SELECT COUNT(*) n FROM group_message_receipt').get().n,0);
 });
 await check('private read follows connection, never model processing',async()=>{
  sql.exec(`INSERT INTO contact(id,user_id,agent_id,name,created_at,updated_at) VALUES ('p','a','bot','Demo Bot',0,0);
   INSERT INTO chat_turn(id,contact_id,user_id,user_text,status,workflow_id,created_at,updated_at) VALUES ('pt','p','a','Hello','running','pw',0,0);
   INSERT INTO agent_attention(agent_id,turn_id,attempt,workflow_id,acquired_at) VALUES ('bot','pt',1,'pw',0);`);
  const priv=vm.createContext({Date,JSON,Intl,Set,Map,console,
   personalityContext:async()=>'',miniAppTools:[],miniAppInstruction:'',
   scheduleTools:[],groupRetrievalTools:[],groupRequestTool:{},groupQuestionTool:{},
   privateContact:async()=>false, privateQuotes:async()=>()=>null,
   contactModelAllowed:async()=>true, readMemories:async()=>[],selectMemories:()=>[],
   readAgentMemories:async()=>[],agentMemoryContext:()=> '{}',
   sharedGroups:async()=>({results:[]}),searchGroupMessages:async()=>({results:[]}),
   groupRequestReceipt:async()=>null,recentGroupDestinations:async()=>[],
   attachmentMessage:async()=>({role:'user',content:'Hello'}),
   byteLength:s=>Buffer.byteLength(s),clipText:s=>s,
   acknowledgeGroupResults:async()=>{},
   museCompletion:async()=>{throw Error('SIMULATED_PROVIDER_FAILURE');},
  });
  vm.runInContext(source('reactions/data.ts'),priv);
  vm.runInContext(source('chat/context.ts'),priv);
  const turn={id:'pt',contactID:'p',userID:'a',attempt:1,sequence:1,userText:'Hello'};
  const env={DB,META_CHAT_MODEL:'muse-spark-1.3'};
  await assert.rejects(()=>priv.contactReply(env,turn,'Demo Bot'));
  assert.equal(sql.prepare("SELECT read_at FROM chat_turn WHERE id='pt'").get().read_at,null);
  const presence=vm.createContext({Date});
  vm.runInContext(source('chat/presence.ts'),presence);
  sql.exec("INSERT INTO agent_presence(agent_id,status) VALUES ('bot','offline') ON CONFLICT(agent_id) DO UPDATE SET status='offline', expires_at=NULL");
  await presence.markTyping(DB,{turnID:'pt',attempt:1});
  assert.equal(sql.prepare("SELECT status FROM agent_presence WHERE agent_id='bot'").get().status,'offline');
  await presence.markRead(DB,{turnID:'pt',attempt:1});
  assert.equal(sql.prepare("SELECT read_at FROM chat_turn WHERE id='pt'").get().read_at,null);
  sql.exec("UPDATE agent_presence SET status='online', expires_at=9e15 WHERE agent_id='bot'");
  await presence.markTyping(DB,{turnID:'pt',attempt:1});
  assert.equal(sql.prepare("SELECT status FROM agent_presence WHERE agent_id='bot'").get().status,'online');
  await presence.markRead(DB,{turnID:'pt',attempt:1});
  assert.ok(sql.prepare("SELECT read_at FROM chat_turn WHERE id='pt'").get().read_at);
  await presence.markTyping(DB,{turnID:'pt',attempt:1});
  assert.equal(sql.prepare("SELECT status FROM agent_presence WHERE agent_id='bot'").get().status,'typing');
  priv.museCompletion=async()=>({content:'Hello back'});
  assert.equal(await priv.contactReply(env,turn,'Demo Bot'),'Hello back');
  let recoveryCalls=0;
  priv.museCompletion=async(env,messages,model,options)=>{
   recoveryCalls++;
   assert.equal(options.tools,undefined);
   assert.ok(messages.some(m=>m.role==='system'&&m.content.includes('Response recovery')));
   return {content:'I could not finish that request; the earlier external outcome is uncertain.'};
  };
  assert.match(await priv.contactReply(env,turn,'Demo Bot','MODEL_INCOMPLETE_RESPONSE'),/uncertain/);
  assert.equal(recoveryCalls,1);
 });
 await check('group failures identify their source and disappear only after the same bot replies',async()=>{
  const f=require('./group-publication.cjs').fixture();
  try {
   const query=source('groups/routes.ts').match(/const \{ results: replies \} = await c.env.DB.prepare\(`([\s\S]*?)`\)/)[1];
   f.sqlite.exec(`INSERT INTO group_message(id,group_id,user_id,sender_name,text,created_at) VALUES ('failed-source','group','human','Demo Human','Read fictional data',0);
    INSERT INTO group_reply(id,group_id,agent_id,source_id,status,workflow_id,created_at)
    VALUES ('failed','group','sender','failed-source','failed','failed-workflow',0);`);
   let rows=(await f.env.DB.prepare(query).bind('group').all()).results;
   assert.equal(rows.find(r=>r.id==='failed').sourceID,'failed-source');
   f.sqlite.exec(`INSERT INTO group_message(id,group_id,agent_id,sender_name,text,created_at)
    VALUES ('other-bot','group','target','Other Bot','I replied',1);`);
   rows=(await f.env.DB.prepare(query).bind('group').all()).results;
   assert.ok(rows.some(r=>r.id==='failed'));
   f.sqlite.exec(`INSERT INTO group_message(id,group_id,agent_id,sender_name,text,created_at)
    VALUES ('same-bot','group','sender','Bot One','I replied later',2);`);
   rows=(await f.env.DB.prepare(query).bind('group').all()).results;
   assert.ok(!rows.some(r=>r.id==='failed'));
  } finally {f.sqlite.close();}
 });
 await check('private Home receipt fields follow the same latest turn as the preview',async()=>{
  const priv=vm.createContext({Hono:Router,bodyLimit:()=>()=>{},chats:{},schedules:{},sharing:{},learningRoutes:()=>({}),
   nativeActions:{},remoteSettings:{},miniApps:{},personality:{},
   plainMessageMarkdown:text=>text,
   totalUnreadReplies:async()=>0});
  vm.runInContext(source('routes/contacts.ts')+'\nglobalThis.routes=contacts;',priv);
  const c={env:{DB},get:()=> 'a',req:{query:()=>undefined},json:data=>data};
  let result=await priv.routes.handlers.get('get /')(c);
  assert.equal(result.contacts[0].lastMessageFromUser,1);
  assert.equal(result.contacts[0].lastMessageText,'Hello');assert.ok(result.contacts[0].lastMessageReadAt);
  sql.exec("UPDATE chat_turn SET assistant_text='Reply',status='complete' WHERE id='pt'");
  result=await priv.routes.handlers.get('get /')(c);
  assert.equal(result.contacts[0].lastMessageFromUser,0);assert.equal(result.contacts[0].lastMessageText,'Reply');
 });
 console.log(`${count} isolated checks passed; ${migrations.length} migrations applied.`);
 sql.close();
})().catch(e=>{console.error(e);sql.close();process.exitCode=1;});
