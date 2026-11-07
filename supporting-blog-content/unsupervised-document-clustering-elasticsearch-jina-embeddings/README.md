# Unsupervised document clustering with Elasticsearch + Jina embeddings

Companion code for the [Search Labs blog post](https://www.elastic.co/search-labs/blog/unsupervised-document-clustering-with-elasticsearch-jina-embeddings).

The notebook walks through density-probed centroid clustering, `significant_text` auto-labeling, and temporal story chains on ~8,500 February 2025 news articles from BBC News and The Guardian.

## Contents

```
.
├── clustering_tutorial.ipynb   # Main walkthrough (run this)
├── requirements.txt            # Python dependencies
├── .env.example                # Template for API keys and Elasticsearch config
└── app/                        # Supporting modules imported by the notebook
    ├── core/
    │   └── config.py           # Pydantic Settings loader (reads .env)
    └── services/
        ├── elasticsearch_client.py
        ├── es_index.py
        ├── clustering.py       # density-probed centroid algorithm
        ├── cluster_labeling.py
        ├── cluster_exploration.py
        ├── clustering_plots.py
        ├── clustering_viz.py
        ├── dataset_loader.py
        ├── dataset_audit.py
        ├── guardian_loader.py
        ├── jina_embeddings.py
        └── story_chains.py
```

The notebook imports from the `app/` package (for example, `from app.services.clustering import cluster_index_density_centroid`), so you must launch Jupyter from this directory so Python can resolve those imports.

## Prerequisites

- **Python 3.11+**
- An **Elasticsearch deployment** (Elastic Cloud, Elasticsearch Serverless, or self-managed 8.18+/9.0+). `bbq_disk` requires 8.18 or later. The optional diversify retriever section requires 9.3+ or serverless.
- A **[Jina API key](https://jina.ai/embeddings/)** (free tier covers the full notebook).
- A **[Guardian Open Platform API key](https://bonobo.capi.gutools.co.uk/register/developer)** (free).

## Setup

1. Create and activate a virtual environment:

   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```

2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Configure credentials. Copy `.env.example` to `.env` and fill in the values:

   ```bash
   cp .env.example .env
   # then edit .env with your Elasticsearch, Jina, and Guardian keys
   ```

   The notebook calls `load_dotenv(override=True)`, so values in `.env` take precedence over any inherited shell environment.

4. Launch Jupyter **from this directory** (so `from app...` imports resolve):

   ```bash
   jupyter notebook clustering_tutorial.ipynb
   ```

## What the notebook produces

- Global clustering of the full month into topical groups using density-probed centroid classification with Elasticsearch kNN as the compute primitive.
- Auto-generated cluster labels via the [`significant_text`](https://www.elastic.co/docs/reference/aggregations/search-aggregations-bucket-significanttext-aggregation) aggregation.
- A UMAP projection comparing retrieval vs. clustering Jina embeddings.
- Daily reclustering and cross-day story chains, visualized as a Sankey diagram.

## Troubleshooting

- **`ModuleNotFoundError: No module named 'app'`** — launch Jupyter from inside this directory, not from a parent.
- **Empty embedding cache** — the first run hits the Jina API; subsequent runs read from the local cache directory.
- **Connection errors to Elasticsearch** — verify `ELASTIC_CLOUD_ID` (or `ELASTIC_HOST`) and `ELASTIC_API_KEY` in `.env`.
