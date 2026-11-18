"""Create the index and load protected documents.

python load_data.py                      # 2,000 BigPatent patents + 8 phishing templates
python load_data.py --patents 500        # fewer patents
python load_data.py --from-folder DIR    # your own .txt / .md files instead
python load_data.py --recreate           # replace an existing index of the same name
"""

import argparse
import json
import re
from pathlib import Path

import pyarrow.parquet as pq
from elasticsearch import helpers

from es import HERE, create_index, get_client, index_name

MAX_WORDS, MIN_WORDS = 2000, 300  # patents are cut to 2,000 words
CJK = re.compile(r"[\u3040-\u30ff\u3400-\u9fff]")
MAX_TOKENS = 9000  # own files: cut to 9,000 tokens, so a whole file can also be checked (_analyze takes 10,000)
HF_REPO = "NortheasternUniversity/big_patent"
SHARDS = ["a/validation-00000-of-00001.parquet", "a/train-00000-of-00012.parquet"]


def patent_docs(n: int):
    """Yield n patents from BigPatent (config a), one parquet shard at a time (validation split first)."""
    from huggingface_hub import hf_hub_download

    got = 0
    for shard in SHARDS:
        path = hf_hub_download(HF_REPO, shard, repo_type="dataset")
        for i, batch in enumerate(
            pq.ParquetFile(path).iter_batches(batch_size=256, columns=["description"])
        ):
            for j, desc in enumerate(batch.column(0).to_pylist()):
                words = re.sub(r"\s+", " ", desc or "").split()
                if len(words) < MIN_WORDS:
                    continue
                got += 1
                yield {
                    "title": f"Patent {got:05d}",
                    "source": "BigPatent (CC BY 4.0)",
                    "collection": "patents",
                    "body": " ".join(words[:MAX_WORDS]),
                }
                if got >= n:
                    return
    print(f"only {got} patents were available")


def phishing_docs():
    for t in json.loads((HERE / "data/phishing_templates.json").read_text()):
        yield {**t, "source": "synthetic", "collection": "phishing"}


def cut_tokens(text: str, max_tokens: int = MAX_TOKENS) -> str:
    """Keep whole words while the text has at most max_tokens tokens. Tokens are estimated like the standard
    tokenizer: hyphens and punctuation split words, and each Chinese/Japanese character is a token.
    """
    out, count = [], 0
    for w in text.split():
        count += max(1, len(re.findall(r"\w+", w)), len(CJK.findall(w)))
        if count > max_tokens:
            break
        out.append(w)
    return " ".join(out)


def folder_docs(folder: Path):
    for p in sorted(folder.rglob("*")):
        if p.suffix.lower() in (".txt", ".md") and p.is_file():
            body = cut_tokens(p.read_text(encoding="utf-8", errors="replace"))
            if len(body.split()) < 8:
                print(f"  skipped {p.name}: fewer than 8 words")
                continue
            yield {
                "title": p.name,
                "source": str(p),
                "collection": "own",
                "body": body,
            }


def bulk_load(es, name: str, docs) -> int:
    count = 0

    def actions():
        for d in docs:
            yield {"_index": name, "_source": d}

    for ok, _ in helpers.streaming_bulk(
        es, actions(), chunk_size=200, raise_on_error=True
    ):
        count += ok
        if count % 200 == 0:
            print(f"  indexed {count}", flush=True)
    if count % 200:
        print(f"  indexed {count}", flush=True)
    es.indices.refresh(index=name)
    return count


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--patents", type=int, default=2000)
    ap.add_argument("--from-folder", type=Path)
    ap.add_argument(
        "--index", default=None, help="index name (default: INDEX_NAME in .env)"
    )
    ap.add_argument(
        "--recreate", action="store_true", help="delete and rebuild an existing index"
    )
    a = ap.parse_args()
    es, name = get_client(), a.index or index_name()
    create_index(es, name, a.recreate)
    if a.from_folder:
        docs = folder_docs(a.from_folder)
    else:
        from itertools import chain

        docs = chain(patent_docs(a.patents), phishing_docs())
    n = bulk_load(es, name, docs)
    print(f"loaded {n} documents into '{name}'")


if __name__ == "__main__":
    main()
