"""Run the blog's ES|QL queries and print each result table with any warnings.

Usage: python3 run_queries.py [name ...]
Queries live in queries.esql as blocks that start with `// name: <id>`.
"""

import re
import sys
from pathlib import Path

from es_client import es_request

ROOT = Path(__file__).resolve().parent
NAME_LINE = re.compile(r"^// name:\s*(\S+)\s*$")
WARNING_TEXT = re.compile(r'"(.*)"')


def parse_queries(text):
    """Return a list of (name, query) pairs, in file order."""
    queries = []
    name, lines = None, []
    for line in text.splitlines():
        match = NAME_LINE.match(line)
        if match:
            if name:
                queries.append((name, "\n".join(lines).strip()))
            name, lines = match.group(1), []
        elif name and not line.startswith("//"):
            lines.append(line)
    if name:
        queries.append((name, "\n".join(lines).strip()))
    return queries


def run(name, query):
    response = es_request("POST", "/_query?format=txt", {"query": query})
    print(f"=== {name} (HTTP {response.status})")
    print(query)
    print("---")
    for warning in response.warnings:
        found = WARNING_TEXT.search(warning)
        print(f"WARNING: {found.group(1) if found else warning}")
    print(response.text().rstrip())
    print()


def main():
    queries = parse_queries((ROOT / "queries.esql").read_text(encoding="utf-8"))
    wanted = set(sys.argv[1:])
    unknown = wanted - {name for name, _ in queries}
    if unknown:
        raise SystemExit(f"Unknown query names: {sorted(unknown)}")
    for name, query in queries:
        if not wanted or name in wanted:
            run(name, query)


if __name__ == "__main__":
    main()
