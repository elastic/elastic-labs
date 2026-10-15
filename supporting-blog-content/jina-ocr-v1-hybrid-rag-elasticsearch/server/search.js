/**
 * Search: full-text (BM25) vs hybrid (BM25 + semantic, fused with RRF).
 *
 * Both modes search the SAME text. `long_description` is a lexical text field
 * mirrored by copy_to into `long_description_semantic` (semantic_text), so the
 * only difference between modes is retrieval technique, not how much text
 * each one can see.
 *
 * Every result carries provenance so the UI can show why it matched:
 *   match.lexical_rank   position in the pure keyword ranking (null = not found)
 *   match.semantic_rank  position in the pure semantic ranking (null = not found)
 *   snippet              best highlight: keyword <mark>s or the semantic chunk
 */

import { Router } from 'express';

const MAX = 60;

const CATEGORY_MAP = {
  grasses: 'grass', trees: 'tree', shrubs: 'shrub',
  wildflowers: 'wildflower', succulents: 'succulent', ferns: 'fern',
};

const norm = (v) => (typeof v === 'string' ? v.toLowerCase().replace(/\s+/g, '_') : v);

function buildFilters({ category, sunlight, water_needs }) {
  const filter = [];
  if (category) {
    const c = norm(category);
    filter.push({ term: { categories: CATEGORY_MAP[c] ?? c.replace(/s$/, '') } });
  }
  if (sunlight) filter.push({ term: { sun: norm(sunlight) } });
  if (water_needs) filter.push({ term: { water: norm(water_needs) } });
  return filter;
}

/* ---------- the two legs ---------- */

// Pure BM25. Typo tolerance only on name/description; exact matches on sku and
// phrase matches on name are boosted so "red yucca" still ranks Red Yucca first.
function lexicalQuery(q, filter) {
  return {
    bool: {
      filter,
      minimum_should_match: 1,
      should: [
        { term: { sku: { value: String(q).toUpperCase(), boost: 50 } } },
        { match_phrase: { name: { query: q, boost: 10 } } },
        {
          multi_match: {
            query: q,
            fields: ['name^4', 'description^2', 'long_description', 'categories'],
            type: 'best_fields',
            fuzziness: 'AUTO',
            prefix_length: 1,
          },
        },
      ],
    },
  };
}

// Pure semantic. The query is embedded by Elasticsearch with the same endpoint
// that embedded the documents; filters apply exactly as in the lexical leg.
function semanticQuery(q, filter) {
  return {
    bool: {
      filter,
      must: [{ semantic: { field: 'long_description_semantic', query: q } }],
    },
  };
}

const HIGHLIGHT = {
  pre_tags: ['<mark>'],
  post_tags: ['</mark>'],
  fields: {
    name: { number_of_fragments: 0 },
    description: { number_of_fragments: 0 },
    long_description: { fragment_size: 180, number_of_fragments: 1 },
    long_description_semantic: { number_of_fragments: 1 },
  },
};

/* ---------- execution ---------- */

export function createSearchRouter(client, INDEX, mapProduct) {
  const router = Router();

  async function run(retriever, size, from, withHighlight) {
    const result = await client.search({
      index: INDEX,
      size,
      from,
      retriever,
      ...(withHighlight ? { highlight: HIGHLIGHT } : {}),
    });
    const total = typeof result.hits.total === 'number' ? result.hits.total : result.hits.total.value;
    return { total, hits: result.hits.hits };
  }

  function pickSnippet(hit) {
    const h = hit.highlight ?? {};
    if (h.long_description_semantic?.[0]) return { source: 'semantic', text: h.long_description_semantic[0] };
    if (h.description?.[0]) return { source: 'keyword', text: h.description[0] };
    if (h.long_description?.[0]) return { source: 'keyword', text: h.long_description[0] };
    if (h.name?.[0]) return { source: 'keyword', text: h.name[0] };
    return null;
  }

  // Runs the requested mode plus the two pure legs (for provenance) in parallel.
  async function search({ q, mode, filter, size, from }) {
    if (!q) {
      const { total, hits } = await run(
        { standard: { query: { bool: { must: [{ match_all: {} }], filter } } } },
        size, from, false
      );
      return { total, products: hits.map((h) => mapProduct(h)), stats: null };
    }

    const lexical = { standard: { query: lexicalQuery(q, filter) } };
    const semantic = { standard: { query: semanticQuery(q, filter) } };
    const hybrid = { rrf: { rank_window_size: MAX, retrievers: [lexical, semantic] } };

    const main = mode === 'hybrid' ? hybrid : lexical;

    const [primary, lexOnly, semOnly] = await Promise.all([
      run(main, size, from, true),
      run(lexical, MAX, 0, false),
      run(semantic, MAX, 0, false),
    ]);

    const lexRank = new Map(lexOnly.hits.map((h, i) => [h._id, i + 1]));
    const semRank = new Map(semOnly.hits.map((h, i) => [h._id, i + 1]));

    let both = 0, lexicalOnly = 0, semanticOnly = 0;
    const products = primary.hits.map((h) => {
      const lr = lexRank.get(h._id) ?? null;
      const sr = semRank.get(h._id) ?? null;
      if (lr && sr) both++; else if (lr) lexicalOnly++; else if (sr) semanticOnly++;
      return {
        ...mapProduct(h),
        match: { lexical_rank: lr, semantic_rank: sr },
        snippet: pickSnippet(h),
      };
    });

    return {
      total: primary.total,
      products,
      stats: { both, lexical_only: lexicalOnly, semantic_only: semanticOnly },
    };
  }

  router.get('/api/search', async (req, res) => {
    const { q, category, sunlight, water_needs, size = MAX, from = 0 } = req.query;
    const mode = req.query.mode === 'hybrid' ? 'hybrid' : 'fulltext'; // 'legacy' accepted as full-text
    try {
      const filter = buildFilters({ category, sunlight, water_needs });
      const out = await search({ q, mode, filter, size: Math.min(Number(size), MAX), from: Number(from) });
      res.json({ mode, ...out });
    } catch (err) {
      console.error('Search error:', err.message);
      res.status(500).json({ error: 'Search failed', message: err.message });
    }
  });

  // Both rankings for the same query, so the UI can show exactly how they differ.
  router.get('/api/search/compare', async (req, res) => {
    const { q, category, sunlight, water_needs } = req.query;
    try {
      const filter = buildFilters({ category, sunlight, water_needs });
      const [fulltext, hybrid] = await Promise.all([
        search({ q, mode: 'fulltext', filter, size: MAX, from: 0 }),
        search({ q, mode: 'hybrid', filter, size: MAX, from: 0 }),
      ]);
      const ftIds = new Set(fulltext.products.map((p) => p.id));
      const hyIds = new Set(hybrid.products.map((p) => p.id));
      const ftPos = new Map(fulltext.products.map((p, i) => [p.id, i + 1]));
      const summary = {
        surfaced_by_hybrid: hybrid.products.filter((p) => !ftIds.has(p.id)).length,
        dropped_by_hybrid: fulltext.products.filter((p) => !hyIds.has(p.id)).length,
        reordered: hybrid.products.filter((p, i) => ftPos.has(p.id) && ftPos.get(p.id) !== i + 1).length,
      };
      res.json({ fulltext, hybrid, summary });
    } catch (err) {
      console.error('Compare error:', err.message);
      res.status(500).json({ error: 'Compare failed', message: err.message });
    }
  });

  return router;
}
