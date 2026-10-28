#!/usr/bin/env python3
"""Statically compile personality SQL against an empty, ephemeral migrated schema.

No application data, credentials, network, model calls or functional tests.
Requires Python 3.11+ and SQLite with FTS5.
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

queries = []
for source in (root / 'apps/api/src/personality').glob('*.ts'):
    queries.extend(re.findall(r'\.prepare\(`([^`]+)`\)', source.read_text()))
    queries.extend(re.findall(r"\.prepare\('([^']+)'\)", source.read_text()))
private_context = (root / 'apps/api/src/chat/context.ts').read_text()
queries.extend(query for query in re.findall(r'\.prepare\(`([^`]+)`\)', private_context)
               if 't.updated_at AS repliedAt, c.last_reply_read_at AS readAt' in query)
for query in queries:
    if '${' in query:
        raise ValueError('Unresolved personality SQL template')
    numbers = [int(value) for value in re.findall(r'\?(\d+)', query)]
    parameters = max(numbers) if numbers else query.count('?')
    db.execute('EXPLAIN ' + query, [None] * parameters)
print(f'Compiled {len(queries)} personality SQL statements at expression depth 100 against {len(migrations)} migrations.')
