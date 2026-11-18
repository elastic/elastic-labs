// Bean Box: a small coffee shop used as the target of the synthetic monitoring lab.
// HTTP on $PORT (storefront, checkout, API) and a line-based payment gateway on $GATEWAY_PORT (TCP).
// No dependencies, Node 22+.
'use strict';

const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 8080);
const GATEWAY_PORT = Number(process.env.GATEWAY_PORT || 7070);
const CHAOS_TOKEN = process.env.CHAOS_TOKEN || 'local-dev-token';
const STARTED_AT = new Date().toISOString();

// Failure injection state. Changed through POST /__chaos.
const chaos = {
  error_rate: 0,          // probability (0-1) that storefront and API requests return 503
  latency_ms: 0,          // extra latency on /checkout and /api/orders
  gateway_latency_ms: 0,  // extra latency inside the payment gateway before it answers
  gateway_down: false,    // gateway refuses connections (closes them immediately)
  broken_asset: false,    // /static/checkout.js returns 404, so the Place order button never enables
  health_down: false,     // /health returns 503
  block_ips: [],          // drop HTTP connections whose client IP is listed (simulates a broken network path from one location)
};
const events = [];

function log(type, detail) {
  const e = { ts: new Date().toISOString(), type, ...detail };
  events.push(e);
  if (events.length > 5000) events.shift();
  console.log(JSON.stringify(e));
}

const products = [
  { id: 'ethiopia-guji', name: 'Ethiopia Guji', price: 18.5, notes: 'Peach, jasmine, black tea' },
  { id: 'colombia-huila', name: 'Colombia Huila', price: 16.0, notes: 'Caramel, red apple, cocoa' },
  { id: 'kenya-nyeri', name: 'Kenya Nyeri', price: 21.0, notes: 'Blackcurrant, grapefruit' },
];
const orders = new Map();

// ---------- payment gateway (TCP) ----------
// Protocol, one line per request:
//   PING                -> PONG
//   AUTH <amount_cents> -> APPROVED <auth_id> | DECLINED <reason>
const gateway = net.createServer({ allowHalfOpen: true }, (sock) => {
  if (chaos.gateway_down) {
    sock.destroy();
    return;
  }
  sock.setEncoding('utf8');
  let buf = '';
  sock.on('data', (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      setTimeout(() => {
        if (sock.destroyed) return;
        if (line === 'PING') sock.write('PONG\n');
        else if (line.startsWith('AUTH ')) {
          const cents = Number(line.slice(5));
          if (!Number.isFinite(cents) || cents <= 0) sock.write('DECLINED bad_amount\n');
          else sock.write(`APPROVED ${crypto.randomBytes(4).toString('hex')}\n`);
        } else sock.write('ERR unknown_command\n');
      }, chaos.gateway_latency_ms);
    }
  });
  sock.on('end', () => setTimeout(() => sock.end(), chaos.gateway_latency_ms + 50));
  sock.on('error', () => {});
});

function authorize(cents) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: '127.0.0.1', port: GATEWAY_PORT });
    const timer = setTimeout(() => { sock.destroy(); reject(new Error('gateway_timeout')); }, 5000);
    let buf = '';
    sock.setEncoding('utf8');
    sock.on('connect', () => sock.write(`AUTH ${cents}\n`));
    sock.on('data', (c) => {
      buf += c;
      if (buf.includes('\n')) {
        clearTimeout(timer);
        sock.end();
        const [status, value] = buf.trim().split(' ');
        status === 'APPROVED' ? resolve(value) : reject(new Error(`declined_${value}`));
      }
    });
    sock.on('close', () => { clearTimeout(timer); if (!buf) reject(new Error('gateway_unavailable')); });
    sock.on('error', () => {});
  });
}

// ---------- HTTP ----------
const css = `body{font-family:system-ui,sans-serif;max-width:760px;margin:2rem auto;padding:0 1rem;color:#222}
header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #ddd;margin-bottom:1rem}
.product{border:1px solid #ddd;border-radius:8px;padding:1rem;margin:.75rem 0}
button{background:#0b64dd;color:#fff;border:0;border-radius:6px;padding:.6rem 1rem;font-size:1rem;cursor:pointer}
button:disabled{background:#9db7dc;cursor:not-allowed}
label{display:block;margin:.5rem 0}input{padding:.4rem;width:100%;max-width:320px}
.total{font-size:1.2rem;font-weight:600}.error{color:#b00020}`;

function page(title, body, extraHead = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} | Bean Box</title><style>${css}</style>${extraHead}</head><body>
<header><h1><a href="/" style="color:inherit;text-decoration:none">Bean Box</a></h1><a href="/cart" data-testid="cart-link">Cart</a></header>
${body}</body></html>`;
}

function readCart(req) {
  const m = /(?:^|;\s*)cart=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return [];
  try { return JSON.parse(Buffer.from(m[1], 'base64url').toString()); } catch { return []; }
}
function cartCookie(items) {
  return `cart=${Buffer.from(JSON.stringify(items)).toString('base64url')}; Path=/; HttpOnly; SameSite=Lax`;
}
function cartTotal(items) {
  return items.reduce((s, it) => s + (products.find((p) => p.id === it.id)?.price || 0) * it.qty, 0);
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(body);
}
function json(res, status, obj, headers = {}) {
  send(res, status, JSON.stringify(obj), { 'content-type': 'application/json', ...headers });
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 1e5) req.destroy(); });
    req.on('end', () => resolve(b));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const checkoutJs = fs.readFileSync(path.join(__dirname, 'checkout.js'), 'utf8');

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  const ua = req.headers['user-agent'] || '';

  // Chaos control, never affected by chaos itself.
  if (p === '/__chaos') {
    if (req.headers.authorization !== `Bearer ${CHAOS_TOKEN}`) return json(res, 401, { error: 'unauthorized' });
    if (req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      for (const [k, v] of Object.entries(body)) if (k in chaos) chaos[k] = v;
      log('chaos', { chaos: { ...chaos }, note: body.note || '' });
    }
    return json(res, 200, { chaos, started_at: STARTED_AT });
  }
  if (p === '/__events') {
    if (req.headers.authorization !== `Bearer ${CHAOS_TOKEN}`) return json(res, 401, { error: 'unauthorized' });
    return json(res, 200, events);
  }

  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  // Tells the notebook which address the app sees for this machine, so it can block it as the office network.
  if (p === '/__whoami') {
    if (req.headers.authorization !== `Bearer ${CHAOS_TOKEN}`) return json(res, 401, { error: 'unauthorized' });
    return json(res, 200, { ip: clientIp });
  }
  if (chaos.block_ips.includes(clientIp)) {
    log('blocked_ip', { path: p, ip: clientIp });
    req.socket.destroy();
    return;
  }

  if (p === '/health') {
    if (chaos.health_down) return json(res, 503, { status: 'down' });
    return json(res, 200, { status: 'ok', version: process.env.RAILWAY_DEPLOYMENT_ID || 'local', started_at: STARTED_AT });
  }

  if (p !== '/static/checkout.js' && Math.random() < chaos.error_rate) {
    log('injected_503', { path: p, ua: ua.slice(0, 80) });
    return send(res, 503, page('Unavailable', '<p class="error">Service temporarily unavailable.</p>'));
  }

  if (p === '/static/checkout.js') {
    if (chaos.broken_asset) return send(res, 404, 'not found', { 'content-type': 'text/plain' });
    return send(res, 200, checkoutJs, { 'content-type': 'application/javascript' });
  }

  if (p === '/' && req.method === 'GET') {
    const list = products.map((pr) => `<div class="product" data-testid="product-${pr.id}">
<h2>${pr.name}</h2><p>${pr.notes}</p><p>$${pr.price.toFixed(2)}</p>
<form method="post" action="/cart"><input type="hidden" name="id" value="${pr.id}"><button type="submit" data-testid="add-${pr.id}">Add to cart</button></form></div>`).join('');
    return send(res, 200, page('Shop', `<p>Single-origin coffee, roasted weekly.</p>${list}`));
  }

  if (p === '/cart' && req.method === 'POST') {
    const id = new URLSearchParams(await readBody(req)).get('id');
    const items = readCart(req);
    if (products.some((pr) => pr.id === id)) {
      const it = items.find((i) => i.id === id);
      it ? it.qty++ : items.push({ id, qty: 1 });
    }
    return send(res, 303, '', { location: '/cart', 'set-cookie': cartCookie(items) });
  }

  if (p === '/cart' && req.method === 'GET') {
    const items = readCart(req);
    if (!items.length) return send(res, 200, page('Cart', '<p data-testid="cart-empty">Your cart is empty.</p>'));
    const rows = items.map((it) => {
      const pr = products.find((x) => x.id === it.id);
      return `<li data-testid="cart-item">${pr.name} x ${it.qty}</li>`;
    }).join('');
    return send(res, 200, page('Cart', `<ul>${rows}</ul><p class="total" data-testid="cart-total">Total: $${cartTotal(items).toFixed(2)}</p>
<a href="/checkout"><button data-testid="go-checkout">Checkout</button></a>`));
  }

  if (p === '/checkout' && req.method === 'GET') {
    if (chaos.latency_ms) await sleep(chaos.latency_ms);
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
    if (chaos.latency_ms) await sleep(chaos.latency_ms);
    const items = readCart(req);
    if (!items.length) return json(res, 400, { error: 'empty_cart' });
    const cents = Math.round(cartTotal(items) * 100);
    try {
      const authId = await authorize(cents);
      const id = `BB-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      orders.set(id, { id, cents, authId, ts: new Date().toISOString() });
      return json(res, 201, { order_id: id, auth_id: authId }, { 'set-cookie': cartCookie([]) });
    } catch (err) {
      log('payment_failed', { reason: err.message });
      return json(res, 502, { error: 'payment_failed', reason: err.message });
    }
  }

  const om = /^\/order\/(BB-[0-9A-F]{6})$/.exec(p);
  if (om && req.method === 'GET') {
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

gateway.listen(GATEWAY_PORT, '::', () => console.log(`payment gateway on :${GATEWAY_PORT}`));
server.listen(PORT, '::', () => console.log(`bean box on :${PORT}`));
