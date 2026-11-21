import { readFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function loadEnvFile(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  try {
    const text = readFileSync(filePath, 'utf8');
    return Object.fromEntries(
      text
        .split('\n')
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const idx = line.indexOf('=');
          return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
        })
    );
  } catch {
    return {};
  }
}

const env = { ...loadEnvFile('.env.example'), ...loadEnvFile('.env.local'), ...process.env };

const url = env.ELASTICSEARCH_URL;
const username = env.ELASTICSEARCH_USERNAME;
const password = env.ELASTICSEARCH_PASSWORD;
const index = env.ELASTICSEARCH_INDEX || 'amazon-electronics';

const args = process.argv.slice(2);
const userArgIndex = args.indexOf('--user');
const passArgIndex = args.indexOf('--password');
const ROLE = 'amazon_electronics_reader';
const USER = userArgIndex >= 0 ? args[userArgIndex + 1] : 'amazon_electronics_readonly';
const USER_PASSWORD = passArgIndex >= 0 ? args[passArgIndex + 1] : randomBytes(18).toString('base64url');

if (!url || !username || !password) {
  console.error('Set ELASTICSEARCH_URL, ELASTICSEARCH_USERNAME, ELASTICSEARCH_PASSWORD in .env.local');
  process.exit(1);
}

const baseUrl = url.replace(/\/$/, '');
const auth = Buffer.from(`${username}:${password}`).toString('base64');
const headers = {
  'Content-Type': 'application/json',
  Authorization: `Basic ${auth}`,
};

async function es(method, endpoint, body) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${endpoint} failed (${response.status}): ${text}`);
  }

  return text ? JSON.parse(text) : {};
}

await es('PUT', `/_security/role/${ROLE}`, {
  cluster: [],
  indices: [
    {
      names: [index],
      privileges: ['read'],
    },
  ],
});

await es('PUT', `/_security/user/${USER}`, {
  password: USER_PASSWORD,
  roles: [ROLE],
  full_name: 'Amazon Electronics Read-only',
  metadata: {
    purpose: `Read-only search access to ${index}`,
  },
});

console.log(JSON.stringify({
  role: ROLE,
  username: USER,
  password: USER_PASSWORD,
  index,
  privileges: ['read'],
}, null, 2));
