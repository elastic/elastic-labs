import { createReadStream, createWriteStream, existsSync } from 'fs';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  INDEX_NAME,
  TARGET_COUNT,
  mapAmazonRow,
  writeNdjsonLine,
} from './amazon-meta-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const args = process.argv.slice(2);
const inputArgIndex = args.indexOf('--input');
const inputPath = inputArgIndex >= 0
  ? args[inputArgIndex + 1]
  : path.join(ROOT, 'meta_Electronics.jsonl');

const outputPath = path.join(ROOT, 'data/sample-products.ndjson');
const indexName = process.env.ELASTICSEARCH_INDEX || INDEX_NAME;

const WALKTHROUGH_HINTS = [
  { hint: 'wireless earbuds', label: 'name-focused walkthrough' },
  { hint: 'laptop', label: 'ambiguous walkthrough' },
];

async function collectProducts() {
  if (!existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    console.error('Place Amazon Reviews\'23 Electronics meta JSONL at data/raw/meta_Electronics.jsonl');
    console.error('Or pass a custom path: npm run build:catalog -- --input /path/to/meta_Electronics.jsonl');
    process.exit(1);
  }

  const pinned = [];
  const pinnedIds = new Set();
  const general = [];

  const rl = createInterface({
    input: createReadStream(inputPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let lineNumber = 0;

  for await (const line of rl) {
    lineNumber += 1;
    if (!line.trim()) {
      continue;
    }

    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }

    const product = mapAmazonRow(row);
    if (!product) {
      continue;
    }

    const titleLower = product.name.toLowerCase();
    const matchedHint = WALKTHROUGH_HINTS.find(({ hint }) => titleLower.includes(hint));

    if (matchedHint && !pinnedIds.has(product.id) && pinned.length < 40) {
      pinned.push(product);
      pinnedIds.add(product.id);
      continue;
    }

    if (pinnedIds.has(product.id)) {
      continue;
    }

    general.push(product);

    if (pinned.length + general.length >= TARGET_COUNT * 3) {
      break;
    }

    if (lineNumber % 100000 === 0) {
      console.log(`Scanned ${lineNumber.toLocaleString()} lines…`);
    }
  }

  const selected = [...pinned];
  for (const product of general) {
    if (selected.length >= TARGET_COUNT) {
      break;
    }
    selected.push(product);
  }

  return selected;
}

async function main() {
  console.log(`Reading Amazon meta: ${inputPath}`);
  const products = await collectProducts();

  if (products.length === 0) {
    console.error('No products with valid image URLs were found.');
    process.exit(1);
  }

  if (products.length < TARGET_COUNT) {
    console.warn(`Warning: only ${products.length} products matched filters (target ${TARGET_COUNT}).`);
  }

  const stream = createWriteStream(outputPath, { encoding: 'utf8' });
  for (const product of products.slice(0, TARGET_COUNT)) {
    writeNdjsonLine(stream, indexName, product);
  }
  stream.end();

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  console.log(`Wrote ${Math.min(products.length, TARGET_COUNT)} products -> ${outputPath}`);
  console.log(`Bulk index name: ${indexName}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
