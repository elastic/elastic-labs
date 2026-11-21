"""Reusable plotting helpers for clustering tutorial visuals."""

from __future__ import annotations

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots


def make_task_comparison_figure(
    df_cmp: pd.DataFrame,
    *,
    accent_colors: list[str],
    dark_text: str,
    dark_layout: dict,
    dark_grid: str,
) -> go.Figure:
    """Plot retrieval vs clustering embeddings side-by-side."""
    fig = make_subplots(
        rows=1,
        cols=2,
        subplot_titles=[
            "Retrieval Embeddings (retrieval.passage)",
            "Clustering Embeddings (clustering)",
        ],
        horizontal_spacing=0.08,
    )

    sections = df_cmp["section"].unique()
    color_map = {
        section: accent_colors[i % len(accent_colors)]
        for i, section in enumerate(sections)
    }

    for section in sections:
        sub = df_cmp[df_cmp["section"] == section]
        color = color_map[section]
        hover = sub["title"].str[:60]

        fig.add_trace(
            go.Scatter(
                x=sub["retr_x"],
                y=sub["retr_y"],
                mode="markers",
                marker=dict(size=5, color=color, opacity=0.7),
                name=section,
                legendgroup=section,
                showlegend=True,
                hovertext=hover,
            ),
            row=1,
            col=1,
        )

        fig.add_trace(
            go.Scatter(
                x=sub["clust_x"],
                y=sub["clust_y"],
                mode="markers",
                marker=dict(size=5, color=color, opacity=0.7),
                name=section,
                legendgroup=section,
                showlegend=False,
                hovertext=hover,
            ),
            row=1,
            col=2,
        )

    fig.update_layout(
        height=500,
        width=1100,
        title=dict(
            text="Same documents, different embedding tasks",
            font=dict(size=16, color=dark_text),
        ),
        legend=dict(font=dict(size=10, color=dark_text)),
        **dark_layout,
    )
    fig.update_annotations(font=dict(color=dark_text, size=13))
    for axis in ["xaxis", "xaxis2", "yaxis", "yaxis2"]:
        fig.update_layout(
            **{
                axis: dict(
                    showticklabels=False, gridcolor=dark_grid, zerolinecolor=dark_grid
                )
            }
        )
    return fig


def make_day_summary_figure(
    day_summary: pd.DataFrame, *, dark_text: str, dark_layout: dict
) -> go.Figure:
    """Plot stacked clustered vs noise counts by date."""
    fig = go.Figure()
    fig.add_trace(
        go.Bar(
            x=day_summary["date"],
            y=day_summary["clustered"],
            name="Clustered",
            marker_color="#636EFA",
        )
    )
    fig.add_trace(
        go.Bar(
            x=day_summary["date"],
            y=day_summary["noise"],
            name="Noise",
            marker_color="#EF553B",
        )
    )
    fig.update_layout(
        barmode="stack",
        title=dict(
            text="Global Clustering Output by Publication Date",
            font=dict(size=16, color=dark_text),
        ),
        xaxis_title="Date",
        yaxis_title="Documents",
        height=400,
        width=1000,
        **dark_layout,
    )
    return fig


def make_cluster_umap_figure(
    df_plot: pd.DataFrame,
    *,
    dark_text: str,
    dark_layout: dict,
    dark_grid: str,
    clustered_only: bool = False,
    annotate_top_n: int = 8,
) -> go.Figure:
    """Plot full-month UMAP with clearer cluster readability defaults."""
    plot_df = df_plot.copy()
    if clustered_only:
        plot_df = plot_df[~plot_df["is_noise"]].copy()

    # Stabilize legend order by group size so major topics are easier to find.
    group_order = plot_df["color_group"].value_counts().index.tolist()

    title = (
        "UMAP: Clustered Documents Only"
        if clustered_only
        else "UMAP: Full Month (Noise De-emphasized)"
    )
    fig = px.scatter(
        plot_df,
        x="umap_x",
        y="umap_y",
        color="color_group",
        hover_data=["doc_id", "date", "source", "snippet", "label"],
        category_orders={"color_group": group_order},
        title=title,
        opacity=0.55 if clustered_only else 0.45,
        height=700,
        width=1100,
    )

    # Make noise visually secondary in the full view.
    for trace in fig.data:
        if not clustered_only and trace.name == "noise":
            trace.marker.size = 1
            trace.marker.opacity = 0.10
            trace.marker.color = "#9aa3b2"
        else:
            trace.marker.size = 3.5
            trace.marker.opacity = 0.65

        trace.hovertemplate = (
            "group=%{fullData.name}<br>"
            "doc=%{customdata[0]}<br>"
            "date=%{customdata[1]}<br>"
            "source=%{customdata[2]}<br>"
            "label=%{customdata[4]}<br>"
            "snippet=%{customdata[3]}<extra></extra>"
        )

    # Annotate centroids for largest visible topic groups.
    label_candidates = (
        plot_df[
            (~plot_df["is_noise"])
            & (~plot_df["color_group"].isin(["other clusters", "noise"]))
        ]
        .groupby("color_group")
        .agg(
            umap_x=("umap_x", "median"),
            umap_y=("umap_y", "median"),
            n=("doc_id", "count"),
        )
        .sort_values("n", ascending=False)
        .head(annotate_top_n)
        .reset_index()
    )
    for _, row in label_candidates.iterrows():
        fig.add_annotation(
            x=float(row["umap_x"]),
            y=float(row["umap_y"]),
            text=f"{str(row['color_group'])[:20]} ({int(row['n'])})",
            showarrow=False,
            bgcolor="rgba(0,0,0,0.55)",
            bordercolor="rgba(255,255,255,0.25)",
            font=dict(size=10, color="#f1f1f1"),
        )

    fig.update_layout(
        legend=dict(font=dict(size=9, color=dark_text), bgcolor="rgba(0,0,0,0)"),
        **dark_layout,
    )
    fig.update_xaxes(
        showticklabels=False, title="", gridcolor=dark_grid, zerolinecolor=dark_grid
    )
    fig.update_yaxes(
        showticklabels=False, title="", gridcolor=dark_grid, zerolinecolor=dark_grid
    )
    return fig


def make_source_mix_figure(
    source_by_label: pd.DataFrame, *, dark_text: str, dark_layout: dict
) -> go.Figure:
    """Plot stacked source composition for top clusters."""
    fig = go.Figure()
    for source, color in [("guardian", "#636EFA"), ("bbc", "#EF553B")]:
        if source in source_by_label.columns:
            fig.add_trace(
                go.Bar(
                    y=source_by_label["label_text"],
                    x=source_by_label[source],
                    name=source.upper(),
                    orientation="h",
                    marker_color=color,
                )
            )
    fig.update_layout(
        barmode="stack",
        title=dict(
            text="Source Mix per Cluster (Top 20)", font=dict(size=16, color=dark_text)
        ),
        xaxis_title="Documents",
        yaxis_title="",
        height=600,
        width=900,
        **dark_layout,
    )
    fig.update_yaxes(autorange="reversed")
    return fig


def _default_focus_group(df_plot: pd.DataFrame) -> str | None:
    """Pick the largest non-noise, non-other cluster label."""
    candidates = df_plot[
        (~df_plot["is_noise"])
        & (~df_plot["color_group"].isin(["noise", "other clusters"]))
    ]
    if len(candidates) == 0:
        return None
    counts = candidates["color_group"].value_counts()
    return str(counts.index[0]) if len(counts) > 0 else None


def make_focus_cluster_figure(
    df_plot: pd.DataFrame,
    *,
    dark_text: str,
    dark_layout: dict,
    dark_grid: str,
    focus_group: str | None = None,
) -> tuple[go.Figure | None, str | None]:
    """Plot a focused view with one cluster highlighted vs all others."""
    cluster_df = df_plot[~df_plot["is_noise"]].copy()
    if len(cluster_df) == 0:
        return None, None

    chosen = focus_group or _default_focus_group(cluster_df)
    if not chosen:
        return None, None

    cluster_df["focus_view"] = cluster_df["color_group"].apply(
        lambda x: chosen if x == chosen else "other clusters"
    )

    fig = px.scatter(
        cluster_df,
        x="umap_x",
        y="umap_y",
        color="focus_view",
        hover_data=["doc_id", "date", "source", "snippet", "label"],
        color_discrete_map={
            chosen: "#00CC96",
            "other clusters": "#6e7a8a",
        },
        title=f"Focused Topic View: {chosen}",
        opacity=0.6,
        height=700,
        width=1100,
    )

    for trace in fig.data:
        if trace.name == chosen:
            trace.marker.size = 4.0
            trace.marker.opacity = 0.85
        else:
            trace.marker.size = 2.0
            trace.marker.opacity = 0.18
        trace.hovertemplate = (
            "group=%{fullData.name}<br>"
            "doc=%{customdata[0]}<br>"
            "date=%{customdata[1]}<br>"
            "source=%{customdata[2]}<br>"
            "label=%{customdata[4]}<br>"
            "snippet=%{customdata[3]}<extra></extra>"
        )

    fig.update_layout(
        legend=dict(font=dict(size=10, color=dark_text), bgcolor="rgba(0,0,0,0)"),
        **dark_layout,
    )
    fig.update_xaxes(
        showticklabels=False, title="", gridcolor=dark_grid, zerolinecolor=dark_grid
    )
    fig.update_yaxes(
        showticklabels=False, title="", gridcolor=dark_grid, zerolinecolor=dark_grid
    )
    return fig, chosen
