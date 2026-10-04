# Elasticsearch Examples & Apps

**Visit [Search Labs](https://www.elastic.co/search-labs) for the latest articles and tutorials on using Elasticsearch for search and AI/ML-powered search experiences**

This repo contains executable Python notebooks, sample apps, and resources for testing out the Elastic platform:

- Learn how to use Elasticsearch as a vector database to store embeddings, power hybrid and semantic search experiences.
- Build use cases such as retrieval augmented generation (RAG), summarization, and question answering (QA).
- Test Elastic's leading-edge, out-of-the-box capabilities like the [Elastic Learned Sparse Encoder](https://www.elastic.co/guide/en/machine-learning/current/ml-nlp-elser.html) and [reciprocal rank fusion (RRF)](<https://www.elastic.co/blog/whats-new-elastic-enterprise-search-8-9-0#hybrid-search-with-reciprocal-rank-fusion-(rrf)-combines-multiple-search-techniques-for-better-results>), which produce best-in-class results without training or tuning.
- Integrate with projects like OpenAI, Hugging Face, and LangChain, and use Elasticsearch as the backbone of your LLM-powered applications.

Elastic enables all modern search experiences powered by AI/ML.

- Bookmark or subscribe to [Elasticsearch Labs on Github](https://github.com/elastic/elasticsearch-labs)
- Read our latest articles at [elastic.co/search-labs](https://www.elastic.co/search-labs)

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
- [`Using AG2 (formerly AutoGen) with Elasticsearch`](notebooks/integrations/ag2/using-ag2-with-elasticsearch.ipynb)

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
