#!/usr/bin/env python3
"""Compile generation SQL against all migrations without executing feature behavior."""
from pathlib import Path
import re
import sqlite3

root = Path(__file__).resolve().parents[2]
db = sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys = ON')
migrations = sorted((root / 'apps/api/migrations').glob('*.sql'))
for migration in migrations:
    db.executescript(migration.read_text())
queries = []
for source in (root / 'apps/api/src/contacts').glob('*.ts'):
    for match in re.finditer(r'\.prepare\(\s*([\'"`])(.*?)\1\s*\)', source.read_text(), re.S):
        query = match.group(2)
        if '${' in query:
            raise ValueError('Unresolved SQL template')
        parameters = max([int(v) for v in re.findall(r'\?(\d+)', query)], default=query.count('?'))
        db.execute('EXPLAIN ' + query, [None] * parameters)
        queries.append(query)
print(f'Compiled {len(queries)} contact generation statements against {len(migrations)} migrations.')
