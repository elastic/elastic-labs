"""Load and cache HuggingFace news datasets with timestamp filtering.

Supports multi-source loading (BBC + Guardian) via load_multi_source_dataset().
"""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path

import pandas as pd
from datasets import concatenate_datasets, get_dataset_config_names, load_dataset

from app.core.config import settings
from app.services.dataset_audit import (
    pick_text_column,
    pick_timestamp_column,
    to_iso8601,
)

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).resolve().parents[2] / "cache"


def _cache_path(dataset_name: str, configs: str, split: str, sample_size: int) -> Path:
    key = f"{dataset_name}:{configs}:{split}:{sample_size}"
    slug = hashlib.md5(key.encode()).hexdigest()[:10]
    return CACHE_DIR / f"dataset_{slug}.parquet"


def _resolve_configs(
    dataset_name: str,
    date_from: str | None,
    date_to: str | None,
) -> list[str]:
    """Pick monthly config names that overlap with the requested date range.

    Config names are like '2024-01', '2024-02', etc.
    If no date range is given, returns the most recent 3 months.
    """
    all_configs = sorted(get_dataset_config_names(dataset_name))

    if not date_from and not date_to:
        return all_configs[-3:]

    selected = []
    for cfg in all_configs:
        # Config format: YYYY-MM
        if date_from and cfg < date_from[:7]:
            continue
        if date_to and cfg > date_to[:7]:
            continue
        selected.append(cfg)

    if not selected:
        raise ValueError(
            f"No configs match date range {date_from} to {date_to}. "
            f"Available: {all_configs[0]} to {all_configs[-1]}"
        )
    return selected


def load_news_dataset(
    dataset_name: str | None = None,
    split: str | None = None,
    sample_size: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> pd.DataFrame:
    """Load dataset, normalize columns, optionally filter by date range.

    Returns a DataFrame with columns: doc_id, text, timestamp.
    Caches the raw download as parquet to avoid re-downloading.
    """
    dataset_name = dataset_name or settings.hf_dataset_name
    split = split or settings.hf_dataset_split
    sample_size = sample_size or settings.hf_sample_size

    configs = _resolve_configs(dataset_name, date_from, date_to)
    configs_key = ",".join(configs)
    cached = _cache_path(dataset_name, configs_key, split, sample_size)

    if cached.exists():
        logger.info("Loading cached dataset from %s", cached)
        df = pd.read_parquet(cached)
    else:
        logger.info(
            "Downloading %s configs %s (sample_size=%d)",
            dataset_name,
            configs_key,
            sample_size,
        )

        # Load and concatenate monthly shards
        shards = []
        for cfg in configs:
            logger.info("Loading config %s", cfg)
            shard = load_dataset(dataset_name, cfg, split=split)
            shards.append(shard)

        ds = concatenate_datasets(shards)

        # Sample down to requested size
        if len(ds) > sample_size:
            ds = ds.shuffle(seed=42).select(range(sample_size))

        columns = list(ds.features.keys())
        text_col = pick_text_column(columns)
        time_col = pick_timestamp_column(columns)

        if not text_col:
            raise ValueError(
                f"No text column detected in {columns}. "
                "Expected one of: text, article, content, body"
            )

        records = []
        for i in range(len(ds)):
            row = ds[i]
            record = {
                "doc_id": f"doc-{i:06d}",
                "text": str(row[text_col]),
            }
            if time_col:
                record["timestamp"] = to_iso8601(row[time_col])
            else:
                record["timestamp"] = None
            records.append(record)

        df = pd.DataFrame(records)
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        df.to_parquet(cached, index=False)
        logger.info("Cached %d rows to %s", len(df), cached)

    # Filter by exact date range if specified
    if df["timestamp"].notna().any() and (date_from or date_to):
        df["_ts"] = pd.to_datetime(df["timestamp"], errors="coerce", utc=True)
        if date_from:
            df = df[df["_ts"] >= pd.Timestamp(date_from, tz="UTC")]
        if date_to:
            df = df[df["_ts"] <= pd.Timestamp(date_to, tz="UTC")]
        df = df.drop(columns=["_ts"])

    # Drop rows with empty text
    df = df[df["text"].str.strip().astype(bool)].reset_index(drop=True)

    return df


def _add_source_column(df: pd.DataFrame, source: str) -> pd.DataFrame:
    """Ensure a 'source' column exists, defaulting missing values."""
    if "source" not in df.columns:
        df = df.copy()
        df["source"] = source
    return df


def _ensure_schema(df: pd.DataFrame) -> pd.DataFrame:
    """Guarantee the unified schema columns exist."""
    for col in ("title", "section"):
        if col not in df.columns:
            df = df.copy()
            df[col] = ""
    return df


def load_multi_source_dataset(
    sources: list[str] | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    bbc_sample_size: int | None = None,
    guardian_max_pages: int | None = None,
) -> pd.DataFrame:
    """Load articles from multiple sources into a single DataFrame.

    Parameters
    ----------
    sources : list[str], optional
        Source names to load. Supported: "bbc", "guardian".
        Defaults to ["bbc", "guardian"].
    date_from : str, optional
        Start date (YYYY-MM-DD).
    date_to : str, optional
        End date (YYYY-MM-DD).
    bbc_sample_size : int, optional
        Max articles for BBC source.
    guardian_max_pages : int, optional
        Max API pages for Guardian source.

    Returns
    -------
    pd.DataFrame
        Columns: doc_id, text, timestamp, title, source, section.
        doc_id values are prefixed by source to ensure uniqueness.
    """
    if sources is None:
        sources = ["bbc", "guardian"]

    frames: list[pd.DataFrame] = []

    for src in sources:
        if src == "bbc":
            df = load_news_dataset(
                sample_size=bbc_sample_size,
                date_from=date_from,
                date_to=date_to,
            )
            # Prefix doc_ids and add source metadata
            df = _add_source_column(df, "bbc")
            df["doc_id"] = "bbc-" + df["doc_id"].astype(str)
            frames.append(df)

        elif src == "guardian":
            from app.services.guardian_loader import fetch_guardian_articles

            if not date_from or not date_to:
                raise ValueError("Guardian source requires both date_from and date_to.")
            df = fetch_guardian_articles(
                date_from=date_from,
                date_to=date_to,
                max_pages=guardian_max_pages,
            )
            frames.append(df)

        else:
            raise ValueError(f"Unknown source: {src!r}. Supported: bbc, guardian")

    if not frames:
        return pd.DataFrame(
            columns=["doc_id", "text", "timestamp", "title", "source", "section"]
        )

    combined = pd.concat([_ensure_schema(f) for f in frames], ignore_index=True)

    # Uniform column order
    base_cols = ["doc_id", "text", "timestamp", "title", "source", "section"]
    extra_cols = [c for c in combined.columns if c not in base_cols]
    combined = combined[base_cols + extra_cols]

    logger.info(
        "Multi-source dataset: %d total rows from %s",
        len(combined),
        ", ".join(sources),
    )
    return combined
