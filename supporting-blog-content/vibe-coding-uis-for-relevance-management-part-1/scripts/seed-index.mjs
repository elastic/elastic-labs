import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const args = process.argv.slice(2);
const recreate = args.includes('--recreate');

const url = process.env.ELASTICSEARCH_URL;
const username = process.env.ELASTICSEARCH_USERNAME;
const password = process.env.ELASTICSEARCH_PASSWORD;
const index = process.env.ELASTICSEARCH_INDEX || 'amazon-electronics';

if (!url || !username || !password) {
  console.error('Missing ELASTICSEARCH_URL, ELASTICSEARCH_USERNAME, or ELASTICSEARCH_PASSWORD');
  process.exit(1);
}

const auth = Buffer.from(`${username}:${password}`).toString('base64');
const headers = {
  'Content-Type': 'application/json',
  Authorization: `Basic ${auth}`,
};

async function esRequest(method, endpoint, body) {
  const response = await fetch(`${url.replace(/\/$/, '')}${endpoint}`, {
    method,
    headers,
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`${method} ${endpoint} failed (${response.status}): ${text}`);
  }

  return data;
}

async function deleteIndexIfExists() {
  const check = await fetch(`${url.replace(/\/$/, '')}/${index}`, {
    method: 'HEAD',
    headers: { Authorization: `Basic ${auth}` },
  });

  if (check.status === 200) {
    console.log(`Deleting index "${index}"...`);
    await esRequest('DELETE', `/${index}`);
  }
}

async function createIndex() {
  const mapping = JSON.parse(
    readFileSync(path.join(ROOT, 'data/index-mapping.json'), 'utf8')
  );
  console.log(`Creating index "${index}"...`);
  await esRequest('PUT', `/${index}`, mapping);
}

async function bulkIndex() {
  const ndjson = readFileSync(path.join(ROOT, 'data/sample-products.ndjson'), 'utf8');
  const lines = ndjson.trim().split('\n');
  const batchSize = 1000;
  let indexed = 0;

  for (let i = 0; i < lines.length; i += batchSize) {
    const chunk = lines.slice(i, i + batchSize).join('\n') + '\n';
    const response = await fetch(`${url.replace(/\/$/, '')}/_bulk`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-ndjson',
      },
      body: chunk,
    });

    const result = await response.json();
    if (!response.ok || result.errors) {
      const firstError = result.items?.find((item) => item.index?.error);
      throw new Error(`Bulk index failed: ${JSON.stringify(firstError?.index?.error || result)}`);
    }

    indexed += chunk.split('\n').filter(Boolean).length / 2;
    console.log(`Indexed batch: ${indexed} documents so far`);
  }
}

async function refreshAndCount() {
  await esRequest('POST', `/${index}/_refresh`);
  const count = await esRequest('GET', `/${index}/_count`);
  console.log(`Index "${index}" contains ${count.count} documents`);
}

async function main() {
  if (recreate) {
    await deleteIndexIfExists();
  }
  await createIndex();
  await bulkIndex();
  await refreshAndCount();
  console.log('Seed complete.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
