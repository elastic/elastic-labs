"""Cluster breadth exploration using the Elasticsearch diversify retriever.

Provides functions for querying diverse representative documents from within
a cluster via MMR (maximal marginal relevance), along with plain kNN for
baseline comparison and utility helpers for centroid computation and
result-set diversity measurement.
"""

from __future__ import annotations

import numpy as np
from elasticsearch import Elasticsearch


def compute_cluster_centroid(
    doc_ids: list[str],
    embeddings: dict[str, np.ndarray],
) -> np.ndarray | None:
    """Compute the L2-normalized mean embedding vector for a set of documents.

    Args:
        doc_ids: Document IDs whose embeddings should be averaged.
        embeddings: Mapping of doc_id -> embedding vector (numpy array).

    Returns:
        Unit-length centroid vector, or ``None`` if no matching embeddings
        were found.
    """
    vecs = [embeddings[did] for did in doc_ids if did in embeddings]
    if not vecs:
        return None
    centroid = np.mean(vecs, axis=0)
    norm = np.linalg.norm(centroid)
    if norm == 0:
        return None
    centroid = centroid / norm
    return centroid


def query_cluster_breadth(
    es: Elasticsearch,
    index_name: str,
    cluster_id: str,
    centroid: np.ndarray,
    *,
    size: int = 8,
    lambda_param: float = 0.5,
    rank_window_size: int = 100,
) -> list[dict]:
    """Retrieve diverse documents from a cluster using the diversify retriever.

    Uses the MMR (maximal marginal relevance) variant of the Elasticsearch
    diversify retriever.  An inner kNN retriever filtered to ``cluster_id``
    fetches candidates, and the MMR layer re-ranks them to balance relevance
    to the centroid against inter-result diversity.

    Args:
        es: Elasticsearch client instance.
        index_name: Index to search.
        cluster_id: Cluster to restrict results to.
        centroid: Query vector (typically the cluster centroid).
        size: Number of documents to return.
        lambda_param: MMR trade-off (0 = max diversity, 1 = max relevance).
        rank_window_size: Number of kNN candidates fed into MMR re-ranking.

    Returns:
        List of dicts, each containing ``doc_id``, ``score``, and ``text``.
    """
    query_vec = centroid.tolist()
    resp = es.search(
        index=index_name,
        body={
            "retriever": {
                "diversify": {
                    "type": "mmr",
                    "field": "embedding",
                    "lambda": lambda_param,
                    "rank_window_size": rank_window_size,
                    "query_vector": query_vec,
                    "retriever": {
                        "knn": {
                            "field": "embedding",
                            "query_vector": query_vec,
                            "k": rank_window_size,
                            "num_candidates": rank_window_size,
                            "filter": {
                                "term": {"cluster_id": cluster_id},
                            },
                        },
                    },
                },
            },
            "size": size,
            "_source": ["text", "cluster_id"],
        },
    )
    return [
        {
            "doc_id": h["_id"],
            "score": h["_score"],
            "text": h["_source"].get("text", ""),
        }
        for h in resp["hits"]["hits"]
    ]


def query_cluster_knn(
    es: Elasticsearch,
    index_name: str,
    cluster_id: str,
    centroid: np.ndarray,
    *,
    size: int = 8,
    k: int = 100,
) -> list[dict]:
    """Retrieve the most centroid-similar documents from a cluster via plain kNN.

    This serves as a baseline comparison for :func:`query_cluster_breadth`.
    Results are ordered by descending similarity to the centroid, filtered to
    the given cluster.

    Args:
        es: Elasticsearch client instance.
        index_name: Index to search.
        cluster_id: Cluster to restrict results to.
        centroid: Query vector (typically the cluster centroid).
        size: Number of documents to return.
        k: Number of kNN candidates to consider.

    Returns:
        List of dicts, each containing ``doc_id``, ``score``, and ``text``.
    """
    resp = es.search(
        index=index_name,
        body={
            "knn": {
                "field": "embedding",
                "query_vector": centroid.tolist(),
                "k": k,
                "num_candidates": k,
                "filter": {
                    "term": {"cluster_id": cluster_id},
                },
            },
            "size": size,
            "_source": ["text", "cluster_id"],
        },
    )
    return [
        {
            "doc_id": h["_id"],
            "score": h["_score"],
            "text": h["_source"].get("text", ""),
        }
        for h in resp["hits"]["hits"]
    ]


def compute_result_diversity(
    doc_ids: list[str],
    embeddings: dict[str, np.ndarray],
) -> float:
    """Compute average pairwise cosine similarity within a result set.

    A lower value indicates greater diversity among the documents.  This is
    useful for quantitatively comparing result sets from different retrieval
    strategies (e.g. plain kNN vs. MMR diversification).

    Args:
        doc_ids: Document IDs of the result set to measure.
        embeddings: Mapping of doc_id -> embedding vector (numpy array).

    Returns:
        Average pairwise cosine similarity (0.0 -- 1.0 range for normalized
        vectors).  Returns ``0.0`` if fewer than two matching embeddings
        are available.
    """
    vecs = [embeddings[did] for did in doc_ids if did in embeddings]
    if len(vecs) < 2:
        return 0.0
    mat = np.array(vecs)
    sims = mat @ mat.T
    np.fill_diagonal(sims, 0)
    n = len(vecs)
    return float(sims.sum() / (n * (n - 1)))
