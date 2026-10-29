// Prepare SQL only, against an empty migrated schema; no runtime or model calls.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript6');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const queries = new Map();
const source = fs.readFileSync(path.join(root, 'apps/api/src/groups/private-sharing.ts'), 'utf8');
const tree = ts.createSourceFile('sharing.ts', source, ts.ScriptTarget.Latest, true);
const constants = [];
tree.forEachChild(node => {
  if (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => ['access', 'joins'].includes(d.name.getText(tree)))) constants.push(node.getText(tree));
});
for (const match of ['', '"pizza"*']) {
  const context = vm.createContext({ match });
  vm.runInContext(ts.transpile(constants.join('\n')), context);
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'prepare') {
      const sql = vm.runInContext(node.arguments[0].getText(tree), context);
      queries.set(sql, { sql, parameters: Math.max(...[...sql.matchAll(/\?(\d+)/g)].map(m => +m[1])) });
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}
const routes = fs.readFileSync(path.join(root, 'apps/api/src/groups/routes.ts'), 'utf8');
const routeTree = ts.createSourceFile('routes.ts', routes, ts.ScriptTarget.Latest, true);
function visitRoutes(node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'prepare') {
    const value = node.arguments[0];
    if ((ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) && value.text.includes('group_private_sharing')) {
      const sql = value.text;
      const numbers = [...sql.matchAll(/\?(\d+)/g)].map(m => +m[1]);
      queries.set(sql, { sql, parameters: numbers.length ? Math.max(...numbers) : (sql.match(/\?/g) || []).length });
    }
  }
  ts.forEachChild(node, visitRoutes);
}
visitRoutes(routeTree);
const result = spawnSync('python3', ['scripts/checks/sql-depth.py'], { cwd: root, input: JSON.stringify([...queries.values()]), encoding: 'utf8' });
if (result.status !== 0) throw Error(result.stderr || result.error || 'SQL preparation failed');
console.log(`Compiled ${queries.size} private sharing SQL variants against all migrations.`);
