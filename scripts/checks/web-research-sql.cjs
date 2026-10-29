// Compile SQL against an empty migrated schema. No feature behavior, network,
// inference, private data or remote migrations are executed.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript6');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'apps/api/src/research/tools.ts'), 'utf8');
const tree = ts.createSourceFile('tools.ts', source, ts.ScriptTarget.Latest, true);
const helper = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'researchAccess');
if (!helper) throw Error('Missing researchAccess SQL helper');
const queries = new Map();
for (const kind of ['contact', 'group']) for (const contributor of [false, true]) {
  const context = vm.createContext({ scope: { kind, contributor, turnID: 'turn', attempt: 1, userID: 'user', agentID: 'agent', contactID: 'contact', groupID: 'group' } });
  vm.runInContext(ts.transpile(helper.getText(tree).replace(/^export /, '')), context);
  context.access = vm.runInContext('researchAccess(scope)', context);
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'prepare') {
      const sql = vm.runInContext(node.arguments[0].getText(tree), context);
      queries.set(sql, { sql, parameters: (sql.match(/\?/g) || []).length });
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}
const result = spawnSync('python3', ['scripts/checks/sql-depth.py'], { cwd: root, input: JSON.stringify([...queries.values()]), encoding: 'utf8' });
if (result.status !== 0) throw Error(result.stderr || result.error || 'SQL preparation failed');
console.log(`Compiled ${queries.size} web research SQL variants at expression depth 100.`);
