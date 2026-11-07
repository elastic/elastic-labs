"""Centralized environment configuration."""

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict


# Ensure local .env values override inherited shell values.
load_dotenv(override=True)


class Settings(BaseSettings):
    log_level: str = "INFO"

    # Dataset (BBC via HuggingFace)
    hf_dataset_name: str = "RealTimeData/bbc_news_alltime"
    hf_dataset_split: str = "train"
    hf_sample_size: int = 1000

    # Jina embeddings
    jina_api_url: str = "https://api.jina.ai/v1/embeddings"
    jina_model: str = "jina-embeddings-v5-text-small"
    jina_api_key: str = ""
    jina_batch_size: int = 50

    # Elasticsearch
    elastic_host: str = ""
    elastic_cloud_id: str = ""
    elastic_api_key: str = ""
    elastic_index_clustering: str = "docs-clustering"
    elastic_verify_certs: bool = True

    # Guardian API
    guardian_api_key: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
