"""Boilerplate: fingerprints (8-word phrases) shared by many protected documents.

Find them: `body` is an analyzed text field, so it cannot be used in a terms aggregation or ES|QL. Instead:
  1. read the term vectors of a random sample of documents (_mtermvectors) and count phrases seen twice or more;
  2. get exact document counts for the best candidates with ONE `filters` aggregation (term vector doc_freq is
     per shard, so it understates the index-wide count).
Phrases are readable text because they are shingles. A phrase more common than the sample can see may be missed.

Ignore them: the field's search analyzer ends with the stop filter `boilerplate_stop` (mappings/index.json). Its list
is updated in place with PUT <index>/_settings?reopen=true (analysis settings cannot change on an open index; this
closes, updates and reopens it in one call, also on Serverless). The index keeps every phrase, so a query can still
count boilerplate (classification) with the index analyzer.
"""

from collections import Counter


def common_phrases(
    es, index: str, min_docs: int = 5, limit: int = 50, sample: int = 500
) -> list[tuple[str, int]]:
    """Return [(phrase, doc_count)] for phrases in >= min_docs documents, most common first."""
    hits = es.search(
        index=index,
        size=sample,
        _source=False,
        query={
            "function_score": {
                "query": {"match_all": {}},
                "random_score": {"seed": 7, "field": "_seq_no"},
            }
        },
    )
    ids = [h["_id"] for h in hits["hits"]["hits"]]
    seen: Counter = Counter()
    for i in range(0, len(ids), 50):
        resp = es.mtermvectors(
            index=index,
            ids=ids[i : i + 50],
            fields=["body"],
            positions=False,
            offsets=False,
            payloads=False,
            field_statistics=False,
            term_statistics=False,
        )
        for doc in resp["docs"]:
            seen.update(
                doc.get("term_vectors", {}).get("body", {}).get("terms", {}).keys()
            )
    cands = [t for t, c in seen.most_common(max(3 * limit, 100)) if c >= 2]
    if not cands:
        return []
    aggs = {"f": {"filters": {"filters": {t: {"term": {"body": t}} for t in cands}}}}
    buckets = es.search(index=index, size=0, aggs=aggs)["aggregations"]["f"]["buckets"]
    counts = sorted(
        ((t, b["doc_count"]) for t, b in buckets.items() if b["doc_count"] >= min_docs),
        key=lambda x: -x[1],
    )
    return counts[:limit]


STOP_FILTER = "boilerplate_stop"


def _stop_filter(es, index: str) -> dict | None:
    settings = next(iter(es.indices.get_settings(index=index).values()))["settings"]
    return settings["index"].get("analysis", {}).get("filter", {}).get(STOP_FILTER)


def stop_words(es, index: str) -> set[str]:
    """The boilerplate phrases currently dropped by the search analyzer."""
    words = (_stop_filter(es, index) or {}).get("stopwords", [])
    return set(words) if isinstance(words, list) else set()  # "_none_" -> empty


def set_stop_words(es, index: str, phrases: set[str]) -> None:
    """Replace the stop list (empty = none). Reopens the index: searches pause briefly (on Serverless they can
    fail for some seconds). Only an existing filter can be changed: ?reopen=true acknowledges but ignores new
    analysis components, so the filter must come from mappings/index.json when the index is created.
    """
    if _stop_filter(es, index) is None:
        raise ValueError(
            f"Index '{index}' has no '{STOP_FILTER}' filter. Recreate it with the current mapping: "
            "python load_data.py --recreate"
        )
    es.indices.put_settings(
        index=index,
        reopen=True,
        settings={
            "analysis": {
                "filter": {
                    STOP_FILTER: {
                        "type": "stop",
                        "stopwords": sorted(phrases) or "_none_",
                    }
                }
            }
        },
    )
    if stop_words(es, index) != set(phrases):
        raise RuntimeError(f"The stop list of '{index}' was not updated.")
