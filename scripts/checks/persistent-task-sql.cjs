// Compile SQL templates only, against an empty migrated schema. No feature calls,
// fixtures, model inference, network requests or runtime assertions are executed.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript6');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, 'apps/api/src', file), 'utf8');
const tree = file => ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
const queries = new Map();
for (const kind of ['contact', 'group']) for (const includeCanceled of [true, false]) for (const source of ['chat_turn', 'group_message']) for (const monitor of [false, true]) {
  // Both dispatcher selections and both admission budgets (work turns and monitor change turns).
  const context = vm.createContext({ includeCanceled, source, monitor, now: 0, task: { count: 1, monitorCount: 1, generation: 0 },
    reason: monitor ? "'monitor'" : 't.work_reason', order: 't.id', limit: 5,
    filter: null,
    where: { sql: kind === 'group' ? 'l.group_id = ?' : 'l.contact_id = ? AND l.user_id = ?' } });
  for (const file of ['monitors/check.ts', 'chat/data.ts', 'tasks/data.ts', 'monitors/dispatch.ts', 'tasks/dispatch.ts']) {
    // The dispatcher's monitor selection embeds the shared monitorActive grant predicate.
    if (file === 'tasks/dispatch.ts') vm.runInContext(`filter = monitor ? 't.monitor_pending_at <= ?1 AND ' + monitorActive : 't.work_due_at <= ?1'`, context);
    const ast = tree(file);
    function visit(node) {
      if (ts.isVariableDeclaration(node) && ['monitorLimits', 'monitorActive', 'current', 'taskLimits', 'open', 'turnColumns', 'storedColumns', 'budget', 'admission', 'reviewer'].includes(node.name.getText(ast))) {
        vm.runInContext(ts.transpile(`var ${node.name.getText(ast)} = ${node.initializer.getText(ast)}`), context);
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'prepare') {
        const sql = vm.runInContext(node.arguments[0].getText(ast), context);
        const numbers = [...sql.matchAll(/\?(\d+)/g)].map(match => Number(match[1]));
        queries.set(sql, { sql, parameters: numbers.length ? Math.max(...numbers) : (sql.match(/\?/g) || []).length });
      }
      ts.forEachChild(node, visit);
    }
    // chat/data supplies columns; its unrelated queries are checked elsewhere.
    if (file === 'chat/data.ts') ast.forEachChild(node => {
      if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) {
        if (['turnColumns', 'storedColumns'].includes(declaration.name.getText(ast))) visit(declaration);
      }
    });
    else visit(ast);
  }
}
// Compile the actual source-access predicates in their surrounding preparation,
// model/tool admission queries, including Contributor variants.
for (const contributor of [false, true]) {
  const context = vm.createContext({ contributor, input: { scope: { contributor } } });
  for (const file of ['tasks/access.ts', 'groups/request-access.ts']) {
    const ast = tree(file);
    ast.forEachChild(node => {
      if (ts.isFunctionDeclaration(node)) vm.runInContext(ts.transpile(node.getText(ast).replace(/^export /, '')), context);
    });
  }
  for (const file of ['chat/context.ts', 'groups/context.ts', 'groups/completion.ts']) {
    const ast = tree(file);
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'prepare') {
        const expression = node.arguments[0].getText(ast);
        if (/groupSourceAccess|privateTaskAccess|SELECT source\.task_id/.test(expression)) {
          const sql = vm.runInContext(expression, context);
          const numbers = [...sql.matchAll(/\?(\d+)/g)].map(match => Number(match[1]));
          queries.set(sql, { sql, parameters: numbers.length ? Math.max(...numbers) : (sql.match(/\?/g) || []).length });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
}
if (process.env.SQL_OUT) fs.writeFileSync(process.env.SQL_OUT, JSON.stringify([...queries.values()]));
const result = spawnSync('python3', ['scripts/checks/sql-depth.py'], { cwd: root, input: JSON.stringify([...queries.values()]), encoding: 'utf8' });
if (result.status !== 0) throw Error(result.stderr || result.error || 'SQL preparation failed');
console.log(`Compiled ${queries.size} persistent task SQL variants at expression depth 100.`);
