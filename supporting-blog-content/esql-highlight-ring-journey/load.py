"""Create the ring-journey indices and load the blog dataset.

Usage: python3 load.py [--eye-watch-count N]
Recreates fellowship_log, red_book, book_of_mazarbul and eye_watch.
On Serverless, index settings and force merge are skipped.
"""

import argparse
import json
from itertools import islice
from pathlib import Path

from es_client import es_request, es_request_ok, is_serverless
from generate_eye_watch import generate_reports

ROOT = Path(__file__).resolve().parent
HAND_WRITTEN_INDICES = ("fellowship_log", "red_book", "book_of_mazarbul")
GENERATED_INDEX = "eye_watch"
DEFAULT_EYE_WATCH_COUNT = 50_000
BULK_CHUNK_SIZE = 5_000


def read_json(*parts):
    return json.loads(ROOT.joinpath(*parts).read_text(encoding="utf-8"))


def create_index(name):
    mapping = read_json("mappings", f"{name}.json")
    if is_serverless():
        mapping = {key: value for key, value in mapping.items() if key != "settings"}
    deleted = es_request("DELETE", f"/{name}")
    if deleted.status not in (200, 404):
        detail = deleted.text()[:500]
        raise SystemExit(f"Could not delete {name}: {deleted.status} {detail}")
    es_request_ok("PUT", f"/{name}", mapping)


def bulk_index(name, pairs):
    lines = []
    for doc_id, source in pairs:
        lines.append(json.dumps({"index": {"_id": doc_id}}))
        lines.append(json.dumps(source, ensure_ascii=False))
    if not lines:
        return 0
    payload = "\n".join(lines) + "\n"
    response = es_request_ok("POST", f"/{name}/_bulk", payload, "application/x-ndjson")
    result = response.json()
    if result.get("errors"):
        failures = [item for item in result["items"] if "error" in item["index"]]
        first = failures[0]
        raise SystemExit(f"{len(failures)} bulk failures in {name}, first: {first}")
    return len(lines) // 2


def load_records(name):
    records = read_json("data", f"{name}.json")
    pairs = [(r["_id"], {k: v for k, v in r.items() if k != "_id"}) for r in records]
    return bulk_index(name, pairs)


def load_generated(count):
    reports = generate_reports(count)
    loaded = 0
    while chunk := list(islice(reports, BULK_CHUNK_SIZE)):
        loaded += bulk_index(GENERATED_INDEX, chunk)
    return loaded


def finalize(names):
    joined = ",".join(names)
    es_request_ok("POST", f"/{joined}/_refresh")
    if is_serverless():
        print("refreshed (Serverless manages segments, so no force merge)")
        return
    es_request_ok("POST", f"/{joined}/_forcemerge?max_num_segments=1")
    print("refreshed and force-merged")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--eye-watch-count", type=int, default=DEFAULT_EYE_WATCH_COUNT)
    args = parser.parse_args()
    if args.eye_watch_count < 1:
        raise SystemExit("--eye-watch-count must be positive")

    for name in HAND_WRITTEN_INDICES:
        create_index(name)
        print(f"{name}: {load_records(name)} docs")
    create_index(GENERATED_INDEX)
    print(f"{GENERATED_INDEX}: {load_generated(args.eye_watch_count)} docs")

    finalize((*HAND_WRITTEN_INDICES, GENERATED_INDEX))


if __name__ == "__main__":
    main()
