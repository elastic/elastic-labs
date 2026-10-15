# Texas Native Plants

Ecommerce search app for Texas native plants. React 19 + TypeScript frontend, Express backend, Elasticsearch for search.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Elasticsearch

Copy the example env file and fill in your credentials:

```bash
cp .env.example .env
```

Open `.env` and set:

| Variable | Description |
|---|---|
| `ELASTICSEARCH_URL` | Your serverless cluster endpoint |
| `ELASTICSEARCH_API_KEY` | API key from Kibana → Stack Management → API Keys |
| `ELASTICSEARCH_INDEX` | Index name for your plant data (default: `texas-native-plants`) |

### 3. Start the backend

```bash
npm run server
```

The server will log its URL and confirm whether credentials are set.

### 4. Start the frontend (separate terminal)

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Vite proxies all `/api` requests to the Express server on port 3001.

---

## Expected index mapping

Documents in the Elasticsearch index should have these fields:

```json
{
  "name": "Texas Bluebonnet",
  "category": "Wildflowers",
  "description": "...",
  "price": 9.99,
  "images": ["https://..."],
  "tags": ["native", "spring"],
  "region": "Hill Country",
  "sunlight": "Full Sun",
  "water_needs": "Low"
}
```

`sunlight` values: `Full Sun`, `Partial Shade`, `Full Shade`  
`water_needs` values: `Low`, `Medium`, `High`

## Project structure

```
server/
  index.js          Express + Elasticsearch API server
src/
  lib/api.ts        All fetch calls to the backend
  types/product.ts  Shared TypeScript types
  components/       Header, SearchBar, ProductCard, ProductGrid, ProductCarousel
  pages/            Home, SearchResults, CategoryPage, ProductDetail
```

## Routes

| Path | Page |
|---|---|
| `/` | Home — featured carousel + category tiles |
| `/search?q=&category=&sunlight=&water_needs=` | Search results with filters |
| `/category/:category` | Category-filtered results |
| `/product/:id` | Product detail |


## Seed the catalog

The product catalog ships as a seed script using the original mapping
(`long_description` is `semantic_text`, so hybrid product search works out of
the box). With `.env` configured:

```bash
npm run seed            # creates the index (default: texas_natives) + 48 products
npm run seed -- --fresh # wipe and recreate
```

Set `ELASTICSEARCH_INDEX` in `.env` to match (default `texas_natives`).

## Document OCR + RAG chat

Two additions power the "ask a document" experience:

- **Documents page** (`/documents`): drag in a PDF or image. The server renders
  pages, OCRs each one through the `jina-ocr-v1` endpoint on Elastic Inference
  Service (progress streams live to the page, including a preview of the first
  extracted table), then writes everything to a hybrid index **named after the
  file** (e.g. `Native-and-Adaptive-Plants.pdf` → `native-and-adaptive-plants`).
  The index maps `content` (text, lexical) with `copy_to` into
  `content_semantic` (semantic_text), so chunking and embeddings happen inside
  Elasticsearch at ingest.
- **Plant advisor** (leaf button, bottom right): ask gardening questions across
  the whole dataset. The default scope is *Everything*: hybrid retrieval runs in
  parallel over the product catalog and every uploaded document, and the LLM
  answers from guide passages (with page citations) while recommending only
  products that actually exist in the catalog, rendered as mini product cards
  linking to their pages. Narrow the scope to *Plant catalog only* or a single
  document when you want to prove exactly where an answer came from.

A small `doc-registry` index tracks what has been parsed so the chat can list
documents. New env vars are documented in `.env.example` (`OCR_INFERENCE_ID`,
`OCR_CONCURRENCY`, `LLM_INFERENCE_ID`). The chat model is pinned to
`.anthropic-claude-4.5-haiku-chat_completion`; if the variable is missing the
server auto-detects a chat endpoint and logs a warning.


## Full-text vs hybrid search (and the Compare view)

The header toggle has three modes:

- **Full-text**: pure BM25 keyword scoring over name, description, long
  description, and categories, with typo tolerance on names/descriptions.
  Nothing else: no synonym rules, no hand-written intent boosts.
- **Hybrid**: the same keyword query plus a `semantic` query on
  `long_description_semantic`, fused with Reciprocal Rank Fusion. Sidebar
  filters apply to both legs.
- **Compare**: both rankings side by side for one query, with each row marked
  as *only here*, *not in hybrid*, or moved up/down by N positions, plus a
  summary of how many plants hybrid surfaced, reordered, or dropped.

Both modes search the **same text**: the mapping stores `long_description` as a
lexical `text` field and mirrors it via `copy_to` into `long_description_semantic`
(`semantic_text`). The difference you see is retrieval technique, not text
coverage.

Every result with a query carries provenance: a badge (Keyword / Meaning /
Keyword + meaning) and a snippet, either the `<mark>`-highlighted keyword hit
or the semantic chunk that matched. The "Try a query" chips in the sidebar are
phrased the way shoppers talk (e.g. *something for a shady wet corner*) to make
the modes diverge visibly.

> After pulling this version, re-run `npm run seed -- --fresh` once: the
> mapping changed to add the `copy_to` field.
