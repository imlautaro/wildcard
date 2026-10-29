// Compile query templates against an empty migrated schema; no execution or private data.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript6');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, 'apps/api/src', file), 'utf8');
const helpers = [];
const dataSource = read('chat/data.ts');
const dataTree = ts.createSourceFile('data.ts', dataSource, ts.ScriptTarget.Latest, true);
dataTree.forEachChild(node => {
  if (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => ['turnColumns', 'storedColumns'].includes(d.name.getText(dataTree)))) helpers.push(node.getText(dataTree).replace(/^export /, ''));
});
for (const file of ['tasks/access.ts', 'groups/request-access.ts', 'groups/energy.ts', 'schedules/data.ts']) {
  const source = read(file), tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  tree.forEachChild(node => {
    if (ts.isFunctionDeclaration(node) && ['taskWorkAccess', 'privateTaskAccess', 'groupPublicationAccess', 'groupRequestAccess', 'groupRequestTurnAllowed', 'groupSourceAccess', 'scheduleAllowed', 'groupEnergyAvailable'].includes(node.name?.text)) {
      helpers.push(node.getText(tree).replace(/^export /, ''));
    }
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(tree) === 'energyPoints')) helpers.push(node.getText(tree).replace(/^export /, ''));
  });
}
const groupContext = read('groups/context.ts');
const groupTree = ts.createSourceFile('context.ts', groupContext, ts.ScriptTarget.Latest, true);
groupTree.forEachChild(node => {
  if (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(groupTree) === 'visibleMessage')) helpers.push(node.getText(groupTree).replace(/^export /, ''));
});
const queries = new Map();
for (const contributor of [false, true]) for (const index of [0, 1]) {
  const context = vm.createContext({ scope: { contributor }, index, contributor, env: { META_CHAT_MODEL: contributor ? 'muse-spark-1.3-contributor' : 'muse-spark-1.3' } });
  vm.runInContext(ts.transpile(helpers.join('\n')), context);
  for (const file of ['chat/workflow.ts', 'groups/workflow.ts', 'chat/dispatch.ts', 'chat/pacing.ts', 'photos/generation.ts', 'chat/attachments.ts']) {
    const source = read(file), tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isVariableDeclaration(node) && ['publicationAccess', 'unchangedHistory', 'interrupted'].includes(node.name.getText(tree))) {
        vm.runInContext(ts.transpile(`var ${node.name.getText(tree)} = ${node.initializer.getText(tree)}`), context);
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'prepare') {
        context.access = vm.runInContext(`typeof publicationAccess === 'undefined' ? '' : publicationAccess(${contributor})`, context);
        context.workAllowed = vm.runInContext("privateTaskAccess('chat_turn')", context);
        context.resultAllowed = vm.runInContext(`groupRequestTurnAllowed('chat_turn', ${contributor})`, context);
        const sql = vm.runInContext(node.arguments[0].getText(tree), context);
        const numbers = [...sql.matchAll(/\?(\d+)/g)].map(m => Number(m[1]));
        queries.set(sql, { sql, parameters: numbers.length ? Math.max(...numbers) : (sql.match(/\?/g) || []).length });
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
}
const result = spawnSync('python3', ['scripts/checks/sql-depth.py'], { cwd: root, input: JSON.stringify([...queries.values()]), encoding: 'utf8' });
if (result.status !== 0) throw Error(result.stderr || result.error || 'SQL preparation failed');
console.log(`Compiled ${queries.size} reply message SQL variants at expression depth 100.`);
