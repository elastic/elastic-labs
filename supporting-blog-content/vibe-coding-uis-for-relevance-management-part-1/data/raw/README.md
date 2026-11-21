# Raw Amazon metadata

Place the Amazon Reviews'23 **Electronics item metadata** JSONL here:

```
meta_Electronics.jsonl
```

You can also place the same file at the project root (`./meta_Electronics.jsonl`).

Expected Hugging Face path:

`McAuley-Lab/Amazon-Reviews-2023` → `raw/meta_categories/meta_Electronics.jsonl`

Then build the bulk catalog:

```bash
npm run build:catalog
```

This writes `data/sample-products.ndjson` (10,000 products with `image_url`). Generated files are gitignored.

For the full dataset (~1.6M docs), index directly from JSONL:

```bash
npm run index:full
```

Large source files are gitignored.
