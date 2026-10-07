# Elasticsearch Examples & Apps

This repo contains executable Python notebooks, sample apps, and resources for testing out the Elastic platform across search, security, and observability use cases.

Visit Elastic Labs for the latest articles, tutorials, and more.

* [Elasticsearch Labs](https://www.elastic.co/search-labs)  
* [Security Labs](https://www.elastic.co/security-labs)  
* [Observability Labs](https://www.elastic.co/observability-labs)

## What you can build & learn

### Elasticsearch:

* Use Elasticsearch as a vector database to store embeddings, run kNN search, and merge vector and keyword results with hybrid search and reciprocal rank fusion (RRF).  
* Build retrieval augmented generation (RAG), question answering, and chatbot apps with `semantic_text`, the inference API, and semantic reranking.  
* Get strong semantic search out of the box with ELSER and multilingual E5, without training or fine-tuning a model.  
* Tune relevance with query rules, synonyms, and learning to rank.  
* Connect Elasticsearch to OpenAI, Hugging Face, Cohere, Amazon Bedrock, Anthropic, and LangChain.

### Observability:

* Instrument your services with OpenTelemetry (OTel), including the Elastic Distributions of OpenTelemetry (EDOT), and send traces, metrics, and logs to Elastic.  
* Query and analyze logs at scale with ES|QL and other query languages like PromQL.
* Monitor LLM-powered apps, including latency, token usage, and cost.
* Speed up root cause analysis with [Elastic Agent Builder](https://www.elastic.co/docs/explore-analyze/ai-features/elastic-agent-builder) and [machine learning anomaly detection](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection).

### Security:

* Reproduce the detection engineering and threat hunting techniques from Security Labs Threat Command with ES|QL and EQL queries.
* Explore the tooling behind malware analysis and threat intelligence write-ups.
* Test attacks against LLM applications, such as prompt injection, and learn how to detect them.

Watch, fork, or star [the Elastic Labs repo on GitHub](https://github.com/elastic/elastic-labs) for the latest updates.

# Apps

- [Chatbot RAG App](./example-apps/chatbot-rag-app/)
- [Internal Knowledge Search](./example-apps/internal-knowledge-search)
- [Relevance Workbench](./example-apps/relevance-workbench)

# Python notebooks 📒

The [`notebooks`](notebooks/README.md) folder contains a range of executable Python notebooks, so you can test these features out for yourself. Colab provides an easy-to-use Python virtual environment in the browser.

### Generative AI

- [`question-answering.ipynb`](./notebooks/generative-ai/question-answering.ipynb)
- [`chatbot.ipynb`](./notebooks/generative-ai/chatbot.ipynb)

### Playground RAG Notebooks

Try out Playground in Kibana with the following notebooks:

- [`OpenAI Example`](./notebooks/playground-examples/openai-elasticsearch-client.ipynb)
- [`Anthropic Claude 3 Example`](./notebooks/playground-examples/bedrock-anthropic-elasticsearch-client.ipynb)

### LangChain

- [`question-answering.ipynb`](./notebooks/generative-ai/question-answering.ipynb)
- [`langchain-self-query-retriever.ipynb`](./notebooks/langchain/self-query-retriever-examples/langchain-self-query-retriever.ipynb)
- [`Question Answering with Self Query Retriever`](./notebooks/langchain/self-query-retriever-examples/chatbot-example.ipynb)
- [`BM25 and Self-querying retriever with elasticsearch and LangChain`](./notebooks/langchain/self-query-retriever-examples/chatbot-with-bm25-only-example.ipynb)
- [`langchain-vector-store.ipynb`](./notebooks/langchain/langchain-vector-store.ipynb)
- [`langchain-vector-store-using-elser.ipynb`](./notebooks/langchain/langchain-vector-store-using-elser.ipynb)
- [`langchain-using-own-model.ipynb`](./notebooks/langchain/langchain-using-own-model.ipynb)

### Document Chunking

- [`Document Chunking with Ingest Pipelines`](./notebooks/document-chunking/with-index-pipelines.ipynb)
- [`Document Chunking with LangChain Splitters`](./notebooks/document-chunking/with-langchain-splitters.ipynb)
- [`Calculating tokens for Semantic Search (ELSER and E5)`](./notebooks/document-chunking/tokenization.ipynb)
- [`Fetch surrounding chunks`](./supporting-blog-content/fetch-surrounding-chunks/fetch-surrounding-chunks.ipynb)

### Search

- [`00-quick-start.ipynb`](./notebooks/search/00-quick-start.ipynb)
- [`01-keyword-querying-filtering.ipynb`](./notebooks/search/01-keyword-querying-filtering.ipynb)
- [`02-hybrid-search.ipynb`](./notebooks/search/02-hybrid-search.ipynb)
- [`03-ELSER.ipynb`](./notebooks/search/03-ELSER.ipynb)
- [`04-multilingual.ipynb`](./notebooks/search/04-multilingual.ipynb)
- [`05-query-rules.ipynb`](./notebooks/search/05-query-rules.ipynb)
- [`06-synonyms-api.ipynb`](./notebooks/search/06-synonyms-api.ipynb)
- [`07-inference.ipynb`](./notebooks/search/07-inference.ipynb)
- [`08-learning-to-rank.ipynb`](./notebooks/search/08-learning-to-rank.ipynb)
- [`09-semantic-text.ipynb`](./notebooks/search/09-semantic-text.ipynb)

#### Semantic reranking

- [`10-semantic-reranking-retriever-cohere.ipynb`](./notebooks/search/10-semantic-reranking-retriever-cohere.ipynb)
- [`11-semantic-reranking-hugging-face.ipynb`](./notebooks/search/11-semantic-reranking-hugging-face.ipynb)

### Integrations

- [`loading-model-from-hugging-face.ipynb`](./notebooks/integrations/hugging-face/loading-model-from-hugging-face.ipynb)
- [`openai-semantic-search-RAG.ipynb`](./notebooks/integrations/openai/openai-KNN-RAG.ipynb)
- [`amazon-bedrock-langchain-qa-example.ipynb`](notebooks/integrations/amazon-bedrock/langchain-qa-example.ipynb)
- [`Semantic Search using the Inference API with the Cohere Service`](/notebooks/integrations/cohere/inference-cohere.ipynb)

### Model Upgrades

- [`upgrading-index-to-use-elser.ipynb`](notebooks/model-upgrades/upgrading-index-to-use-elser.ipynb)

# Contributing 🎁

See [contributing guidelines](CONTRIBUTING.md).

# Support 🛟

The Search team at Elastic maintains this repository and is happy to help.

### Official Support Services

If you have an Elastic subscription, you are entitled to Support services for your Elasticsearch deployment. See our welcome page for [working with our support team](https://www.elastic.co/support/welcome).
These services do not apply to the sample application code contained in this repository.

### Discuss Forum

Try posting your question to the [Elastic discuss forums](https://discuss.elastic.co/) and tag it with [#esre-elasticsearch-relevance-engine](https://discuss.elastic.co/tag/esre-elasticsearch-relevance-engine)

### Elastic Slack

You can also find us in the [#search-esre-relevance-engine](https://elasticstack.slack.com/archives/C05CED61S9J) channel of the [Elastic Community Slack](http://elasticstack.slack.com)

# License ⚖️

This software is licensed under the [Apache License, version 2 ("ALv2")](https://github.com/elastic/elasticsearch-labs/blob/main/LICENSE).
