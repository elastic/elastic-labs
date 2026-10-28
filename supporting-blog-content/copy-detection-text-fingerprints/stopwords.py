"""Manage the boilerplate stop words of the search analyzer.

python stopwords.py --show                  # current stop words
python stopwords.py --find 5                # common phrases in >= 5 documents (nothing changes)
python stopwords.py --apply 5               # add them to the stop words (reopens the index; --clear to start over)
python stopwords.py --clear                 # remove all stop words (reopens the index)
"""

import argparse


def min_docs(value: str) -> int:
    n = int(value)
    if n < 1:
        raise argparse.ArgumentTypeError("MIN_DOCS must be at least 1")
    return n


from boilerplate import common_phrases, set_stop_words, stop_words
from es import get_client, index_name


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--show", action="store_true")
    g.add_argument("--find", type=min_docs, metavar="MIN_DOCS")
    g.add_argument("--apply", type=min_docs, metavar="MIN_DOCS")
    g.add_argument("--clear", action="store_true")
    ap.add_argument("--limit", type=int, default=200, help="max phrases to find")
    ap.add_argument("--index", help="index name (default: INDEX_NAME in .env)")
    a = ap.parse_args()
    es, idx = get_client(), a.index or index_name()
    current = stop_words(es, idx)
    if a.show:
        print(f"{len(current)} stop words")
        for p in sorted(current):
            print(" ", p)
    elif a.clear:
        set_stop_words(es, idx, set())
        print("stop words cleared")
    else:
        rows = common_phrases(es, idx, a.find or a.apply, a.limit)
        for p, d in rows:
            print(f"{d:6d}  {p}")
        if a.apply is not None:
            set_stop_words(es, idx, current | {p for p, _ in rows})
            print(f"{len(current | {p for p, _ in rows})} stop words applied")


if __name__ == "__main__":
    main()
