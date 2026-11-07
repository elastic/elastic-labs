"""Helpers for auditing Hugging Face news datasets."""

from __future__ import annotations

from datetime import datetime


TEXT_CANDIDATES = ("text", "article", "content", "body")
TIME_CANDIDATES = ("time", "timestamp", "date", "published")


def pick_text_column(columns: list[str]) -> str | None:
    lowered = {c.lower(): c for c in columns}
    for token in TEXT_CANDIDATES:
        for key, original in lowered.items():
            if token in key:
                return original
    return None


def pick_timestamp_column(columns: list[str]) -> str | None:
    lowered = {c.lower(): c for c in columns}
    for token in TIME_CANDIDATES:
        for key, original in lowered.items():
            if token in key:
                return original
    return None


def to_iso8601(value: object) -> str | None:
    if value is None:
        return None

    if isinstance(value, datetime):
        return value.isoformat()

    if isinstance(value, str):
        normalized = value.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(normalized)
            return parsed.isoformat()
        except ValueError:
            return value

    return str(value)


def average_word_count(records: list[dict], text_col: str) -> float:
    if not records:
        return 0.0
    counts = [len(str(item.get(text_col, "")).split()) for item in records]
    return sum(counts) / len(counts)
