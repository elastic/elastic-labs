"""Helpers for temporal clustering, linking, chain building, and Sankey rendering.

This module keeps long temporal workflow logic out of notebooks so tutorial cells can
stay focused on intent and interpretation.
"""

from __future__ import annotations

import time
from collections import defaultdict
from typing import Any

import pandas as pd
import plotly.graph_objects as go
from elasticsearch.helpers import bulk

from app.services.cluster_labeling import get_cluster_labels
from app.services.clustering import cluster_index_density_centroid
from app.services.clustering import link_clusters_across_days
from app.services.es_index import bulk_index_daily
from app.services.es_index import delete_indices_by_pattern
from app.services.es_index import list_daily_indices


def prepare_daily_results_and_labels(
    es,
    *,
    index_prefix: str,
    df_full: pd.DataFrame,
    embeddings: dict[str, Any],
    year_pattern: str = "2025.*",
    sample_fraction: float = 0.05,
    k_probe: int = 50,
    max_seeds: int = 500,
    min_seed_separation: float = 0.85,
    similarity_threshold: float = 0.50,
    k_classify: int = 200,
    min_cluster_size: int = 6,
) -> tuple[
    list[str], dict[str, dict[str, Any]], dict[str, dict[str, str]], dict[str, int]
]:
    """Build daily indices, cluster each day, and generate labels.

    Returns:
        (indices, daily_results, all_labels, index_counts)
    """
    delete_indices_by_pattern(f"{index_prefix}-{year_pattern}", es)
    index_counts = bulk_index_daily(index_prefix, df_full.copy(), embeddings, es)
    indices = list_daily_indices(index_prefix, es)
    for idx in indices:
        es.indices.refresh(index=idx)

    daily_results: dict[str, dict[str, Any]] = {}
    all_labels: dict[str, dict[str, str]] = {}

    for idx in indices:
        assignments = cluster_index_density_centroid(
            es,
            index_name=idx,
            embeddings=embeddings,
            sample_fraction=sample_fraction,
            k_probe=k_probe,
            max_seeds=max_seeds,
            min_seed_separation=min_seed_separation,
            similarity_threshold=similarity_threshold,
            k_classify=k_classify,
            min_cluster_size=min_cluster_size,
        )

        actions = [
            {
                "_op_type": "update",
                "_index": idx,
                "_id": did,
                "doc": {"cluster_id": str(cid)},
            }
            for did, cid in assignments.items()
        ]
        if actions:
            bulk(es, actions, raise_on_error=False)
        es.indices.refresh(index=idx)

        clusters: dict[str, list[str]] = defaultdict(list)
        for did, cid in assignments.items():
            clusters[str(cid)].append(did)

        daily_results[idx] = {
            "clusters": {key: value for key, value in clusters.items() if key != "-1"},
            "noise": len(clusters.get("-1", [])),
            "total": len(assignments),
        }

        all_labels[idx] = get_cluster_labels(
            es,
            index_name=idx,
            index_pattern=f"{index_prefix}-*",
            cluster_field="cluster_id",
            use_cleanup=True,
        )

    return indices, daily_results, all_labels, index_counts


def build_temporal_links(
    es,
    *,
    indices: list[str],
    daily_results: dict[str, dict[str, Any]],
    all_labels: dict[str, dict[str, str]],
    embeddings: dict[str, Any],
) -> tuple[pd.DataFrame, float]:
    """Link clusters across adjacent days and attach labels."""
    t0 = time.perf_counter()
    all_links: list[dict[str, Any]] = []

    for i in range(len(indices) - 1):
        idx_a, idx_b = indices[i], indices[i + 1]
        clusters_a = daily_results.get(idx_a, {}).get("clusters", {})
        clusters_b = daily_results.get(idx_b, {}).get("clusters", {})
        if not clusters_a or not clusters_b:
            continue

        links = link_clusters_across_days(
            es, idx_a, clusters_a, idx_b, clusters_b, embeddings
        )

        labels_a = all_labels.get(idx_a, {})
        labels_b = all_labels.get(idx_b, {})
        for link in links:
            link["source_label"] = labels_a.get(link["source_cluster"], "?")
            link["target_label"] = labels_b.get(link["target_cluster"], "?")

        all_links.extend(links)

    return pd.DataFrame(all_links), time.perf_counter() - t0


def build_story_chains(
    links_df: pd.DataFrame,
    *,
    min_knn_fraction: float = 0.4,
    min_chain_len: int = 3,
) -> tuple[pd.DataFrame, list[list[tuple[str, str]]]]:
    """Create greedy story chains from strong temporal links."""
    if len(links_df) == 0:
        return pd.DataFrame(), []

    strong_links = links_df[links_df["knn_fraction"] >= min_knn_fraction].copy()
    adjacency: dict[tuple[str, str], list[tuple[str, str, float]]] = defaultdict(list)
    for _, link in strong_links.iterrows():
        key = (link["source_index"], link["source_cluster"])
        val = (
            link["target_index"],
            link["target_cluster"],
            float(link["knn_fraction"]),
        )
        adjacency[key].append(val)

    chains: list[list[tuple[str, str]]] = []
    visited: set[tuple[str, str]] = set()

    for start_key in sorted(adjacency.keys(), key=lambda k: k[0]):
        if start_key in visited:
            continue
        chain = [start_key]
        visited.add(start_key)
        current = start_key
        while current in adjacency:
            best = max(adjacency[current], key=lambda x: x[2])
            next_key = (best[0], best[1])
            if next_key in visited:
                break
            chain.append(next_key)
            visited.add(next_key)
            current = next_key
        if len(chain) >= min_chain_len:
            chains.append(chain)

    chains.sort(key=len, reverse=True)
    return strong_links, chains


def format_top_links(links_df: pd.DataFrame, *, top_n: int = 10) -> list[str]:
    """Return display lines for strongest links."""
    if len(links_df) == 0:
        return []
    lines: list[str] = []
    top = links_df.nlargest(top_n, "knn_fraction")
    for _, row in top.iterrows():
        src_date = row["source_index"].split("-")[-1]
        tgt_date = row["target_index"].split("-")[-1]
        lines.append(
            f"{src_date} '{str(row['source_label'])}' -> {tgt_date} "
            f"'{str(row['target_label'])}'  ({float(row['knn_fraction']):.0%})"
        )
    return lines


def format_chain_summaries(
    chains: list[list[tuple[str, str]]],
    *,
    all_labels: dict[str, dict[str, str]],
    index_prefix: str,
    top_n: int = 8,
) -> list[str]:
    """Return display lines for top chains."""
    import calendar

    lines: list[str] = []
    for i, chain in enumerate(chains[:top_n]):
        dates: list[str] = []
        for idx_name, _ in chain:
            parts = idx_name.replace(f"{index_prefix}-", "").split(".")
            month_abbr = calendar.month_abbr[int(parts[1])] if len(parts) >= 3 else "?"
            dates.append(f"{month_abbr} {int(parts[-1])}")
        start_label = all_labels.get(chain[0][0], {}).get(chain[0][1], "?")
        lines.append(
            f"Chain {i + 1}: '{start_label}' "
            f"({len(chain)} days: {dates[0]} \u2192 {dates[-1]})"
        )
    return lines


def build_story_chain_sankey(
    *,
    chains: list[list[tuple[str, str]]],
    strong_links: pd.DataFrame,
    all_labels: dict[str, dict[str, str]],
    daily_results: dict[str, dict[str, Any]],
    index_prefix: str,
    accent_colors: list[str],
    dark_text: str,
    dark_bg: str,
    max_chains: int = 10,
    min_nodes: int = 3,
) -> go.Figure | None:
    """Build a Sankey figure for temporal chains or return None."""

    def _short_label(text: str, max_len: int = 30) -> str:
        t = " ".join((text or "").split())
        return t if len(t) <= max_len else f"{t[: max_len - 1]}…"

    filtered_chains: list[list[tuple[str, str]]] = []
    for chain in chains[:max_chains]:
        filtered = [(idx, cid) for idx, cid in chain if cid in all_labels.get(idx, {})]
        if len(filtered) >= min_nodes:
            filtered_chains.append(filtered)

    if not filtered_chains:
        return None

    all_dates = sorted(
        {
            idx.replace(f"{index_prefix}-", "")
            for chain in filtered_chains
            for idx, _ in chain
        }
    )
    date_to_x = {d: (i + 0.5) / len(all_dates) for i, d in enumerate(all_dates)}

    node_chain_idx: dict[tuple[str, str], int] = {}
    for ci, chain in enumerate(filtered_chains):
        for key in chain:
            if key not in node_chain_idx:
                node_chain_idx[key] = ci

    n_chains = len(filtered_chains)

    node_labels: list[str] = []
    node_hover: list[str] = []
    node_x: list[float] = []
    node_y: list[float] = []
    node_colors: list[str] = []
    node_map: dict[tuple[str, str], int] = {}
    sources: list[int] = []
    targets: list[int] = []
    values: list[float] = []
    link_colors: list[str] = []

    for chain_idx, chain in enumerate(filtered_chains):
        base_color = accent_colors[chain_idx % len(accent_colors)]
        r = int(base_color[1:3], 16)
        g = int(base_color[3:5], 16)
        b = int(base_color[5:7], 16)
        link_color = f"rgba({r},{g},{b},0.4)"

        for j, (idx_name, cid) in enumerate(chain):
            key = (idx_name, cid)
            if key not in node_map:
                node_map[key] = len(node_labels)
                date = idx_name.replace(f"{index_prefix}-", "")
                label = all_labels[idx_name][cid]
                cluster_size = len(
                    daily_results.get(idx_name, {}).get("clusters", {}).get(cid, [])
                )
                is_start = j == 0
                is_end = j == len(chain) - 1
                # Show text only on endpoints to reduce overlap; keep detail in hover.
                display = (
                    f"{_short_label(label)} ({cluster_size})"
                    if (is_start or is_end)
                    else ""
                )
                node_labels.append(display)
                node_hover.append(
                    "<br>".join(
                        [
                            f"date={date}",
                            f"cluster={cid}",
                            f"size={cluster_size}",
                            f"label={label}",
                        ]
                    )
                )
                node_x.append(date_to_x[date])
                y_pos = (node_chain_idx[key] + 0.5) / (n_chains + 1)
                node_y.append(max(0.01, min(0.99, y_pos)))
                node_colors.append(base_color)

            if j > 0:
                prev_key = chain[j - 1]
                match = strong_links[
                    (strong_links["source_index"] == prev_key[0])
                    & (strong_links["source_cluster"] == prev_key[1])
                    & (strong_links["target_index"] == idx_name)
                    & (strong_links["target_cluster"] == cid)
                ]
                strength = (
                    float(match["knn_fraction"].values[0]) if len(match) > 0 else 0.3
                )
                sources.append(node_map[prev_key])
                targets.append(node_map[key])
                values.append(max(strength * 8, 0.8))
                link_colors.append(link_color)

    fig = go.Figure(
        data=[
            go.Sankey(
                arrangement="fixed",
                node=dict(
                    pad=24,
                    thickness=14,
                    label=node_labels,
                    customdata=node_hover,
                    hovertemplate="%{customdata}<extra></extra>",
                    color=node_colors,
                    x=node_x,
                    y=node_y,
                    line=dict(color="rgba(255,255,255,0.3)", width=0.5),
                ),
                link=dict(
                    source=sources,
                    target=targets,
                    value=values,
                    color=link_colors,
                    hovertemplate=(
                        "flow=%{value:.2f}<br>"
                        "source=%{source.label}<br>"
                        "target=%{target.label}<extra></extra>"
                    ),
                ),
            )
        ]
    )

    import calendar

    for date, x_pos in date_to_x.items():
        parts = date.split(".")
        month_abbr = calendar.month_abbr[int(parts[1])] if len(parts) >= 2 else "?"
        day_num = parts[-1]
        fig.add_annotation(
            x=x_pos,
            y=1.08,
            xref="paper",
            yref="paper",
            text=f"{month_abbr} {int(day_num)}",
            showarrow=False,
            font=dict(size=11, color="#aaaaaa"),
        )

    fig.update_layout(
        title=dict(
            text=f"Temporal Story Chains (Top {len(filtered_chains)})",
            font=dict(size=16, color=dark_text),
        ),
        height=650,
        width=1300,
        font=dict(size=11, color="#d0d0d0"),
        paper_bgcolor=dark_bg,
        plot_bgcolor=dark_bg,
        margin=dict(t=90, b=20, l=20, r=20),
    )

    return fig
