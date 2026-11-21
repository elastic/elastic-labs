"""Jina embedding service with batching and disk caching.

Uses the Jina v5 API with task-specific LoRA adapters.
The same base model (jina-embeddings-v5-text-small) produces different
embeddings depending on the `task` parameter:
  - "clustering": trained to identify topic/theme (GOR-regularized, isotropic)
  - "retrieval.passage": trained for asymmetric query-document matching

We use the Jina API directly (not EIS) because the Elastic Inference Service
auto-selects adapters and does not expose the `task` parameter, so there is
no way to explicitly request clustering embeddings through ES.
"""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path

import numpy as np
import requests

from app.core.config import settings

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).resolve().parents[2] / "cache" / "embeddings"
EMBEDDING_DIM = 1024

# Valid Jina v5 task types
TASK_CLUSTERING = "clustering"
TASK_RETRIEVAL = "retrieval.passage"


def _cache_key(text: str, task: str) -> str:
    """Deterministic hash for a (text, task) pair."""
    raw = f"{task}:{text}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _cache_dir_for_task(task: str) -> Path:
    safe_name = task.replace(".", "_")
    return CACHE_DIR / safe_name


def _load_cached(
    doc_ids: list[str],
    texts: list[str],
    task: str,
) -> tuple[dict[str, np.ndarray], list[int]]:
    """Return cached embeddings and indices of uncached texts."""
    cache_dir = _cache_dir_for_task(task)
    cached = {}
    uncached_indices = []

    for i, (doc_id, text) in enumerate(zip(doc_ids, texts)):
        key = _cache_key(text, task)
        path = cache_dir / f"{key}.npy"
        if path.exists():
            cached[doc_id] = np.load(path)
        else:
            uncached_indices.append(i)

    return cached, uncached_indices


def _save_to_cache(text: str, task: str, embedding: np.ndarray) -> None:
    cache_dir = _cache_dir_for_task(task)
    cache_dir.mkdir(parents=True, exist_ok=True)
    key = _cache_key(text, task)
    np.save(cache_dir / f"{key}.npy", embedding)


def _call_jina_api(texts: list[str], task: str) -> list[list[float]]:
    """Call Jina embedding API for a single batch."""
    if not settings.jina_api_key:
        raise ValueError("JINA_API_KEY is required in .env")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.jina_api_key}",
    }
    payload = {
        "model": "jina-embeddings-v5-text-small",
        "input": texts,
        "task": task,
    }

    resp = requests.post(
        settings.jina_api_url, json=payload, headers=headers, timeout=120
    )
    resp.raise_for_status()

    data = resp.json()["data"]
    data.sort(key=lambda x: x["index"])
    return [item["embedding"] for item in data]


def embed_documents(
    doc_ids: list[str],
    texts: list[str],
    task: str = TASK_CLUSTERING,
    batch_size: int | None = None,
) -> dict[str, np.ndarray]:
    """Embed documents, using cache where possible.

    Args:
        doc_ids: Unique document identifiers (parallel with texts).
        texts: Document texts to embed.
        task: Jina v5 task type. Use TASK_CLUSTERING or TASK_RETRIEVAL.
        batch_size: API batch size. Defaults to config value.

    Returns:
        Dict mapping doc_id -> numpy array of shape (1024,).
    """
    batch_size = batch_size or settings.jina_batch_size

    if len(doc_ids) != len(texts):
        raise ValueError("doc_ids and texts must have the same length")

    cached, uncached_indices = _load_cached(doc_ids, texts, task)
    logger.info(
        "Embedding cache: %d cached, %d to embed (task=%s)",
        len(cached),
        len(uncached_indices),
        task,
    )

    if not uncached_indices:
        return cached

    results = dict(cached)
    for batch_start in range(0, len(uncached_indices), batch_size):
        batch_indices = uncached_indices[batch_start : batch_start + batch_size]
        batch_texts = [texts[i] for i in batch_indices]
        batch_doc_ids = [doc_ids[i] for i in batch_indices]

        logger.info(
            "Embedding batch %d-%d of %d uncached (task=%s)",
            batch_start,
            batch_start + len(batch_indices),
            len(uncached_indices),
            task,
        )

        embeddings = _call_jina_api(batch_texts, task)

        for doc_id, text, emb in zip(batch_doc_ids, batch_texts, embeddings):
            arr = np.array(emb, dtype=np.float32)
            _save_to_cache(text, task, arr)
            results[doc_id] = arr

    return results


def load_cached_embeddings(
    doc_ids: list[str],
    texts: list[str],
    task: str = TASK_CLUSTERING,
) -> dict[str, np.ndarray]:
    """Load only cached embeddings without calling the API."""
    cached, _ = _load_cached(doc_ids, texts, task)
    return cached
