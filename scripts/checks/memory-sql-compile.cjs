// Static SQL preparation only: node scripts/checks/memory-sql-compile.cjs
// Evaluates query templates, never calls extraction/reply functions or providers.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const ts = require('typescript6');
const root = path.resolve(__dirname, '../..');
const queries = new Map();
for (const file of ['chat/memory.ts', 'chat/agent-memory.ts', 'groups/memory.ts']) {
  const source = fs.readFileSync(path.join(root, 'apps/api/src', file), 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const helpers = [];
  const templates = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ['eligibleEvent', 'memoryColumns'].includes(node.name.getText(tree))) {
      helpers.push(`const ${node.name.getText(tree)} = ${node.initializer.getText(tree)};`);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'prepare') {
      templates.push(node.arguments[0].getText(tree));
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  for (const isolated of [false, true]) for (const contributor of [false, true]) {
    const table = file.includes('agent-memory') ? (isolated ? 'agent_local_memory' : 'agent_memory')
      : (isolated ? 'group_local_memory' : 'group_memory');
    const context = vm.createContext({ table, scope: isolated ? 'private:fixture' : null,
      source: { isolated }, env: { META_CHAT_MODEL: contributor ? 'muse-spark-1.3-contributor' : 'muse-spark-1.3' },
      localColumn: isolated ? 'group_id, ' : '', localValue: isolated ? '?11, ' : '',
      localFilter: isolated ? 'AND group_id = ?11' : '',
      scopeGuard: `${isolated ? '' : 'NOT '}EXISTS (SELECT 1 FROM mcp_private_group p WHERE p.group_id = r.group_id)`,
    });
    vm.runInContext(ts.transpile(helpers.join('\n')), context);
    for (const template of templates) {
      const sql = vm.runInContext(template, context);
      const numbered = [...sql.matchAll(/\?(\d+)/g)].map(m => Number(m[1]));
      const parameters = numbered.length ? Math.max(...numbered) : (sql.match(/\?/g) || []).length;
      queries.set(sql, { sql, parameters });
    }
  }
}
const result = spawnSync('python3', ['scripts/checks/sql-depth.py'], {
  cwd: root, input: JSON.stringify([...queries.values()]), encoding: 'utf8',
});
if (result.status !== 0) throw Error(result.stderr || result.error || 'SQL preparation failed');
console.log(`Compiled ${queries.size} memory SQL variants against an empty migrated schema at expression depth 100.`);
