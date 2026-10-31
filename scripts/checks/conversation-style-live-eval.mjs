// Opt-in live Meta evaluation with fictional cases supplied outside the repository.
// No production database, application account, external tool action or speech synthesis.
import { build } from 'esbuild';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name, fallback) => { const at = process.argv.indexOf(`--${name}`); return at < 0 ? fallback : process.argv[at + 1]; };
const casesPath = arg('cases');
if (!casesPath) throw Error('Provide fictional dialogue cases with --cases.');
const cases = JSON.parse(readFileSync(resolve(casesPath), 'utf8'));
const output = resolve(arg('out', '/private/tmp/wildcard-conversation-style-eval'));
const selected = new RegExp(arg('only', '.'));
const sourceRef = arg('source-ref', 'working-tree');
const repetitions = Number(arg('repetitions', '1'));
const callLimit = Number(arg('call-limit', '200'));
// --model muse-spark-1.3-contributor runs the same evaluation at Contributor rates.
const evalModel = arg('model', 'muse-spark-1.3');
if (!['muse-spark-1.3', 'muse-spark-1.3-contributor'].includes(evalModel)) throw Error('Unsupported model.');
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 3 || !Number.isInteger(callLimit) || callLimit < 1 || callLimit > 400) throw Error('Invalid evaluation bounds.');
if (!Array.isArray(cases.agents) || cases.agents.length > 5 || !Array.isArray(cases.scenarios)) throw Error('Invalid fictional case format.');
mkdirSync(output, { recursive: true, mode: 0o700 });
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const source = { casesSHA256: createHash('sha256').update(readFileSync(resolve(casesPath))).digest('hex'), sourceRef, sourceCommit: git('rev-parse', sourceRef === 'working-tree' ? 'HEAD' : sourceRef),
  trackedDiffSHA256: createHash('sha256').update(git('diff', 'HEAD')).digest('hex') };
function apiKey() {
  if (process.env.META_API_KEY?.trim()) return process.env.META_API_KEY.trim();
  const file = join(root, 'apps/api/.dev.vars');
  const line = existsSync(file) ? readFileSync(file, 'utf8').split('\n').find(value => value.startsWith('META_API_KEY=')) : null;
  const value = line?.slice('META_API_KEY='.length).trim().replace(/^"(.*)"$/, '$1');
  if (!value) throw Error('Configure META_API_KEY without putting it in source or arguments.');
  return value;
}
const key = apiKey();
const bundle = join(output, 'runtime.mjs');
await build({
  stdin: { contents: `import './apps/api/src/lib/schema-runtime';
    export { museCompletion } from './apps/api/src/chat/meta';
    export { contactReply } from './apps/api/src/chat/context';
    export { activeTurn } from './apps/api/src/chat/data';
    export { voiceSuitable } from './apps/api/src/voice/speech';
    export { prepareGroupInput } from './apps/api/src/groups/context';
    export { completeGroupDraft } from './apps/api/src/groups/completion';
    export { publishGroupDraft, publishGroupMessages } from './apps/api/src/groups/workflow';`, resolveDir: root, loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'error',
  banner: { js: "import { createRequire as __evalRequire } from 'node:module'; const require = __evalRequire(import.meta.url);" },
  plugins: [{ name: 'isolated-evaluation-runtime', setup(builder) {
    builder.onResolve({ filter: /^cloudflare:/ }, value => ({ path: value.path, namespace: 'runtime' }));
    builder.onLoad({ filter: /.*/, namespace: 'runtime' }, () => ({ contents: 'export class NonRetryableError extends Error {} export class WorkflowEntrypoint {} export class WorkerEntrypoint {}', loader: 'js' }));
    builder.onLoad({ filter: /[/\\](apps[/\\]api[/\\]src|shared)[/\\].*\.ts$/ }, value => {
      const relative = value.path.slice(root.length + 1);
      const contents = sourceRef === 'working-tree' ? readFileSync(value.path, 'utf8') : execFileSync('git', ['show', `${source.sourceCommit}:${relative}`], { cwd: root, encoding: 'utf8' });
      return { contents: contents + (relative === 'apps/api/src/groups/workflow.ts' ? '\nexport { publishGroupDraft, publishGroupMessages };' : ''), loader: 'ts' };
    });
  } }],
});
const h = await import(pathToFileURL(bundle).href);
const { fixture } = createRequire(import.meta.url)('./personality.cjs');
const storage = new AsyncLocalStorage();
const nativeFetch = globalThis.fetch;
const report = { ...source, model: evalModel, startedAt: new Date().toISOString(), calls: [], scenarios: [], errors: [] };
const save = () => writeFileSync(join(output, 'results.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.origin !== 'https://api.meta.ai' || url.pathname !== '/v1/chat/completions' || options?.method !== 'POST') throw Error('EVAL_EXTERNAL_NETWORK_BLOCKED');
  if (report.calls.length >= callLimit) throw Error('EVAL_CALL_BUDGET_EXCEEDED');
  const request = JSON.parse(options.body);
  const context = storage.getStore();
  const record = { ...context, model: request.model, messages: request.messages, maxTokens: request.max_completion_tokens, startedAt: new Date().toISOString() };
  report.calls.push(record);
  try {
    const result = await nativeFetch(input, options);
    const data = await result.clone().json().catch(() => null);
    record.status = result.status; record.usage = data?.usage; record.finishReason = data?.choices?.[0]?.finish_reason;
    record.content = data?.choices?.[0]?.message?.content;
    record.toolNames = data?.choices?.[0]?.message?.tool_calls?.map(call => call.function?.name);
    return result;
  } catch (error) { record.error = error.name; throw error; }
  finally { save(); }
};
const stage = (scenario, name, task) => storage.run({ scenario, stage: name }, task);
function database(f) {
  return { ...f.DB, async batch(statements) {
    f.sqlite.exec('BEGIN');
    try {
      const result = statements.map(statement => { const { stmt, values } = statement.execute();
        return stmt.columns().length ? { results: stmt.all(...values), meta: { changes: 0 } }
          : { results: [], meta: { changes: Number(stmt.run(...values).changes) } }; });
      f.sqlite.exec('COMMIT'); return result;
    } catch (error) { if (f.sqlite.isTransaction) f.sqlite.exec('ROLLBACK'); throw error; }
  } };
}
function setup(scenario) {
  const f = fixture();
  f.sqlite.exec(`DELETE FROM chat_group WHERE id='group-b'; DELETE FROM group_agent; UPDATE user SET chat_model='${evalModel}'; UPDATE group_member SET learning_enabled=0;`);
  for (const [id, name] of Object.entries(cases.humans)) f.sqlite.prepare('UPDATE user SET name=? WHERE id=?').run(name, id);
  const agents = cases.agents.filter(agent => (scenario.agents ?? cases.agents.map(a => a.id)).includes(agent.id));
  for (const a of agents) {
    f.sqlite.prepare(`INSERT INTO contact_agent(id,owner_id,name,memory_shared,speech_accent) VALUES (?,'owner',?,1,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,speech_accent=excluded.speech_accent`).run(a.id, a.name, Object.hasOwn(scenario,'accent') ? scenario.accent : a.accent ?? null);
    const p = f.context.defaultPersonality(); p.enabled = scenario.personality !== false;
    p.description = scenario.description ?? a.description; p.specialties = a.specialties ?? ''; p.birthDate = '1996-04-12';
    Object.assign(p.traits, a.traits);
    f.sqlite.prepare(`INSERT INTO agent_personality(agent_id,profile_json,revision,updated_at) VALUES (?,?,1,0)
      ON CONFLICT(agent_id) DO UPDATE SET profile_json=excluded.profile_json`).run(a.id, JSON.stringify(p));
    for (const userID of Object.keys(cases.humans)) {
      if (!f.sqlite.prepare('SELECT id FROM contact WHERE agent_id=? AND user_id=?').get(a.id,userID)) {
        f.sqlite.prepare('INSERT INTO contact(id,user_id,agent_id,name,created_at,updated_at,contributor_consent,learning_enabled) VALUES (?,?,?,?,0,0,1,0)')
          .run(`contact-${a.id}-${userID}`, userID,a.id,a.name);
      }
    }
    f.sqlite.prepare('INSERT INTO group_agent(group_id,agent_id,added_by,joined_at) VALUES (?,?,?,0)').run('group-a',a.id,'owner');
  }
  f.sqlite.exec('UPDATE contact SET learning_enabled=0');
  if (scenario.generationCountry) for (const a of agents) {
    const creator=f.sqlite.prepare("SELECT id FROM contact WHERE agent_id=? AND user_id='owner'").get(a.id);
    f.sqlite.prepare("INSERT INTO contact_generation(id,user_id,input_json,status,contact_id,updated_at) VALUES (?,'owner',?,'complete',?,0)")
      .run(`generated-${a.id}`,JSON.stringify({country:scenario.generationCountry,language:'es',privateField:'UNSHARED_GENERATION_CANARY'}),creator.id);
  }
  if (scenario.voice) {
    f.sqlite.exec("INSERT INTO app_setting(key,value,updated_at) VALUES ('voice_messages_enabled','true',0); UPDATE contact SET voice_messages_enabled=1;");
  }
  const DB = database(f);
  const env = { DB, META_API_KEY:key, META_CHAT_MODEL:evalModel, AI_GATEWAY_ID:'', WEB_RESEARCH_ENABLED:'false',
    CHAT_WORKFLOW:{create:async()=>{throw Error('EVAL_UNEXPECTED_WORKFLOW');}},
    ...(scenario.voice ? { ELEVENLABS_API_KEY: 'fictional-key-never-used-for-synthesis' } : {}) };
  return { ...f, DB, env, agents };
}
function claim(f, agentID, id) {
  f.sqlite.exec('DELETE FROM agent_attention');
  f.sqlite.prepare('INSERT INTO agent_attention(agent_id,turn_id,attempt,workflow_id,acquired_at) VALUES (?,?,1,?,?)').run(agentID,id,id,Date.now());
}
function step() {
  const checkpoints = new Map();
  return { async do(name,...args) { if (checkpoints.has(name)) return structuredClone(checkpoints.get(name));
    const result=await args.at(-1)(); checkpoints.set(name,structuredClone(result)); return result; }, async sleep() {} };
}
function groupMessage(f, scenario, message, id, exchangeID=id) {
  const agent = f.agents.find(a=>a.id===message.agentID);
  const userID = message.agentID ? null : message.userID ?? 'alice';
  const name = agent?.name ?? cases.humans[userID];
  f.sqlite.prepare(`INSERT INTO group_message(id,group_id,user_id,agent_id,sender_name,text,created_at,contributor_consent,exchange_id,requester_id,reply_to_id)
    VALUES (?,'group-a',?,?,?,?,?,1,?,'alice',?)`).run(id,userID,message.agentID??null,name,message.text,Date.now(),exchangeID,message.replyToID??null);
}
async function privateTurn(f, record, input, i) {
  const agentID = input.agentID ?? f.agents[0].id, userID = input.userID ?? 'alice';
  const contactID=f.sqlite.prepare('SELECT id FROM contact WHERE agent_id=? AND user_id=?').get(agentID,userID).id;
  for (const [historyIndex, prior] of (input.history ?? []).entries()) f.sqlite.prepare(`INSERT INTO chat_turn(id,contact_id,user_id,user_text,assistant_text,status,workflow_id,created_at,updated_at)
    VALUES (?,?,?,?,?,'complete',?,?,?)`).run(`history-${i}-${historyIndex}`,contactID,userID,prior.user,prior.assistant,`history-${i}`,Date.now()-60000,Date.now()-60000);
  const id = `${record.id}-private-${i}`;
  f.sqlite.prepare(`INSERT INTO chat_turn(id,contact_id,user_id,user_text,status,workflow_id,created_at,updated_at,time_zone)
    VALUES (?,?,?,?,'running',?,?,?,'America/Argentina/Buenos_Aires')`).run(id,contactID,userID,input.text,id,Date.now(),Date.now());
  claim(f,agentID,id);
  const turn=await h.activeTurn(f.DB,{turnID:id,attempt:1});
  const response=await stage(record.id,`private-${i}`,()=>h.contactReply(f.env,turn,f.agents.find(a=>a.id===agentID).name));
  const messages=response?.messages??[];
  f.sqlite.prepare("UPDATE chat_turn SET assistant_text=?,assistant_messages_json=?,status='complete',updated_at=? WHERE id=?")
    .run(messages.join('\n\n'),JSON.stringify(messages.map((text,part)=>({id:`${id}/${part}`,text,createdAt:Date.now()}))),Date.now(),id);
  record.turns.push({kind:'private',agentID,input:input.text,messages,voiceEligible:messages.length===1&&h.voiceSuitable(messages[0])}); save();
  console.log(JSON.stringify({scenario:record.id,kind:'private',agentID,messages}));
}
async function groupRound(f, record, input, i) {
  const sourceID=`${record.id}-source-${i}`;
  groupMessage(f,record,input,sourceID);
  for(const [at, message] of (input.visibleReplies??[]).entries())groupMessage(f,record,message,`${record.id}-interleaved-${i}-${at}`,sourceID);
  const participants=input.responders??f.agents.map(a=>a.id);
  for (const agentID of participants) {
    const id=`${record.id}-reply-${i}-${agentID}`;
    f.sqlite.prepare(`INSERT INTO group_reply(id,group_id,agent_id,source_id,workflow_id,created_at)
      VALUES (?,'group-a',?,?,?,?) ON CONFLICT(source_id,agent_id) DO NOTHING`).run(id,agentID,sourceID,id,Date.now());
    const actual=f.sqlite.prepare('SELECT id FROM group_reply WHERE source_id=? AND agent_id=?').get(sourceID,agentID).id;
    claim(f,agentID,actual);
    f.sqlite.prepare("UPDATE group_reply SET status='running' WHERE id=?").run(actual);
    const job={kind:'group',turnID:actual,attempt:1};
    const prepared=await stage(record.id,`${agentID}:prepare`,()=>h.prepareGroupInput(f.env,job));
    const workflow=step();
    const draft=prepared.draft??await stage(record.id,`${agentID}:complete`,()=>h.completeGroupDraft(f.env,prepared.input,workflow,`reply-${i}-${agentID}`));
    const single=(draft.messages?.length??1)<=1;
    const published=await h.publishGroupDraft(f.env,job,draft,single);
    if(published==='published'&&!single){await h.publishGroupMessages(f.env,job,workflow,draft.messages,draft.invitesReply,draft.learningFence,draft.learningQuestion);f.sqlite.prepare("UPDATE group_reply SET status='complete' WHERE id=?").run(actual);}
    const lastCall=report.calls.filter(call=>call.scenario===record.id&&call.stage===`${agentID}:complete`).at(-1);
    let delivery=null; try { delivery=JSON.parse(lastCall?.content??'null')?.delivery??null; } catch {}
    record.turns.push({kind:'group',agentID,delivery,audienceHint:prepared.input?.deliveryAudience??null,input:input.text,messages:draft.messages??(draft.text?[draft.text]:[]),published,replyToID:draft.replyToID??null});
    f.sqlite.exec('DELETE FROM agent_attention'); save();
    console.log(JSON.stringify({scenario:record.id,kind:'group',agentID,messages:record.turns.at(-1).messages,published}));
  }
}
async function evaluate(scenario,repetition){
  const record={id:`${scenario.id}-${repetition}`,rubric:scenario.rubric,turns:[],error:null}; report.scenarios.push(record);
  const f=setup(scenario);
  try{
    for(const [i,message] of (scenario.history??[]).entries())groupMessage(f,record,message,`${record.id}-history-${i}`);
    for(const [i,input] of scenario.inputs.entries()){
      if(scenario.kind==='private')await privateTurn(f,record,input,i);
      else await groupRound(f,record,input,i);
    }
  }catch(error){record.error=String(error.message).replaceAll(key,'[redacted]').slice(0,300);report.errors.push({scenario:record.id,error:record.error});console.log(JSON.stringify({scenario:record.id,error:record.error}));}
  finally{record.artifacts=f.sqlite.prepare("SELECT id,title FROM mini_app WHERE group_id='group-a' ORDER BY created_at,id").all();f.sqlite.close();save();}
}
const work=[];
for(let repetition=1;repetition<=repetitions;repetition++)for(const scenario of cases.scenarios.filter(s=>selected.test(s.id)))work.push([scenario,repetition]);
for(let at=0;at<work.length;at+=2)await Promise.all(work.slice(at,at+2).map(([scenario,repetition])=>evaluate(scenario,repetition)));
report.finishedAt=new Date().toISOString();save();
console.log(JSON.stringify({providerCalls:report.calls.length,completed:report.scenarios.filter(s=>!s.error).length,scenarios:report.scenarios.length,report:join(output,'results.json')}));
if(report.errors.length)process.exitCode=1;
