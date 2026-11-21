"""Elasticsearch client factory using environment configuration."""

from __future__ import annotations

from elasticsearch import Elasticsearch

from app.core.config import settings


def get_elasticsearch_client() -> Elasticsearch:
    if settings.elastic_cloud_id and settings.elastic_api_key:
        return Elasticsearch(
            cloud_id=settings.elastic_cloud_id,
            api_key=settings.elastic_api_key,
            verify_certs=settings.elastic_verify_certs,
        )

    if settings.elastic_host and settings.elastic_api_key:
        return Elasticsearch(
            hosts=[settings.elastic_host],
            api_key=settings.elastic_api_key,
            verify_certs=settings.elastic_verify_certs,
        )

    if settings.elastic_host:
        return Elasticsearch(
            hosts=[settings.elastic_host],
            verify_certs=settings.elastic_verify_certs,
        )

    raise ValueError(
        "Elasticsearch connection is not configured. Set ELASTIC_HOST or "
        "ELASTIC_CLOUD_ID (+ ELASTIC_API_KEY) in .env."
    )
