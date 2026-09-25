# Ecommerce search reranking with Jev

This folder contains the standalone analysis notebook supporting the Elastic blog post
`ecommerce-search-reranking-llm-alternative-jev`.

The notebook presents the frozen results of a controlled 250-query ESCI benchmark comparing
Elasticsearch retrieval and Jina reranking with four Jev-derived ranking policies. It embeds
the aligned per-query Ordinal nDCG@10 values needed to reproduce the published means and
selected paired win/tie/loss counts.

## Run locally

1. Open `ecommerce-search-reranking-llm-alternative-jev.ipynb` in Jupyter.
2. Choose **Restart Kernel and Run All Cells**.

The verification cell requires Python 3.10 or newer and the Python standard library only. It
does not need credentials, environment variables, Elasticsearch, Jev inference, or network
access. The remaining tables, confidence intervals, calibration analysis, and representative
typed outputs are preserved from the audited confirmation run.
