#!/usr/bin/env python3
"""Compile MCP SQL against an empty local schema; never access application rows.

This is static SQL validation, not a functional OAuth or MCP test. Requires
Python 3.11+ and SQLite with FTS5. Creates no files and contacts no services.
"""
from pathlib import Path
import re
import sqlite3

root = Path(__file__).resolve().parents[2]
db = sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys = ON')
for migration in sorted((root / 'apps/api/migrations').glob('*.sql')):
    db.executescript(migration.read_text())
db.setlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH, 100)
constants = {}
for path in (root / 'apps/api/src/mcp').glob('*.ts'):
    for name, value in re.findall(r"(?:export )?const (\w+Columns) = '([^']+)';", path.read_text()):
        constants[name] = value
count = 0
for path in (root / 'apps/api/src/mcp').glob('*.ts'):
    source = path.read_text()
    queries = re.findall(r'\.prepare\(`([^`]+)`\)', source) + re.findall(r"\.prepare\('([^']+)'\)", source)
    for query in queries:
        for name, value in constants.items():
            query = query.replace('${' + name + '}', value)
        if '${' in query:
            raise ValueError(f'Unresolved SQL template in {path.name}')
        numbers = [int(value) for value in re.findall(r'\?(\d+)', query)]
        parameters = max(numbers) if numbers else query.count('?')
        db.execute('EXPLAIN ' + query, [None] * parameters)
        count += 1
print(f'Compiled {count} MCP SQL statements at expression depth 100 against an empty migrated schema.')
