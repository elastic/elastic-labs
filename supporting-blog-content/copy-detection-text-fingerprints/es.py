"""Elasticsearch client and index name, read from .env (values in .env override the shell)."""

import os
from pathlib import Path

from dotenv import load_dotenv
from elasticsearch import Elasticsearch

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env", override=True)


def get_client() -> Elasticsearch:
    url, key = os.environ.get("ES_URL", ""), os.environ.get("ES_API_KEY", "")
    if not url.startswith("http") or not key or key.startswith("<"):
        raise SystemExit(
            "Set ES_URL (https://...:443) and ES_API_KEY in .env: copy env.example to .env and fill in both."
        )
    return Elasticsearch(url, api_key=key, request_timeout=120)


def index_name() -> str:
    return os.environ.get("INDEX_NAME", "fingerprint-demo")


def create_index(es: Elasticsearch, name: str, recreate: bool = False) -> None:
    """Create the index from mappings/index.json. An existing index is only replaced when recreate=True."""
    import json

    if es.indices.exists(index=name):
        if not recreate:
            raise SystemExit(
                f"Index '{name}' already exists. Use --recreate to delete and rebuild it, "
                "or set another INDEX_NAME in .env."
            )
        es.indices.delete(index=name)
    es.indices.create(
        index=name, **json.loads((HERE / "mappings/index.json").read_text())
    )
