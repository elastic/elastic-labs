/**
 * Seed the plant catalog: creates the product index (your original mapping,
 * including the semantic_text long_description) and bulk-loads 48 products.
 *
 * Run: npm run seed
 * Re-runnable: pass --fresh to delete and recreate the index first.
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ES_URL = (process.env.ELASTICSEARCH_URL || '').replace(/\/$/, '');
const ES_API_KEY = process.env.ELASTICSEARCH_API_KEY || '';
const INDEX = process.env.ELASTICSEARCH_INDEX || 'texas_natives';
const FRESH = process.argv.includes('--fresh');

const headers = { Authorization: `ApiKey ${ES_API_KEY}`, 'Content-Type': 'application/json' };

const MAPPING = {
  mappings: {
    properties: {
      sku: { type: 'keyword' },
      name: { type: 'text' },
      description: { type: 'text' },
      long_description: { type: 'text', copy_to: 'long_description_semantic' },
      long_description_semantic: { type: 'semantic_text' },
      price: { type: 'float' },
      sun: { type: 'keyword' },
      water: { type: 'keyword' },
      flower_color: { type: 'keyword' },
      foliage_color: { type: 'keyword' },
      categories: { type: 'keyword' },
      image_url: { type: 'keyword' },
      in_stock: { type: 'boolean' },
    },
  },
};

async function main() {
  if (!ES_URL || !ES_API_KEY) {
    throw new Error('Set ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY in .env');
  }

  if (FRESH) {
    await fetch(`${ES_URL}/${INDEX}`, { method: 'DELETE', headers }).catch(() => {});
    console.log(`Deleted index "${INDEX}" (--fresh).`);
  }

  const exists = await fetch(`${ES_URL}/${INDEX}`, { method: 'HEAD', headers });
  if (exists.status === 200) {
    console.log(`Index "${INDEX}" already exists — seeding into it (use --fresh to recreate).`);
  } else {
    const create = await fetch(`${ES_URL}/${INDEX}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(MAPPING),
    });
    if (!create.ok) throw new Error(`Index creation failed: ${await create.text()}`);
    console.log(`Created index "${INDEX}".`);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const ndjson = readFileSync(join(here, 'seed-data.ndjson'), 'utf8');
  const docCount = ndjson.split('\n').filter((l) => l.trim() && !l.includes('"index"')).length;

  console.log(`Bulk indexing ${docCount} products (semantic_text embeds long_description at ingest — this can take a minute on first run)…`);
  const bulk = await fetch(`${ES_URL}/${INDEX}/_bulk?refresh=wait_for`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/x-ndjson' },
    body: ndjson,
  });
  if (!bulk.ok) throw new Error(`Bulk failed: ${await bulk.text()}`);
  const result = await bulk.json();

  if (result.errors) {
    const failures = result.items.filter((i) => i.index?.error);
    console.error(`${failures.length} item(s) failed. First error:`);
    console.error(JSON.stringify(failures[0]?.index?.error, null, 2));
    process.exit(1);
  }

  console.log(`Seeded ${result.items.length} products into "${INDEX}" in ${result.took}ms.`);
  console.log('Start the app: npm run server (and npm run dev in another terminal).');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
