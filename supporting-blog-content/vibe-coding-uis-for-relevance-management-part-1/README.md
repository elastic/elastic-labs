# Elasticsearch Query Comparer

Part 1 companion app for the Search Labs article *Vibe Coding UIs for Relevance Management: A Query Results Comparer*.

Compare two Elasticsearch query strategies side by side using the same search term, the same dataset, and the same moment. Old Query runs a baseline `multi_match` on name, description, category, and brand. New Query adds `name^2` and `brand^2` field boosts on the same fields.

**Author-hosted demo:** [query-comparer.searchali.com](https://query-comparer.searchali.com/)

![iphone charger — Old Query vs New Query](public/icons/iphone%20charger.png)

## Prerequisites

- Node.js 18+
- Elasticsearch cluster (Elastic Cloud or self-hosted)
- Amazon Reviews'23 **Electronics item metadata** JSONL (see below)

## Quick start

```bash
npm install
cp .env.example .env.local
```

Set your Elasticsearch credentials in `.env.local`:

```
ELASTICSEARCH_URL=https://your-cluster.es.region.cloud.es.io
ELASTICSEARCH_USERNAME=your_username
ELASTICSEARCH_PASSWORD=your_password
ELASTICSEARCH_INDEX=amazon-electronics
```

### 1. Add Amazon metadata

Download **item metadata** (not reviews) for Electronics from [Amazon Reviews'23](https://amazon-reviews-2023.github.io/):

- Hugging Face file: `raw/meta_categories/meta_Electronics.jsonl`
- Place it at the project root: `meta_Electronics.jsonl` (or `data/raw/meta_Electronics.jsonl`)

See [data/raw/README.md](data/raw/README.md).

### 2. Build the bulk catalog (optional, 10K sample)

```bash
npm run build:catalog
```

Reads the JSONL, keeps products with valid `image_url`, writes `data/sample-products.ndjson` (10,000 docs). This file is gitignored.

Custom input path:

```bash
npm run build:catalog -- --input /path/to/meta_Electronics.jsonl
```

**Preview only** (10 sample products for UI testing before meta arrives):

```bash
npm run build:preview
```

### 3. Seed Elasticsearch

**Small sample** (from `data/sample-products.ndjson`):

```bash
npm run seed:recreate
```

**Full catalog** (~1.6M docs, streams from JSONL):

```bash
npm run index:full
```

Both create the `amazon-electronics` index, apply `data/index-mapping.json`, and bulk-index products.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Walkthrough queries

Try these demo searches from the article:

- `iphone charger` — name-focused intent; compare top-rank precision
- `mixer` — ambiguous intent; compare ranking balance across product types

## Customize queries

Edit the JSON templates in `queries/`:

- `queries/old-query.json` — baseline strategy (Old Query)
- `queries/new-query.json` — candidate strategy (New Query)

Use `{{term}}` as the placeholder for the user's search input.

## Index mapping

Fields: `id`, `name` (text), `description`, `category`, `brand`, `image_url` (display only, not indexed).

See [data/index-mapping.json](data/index-mapping.json).

## Dataset attribution

Product data derived from [Amazon Reviews'23](https://amazon-reviews-2023.github.io/) (McAuley Lab), Electronics item metadata. Used for research and demo purposes.

```bibtex
@article{hou2024bridging,
  title={Bridging Language and Items for Retrieval and Recommendation},
  author={Hou, Yupeng and Li, Jiacheng and He, Zhankui and Yan, An and Chen, Xiusi and McAuley, Julian},
  journal={arXiv preprint arXiv:2403.03952},
  year={2024}
}
```

## Deploy to Vercel

1. Push this repo to GitHub
2. Import the project in Vercel
3. Add environment variables from `.env.example`
4. Seed your cluster with `npm run seed:recreate` or `npm run index:full`

## Article

Companion code: [github.com/musabdogan/searchali-query-comparer](https://github.com/musabdogan/searchali-query-comparer)

Musab Dogan · [SearchAli](https://searchali.com)

## License

This project is licensed under the [Apache License 2.0](LICENSE).
