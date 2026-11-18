"""Check text against the protected index.

  python cli.py "text to check"                    # rule min_shared, N=3 (as in the UI)
  python cli.py --file email.txt --rule min_shared --n 3
  cat email.txt | python cli.py --rule any
  python cli.py --file email.txt --rule verified_run --n 16
  python cli.py --file email.txt --boilerplate      # count boilerplate stop words too (classification)
Copied words are marked [[like this]].
"""

import argparse
import sys

from check import DEFAULT_N, RULES, CheckError, check
from es import get_client, index_name
from spans import mark


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("text", nargs="?")
    ap.add_argument("--file")
    ap.add_argument("--rule", choices=RULES, default="min_shared")
    ap.add_argument(
        "--n",
        type=int,
        default=None,
        help="N for min_shared (fingerprints, default 3) or verified_run (words, default 16)",
    )
    ap.add_argument("--index", help="index name (default: INDEX_NAME in .env)")
    ap.add_argument(
        "--boilerplate",
        action="store_true",
        help="count boilerplate stop-word phrases too (classification)",
    )
    a = ap.parse_args()
    if a.file:
        try:
            with open(a.file, encoding="utf-8") as fh:
                text = fh.read()
        except OSError as e:
            ap.error(f"cannot read --file: {e}")
    elif a.text:
        text = a.text
    elif not sys.stdin.isatty():
        text = sys.stdin.read()
    else:
        ap.error("give the text, --file, or pipe text on stdin")
    es, idx = get_client(), a.index or index_name()
    if not es.indices.exists(index=idx):
        sys.exit(f"Index '{idx}' not found. Load data first: python load_data.py")
    try:
        res = check(es, idx, text, a.rule, a.n, boilerplate=a.boilerplate)
    except CheckError as e:
        sys.exit(str(e))
    shown_n = "" if a.rule == "any" else f" n={res.n}"
    print(
        f"rule={a.rule}{shown_n}  input fingerprints={res.fingerprints}  matches={len(res.matches)}"
    )
    if not res.fingerprints:
        print("no fingerprints: the text needs at least 8 words in a row")
        return
    for m in res.matches:
        print(
            f"\n== {m.title} [{m.collection}]  score={m.score:.1f}  shared={m.matched}  longest run={m.longest_run} words"
        )
        print("-- input:  ", mark(text, m.input_spans).replace("\n", " ")[:1500])
        for s, e in m.doc_spans[:5]:
            print("-- matched doc passage:", m.doc_text[s:e].replace("\n", " ")[:600])
    if not res.matches:
        print("no match")


if __name__ == "__main__":
    main()
