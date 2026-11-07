"""Visualization prep helpers for global clustering tutorial sections."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from elasticsearch.helpers import scan
from umap import UMAP


def fetch_docs_for_viz(es, index_name: str) -> pd.DataFrame:
    """Fetch clustered docs from Elasticsearch for downstream plotting."""
    rows: list[dict[str, Any]] = []
    for hit in scan(
        client=es,
        index=index_name,
        query={"query": {"match_all": {}}},
        _source=["text", "cluster_id", "timestamp", "source", "title", "section"],
    ):
        src = hit.get("_source", {})
        timestamp = src.get("timestamp") or ""
        date = str(timestamp)[:10] if timestamp else ""
        rows.append(
            {
                "doc_id": hit["_id"],
                "index": index_name,
                "date": date,
                "text": src.get("text", ""),
                "cluster_id": str(src.get("cluster_id", "-1")),
                "source": src.get("source", ""),
                "title": src.get("title", ""),
                "section": src.get("section", ""),
            }
        )
    return pd.DataFrame(rows)


def attach_labels_and_demote_incoherent(
    df: pd.DataFrame,
    *,
    labels_by_index: dict[str, dict[str, str]],
    index_name: str,
) -> tuple[pd.DataFrame, int]:
    """Attach labels and demote unlabeled non-noise docs to noise."""
    out = df.copy()
    out["is_noise"] = out["cluster_id"] == "-1"
    out["label"] = out.apply(
        lambda r: (
            labels_by_index.get(index_name, {}).get(r["cluster_id"], "noise")
            if r["cluster_id"] != "-1"
            else "noise"
        ),
        axis=1,
    )

    incoherent = out[(out["cluster_id"] != "-1") & (out["label"] == "noise")]
    if len(incoherent) > 0:
        out.loc[incoherent.index, "cluster_id"] = "-1"
        out.loc[incoherent.index, "is_noise"] = True

    return out, int(len(incoherent))


def build_day_summary(df: pd.DataFrame) -> pd.DataFrame:
    """Aggregate clustered vs noise document counts by date."""
    return (
        df.groupby("date")
        .agg(
            total=("doc_id", "count"),
            clustered=("is_noise", lambda x: (~x).sum()),
            noise=("is_noise", "sum"),
        )
        .reset_index()
    )


def build_umap_projection(
    df: pd.DataFrame,
    embeddings: dict[str, np.ndarray],
    *,
    n_neighbors: int = 30,
    min_dist: float = 0.1,
    metric: str = "cosine",
    random_state: int = 42,
) -> pd.DataFrame:
    """Project documents to 2D UMAP coordinates using cached embeddings."""
    has_emb = [did in embeddings for did in df["doc_id"]]
    df_viz = df[has_emb].copy()
    mat = np.array([embeddings[did] for did in df_viz["doc_id"]])

    reducer = UMAP(
        n_components=2,
        n_neighbors=n_neighbors,
        min_dist=min_dist,
        metric=metric,
        random_state=random_state,
        n_jobs=1,  # Explicit for deterministic runs; avoids UMAP n_jobs warning.
    )
    coords = reducer.fit_transform(mat)
    df_viz["umap_x"] = coords[:, 0]
    df_viz["umap_y"] = coords[:, 1]
    df_viz["snippet"] = df_viz["text"].str[:120].str.replace("\n", " ", regex=False)
    return df_viz


def build_scatter_plot_frame(
    df_viz: pd.DataFrame, *, top_n_labels: int = 15
) -> pd.DataFrame:
    """Prepare a plotting frame with grouped color labels for UMAP scatter."""
    out = df_viz.sort_values("is_noise", ascending=False).copy()
    out["display"] = out.apply(
        lambda r: r["label"][:30] if not r["is_noise"] else "noise",
        axis=1,
    )
    top_labels = (
        out[~out["is_noise"]]["label"].value_counts().head(top_n_labels).index.tolist()
    )
    out["color_group"] = out["display"].apply(
        lambda x: x if x in top_labels or x == "noise" else "other clusters"
    )
    return out


def build_source_mix_table(
    df: pd.DataFrame,
    *,
    labels_by_index: dict[str, dict[str, str]],
    top_n: int = 20,
) -> pd.DataFrame:
    """Build top cluster/source mix table for stacked bar plotting."""
    clustered_df = df[~df["is_noise"]].copy()
    clustered_df["label_text"] = clustered_df.apply(
        lambda r: labels_by_index.get(r["index"], {}).get(r["cluster_id"], "?"),
        axis=1,
    )
    source_by_label = (
        clustered_df.groupby(["label_text", "source"])
        .size()
        .unstack(fill_value=0)
        .reset_index()
    )
    source_by_label["total"] = source_by_label.drop(columns="label_text").sum(axis=1)
    return source_by_label.nlargest(top_n, "total")
