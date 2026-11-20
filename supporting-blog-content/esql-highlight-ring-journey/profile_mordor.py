"""Time and profile the Mordor examples: top-N before HIGHLIGHT vs the MV_FIRST gotcha.

Usage: python3 profile_mordor.py [--runs N]
Prints the median `took` per variant and, from one profiled run each, the
row counts of the TopN and Highlight operators per driver.
"""

import argparse
import statistics

from es_client import es_request_ok

WARMUP_RUNS = 2
DEFAULT_RUNS = 5
INTERESTING_OPERATORS = (
    "LuceneTopNSourceOperator",
    "TopNOperator",
    "HighlightOperator",
)
STATUS_KEYS = ("rows_received", "rows_emitted", "processed_shards")

SEARCH = """FROM eye_watch METADATA _score
| WHERE MATCH(report, "ring bearer")"""

VARIANTS = {
    "no_highlight": SEARCH
    + """
| SORT _score DESC
| LIMIT 3
| KEEP watcher, place, _score""",
    "topn_before_highlight": SEARCH
    + """
| HIGHLIGHT
| SORT _score DESC
| LIMIT 3
| KEEP watcher, place, _score, highlight_report""",
    "mv_first_gotcha": SEARCH
    + """
| HIGHLIGHT
| EVAL snippet = MV_FIRST(highlight_report)
| SORT _score DESC
| LIMIT 3
| KEEP watcher, place, _score, snippet""",
    "mv_first_after_limit": SEARCH
    + """
| HIGHLIGHT
| SORT _score DESC
| LIMIT 3
| EVAL snippet = MV_FIRST(highlight_report)
| KEEP watcher, place, _score, snippet""",
}


def run_query(query, profile=False):
    body = {"query": query, "profile": profile} if profile else {"query": query}
    return es_request_ok("POST", "/_query", body).json()


def median_took(query, runs):
    for _ in range(WARMUP_RUNS):
        run_query(query)
    return statistics.median(run_query(query)["took"] for _ in range(runs))


def operator_rows(profile):
    """Yield (driver description, operator name, status subset) for interesting operators."""
    for driver in profile.get("drivers", []):
        for operator in driver.get("operators", []):
            name = operator.get("operator", "").split("[", 1)[0]
            if name in INTERESTING_OPERATORS:
                status = operator.get("status") or {}
                subset = {key: status[key] for key in STATUS_KEYS if key in status}
                yield driver.get("description", "?"), name, subset


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runs", type=int, default=DEFAULT_RUNS)
    args = parser.parse_args()
    if args.runs < 1:
        raise SystemExit("--runs must be positive")

    for name, query in VARIANTS.items():
        took = median_took(query, args.runs)
        print(f"=== {name}: median took {took} ms over {args.runs} runs")
        print(query)
        print("--- profile")
        for description, operator, status in operator_rows(
            run_query(query, profile=True)["profile"]
        ):
            print(f"{description:12} {operator:26} {status}")
        print()


if __name__ == "__main__":
    main()
