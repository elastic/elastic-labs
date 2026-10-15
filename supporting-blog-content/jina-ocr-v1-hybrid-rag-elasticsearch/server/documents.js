/**
 * Documents + RAG routes.
 *
 * POST /api/documents/upload          multipart upload (pdf/png/jpg/webp) -> { jobId, index }
 * GET  /api/documents/progress/:jobId SSE stream of pipeline progress events
 * GET  /api/documents                 list of parsed documents (from doc-registry)
 * POST /api/chat                      { question, index } -> SSE: sources, answer deltas
 *
 * Pipeline per upload: render PDF pages to PNG -> OCR each page through the
 * EIS `.jina-ocr-v1-chat_completion` endpoint (parallel, order preserved) ->
 * stitch Markdown with <!-- page N --> markers -> create a hybrid index named
 * after the document (text + copy_to semantic_text) -> index it.
 */

import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { pdfToPng } from 'pdf-to-png-converter';

const ES_URL = (process.env.ELASTICSEARCH_URL || '').replace(/\/$/, '');
const ES_API_KEY = process.env.ELASTICSEARCH_API_KEY || '';
const OCR_INFERENCE_ID = process.env.OCR_INFERENCE_ID || '.jina-ocr-v1-chat_completion';
const CONCURRENCY = Number(process.env.OCR_CONCURRENCY || 4);
const REGISTRY_INDEX = 'doc-registry';

const esHeaders = {
  Authorization: `ApiKey ${ES_API_KEY}`,
  'Content-Type': 'application/json',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const router = Router();

/* ───────────────────────── job tracking (SSE) ───────────────────────── */

const jobs = new Map(); // jobId -> { events: [], listeners: Set, finished: boolean }

function createJob() {
  const id = randomUUID();
  jobs.set(id, { events: [], listeners: new Set(), finished: false });
  return id;
}

function emit(jobId, event) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.events.push(event);
  if (event.type === 'done' || event.type === 'error') job.finished = true;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of job.listeners) res.write(payload);
  if (job.finished) {
    for (const res of job.listeners) res.end();
    job.listeners.clear();
    setTimeout(() => jobs.delete(jobId), 10 * 60 * 1000); // keep replayable 10 min
  }
}

/* ───────────────────────── helpers ───────────────────────── */

function slugifyIndexName(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return slug || 'uploaded-document';
}

async function ocrPage(pngBuffer, pageNum) {
  const body = {
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${pngBuffer.toString('base64')}` },
          },
          {
            type: 'text',
            text: 'Transcribe the provided document image into a clean Markdown format, preserving the natural reading order. Represent tables as HTML tables.',
          },
        ],
      },
    ],
  };
  const resp = await fetch(`${ES_URL}/_inference/chat_completion/${OCR_INFERENCE_ID}/_stream`, {
    method: 'POST',
    headers: esHeaders,
    body: JSON.stringify(body),
  });
  if (!resp.ok || !resp.body) {
    throw new Error(`OCR failed on page ${pageNum}: ${resp.status} ${await resp.text()}`);
  }
  let markdown = '';
  let buffer = '';
  const decoder = new TextDecoder();
  for await (const chunk of resp.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const event = JSON.parse(payload);
        const delta = event?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string') markdown += delta;
      } catch { /* keep-alive frames */ }
    }
  }
  return markdown;
}

async function createHybridIndex(indexName) {
  // Overwrite on re-upload so the demo is repeatable.
  await fetch(`${ES_URL}/${indexName}`, { method: 'DELETE', headers: esHeaders }).catch(() => {});
  const resp = await fetch(`${ES_URL}/${indexName}`, {
    method: 'PUT',
    headers: esHeaders,
    body: JSON.stringify({
      mappings: {
        properties: {
          content: { type: 'text', copy_to: 'content_semantic' },
          content_semantic: { type: 'semantic_text' },
          title: { type: 'keyword' },
          source_file: { type: 'keyword' },
          page_count: { type: 'integer' },
          ingested_at: { type: 'date' },
        },
      },
    }),
  });
  if (!resp.ok) throw new Error(`Index creation failed: ${await resp.text()}`);
}

async function registerDocument(entry) {
  await fetch(`${ES_URL}/${REGISTRY_INDEX}/_doc/${entry.index}?refresh=true`, {
    method: 'PUT',
    headers: esHeaders,
    body: JSON.stringify(entry),
  });
}

/* ───────────────────────── the pipeline ───────────────────────── */

async function runPipeline(jobId, file) {
  const indexName = slugifyIndexName(file.originalname);
  try {
    emit(jobId, { type: 'status', message: `Received ${file.originalname} (${(file.size / 1024 / 1024).toFixed(1)} MB)` });

    // 1. Render to page images
    let pages;
    if (file.mimetype === 'application/pdf') {
      emit(jobId, { type: 'status', message: 'Rendering PDF pages to images…' });
      const rendered = await pdfToPng(file.buffer, { viewportScale: 2.0, disableFontFace: true });
      pages = rendered.map((p) => p.content).filter(Boolean);
    } else {
      pages = [file.buffer]; // single image upload
    }
    emit(jobId, { type: 'rendered', total: pages.length });

    // 2. OCR every page through EIS, in parallel, order preserved
    const results = new Array(pages.length);
    let next = 0;
    let completed = 0;
    let tablePreviewSent = false;

    const worker = async () => {
      while (next < pages.length) {
        const i = next++;
        const md = await ocrPage(pages[i], i + 1);
        results[i] = md;
        completed++;
        emit(jobId, { type: 'page', page: i + 1, total: pages.length, completed, chars: md.length });

        // Show off table extraction the moment the model returns one.
        if (!tablePreviewSent && md.includes('<table')) {
          const match = md.match(/<table[\s\S]*?<\/table>/);
          if (match) {
            tablePreviewSent = true;
            emit(jobId, { type: 'table_preview', page: i + 1, html: match[0].slice(0, 6000) });
          }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pages.length) }, worker));

    // 3. Stitch + index
    emit(jobId, { type: 'status', message: `Creating hybrid index "${indexName}"…` });
    const markdown = results.map((p, i) => `<!-- page ${i + 1} -->\n${p}`).join('\n\n');
    await createHybridIndex(indexName);

    const doc = {
      content: markdown,
      title: file.originalname,
      source_file: file.originalname,
      page_count: pages.length,
      ingested_at: new Date().toISOString(),
    };
    emit(jobId, { type: 'status', message: 'Indexing document (Elasticsearch is chunking + embedding it now)…' });
    const indexResp = await fetch(`${ES_URL}/${indexName}/_doc?refresh=wait_for`, {
      method: 'POST',
      headers: esHeaders,
      body: JSON.stringify(doc),
    });
    if (!indexResp.ok) throw new Error(`Indexing failed: ${await indexResp.text()}`);

    await registerDocument({
      index: indexName,
      title: file.originalname,
      page_count: pages.length,
      ingested_at: doc.ingested_at,
    });

    emit(jobId, { type: 'done', index: indexName, pages: pages.length, chars: markdown.length });
  } catch (err) {
    console.error('Pipeline error:', err);
    emit(jobId, { type: 'error', message: err.message });
  }
}

/* ───────────────────────── routes ───────────────────────── */

const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

router.post('/api/documents/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  if (!ALLOWED.includes(req.file.mimetype)) {
    return res.status(400).json({ error: 'Upload a PDF, PNG, JPEG, or WebP file' });
  }
  const jobId = createJob();
  const index = slugifyIndexName(req.file.originalname);
  runPipeline(jobId, req.file); // fire and forget; progress flows over SSE
  res.json({ jobId, index });
});

router.get('/api/documents/progress/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Unknown job' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  for (const event of job.events) res.write(`data: ${JSON.stringify(event)}\n\n`);
  if (job.finished) return res.end();

  job.listeners.add(res);
  req.on('close', () => job.listeners.delete(res));
});

router.get('/api/documents', async (_req, res) => {
  try {
    const resp = await fetch(`${ES_URL}/${REGISTRY_INDEX}/_search`, {
      method: 'POST',
      headers: esHeaders,
      body: JSON.stringify({ size: 50, sort: [{ ingested_at: 'desc' }], query: { match_all: {} } }),
    });
    if (resp.status === 404) return res.json([]); // registry not created yet
    const json = await resp.json();
    res.json((json.hits?.hits ?? []).map((h) => h._source));
  } catch (err) {
    console.error('Registry error:', err.message);
    res.json([]);
  }
});

/* ───────────────────────── RAG chat ───────────────────────── */

const CATALOG_INDEX = process.env.ELASTICSEARCH_INDEX || 'texas_natives';

let llmId = process.env.LLM_INFERENCE_ID || '';

async function resolveLlm() {
  if (llmId) {
    if (!resolveLlm.logged) {
      console.log(`Chat LLM: ${llmId} (pinned via LLM_INFERENCE_ID)`);
      resolveLlm.logged = true;
    }
    return llmId;
  }
  const resp = await fetch(`${ES_URL}/_inference/chat_completion/_all`, { headers: esHeaders });
  if (!resp.ok) throw new Error('Could not list inference endpoints');
  const json = await resp.json();
  const candidate = (json.endpoints ?? [])
    .map((e) => e.inference_id)
    .find((id) => !id.includes('ocr'));
  if (!candidate) {
    throw new Error('No chat LLM endpoint found. Set LLM_INFERENCE_ID in .env (list endpoints with GET _inference/chat_completion/_all)');
  }
  llmId = candidate;
  console.warn(`WARNING: LLM_INFERENCE_ID is not set. Auto-detected ${llmId}. Pin it in .env for reproducible results.`);
  return llmId;
}

// "Native-and-Adaptive-Plants.pdf" -> "Native and Adaptive Plants"
function displayTitle(title) {
  return String(title || '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractPage(fragment) {
  const m = fragment.match(/<!--\s*page\s+(\d+)\s*-->/);
  return m ? m[1] : null;
}

async function listDocumentIndices() {
  try {
    const resp = await fetch(`${ES_URL}/${REGISTRY_INDEX}/_search`, {
      method: 'POST',
      headers: esHeaders,
      body: JSON.stringify({ size: 50, _source: ['index', 'title'], query: { match_all: {} } }),
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    return (json.hits?.hits ?? []).map((h) => h._source);
  } catch {
    return [];
  }
}

// Hybrid retrieval over one or more parsed-document indices -> passages.
async function retrieveDocs(indices, question) {
  if (indices.length === 0) return [];
  const resp = await fetch(`${ES_URL}/${indices.join(',')}/_search?ignore_unavailable=true`, {
    method: 'POST',
    headers: esHeaders,
    body: JSON.stringify({
      retriever: {
        rrf: {
          rank_window_size: 30,
          retrievers: [
            { standard: { query: { match: { content: question } } } },
            { standard: { query: { semantic: { field: 'content_semantic', query: question } } } },
          ],
        },
      },
      size: 3,
      _source: ['title'],
      highlight: {
        fields: {
          content_semantic: { number_of_fragments: 4, order: 'score' },
          content: { fragment_size: 350, number_of_fragments: 2, order: 'score' },
        },
      },
    }),
  });
  if (!resp.ok) throw new Error(`Document search failed: ${await resp.text()}`);
  const json = await resp.json();

  const passages = [];
  const seen = new Set();
  for (const hit of json.hits?.hits ?? []) {
    const title = displayTitle(hit._source?.title ?? hit._index);
    for (const frag of hit.highlight?.content_semantic ?? []) {
      const key = frag.slice(0, 80);
      if (!seen.has(key)) { seen.add(key); passages.push({ text: frag, page: extractPage(frag), kind: 'semantic', doc: title }); }
    }
    for (const raw of hit.highlight?.content ?? []) {
      const frag = raw.replace(/<\/?em>/g, '');
      const key = frag.slice(0, 80);
      if (!seen.has(key)) { seen.add(key); passages.push({ text: frag, page: extractPage(frag), kind: 'lexical', doc: title }); }
    }
  }
  return passages.slice(0, 5);
}

// Hybrid retrieval over the plant catalog -> products the shopper can buy.
async function retrieveCatalog(question) {
  const resp = await fetch(`${ES_URL}/${CATALOG_INDEX}/_search?ignore_unavailable=true`, {
    method: 'POST',
    headers: esHeaders,
    body: JSON.stringify({
      retriever: {
        rrf: {
          rank_window_size: 30,
          retrievers: [
            { standard: { query: { multi_match: { query: question, fields: ['name^3', 'description^2', 'long_description', 'categories'] } } } },
            { standard: { query: { semantic: { field: 'long_description_semantic', query: question } } } },
          ],
        },
      },
      size: 4,
      _source: ['sku', 'name', 'description', 'price', 'sun', 'water', 'image_url', 'categories'],
    }),
  });
  if (!resp.ok) return []; // catalog absent or not yet seeded: chat still works on documents
  const json = await resp.json();
  return (json.hits?.hits ?? []).map((h) => ({
    id: h._id,
    sku: h._source.sku,
    name: h._source.name,
    description: h._source.description,
    price: h._source.price,
    sun: h._source.sun,
    water: h._source.water,
    image_url: h._source.image_url,
    category: h._source.categories?.[0] ?? '',
  }));
}

function buildPrompt(question, passages, products, scopeLabel) {
  const sourceText = passages.length
    ? passages.map((p) => `[Source: ${p.doc}${p.page ? `, p. ${p.page}` : ''}]\n${p.text}`).join('\n\n')
    : '(none)';
  const productText = products.length
    ? products.map((p) => `- ${p.sku} | ${p.name} (${p.category}; sun: ${p.sun}; water: ${p.water}; $${p.price}): ${p.description}`).join('\n')
    : '(none)';
  return [
    `You are the plant advisor for a Texas native plant store. Scope: ${scopeLabel}.`,
    'Answer the question using ONLY the reference sources and the catalog products below.',
    'When you use a reference source, cite it inline by its name and page, for example (Native and Adaptive Plants, p. 50). Never use the word "passage".',
    'Recommend catalog products by name only when they genuinely fit the need. Never invent products that are not listed, and do not mention catalog products that do not fit.',
    'If neither source answers the question, say so plainly. Be concise and practical. Use plain sentences or short bullet lists.',
    '',
    'After your answer, add one final line in exactly this form, listing the SKUs of catalog products you recommended, or "none":',
    'RECOMMENDED: TX-PL-001, TX-PL-002',
    '',
    'REFERENCE SOURCES:',
    sourceText,
    '',
    'CATALOG PRODUCTS (available to buy):',
    productText,
    '',
    `QUESTION: ${question}`,
  ].join('\n');
}

const TRAILER = 'RECOMMENDED:';

router.post('/api/chat', async (req, res) => {
  const question = String(req.body?.question ?? '').trim();
  const scope = String(req.body?.scope ?? 'all').trim(); // 'all' | 'catalog' | <document index>
  if (!question) return res.status(400).json({ error: 'question required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  try {
    let docIndices = [];
    let includeCatalog = false;
    let scopeLabel = '';
    if (scope === 'all') {
      docIndices = (await listDocumentIndices()).map((d) => d.index);
      includeCatalog = true;
      scopeLabel = 'the plant catalog and every uploaded document';
    } else if (scope === 'catalog') {
      includeCatalog = true;
      scopeLabel = 'the plant catalog only';
    } else {
      docIndices = [scope];
      scopeLabel = `the document "${scope}" only`;
    }

    const [passages, products] = await Promise.all([
      retrieveDocs(docIndices, question),
      includeCatalog ? retrieveCatalog(question) : Promise.resolve([]),
      resolveLlm(),
    ]);
    send({ type: 'sources', passages });

    if (passages.length === 0 && products.length === 0) {
      send({ type: 'delta', text: 'Nothing in the selected scope matched that question.' });
      send({ type: 'done' });
      return res.end();
    }

    const llmResp = await fetch(`${ES_URL}/_inference/chat_completion/${llmId}/_stream`, {
      method: 'POST',
      headers: esHeaders,
      body: JSON.stringify({ messages: [{ role: 'user', content: buildPrompt(question, passages, products, scopeLabel) }] }),
    });
    if (!llmResp.ok || !llmResp.body) throw new Error(`LLM call failed: ${llmResp.status} ${await llmResp.text()}`);

    let buffer = '';
    let pending = '';          // text not yet released to the client
    let trailer = null;        // everything from RECOMMENDED: onward
    const decoder = new TextDecoder();
    const KEEP = TRAILER.length + 2; // hold back enough to catch a marker split across chunks

    for await (const chunk of llmResp.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        let delta = '';
        try { delta = JSON.parse(payload)?.choices?.[0]?.delta?.content ?? ''; } catch { continue; }
        if (!delta || trailer !== null) { if (trailer !== null) trailer += delta; continue; }
        pending += delta;
        const at = pending.indexOf(TRAILER);
        if (at !== -1) {
          trailer = pending.slice(at + TRAILER.length);
          const visible = pending.slice(0, at).replace(/\s+$/, '');
          if (visible) send({ type: 'delta', text: visible });
          pending = '';
        } else if (pending.length > KEEP) {
          send({ type: 'delta', text: pending.slice(0, pending.length - KEEP) });
          pending = pending.slice(pending.length - KEEP);
        }
      }
    }
    if (pending && trailer === null) send({ type: 'delta', text: pending });

    // Only the products the model actually recommended become cards.
    const wanted = new Set((trailer ?? '').toUpperCase().match(/[A-Z]{2}-[A-Z]{2}-\d+/g) ?? []);
    const recommended = products.filter((p) => wanted.has(String(p.sku).toUpperCase()));
    send({ type: 'recommended', products: recommended });

    send({ type: 'done' });
  } catch (err) {
    console.error('Chat error:', err.message);
    send({ type: 'error', message: err.message });
  } finally {
    res.end();
  }
});

export default router;
