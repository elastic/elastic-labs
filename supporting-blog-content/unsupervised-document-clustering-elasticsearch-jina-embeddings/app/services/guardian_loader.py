"""Load articles from The Guardian Open Platform API with parquet caching."""

from __future__ import annotations

import hashlib
import logging
import time
from pathlib import Path

import pandas as pd
import requests
from bs4 import BeautifulSoup
from app.core.config import settings

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).resolve().parents[2] / "cache"

GUARDIAN_BASE_URL = "https://content.guardianapis.com/search"
GUARDIAN_REGISTER_URL = "https://bonobo.capi.gutools.co.uk/register/developer"

# Rate limiting: free tier allows 12 req/s, 5000/day.
# We use a conservative 10 req/s to stay safe.
MIN_REQUEST_INTERVAL = 1.0 / 10


def _get_api_key() -> str:
    """Return the Guardian API key or fail fast with a helpful message."""
    key = getattr(settings, "guardian_api_key", "") or ""
    if not key:
        raise EnvironmentError(
            f"GUARDIAN_API_KEY is not set in .env. "
            f"Register for a free key at: {GUARDIAN_REGISTER_URL}"
        )
    return key


def _cache_path(date_from: str, date_to: str) -> Path:
    """Deterministic cache path for a date-range query."""
    key = f"guardian:{date_from}:{date_to}"
    slug = hashlib.md5(key.encode()).hexdigest()[:10]
    return CACHE_DIR / f"guardian_{slug}.parquet"


def _strip_html(html: str) -> str:
    """Convert HTML body to plain text."""
    if not html:
        return ""
    soup = BeautifulSoup(html, "html.parser")
    return soup.get_text(separator=" ", strip=True)


def _fetch_page(
    api_key: str,
    date_from: str,
    date_to: str,
    page: int,
    page_size: int = 200,
) -> dict:
    """Fetch a single page of results from the Guardian API."""
    params = {
        "from-date": date_from,
        "to-date": date_to,
        "show-fields": "body,headline,byline",
        "page-size": page_size,
        "page": page,
        "api-key": api_key,
    }
    resp = requests.get(GUARDIAN_BASE_URL, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()["response"]


def fetch_guardian_articles(
    date_from: str,
    date_to: str,
    max_pages: int | None = None,
) -> pd.DataFrame:
    """Fetch Guardian articles for a date range, with pagination and caching.

    Parameters
    ----------
    date_from : str
        Start date in YYYY-MM-DD format.
    date_to : str
        End date in YYYY-MM-DD format (inclusive).
    max_pages : int, optional
        Limit the number of API pages fetched. None means fetch all.

    Returns
    -------
    pd.DataFrame
        Columns: doc_id, text, timestamp, title, source, section.
    """
    cached = _cache_path(date_from, date_to)
    if cached.exists():
        logger.info("Loading cached Guardian data from %s", cached)
        return pd.read_parquet(cached)

    api_key = _get_api_key()

    # First request to discover total pages
    logger.info("Fetching Guardian articles %s to %s", date_from, date_to)
    first = _fetch_page(api_key, date_from, date_to, page=1)
    total_pages = first["pages"]
    total_results = first["total"]
    logger.info("Guardian API: %d results across %d pages", total_results, total_pages)

    if max_pages is not None:
        total_pages = min(total_pages, max_pages)

    all_results = list(first.get("results", []))
    last_request_time = time.monotonic()

    for page_num in range(2, total_pages + 1):
        # Rate limiting
        elapsed = time.monotonic() - last_request_time
        if elapsed < MIN_REQUEST_INTERVAL:
            time.sleep(MIN_REQUEST_INTERVAL - elapsed)

        logger.info("Fetching page %d / %d", page_num, total_pages)
        page_data = _fetch_page(api_key, date_from, date_to, page=page_num)
        last_request_time = time.monotonic()

        results = page_data.get("results", [])
        if not results:
            break
        all_results.extend(results)

    # Convert to records
    records = []
    for i, item in enumerate(all_results):
        fields = item.get("fields", {})
        body_html = fields.get("body", "")
        body_text = _strip_html(body_html)

        if not body_text.strip():
            continue

        records.append(
            {
                "doc_id": f"guardian-{i:06d}",
                "text": body_text,
                "timestamp": item.get("webPublicationDate"),
                "title": fields.get("headline") or item.get("webTitle", ""),
                "source": "guardian",
                "section": item.get("sectionName", ""),
            }
        )

    df = pd.DataFrame(records)
    logger.info(
        "Parsed %d Guardian articles (of %d raw results)", len(df), len(all_results)
    )

    # Cache to parquet
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    df.to_parquet(cached, index=False)
    logger.info("Cached Guardian data to %s", cached)

    return df
