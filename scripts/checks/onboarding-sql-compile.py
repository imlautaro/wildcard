#!/usr/bin/env python3
"""Compile onboarding SQL against an empty migrated schema; no functional tests."""
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
queries = []
for source in (root / 'apps/api/src/onboarding').glob('*.ts'):
    for match in re.finditer(r'\.prepare\(\s*([\'"`])(.*?)\1\s*\)', source.read_text(), re.S):
        query = match.group(2)
        if '${' in query:
            raise ValueError('Unresolved SQL template')
        queries.append(query)
for query in queries:
    numbers = [int(value) for value in re.findall(r'\?(\d+)', query)]
    parameters = max(numbers) if numbers else query.count('?')
    db.execute('EXPLAIN ' + query, [None] * parameters)
print(f'Compiled {len(queries)} onboarding statements against {len(migrations)} migrations.')
