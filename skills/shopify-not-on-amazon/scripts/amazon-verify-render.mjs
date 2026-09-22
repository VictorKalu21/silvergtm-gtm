// FALLBACK (browser render). Prefer amazon-verify.mjs (plain mobile fetch, no browser, not throttled the same way).
// STEP 7b · Amazon presence VERIFY by rendering Amazon search in headless Chromium (Playwright).
// Amazon serves a 503 bot wall to plain fetches, so this is the free way to read the real answer:
//   brand_store        = "Visit the <Brand> Store" / a /stores/ link -> Brand-Registered, official presence
//   listings_official  = brand-matching product sold by the brand itself or "Ships from and sold by Amazon.com" (1P)
//   listings_3p        = brand-matching products exist but sold by third parties only -> UNAUTHORIZED RESELLERS, no official presence (the pitch)
//   none               = no brand refinement, no brand-matching result titles -> not on Amazon
//   blocked            = captcha; retried on the next run (RETRY=1)
// Low-and-slow by design (1 tab, 3-7s between pages, ~8-12s per brand incl. one product page). Resume-safe.
//
//   RUN=<run> DIR=<dir> node amazon-verify.mjs      # reads {RUN}_keeps.json (or signal survivors) -> {RUN}_amazon_verify.json
//   env: IGNORE_CERT=1 (behind a TLS-intercepting proxy only) LIMIT (n brands) DEEP (1 = open the first brand-matching product page to read seller; default 1) HEADLESS (1) RETRY (1)
//   setup once: npm i playwright && npx playwright install chromium
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { brandOf, brandVariants, tok } from './amazon-autocomplete.mjs';
const DIR = process.env.DIR || '.', RUN = process.env.RUN || 'run', DEEP = process.env.DEEP !== '0';
const OUT = `${DIR}/${RUN}_amazon_verify.json`;
const rd = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8').replace(/^﻿/, ''));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (a, b) => a + Math.random() * (b - a);

let src = existsSync(`${DIR}/${RUN}_keeps.json`) ? rd(`${RUN}_keeps.json`) : rd(`${RUN}_signal.json`).filter((r) => r.status === 'pass_free_gates');
const ac = existsSync(`${DIR}/${RUN}_amazon_ac.json`) ? rd(`${RUN}_amazon_ac.json`) : {};
const order = { none: 0, low: 1, high: 2 };   // verify the strongest not-on-Amazon candidates first
src.sort((a, b) => (order[ac[a.domain]?.demand] ?? 3) - (order[ac[b.domain]?.demand] ?? 3) || (a.rank || 9e9) - (b.rank || 9e9));
const done = existsSync(OUT) ? rd(`${RUN}_amazon_verify.json`) : {};
let todo = src.filter((r) => !done[r.domain] || (process.env.RETRY === '1' && done[r.domain].amazon_status === 'blocked'));
if (process.env.LIMIT) todo = todo.slice(0, Number(process.env.LIMIT));
console.error(`${RUN}: ${src.length} brands, ${Object.keys(done).length} done, ${todo.length} to verify`);

const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0', args: ['--disable-blink-features=AutomationControlled'] });
const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', viewport: { width: 1366, height: 860 }, locale: 'en-US', timezoneId: 'America/New_York', ignoreHTTPSErrors: process.env.IGNORE_CERT === '1' });
await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
const page = await ctx.newPage();
await page.route(/\.(png|jpe?g|gif|webp|svg|woff2?|mp4)(\?|$)/, (r) => r.abort());
const CAPTCHA = /Enter the characters you see below|api-services-support@amazon\.com|Type the characters/i;
const SOFT_BLOCK = /Sorry! Something went wrong|<title>\s*Sorry\s*<\/title>|Robot Check/i;   // Amazon's throttle page (HTTP 503) -> back off, retry
async function go(url) {   // navigate with one retry on transient proxy/network errors; returns 'blocked' on Amazon's throttle
  for (let a = 0; a < 2; a++) {
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const html = await page.content();
      if ((res && res.status() === 503) || SOFT_BLOCK.test(html.slice(0, 3000)) || CAPTCHA.test(html)) return 'blocked';
      return 'ok';
    } catch (e) { if (a) throw e; await sleep(jitter(4000, 8000)); }
  }
}

async function verify(r) {
  const brand = brandOf(r); const q = ac[r.domain]?.query || brandVariants(brand)[0]; const t = tok(q);
  const v = { domain: r.domain, brand, query: q, checkedAt: new Date().toISOString().slice(0, 10) };
  if (await go(`https://www.amazon.com/s?k=${encodeURIComponent(q)}`) === 'blocked') return { ...v, amazon_status: 'blocked' };
  await page.waitForSelector('[data-component-type="s-search-result"], #brandsRefinements, .s-no-outline', { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  const d = await page.evaluate(() => {
    const items = [...document.querySelectorAll('[data-component-type="s-search-result"]')].map((el) => ({
      asin: el.dataset.asin, title: el.querySelector('h2')?.innerText?.trim() || '', sponsored: /Sponsored/.test(el.innerText),
      href: el.querySelector('h2 a, a.a-link-normal.s-no-outline')?.getAttribute('href') || '' }));
    const brands = [...document.querySelectorAll('#brandsRefinements li span.a-size-base, #brandsRefinements li span.a-list-item, [id^="p_123"] span.a-size-base')].map((e) => e.innerText.trim()).filter(Boolean);
    // sponsored-brand store links are wrapped in an ad redirect and can belong to a COMPETITOR bidding on this brand's name,
    // so a store link only counts when its visible text / alt text carries the brand; the product-page byline is the real verdict.
    const stores = [...document.querySelectorAll('a[href*="/stores/"]')].map((a) => ({ href: a.getAttribute('href'), text: (a.innerText + ' ' + [...a.querySelectorAll('img')].map((i) => i.alt || '').join(' ')).trim() }));
    return { items, brands, stores: stores.slice(0, 5), noResults: /No results for/i.test(document.body.innerText) };
  });
  const brandRefined = d.brands.some((b) => tok(b) === t);
  const match = d.items.filter((it) => !it.sponsored && tok(it.title).includes(t));
  const store = d.stores.find((s) => tok(s.text).includes(t));
  const storeHref = store ? (store.href.match(/https:\/\/www\.amazon\.com\/stores\/[^?]+/) || [store.href.replace(/\?.*$/, '')])[0] : null;
  Object.assign(v, { resultCount: d.items.length, brandMatches: match.length, brandRefinement: brandRefined, storeHref, evidence: match.slice(0, 3).map((m) => ({ asin: m.asin, title: m.title.slice(0, 90) })) });
  if (storeHref) return { ...v, amazon_status: 'brand_store' };
  if (!d.items.length && !d.noResults) return { ...v, amazon_status: 'blocked' };   // no results rendered and no "No results" text = throttled/empty shell
  if (!brandRefined && !match.length) return { ...v, amazon_status: 'none' };
  if (!DEEP || !match.length) return { ...v, amazon_status: 'listings_unverified' };
  await sleep(jitter(2500, 5000));
  if (await go(`https://www.amazon.com/dp/${match[0].asin}`) === 'blocked') return { ...v, amazon_status: 'blocked' };
  await page.waitForSelector('#bylineInfo, #productTitle', { timeout: 15000 }).catch(() => {});
  const p = await page.evaluate(() => ({
    byline: document.querySelector('#bylineInfo')?.innerText?.trim() || '', bylineHref: document.querySelector('#bylineInfo')?.getAttribute('href') || '',
    seller: document.querySelector('#sellerProfileTriggerId, #merchantInfo, [offer-display-feature-name="desktop-merchant-info"]')?.innerText?.trim() || '',
    shipsFrom: document.querySelector('[offer-display-feature-name="desktop-fulfiller-info"]')?.innerText?.trim() || '',
    captcha: /Enter the characters you see below/i.test(document.body.innerText) }));
  if (p.captcha) return { ...v, amazon_status: 'blocked' };
  Object.assign(v, { byline: p.byline, seller: p.seller, shipsFrom: p.shipsFrom, sampleAsin: match[0].asin });
  if (/^Visit the .* Store/i.test(p.byline) && tok(p.byline).includes(t)) return { ...v, amazon_status: 'brand_store', storeHref: p.bylineHref ? 'https://www.amazon.com' + p.bylineHref.replace(/\?.*$/, '') : null };
  const s = p.seller + ' ' + p.shipsFrom;
  if (tok(s).includes(t) || /sold by amazon\.com|amazon\.com\s*$/i.test(p.seller) || /Amazon\.com/i.test(p.seller)) return { ...v, amazon_status: 'listings_official' };
  return { ...v, amazon_status: 'listings_3p' };
}
let n = 0;
for (const r of todo) {
  let v;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { v = await verify(r); } catch (e) { v = { domain: r.domain, brand: brandOf(r), amazon_status: 'blocked', error: e.message.slice(0, 80) }; }
    if (v.amazon_status !== 'blocked') break;
    console.error(`    throttled (attempt ${attempt}) - backing off`); await sleep(jitter(25000, 50000) * attempt);
  }
  done[r.domain] = v; n++;
  console.error(`  ${n}/${todo.length} ${r.domain} -> ${v.amazon_status}${v.storeHref ? ' ' + v.storeHref : ''}${v.seller ? ' | ' + v.seller.replace(/\s+/g, ' ').slice(0, 40) : ''}`);
  if (n % 10 === 0) writeFileSync(OUT, JSON.stringify(done, null, 2));
  await sleep(jitter(4000, 9000));
}
writeFileSync(OUT, JSON.stringify(done, null, 2)); await browser.close();
const by = {}; for (const v of Object.values(done)) by[v.amazon_status] = (by[v.amazon_status] || 0) + 1;
console.error(`===== ${RUN}: AMAZON VERIFY DONE =====`, JSON.stringify(by));
