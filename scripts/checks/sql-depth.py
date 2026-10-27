#!/usr/bin/env python3
"""Prepare captured SQL against a fresh schema with D1's expression depth limit."""
import json
from pathlib import Path
import sqlite3
import sys

root = Path(__file__).resolve().parents[2]
connection = sqlite3.connect(':memory:')
for migration in sorted((root / 'apps/api/migrations').glob('*.sql')):
    connection.executescript(migration.read_text())
connection.setlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH, 100)
for index, query in enumerate(json.load(sys.stdin)):
    try:
        connection.execute('EXPLAIN ' + query['sql'], [None] * query['parameters']).fetchall()
    except sqlite3.Error as error:
        raise RuntimeError(f'Query {index}: {error}') from error
