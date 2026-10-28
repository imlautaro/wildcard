"""Compile remote-native SQL against an ephemeral database. No statements or fixtures execute."""
from pathlib import Path
import re
import sqlite3

root = Path(__file__).resolve().parents[2]
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
migrations = sorted((root / "apps/api/migrations").glob("*.sql"))
for migration in migrations:
    db.executescript(migration.read_text())
count = 0
for filename in ["native/remote.ts", "native/remote-routes.ts", "native/actions.ts"]:
    source = (root / "apps/api/src" / filename).read_text()
    for match in re.finditer(r"\.prepare\(\s*(?:`([^`]+)`|'([^']+)')", source):
        query = match.group(1) or match.group(2)
        variants = [query]
        if "${running ?" in query:
            pattern = r'\$\{running \? "([^"]+)" : "([^"]+)"\}'
            alternatives = re.search(pattern, query)
            if not alternatives:
                raise ValueError("Unknown SQL branch")
            variants = [re.sub(pattern, lambda _: branch, query) for branch in alternatives.groups()]
        for variant in variants:
            if "${" in variant:
                raise ValueError(f"Unresolved SQL in {filename}")
            numbered = [int(value) for value in re.findall(r"\?(\d+)", variant)]
            parameters = max(numbered) if numbered else variant.count("?")
            db.execute("EXPLAIN " + variant, [None] * parameters)
            count += 1
assert not db.execute("PRAGMA foreign_key_check").fetchall()
print(f"Compiled {count} SQL variants after {len(migrations)} migrations on empty in-memory SQLite.")
print("No fixtures, runtime tests, network, provider credentials, APNs or device actions used.")
