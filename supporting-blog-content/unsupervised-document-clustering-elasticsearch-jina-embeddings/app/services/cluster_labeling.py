"""Elasticsearch-native cluster labeling with deterministic term cleanup.

This module keeps labeling logic in one place so notebooks and scripts can share:
- significant_text aggregation (ES-native)
- lightweight post-processing for noisy tokens
- deterministic fallback to representative headlines
"""

from __future__ import annotations

import re

from elasticsearch import Elasticsearch


_GENERIC_TERMS = {
    "year",
    "years",
    "time",
    "people",
    "review",
    "just",
    "like",
    "day",
    "days",
    "week",
    "weeks",
    "month",
    "months",
}


def _clean_term(raw: str, blocked_terms: set[str]) -> str | None:
    """Normalize and filter noisy significant_text terms."""
    term = raw.strip().lower()
    if not term:
        return None

    # Drop terms that are mostly numeric, IDs, or punctuation artifacts.
    if re.search(r"\d", term):
        return None

    term = term.replace("\u2019", "'")
    term = re.sub(r"[^a-z'\-\s]", "", term).strip()
    term = re.sub(r"\s+", " ", term)
    if len(term) < 3:
        return None
    if term in blocked_terms:
        return None
    return term


def clean_significant_terms(
    terms: list[str],
    blocked_terms: set[str] | None = None,
    max_terms: int = 5,
) -> list[str]:
    """Return de-noised significant terms, preserving original order."""
    blocked = set(blocked_terms or set())
    blocked.update(_GENERIC_TERMS)

    cleaned: list[str] = []
    seen: set[str] = set()
    for term in terms:
        value = _clean_term(term, blocked)
        if not value or value in seen:
            continue
        seen.add(value)
        cleaned.append(value)
        if len(cleaned) >= max_terms:
            break
    return cleaned


def _fallback_title(title: str, max_len: int = 80) -> str:
    title = re.sub(r"\s+", " ", title or "").strip()
    if len(title) <= max_len:
        return title
    return title[: max_len - 1].rstrip() + "…"


def get_cluster_labels(
    es: Elasticsearch,
    index_name: str,
    index_pattern: str,
    cluster_field: str = "cluster_id",
    shard_size: int = 100,
    sig_size: int = 6,
    use_cleanup: bool = True,
) -> dict[str, str]:
    """Label each cluster using significant_text with deterministic cleanup.

    Returns:
        Mapping of cluster_id -> label text.
    """
    resp = es.search(
        index=index_name,
        size=0,
        aggs={"clusters": {"terms": {"field": cluster_field, "size": 200}}},
    )
    cluster_ids = [
        b["key"]
        for b in resp["aggregations"]["clusters"]["buckets"]
        if b["key"] != "-1"
    ]

    labels: dict[str, str] = {}
    for cid in cluster_ids:
        try:
            cluster_resp = es.search(
                index=index_pattern,
                size=0,
                query={
                    "bool": {
                        "filter": [
                            {"term": {cluster_field: cid}},
                            {"term": {"_index": index_name}},
                        ]
                    }
                },
                aggs={
                    "sample": {
                        "sampler": {"shard_size": shard_size},
                        "aggs": {
                            "sig": {
                                "significant_text": {
                                    "field": "text",
                                    "size": sig_size,
                                    "filter_duplicate_text": True,
                                }
                            }
                        },
                    },
                    "rep_docs": {
                        "top_hits": {
                            "size": 1,
                            "_source": ["title"],
                        }
                    },
                },
            )
        except Exception:
            continue

        raw_terms = [
            b["key"] for b in cluster_resp["aggregations"]["sample"]["sig"]["buckets"]
        ]
        terms = clean_significant_terms(raw_terms) if use_cleanup else raw_terms

        if terms:
            labels[cid] = " | ".join(terms[:3])
            continue

        rep_hits = cluster_resp["aggregations"]["rep_docs"]["hits"]["hits"]
        if rep_hits:
            title = rep_hits[0].get("_source", {}).get("title", "")
            if title:
                labels[cid] = _fallback_title(title)

    return labels
