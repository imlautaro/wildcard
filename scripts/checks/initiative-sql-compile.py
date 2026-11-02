#!/usr/bin/env python3
"""Prepare initiative SQL against an empty migrated SQLite schema, without fixtures.

Static validation only: no model calls, network, credentials or production data.
"""
from pathlib import Path
import re
import sqlite3

root = Path(__file__).resolve().parents[2]
db = sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys = ON')
migrations = sorted((root / 'apps/api/migrations').glob('*.sql'))
for migration in migrations:
    db.executescript(migration.read_text())
db.setlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH, 100)
source = (root / 'apps/api/src/chat/initiative.ts').read_text()
welcome = (root / 'apps/api/src/chat/welcome.ts').read_text()
constants = dict(re.findall(r'const (\w+) = `([^`]+)`;', source + welcome))
# Numeric budgets interpolated into SQL are plain integer constants.
constants.update(re.findall(r'const (\w+) = (\d+);', source + welcome))
# Production interpolates only a validated integer for the learning epoch. Use a
# static integer while preparing the real SQL; never evaluate TypeScript here.
constants = {key: value.replace('${Number.isSafeInteger(state.learningRevision) ? state.learningRevision : -1}', '0')
             for key, value in constants.items()}
contributor_clause = re.search(r"const modelAllowed = contributor \? `([^`]+)` : '1';", source).group(1)
queries = []
for filename in ['initiative.ts', 'initiative-adaptation.ts', 'welcome.ts']:
    text = (root / 'apps/api/src/chat' / filename).read_text()
    queries.extend(re.findall(r'\.prepare\(`([^`]+)`\)', text))
    queries.extend(re.findall(r"\.prepare\('([^']+)'\)", text))

compiled = 0
for clause in ['1', contributor_clause]:
    values = {**constants, 'modelAllowed': clause}
    for query in queries:
        for _ in range(8):
            query = re.sub(r'\$\{(\w+)\}', lambda match: values.get(match[1], match[0]), query)
        if '${' in query:
            raise ValueError('Unresolved initiative SQL template')
        numbers = [int(value) for value in re.findall(r'\?(\d+)', query)]
        parameters = max(numbers) if numbers else query.count('?')
        db.execute('EXPLAIN ' + query, [None] * parameters)
        compiled += 1
print(f'Compiled {compiled} initiative SQL variants at expression depth 100 against {len(migrations)} migrations.')
