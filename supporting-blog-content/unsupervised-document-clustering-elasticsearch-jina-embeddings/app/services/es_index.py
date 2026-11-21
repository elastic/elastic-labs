"""Elasticsearch index management and bulk operations.

Supports two patterns:
  - Single index: all docs in one index (simple experiments)
  - Daily indices: docs-YYYY.MM.DD per day (temporal clustering, scale)

Daily indices give natural temporal partitioning for clustering each day
independently, then linking clusters across days via cross-index kNN.

On self-managed/Cloud: use 1 shard per daily index + force merge for
optimal kNN performance. On serverless: these are managed automatically.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Iterator

import numpy as np
import pandas as pd
from elasticsearch import Elasticsearch
from elasticsearch.helpers import bulk

from app.services.elasticsearch_client import get_elasticsearch_client

logger = logging.getLogger(__name__)

TEMPLATES_DIR = Path(__file__).resolve().parents[2] / "elastic" / "templates"


def _load_mapping(template: str = "index_mapping_bbq.json") -> dict:
    path = TEMPLATES_DIR / template
    with open(path) as f:
        return json.load(f)


def create_index(index_name: str, es: Elasticsearch | None = None) -> None:
    """Create an index with BBQ-enabled dense_vector mapping."""
    es = es or get_elasticsearch_client()
    mapping = _load_mapping()

    if es.indices.exists(index=index_name):
        logger.info("Index %s already exists, skipping creation", index_name)
        return

    es.indices.create(index=index_name, body=mapping)
    logger.info("Created index %s with BBQ mapping", index_name)


def delete_index(index_name: str, es: Elasticsearch | None = None) -> None:
    """Delete an index if it exists."""
    es = es or get_elasticsearch_client()
    if es.indices.exists(index=index_name):
        es.indices.delete(index=index_name)
        logger.info("Deleted index %s", index_name)


def delete_indices_by_pattern(pattern: str, es: Elasticsearch | None = None) -> None:
    """Delete all indices matching a pattern (e.g., 'docs-clustering-*').

    Resolves the wildcard to concrete index names first, which works
    on serverless where wildcard deletes are blocked.
    """
    es = es or get_elasticsearch_client()
    try:
        resolved = es.indices.get(index=pattern, features="settings")
        index_names = list(resolved.body.keys())
    except Exception:
        index_names = []

    for name in index_names:
        es.indices.delete(index=name)
    if index_names:
        logger.info("Deleted %d indices matching %s", len(index_names), pattern)


def _bulk_actions(
    index_name: str,
    doc_ids: list[str],
    texts: list[str],
    timestamps: list[str | None],
    embeddings: dict[str, np.ndarray],
    extra_fields: dict[str, list] | None = None,
) -> Iterator[dict]:
    """Yield bulk index actions.

    Args:
        extra_fields: Optional dict mapping field name -> list of values
            (parallel with doc_ids). E.g. {"source": [...], "title": [...]}.
    """
    extra_fields = extra_fields or {}
    for i, (doc_id, text, ts) in enumerate(zip(doc_ids, texts, timestamps)):
        if doc_id not in embeddings:
            logger.warning("No embedding for %s, skipping", doc_id)
            continue

        doc = {
            "_index": index_name,
            "_id": doc_id,
            "doc_id": doc_id,
            "text": text,
            "embedding": embeddings[doc_id].tolist(),
        }
        if ts:
            doc["timestamp"] = ts

        for field_name, values in extra_fields.items():
            val = values[i]
            if val is not None and val != "":
                doc[field_name] = val

        yield doc


def bulk_index(
    index_name: str,
    doc_ids: list[str],
    texts: list[str],
    timestamps: list[str | None],
    embeddings: dict[str, np.ndarray],
    es: Elasticsearch | None = None,
    chunk_size: int = 200,
    extra_fields: dict[str, list] | None = None,
) -> int:
    """Bulk index documents with embeddings into a single index.

    Returns the number of successfully indexed documents.
    """
    es = es or get_elasticsearch_client()
    actions = _bulk_actions(
        index_name, doc_ids, texts, timestamps, embeddings, extra_fields
    )

    success, errors = bulk(es, actions, chunk_size=chunk_size, raise_on_error=False)
    if errors:
        logger.error("Bulk indexing errors: %d", len(errors))
        for err in errors[:5]:
            logger.error("  %s", err)

    logger.info("Bulk indexed %d documents into %s", success, index_name)
    return success


def bulk_index_daily(
    prefix: str,
    df: pd.DataFrame,
    embeddings: dict[str, np.ndarray],
    es: Elasticsearch | None = None,
    chunk_size: int = 200,
) -> dict[str, int]:
    """Index documents into daily indices (prefix-YYYY.MM.DD).

    Args:
        prefix: Index name prefix (e.g., "docs-clustering")
        df: DataFrame with columns: doc_id, text, timestamp
        embeddings: Dict mapping doc_id -> numpy embedding
        es: Optional ES client
        chunk_size: Bulk batch size

    Returns:
        Dict mapping index_name -> doc count
    """
    es = es or get_elasticsearch_client()
    mapping = _load_mapping()

    # Strip trailing Z from ISO timestamps to avoid mixed tz-aware/naive parsing issues
    ts_clean = df["timestamp"].str.rstrip("Z")
    df["_date"] = pd.to_datetime(ts_clean, errors="coerce").dt.strftime("%Y.%m.%d")
    daily_groups = df.groupby("_date")

    index_counts = {}
    for date_str, group in daily_groups:
        index_name = f"{prefix}-{date_str}"

        if not es.indices.exists(index=index_name):
            es.indices.create(index=index_name, body=mapping)
            logger.info("Created daily index %s", index_name)

        doc_ids = group["doc_id"].tolist()
        texts = group["text"].tolist()
        timestamps = group["timestamp"].tolist()

        # Pass through any extra columns (source, title, section, etc.)
        extra_cols = [
            c
            for c in group.columns
            if c not in ("doc_id", "text", "timestamp", "_date")
        ]
        extra_fields = {col: group[col].tolist() for col in extra_cols}

        actions = _bulk_actions(
            index_name, doc_ids, texts, timestamps, embeddings, extra_fields
        )
        success, errors = bulk(es, actions, chunk_size=chunk_size, raise_on_error=False)

        if errors:
            logger.error("Errors in %s: %d", index_name, len(errors))

        index_counts[index_name] = success

    total = sum(index_counts.values())
    logger.info(
        "Indexed %d docs across %d daily indices (prefix=%s)",
        total,
        len(index_counts),
        prefix,
    )
    return index_counts


def force_merge_indices(pattern: str, es: Elasticsearch | None = None) -> None:
    """Force merge indices to 1 segment each for optimal kNN.

    Only works on self-managed / Elastic Cloud (not serverless).
    """
    es = es or get_elasticsearch_client()
    try:
        es.indices.forcemerge(index=pattern, max_num_segments=1)
        logger.info("Force merged %s to 1 segment", pattern)
    except Exception as e:
        logger.warning("Force merge not available (serverless?): %s", e)


def list_daily_indices(prefix: str, es: Elasticsearch | None = None) -> list[str]:
    """List all daily indices for a prefix, sorted by date.

    Excludes non-date indices like ``{prefix}-all``.
    """
    es = es or get_elasticsearch_client()
    resp = es.indices.get(index=f"{prefix}-*", features="settings")
    import re

    date_pattern = re.compile(rf"^{re.escape(prefix)}-\d{{4}}\.\d{{2}}\.\d{{2}}$")
    return sorted(k for k in resp.body.keys() if date_pattern.match(k))
