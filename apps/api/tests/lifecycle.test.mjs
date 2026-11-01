import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createHmac } from 'node:crypto';
import { readdir, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const secret = 'fictional-lifecycle-test-secret-local-only';
let mf, db, bucket, directory;
const ids = { owner: 'fixture-owner', member: 'fixture-member', outsider: 'fixture-outsider', contact: 'fixture-contact', shared: 'fixture-shared', other: 'fixture-other', group: 'fixture-group' };
const now = Date.now();

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'wildcard-lifecycle-'));
  const output = await build({ entryPoints: [join(root, 'apps/api/tests/lifecycle.worker.ts')], bundle: true, write: false, format: 'esm', platform: 'neutral', mainFields: ['module','main'], target: 'es2022', conditions: ['workerd','worker','browser'], external: ['cloudflare:*','node:*'], alias: {} });
  mf = new Miniflare(convertV4MiniflareOptions({ name: 'lifecycle-fixture', modules: true, script: output.outputFiles[0].text,
    compatibilityDate: '2026-10-26', compatibilityFlags: ['nodejs_compat'],
    d1Databases: ['DB','DB_UPGRADE'], r2Buckets: ['CONTACT_PHOTOS'], outboundService: () => new Response('External calls are disabled in lifecycle tests', { status: 503 }),
    workflows: { CHAT_WORKFLOW: { name: 'fixture-chat', className: 'FixtureWorkflow' }, ONBOARDING_WORKFLOW: { name: 'fixture-generation', className: 'FixtureWorkflow' } },
    bindings: { BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: 'http://localhost', META_CHAT_MODEL: 'muse-spark-1.3', META_API_KEY: '', SUPER_ADMIN_USER_IDS: '', SEMANTIC_MEMORY_ENABLED: 'false', WEB_RESEARCH_ENABLED: 'false', MCP_WEB_ORIGIN: 'http://localhost' },
    resourcePersistencePath: directory, telemetry: { enabled: false },
    log: new Log(LogLevel.ERROR),
  }));
  db = await mf.getD1Database('DB'); bucket = await mf.getR2Bucket('CONTACT_PHOTOS');
  for (const file of (await readdir(join(root,'apps/api/migrations'))).filter(file=>file.endsWith('.sql')).sort()) {
    const sql = await readFile(join(root,'apps/api/migrations',file),'utf8');
    // D1 exec splits on newlines; keep triggers as complete statements via prepare().
    for (const statement of splitSQL(sql)) { try { await db.prepare(statement).run(); } catch(error) { throw new Error(`${file}: ${statement}`, {cause:error}); } }
  }
  await db.prepare('CREATE TABLE fixture_workflow_checkpoint(id TEXT PRIMARY KEY)').run();
}, { timeout: 60000 });
after(async () => { await mf?.dispose(); if (directory) await rm(directory,{recursive:true,force:true}); });

function splitSQL(sql) {
  const statements=[]; let current='', quote=null, comment=false, triggerDepth=0, caseDepth=0;
  for (let i=0;i<sql.length;i++) {
    const c=sql[i], next=sql[i+1];
    if (comment) { if(c==='\n') { comment=false; current+='\n'; } continue; }
    if (!quote && c==='-' && next==='-') { comment=true; i++; continue; }
    if(quote) { current+=c; if(c===quote) { if(next===quote) {current+=next;i++;} else quote=null; } continue; }
    if(c==="'" || c==='"') { quote=c;current+=c;continue; }
    if(/[A-Za-z_]/.test(c)) {
      const word=/^[A-Za-z_]+/.exec(sql.slice(i))[0];current+=word;i+=word.length-1;
      if(word.toUpperCase()==='CASE')caseDepth++;
      if(word.toUpperCase()==='BEGIN' && /CREATE\s+TRIGGER\b/i.test(current))triggerDepth++;
      if(word.toUpperCase()==='END') { if(caseDepth)caseDepth--;else triggerDepth--; }
      continue;
    }
    current+=c;
    if(c===';' && triggerDepth<=0) {if(current.trim())statements.push(current);current='';triggerDepth=0;}
  }
  if(current.trim())statements.push(current);return statements;
}
async function run(sql,...values) { return db.prepare(sql).bind(...values).run(); }
async function rows(sql,...values) { return (await db.prepare(sql).bind(...values).all()).results; }
async function count(table,where='',...values) { return (await rows(`SELECT COUNT(*) AS n FROM ${table} ${where}`, ...values))[0].n; }
async function invoke(body, faults={}) {
  const response=await mf.dispatchFetch('http://localhost/__fixture', {method:'POST',headers:{'content-type':'application/json','x-fixture-faults':JSON.stringify(faults)},body:JSON.stringify(body)});
  const json=await response.json();
  return {...json,workflowStatus:json.status,status:response.status};
}
function token(user) { const value=`fixture-token-${user}`; return `${value}.${createHmac('sha256',secret).update(value).digest('base64')}`; }
async function api(path,user,method='GET',body,faults={}) {
  const response=await mf.dispatchFetch(`http://localhost/api/v1/${path}`,{method,headers:{authorization:`Bearer ${token(user)}`,'content-type':'application/json','x-fixture-faults':JSON.stringify(faults)},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,body:response.status===204?null:await response.json()};
}
async function fixture() {
  await run('DELETE FROM user'); await run('DELETE FROM resource_cleanup'); await run('DELETE FROM auth_rate_limit');
  for (const object of (await bucket.list()).objects) await bucket.delete(object.key);
  for(const user of [ids.owner,ids.member,ids.outsider]) {
    await run('INSERT INTO user(id,name,email,created_at,updated_at,onboarding_required) VALUES(?,?,?,?,?,0)',user,'Fictional '+user,`${user}@example.test`,now,now);
    await run('INSERT INTO session(id,token,expires_at,created_at,updated_at,user_id) VALUES(?,?,?,?,?,?)',`session-${user}`,`fixture-token-${user}`,now+86400000,now,now,user);
  }
  await run('INSERT INTO contact(id,user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)',ids.contact,ids.owner,'Fictional shared contact',now,now);
  await run('INSERT INTO contact(id,user_id,agent_id,name,created_at,updated_at,contributor_consent) VALUES(?,?,?,?,?,?,1)',ids.shared,ids.member,ids.contact,'Fictional shared contact',now,now);
  await run('INSERT INTO contact(id,user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)',ids.other,ids.outsider,'Unrelated fictional contact',now,now);
  await run('INSERT INTO chat_group(id,owner_id,name,created_at) VALUES(?,?,?,?)',ids.group,ids.owner,'Fictional group',now);
  for(const user of [ids.owner,ids.member]) await run('INSERT INTO group_member(group_id,user_id,share_memory,contributor_consent,joined_at) VALUES(?,?,1,1,?)',ids.group,user,now);
  await run('INSERT INTO group_agent(group_id,agent_id,added_by,joined_at) VALUES(?,?,?,?)',ids.group,ids.contact,ids.owner,now);
}
async function turn(id='fixture-turn',contact=ids.contact,user=ids.owner,extra={}) {
  const values={id,contact_id:contact,user_id:user,user_text:'Fictional user likes green.',assistant_text:'Fictional reply.',status:'complete',workflow_id:`chat-${id}-a1`,created_at:now,updated_at:now,...extra};
  await run(`INSERT INTO chat_turn(${Object.keys(values)}) VALUES(${Object.keys(values).map(()=>'?')})`,...Object.values(values));
}
async function drain() {
  for(let i=0;i<30 && await count('resource_cleanup');i++) { await run('UPDATE resource_cleanup SET next_at=0,settle_at=0'); assert.equal((await invoke({action:'clean',id:''})).status,200); }
  assert.equal(await count('resource_cleanup'),0,'cleanup queue must drain');
  assert.equal(await count('resource_cleanup_scope'),0,'scope links must drain with their jobs');
  assert.equal((await rows('PRAGMA foreign_key_check')).length,0);
}

test('private clear removes a scheduled turn atomically',async()=>{
  await fixture();
  await run(`INSERT INTO contact_schedule(id,contact_id,user_id,instruction,time_zone,next_at,last_mutation,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`,'fixture-schedule',ids.contact,ids.owner,'Fictional reminder','UTC',now+60000,'fixture',now,now);
  await turn('fixture-scheduled',ids.contact,ids.owner,{schedule_id:'fixture-schedule',schedule_revision:1,scheduled_at:now});
  const response=await api(`contacts/${ids.contact}/clear`,ids.owner,'POST',{clearMemory:true,historyRevision:0});
  assert.equal(response.status,202,JSON.stringify(response.body));
  assert.equal(await count('chat_turn'),0); assert.equal(await count('contact_schedule'),0);
  await drain();
});

test('group owner can clear shared history; a member and outsider cannot',async()=>{
  await fixture();
  await run('INSERT INTO group_message(id,group_id,user_id,sender_name,text,created_at) VALUES(?,?,?,?,?,?)','fixture-message',ids.group,ids.member,'Fictional member','Fictional text',now);
  for(const user of [ids.member,ids.outsider]) assert.ok([403,404].includes((await api(`groups/${ids.group}/clear`,user,'POST',{clearMemory:true,historyRevision:0})).status));
  assert.equal(await count('group_message'),1);
  const response=await api(`groups/${ids.group}/clear`,ids.owner,'POST',{clearMemory:true,historyRevision:0});
  assert.equal(response.status,202,JSON.stringify(response.body)); assert.equal(await count('group_message'),0);
  assert.equal(await count('group_member'),2); assert.equal(await count('group_agent'),1); await drain();
});

async function memoryFixture(group=false) {
  if (group) {
    await run('INSERT INTO group_message(id,group_id,user_id,sender_name,text,created_at,contributor_consent) VALUES(?,?,?,?,?,?,1)','fixture-source',ids.group,ids.member,'Fictional member','Fictional member likes green.',now);
    await run('INSERT INTO group_reply(id,group_id,agent_id,source_id,status,workflow_id,created_at) VALUES(?,?,?,?,?,?,?)','fixture-reply',ids.group,ids.contact,'fixture-source','complete','fixture-group-workflow',now);
    await run('INSERT INTO group_message(id,group_id,agent_id,sender_name,text,created_at,contributor_consent) VALUES(?,?,?,?,?,?,1)','fixture-reply',ids.group,ids.contact,'Fictional contact','My fictional preference is green.',now);
    await run(`INSERT INTO group_memory(agent_id,user_id,memory_key,kind,content,source_id,source_quote,updated_at,embedding) VALUES(?,?,?,'preference',?,?,?, ?,zeroblob(1024))`,ids.contact,ids.member,'favorite_color','Fictional member likes green.','fixture-source','likes green',now);
    const event=(await rows('SELECT sequence FROM agent_memory_event WHERE group_message_id=?','fixture-reply'))[0].sequence;
    await run(`INSERT INTO agent_memory(agent_id,memory_key,kind,content,source_event_sequence,source_quote,updated_at) VALUES(?,?,'preference',?,?,?,?)`,ids.contact,'self_color','The fictional agent prefers green.',event,'preference is green',now);
    return 'fixture-source';
  }
  await turn(); const sequence=(await rows('SELECT sequence FROM chat_turn WHERE id=?','fixture-turn'))[0].sequence;
  await run(`INSERT INTO contact_memory(contact_id,user_id,memory_key,kind,content,source_turn_id,source_quote,source_sequence,updated_at,embedding) VALUES(?,?,?,'preference',?,?,?,?,?,zeroblob(1024))`,ids.contact,ids.owner,'favorite_color','Fictional owner likes green.','fixture-turn','likes green',sequence,now);
  await run('INSERT INTO contact_memory_state(contact_id,user_id,last_sequence) VALUES(?,?,?)',ids.contact,ids.owner,sequence);
  await run('INSERT INTO agent_memory_event(agent_id,private_turn_id) VALUES(?,?)',ids.contact,'fixture-turn');
  const event=(await rows('SELECT sequence FROM agent_memory_event WHERE private_turn_id=?','fixture-turn'))[0].sequence;
  await run(`INSERT INTO agent_memory(agent_id,memory_key,kind,content,source_event_sequence,source_quote,updated_at) VALUES(?,?,'preference',?,?,?,?)`,ids.contact,'self_color','The fictional agent prefers green.',event,'Fictional reply.',now);
  return 'fixture-turn';
}
async function attachment(key,scope) {
  await run('INSERT INTO chat_attachment_object(object_key,created_at,scope) VALUES(?,?,?)',key,now,scope);
  await bucket.put(key,'fictional file bytes');
  return JSON.stringify({key,name:'Fictional.jpg',mimeType:'image/jpeg',size:20,digest:'fictional'});
}
async function secondaryResources(group=false) {
  const scope=group?{group_id:ids.group,contact_id:null,user_id:null}:{group_id:null,contact_id:ids.contact,user_id:ids.owner};
  const source=group?'fixture-reply':'fixture-turn';
  const put=async(table,values)=>run(`INSERT INTO ${table}(${Object.keys(values)}) VALUES(${Object.keys(values).map(()=>'?')})`,...Object.values(values));
  await put('chat_document',{id:'fixture-document',...scope,title:'Fictional document',body:'Fictional markdown',source_id:source,created_by_kind:'user',created_by_id:ids.owner,updated_by_kind:'user',updated_by_id:ids.owner,created_at:now,updated_at:now});
  await put('chat_document_revision',{document_id:'fixture-document',revision:1,title:'Fictional document',body:'Fictional old revision',author_kind:'user',author_id:ids.owner,created_at:now});
  await put('task_list',{id:'fixture-list',...scope,title:'Fictional work',created_by_kind:'user',created_by_id:ids.owner,created_at:now,updated_at:now});
  for (const id of ['fixture-task','fixture-blocker']) await put('task',{id,list_id:'fixture-list',position:id==='fixture-task'?1:0,title:'Fictional task',assignee_kind:'agent',assignee_id:ids.contact,created_by_kind:'user',created_by_id:ids.owner,created_at:now,updated_at:now,work_due_at:now,document_id:'fixture-document',monitor_url:'https://example.test/fixture',monitor_user_id:ids.owner,monitor_due_at:now});
  await put('task_dependency',{task_id:'fixture-task',blocked_by_id:'fixture-blocker'});
  await put('task_work',{id:'fixture-work',task_id:'fixture-task',agent_id:ids.contact,reason:'assigned',created_at:now});
  await put('task_monitor_state',{task_id:'fixture-task',url:'https://example.test/fixture',hash:'fictional',snapshot:'Fictional monitored page',checked_at:now});
  await put('task_monitor_check',{id:'fixture-check',task_id:'fixture-task',url:'https://example.test/fixture',generation:0,outcome:'baseline',checked_at:now});
  await put('web_research',{id:'fixture-research',budget_id:'fixture-budget',user_id:ids.owner,agent_id:ids.contact,chat_turn_id:group?null:source,group_reply_id:group?source:null,group_source_id:group?'fixture-source':null,query:'Fictional question',title:'Fictional research',model:'muse-spark-1.3',status:'complete',result_json:'{"fictional":true}',document_id:'fixture-document',created_at:now,task_id:'fixture-task'});
  await put('mini_app',{id:'fixture-app',...scope,turn_id:group?null:source,reply_id:group?source:null,agent_id:ids.contact,title:'Fictional mini app',spec_json:'{}',tools_json:'[]',created_at:now,updated_at:now});
  await put('mini_app_state',{app_id:'fixture-app',values_json:'{"fictional":true}',version:1,updated_at:now});
  await put('mini_app_action',{id:'fixture-action',app_id:'fixture-app',revision:1,action_id:'fictional',arguments_json:'{}',status:'completed',created_at:now,updated_at:now});
  for(const table of ['task_mutation','document_mutation']) await put(table,{id:`${source}:fictional`,result_json:'{"fictional":true}',created_at:now});
  const execution=group?'mcp_group_execution':'mcp_execution';
  await put(execution,{turn_id:source,slot:0,connection_id:'fictional-connector',tool_name:'fictional_tool',arguments_json:'{}',result_json:'{"fictional":true}',...(group?{access_generation:'fictional'}:{})});
}
const secondaryTables=['task_list','task','task_dependency','task_work','task_monitor_state','task_monitor_check','web_research','chat_document','chat_document_revision','mini_app','mini_app_state','mini_app_action','task_mutation','document_mutation','mcp_execution','mcp_group_execution'];
for(const group of [false,true]) test(`${group?'group':'private'} clear cascades tasks, monitors, documents, apps, research and receipts`,async()=>{
  await fixture(); await memoryFixture(group); await secondaryResources(group);
  await turn('fixture-unrelated',ids.other,ids.outsider,{user_text:'Unrelated fictional message.',assistant_text:'Unrelated answer.'});
  const response=await api(`${group?'groups':'contacts'}/${group?ids.group:ids.contact}/clear`,ids.owner,'POST',{clearMemory:true,historyRevision:0});
  assert.equal(response.status,202,JSON.stringify(response.body));
  for(const table of secondaryTables) assert.equal(await count(table),0,table);
  assert.equal(await count('chat_turn','WHERE id=?','fixture-unrelated'),1);
  assert.equal(await count('agent_memory'),0); assert.equal(await count('contact_memory'),0);assert.equal(await count('group_memory'),0);
  assert.equal(await count('chat_turn_search',"WHERE chat_turn_search MATCH 'green'"),0);
  assert.equal(await count('group_message_search',"WHERE group_message_search MATCH 'green'"),0);
  await drain();
});

for(const group of [false,true]) test(`${group?'group':'private'} clear keeps extracted memories without transcripts, then can forget them`,async()=>{
  await fixture();await memoryFixture(group);
  const path=`${group?'groups':'contacts'}/${group?ids.group:ids.contact}/clear`;
  assert.equal((await api(path,ids.owner,'POST',{clearMemory:false,historyRevision:0})).status,202);
  const table=group?'retained_group_memory':'retained_contact_memory';
  assert.equal(await count(table),2);
  assert.equal(await count(group?'group_message':'chat_turn'),0);
  for(const row of await rows(`SELECT * FROM ${table}`)) { assert.ok(!('source_quote' in row));assert.ok(!('embedding' in row)); }
  assert.equal((await api(path,ids.owner,'POST',{clearMemory:true,historyRevision:1})).status,202);
  assert.equal(await count(table),0);await drain();
});

test('private clear purges image and voice objects, including late writes and direct/initiative generated images',async()=>{
  await fixture();
  const key='attachments/fixture-owner/fixture-contact/fixture-turn/image';
  const voice='attachments/fixture-owner/fixture-contact/fixture-turn/voice';
  const generated='generated/fixture-image.jpg';
  const spontaneous='generated/initiative-fixture.jpg';
  await turn('fixture-turn',ids.contact,ids.owner,{attachment_json:await attachment(key,ids.contact),assistant_messages_json:JSON.stringify([{id:'fixture-part',text:'Fictional audio',attachment:JSON.parse(await attachment(voice,ids.contact))}])});
  await attachment(generated,ids.contact);
  await attachment(spontaneous,ids.contact);
  await run("INSERT INTO generated_initiative_image(id,source_id,status,attachment_json,created_at) VALUES(?,?,'complete',?,?)",'initiative-fixture','fixture-turn',JSON.stringify({key:spontaneous}),now);
  await run("INSERT INTO generated_chat_image(id,chat_turn_id,status,attachment_json,created_at) VALUES(?,?,'complete',?,?)",'fixture-image','fixture-turn',JSON.stringify({key:generated}),now);
  await run('INSERT INTO chat_image_index(object_key,digest,description,context,search_text,updated_at) VALUES(?,?,?,?,?,?)',key,'fixture','Fictional picture','Fictional context','fictional',now);
  const response=await api(`contacts/${ids.contact}/clear`,ids.owner,'POST',{clearMemory:true,historyRevision:0});
  assert.equal(response.status,202);assert.equal(response.body.cleanup,'pending');
  assert.equal(await count('generated_chat_image'),0);assert.equal(await count('generated_initiative_image'),0);assert.equal(await count('chat_image_index'),0);
  await bucket.put(key,'fictional late upload after first sweep');
  await drain();
  for(const file of [key,voice,generated,spontaneous]) assert.equal(await bucket.head(file),null,file);
  assert.equal(await count('chat_attachment_object'),0);
});

test('R2 failure retains the cleanup job; retry deletes the object and registry',async()=>{
  await fixture();const key='attachments/fixture-failure/file';
  await turn('fixture-turn',ids.contact,ids.owner,{attachment_json:await attachment(key,ids.contact)});
  const result=await invoke({action:'clear',id:ids.contact,userID:ids.owner,memory:true},{objects:[key]});
  assert.equal(result.status,200);const job=(await rows("SELECT * FROM resource_cleanup WHERE kind='object' AND resource=?",key))[0];
  assert.equal(job.attempts,1);assert.ok(job.next_at>Date.now());assert.ok(await bucket.head(key));
  assert.equal(await count('chat_turn'),0);await drain();assert.equal(await bucket.head(key),null);
});

test('workflow deletion failure holds the clear lock; a retry stops execution and removes checkpoints',async()=>{
  await fixture();const workflow='fixture-real-running';
  await turn('fixture-turn',ids.contact,ids.owner,{status:'queued',assistant_text:null,workflow_id:workflow});
  await run('INSERT INTO agent_attention(agent_id,turn_id,attempt,workflow_id,acquired_at) VALUES(?,?,1,?,?)',ids.contact,'fixture-turn',workflow,now);
  assert.equal((await invoke({action:'workflow-create',id:workflow})).status,200);
  await workflowState(workflow,['running','waiting']);
  assert.equal(await count('fixture_workflow_checkpoint','WHERE id=?',workflow),1);
  await invoke({action:'clear',id:ids.contact,userID:ids.owner,memory:true},{workflows:[workflow]});
  assert.equal((await rows('SELECT clearing FROM contact WHERE id=?',ids.contact))[0].clearing,1);
  assert.equal(await count('agent_attention'),1);
  await assert.rejects(turn('fixture-blocked'),/cleanup is in progress/);
  await drain();assert.equal(await count('agent_attention'),0);
  assert.equal((await rows('SELECT clearing FROM contact WHERE id=?',ids.contact))[0].clearing,0);
  assert.equal((await invoke({action:'workflow-status',id:workflow})).status,500,'deleted instance must be unavailable');
});

test('newly enqueued cleanup is not delayed by failure of an older pass',async()=>{
  await fixture();const key='attachments/fixture-requeue';await attachment(key,ids.contact);
  await run("INSERT INTO resource_cleanup(kind,resource,scope,settle_at) VALUES('object',?,?,0)",key,ids.contact);
  await invoke({action:'clean',id:ids.contact},{requeue:{key,scope:ids.contact,fail:true}});
  const job=(await rows('SELECT * FROM resource_cleanup WHERE resource=?',key))[0];
  assert.equal(job.revision,1);assert.equal(job.next_at,0,'the failed older revision must not back off a new request');
  await drain();
});

test('delete of a shared member preserves the agent, owner history and group',async()=>{
  await fixture();await turn();await turn('fixture-member-turn',ids.shared,ids.member);
  assert.equal((await api(`contacts/${ids.shared}`,ids.member,'DELETE')).status,204);
  assert.equal(await count('contact_agent','WHERE id=?',ids.contact),1);assert.equal(await count('chat_turn','WHERE id=?','fixture-turn'),1);
  assert.equal(await count('contact','WHERE id=?',ids.shared),0);assert.equal(await count('group_agent'),1);await drain();
});

test('creator deletion removes all participant chats and agent group work without touching unrelated data',async()=>{
  await fixture();await memoryFixture(true);await secondaryResources(true);await turn();await turn('fixture-member-turn',ids.shared,ids.member);await turn('fixture-unrelated',ids.other,ids.outsider,{user_text:'Unrelated fictional message.',assistant_text:'Unrelated answer.'});
  await bucket.put(`contacts/${ids.owner}/${ids.contact}/obsolete-photo.jpg`,'fictional photo');
  const response=await api(`contacts/${ids.contact}`,ids.owner,'DELETE');assert.equal(response.status,204,JSON.stringify(response.body));
  assert.equal(await count('contact','WHERE agent_id=?',ids.contact),0);assert.equal(await count('group_agent'),0);assert.equal(await count('task'),0);assert.equal(await count('mini_app'),0);
  assert.equal(await count('group_message','WHERE agent_id=?',ids.contact),0);assert.equal(await count('chat_group'),1);assert.equal(await count('chat_turn','WHERE id=?','fixture-unrelated'),1);
  await drain();assert.equal(await bucket.head(`contacts/${ids.owner}/${ids.contact}/obsolete-photo.jpg`),null);
});

test('prefix list failure retries and multiple pages are swept without skipping keys',async()=>{
  await fixture();const prefix=`groups/${ids.group}/`;
  for(let i=0;i<205;i++)await bucket.put(`${prefix}${String(i).padStart(3,'0')}`,'fictional bytes');
  assert.equal((await api(`groups/${ids.group}`,ids.owner,'DELETE',undefined,{lists:[prefix]})).status,204);
  await invoke({action:'clean',id:''},{lists:[prefix]});
  assert.ok((await rows("SELECT attempts FROM resource_cleanup WHERE kind='prefix' AND resource=?",prefix))[0].attempts>=1);
  await drain();assert.equal((await bucket.list({prefix})).objects.length,0);
});

test('stale clear replay cannot erase newly created history and stale send is rejected',async()=>{
  await fixture();await turn();const path=`contacts/${ids.contact}/clear`;
  assert.equal((await api(path,ids.owner,'POST',{clearMemory:true,historyRevision:0})).status,202);
  await turn('fixture-new-turn');
  assert.equal((await api(path,ids.owner,'POST',{clearMemory:true,historyRevision:0})).status,202);
  assert.equal(await count('chat_turn','WHERE id=?','fixture-new-turn'),1);
  const stale=await api(`contacts/${ids.contact}/chat/turns`,ids.owner,'POST',{id:'11111111-1111-4111-8111-111111111111',text:'Fictional stale send',historyRevision:0});
  assert.equal(stale.status,409);assert.equal(await count('chat_turn'),1);await drain();
});

test('archive is per participant, reversible, and does not delete work or mark history read',async()=>{
  await fixture();await turn();
  assert.equal((await api(`contacts/${ids.contact}/archive`,ids.owner,'PUT',{archived:true})).status,204);
  assert.equal((await api(`groups/${ids.group}/archive`,ids.owner,'PUT',{archived:true})).status,204);
  assert.ok((await rows('SELECT archived_at FROM contact WHERE id=?',ids.contact))[0].archived_at);
  assert.equal((await rows('SELECT archived_at FROM contact WHERE id=?',ids.shared))[0].archived_at,null);
  assert.equal((await rows('SELECT archived_at FROM group_member WHERE group_id=? AND user_id=?',ids.group,ids.member))[0].archived_at,null);
  assert.equal(await count('chat_turn'),1);assert.equal((await rows('SELECT last_read_sequence FROM contact WHERE id=?',ids.contact))[0].last_read_sequence,0);
  assert.equal((await api(`contacts/${ids.contact}/archive`,ids.owner,'PUT',{archived:false})).status,204);
  assert.equal((await rows('SELECT archived_at FROM contact WHERE id=?',ids.contact))[0].archived_at,null);
});

test('generated-only cleanup reports pending under the chat scope until its final sweep',async()=>{
  await fixture();await turn();const key='generated/fixture-generated-only.jpg';await attachment(key,ids.contact);
  await run("INSERT INTO generated_chat_image(id,chat_turn_id,status,attachment_json,created_at) VALUES(?,?,'complete',?,?)",'fixture-generated-only','fixture-turn',JSON.stringify({key}),now);
  const response=await api(`contacts/${ids.contact}/clear`,ids.owner,'POST',{clearMemory:true,historyRevision:0});
  assert.equal(response.status,202);assert.equal(response.body.cleanup,'pending','a generated file still has a delayed cleanup job');
  assert.equal((await rows("SELECT scope FROM resource_cleanup WHERE kind='object' AND resource=?",key))[0].scope,ids.contact);
  await drain();assert.equal(await bucket.head(key),null);
});

for(const fail of [false,true]) test(`dispatch cannot resurrect a cleared workflow after ${fail?'a lost':'a successful'} create acknowledgement`,async()=>{
  await fixture();const id=`fixture-create-race-${fail?'lost':'ok'}`;
  await turn('fixture-turn',ids.contact,ids.owner,{status:'queued',assistant_text:null,workflow_id:id});
  assert.equal((await invoke({action:'dispatch',id:ids.contact},{createRace:{contact:ids.contact,user:ids.owner,fail}})).status,200);
  await drain();
  assert.equal((await invoke({action:'workflow-status',id})).status,500,'a dispatch that lost its source must remove the late instance');
});

test('successful older cleanup cannot acknowledge a newer enqueue',async()=>{
  await fixture();const key='attachments/fixture-success-requeue';await attachment(key,ids.contact);
  await run("INSERT INTO resource_cleanup(kind,resource,scope,settle_at) VALUES('object',?,?,0)",key,ids.contact);
  await invoke({action:'clean',id:ids.contact},{requeue:{key,scope:ids.contact}});
  const job=(await rows('SELECT revision FROM resource_cleanup WHERE resource=?',key))[0];assert.equal(job.revision,1);await drain();
});

test('simultaneous clears serialize conflicting memory choices and increment history once',async()=>{
  await fixture();await memoryFixture();
  const responses=await Promise.all([false,true].map(clearMemory=>api(`contacts/${ids.contact}/clear`,ids.owner,'POST',{clearMemory,historyRevision:0})));
  for(const response of responses)assert.equal(response.status,202,JSON.stringify(response.body));
  assert.equal((await rows('SELECT history_revision FROM contact WHERE id=?',ids.contact))[0].history_revision,1);
  assert.ok([0,2].includes(await count('retained_contact_memory')));await drain();
});

test('actual kept private memories remain readable and disappear on membership deletion',async()=>{
  await fixture();await memoryFixture();
  await api(`contacts/${ids.contact}/clear`,ids.owner,'POST',{clearMemory:false,historyRevision:0});
  const memory=await invoke({action:'memories',id:ids.contact,userID:ids.owner});
  assert.equal(memory.human.length,1);assert.equal(memory.self.length,1);assert.equal(memory.human[0].sourceQuote,'');assert.equal(memory.self[0].sourceQuote,'');
  assert.equal((await api(`contacts/${ids.contact}`,ids.owner,'DELETE')).status,204);
  assert.equal(await count('retained_contact_memory'),0);await drain();
});

test('backoff is capped and an old repeatedly failing job is retained for later recovery',async()=>{
  await fixture();const key='attachments/fixture-many-failures';await attachment(key,ids.contact);
  await run("INSERT INTO resource_cleanup(kind,resource,scope,attempts,settle_at) VALUES('object',?,?,50,0)",key,ids.contact);
  const before=Date.now();await invoke({action:'clean',id:ids.contact},{objects:[key]});
  const job=(await rows('SELECT * FROM resource_cleanup WHERE resource=?',key))[0];assert.equal(job.attempts,51);
  assert.ok(job.next_at>=before+3599000 && job.next_at<=Date.now()+3600000);await drain();assert.equal(await bucket.head(key),null);
});

async function workflowState(id, states) {
  for(let attempt=0;attempt<100;attempt++) {
    const result=await invoke({action:'workflow-status',id});
    if(result.status===200 && states.includes(result.workflowStatus) && await count('fixture_workflow_checkpoint','WHERE id=?',id))return result;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  throw new Error(`Fixture workflow ${id} never reached ${states}`);
}

test('lost initiative create acknowledgement does not leave a workflow after clear',async()=>{
  await fixture();await turn();
  await run('INSERT INTO conversation_initiative(contact_id,source_id,anchor_id,next_at,expires_at) VALUES(?,?,?,?,?)',ids.contact,'fixture-turn','fixture-turn',now-1000,now+86400000);
  const id='initiative-fixture-turn-1';
  assert.equal((await invoke({action:'initiative',id:ids.contact},{createRace:{contact:ids.contact,user:ids.owner,fail:true}})).status,200);
  await drain();assert.equal((await invoke({action:'workflow-status',id})).status,500);
});

for(const complete of [false,true])test(`delete removes ${complete?'completed':'paused'} workflow state as well as its source`,async()=>{
  await fixture();const id=`fixture-${complete?'completed':'paused'}`;
  await turn('fixture-turn',ids.contact,ids.owner,{workflow_id:id});
  await invoke({action:'workflow-create',id,complete});
  await workflowState(id,complete?['complete']:['running','waiting']);
  assert.equal(await count('fixture_workflow_checkpoint','WHERE id=?',id),1);
  if(!complete){await invoke({action:'workflow-pause',id});await workflowState(id,['paused']);}
  assert.equal((await api(`contacts/${ids.contact}`,ids.owner,'DELETE')).status,204);await drain();
  assert.equal((await invoke({action:'workflow-status',id})).status,500);
});

test('group-generated media keeps the group scope even when its source disappears in a cascade',async()=>{
  await fixture();await memoryFixture(true);const key='generated/fixture-group-generated.jpg';await attachment(key,ids.group);
  await run("INSERT INTO generated_chat_image(id,group_reply_id,status,attachment_json,created_at) VALUES(?,?,'complete',?,?)",'fixture-group-generated','fixture-reply',JSON.stringify({key}),now);
  const response=await api(`groups/${ids.group}/clear`,ids.owner,'POST',{clearMemory:true,historyRevision:0});
  assert.equal(response.status,202);assert.equal(response.body.cleanup,'pending');
  assert.equal((await rows('SELECT scope FROM resource_cleanup WHERE resource=?',key))[0].scope,ids.group);await drain();assert.equal(await bucket.head(key),null);
});

test('a cleanup request never removes an object still referenced by another live message',async()=>{
  await fixture();const key='attachments/fixture-shared-file';const json=await attachment(key,ids.contact);
  await turn('fixture-turn',ids.contact,ids.owner,{attachment_json:json});await turn('fixture-other-reference',ids.other,ids.outsider,{attachment_json:json});
  await api(`contacts/${ids.contact}/clear`,ids.owner,'POST',{clearMemory:true,historyRevision:0});await drain();
  assert.ok(await bucket.head(key));assert.equal(await count('chat_attachment_object','WHERE object_key=?',key),1);
});

test('migration 0064 repairs queued generated media scopes in an existing 0063 database',async()=>{
  const legacy=await mf.getD1Database('DB_UPGRADE');
  for(const file of (await readdir(join(root,'apps/api/migrations'))).filter(file=>file.endsWith('.sql') && file<'0064').sort()) {
    for(const statement of splitSQL(await readFile(join(root,'apps/api/migrations',file),'utf8')))await legacy.prepare(statement).run();
  }
  await legacy.batch([
    legacy.prepare('INSERT INTO chat_attachment_object(object_key,created_at,scope) VALUES(?,?,?)').bind('generated/fixture-upgrade.jpg',now,ids.contact),
    legacy.prepare("INSERT INTO resource_cleanup(kind,resource,scope,attempts,next_at,revision) VALUES('object',?,?,3,123,2)").bind('generated/fixture-upgrade.jpg','deleted-fixture-turn'),
  ]);
  for(const statement of splitSQL(await readFile(join(root,'apps/api/migrations/0064_lifecycle_cleanup_guards.sql'),'utf8')))await legacy.prepare(statement).run();
  const row=await legacy.prepare('SELECT * FROM resource_cleanup').first();assert.equal(row.scope,ids.contact);assert.equal(row.attempts,3);assert.equal(row.revision,2);assert.equal(row.next_at,123);
  assert.equal((await legacy.prepare('PRAGMA foreign_key_check').all()).results.length,0);
});

test('group clear tracks pending private result workflows as part of the group cleanup',async()=>{
  await fixture();await turn('fixture-request-source');
  await run(`INSERT INTO group_request(id,source_turn_id,group_id,requester_id,sender_agent_id,target_agent_id,question,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,'waiting',?,?)`,'fixture-request','fixture-request-source',ids.group,ids.owner,ids.contact,ids.other,'Fictional group question',now,now+60000);
  await turn('fixture-private-result',ids.contact,ids.owner,{group_request_id:'fixture-request',workflow_id:'fixture-result-workflow'});
  await invoke({action:'workflow-create',id:'fixture-result-workflow'});
  const response=await api(`groups/${ids.group}/clear`,ids.owner,'POST',{clearMemory:true,historyRevision:0},{workflows:['fixture-result-workflow']});
  assert.equal(response.status,202);assert.equal(response.body.cleanup,'pending','private result cleanup belongs to the cleared group too');
  assert.equal((await rows('SELECT clearing FROM chat_group WHERE id=?',ids.group))[0].clearing,1);
  assert.equal(await count('chat_turn','WHERE id=?','fixture-private-result'),0);assert.equal(await count('chat_turn','WHERE id=?','fixture-request-source'),1);
  await drain();assert.equal((await invoke({action:'workflow-status',id:'fixture-result-workflow'})).status,500);
});

async function groupPrivateResult({media=false}={}) {
  await turn('fixture-request-source');
  await run(`INSERT INTO group_request(id,source_turn_id,group_id,requester_id,sender_agent_id,target_agent_id,question,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,'waiting',?,?)`,'fixture-request','fixture-request-source',ids.group,ids.owner,ids.contact,ids.other,'Fictional group question',now,now+60000);
  const key='attachments/fixture-result-voice';
  await turn('fixture-private-result',ids.contact,ids.owner,{group_request_id:'fixture-request',workflow_id:'fixture-result-with-media',...(media?{assistant_messages_json:JSON.stringify([{id:'fixture-result-part',text:'Fictional result',attachment:JSON.parse(await attachment(key,ids.contact))}])}:{})});
  return key;
}

test('group-private result media stays pending under both scopes after an R2 failure',async()=>{
  await fixture();const key=await groupPrivateResult({media:true});
  const response=await api(`groups/${ids.group}/clear`,ids.owner,'POST',{clearMemory:true,historyRevision:0},{objects:[key]});
  assert.equal(response.status,202);assert.equal(response.body.cleanup,'pending');
  for(const scope of [ids.contact,ids.group])assert.equal(await count('resource_cleanup_scope',"WHERE kind='object' AND resource=? AND scope=?",key,scope),1);
  assert.equal(await count('chat_turn','WHERE id=?','fixture-request-source'),1);await drain();assert.equal(await bucket.head(key),null);
});

test('a linked workflow failure blocks both concurrent private and group clears until recovery',async()=>{
  await fixture();await groupPrivateResult();const id='fixture-result-with-media';await invoke({action:'workflow-create',id});
  const faults={workflows:[id]};
  assert.equal((await api(`groups/${ids.group}/clear`,ids.owner,'POST',{clearMemory:true,historyRevision:0},faults)).status,202);
  assert.equal((await api(`contacts/${ids.contact}/clear`,ids.owner,'POST',{clearMemory:true,historyRevision:0},faults)).status,202);
  assert.equal((await rows('SELECT clearing FROM contact WHERE id=?',ids.contact))[0].clearing,1);
  assert.equal((await rows('SELECT clearing FROM chat_group WHERE id=?',ids.group))[0].clearing,1);
  await drain();
  assert.equal((await rows('SELECT clearing FROM contact WHERE id=?',ids.contact))[0].clearing,0);
  assert.equal((await rows('SELECT clearing FROM chat_group WHERE id=?',ids.group))[0].clearing,0);
});

test('kept human memory respects shared-memory and Contributor consent on every read',async()=>{
  await fixture();await memoryFixture();await api(`contacts/${ids.contact}/clear`,ids.owner,'POST',{clearMemory:false,historyRevision:0});
  let memory=await invoke({action:'memories',id:ids.shared,userID:ids.member});assert.equal(memory.human.length,0);
  await run('UPDATE contact_agent SET memory_shared=1 WHERE id=?',ids.contact);
  memory=await invoke({action:'memories',id:ids.shared,userID:ids.member});assert.equal(memory.human.length,1);
  memory=await invoke({action:'memories',id:ids.shared,userID:ids.member,contributor:true});assert.equal(memory.human.length,0);assert.equal(memory.self.length,0);
  await drain();
});

test('kept MCP-isolated memory stays available locally without escaping to another participant',async()=>{
  await fixture();await memoryFixture();await run('INSERT INTO mcp_private_contact(contact_id) VALUES(?)',ids.contact);
  await run('UPDATE contact_agent SET memory_shared=1 WHERE id=?',ids.contact);
  await api(`contacts/${ids.contact}/clear`,ids.owner,'POST',{clearMemory:false,historyRevision:0});
  const own=await invoke({action:'memories',id:ids.contact,userID:ids.owner});assert.equal(own.human.length,1);assert.equal(own.self.length,1);
  const shared=await invoke({action:'memories',id:ids.shared,userID:ids.member});assert.equal(shared.human.length,0);assert.equal(shared.self.length,0);await drain();
});

test('kept isolated group memories require live membership and are removed with their author',async()=>{
  await fixture();await memoryFixture(true);await run('INSERT INTO mcp_private_group(group_id) VALUES(?)',ids.group);
  await api(`groups/${ids.group}/clear`,ids.owner,'POST',{clearMemory:false,historyRevision:0});
  const own=await invoke({action:'memories',id:ids.contact,userID:ids.member,group:true});assert.equal(own.human.length,1);assert.equal(own.self.length,1);
  const denied=await invoke({action:'memories',id:ids.contact,userID:ids.outsider,group:true});assert.equal(denied.human.length,0);assert.equal(denied.self.length,0);
  await run('DELETE FROM group_member WHERE group_id=? AND user_id=?',ids.group,ids.member);
  assert.equal(await count('retained_group_memory',"WHERE user_id=? AND category IN ('human','local_human')",ids.member),0);await drain();
});

test('retained facts stay bounded after clearing a large set of extracted keys',async()=>{
  await fixture();await memoryFixture();const sequence=(await rows('SELECT sequence FROM chat_turn WHERE id=?','fixture-turn'))[0].sequence;
  for(let i=0;i<70;i++)await run(`INSERT INTO contact_memory(contact_id,user_id,memory_key,kind,content,source_turn_id,source_quote,source_sequence,updated_at) VALUES(?,?,?,'fact',?,?,?,?,?)`,ids.contact,ids.owner,`fictional_${i}`,'Fictional bounded fact','fixture-turn','Fictional',sequence,now+i);
  await api(`contacts/${ids.contact}/clear`,ids.owner,'POST',{clearMemory:false,historyRevision:0});
  assert.equal(await count('retained_contact_memory',"WHERE category='human'"),64);await drain();
});

test('private clear removes pending native and push work, preserving the account device',async()=>{
  await fixture();await turn();
  await run("INSERT INTO push_device(id,token,environment,session_id,updated_at) VALUES(?,?,'development',?,?)",'fixture-device','fictional-push-token',`session-${ids.owner}`,now);
  await run('INSERT INTO push_delivery(turn_id,device_id,session_id,next_at,expires_at) VALUES(?,?,?,?,?)','fixture-turn','fixture-device',`session-${ids.owner}`,now,now+60000);
  await run("INSERT INTO native_action(id,turn_id,kind,payload_json,status,created_at,updated_at,expires_at) VALUES(?,?,'timer','{}','pending',?,?,?)",'fixture-native','fixture-turn',now,now,now+60000);
  await run('INSERT INTO native_remote_device(id,user_id,installation_id,push_device_id,name,updated_at) VALUES(?,?,?,?,?,?)','fixture-remote',ids.owner,'fixture-installation','fixture-device','Fictional phone',now);
  await run('INSERT INTO native_remote_grant(device_id,contact_id,created_at) VALUES(?,?,?)','fixture-remote',ids.contact,now);
  assert.equal((await api(`contacts/${ids.contact}/clear`,ids.owner,'POST',{clearMemory:true,historyRevision:0})).status,202);
  for(const table of ['native_action','native_remote_grant','push_delivery'])assert.equal(await count(table),0,table);
  assert.equal(await count('push_device'),1);assert.equal(await count('native_remote_device'),1);await drain();
});

test('contact deletion removes generation checkpoints and its onboarding identity, preserving other contacts',async()=>{
  await fixture();
  const keep='fixture-onboarding-keep';await run('INSERT INTO contact(id,user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)',keep,ids.owner,'Fictional kept contact',now,now);
  await run("INSERT INTO contact_generation(id,user_id,input_json,plan_json,status,contact_id,updated_at) VALUES(?,?,'{}',?,'complete',?,?)",'fixture-generation-job',ids.owner,JSON.stringify({id:ids.contact}),ids.contact,now);
  await run("INSERT INTO account_onboarding(user_id,input_json,plan_json,status,updated_at) VALUES(?,? ,?,'complete',?)",ids.owner,JSON.stringify({name:'Fictional owner'}),JSON.stringify({contacts:[{id:ids.contact,name:'Fictional deleted contact'},{id:keep,name:'Fictional kept contact'}]}),now);
  const generation='contact-generation-fixture-generation-job';const onboarding=`onboarding-${ids.owner}`;
  for(const id of [generation,onboarding])assert.equal((await invoke({action:'workflow-create',id,userID:ids.owner,generation:true,complete:true})).status,200);
  const photo=`contacts/${ids.owner}/${ids.contact}/old-portrait.jpg`;await bucket.put(photo,'Fictional portrait');
  assert.equal((await api(`contacts/${ids.contact}`,ids.owner,'DELETE',undefined,{workflows:[generation]})).status,204);
  assert.equal(await count('contact_generation'),0);const plan=JSON.parse((await rows('SELECT plan_json FROM account_onboarding WHERE user_id=?',ids.owner))[0].plan_json);
  assert.deepEqual(plan.contacts.map(contact=>contact.id),[keep]);assert.equal(await count('contact','WHERE id=?',keep),1);
  await drain();assert.equal(await bucket.head(photo),null);
  for(const id of [generation,onboarding])assert.equal((await invoke({action:'workflow-status',id,generation:true})).status,500);
});


test('a failed late workflow deletion remains visible to its original conversation',async()=>{
  await fixture();const id='fixture-late-workflow-retry';await turn('fixture-turn',ids.contact,ids.owner,{status:'queued',assistant_text:null,workflow_id:id});
  await invoke({action:'dispatch',id:ids.contact},{createRace:{contact:ids.contact,user:ids.owner,fail:true},workflows:[id]});
  const response=await api(`contacts/${ids.contact}/clear`,ids.owner,'POST',{clearMemory:true,historyRevision:0});
  assert.equal(response.status,202);assert.equal(response.body.cleanup,'pending');
  assert.equal((await rows('SELECT scope FROM resource_cleanup WHERE resource=?',id))[0].scope,ids.contact);
  await drain();assert.equal((await invoke({action:'workflow-status',id})).status,500);
});

test('admin deletion removes account data and retries external cleanup after failures',async()=>{
  await fixture();await memoryFixture();await secondaryResources();
  const group='fixture-peer-group';
  await run('INSERT INTO chat_group(id,owner_id,name,created_at) VALUES(?,?,?,?)',group,ids.member,'Fictional peer group',now);
  for(const user of [ids.owner,ids.member])await run('INSERT INTO group_member(group_id,user_id,share_memory,joined_at) VALUES(?,?,1,?)',group,user,now);
  const key=`group-attachments/${group}/fictional-owned.jpg`;
  const media=await attachment(key,group);
  await run('INSERT INTO group_message(id,group_id,user_id,sender_name,text,attachment_json,created_at) VALUES(?,?,?,?,?,?,?)','fixture-owned-message',group,ids.owner,'Fictional removed person','Fictional text',media,now);
  await run('INSERT INTO group_message(id,group_id,user_id,sender_name,text,created_at) VALUES(?,?,?,?,?,?)','fixture-peer-message',group,ids.member,'Fictional peer','Keep this fictional text',now);
  const photo=`users/${ids.owner}/fictional.jpg`;
  await bucket.put(photo,'Fictional profile');
  const workflow=`onboarding-${ids.owner}`;
  await run("INSERT INTO account_onboarding(user_id,input_json,status,updated_at) VALUES(?,'{}','complete',?)",ids.owner,now);
  await invoke({action:'workflow-create',id:workflow,userID:ids.owner,generation:true,complete:true});
  const path=`admin/users/${ids.owner}`;
  assert.equal((await api(path,ids.member,'DELETE',{email:`${ids.owner}@example.test`})).status,403);
  assert.equal((await api(path,ids.outsider,'DELETE',{email:'wrong@example.test'})).status,422);
  const result=await api(path,ids.outsider,'DELETE',{email:`${ids.owner}@example.test`},{lists:[`users/${ids.owner}/`],workflows:[workflow]});
  assert.equal(result.status,202,JSON.stringify(result.body));assert.equal(result.body.cleanup,'pending');
  for(const table of ['chat_turn','contact_memory','task_list','task','chat_document','account_onboarding'])assert.equal(await count(table),0,table);
  assert.equal(await count('user','WHERE id=?',ids.owner),0);
  assert.equal(await count('session','WHERE user_id=?',ids.owner),0);
  assert.equal(await count('contact','WHERE id=?',ids.shared),0);
  assert.equal(await count('contact','WHERE id=?',ids.other),1);
  assert.equal(await count('chat_group','WHERE id=?',group),1);
  assert.equal(await count('group_message','WHERE id=?','fixture-owned-message'),0);
  assert.equal(await count('group_message','WHERE id=?','fixture-peer-message'),1);
  assert.equal(await count('resource_cleanup',"WHERE resource=?",`generation:${workflow}`),1);
  assert.equal(await count('resource_cleanup',"WHERE resource=?",`users/${ids.owner}/`),1);
  const event=(await rows("SELECT details_json FROM admin_event WHERE action='user.delete' AND target=? ORDER BY created_at DESC LIMIT 1",ids.owner))[0];
  assert.ok(event);assert.ok(!event.details_json.includes('@'));
  await drain();assert.equal(await bucket.head(photo),null);assert.equal(await bucket.head(key),null);
  assert.equal((await invoke({action:'workflow-status',id:workflow,generation:true})).status,500);
});

test('account deletion before contacts publish queues onboarding and unpublished portraits',async()=>{
  await fixture();
  await run("INSERT INTO account_onboarding(user_id,input_json,status,updated_at) VALUES(?,'{}','generating',?)",ids.member,now);
  await run("INSERT INTO contact_generation(id,user_id,input_json,plan_json,status,updated_at) VALUES(?,?,'{}',?,'generating',?)",'fixture-unpublished-job',ids.member,JSON.stringify({id:'fixture-unpublished-contact'}),now);
  const portrait=`contacts/${ids.member}/fixture-unpublished-contact/portrait.jpg`;
  await bucket.put(portrait,'Fictional unpublished portrait');
  await run('DELETE FROM user WHERE id=?',ids.member);
  for(const resource of [`generation:onboarding-${ids.member}`,'generation:contact-generation-fixture-unpublished-job']) {
    assert.equal(await count('resource_cleanup','WHERE resource=?',resource),1);
  }
  await drain();assert.equal(await bucket.head(portrait),null);
  assert.equal(await count('user','WHERE id=?',ids.owner),1);
});

test('generation dispatch cannot leave checkpoints after racing account deletion, including a lost acknowledgement',async()=>{
  for(const generation of [false,true])for(const fail of [false,true]) {
    await fixture();const job='fixture-dispatch-job';
    if(generation)await run("INSERT INTO contact_generation(id,user_id,input_json,status,updated_at) VALUES(?,?,'{}','queued',?)",job,ids.member,now);
    else await run("INSERT INTO account_onboarding(user_id,input_json,status,updated_at) VALUES(?,'{}','queued',?)",ids.member,now);
    const result=await invoke({action:generation?'dispatch-generation':'dispatch-onboarding',id:job,userID:ids.member},{accountCreateRace:{user:ids.member,fail}});
    assert.equal(result.status,200,JSON.stringify(result));
    await drain();
    const workflow=generation?`contact-generation-${job}`:`onboarding-${ids.member}`;
    assert.equal((await invoke({action:'workflow-status',id:workflow,generation:true})).status,500);
  }
});

// ---- Per-contact memory isolation (docs/memory.md) ---------------------------------------------
// A  = owner's contact on agent X, the only place the fact is saved.
// B  = same owner, a different contact with its own agent Y (separate contact, shared account).
// C  = another person's participant row on agent X (shared contact); only memory_shared changes its reads.
// D  = an unrelated account's contact.
// Everything lives in one D1 database; isolation is the row predicates asserted below, not separate stores.
const isolation = { b: 'fixture-contact-b' };
const FACT = 'Sombra is my fake plant, I water it on Tuesdays';
const QUERIES = ['What do I water on Tuesdays?', 'Sombra'];
const leaks = (read) => /sombra/i.test(JSON.stringify({ human: read.human, humanBlock: read.humanBlock, self: read.self, selfBlock: read.selfBlock,
  groups: read.groups, groupHits: read.groupHits, related: read.related }));
async function isolationFixture() {
  await fixture();
  await run('INSERT INTO contact(id,user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)',isolation.b,ids.owner,'Fictional contact B',now,now);
  await turn('sombra-turn',ids.contact,ids.owner,{user_text:FACT,assistant_text:'Fictional reply about the plant.'});
  await turn('other-turn',isolation.b,ids.owner,{user_text:'Fictional unrelated message.',assistant_text:'Fictional reply.'});
  const sequence=(await rows('SELECT sequence FROM chat_turn WHERE id=?','sombra-turn'))[0].sequence;
  await run(`INSERT INTO contact_memory(contact_id,user_id,memory_key,kind,content,source_turn_id,source_quote,source_sequence,updated_at,embedding) VALUES(?,?,?,'fact',?,?,?,?,?,zeroblob(1024))`,
    ids.contact,ids.owner,'fake_plant_sombra','The fake plant Sombra is watered on Tuesdays.','sombra-turn','Sombra is my fake plant',sequence,now);
  await run('INSERT INTO contact_memory_state(contact_id,user_id,last_sequence) VALUES(?,?,?)',ids.contact,ids.owner,sequence);
}
const readers = {
  A: { id: ids.contact, userID: ids.owner, agentID: ids.contact },
  B: { id: isolation.b, userID: ids.owner, agentID: isolation.b },
  C: { id: ids.shared, userID: ids.member, agentID: ids.contact },
  D: { id: ids.other, userID: ids.outsider, agentID: ids.other },
};
const names = { [ids.contact]: 'A', [isolation.b]: 'B', [ids.shared]: 'C', [ids.other]: 'D', [ids.owner]: 'owner', [ids.member]: 'member', [ids.outsider]: 'outsider' };
async function readAll(label) {
  const result = {};
  for (const [who, reader] of Object.entries(readers)) {
    result[who] = {};
    for (const query of QUERIES) {
      const read = await invoke({ action: 'context', ...reader, query });
      assert.equal(read.status, 200, JSON.stringify(read));
      result[who][query] = read;
      const memory = read.sql.find(s => /FROM contact_memory m/.test(s.sql));
      console.log(`[${label}] ${who} ← ${JSON.stringify(query)}\n  D1 memory query params=${JSON.stringify(memory.params.map(p => names[p] ?? p))}` + `\n`
        + `  statements=${read.sql.length} rows=${read.human.length} humanBlock=${read.humanBlock}\n  selfBlock=${read.selfBlock} groups=${JSON.stringify(read.groups).slice(0,80)} related=${read.related.length} → ${leaks(read) ? 'CONTAINS Sombra' : 'no Sombra'}`);
    }
  }
  const text = (await invoke({ action: 'context', ...readers.A, query: QUERIES[0] })).sql.find(s => /FROM contact_memory m/.test(s.sql)).sql;
  console.log(`[${label}] statement text (identical for every caller; bound ids and stored flags decide):\n${text.replace(/\s+/g, ' ')}`);
  return result;
}
const expectLeak = (all, who, expected, label) => { for (const query of QUERIES) assert.equal(leaks(all[who][query]), expected, `${label}: ${who} ← ${query}`); };

test('isolation: with sharing OFF only A sees Sombra; B, C and D get a context without it', async () => {
  await isolationFixture();
  assert.equal((await rows('SELECT memory_shared AS v FROM contact_agent WHERE id=?',ids.contact))[0].v, 0, 'default is not shared');
  const all = await readAll('sharing OFF');
  expectLeak(all, 'A', true, 'owner of the fact'); // A's own recall works
  for (const who of ['B', 'C', 'D']) for (const query of QUERIES) assert.equal(leaks(all[who][query]), false, `LEAK: ${who} ← ${query}`);
  // The assertion is real: the same query on A is a hit, both in memory rows and in its history recall.
  assert.equal(all.A[QUERIES[0]].human.length, 1); assert.ok(all.A[QUERIES[1]].related.length >= 1);
  // Query evidence: B never binds A's ids; both memory predicates are in the statement that ran.
  for (const query of QUERIES) {
    const b = all.B[query].sql; assert.ok(b.every(s => s.params.every(p => ![ids.contact, ids.shared].includes(p))), 'B binds no A/C id');
    assert.ok(all.B[query].sql.find(s => /FROM contact_memory m/.test(s.sql)).sql.includes('source.agent_id = current.agent_id'));
    assert.ok(all.C[query].sql.find(s => /FROM contact_memory m/.test(s.sql)).sql.includes('a.memory_shared = 1'));
  }
  await drain();
});

test('isolation: the sharing flag gates real reads for C (positive control), B stays isolated either way', async () => {
  await isolationFixture();
  await run('UPDATE contact_agent SET memory_shared=1 WHERE id=?',ids.contact);
  const on = await readAll('sharing ON');
  expectLeak(on, 'C', true, 'sharing ON must expose the owner’s fact to the other participant of the SAME agent');
  assert.equal(on.C[QUERIES[0]].human[0].sourceUserID, ids.owner, 'attributed to its source person');
  for (const who of ['B', 'D']) for (const query of QUERIES) assert.equal(leaks(on[who][query]), false, `LEAK with sharing ON: ${who} ← ${query}`);
  // Flipping the column back cuts the very next read; nothing is cached or copied.
  await run('UPDATE contact_agent SET memory_shared=0 WHERE id=?',ids.contact);
  const off = await readAll('sharing back OFF');
  for (const who of ['B', 'C', 'D']) for (const query of QUERIES) assert.equal(leaks(off[who][query]), false, `LEAK after un-sharing: ${who} ← ${query}`);
  expectLeak(off, 'A', true, 'owner keeps recall');
  await drain();
});

test('isolation: a connector-isolated A never exposes Sombra, even with sharing ON', async () => {
  await isolationFixture();
  await run('UPDATE contact_agent SET memory_shared=1 WHERE id=?',ids.contact);
  await run('INSERT INTO mcp_private_contact(contact_id) VALUES(?)',ids.contact);
  const all = await readAll('sharing ON + connector-isolated');
  expectLeak(all, 'A', true, 'A recalls its own connector-isolated memory');
  for (const who of ['B', 'C', 'D']) for (const query of QUERIES) assert.equal(leaks(all[who][query]), false, `LEAK from isolated A: ${who} ← ${query}`);
  assert.ok(all.C[QUERIES[0]].sql.find(s => /FROM contact_memory m/.test(s.sql)).sql.includes('mcp_private_contact'));
  await drain();
});

// ---- Privacy audiences (docs/privacy.md) ----------------------------------------------------------
// Owner U holds contact X (fixture-contact); member V shares X (fixture-shared). Group G has U, V and X.
// Group G2 has U, the outsider W and X. Each fact uses a unique word so a leak is a plain substring.
const audience = { g2: 'fixture-group-two', b: 'fixture-contact-b' };
async function audienceFixture() {
  await fixture();
  await run('UPDATE contact_agent SET memory_shared=1 WHERE id=?',ids.contact);
  await run('INSERT INTO contact(id,user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)',audience.b,ids.owner,'Fictional contact B',now,now);
  await run('INSERT INTO chat_group(id,owner_id,name,created_at) VALUES(?,?,?,?)',audience.g2,ids.owner,'Fictional group two',now);
  for(const user of [ids.owner,ids.outsider]) await run('INSERT INTO group_member(group_id,user_id,share_memory,contributor_consent,joined_at) VALUES(?,?,1,1,?)',audience.g2,user,now);
  await run('INSERT INTO group_agent(group_id,agent_id,added_by,joined_at) VALUES(?,?,?,?)',audience.g2,ids.contact,ids.owner,now);
  const remember = async (contact, user, turnID, key, content) => {
    await turn(turnID,contact,user,{user_text:content,assistant_text:'Fictional reply.'});
    const sequence=(await rows('SELECT sequence FROM chat_turn WHERE id=?',turnID))[0].sequence;
    await run(`INSERT INTO contact_memory(contact_id,user_id,memory_key,kind,content,source_turn_id,source_quote,source_sequence,updated_at) VALUES(?,?,?,'fact',?,?,?,?,?)`,
      contact,user,key,content,turnID,content,sequence,now);
  };
  await remember(ids.contact,ids.owner,'owner-turn','owner_tulip','Owner keeps a Tulipan notebook.');
  await remember(ids.shared,ids.member,'member-turn','member_quokka','Member adopted a Quokka named Bruno.');
  await remember(audience.b,ids.owner,'b-turn','owner_zeppelin','Owner booked a Zeppelin tour.');
  await run('INSERT INTO group_message(id,group_id,user_id,sender_name,text,created_at) VALUES(?,?,?,?,?,?)','g2-message',audience.g2,ids.outsider,'Fictional outsider','Outsider plans a Marimba surprise.',now);
  await run(`INSERT INTO group_memory(agent_id,user_id,memory_key,kind,content,source_id,source_quote,updated_at) VALUES(?,?,?,'fact',?,?,?,?)`,
    ids.contact,ids.outsider,'outsider_marimba','Outsider plans a Marimba surprise.','g2-message','Outsider plans a Marimba surprise.',now);
}
const sees = (read, word) => new RegExp(word,'i').test(JSON.stringify([read.human, read.groupSearch]));
const groupRead = (groupID) => invoke({ action:'audience', id: ids.contact, userID: ids.owner, agentID: ids.contact, groupID });
const privateRead = (id, userID, agentID) => invoke({ action:'audience', id, userID, agentID });

test('isolation: a group only hears facts from its own members and its own group memories', async () => {
  await audienceFixture();
  const g = await groupRead(ids.group), g2 = await groupRead(audience.g2);
  assert.equal(g.status,200,JSON.stringify(g));
  assert.ok(sees(g,'Tulipan') && sees(g,'Quokka'), 'G has U and V: both private facts are allowed (positive control)');
  assert.ok(!sees(g,'Marimba'), 'LEAK: G2 group memory reached group G');
  assert.ok(sees(g2,'Tulipan'), 'G2 has U: owner fact allowed (positive control)');
  assert.ok(sees(g2,'Marimba'), 'G2 recalls its own group memory (positive control)');
  assert.ok(!sees(g2,'Quokka'), 'LEAK: the shared-contact member’s private fact reached a group they are not in');
  assert.ok(!sees(g,'Zeppelin') && !sees(g2,'Zeppelin'), 'another contact’s memory never reaches a group');
  await drain();
});

test('isolation: a private chat only recalls group memories from groups its person is in', async () => {
  await audienceFixture();
  const owner = await privateRead(ids.contact, ids.owner, ids.contact), member = await privateRead(ids.shared, ids.member, ids.contact);
  assert.ok(sees(owner,'Marimba'), 'U is in G2 (positive control)');
  assert.ok(!sees(member,'Marimba'), 'LEAK: V is not in G2 but recalled its group memory through the shared contact');
  assert.ok(sees(member,'Tulipan'), 'shared-contact consent still lets V recall U’s private fact (positive control)');
  const outsider = await privateRead(ids.other, ids.outsider, ids.other);
  assert.ok(!sees(outsider,'Marimba') && !sees(outsider,'Tulipan'), 'another agent never sees X’s memories');
  await drain();
});

test('isolation: "Keep this chat private" keeps a person’s facts in their own chat only', async () => {
  await audienceFixture();
  await run('INSERT INTO group_private_sharing(group_id,agent_id,user_id,contact_id,created_at) VALUES(?,?,?,?,?)',ids.group,ids.contact,ids.owner,ids.contact,now);
  const response = await api(`contacts/${ids.contact}/privacy`, ids.owner, 'PUT', { keepPrivate: true });
  assert.equal(response.status,200,JSON.stringify(response.body));
  assert.equal(response.body.contact.keepPrivate,1);
  assert.equal(await count('group_private_sharing'),0,'a private chat drops its "Discuss my private chats" grants');
  assert.ok(sees(await privateRead(ids.contact, ids.owner, ids.contact),'Tulipan'), 'U still recalls it in their own chat');
  assert.ok(!sees(await privateRead(ids.shared, ids.member, ids.contact),'Tulipan'), 'LEAK: private fact reached the other participant');
  assert.ok(!sees(await groupRead(ids.group),'Tulipan') && !sees(await groupRead(audience.g2),'Tulipan'), 'LEAK: private fact reached a group');
  assert.ok(sees(await groupRead(ids.group),'Quokka'), 'V’s own choice is unaffected (positive control)');
  // V decides for V's chat only; the owner cannot change it through their own contact ID.
  assert.equal((await api(`contacts/${ids.shared}/privacy`, ids.owner, 'PUT', { keepPrivate: true })).status,404);
  assert.equal((await api(`contacts/${ids.contact}/privacy`, ids.owner, 'PUT', { keepPrivate: 'yes' })).status,400);
  await api(`contacts/${ids.contact}/privacy`, ids.owner, 'PUT', { keepPrivate: false });
  assert.ok(sees(await privateRead(ids.shared, ids.member, ids.contact),'Tulipan'), 'turning it off restores sharing on the next read');
  await drain();
});

test('isolation: "Contacts share with each other" pools only the person’s own facts across their own contacts', async () => {
  await audienceFixture();
  const before = await privateRead(audience.b, ids.owner, audience.b);
  assert.ok(!sees(before,'Tulipan') && before.links.length === 0, 'off by default: B knows nothing of X');
  const response = await api('me/privacy', ids.owner, 'PUT', { contactsShare: true });
  assert.equal(response.status,200,JSON.stringify(response.body));
  assert.equal(response.body.user.contactsShare,true);
  const b = await privateRead(audience.b, ids.owner, audience.b);
  assert.ok(sees(b,'Tulipan'), 'B recalls what U told X');
  assert.equal(b.human.find(m => /Tulipan/.test(m.content)).sourceContactName,'Fictional shared contact','pooled facts name the contact they were told to');
  assert.ok(!sees(b,'Quokka'), 'LEAK: another person’s fact pooled into U’s other contact');
  assert.deepEqual(b.links,[ids.contact],'every eligible contact counts as linked');
  assert.equal((await api(`contacts/${audience.b}/links`, ids.owner)).body.allContacts,true);
  assert.ok(!sees(await groupRead(ids.group),'Zeppelin'), 'LEAK: pooling reached a group');
  assert.ok(!sees(await privateRead(ids.shared, ids.member, ids.contact),'Zeppelin'), 'LEAK: pooling reached another person');
  // A private chat neither gives nor receives.
  await api(`contacts/${ids.contact}/privacy`, ids.owner, 'PUT', { keepPrivate: true });
  const privateX = await privateRead(audience.b, ids.owner, audience.b);
  assert.ok(!sees(privateX,'Tulipan') && privateX.links.length === 0, 'LEAK: a private chat was pooled or linked');
  assert.ok(!sees(await privateRead(ids.contact, ids.owner, ids.contact),'Zeppelin'), 'a private chat receives nothing either');
  // A connector-isolated contact never takes part.
  await api(`contacts/${ids.contact}/privacy`, ids.owner, 'PUT', { keepPrivate: false });
  await run('INSERT INTO mcp_private_contact(contact_id) VALUES(?)',ids.contact);
  assert.ok(!sees(await privateRead(audience.b, ids.owner, audience.b),'Tulipan'), 'LEAK: connector-isolated memory pooled');
  await api('me/privacy', ids.owner, 'PUT', { contactsShare: false });
  await drain();
});
