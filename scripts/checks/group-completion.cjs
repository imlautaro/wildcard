// Opt-in isolated regressions: node scripts/checks/group-completion.cjs
// Fictional data, real migrated in-memory SQLite, simulated models/MCP, no network.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { fixture, source } = require('./group-publication.cjs');
const call = (name, args = {}, id = name) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const answer = (...tool_calls) => ({ role: 'assistant', content: null, tool_calls });
const finish = (responseRequired = false) => answer(call('finish_group_research', {responseRequired}));
const decision = (action, messages) => JSON.stringify({ action, messages, replyToID: null, invitesReply: false, includeImage: false, learningQuestion: null,
  delivery: { audience: ['keep','skip'].includes(action) ? 'none' : 'group', recipientIDs: [], nameUse: 'omit', depth: 'brief', followUp: 'none' } });
const final = (text = 'Fictional total: 42.') => ({ role: 'assistant', content: decision('reply', [text]) });
let checks = 0;
async function check(name, run) {
  const f = fixture();
  try {
    f.env.META_CHAT_MODEL = 'muse-spark-1.3';
    f.sqlite.exec(`INSERT INTO group_message(id,group_id,user_id,sender_name,text,created_at,contributor_consent)
      VALUES ('source','group','human','Demo Human','Analyze fictional data',0,1);
      INSERT INTO group_reply(id,group_id,agent_id,source_id,status,workflow_id,created_at)
      VALUES ('reply','group','sender','source','running','workflow',0);
      INSERT INTO agent_attention(agent_id,turn_id,attempt,workflow_id,acquired_at) VALUES ('sender','reply',1,'workflow',0);
      INSERT INTO mcp_connector(id,user_id,credential_scope,name,url,tools_json,created_at)
      VALUES ('connector','human','scope','Fictional MCP','https://example.invalid/mcp','[{"name":"read_total","allowed":true}]',0);
      INSERT INTO mcp_contact_access(contact_id,connection_id,generation) VALUES ('private','connector','private-grant');
      INSERT INTO mcp_group_access(group_id,agent_id,connection_id,user_id,generation)
      VALUES ('group','sender','connector','human','group-grant');`);
    const state = { model: [], tools: [], logs: [], checkpoints: new Map(), reads: [] };
    const c = vm.createContext({ Error, SyntaxError, Date, JSON, TextEncoder, NonRetryableError: class extends Error {},
      personalityContext:async()=>'',
      chatImageTools: [], taskTools: [], documentTools: [], groupMiniAppTools: [],
      taskToolNames: new Set(), documentToolNames: new Set(),
      researchTool: { function: { name: 'research_web' } }, taskResearchTool: { function: { name: 'research_task' } },
      imageTool: { function: { name: 'generate_chat_image' } }, profilePhotoTool: { function: { name: 'view_profile_photo' } },
      privateMessageTool: { function: { name: 'message_privately' } }, generatedImage: async () => null,
      withChatImages: async (_env, _scope, messages) => messages, withProfilePhotos: async (_env, _scope, messages) => messages,
      learningContext:async()=>'', learningQuestionInstruction:'', parseLearningQuestion:()=>null,
      console: { error: v => state.logs.push(v), warn: v => state.logs.push(v), log: v => state.logs.push(v) },
      groupSourceAccess: f.context.groupSourceAccess,
      isRecord: x => x !== null && typeof x === 'object' && !Array.isArray(x),
      safeErrorCode: f.context.safeErrorCode,
      groupRetrievalTools: [], reactionTool: { function: { name: 'react_to_message' } },
      mcpTools: [{ function: { name: 'list_mcp_tools' } }, { function: { name: 'call_mcp_tool' } }],
      acknowledgeAgentContext: async () => {}, acknowledgeGroupResults: async (db, agent, rows) => state.reads.push(rows),
      attachmentMessage: async () => { throw Error('UNEXPECTED_ATTACHMENT_FETCH'); },
      executeMcp: async (env, turn, name, args, slot) => {
        state.tools.push({ name, args, slot });
        if (name === 'call_mcp_tool') {
          f.sqlite.prepare(`INSERT INTO mcp_group_execution(turn_id,slot,connection_id,tool_name,arguments_json,result_json,uncertain,access_generation)
            VALUES ('reply',?,'connector','read_total','{}','{"total":42}',0,'group-grant')`).run(slot);
          return '{"total":42}';
        }
        return '{"tools":[{"toolName":"read_total"}]}';
      },
    });
    for (const file of ['personality/conversation.ts','groups/conversation.ts','chat/messages.ts']) vm.runInContext(source(file), c);
    vm.runInContext(source('groups/context.ts'), c);
    vm.runInContext(source('groups/completion.ts'), c);
    const input = { messages: [{ role: 'system', content: 'Fictional group context.' }],
      scope: { groupID: 'group', agentID: 'sender', userID: 'human', contributor: false,
        reactionJob: { turnID: 'reply', attempt: 1 },
        mcp: { id: 'reply', attempt: 1, contactID: 'private', userID: 'human', groupID: 'group', agentID: 'sender' } },
      attachment: null, throughSequence: 1, openingReplyRequired: false, allowedActions: ['reply', 'skip'], previous: null, contextMessageIDs: [] };
    const step = { do: async (name, ...args) => {
      if (state.checkpoints.has(name)) return structuredClone(state.checkpoints.get(name));
      const result = await args.at(-1)();
      state.checkpoints.set(name, structuredClone(result));
      return structuredClone(result);
    } };
    const simulate = responses => {
      c.museCompletion = async (env, messages, model, options) => {
        state.model.push({ messages: structuredClone(messages), options });
        const next = responses.shift();
        assert.ok(next, 'unexpected additional model request');
        if (next instanceof Error) throw next;
        return typeof next === 'function' ? next() : next;
      };
    };
    const complete = () => c.completeGroupDraft(f.env, input, step, 'draft');
    await run({ ...f, c, input, state, step, simulate, complete });
    checks++;
    console.log('PASS ' + name);
  } finally { f.sqlite.close(); }
}
(async () => {
  await check('exploration and strict finalization are separate requests', async f => {
    f.simulate([finish(), final()]);
    assert.equal((await f.complete()).text, 'Fictional total: 42.');
    assert.ok(f.state.model[0].options.tools);
    assert.equal(f.state.model[0].options.responseFormat, undefined);
    assert.equal(f.state.model[1].options.tools, undefined);
    assert.equal(f.state.model[1].options.responseFormat.json_schema.strict, true);
  });
  await check('prose does not end research; sequential catalog lookup and execution work', async f => {
    f.simulate([{role:'assistant',content:'I will search.'}, answer(call('list_mcp_tools',{query:'total'},'search')),
      answer(call('list_mcp_tools',{query:'read_total'},'schema')),
      answer(call('call_mcp_tool',{connectionID:'connector',toolName:'read_total',arguments:{}},'execute')), finish(), final()]);
    await f.complete();
    assert.equal(f.state.tools.length, 3);
    assert.deepEqual(f.state.tools.map(t => t.slot), [0,1,2]);
  });
  await check('invalid final JSON is repaired without repeating evidence or exposing content', async f => {
    f.simulate([answer(call('call_mcp_tool',{connectionID:'connector',toolName:'read_total',arguments:{}})), finish(),
      {role:'assistant',content:'PRIVATE_PROVIDER_TEXT'}, final()]);
    await f.complete();
    assert.equal(f.state.tools.length, 1);
    assert.equal(f.state.model.at(-1).options.maxTokens, 8192);
    assert.ok(!f.state.logs.join('').includes('PRIVATE_PROVIDER_TEXT'));
    await f.complete();
    assert.equal(f.state.tools.length, 1);
    assert.equal(f.state.model.length, 4);
  });
  await check('a finalization transport failure recovers without replaying MCP', async f => {
    f.simulate([answer(call('call_mcp_tool',{connectionID:'connector',toolName:'read_total',arguments:{}})), finish(),
      Error('MODEL_TEMPORARILY_UNAVAILABLE'), {role:'assistant',content:'I could not finish the analysis, but the available total is 42.'}]);
    assert.match((await f.complete()).text,/total is 42/);
    assert.equal(f.state.tools.length,1);
    assert.equal(f.state.model.at(-1).options.tools,undefined);
    assert.equal(f.state.model.at(-1).options.responseFormat,undefined);
    await f.complete();
    assert.equal(f.state.tools.length,1);
    assert.equal(f.state.model.length,4);
  });
  await check('two invalid decisions get a natural-language recovery from saved evidence', async f => {
    f.simulate([answer(call('call_mcp_tool',{connectionID:'connector',toolName:'read_total',arguments:{}})), finish(),
      {role:'assistant',content:'INVALID_PRIVATE_TEXT'}, {role:'assistant',content:'INVALID_PRIVATE_TEXT'},
      {role:'assistant',content:'The fictional total is 42.'}]);
    assert.equal((await f.complete()).text,'The fictional total is 42.');
    assert.equal(f.state.tools.length,1);
    assert.ok(!f.state.logs.join('').includes('INVALID_PRIVATE_TEXT'));
  });
  await check('failed recovery never publishes fabricated fallback text', async f => {
    f.simulate([finish(), {role:'assistant',content:'INVALID'}, {role:'assistant',content:'INVALID'}, Error('MODEL_TEMPORARILY_UNAVAILABLE')]);
    await assert.rejects(f.complete,/MODEL_TEMPORARILY_UNAVAILABLE/);
    assert.equal(f.state.tools.length,0);
  });
  await check('later human messages cancel obsolete recovery', async f => {
    f.simulate([finish(), {role:'assistant',content:'INVALID'}, () => {
      f.sqlite.exec(`INSERT INTO group_message(id,group_id,user_id,sender_name,text,created_at,contributor_consent)
        VALUES ('newer','group','human','Demo Human','Cancel this task',1,1)`);
      return {role:'assistant',content:'INVALID'};
    }]);
    assert.equal((await f.complete()).text,null);
    assert.equal(f.state.model.length,3);
  });
  await check('truncation moves to finalization and can recover with a larger final budget', async f => {
    f.simulate([Error('MODEL_INCOMPLETE_RESPONSE'), Error('MODEL_INCOMPLETE_RESPONSE'), final()]);
    assert.equal((await f.complete()).text, 'Fictional total: 42.');
    assert.deepEqual(f.state.model.map(m => m.options.maxTokens), [4096,4096,8192]);
  });
  await check('revoked group grant blocks sending cached external data to another model request', async f => {
    f.simulate([answer(call('call_mcp_tool',{connectionID:'connector',toolName:'read_total',arguments:{}})),
      () => { f.sqlite.exec('DELETE FROM mcp_group_access'); return finish(); }]);
    await assert.rejects(f.complete, /GROUP_CONNECTOR_ACCESS_CHANGED/);
    assert.equal(f.state.model.length, 2);
  });
  await check('six-execution cap gives every requested call a matching response', async f => {
    f.simulate([answer(...Array.from({length:4},(_,i)=>call('list_mcp_tools',{},'a'+i))),
      answer(...Array.from({length:4},(_,i)=>call('list_mcp_tools',{},'b'+i))), final()]);
    await f.complete();
    assert.equal(f.state.tools.length, 6);
    const messages=f.state.model.at(-1).messages;
    assert.equal(messages.filter(m=>m.role==='tool').length,8);
    assert.equal(messages.filter(m=>m.role==='tool'&&m.content.includes('budget exhausted')).length,2);
  });
  await check('deadline survives replay and stops new model exploration', async f => {
    f.state.checkpoints.set('draft-deadline', 0);
    f.simulate([final()]);
    await f.complete();
    assert.equal(f.state.model.length,1);
    assert.ok(f.state.model[0].options.responseFormat);
  });
  await check('unsupported decisions and illegal opening skips fail with bounded codes', async f => {
    for (const text of ['private text','{"action":"other","text":"x"}','{"action":"skip","text":"x"}']) {
      assert.throws(()=>f.c.parseGroupDecision(text,f.input),/GROUP_INVALID_DECISION/);
    }
    assert.throws(()=>f.c.parseGroupDecision(decision('skip', []),{...f.input,openingReplyRequired:true,allowedActions:['reply']}),/GROUP_OPENING_REPLY_REQUIRED/);
    const previous={text:'Original response',throughSequence:0};
    assert.equal(f.c.parseGroupDecision(decision('keep', []),{...f.input,previous,allowedActions:['keep','revise']}).text,previous.text);
  });
  await check('wording review revises a flagged draft without tools and survives replay', async f => {
    f.input.memberNames=['Demo Human'];
    f.simulate([finish(), final('Hello Demo Human, how are you?'),
      {role:'assistant',content:decision('revise',['Everything is fine here.'])}]);
    assert.equal((await f.complete()).text,'Everything is fine here.');
    assert.equal(f.state.model.length,3);
    assert.equal(f.state.model.at(-1).options.tools,undefined);
    assert.equal(f.state.tools.length,0);
    await f.complete();
    assert.equal(f.state.model.length,3);
  });
  await check('failed optional review preserves the draft and never repeats executed tools on replay', async f => {
    f.simulate([answer(call('call_mcp_tool',{connectionID:'connector',toolName:'read_total',arguments:{}})),
      finish(), final('The available total is 42. What do you think?'), Error('MODEL_TEMPORARILY_UNAVAILABLE')]);
    assert.equal((await f.complete()).text,'The available total is 42. What do you think?');
    assert.equal(f.state.tools.length,1);
    assert.ok(f.state.checkpoints.has('draft-delivery-review'));
    await f.complete();
    assert.equal(f.state.tools.length,1);
    assert.equal(f.state.model.length,4);
  });
  await check('wording review preserves prepared media without sending its storage key to the model', async f => {
    f.c.generatedImage=async()=>({name:'Fictional.png',mimeType:'image/png',key:'PRIVATE_STORAGE_CANARY'});
    const draft=JSON.parse(final('The shared result is ready. What do you think?').content);
    draft.includeImage=true;
    f.simulate([finish(),{role:'assistant',content:JSON.stringify(draft)},
      {role:'assistant',content:decision('revise',['The shared result is ready.'])}]);
    const result=await f.complete();
    assert.equal(result.attachment.key,'PRIVATE_STORAGE_CANARY');
    assert.equal(result.includeImage,true);
    assert.ok(!JSON.stringify(f.state.model.at(-1).messages).includes('PRIVATE_STORAGE_CANARY'));
  });
  await check('access loss before wording review prevents another inference', async f => {
    f.simulate([finish(),()=>{
      f.sqlite.exec("DELETE FROM group_agent WHERE group_id='group' AND agent_id='sender'");
      return final('The available total is 42. What do you think?');
    }]);
    await f.complete();
    assert.equal(f.state.model.length,2);
    assert.equal(f.state.tools.length,0);
  });
  await check('a requested personal intervention cannot finalize as skip', async f => {
    f.simulate([finish(true), {role:'assistant',content:decision('skip',[])}, final('Here is my perspective.')]);
    const result = await f.complete();
    assert.equal(result.text, 'Here is my perspective.');
    assert.equal(result.responseRequired, true);
    assert.ok(!f.state.model[1].options.responseFormat.json_schema.schema.properties.action.enum.includes('skip'));
  });
  await check('a stale-draft review finalizes without restarting research or tools', async f => {
    f.input.previous = {text:'A saved response.',throughSequence:0,responseRequired:true};
    f.input.openingReplyRequired = true;
    f.input.allowedActions = ['keep','revise'];
    f.simulate([{role:'assistant',content:decision('keep',[])}]);
    const result = await f.complete();
    assert.equal(result.text,'A saved response.');
    assert.equal(f.state.model.length,1);
    assert.equal(f.state.model[0].options.tools,undefined);
    assert.equal(f.state.tools.length,0);
  });
  console.log(`${checks} isolated completion regressions passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
