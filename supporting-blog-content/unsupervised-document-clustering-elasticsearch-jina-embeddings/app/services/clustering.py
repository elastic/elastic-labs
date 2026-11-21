"""Clustering services: density-probed centroid classification, bulk update, and temporal linkage.

Primary algorithm: cluster_index_density_centroid (density-probed seed selection
+ centroid classification via msearch kNN).

Legacy algorithms cluster_index_sampled_knn_diversified and cluster_daily_index
are retained for backwards compatibility but marked deprecated.
"""

from __future__ import annotations

import logging
import math
from collections import defaultdict

import numpy as np
from elasticsearch.helpers import bulk
from elasticsearch.helpers import scan

logger = logging.getLogger(__name__)


def _fetch_index_doc_ids(es, index_name: str) -> list[str]:
    """Return all document IDs for an index using scan."""
    ids: list[str] = []
    for hit in scan(
        client=es,
        index=index_name,
        query={"query": {"match_all": {}}},
        _source=False,
    ):
        ids.append(hit["_id"])
    return ids


# ---------------------------------------------------------------------------
# Density-probed centroid classification (primary algorithm)
# ---------------------------------------------------------------------------


def density_probe_msearch(
    es,
    index_name: str,
    probe_ids: list[str],
    embeddings: dict[str, np.ndarray],
    k: int = 50,
    batch_size: int = 50,
) -> dict[str, float]:
    """Estimate local density for probe docs via batched msearch kNN.

    Each probe fires a kNN query with oversampling factor = 1 (num_candidates == k)
    and records the mean similarity score of its neighbours. Higher mean similarity
    indicates the probe sits in a dense region of the embedding space.

    Returns:
        {doc_id: mean_similarity_score} for every probe.
    """
    density_scores: dict[str, float] = {}

    for batch_start in range(0, len(probe_ids), batch_size):
        batch = probe_ids[batch_start : batch_start + batch_size]
        body_lines: list[dict] = []

        for doc_id in batch:
            body_lines.append({"index": index_name})
            body_lines.append(
                {
                    "size": k,
                    "knn": {
                        "field": "embedding",
                        "query_vector": embeddings[doc_id].tolist(),
                        "k": k,
                        "num_candidates": k,
                    },
                    "_source": False,
                }
            )

        resp = es.msearch(body=body_lines)

        for i, result in enumerate(resp["responses"]):
            doc_id = batch[i]
            hits = result.get("hits", {}).get("hits", [])
            if not hits:
                density_scores[doc_id] = 0.0
                continue
            sims = [h["_score"] for h in hits if h["_id"] != doc_id]
            density_scores[doc_id] = float(np.mean(sims)) if sims else 0.0

    return density_scores


def select_seeds_density_diversified(
    density_scores: dict[str, float],
    embeddings: dict[str, np.ndarray],
    min_density: float = 0.0,
    max_seeds: int = 500,
    min_seed_separation: float = 0.85,
) -> list[str]:
    """Pick seeds from high-density probes, diversified so centroids don't overlap.

    Candidates above *min_density* are sorted by density descending. Seeds are
    greedily selected: a candidate is accepted only when its cosine similarity to
    every existing seed is below *min_seed_separation*.

    This is pure client-side computation (no ES calls).
    """
    candidates = [
        (did, score)
        for did, score in density_scores.items()
        if score > min_density and did in embeddings
    ]
    candidates.sort(key=lambda x: x[1], reverse=True)

    seeds: list[str] = []
    seed_vecs: list[np.ndarray] = []

    for did, _score in candidates:
        if len(seeds) >= max_seeds:
            break
        vec = embeddings[did]
        if seed_vecs:
            sims = np.array([vec @ sv for sv in seed_vecs])
            if float(sims.max()) > min_seed_separation:
                continue
        seeds.append(did)
        seed_vecs.append(vec)

    return seeds


def classify_docs_against_centroids(
    es,
    index_name: str,
    seeds: list[str],
    embeddings: dict[str, np.ndarray],
    all_doc_ids: list[str],
    *,
    similarity_threshold: float = 0.50,
    k: int = 200,
    min_cluster_size: int = 6,
    batch_size: int = 20,
) -> dict[str, int]:
    """Classify all docs by searching from each centroid/seed via msearch kNN.

    For each seed (acting as a centroid), a kNN search retrieves up to *k* docs
    above *similarity_threshold*. Each doc is then assigned to the centroid that
    returned it with the highest score. Clusters that end up smaller than
    *min_cluster_size* are dissolved to noise (-1).

    Returns:
        {doc_id: cluster_id} where -1 means noise.
    """
    centroid_hits: dict[int, dict[str, float]] = {}

    for batch_start in range(0, len(seeds), batch_size):
        batch_seeds = seeds[batch_start : batch_start + batch_size]
        body_lines: list[dict] = []

        for seed_id in batch_seeds:
            body_lines.append({"index": index_name})
            body_lines.append(
                {
                    "size": k,
                    "knn": {
                        "field": "embedding",
                        "query_vector": embeddings[seed_id].tolist(),
                        "k": k,
                        "num_candidates": k,
                        "similarity": similarity_threshold,
                    },
                    "_source": False,
                }
            )

        resp = es.msearch(body=body_lines)

        for i, result in enumerate(resp["responses"]):
            cluster_id = batch_start + i
            hits = result.get("hits", {}).get("hits", [])
            centroid_hits[cluster_id] = {h["_id"]: h["_score"] for h in hits}

    # Assign each doc to its best (highest-scoring) centroid.
    doc_best: dict[str, tuple[int, float]] = {}
    for cluster_id, hits in centroid_hits.items():
        for doc_id, score in hits.items():
            if doc_id not in doc_best or score > doc_best[doc_id][1]:
                doc_best[doc_id] = (cluster_id, score)

    assigned: dict[str, int] = {}
    cluster_members: dict[int, list[str]] = defaultdict(list)

    for doc_id in all_doc_ids:
        if doc_id in doc_best:
            cid, _score = doc_best[doc_id]
            assigned[doc_id] = cid
            cluster_members[cid].append(doc_id)
        else:
            assigned[doc_id] = -1

    # Dissolve clusters below min_cluster_size.
    for cid, members in list(cluster_members.items()):
        if len(members) < min_cluster_size:
            for did in members:
                assigned[did] = -1

    return assigned


def cluster_index_density_centroid(
    es,
    index_name: str,
    embeddings: dict[str, np.ndarray],
    *,
    sample_fraction: float = 0.05,
    k_probe: int = 50,
    max_seeds: int = 500,
    min_seed_separation: float = 0.85,
    similarity_threshold: float = 0.50,
    k_classify: int = 200,
    min_cluster_size: int = 6,
) -> dict[str, int]:
    """Cluster an index using density-probed seed selection + centroid classification.

    Pipeline:
      1. Fetch all doc IDs from the index.
      2. Sample *sample_fraction* of docs as density probes (minimum 50).
      3. Run batched msearch kNN probes to estimate local density.
      4. Select well-separated, high-density seeds as cluster centroids.
      5. Classify every doc against centroids via msearch kNN.

    Works for both large indices (8k+ docs) and small daily indices (~300 docs)
    thanks to the min-50 probe floor.

    Returns:
        {doc_id: cluster_id} where -1 means noise.
    """
    doc_ids = _fetch_index_doc_ids(es, index_name)
    if not doc_ids:
        return {}
    if len(doc_ids) < min_cluster_size:
        return {did: -1 for did in doc_ids}

    available = [did for did in doc_ids if did in embeddings]
    missing = set(doc_ids) - set(available)

    if len(available) < min_cluster_size:
        return {did: -1 for did in doc_ids}

    # Step 1: Sample probes (min 50 floor for small indices).
    rng = np.random.default_rng(42)
    n_probes = max(math.ceil(len(available) * sample_fraction), 50)
    n_probes = min(n_probes, len(available))
    probe_ids = rng.choice(available, size=n_probes, replace=False).tolist()
    logger.debug(
        "%s: sampled %d probes (%.0f%% of %d available)",
        index_name,
        len(probe_ids),
        sample_fraction * 100,
        len(available),
    )

    # Step 2: Density probing via msearch.
    density_scores = density_probe_msearch(
        es,
        index_name,
        probe_ids,
        embeddings,
        k=k_probe,
    )
    scores = list(density_scores.values())
    median_density = float(np.median(scores)) if scores else 0.0

    # Step 3: Select diverse, high-density seeds.
    seeds = select_seeds_density_diversified(
        density_scores,
        embeddings,
        min_density=median_density,
        max_seeds=max_seeds,
        min_seed_separation=min_seed_separation,
    )
    logger.debug("%s: selected %d seeds", index_name, len(seeds))

    if not seeds:
        return {did: -1 for did in doc_ids}

    # Step 4: Classify all docs against centroids.
    assigned = classify_docs_against_centroids(
        es,
        index_name,
        seeds,
        embeddings,
        doc_ids,
        similarity_threshold=similarity_threshold,
        k=k_classify,
        min_cluster_size=min_cluster_size,
    )

    # Ensure missing-embedding docs are noise.
    for did in missing:
        assigned.setdefault(did, -1)

    return assigned


# ---------------------------------------------------------------------------
# Legacy clustering algorithms (deprecated — kept for backwards compatibility)
# ---------------------------------------------------------------------------


def cluster_index_sampled_knn_diversified(
    es,
    index_name: str,
    embeddings: dict[str, np.ndarray],
    *,
    k: int = 40,
    num_candidates: int = 120,
    similarity_threshold: float = 0.5,
    min_cluster_size: int = 6,
    min_coherence: float = 0.62,
    seed_pool_size: int = 64,
    max_neighbor_similarity: float = 0.97,
) -> dict[str, int]:
    """Cluster an index using sampled seed selection + diversified kNN expansion.

    .. deprecated::
        Use :func:`cluster_index_density_centroid` instead. This function is
        retained for backwards compatibility with existing notebooks and
        experiment scripts.

    The procedure is:
      1) Sample a pool of unassigned docs and pick a *diverse* seed (furthest from
         existing cluster centroids).
      2) Run kNN for the seed and keep only unassigned hits.
      3) Diversify neighborhood members to reduce near-duplicate docs.
      4) Validate cluster coherence against the cluster centroid.
    """
    doc_ids = _fetch_index_doc_ids(es, index_name)
    if not doc_ids:
        return {}
    if len(doc_ids) < min_cluster_size:
        return {did: -1 for did in doc_ids}

    available_ids = [did for did in doc_ids if did in embeddings]
    missing_ids = set(doc_ids) - set(available_ids)

    if len(available_ids) < min_cluster_size:
        assigned = {did: -1 for did in doc_ids}
        return assigned

    rng = np.random.default_rng(42)
    unassigned = set(available_ids)
    assigned: dict[str, int] = {did: -1 for did in missing_ids}
    cluster_id = 0
    centroid_matrix = np.empty((0, embeddings[available_ids[0]].shape[0]))

    while unassigned:
        # Sample candidate seeds and choose the one most dissimilar to prior centroids.
        pool_n = min(seed_pool_size, len(unassigned))
        pool_ids = rng.choice(list(unassigned), size=pool_n, replace=False).tolist()
        if centroid_matrix.shape[0] == 0:
            seed_id = pool_ids[0]
        else:
            pool_vecs = np.array([embeddings[did] for did in pool_ids])
            max_sims = (pool_vecs @ centroid_matrix.T).max(axis=1)
            seed_id = pool_ids[int(np.argmin(max_sims))]

        seed_vec = embeddings[seed_id].tolist()
        overfetch = min(max(k * 3, k), len(doc_ids))

        resp = es.search(
            index=index_name,
            knn={
                "field": "embedding",
                "query_vector": seed_vec,
                "k": min(overfetch, len(doc_ids)),
                "num_candidates": min(max(num_candidates, overfetch), len(doc_ids)),
                "similarity": similarity_threshold,
            },
            size=min(overfetch, len(doc_ids)),
            _source=False,
        )

        raw_neighbors = [
            h["_id"] for h in resp["hits"]["hits"] if h["_id"] in unassigned
        ]
        if len(raw_neighbors) < min_cluster_size:
            assigned[seed_id] = -1
            unassigned.discard(seed_id)
            continue

        # Diversify neighbors: greedily skip near-duplicates inside the candidate set.
        diversified: list[str] = []
        selected_vecs: list[np.ndarray] = []
        for nid in raw_neighbors:
            nvec = embeddings[nid]
            if selected_vecs:
                sims = np.array([nvec @ sv for sv in selected_vecs])
                if float(sims.max()) > max_neighbor_similarity:
                    continue
            diversified.append(nid)
            selected_vecs.append(nvec)
            if len(diversified) >= k:
                break

        if len(diversified) < min_cluster_size:
            assigned[seed_id] = -1
            unassigned.discard(seed_id)
            continue

        vecs = np.array([embeddings[nid] for nid in diversified])
        centroid = vecs.mean(axis=0)
        c_norm = np.linalg.norm(centroid)
        if c_norm > 0:
            centroid /= c_norm

        sims_to_centroid = vecs @ centroid
        coherent = [
            nid
            for nid, sim in zip(diversified, sims_to_centroid)
            if sim >= min_coherence
        ]

        if len(coherent) < min_cluster_size:
            assigned[seed_id] = -1
            unassigned.discard(seed_id)
            continue

        for nid in coherent:
            assigned[nid] = cluster_id
            unassigned.discard(nid)

        cluster_vecs = np.array([embeddings[nid] for nid in coherent])
        cluster_centroid = cluster_vecs.mean(axis=0)
        cc_norm = np.linalg.norm(cluster_centroid)
        if cc_norm > 0:
            cluster_centroid /= cc_norm
        centroid_matrix = np.vstack([centroid_matrix, cluster_centroid])

        cluster_id += 1

    # Any IDs we did not touch become noise.
    for did in doc_ids:
        assigned.setdefault(did, -1)

    return assigned


def cluster_daily_index(
    es,
    index_name: str,
    embeddings: dict[str, np.ndarray],
    k: int = 30,
    similarity_threshold: float = 0.55,
    min_cluster_size: int = 5,
    min_coherence: float = 0.65,
) -> dict[str, int]:
    """Cluster docs in a single daily index using seed-and-expand kNN.

    .. deprecated::
        Use :func:`cluster_index_density_centroid` instead. This function is
        retained for backwards compatibility with existing experiment scripts.

    Two-phase approach:
      1. Seed-and-expand with inline centroid validation (trim incoherent members)
      2. Post-hoc refinement pass (reassign misplaced docs, demote weak ones)

    Returns dict mapping doc_id -> cluster_id (-1 for noise).
    """
    # Get all doc IDs in this index
    resp = es.search(
        index=index_name,
        size=1000,
        _source=False,
        query={"match_all": {}},
    )
    doc_ids = [hit["_id"] for hit in resp["hits"]["hits"]]

    if len(doc_ids) < min_cluster_size:
        return {did: -1 for did in doc_ids}

    assigned = {}
    cluster_id = 0
    unassigned = set(doc_ids)
    cluster_members = {}  # cluster_id -> list of doc_ids

    # --- Phase 1: Seed-and-expand with inline centroid validation ---

    while unassigned:
        seed_id = next(iter(unassigned))
        if seed_id not in embeddings:
            unassigned.discard(seed_id)
            assigned[seed_id] = -1
            continue

        seed_vec = embeddings[seed_id].tolist()

        # kNN against this day's index only
        body = {
            "knn": {
                "field": "embedding",
                "query_vector": seed_vec,
                "k": min(k, len(unassigned)),
                "num_candidates": min(k * 2, len(unassigned)),
                "similarity": similarity_threshold,
            },
            "size": min(k, len(unassigned)),
            "_source": False,
        }

        # Filter to unassigned docs
        if len(assigned) > 0:
            assigned_ids = list(set(doc_ids) - unassigned)
            if assigned_ids:
                body["knn"]["filter"] = {
                    "bool": {"must_not": [{"ids": {"values": assigned_ids}}]}
                }

        resp = es.search(index=index_name, body=body)
        neighbors = [
            hit["_id"] for hit in resp["hits"]["hits"] if hit["_id"] in unassigned
        ]

        if len(neighbors) < min_cluster_size:
            unassigned.discard(seed_id)
            assigned[seed_id] = -1
            continue

        # Inline centroid validation: trim members too far from centroid
        vecs = np.array([embeddings[nid] for nid in neighbors if nid in embeddings])
        valid_neighbors = [nid for nid in neighbors if nid in embeddings]

        if len(vecs) >= min_cluster_size:
            centroid = vecs.mean(axis=0)
            norm = np.linalg.norm(centroid)
            if norm > 0:
                centroid /= norm

            sims = vecs @ centroid
            coherent = [
                nid for nid, sim in zip(valid_neighbors, sims) if sim >= min_coherence
            ]
        else:
            coherent = []

        if len(coherent) < min_cluster_size:
            # Cluster not coherent enough — mark seed as noise, leave rest unassigned
            unassigned.discard(seed_id)
            assigned[seed_id] = -1
            continue

        for nid in coherent:
            assigned[nid] = cluster_id
            unassigned.discard(nid)

        cluster_members[cluster_id] = coherent
        cluster_id += 1

    # Mark remaining as noise
    for did in unassigned:
        assigned[did] = -1

    # --- Phase 2: Post-hoc refinement ---

    if len(cluster_members) < 2:
        return assigned

    # Compute centroids for all clusters
    centroids = {}
    for cid, members in cluster_members.items():
        vecs = np.array([embeddings[did] for did in members if did in embeddings])
        if len(vecs) == 0:
            continue
        c = vecs.mean(axis=0)
        norm = np.linalg.norm(c)
        if norm > 0:
            c /= norm
        centroids[cid] = c

    if len(centroids) < 2:
        return assigned

    centroid_ids = list(centroids.keys())
    centroid_matrix = np.array([centroids[cid] for cid in centroid_ids])

    reassigned = 0
    demoted = 0

    for doc_id, cid in list(assigned.items()):
        if cid == -1 or doc_id not in embeddings:
            continue

        doc_vec = embeddings[doc_id]
        sims = doc_vec @ centroid_matrix.T  # similarity to all centroids

        own_idx = centroid_ids.index(cid)
        own_sim = sims[own_idx]

        best_idx = int(np.argmax(sims))
        best_cid = centroid_ids[best_idx]
        best_sim = sims[best_idx]

        if best_cid != cid and best_sim > own_sim:
            # Doc is closer to a different cluster — reassign
            cluster_members[cid].remove(doc_id)
            assigned[doc_id] = best_cid
            cluster_members[best_cid].append(doc_id)
            reassigned += 1
        elif own_sim < min_coherence:
            # Doc is below coherence threshold — demote to noise
            cluster_members[cid].remove(doc_id)
            assigned[doc_id] = -1
            demoted += 1

    # Dissolve clusters that shrank below min_cluster_size
    for cid, members in list(cluster_members.items()):
        if len(members) < min_cluster_size:
            for did in members:
                assigned[did] = -1
            del cluster_members[cid]
            demoted += len(members)

    if reassigned > 0 or demoted > 0:
        logger.debug(
            "%s refinement: %d reassigned, %d demoted to noise",
            index_name,
            reassigned,
            demoted,
        )

    return assigned


def update_cluster_ids(es, index_name: str, assignments: dict[str, int]) -> None:
    """Bulk update cluster_id for a daily index."""

    def actions():
        for doc_id, cid in assignments.items():
            yield {
                "_op_type": "update",
                "_index": index_name,
                "_id": doc_id,
                "doc": {"cluster_id": str(cid)},
            }

    bulk(es, actions(), raise_on_error=False)


def link_clusters_across_days(
    es,
    day_a_index: str,
    day_a_clusters: dict[str, list[str]],
    day_b_index: str,
    day_b_clusters: dict[str, list[str]],
    embeddings: dict[str, np.ndarray],
    sample_size: int = 3,
    k: int = 20,
    threshold: float = 0.15,
) -> list[dict]:
    """Link clusters from day A to day B using cross-index kNN.

    For each cluster in day A, sample a few docs and run kNN against day B.
    Count hits per day B cluster. If hit fraction > threshold, record a link.
    """
    links = []
    day_b_doc_to_cluster = {}
    for cid, dids in day_b_clusters.items():
        for did in dids:
            day_b_doc_to_cluster[did] = cid

    for ca_id, ca_doc_ids in day_a_clusters.items():
        sample_ids = ca_doc_ids[:sample_size]
        hit_counts = defaultdict(int)
        total_hits = 0

        for doc_id in sample_ids:
            if doc_id not in embeddings:
                continue
            vec = embeddings[doc_id].tolist()

            resp = es.search(
                index=day_b_index,
                knn={
                    "field": "embedding",
                    "query_vector": vec,
                    "k": k,
                    "num_candidates": k * 2,
                },
                size=k,
                _source=False,
            )

            for hit in resp["hits"]["hits"]:
                total_hits += 1
                target_cluster = day_b_doc_to_cluster.get(hit["_id"])
                if target_cluster is not None:
                    hit_counts[target_cluster] += 1

        # Check for strong links
        for cb_id, count in hit_counts.items():
            fraction = count / total_hits if total_hits > 0 else 0
            if fraction >= threshold:
                links.append(
                    {
                        "source_cluster": ca_id,
                        "target_cluster": cb_id,
                        "source_index": day_a_index,
                        "target_index": day_b_index,
                        "knn_fraction": round(fraction, 3),
                        "hit_count": count,
                        "total_hits": total_hits,
                    }
                )

    return links
