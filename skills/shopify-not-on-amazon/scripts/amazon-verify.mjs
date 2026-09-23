// STEP 7b · Amazon presence VERIFY with plain fetches. Amazon serves a 503 bot wall to a desktop UA but
// returns full search + product pages to a MOBILE Safari UA (found on the first run), so no browser is
// needed. Two fetches per brand: mobile search -> first brand-matching ASIN -> mobile product page.
//   Three candidate sources (plain search, Amazon's brand filter rh=p_89:<Brand>, up to 3 product pages); ANY official listing = official.
//   brand_store        = product byline "Visit the <Brand> Store" / a /stores/ link with the brand's name -> Brand-Registered, official
//   listings_official  = brand-matching product sold by the brand itself or by Amazon (1P)
//   listings_3p        = brand-matching products exist but sold by third parties only -> UNAUTHORIZED RESELLERS, no official presence (the pitch)
//   none               = no brand-matching result on the first page -> not on Amazon
//   blocked            = throttle/captcha page after retries; RETRY=1 next run
// Resume-safe; low concurrency + jitter by design.
//
//   RUN=<run> DIR=<dir> node amazon-verify.mjs      # reads {RUN}_keeps.json (or signal survivors) -> {RUN}_amazon_verify.json
//   env: LIMIT  CONC (2)  RETRY (1)  DEEP (1 = open the product page; 0 = search only)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { brandOf, brandVariants, tok } from './amazon-autocomplete.mjs';
const DIR = process.env.DIR || '.', RUN = process.env.RUN || 'run', CONC = Number(process.env.CONC || 2), DEEP = process.env.DEEP !== '0';
const OUT = `${DIR}/${RUN}_amazon_verify.json`;
const rd = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8').replace(/^﻿/, ''));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (a, b) => a + Math.random() * (b - a);
// Amazon throttles an exact (UA, Accept, Accept-Language) combination after a few hundred requests, not the IP:
// rotate realistic MOBILE header sets per attempt and the throttle never engages.
const UAS = ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.108 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'];
const ACCEPTS = ['text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', '*/*', 'text/html,application/xhtml+xml,*/*;q=0.8', 'text/html'];
const LANGS = ['en-US,en;q=0.9', 'en-US', 'en-US,en;q=0.8', 'en'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const BLOCK = /Sorry! Something went wrong|Enter the characters you see below|Type the characters|api-services-support@amazon\.com|Robot Check/i;
const strip = (s) => s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

async function get(url) {
  for (let a = 0; a < 5; a++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': pick(UAS), 'Accept-Language': pick(LANGS), 'Accept': pick(ACCEPTS) }, signal: AbortSignal.timeout(25000), redirect: 'follow' });
      const html = await r.text();
      if (r.status === 503 || r.status === 429 || BLOCK.test(html.slice(0, 5000)) || html.length < 5000) { await sleep(jitter(2000, 6000) * (a + 1)); continue; }   // short page = JS shell, rotate too
      return { status: r.status, html };
    } catch (e) { await sleep(jitter(3000, 6000)); }
  }
  return { status: 0, html: '', blocked: true };
}

let src = existsSync(`${DIR}/${RUN}_keeps.json`) ? rd(`${RUN}_keeps.json`) : rd(`${RUN}_signal.json`).filter((r) => r.status === 'pass_free_gates');
const ac = existsSync(`${DIR}/${RUN}_amazon_ac.json`) ? rd(`${RUN}_amazon_ac.json`) : {};
const order = { high: 0, low: 1, none: 2 };   // brands shoppers already search for on Amazon first (that's the buyer's real filter)
src.sort((a, b) => (order[ac[a.domain]?.demand] ?? 3) - (order[ac[b.domain]?.demand] ?? 3) || (a.rank || 9e9) - (b.rank || 9e9));
const done = existsSync(OUT) ? rd(`${RUN}_amazon_verify.json`) : {};
let todo = src.filter((r) => !done[r.domain] || (process.env.RETRY === '1' && done[r.domain].amazon_status === 'blocked'));
if (process.env.LIMIT) todo = todo.slice(0, Number(process.env.LIMIT));
console.error(`${RUN}: ${src.length} brands, ${Object.keys(done).length} done, ${todo.length} to verify (mobile fetch, CONC=${CONC})`);

// Brand matching. "Wyze Labs" must match "WYZE Cam v4", "Stanley 1913" must match "STANLEY Quencher", but "American Autowire"
// must not match every "American ..." title: drop generic words, then require every distinctive word (or the whole token).
const GENERIC = new Set(['inc','llc','co','company','corp','ltd','labs','lab','brand','brands','collective','cosmetics','beauty','apparel','clothing','shop','store','official','usa','us','home','products','product','technology','technologies','tech','electronics','equipment','supply','supplies','goods','group','international','global','online','the','and','of','by','for','american','america','natural','pure','black','white','smart','pro','best','premium','classic','modern','little','big','great','simple','urban','fresh','green','blue','red','gold','silver','north','south','east','west','new','old','happy','daily','real','true','one','my','house','life','love','world','designs','design','studio','outlet','boutique','jewelry','skincare','wear','workwear','nutrition','health','organic','coffee','foods','food','kitchen','garden','outdoor','outdoors','gear','sports','sport','fitness','yoga','baby','kids','pet','pets','1913']);
const matcher = (q) => {
  const t = tok(q); const words = q.toLowerCase().split(/[\s&'’.-]+/).map(tok).filter(Boolean);
  const key = words.filter((w) => !GENERIC.has(w) && w.length >= 3); const need = key.length ? key : words;
  const lc = (text) => ' ' + (text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';   // word-boundary aware: "electric" must NOT match "lectric"
  const has = (x, w) => x.includes(' ' + w + ' ') || x.includes(' ' + w);                        // whole word, or word-prefix ("lectric" in "lectricxp")
  return (text) => { const x = lc(text); return tok(text).includes(t) && has(lc(text), need[0]) || need.every((w) => has(x, w)); };
};
const sellerIsBrand = (seller, q) => { const m = matcher(q); const first = tok(q.split(/\s+/)[0]); return m(seller) || (first.length >= 5 && !GENERIC.has(first) && tok(seller).includes(first)); };
const bylineIsBrand = (byline, q) => { const b = tok(byline.replace(/^Visit the /i, '').replace(/ Store$/i, '').replace(/^Brand:\s*/i, '')); const t = tok(q); return b.length >= 3 && (t.includes(b) || b.includes(t) || matcher(q)(b)); };
function parseSearch(html, t) {
  // mobile results: several data-asin divs per product; group the text by ASIN in page order
  const byAsin = new Map(); const parts = html.split(/(?=<div[^>]*data-asin="B0[A-Z0-9]{8}")/);
  for (const p of parts) { const m = p.match(/^<div[^>]*data-asin="(B0[A-Z0-9]{8})"/); if (!m) continue; byAsin.set(m[1], (byAsin.get(m[1]) || '') + ' ' + strip(p.slice(0, 20000))); }
  const items = [...byAsin].map(([asin, text]) => ({ asin, text: text.slice(0, 300), sponsored: /\bSponsored\b/.test(text), match: t(text) }));
  const stores = [...html.matchAll(/<a[^>]+href="([^"]*\/stores\/[^"]*)"[^>]*>([\s\S]{0,600}?)<\/a>/g)].map((m) => ({ href: m[1], text: strip(m[2] + ' ' + ((m[2].match(/alt="([^"]*)"/) || [])[1] || '')) }));
  return { items, stores, noResults: /No results for|did not match any products/i.test(html) };
}
function parseProduct(html) {
  const bylineDiv = (html.match(/bylineInfo_feature_div[\s\S]{0,6000}/) || [''])[0];
  const byline = strip((bylineDiv.match(/(Visit the [^<"]{1,80}Store)/) || html.match(/(Visit the [^<"]{1,80}Store)/) || [])[1] || (bylineDiv.match(/Brand:\s*([^<]{1,60})/) || [])[1] && ('Brand: ' + (bylineDiv.match(/Brand:\s*([^<]{1,60})/) || [])[1]) || (html.match(/po-brand[\s\S]{0,600}?<span class="a-size-base po-break-word">([^<]{1,60})/) || [])[1] && ('Brand: ' + (html.match(/po-brand[\s\S]{0,600}?<span class="a-size-base po-break-word">([^<]{1,60})/) || [])[1]) || '');
  const bylineHref = (html.match(/id="(?:visitStoreMobileUrl|bylineInfo)"[^>]*href="([^"]*\/stores\/[^"]*)"/) || html.match(/href="([^"]*\/stores\/[^"]*)"[^>]*>\s*(?:<[^>]*>\s*)*Visit the /) || [])[1] || null;
  const seller = strip((html.match(/odf-mobile-merchant-info-anchor-text"[^>]*>([\s\S]{0,200}?)<div/) || [])[1] || (html.match(/id="sellerProfileTriggerId"[^>]*>([^<]{1,80})/) || [])[1] || '');
  const shipsFrom = strip((html.match(/odf-mobile-fulfiller-info-anchor-text"[^>]*>([\s\S]{0,200}?)<div/) || [])[1] || '');
  const title = strip((html.match(/id="(?:productTitle|title)"[^>]*>([^<]{1,300})/) || [])[1] || (html.match(/<title>\s*Amazon\.com\s*:\s*([^<]{1,200})/) || [])[1] || '');
  return { byline, bylineHref, seller, shipsFrom, title };
}
async function verify(r) {
  const brand = brandOf(r); const q = ac[r.domain]?.query || brandVariants(brand)[0]; const t = matcher(q);
  const v = { domain: r.domain, brand, query: q, checkedAt: new Date().toISOString().slice(0, 10), amazonSearchUrl: `https://www.amazon.com/s?k=${encodeURIComponent(q)}` };
  // A. plain search
  const s = await get(v.amazonSearchUrl);
  if (s.blocked || !s.html) return { ...v, amazon_status: 'blocked' };
  const d = parseSearch(s.html, t);
  const anyMatch = d.items.filter((it) => it.match); const organic = anyMatch.filter((it) => !it.sponsored);
  const store = d.stores.find((x) => t(x.text));
  Object.assign(v, { resultCount: d.items.length, brandMatches: organic.length, sponsoredMatches: anyMatch.length - organic.length, storeHref: store ? (store.href.match(/https:\/\/www\.amazon\.com\/stores\/[^?"]+/) || [store.href.replace(/\?.*$/, '')])[0] : null, evidence: anyMatch.slice(0, 3).map((m) => ({ asin: m.asin, text: m.text.slice(0, 90) })) });
  if (store) return { ...v, amazon_status: 'brand_store' };
  if (!d.items.length && !d.noResults) return { ...v, amazon_status: 'blocked' };
  // B. Amazon's own brand filter (rh=p_89:<Brand>) as a second candidate source; exact-string, so try the name variants
  const cands = [...organic, ...anyMatch.filter((x) => !organic.includes(x))];
  for (const name of [...new Set([q, brand, ...brandVariants(brand)])].slice(0, 3)) {
    await sleep(jitter(800, 1800));
    const bf = await get(`https://www.amazon.com/s?k=${encodeURIComponent(name)}&rh=p_89%3A${encodeURIComponent(name)}`);
    if (bf.blocked || !bf.html) continue;
    const bd = parseSearch(bf.html, t);
    if (bd.noResults) continue;
    v.catalogBrand = name;
    for (const it of bd.items.filter((x) => x.match)) if (!cands.some((c) => c.asin === it.asin)) cands.push(it);
    break;
  }
  if (!cands.length) return { ...v, amazon_status: 'none' };
  if (!DEEP) return { ...v, amazon_status: 'listings_unverified' };
  // C. deep-check up to 3 brand-matching listings; ANY official one = official
  const checked = []; let sawBrandListing = false;
  for (const c of cands.slice(0, 3)) {
    await sleep(jitter(1000, 2500));
    const p = await get(`https://www.amazon.com/dp/${c.asin}`); if (p.blocked || !p.html) continue;
    const pp = parseProduct(p.html); const rec = { asin: c.asin, title: pp.title.slice(0, 80), byline: pp.byline.slice(0, 60), seller: pp.seller.slice(0, 40), shipsFrom: pp.shipsFrom.slice(0, 30) }; checked.push(rec);
    const isBrandListing = t(pp.title) || (pp.byline && bylineIsBrand(pp.byline, q)) || sellerIsBrand(pp.seller, q);
    if (!isBrandListing) continue; sawBrandListing = true;
    if (/^Visit the /i.test(pp.byline) && bylineIsBrand(pp.byline, q)) return { ...v, asinsChecked: checked, amazon_status: 'brand_store', storeHref: pp.bylineHref ? 'https://www.amazon.com' + pp.bylineHref.replace(/^https?:\/\/www\.amazon\.com/, '').replace(/\?.*$/, '') : v.storeHref, sampleAsin: c.asin, byline: pp.byline, seller: pp.seller };
    if (sellerIsBrand(pp.seller, q) || /^amazon(\.com)?$/i.test(pp.seller.trim())) return { ...v, asinsChecked: checked, amazon_status: 'listings_official', sampleAsin: c.asin, byline: pp.byline, seller: pp.seller };
  }
  const last = checked.find((x) => x.seller) || checked[0] || {};
  Object.assign(v, { asinsChecked: checked, sampleAsin: last.asin, byline: last.byline, seller: last.seller, productTitle: last.title });
  if (!checked.length) return { ...v, amazon_status: 'listings_unverified' };
  if (!sawBrandListing) return { ...v, amazon_status: 'none', note: 'search hits did not carry the brand on their product pages' };
  return { ...v, amazon_status: last.seller ? 'listings_3p' : 'listings_unverified' };
}
let i = 0, n = 0;
async function worker() {
  while (i < todo.length) {
    const r = todo[i++]; let v;
    try { v = await verify(r); } catch (e) { v = { domain: r.domain, brand: brandOf(r), amazon_status: 'blocked', error: String(e.message).slice(0, 80) }; }
    done[r.domain] = v; n++;
    console.error(`  ${n}/${todo.length} ${r.domain} -> ${v.amazon_status}${v.storeHref ? ' ' + v.storeHref : ''}${v.seller ? ' | sold by ' + v.seller.slice(0, 40) : ''}`);
    if (n % 10 === 0) writeFileSync(OUT, JSON.stringify(done, null, 1));
    await sleep(jitter(1500, 3500));
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
writeFileSync(OUT, JSON.stringify(done, null, 1));
const by = {}; for (const v of Object.values(done)) by[v.amazon_status] = (by[v.amazon_status] || 0) + 1;
console.error(`===== ${RUN}: AMAZON VERIFY DONE =====`, JSON.stringify(by));
