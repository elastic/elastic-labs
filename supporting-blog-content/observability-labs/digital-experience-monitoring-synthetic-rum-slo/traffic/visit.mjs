// Simulated visitors for the Bean Box digital experience lab.
// Each visitor gets a browser engine, device and network profile and a path through the shop
// (bounce, browse or buy). Chromium visitors get CDP network and CPU throttling; WebKit visitors
// (Safari) run unthrottled because Playwright can't throttle WebKit.
//
// Usage: node visit.mjs --url https://<shop> --minutes 360 --workers 3 --log visits.ndjson
import { chromium, webkit } from 'playwright';
import fs from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return a;
}, []));
const URL_BASE = (args.url || 'http://localhost:8080').replace(/\/$/, '');
const MINUTES = Number(args.minutes || 5);
const WORKERS = Number(args.workers || 2);
const LOG = args.log || 'visits.ndjson';
const ONLY = args.profile || ''; // run a single profile (smoke tests)

const PROFILES = [
  { name: 'desktop-fast', weight: 25, engine: 'chromium', mobile: false, latency: 10, down: 50e6, up: 20e6, cpu: 1 },
  { name: 'desktop-cable', weight: 15, engine: 'chromium', mobile: false, latency: 40, down: 8e6, up: 2e6, cpu: 1 },
  { name: 'android-4g', weight: 25, engine: 'chromium', mobile: true, latency: 150, down: 4e6, up: 1.5e6, cpu: 4 },
  { name: 'android-slow', weight: 10, engine: 'chromium', mobile: true, latency: 400, down: 1.2e6, up: 0.4e6, cpu: 6 },
  { name: 'iphone-safari', weight: 15, engine: 'webkit', mobile: true },
  { name: 'mac-safari', weight: 10, engine: 'webkit', mobile: false },
];
const UAS = {
  'desktop-fast': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  'desktop-cable': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  'android-4g': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  'android-slow': 'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  'iphone-safari': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  'mac-safari': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
};
const PRODUCTS = ['ethiopia-guji', 'colombia-huila', 'kenya-nyeri'];

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function pick(r, weighted) {
  const total = weighted.reduce((s, w) => s + w.weight, 0);
  let x = r() * total;
  for (const w of weighted) { if ((x -= w.weight) < 0) return w; }
  return weighted.at(-1);
}
function plan(seed) {
  const r = rng(seed);
  const profile = ONLY ? PROFILES.find((p) => p.name === ONLY) : pick(r, PROFILES);
  const kind = args.kind || pick(r, [{ k: 'bounce', weight: 30 }, { k: 'browse', weight: 40 }, { k: 'buy', weight: 30 }]).k;
  const products = [PRODUCTS[Math.floor(r() * 3)], PRODUCTS[Math.floor(r() * 3)]];
  const thinks = Array.from({ length: 12 }, () => 800 + Math.floor(r() * 2500));
  // Visitors pay with ordinary cards. Only the synthetic journey uses the 4242 test card.
  const card = `4000${String(seed * 7919).padStart(12, '0').slice(-12)}`;
  return { seed, profile, kind, products, thinks, card };
}

async function runVisit(browser, p) {
  const context = await browser.newContext({
    userAgent: UAS[p.profile.name],
    viewport: p.profile.mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 },
    isMobile: p.profile.mobile,
    hasTouch: p.profile.mobile,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)));
  if (p.profile.engine === 'chromium') {
    const cdp = await context.newCDPSession(page);
    const ua = UAS[p.profile.name];
    const v = /Chrome\/(\d+)/.exec(ua)[1];
    await cdp.send('Emulation.setUserAgentOverride', {
      userAgent: ua,
      userAgentMetadata: {
        brands: [{ brand: 'Google Chrome', version: v }, { brand: 'Chromium', version: v }, { brand: 'Not?A_Brand', version: '24' }],
        platform: ua.includes('Android') ? 'Android' : ua.includes('Windows') ? 'Windows' : 'macOS',
        platformVersion: '', architecture: '', model: '', mobile: p.profile.mobile,
      },
    });
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: p.profile.latency, downloadThroughput: p.profile.down / 8, uploadThroughput: p.profile.up / 8,
    });
    if (p.profile.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.profile.cpu });
  }

  let i = 0;
  const think = () => page.waitForTimeout(p.thinks[i++ % p.thinks.length]);
  let outcome = 'ok';
  let orderMs = null;
  try {
    await page.goto(URL_BASE + '/', { waitUntil: 'load', timeout: 90000 });
    await page.evaluate(() => window.scrollBy(0, 400));
    await think();
    if (p.kind !== 'bounce') {
      const count = p.kind === 'buy' ? 1 : 1 + (p.seed % 2);
      for (let k = 0; k < count; k++) {
        await page.click(`[data-testid=open-${p.products[k]}]`);
        await page.waitForLoadState('load');
        await page.click('[data-testid=grind-filter]');
        await think();
        if (k + 1 < count) { await page.goto(URL_BASE + '/', { waitUntil: 'load', timeout: 90000 }); await think(); }
      }
    }
    if (p.kind === 'buy') {
      await page.click('[data-testid=add-to-cart]');
      await page.waitForLoadState('load');
      await think();
      await page.click('[data-testid=go-checkout]');
      await page.waitForLoadState('load');
      await page.fill('[data-testid=email]', `visitor${p.seed}@example.com`);
      await page.fill('[data-testid=card]', p.card);
      const enabled = await page.waitForSelector('[data-testid=place-order]:not([disabled])', { timeout: 15000 }).then(() => true, () => false);
      if (!enabled) {
        outcome = 'button_disabled';
        await page.click('[data-testid=place-order]', { force: true, timeout: 2000 }).catch(() => {}); // a frustrated click
        await think();
      } else {
        const t0 = Date.now();
        await page.click('[data-testid=place-order]');
        outcome = await Promise.race([
          page.waitForURL(/\/order\//, { timeout: 30000 }).then(() => 'ordered'),
          page.waitForSelector('[data-testid=checkout-error]:not(:empty)', { timeout: 30000 }).then(() => 'payment_failed'),
        ]);
        orderMs = Date.now() - t0;
        if (outcome === 'ordered') await page.waitForLoadState('load');
        await think();
      }
    }
  } catch (e) {
    outcome = `error: ${e.message.split('\n')[0].slice(0, 120)}`;
  }
  // Leave the site so the page fires pagehide and the SDK flushes LCP, CLS and INP.
  try { await page.goto('about:blank', { timeout: 10000 }); await page.waitForTimeout(1500); } catch {}
  await context.close();
  return { outcome, orderMs, errors };
}

const browsers = new Set();
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => { await Promise.allSettled([...browsers].map((b) => b.close())); process.exit(130); });
}
async function launch(engine) {
  const b = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true });
  browsers.add(b);
  b.on('disconnected', () => browsers.delete(b));
  return b;
}

async function worker(id, deadline, nextSeed) {
  const pool = { chromium: await launch('chromium'), webkit: await launch('webkit') };
  let n = 0;
  while (Date.now() < deadline) {
    const p = plan(nextSeed());
    const started = new Date().toISOString();
    let r;
    try { r = await runVisit(pool[p.profile.engine], p); } catch (e) { r = { outcome: `fatal: ${e.message.slice(0, 120)}`, errors: [] }; }
    fs.appendFileSync(LOG, JSON.stringify({ ts: started, worker: id, seed: p.seed, profile: p.profile.name, engine: p.profile.engine, kind: p.kind, ...r }) + '\n');
    if (args.once) break;
    if (++n % 25 === 0) { // recycle browsers to keep memory flat
      await Promise.allSettled(Object.values(pool).map((b) => b.close()));
      return worker(id, deadline, nextSeed);
    }
  }
  await Promise.allSettled(Object.values(pool).map((b) => b.close()));
}

const deadline = Date.now() + MINUTES * 60_000;
let seed = Number(args.seed || 1000);
const nextSeed = () => seed++;
console.log(`visitors: ${WORKERS} workers for ${MINUTES} min against ${URL_BASE}`);
await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i, deadline, nextSeed)));
console.log('done');
