// Opt-in regression checks: node scripts/checks/personality.cjs
// Real personality code and migrations, fictional in-memory data, no network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../..');
const now = Date.UTC(2026, 9, 28, 18);

function source(file) {
  return stripTypeScriptTypes(fs.readFileSync(path.join(root, file), 'utf8'))
    .replace(/^import[\s\S]*?;[ \t]*\n/gm, '')
    .replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)/gm, '')
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
}
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of fs.readdirSync(path.join(root, 'apps/api/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    sqlite.exec(fs.readFileSync(path.join(root, 'apps/api/migrations', file), 'utf8'));
  }
  const DB = { prepare(sql) {
    return { args: [], bind(...args) { this.args = args; return this; },
      execute() {
        let next = 0;
        const values = [];
        const expanded = sql.replace(/\?(\d+)?/g, (_, id) => {
          values.push(this.args[id ? Number(id) - 1 : next++]); return '?';
        });
        return { stmt: sqlite.prepare(expanded), values };
      },
      async first() { const { stmt, values } = this.execute(); return stmt.get(...values) ?? null; },
      async all() { const { stmt, values } = this.execute(); return { results: stmt.all(...values) }; },
      async run() { const { stmt, values } = this.execute(); return { meta: { changes: stmt.run(...values).changes } }; },
    };
  } };
  const state = { calls: 0, answer: null };
  const context = vm.createContext({ console, Map, Set, JSON, Object, Array, Number, String, Boolean, Math, RegExp, Intl,
    Date: class extends Date { static now() { return now; } },
    isRecord: value => value !== null && typeof value === 'object' && !Array.isArray(value),
    clipText: (value, limit) => {
      const bytes = new TextEncoder(); let result = '';
      for (const char of value) { if (bytes.encode(result + char).length > limit) return result + '…'; result += char; }
      return result;
    },
    museCompletion: async (_env, _messages, _model, options) => {
      state.calls++;
      state.options = options;
      return { content: JSON.stringify(state.answer ?? { kind: 'neutral', topic: 'ordinary', engagement: 'self',
        confidence: 1, evidence: '', replyTargets: ['user:alice'] }) };
    },
  });
  for (const file of ['shared/personality.ts', ...['types', 'appraisal', 'relationships', 'director', 'calendar', 'receipts', 'profile', 'engine']
    .map(name => `apps/api/src/personality/${name}.ts`)]) vm.runInContext(source(file), context, { filename: file });
  sqlite.exec(`INSERT INTO user(id,name,email,created_at,updated_at) VALUES
    ('owner','Creator','creator@example.invalid',0,0), ('alice','Alice','alice@example.invalid',0,0), ('bob','Bob','bob@example.invalid',0,0);
    INSERT INTO contact_agent(id,owner_id,name,memory_shared) VALUES ('actor','owner','Demo Character',1), ('peer','owner','Other Character',1);
    INSERT INTO contact(id,user_id,name,created_at,updated_at,agent_id,contributor_consent) VALUES
    ('private-owner','owner','Demo Character',0,0,'actor',1), ('private-alice','alice','Demo Character',0,0,'actor',1),
    ('private-bob','bob','Demo Character',0,0,'actor',1);
    INSERT INTO chat_group(id,name,owner_id,created_at) VALUES ('group-a','Group A','owner',0), ('group-b','Group B','owner',0);`);
  for (const group of ['group-a', 'group-b']) {
    for (const user of ['owner', 'alice', 'bob']) sqlite.prepare(`INSERT INTO group_member(group_id,user_id,share_memory,contributor_consent,joined_at) VALUES (?,?,1,1,0)`).run(group,user);
    for (const agent of ['actor', 'peer']) sqlite.prepare('INSERT INTO group_agent(group_id,agent_id,added_by,joined_at) VALUES (?,?,\'owner\',0)').run(group,agent);
  }
  const profile = context.defaultPersonality();
  profile.enabled = true;
  profile.traits.sensitivity = 10; profile.traits.volatility = 10; profile.traits.resilience = 1;
  sqlite.prepare('INSERT INTO agent_personality(agent_id,profile_json,revision,updated_at) VALUES (?,?,1,0)').run('actor',JSON.stringify(profile));
  const people = [{id:'user:alice',name:'Alice'}, {id:'user:bob',name:'Bob'}];
  const scope = {agentID:'actor',groupID:'group-a',speakerID:'user:alice',processingUserID:'alice',model:'muse-spark-1.3'};
  const env = {DB,META_CHAT_MODEL:'muse-spark-1.3'};
  const appraisal = (kind, extra={}) => ({version:2,kind,topic:'ordinary',engagement:'self',confidence:1,
    replyTargets:[],disappointment:0,complete:true,...extra});
  const event = (speaker,kind,at=now-1000,extra={}) => ({speakerID:speaker,appraisal:JSON.stringify(appraisal(kind,extra)),createdAt:at});
  function privateEvent(id, user='alice', kind='conflict', at=now-1000, extra={}, contributor=0, status='complete') {
    sqlite.prepare(`INSERT INTO chat_turn(id,contact_id,user_id,user_text,assistant_text,status,workflow_id,created_at,updated_at)
      VALUES (?,?,?,'PRIVATE_CAUSE_CANARY','A fictional reply',?,?,?,?)`).run(id,`private-${user}`,user,status,id,at,at);
    sqlite.prepare(`INSERT INTO personality_event(agent_id,source_id,contact_id,private_turn_id,speaker_id,profile_revision,appraisal_json,created_at,contributor)
      VALUES ('actor',?,?,?,?,1,?,?,?)`).run(id,`private-${user}`,id,`user:${user}`,JSON.stringify(appraisal(kind,extra)),at,contributor);
  }
  function groupEvent(id, user='alice', group='group-b', kind='conflict', published=true) {
    sqlite.prepare(`INSERT INTO group_message(id,group_id,user_id,sender_name,text,created_at,contributor_consent,exchange_id,requester_id)
      VALUES (?,?,?,'Fictional member','GROUP_CAUSE_CANARY',?,1,?,?)`).run(`source-${id}`,group,user,now-1000,`source-${id}`,user);
    sqlite.prepare(`INSERT INTO group_reply(id,group_id,agent_id,source_id,status,workflow_id,created_at)
      VALUES (?,?,'actor',?,'complete',?,?)`).run(id,group,`source-${id}`,id,now-1000);
    if (published) sqlite.prepare(`INSERT INTO group_message(id,group_id,agent_id,sender_name,text,created_at,contributor_consent,exchange_id,requester_id)
      VALUES (?,?,'actor','Demo Character','A fictional reply',?,1,?,?)`).run(id,group,now-1000,`source-${id}`,user);
    sqlite.prepare(`INSERT INTO personality_event(agent_id,source_id,group_id,group_reply_id,speaker_id,profile_revision,appraisal_json,created_at,contributor)
      VALUES ('actor',?,?,?,?,1,?,?,0)`).run(id,group,id,`user:${user}`,JSON.stringify(appraisal(kind)),now-1000);
  }
  const history = (s=scope, isolated=false, local=[]) => context.relationshipObservations(DB,s,people,1,now,isolated,local);
  const plan = async (s=scope) => {
    const text = await context.personalityContext(env,s);
    assert.ok(!text.includes('PRIVATE_CAUSE_CANARY') && !text.includes('GROUP_CAUSE_CANARY'));
    const marker = 'Acting direction for this reply (names are quoted data): ';
    return JSON.parse(text.split(marker)[1].split('. Use each recipient')[0]);
  };
  return {sqlite,context,env,DB,state,profile,people,scope,event,appraisal,privateEvent,groupEvent,history,plan};
}

let checks=0;
async function check(name, run) {
  const f=fixture();
  try { await run(f); assert.equal(f.sqlite.prepare('PRAGMA foreign_key_check').all().length,0); checks++; console.log('PASS '+name); }
  finally { f.sqlite.close(); }
}

module.exports = { fixture };
if (require.main === module) (async()=>{
 await check('private relationship follows the same person into a group, without its cause', async f=>{
   f.privateEvent('private-source'); const plan=await f.plan();
   assert.equal(plan.recipients.find(p=>p.personID==='user:alice').stance,'brief-and-dry');
   assert.equal(plan.recipients.find(p=>p.personID==='user:bob').stance,'friendly');
   assert.equal(plan.defaultTone,'composed');
   const text=JSON.stringify(plan); assert.ok(!text.includes('private-source') && !text.includes('private-alice'));
   assert.ok(!/confidence|tension|trust|sourceID|createdAt|disappointment/.test(text));
 });
 await check('group relationship follows a person into private chat and a different group',async f=>{
   f.groupEvent('group-source');
   const personal=await f.plan({agentID:'actor',contactID:'private-alice',speakerID:'user:alice',processingUserID:'alice',model:'muse-spark-1.3'});
   assert.equal(personal.recipients[0].stance,'brief-and-dry');
   assert.equal((await f.plan()).recipients.find(p=>p.personID==='user:alice').stance,'brief-and-dry');
 });
 await check('source deletion removes relationship influence immediately',async f=>{
   f.privateEvent('private-source'); f.sqlite.prepare('DELETE FROM contact WHERE id=?').run('private-alice');
   assert.equal((await f.plan()).recipients.find(p=>p.personID==='user:alice').stance,'friendly');
 });
 await check('source group membership revocation removes influence',async f=>{
   f.groupEvent('group-source'); f.sqlite.prepare('DELETE FROM group_member WHERE group_id=? AND user_id=?').run('group-b','alice');
   assert.equal((await f.history()).length,0);
 });
 await check('source connector isolation excludes old events and blocks future import',async f=>{
   f.privateEvent('private-source'); f.sqlite.prepare('INSERT INTO mcp_private_contact(contact_id) VALUES (?)').run('private-alice');
   assert.equal((await f.history()).length,0);
   const personal=await f.plan({agentID:'actor',contactID:'private-alice',speakerID:'user:alice',processingUserID:'alice',model:'muse-spark-1.3'});
   assert.equal(personal.recipients[0].stance,'brief-and-dry');
 });
 await check('connector destination stays isolated from other relationships',async f=>{
   f.privateEvent('private-source'); f.sqlite.prepare('INSERT INTO mcp_private_group(group_id) VALUES (?)').run('group-a');
   assert.equal((await f.plan()).recipients.find(p=>p.personID==='user:alice').stance,'friendly');
 });
 await check('a connector destination rejects a stale Contributor selection before inference',async f=>{
   f.sqlite.prepare('INSERT INTO mcp_private_group(group_id) VALUES (?)').run('group-a');
   await assert.rejects(()=>f.context.personalityContext(f.env,{...f.scope,model:'muse-spark-1.3-contributor'}),/GROUP_CONTEXT_CHANGED/);
   assert.equal(f.state.calls,0);
 });
 await check('Contributor observations never enter Standard direction',async f=>{
   f.privateEvent('private-source','alice','conflict',now-1000,{},1);
   assert.equal((await f.history()).length,0);
   assert.equal((await f.history({...f.scope,model:'muse-spark-1.3-contributor'})).length,1);
   f.sqlite.prepare('UPDATE contact SET contributor_consent=0 WHERE id=?').run('private-alice');
   assert.equal((await f.history({...f.scope,model:'muse-spark-1.3-contributor'})).length,0);
 });
 await check('pending, failed, skipped and legacy observations cannot create cross-chat feelings',async f=>{
   f.privateEvent('pending','alice','conflict',now-1000,{},0,'running');
   f.privateEvent('failed','bob','conflict',now-1000,{},0,'failed');
   f.groupEvent('skipped','alice','group-b','conflict',false);
   f.privateEvent('legacy','alice','conflict',now-1000,{version:1});
   assert.equal((await f.history()).length,0);
 });
 await check('repair is chronological and applies only to its speaker',async f=>{
   const rows=[f.event('user:alice','repair',now-3000),f.event('user:alice','conflict',now-2000),f.event('user:bob','repair',now-1000)];
   const before=f.context.relationshipStates(f.profile,f.people,rows,now);
   assert.ok(before.get('user:alice').tension>0.6);
   rows.push(f.event('user:alice','repair',now));
   assert.ok(f.context.relationshipStates(f.profile,f.people,rows,now).get('user:alice').tension<0.16);
 });
 await check('unrelated group conflict cannot produce distrust',async f=>{
   const states=f.context.relationshipStates(f.profile,f.people,[f.event('user:alice','conflict',now,{engagement:'other'})],now);
   assert.equal(states.get('user:alice').tension,0); assert.equal(states.get('user:alice').trust,0);
 });
 await check('care and practical focus override grievance and sarcasm for every recipient',async f=>{
   const states=f.context.relationshipStates(f.profile,f.people,[f.event('user:alice','conflict')],now);
   for(const topic of ['serious','practical']) {
     const plan=f.context.directPerformance(f.profile,f.people,states,f.appraisal('neutral',{topic}),'user:alice',[],true,now);
     assert.ok(plan.recipients.every(p=>p.humor==='none' && p.emphasis==='restrained'));
     assert.ok(plan.recipients.every(p=>!['brief-and-dry','reserved'].includes(p.stance)));
   }
 });
 await check('time decay softens tension without creating facts about motives',async f=>{
   const rows=[f.event('user:alice','conflict')];
   const before=f.context.relationshipStates(f.profile,f.people,rows,now).get('user:alice').tension;
   const after=f.context.relationshipStates(f.profile,f.people,rows,now+12*3600000).get('user:alice').tension;
   assert.ok(after<before/4);
   assert.equal(f.context.seenGapReaction(f.profile,{repliedAt:now-7200000,readAt:null},now),0);
 });
 await check('actual seen gap follows only the relevant person, and disappears when answered',async f=>{
   f.privateEvent('private-source','alice','neutral',now-7200000);
   const sequence=f.sqlite.prepare('SELECT sequence FROM chat_turn WHERE id=?').get('private-source').sequence;
   f.sqlite.prepare('UPDATE contact SET last_read_sequence=?, last_reply_read_at=? WHERE id=?').run(sequence,now-7200000,'private-alice');
   const plan=await f.plan();
   assert.equal(plan.recipients.find(p=>p.personID==='user:alice').stance,'reserved');
   assert.equal(plan.recipients.find(p=>p.personID==='user:bob').stance,'friendly');
   f.sqlite.prepare(`INSERT INTO chat_turn(id,contact_id,user_id,user_text,status,workflow_id,created_at,updated_at)
     VALUES ('answer','private-alice','alice','An answer','queued','answer',?,?)`).run(now,now);
   assert.equal((await f.plan()).recipients.find(p=>p.personID==='user:alice').stance,'friendly');
 });
 await check('classification rejects invented recipients and another person’s apology',async f=>{
   f.state.answer={kind:'repair',topic:'ordinary',engagement:'other',confidence:1,evidence:'sorry',replyTargets:['user:alice']};
   const scope={...f.scope,text:'sorry',sourceID:'unpersisted'};
   assert.equal((await f.context.appraise(f.env,scope,false,f.people)).kind,'neutral');
   f.state.answer.replyTargets=['user:unknown'];
   assert.equal((await f.context.appraise(f.env,scope,false,f.people)).confidence,0);
 });
 await check('retries reuse one appraisal and do not publish pending feelings',async f=>{
   f.sqlite.prepare(`INSERT INTO chat_turn(id,contact_id,user_id,user_text,status,workflow_id,created_at,updated_at)
     VALUES ('active','private-alice','alice','You are rude','running','active',?,?)`).run(now,now);
   f.sqlite.prepare(`INSERT INTO agent_attention(agent_id,turn_id,attempt,workflow_id,acquired_at) VALUES ('actor','active',1,'active',?)`).run(now);
   f.state.answer={kind:'conflict',topic:'ordinary',engagement:'self',confidence:1,evidence:'You are rude',replyTargets:['user:alice']};
   const scope={agentID:'actor',contactID:'private-alice',speakerID:'user:alice',processingUserID:'alice',sourceID:'active',attempt:1,text:'You are rude'};
   await f.context.personalityContext(f.env,scope); await f.context.personalityContext(f.env,scope);
   assert.equal(f.state.calls,1); assert.equal((await f.history()).length,0);
   // The provider shares this budget between reasoning and visible JSON.
   assert.ok(f.state.options.maxTokens >= 2048);
   assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM personality_event').get().n,1);
   f.sqlite.prepare(`UPDATE chat_turn SET status='complete',assistant_text='A response' WHERE id='active'`).run();
   assert.equal((await f.history()).length,1);
 });
 await check('a profile edit clears feelings and rejects an old-revision appraisal',async f=>{
   f.privateEvent('private-source');
   f.sqlite.prepare(`INSERT INTO chat_turn(id,contact_id,user_id,user_text,status,workflow_id,created_at,updated_at)
     VALUES ('active','private-alice','alice','Hello','running','active',?,?)`).run(now,now);
   f.sqlite.prepare(`INSERT INTO agent_attention(agent_id,turn_id,attempt,workflow_id,acquired_at) VALUES ('actor','active',1,'active',?)`).run(now);
   f.sqlite.prepare('UPDATE agent_personality SET revision=2 WHERE agent_id=?').run('actor');
   assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM personality_event').get().n,0);
   await f.context.storeAppraisal(f.DB,{...f.scope,groupID:undefined,contactID:'private-alice',sourceID:'active',attempt:1},1,f.appraisal('conflict'),now);
   assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM personality_event').get().n,0);
 });
 await check('a Standard retry replaces a pending Contributor appraisal instead of reusing it',async f=>{
   f.privateEvent('active','alice','conflict',now-1000,{},1,'running');
   f.sqlite.prepare(`INSERT INTO agent_attention(agent_id,turn_id,attempt,workflow_id,acquired_at) VALUES ('actor','active',1,'active',?)`).run(now);
   const scope={agentID:'actor',contactID:'private-alice',speakerID:'user:alice',processingUserID:'alice',sourceID:'active',attempt:1,text:'Hello'};
   await f.context.personalityContext(f.env,scope);
   assert.equal(f.state.calls,1);
   const row=f.sqlite.prepare('SELECT contributor,appraisal_json FROM personality_event WHERE source_id=?').get('active');
   assert.equal(row.contributor,0); assert.equal(JSON.parse(row.appraisal_json).kind,'neutral');
 });
 await check('withdrawing source-group Contributor consent removes its influence',async f=>{
   f.groupEvent('group-source'); f.sqlite.prepare('UPDATE personality_event SET contributor=1 WHERE source_id=?').run('group-source');
   const scope={...f.scope,model:'muse-spark-1.3-contributor'};
   assert.equal((await f.history(scope)).length,1);
   f.sqlite.prepare('UPDATE group_member SET contributor_consent=0 WHERE group_id=? AND user_id=?').run('group-b','bob');
   assert.equal((await f.history(scope)).length,0);
 });
 await check('a group-wide apology cannot repair an individual relationship',async f=>{
   const state=f.context.relationshipStates(f.profile,f.people,[f.event('user:alice','conflict',now-1000),
     f.event('user:alice','repair',now,{engagement:'group'})],now).get('user:alice');
   assert.ok(state.tension>0.6);
 });
 await check('equal names and forged speaker IDs do not merge relationships',async f=>{
   f.sqlite.prepare('UPDATE user SET name=? WHERE id=?').run('Alice','bob');
   f.privateEvent('private-source');
   const plan=await f.plan();
   assert.equal(plan.recipients.find(p=>p.personID==='user:bob').stance,'friendly');
   f.sqlite.prepare(`INSERT INTO chat_turn(id,contact_id,user_id,user_text,status,workflow_id,created_at,updated_at)
     VALUES ('active','private-alice','alice','Hello','running','active',?,?)`).run(now,now);
   f.sqlite.prepare(`INSERT INTO agent_attention(agent_id,turn_id,attempt,workflow_id,acquired_at) VALUES ('actor','active',1,'active',?)`).run(now);
   await f.context.storeAppraisal(f.DB,{...f.scope,groupID:undefined,contactID:'private-alice',speakerID:'user:bob',sourceID:'active',attempt:1},1,f.appraisal('conflict'),now);
   assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM personality_event WHERE source_id=?').get('active').n,0);
 });
 await check('birthday continuity uses the same person and requires complete evidence',async f=>{
   f.profile.birthDate='2000-10-27'; f.profile.timeZone='UTC';
   const at=now-86400000;
   f.privateEvent('birthday-day','alice','neutral',at);
   const scope={agentID:'actor',contactID:'private-alice',speakerID:'user:alice',processingUserID:'alice',sourceID:'next'};
   const local=[{...f.event('user:alice','neutral',at),sourceID:'birthday-day'}];
   const current=f.appraisal('neutral');
   const reaction=await f.context.birthdayReaction(f.DB,scope,f.profile,local,local,current,now);
   assert.ok(reaction>0.16 && reaction<=0.25,'the first next-day reaction must not decay during the birthday itself');
   assert.equal(await f.context.birthdayReaction(f.DB,scope,f.profile,local,[...local,f.event('user:alice','birthday',at)],current,now),0);
   assert.ok(await f.context.birthdayReaction(f.DB,scope,f.profile,local,[...local,f.event('user:bob','birthday',at)],current,now)>0);
   local[0].appraisal=JSON.stringify(f.appraisal('neutral',{complete:false}));
   assert.equal(await f.context.birthdayReaction(f.DB,scope,f.profile,local,local,current,now),0);
 });
 await check('birthday day boundaries handle 23-hour and 25-hour civil days',async f=>{
   const start=date=>f.context.startOfCivilDay(date,'America/New_York');
   assert.equal(start('2026-03-08'),Date.UTC(2026,2,8,5));
   assert.equal(start('2026-03-09')-start('2026-03-08'),23*3600000);
   assert.equal(start('2026-11-02')-start('2026-11-01'),25*3600000);
 });
 await check('a selected recipient gets their own style and nobody is added by a mentioned name',async f=>{
   const states=f.context.relationshipStates(f.profile,f.people,[f.event('user:alice','conflict')],now);
   const plan=f.context.directPerformance(f.profile,f.people,states,f.appraisal('neutral',{replyTargets:['user:bob','user:unknown']}),'user:alice',[],true,now);
   assert.deepEqual(Array.from(plan.primaryRecipients),['user:bob']);
   assert.equal(plan.recipients.find(p=>p.personID==='user:alice').stance,'brief-and-dry');
   assert.equal(plan.recipients.find(p=>p.personID==='user:bob').stance,'friendly');
 });
 await check('cadence and emphasis resolve high energy against each recipient’s relationship',async f=>{
   f.profile.traits.energy=10; f.profile.traits.expressiveness=10;
   const states=f.context.relationshipStates(f.profile,f.people,[f.event('user:alice','conflict'),f.event('user:bob','affection')],now);
   const plan=f.context.directPerformance(f.profile,f.people,states,f.appraisal('neutral',{replyTargets:['user:alice']}),'user:alice',[],true,now);
   assert.equal(plan.cadence,'unhurried');
   assert.equal(plan.recipients.find(p=>p.personID==='user:alice').cadence,'unhurried');
   assert.equal(plan.recipients.find(p=>p.personID==='user:alice').emphasis,'restrained');
   assert.equal(plan.recipients.find(p=>p.personID==='user:bob').cadence,'animated');
   const mixed=f.context.directPerformance(f.profile,f.people,states,f.appraisal('neutral',{replyTargets:['user:alice','user:bob']}),'user:alice',[],true,now);
   assert.equal(mixed.cadence,'natural');
 });
 await check('the renderer cannot leak accidentally added private fields',async f=>{
   const plan=f.context.directPerformance(f.profile,f.people,new Map(),f.appraisal('neutral'),'user:alice',[],true,now);
   plan.privateCause='PRIVATE_CAUSE_CANARY'; plan.sourceID='SECRET_SOURCE';
   plan.recipients[0].sourceID='SECRET_RECIPIENT_SOURCE';
   const text=f.context.renderActingPlan(plan);
   assert.ok(!text.includes('PRIVATE_CAUSE_CANARY')&&!text.includes('SECRET_SOURCE')&&!text.includes('SECRET_RECIPIENT_SOURCE'));
 });
 await check('bounded projection keeps each person’s window instead of starving quieter members',async f=>{
   f.privateEvent('bob-warmth','bob','affection',now-80000);
   for(let i=0;i<70;i++) f.privateEvent('alice-'+String(i).padStart(2,'0'),'alice',i===0?'conflict':'neutral',now-70000+i*1000);
   f.privateEvent('future','alice','conflict',now+1000);
   const rows=await f.history();
   assert.equal(rows.filter(r=>r.speakerID==='user:alice').length,64);
   assert.equal(rows.filter(r=>r.speakerID==='user:bob').length,1);
   assert.ok(!rows.some(r=>r.createdAt>now));
   const states=f.context.relationshipStates(f.profile,f.people,rows,now);
   assert.equal(states.get('user:alice').tension,0);
   assert.ok(states.get('user:bob').warmth>0.3);
 });
 await check('a bot relationship follows its stable ID and respects source-group removal',async f=>{
   f.sqlite.prepare(`INSERT INTO group_message(id,group_id,agent_id,sender_name,text,created_at,contributor_consent,exchange_id,requester_id)
     VALUES ('bot-source','group-b','peer','Other Character','GROUP_CAUSE_CANARY',?,1,'bot-source','alice')`).run(now-1000);
   const reply=f.sqlite.prepare(`UPDATE group_reply SET status='complete'
     WHERE source_id='bot-source' AND agent_id='actor' RETURNING id`).get();
   assert.ok(reply,'the real continuation trigger must provide the reply slot');
   f.sqlite.prepare(`INSERT INTO group_message(id,group_id,agent_id,sender_name,text,created_at,contributor_consent,exchange_id,requester_id)
     VALUES (?,'group-b','actor','Demo Character','A reply',?,1,'bot-source','alice')`).run(reply.id,now-1000);
   f.sqlite.prepare(`INSERT INTO personality_event(agent_id,source_id,group_id,group_reply_id,speaker_id,profile_revision,appraisal_json,created_at,contributor)
     VALUES ('actor',?,'group-b',?,'agent:peer',1,?,?,0)`).run(reply.id,reply.id,JSON.stringify(f.appraisal('conflict')),now-1000);
   assert.equal((await f.plan()).recipients.find(p=>p.personID==='agent:peer').stance,'brief-and-dry');
   f.sqlite.prepare('DELETE FROM group_agent WHERE group_id=? AND agent_id=?').run('group-b','peer');
   assert.equal((await f.plan()).recipients.find(p=>p.personID==='agent:peer').stance,'friendly');
 });
 console.log(`Passed ${checks} personality regression scenarios.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
