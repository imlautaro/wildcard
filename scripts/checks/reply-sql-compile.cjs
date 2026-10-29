// Static preparation only; no reply/extraction functions, services or application data.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const ts = require('typescript6');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root,'apps/api/src',file),'utf8');
const helpers = [];
for (const file of ['groups/request-access.ts','schedules/data.ts']) {
  const text=read(file), tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  tree.forEachChild(node=>{
    if(ts.isFunctionDeclaration(node)&&['groupPublicationAccess','groupRequestAccess','groupRequestTurnAllowed','groupSourceAccess','scheduleAllowed'].includes(node.name?.text)) {
      helpers.push(node.getText(tree).replace(/^export /,''));
    }
  });
}
const queries=new Map();
for(const contributor of [false,true]) {
  const context=vm.createContext({input:{scope:{contributor}},c:{env:{}},contributor:()=>contributor});
  vm.runInContext(ts.transpile(helpers.join('\n')),context);
  context.resultAllowed=vm.runInContext(`groupRequestTurnAllowed('chat_turn',${contributor})`,context);
  for(const file of ['groups/routes.ts','groups/completion.ts']) {
    const text=read(file), tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
    function visit(node) {
      if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='prepare') {
        const literal=node.arguments[0];
        const raw=literal.getText(tree);
        // Select changed queries; completion's access checks are also compiled.
        if(file==='groups/routes.ts'&&!raw.includes('sourceSequence')&&!raw.includes('UPDATE group_reply SET status')) return;
        const sql=vm.runInContext(raw,context);
        const numbers=[...sql.matchAll(/\?(\d+)/g)].map(m=>Number(m[1]));
        queries.set(sql,{sql,parameters:numbers.length?Math.max(...numbers):(sql.match(/\?/g)||[]).length});
      }
      ts.forEachChild(node,visit);
    }
    visit(tree);
  }
}
const result=spawnSync('python3',['scripts/checks/sql-depth.py'],{cwd:root,input:JSON.stringify([...queries.values()]),encoding:'utf8'});
if(result.status!==0)throw Error(result.stderr||result.error||'SQL preparation failed');
console.log(`Compiled ${queries.size} reply/recovery SQL variants against an empty migrated schema at expression depth 100.`);

// Reply publication now includes conditional delivery guards and is compiled separately.
require('./reply-messages-sql.cjs');
