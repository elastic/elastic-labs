import { Client } from '@elastic/elasticsearch';

let client;

export function getElasticsearchClient() {
  if (client) {
    return client;
  }

  const node = process.env.ELASTICSEARCH_URL;
  const username = process.env.ELASTICSEARCH_USERNAME;
  const password = process.env.ELASTICSEARCH_PASSWORD;

  if (!node || !username || !password) {
    throw new Error('Elasticsearch environment variables are not configured');
  }

  client = new Client({
    node,
    auth: { username, password },
  });

  return client;
}

export function getIndexName() {
  return process.env.ELASTICSEARCH_INDEX || 'amazon-electronics';
}
