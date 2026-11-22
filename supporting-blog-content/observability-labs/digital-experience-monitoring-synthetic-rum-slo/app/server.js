// Bean Box: the small coffee shop from the synthetic monitoring and real user monitoring labs,
// now watched by three signals at once: a synthetic journey, EDOT Browser (RUM) and EDOT Node (APM).
// POST /__chaos (bearer CHAOS_TOKEN) switches on the failures the digital experience lab injects.
// Node 22+. Start with `npm start` so telemetry.js loads EDOT Node before this file.
'use strict';

const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { trace, SpanStatusCode } = require('@opentelemetry/api');

const PORT = Number(process.env.PORT || 8080);
const GATEWAY_PORT = Number(process.env.GATEWAY_PORT || 7070);
const SANDBOX_PORT = Number(process.env.SANDBOX_PORT || 7071);
const CHAOS_TOKEN = process.env.CHAOS_TOKEN || 'local-dev-token';
const COLLECTOR_URL = (process.env.COLLECTOR_URL || 'http://localhost:4318').replace(/\/$/, '');
const COLLECTOR_TOKEN = process.env.COLLECTOR_TOKEN || '';
const RUM_SERVICE_NAME = process.env.RUM_SERVICE_NAME || 'bean-box-web';
const SERVICE_VERSION = process.env.SERVICE_VERSION || '2.0.0';
const ENVIRONMENT = process.env.DEPLOYMENT_ENVIRONMENT || 'dem-lab';
const STARTED_AT = new Date().toISOString();
const tracer = trace.getTracer('bean-box');

// ---------- EDOT Browser ----------
// exportConfig.url must be absolute and end with "/": the SDK appends v1/traces, v1/logs, v1/metrics.
const rumConfig = {
  serviceName: RUM_SERVICE_NAME,
  serviceVersion: SERVICE_VERSION,
  resourceAttributes: { 'deployment.environment.name': ENVIRONMENT },
  exportConfig: { url: '__ORIGIN__/otlp/' },
};
const rumHead = `<script src="/static/elastic-otel-browser.min.js"></script>
<script>startBrowserSdk(${JSON.stringify(rumConfig).replace('"__ORIGIN__', 'location.origin+"')});</script>`;

// ---------- failure injection ----------
const chaos = {
  gateway_hang: false,       // the payment gateway accepts connections but never answers (orders time out after 5 s)
  sandbox_down: false,       // the payment provider's sandbox (test cards 4242...) refuses connections
  campaign_banner: false,    // small screens get an unoptimized 3 MB campaign image as the hero
  slow_orders_rate: 0,       // share of orders where the gateway takes 2-4 s to answer
  checkout_build: 'v1',      // 'v2' enables the Place order button with scheduler.postTask (Chromium only)
};
const events = [];
function log(type, detail) {
  const e = { ts: new Date().toISOString(), type, ...detail };
  events.push(e);
  if (events.length > 20000) events.shift();
  console.log(JSON.stringify(e));
}

const products = [
  { id: 'ethiopia-guji', name: 'Ethiopia Guji', price: 18.5, notes: 'Peach, jasmine, black tea' },
  { id: 'colombia-huila', name: 'Colombia Huila', price: 16.0, notes: 'Caramel, red apple, cocoa' },
  { id: 'kenya-nyeri', name: 'Kenya Nyeri', price: 21.0, notes: 'Blackcurrant, grapefruit' },
];
const orders = new Map();

// ---------- payment gateway and sandbox (line-based TCP: AUTH <cents> -> APPROVED <id>) ----------
function gatewayServer(kind) {
  return net.createServer({ allowHalfOpen: true }, (sock) => {
    if (kind === 'sandbox' && chaos.sandbox_down) return sock.destroy();
    sock.setEncoding('utf8');
    let buf = '';
    sock.on('data', (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (kind === 'live' && chaos.gateway_hang) continue; // never answer
        const reply = line.startsWith('AUTH ') ? `APPROVED ${crypto.randomBytes(4).toString('hex')}\n` : 'PONG\n';
        const slow = kind === 'live' && Math.random() < chaos.slow_orders_rate;
        if (slow) setTimeout(() => sock.writable && sock.write(reply), 2000 + Math.random() * 2000);
        else sock.write(reply);
      }
    });
    sock.on('end', () => sock.end());
    sock.on('error', () => {});
  });
}
const SANDBOX_CARD = /^4242/;
function authorize(cents, card) {
  const sandbox = SANDBOX_CARD.test(card || '');
  return tracer.startActiveSpan('payment.authorize', { attributes: { 'payment.gateway': sandbox ? 'sandbox' : 'live' } }, (span) =>
    new Promise((resolve, reject) => {
      const sock = net.connect({ host: '127.0.0.1', port: sandbox ? SANDBOX_PORT : GATEWAY_PORT });
      const timer = setTimeout(() => { sock.destroy(); done(new Error('gateway_timeout')); }, 5000);
      let buf = '';
      let finished = false;
      const done = (err, id) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (err) { span.recordException(err); span.setStatus({ code: SpanStatusCode.ERROR, message: err.message }); }
        span.end();
        err ? reject(err) : resolve(id);
      };
      sock.setEncoding('utf8');
      sock.on('connect', () => sock.write(`AUTH ${cents}\n`));
      sock.on('data', (c) => { buf += c; if (buf.includes('\n')) { sock.end(); done(null, buf.trim().split(' ')[1]); } });
      sock.on('close', () => { if (!buf) done(new Error(sandbox ? 'sandbox_unavailable' : 'gateway_unavailable')); });
      sock.on('error', () => {});
    }));
}

// ---------- HTTP ----------
const css = `body{font-family:system-ui,sans-serif;max-width:860px;margin:0 auto;padding:0 1rem 2rem;color:#222}
header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #ddd;margin-bottom:1rem}
.hero{width:100%;height:auto;aspect-ratio:16/7;border-radius:8px;display:block;object-fit:cover}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1rem}
.product{border:1px solid #ddd;border-radius:8px;padding:1rem}.product img{width:100%;height:auto;aspect-ratio:3/2;border-radius:6px}
button{background:#0b64dd;color:#fff;border:0;border-radius:6px;padding:.6rem 1rem;font-size:1rem;cursor:pointer}
button:disabled{background:#9db7dc;cursor:not-allowed}.grind button{background:#555;margin:.2rem}.grind button.on{background:#0b64dd}
label{display:block;margin:.5rem 0}input{padding:.4rem;width:100%;max-width:320px}
.total{font-size:1.2rem;font-weight:600}.error{color:#b00020}
@media (max-width:600px){.hero.campaign{aspect-ratio:1/1}}`;

function page(title, body, extraHead = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} | Bean Box</title>${rumHead}<style>${css}</style>${extraHead}</head><body>
<header><h1><a href="/" style="color:inherit;text-decoration:none">Bean Box</a></h1><a href="/cart" data-testid="cart-link">Cart</a></header>
${body}</body></html>`;
}

function readCart(req) {
  const m = /(?:^|;\s*)cart=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return [];
  try { return JSON.parse(Buffer.from(m[1], 'base64url').toString()); } catch { return []; }
}
const cartCookie = (items) => `cart=${Buffer.from(JSON.stringify(items)).toString('base64url')}; Path=/; HttpOnly; SameSite=Lax`;
const cartTotal = (items) => items.reduce((s, it) => s + (products.find((p) => p.id === it.id)?.price || 0) * it.qty, 0);

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(body);
}
const json = (res, status, obj, headers = {}) => send(res, status, JSON.stringify(obj), { 'content-type': 'application/json', ...headers });
function readBody(req, limit = 1e5) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { req.destroy(); reject(new Error('too_large')); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
// Name the server span after the route, so APM groups transactions as "POST /api/orders".
function route(req, name) {
  const span = trace.getActiveSpan();
  if (span) { span.updateName(`${req.method} ${name}`); span.setAttribute('http.route', name); }
}

const staticDir = path.join(__dirname, 'static');
const staticTypes = { '.js': 'application/javascript', '.jpg': 'image/jpeg' };
const gzCache = new Map();
const checkoutJs = {
  v1: fs.readFileSync(path.join(__dirname, 'checkout.js'), 'utf8'),
  v2: fs.readFileSync(path.join(__dirname, 'checkout-v2.js'), 'utf8'),
};

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  // Browser telemetry: forward to the EDOT Collector and add the token, so the page never holds it.
  if (p.startsWith('/otlp/')) {
    if (req.method !== 'POST') return send(res, 405, '', { allow: 'POST' });
    const body = await readBody(req, 1e6);
    const upstream = await fetch(`${COLLECTOR_URL}/${p.slice('/otlp/'.length)}`, {
      method: 'POST', body,
      headers: { 'content-type': req.headers['content-type'] || 'application/x-protobuf', authorization: `Bearer ${COLLECTOR_TOKEN}` },
    }).catch(() => null);
    if (!upstream) return send(res, 502, '', { 'content-type': 'text/plain' });
    return send(res, upstream.status, Buffer.from(await upstream.arrayBuffer()), { 'content-type': upstream.headers.get('content-type') || 'application/x-protobuf' });
  }

  if (p === '/__chaos') {
    if (req.headers.authorization !== `Bearer ${CHAOS_TOKEN}`) return json(res, 401, { error: 'unauthorized' });
    if (req.method === 'POST') {
      const body = JSON.parse((await readBody(req)).toString() || '{}');
      for (const [k, v] of Object.entries(body)) if (k in chaos) chaos[k] = v;
      log('chaos', { chaos: { ...chaos }, note: body.note || '' });
    }
    return json(res, 200, { chaos, started_at: STARTED_AT });
  }
  if (p === '/__events') {
    if (req.headers.authorization !== `Bearer ${CHAOS_TOKEN}`) return json(res, 401, { error: 'unauthorized' });
    const since = url.searchParams.get('since') || '';
    return json(res, 200, events.filter((e) => e.ts >= since && e.type !== 'page'));
  }
  if (p === '/health') return json(res, 200, { status: 'ok', started_at: STARTED_AT });

  if (p.startsWith('/static/')) {
    const name = path.basename(p);
    if (name === 'checkout.js') return send(res, 200, checkoutJs[chaos.checkout_build] || checkoutJs.v1, { 'content-type': 'application/javascript' });
    const file = path.join(staticDir, name);
    if (!fs.existsSync(file)) return send(res, 404, 'not found', { 'content-type': 'text/plain' });
    if (name.endsWith('.js') && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      if (!gzCache.has(name)) gzCache.set(name, zlib.gzipSync(fs.readFileSync(file), { level: 9 }));
      return send(res, 200, gzCache.get(name), { 'content-type': 'application/javascript', 'content-encoding': 'gzip', vary: 'Accept-Encoding', 'cache-control': 'public, max-age=3600' });
    }
    return send(res, 200, fs.readFileSync(file), { 'content-type': staticTypes[path.extname(name)] || 'application/octet-stream', 'cache-control': 'public, max-age=3600' });
  }

  if (p === '/' && req.method === 'GET') {
    route(req, '/');
    // With the campaign on, phones get a square banner: the design export straight from the CMS (1800x1800, 3 MB).
    const hero = chaos.campaign_banner
      ? `<picture><source media="(max-width: 600px)" srcset="/static/hero-campaign-mobile.jpg"><img class="hero campaign" src="/static/hero.jpg" width="1600" height="700" alt="Roasted coffee beans"></picture>`
      : '<img class="hero" src="/static/hero.jpg" width="1600" height="700" alt="Roasted coffee beans">';
    const list = products.map((pr) => `<div class="product" data-testid="product-${pr.id}">
<a href="/product/${pr.id}"><img src="/static/${pr.id}.jpg" width="600" height="400" alt="${pr.name} beans"></a>
<h2><a href="/product/${pr.id}" data-testid="open-${pr.id}">${pr.name}</a></h2><p>${pr.notes}</p><p>$${pr.price.toFixed(2)}</p></div>`).join('');
    return send(res, 200, page('Shop', `<main>${hero}<p>Single-origin coffee, roasted weekly.</p><div class="grid">${list}</div></main>`));
  }

  const pm = /^\/product\/([a-z-]+)$/.exec(p);
  if (pm && req.method === 'GET') {
    route(req, '/product/:id');
    const pr = products.find((x) => x.id === pm[1]);
    if (!pr) return send(res, 404, page('Not found', '<p>Product not found.</p>'));
    return send(res, 200, page(pr.name, `<main><img class="hero" src="/static/${pr.id}.jpg" width="600" height="400" alt="${pr.name} beans" style="max-width:600px">
<h2>${pr.name}</h2><p>${pr.notes}</p><p>$${pr.price.toFixed(2)} for 340 g</p>
<div class="grind">Grind: <button type="button" data-testid="grind-whole">Whole bean</button><button type="button" data-testid="grind-filter">Filter</button><button type="button" data-testid="grind-espresso">Espresso</button></div>
<form method="post" action="/cart"><input type="hidden" name="id" value="${pr.id}"><p><button type="submit" data-testid="add-to-cart">Add to cart</button></p></form></main>
<script>document.querySelectorAll('.grind button').forEach(function(b){b.addEventListener('click',function(){document.querySelectorAll('.grind button').forEach(function(x){x.classList.toggle('on',x===b)});});});</script>`));
  }

  if (p === '/cart' && req.method === 'POST') {
    route(req, '/cart');
    const id = new URLSearchParams((await readBody(req)).toString()).get('id');
    const items = readCart(req);
    if (products.some((pr) => pr.id === id)) {
      const it = items.find((i) => i.id === id);
      it ? it.qty++ : items.push({ id, qty: 1 });
    }
    return send(res, 303, '', { location: '/cart', 'set-cookie': cartCookie(items) });
  }

  if (p === '/cart' && req.method === 'GET') {
    route(req, '/cart');
    const items = readCart(req);
    if (!items.length) return send(res, 200, page('Cart', '<p data-testid="cart-empty">Your cart is empty.</p>'));
    const rows = items.map((it) => `<li data-testid="cart-item">${products.find((x) => x.id === it.id).name} x ${it.qty}</li>`).join('');
    return send(res, 200, page('Cart', `<ul>${rows}</ul><p class="total" data-testid="cart-total">Total: $${cartTotal(items).toFixed(2)}</p>
<a href="/checkout"><button data-testid="go-checkout">Checkout</button></a>`));
  }

  if (p === '/checkout' && req.method === 'GET') {
    route(req, '/checkout');
    const items = readCart(req);
    return send(res, 200, page('Checkout', `<h2>Checkout</h2>
<p class="total" data-testid="checkout-total">Total: $${cartTotal(items).toFixed(2)}</p>
<form id="checkout-form">
<label>Email <input name="email" type="email" required data-testid="email"></label>
<label>Card number <input name="card" required data-testid="card"></label>
<button type="submit" id="place-order" data-testid="place-order" disabled>Place order</button>
<p class="error" id="checkout-error" data-testid="checkout-error"></p></form>`, '<script src="/static/checkout.js" defer></script>'));
  }

  if (p === '/api/orders' && req.method === 'POST') {
    route(req, '/api/orders');
    const items = readCart(req);
    if (!items.length) return json(res, 400, { error: 'empty_cart' });
    let card = '';
    try { card = String(JSON.parse((await readBody(req)).toString() || '{}').card || '').replace(/\s/g, ''); } catch {}
    const cents = Math.round(cartTotal(items) * 100);
    try {
      const authId = await authorize(cents, card);
      const id = `BB-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      orders.set(id, { id, cents, authId, ts: new Date().toISOString() });
      log('order', { id, sandbox: SANDBOX_CARD.test(card) });
      return json(res, 201, { order_id: id, auth_id: authId }, { 'set-cookie': cartCookie([]) });
    } catch (err) {
      log('payment_failed', { reason: err.message, sandbox: SANDBOX_CARD.test(card) });
      return json(res, 502, { error: 'payment_failed', reason: err.message });
    }
  }

  const om = /^\/order\/(BB-[0-9A-F]{6})$/.exec(p);
  if (om && req.method === 'GET') {
    route(req, '/order/:id');
    const o = orders.get(om[1]);
    if (!o) return send(res, 404, page('Not found', '<p>Order not found.</p>'));
    return send(res, 200, page('Order confirmed', `<h2 data-testid="order-confirmed">Thanks, your order is confirmed</h2>
<p>Order <strong data-testid="order-id">${o.id}</strong>, $${(o.cents / 100).toFixed(2)}</p>`));
  }

  return send(res, 404, page('Not found', '<p>Page not found.</p>'));
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) json(res, 500, { error: 'internal' });
  });
});
gatewayServer('live').listen(GATEWAY_PORT, '127.0.0.1');
gatewayServer('sandbox').listen(SANDBOX_PORT, '127.0.0.1');
server.listen(PORT, '::', () => console.log(`bean box on :${PORT}`));
