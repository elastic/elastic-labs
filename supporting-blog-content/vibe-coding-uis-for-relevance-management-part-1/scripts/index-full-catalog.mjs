import { createReadStream, readFileSync, mkdirSync } from 'fs';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import path from 'path';
import { mapAmazonRow } from './amazon-meta-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const args = process.argv.slice(2);
const recreate = args.includes('--recreate');
const inputArgIndex = args.indexOf('--input');
const inputPath = inputArgIndex >= 0
  ? args[inputArgIndex + 1]
  : path.join(ROOT, 'meta_Electronics.jsonl');

const url = process.env.ELASTICSEARCH_URL;
const username = process.env.ELASTICSEARCH_USERNAME;
const password = process.env.ELASTICSEARCH_PASSWORD;
const index = process.env.ELASTICSEARCH_INDEX || 'amazon-electronics';

const BATCH_DOCS = 500;
const LOG_EVERY = 10000;

if (!url || !username || !password) {
  console.error('Missing ELASTICSEARCH_URL, ELASTICSEARCH_USERNAME, or ELASTICSEARCH_PASSWORD');
  process.exit(1);
}

const auth = Buffer.from(`${username}:${password}`).toString('base64');
const baseUrl = url.replace(/\/$/, '');

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
}

async function esRequest(method, endpoint, body) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${endpoint} failed (${response.status}): ${text}`);
  }

  return text ? JSON.parse(text) : {};
}

async function deleteIndexIfExists() {
  const check = await fetch(`${baseUrl}/${index}`, {
    method: 'HEAD',
    headers: { Authorization: `Basic ${auth}` },
  });

  if (check.status === 200) {
    log(`Deleting index "${index}"...`);
    await esRequest('DELETE', `/${index}`);
  }
}

async function createIndex() {
  const mapping = JSON.parse(
    readFileSync(path.join(ROOT, 'data/index-mapping.json'), 'utf8')
  );
  log(`Creating index "${index}"...`);
  await esRequest('PUT', `/${index}`, mapping);
}

async function sendBulk(body) {
  const response = await fetch(`${baseUrl}/_bulk`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-ndjson',
    },
    body,
  });

  const result = await response.json();
  if (!response.ok || result.errors) {
    const firstError = result.items?.find((item) => item.index?.error);
    throw new Error(`Bulk failed: ${JSON.stringify(firstError?.index?.error || result)}`);
  }
}

async function streamAndIndex() {
  log(`Streaming ${inputPath} -> ${index}`);

  const rl = createInterface({
    input: createReadStream(inputPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let batchLines = [];
  let batchDocs = 0;
  let indexed = 0;
  let scanned = 0;
  let skipped = 0;

  async function flushBatch() {
    if (batchDocs === 0) {
      return;
    }

    await sendBulk(`${batchLines.join('\n')}\n`);
    indexed += batchDocs;
    batchLines = [];
    batchDocs = 0;

    if (indexed % LOG_EVERY < BATCH_DOCS) {
      log(`Indexed ${indexed.toLocaleString()} (scanned ${scanned.toLocaleString()}, skipped ${skipped.toLocaleString()})`);
    }
  }

  for await (const line of rl) {
    if (!line.trim()) {
      continue;
    }

    scanned += 1;

    let row;
    try {
      row = JSON.parse(line);
    } catch {
      skipped += 1;
      continue;
    }

    const product = mapAmazonRow(row);
    if (!product) {
      skipped += 1;
      continue;
    }

    batchLines.push(JSON.stringify({ index: { _index: index, _id: product.id } }));
    batchLines.push(JSON.stringify(product));
    batchDocs += 1;

    if (batchDocs >= BATCH_DOCS) {
      await flushBatch();
    }
  }

  await flushBatch();
  await esRequest('POST', `/${index}/_refresh`);
  const count = await esRequest('GET', `/${index}/_count`);

  log(`Done. Indexed ${indexed.toLocaleString()} documents into "${index}".`);
  log(`Cluster count: ${count.count}`);
  log(`Scanned ${scanned.toLocaleString()} lines, skipped ${skipped.toLocaleString()}.`);
}

async function main() {
  mkdirSync(path.join(ROOT, 'logs'), { recursive: true });
  log(`Full catalog index job started (index: ${index})`);

  if (recreate) {
    await deleteIndexIfExists();
  }
  await createIndex();
  await streamAndIndex();
}

main().catch((err) => {
  log(`ERROR: ${err.message}`);
  process.exit(1);
});
