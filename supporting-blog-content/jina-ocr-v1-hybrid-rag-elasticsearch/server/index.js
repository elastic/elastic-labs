import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Client } from '@elastic/elasticsearch';
import documentsRouter from './documents.js';
import { createSearchRouter } from './search.js';

const app = express();
const PORT = process.env.PORT || 3001;

const INDEX = process.env.ELASTICSEARCH_INDEX || 'texas-native-plants';

const client = new Client({
  node: process.env.ELASTICSEARCH_URL,
  auth: { apiKey: process.env.ELASTICSEARCH_API_KEY },
});

app.use(cors());
app.use(express.json());
app.use(documentsRouter);

function normalize(val) {
  return typeof val === 'string'
    ? val.toLowerCase().replace(/\s+/g, '_')
    : val;
}

function mapProduct(hit) {
  const s = hit._source;

  return {
    id: hit._id,
    sku: s.sku,
    name: s.name,
    description: s.description,
    long_description: s.long_description,
    price: s.price,
    category: s.categories?.[0] || '',
    images: s.image_url ? [s.image_url] : [],
    tags: s.tags || [],
    region: s.region || '',
    sunlight: s.sun,
    water_needs: s.water,
  };
}

app.use(createSearchRouter(client, INDEX, mapProduct));

app.get('/api/products/:id', async (req, res) => {
  try {
    const result = await client.get({
      index: INDEX,
      id: req.params.id,
    });

    res.json(mapProduct(result));
  } catch (err) {
    if (err.meta?.statusCode === 404) {
      return res.status(404).json({ error: 'Product not found' });
    }
    console.error('Product error:', err.message);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

app.get('/api/featured', async (req, res) => {
  try {
    const result = await client.search({
      index: INDEX,
      query: { match_all: {} },
      size: 10,
    });

    res.json(result.hits.hits.map(mapProduct));
  } catch (err) {
    console.error('Featured error:', err.message);
    res.status(500).json({ error: 'Failed to fetch featured products' });
  }
});

app.listen(PORT, () => {
  console.log(`Server → http://localhost:${PORT}`);
});