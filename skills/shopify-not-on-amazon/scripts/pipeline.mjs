// STEP 1-6 free-gate pipeline for "US Shopify brands NOT on Amazon".
// Three free fetches per domain (/meta.json, homepage, /products.json) yield EVERY hard gate:
//   (1) live Shopify storefront, not password-walled   (2) US-based (store address country)
//   (3) physical products (variants require shipping)   (4) not dropship / print-on-demand / stale
//   (5) does NOT already advertise Amazon on its own site (a "Shop on Amazon" link = on Amazon, drop)
//   (6) contact footprint (email / phone / LinkedIn / socials) + pruned text for the Haiku classify.
// Resume-safe: re-run any time; done domains are skipped (RETRY=1 re-fetches unreachable rows).
//
//   RUN=<run> DIR=<dir> node pipeline.mjs      # {RUN}_input.json -> {RUN}_signal.json + {RUN}_ALL.csv
//   env: CONC (20) DELAY ms between domains per worker (0; use CONC=4 DELAY=1000 from a datacenter IP or Shopify's
//        'Verifying your connection' challenge locks the IP out) TIMEOUT ms (20000) STALE_DAYS (365) PHYSICAL_MIN (0.5) RETRY (0|1)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const DIR = process.env.DIR || '.';
const RUN = process.env.RUN || 'run';
const CONC = Number(process.env.CONC || 20);
const DELAY = Number(process.env.DELAY || 0);
const STALE_DAYS = Number(process.env.STALE_DAYS || 365);
const PHYSICAL_MIN = Number(process.env.PHYSICAL_MIN || 0.5);
const OUT = `${DIR}/${RUN}_signal.json`;
const input = JSON.parse(readFileSync(`${DIR}/${RUN}_input.json`, 'utf8').replace(/^﻿/, ''));
const prior = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
const done = new Map(prior.map((r) => [r.domain, r]));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// ---- fingerprints -------------------------------------------------------------------------
const DROPSHIP_APPS = { dsers: /dsers/i, zendrop: /zendrop/i, cjdropshipping: /cjdropshipping|cjdrop/i, spocket: /spocket/i, autods: /autods/i,
  dropified: /dropified/i, oberlo: /oberlo/i, modalyst: /modalyst/i, eprolo: /eprolo/i, syncee: /syncee/i, aliexpress: /aliexpress|alicdn\.com/i, trendsi: /trendsi/i };
const POD_APPS = { printful: /printful/i, printify: /printify/i, gooten: /gooten/i, teelaunch: /teelaunch/i, gelato: /gelato\.com|gelatoapi/i,
  customcat: /customcat/i, spod: /\bspod\b|spod\.com/i, apliiq: /apliiq/i, teespring: /teespring|spring\.com/i, printy6: /printy6/i };
const POD_VENDOR = /printful|printify|gooten|teelaunch|gelato|customcat|spod|apliiq|aliexpress|cjdropshipping|dropship/i;
const ALI_IMG = /alicdn\.com|\/HTB1[A-Za-z0-9]|\/S[0-9a-f]{20,}\.(?:jpe?g|png|webp)/;
const POD_IMG = /printful|printify|gooten|teelaunch/i;
const AMAZON_STORE = /amazon\.com\/stores\/[^"'\s)]+/i;
const AMAZON_LINK = /https?:\/\/(?:www\.)?(?:amazon\.com|amzn\.to|a\.co)\/[^"'\s)]*/gi;
const AMAZON_CTA = /(?:shop|buy|available|find us|also available|now available|order)\s+(?:it\s+|us\s+)?on\s+amazon|amazon\s+store/i;
const MAILTO = /href=["']mailto:([^"'?\s]+)/gi;
const TEL = /href=["']tel:([^"'\s]+)/gi;
const LINKEDIN = /linkedin\.com\/company\/([A-Za-z0-9_.\-]+)/i;
const INSTA = /instagram\.com\/([A-Za-z0-9_.]{2,})/i;
const FB = /(?:www\.|web\.)?facebook\.com\/([A-Za-z0-9_.\-]{2,})/i;
const TIKTOK = /tiktok\.com\/@([A-Za-z0-9_.]+)/i;
const US_ADDR = /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/;
const PASSWORD = /\/password(?:[?#]|$)|template-password|password-page|"template":"password"|Opening soon|Enter using password/i;
const BLOCKED = /Just a moment|Attention Required!|Security Checkpoint|verifying your browser|challenge-platform|Access Denied|Enable JavaScript and cookies to continue|Pardon Our Interruption/i;
const OFFLINE = /Store unavailable|This store will be right back|This shop is currently unavailable|This store is unavailable/i;
const EMAIL_TXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g;
const PHONE_TXT = /(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g;
const CONTACT_PATHS = ['/pages/contact-us', '/pages/contact', '/pages/customer-service', '/pages/about-us', '/pages/wholesale'];
const emailOk = (e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e) && !/\.(?:png|jpe?g|gif|svg|webp|js|css)$|example\.|sentry|wixpress|schema\.org|\d{6,}@|@\d/i.test(e) && !/^(?:[\da-f]{8,}|u00|x)/i.test(e);

const any = (t, p) => p.test(t);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const uniq = (a) => [...new Set(a.filter(Boolean))];

async function get(url, json = false) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), Number(process.env.TIMEOUT) || 20000);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: c.signal, headers: { 'User-Agent': UA, 'Accept': json ? 'application/json' : 'text/html,*/*', 'Accept-Language': 'en-US,en;q=0.9' } });
    const body = await r.text();
    if (json) { try { return { ok: true, status: r.status, finalUrl: r.url, data: JSON.parse(body) }; } catch { return { ok: false, status: r.status, err: 'not_json' }; } }
    return { ok: true, status: r.status, finalUrl: r.url, html: body };
  } catch (e) { return { ok: false, err: e.name === 'AbortError' ? 'timeout' : (e.cause?.code || e.message) }; }
  finally { clearTimeout(t); }
}

function pruneText(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 2500);
}

function catalogSignals(products) {
  const P = products.filter((p) => p && Array.isArray(p.variants));
  if (!P.length) return { productsSeen: 0 };
  const isPhysical = (p) => p.variants.some((v) => v.requires_shipping !== false);
  const prices = P.flatMap((p) => p.variants.map((v) => Number(v.price)).filter((x) => x > 0));
  const variants = P.flatMap((p) => p.variants);
  const inflated = variants.filter((v) => Number(v.compare_at_price) > Number(v.price) * 1.4).length;
  const updated = P.map((p) => Date.parse(p.updated_at)).filter(Boolean);
  const imgsOf = (p) => (p.images || []).map((i) => i.src || '').filter(Boolean);
  const vendors = uniq(P.map((p) => (p.vendor || '').trim()));
  const types = uniq(P.map((p) => (p.product_type || '').trim()));
  const tagCount = P.reduce((n, p) => n + ((p.tags && p.tags.length) ? 1 : 0), 0);
  return {
    productsSeen: P.length,
    physicalShare: +(P.filter(isPhysical).length / P.length).toFixed(2),
    medianPrice: median(prices),
    lastUpdatedDays: updated.length ? Math.round((Date.now() - Math.max(...updated)) / 86400000) : null,
    vendors: vendors.slice(0, 8), vendorCount: vendors.length,
    types: types.slice(0, 8),
    podVendorShare: +(P.filter((p) => POD_VENDOR.test(p.vendor || '')).length / P.length).toFixed(2),
    aliImageShare: +(P.filter((p) => imgsOf(p).some((s) => ALI_IMG.test(s))).length / P.length).toFixed(2),
    podImageShare: +(P.filter((p) => imgsOf(p).some((s) => POD_IMG.test(s))).length / P.length).toFixed(2),
    inflatedShare: variants.length ? +(inflated / variants.length).toFixed(2) : 0,
    longTitleShare: +(P.filter((p) => (p.title || '').length > 70).length / P.length).toFixed(2),
    untaggedShare: +(1 - tagCount / P.length).toFixed(2),
  };
}

async function analyse(row) {
  const d = row.domain; const rec = { ...row };
  const [meta, home, prod] = await Promise.all([get(`https://${d}/meta.json`, true), get(`https://${d}/`), get(`https://${d}/products.json?limit=250`, true)]);
  let h = home; if (!h.ok) { const r2 = await get(`http://${d}/`); if (r2.ok) h = r2; }
  const m = meta.ok && meta.data && meta.data.myshopify_domain ? meta.data : null;
  if (!h.ok && !m) { rec.fetch = 'fail:' + h.err; return rec; }
  const html = h.ok ? h.html : '';
  if (!m && h.ok && ([401, 403, 429, 503].includes(h.status) || BLOCKED.test(html.slice(0, 6000)))) { rec.fetch = 'blocked'; rec.status_http = h.status; rec.title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || null; return rec; }
  if (OFFLINE.test(html.slice(0, 8000))) { rec.fetch = 'ok'; rec.isShopify = true; rec.offline = true; return rec; }
  const shopifyGlobal = /Shopify\.shop\s*=|Shopify\.theme\s*=|cdn\.shopify\.com|\.myshopify\.com/i.test(html);
  Object.assign(rec, {
    fetch: 'ok', status: h.status, finalUrl: h.finalUrl || null,
    isShopify: !!(m || shopifyGlobal), metaOk: !!m, headless: !m && shopifyGlobal,
    shopName: m?.name || null, myshopify: m?.myshopify_domain || (html.match(/Shopify\.shop\s*=\s*"([^"]+)"/) || [])[1] || null,
    country: m?.country || (html.match(/Shopify\.country\s*=\s*"([A-Z]{2})"/) || [])[1] || null,
    countrySource: m?.country ? 'meta' : 'shopify_global',
    province: m?.province || null, city: m?.city || null,
    currency: m?.currency || (html.match(/Shopify\.currency\s*=\s*\{[^}]*"active":"([A-Z]{3})"/) || [])[1] || null,
    shipsTo: m?.ships_to_countries || null,
    productCount: m?.published_products_count ?? null, collectionCount: m?.published_collections_count ?? null,
    passworded: h.ok && PASSWORD.test((h.finalUrl || '') + html.slice(0, 4000)),
    usAddress: US_ADDR.test(pruneText(html.slice(-40000))),
  });
  // Amazon on own site
  const amazonLinks = uniq([...html.matchAll(AMAZON_LINK)].map((x) => x[0].replace(/[?#].*$/, '')));
  const store = (html.match(AMAZON_STORE) || [])[0] || null;
  Object.assign(rec, { amazonStoreLink: store, amazonLinks: amazonLinks.slice(0, 5), amazonCta: AMAZON_CTA.test(html),
    amazonOnSite: !!(store || amazonLinks.some((u) => /amazon\.com\/(?:stores|dp|gp\/product|[^/]+\/dp)\//i.test(u)) || (AMAZON_CTA.test(html) && amazonLinks.length)) });
  // dropship / POD app fingerprints in the HTML
  rec.dropshipApps = Object.entries(DROPSHIP_APPS).filter(([, p]) => p.test(html)).map(([n]) => n);
  rec.podApps = Object.entries(POD_APPS).filter(([, p]) => p.test(html)).map(([n]) => n);
  // catalog
  const products = prod.ok && Array.isArray(prod.data?.products) ? prod.data.products : null;
  rec.catalogOk = !!products;
  Object.assign(rec, products ? catalogSignals(products) : { productsSeen: 0 });
  // contact footprint
  let emails = uniq([...html.matchAll(MAILTO)].map((x) => x[1].toLowerCase())).filter(emailOk);
  let phones = uniq([...html.matchAll(TEL)].map((x) => x[1].replace(/[^+\d]/g, ''))).filter((p) => p.replace(/\D/g, '').length >= 10);
  if (!emails.length) emails = uniq((pruneText(html).match(EMAIL_TXT) || []).map((e) => e.toLowerCase())).filter(emailOk);
  if (!emails.length || !phones.length) {           // one or two extra cheap fetches, only when the homepage had no footprint
    for (const path of CONTACT_PATHS) {
      const c = await get(`https://${d}${path}`); if (!c.ok || c.status !== 200) continue;
      const ctext = pruneText(c.html.replace(/<script[\s\S]*?<\/script>/gi, ' '));
      if (!emails.length) emails = uniq([...[...c.html.matchAll(MAILTO)].map((x) => x[1].toLowerCase()), ...(ctext.match(EMAIL_TXT) || []).map((e) => e.toLowerCase())]).filter(emailOk);
      if (!phones.length) phones = uniq([...[...c.html.matchAll(TEL)].map((x) => x[1]), ...(ctext.match(PHONE_TXT) || [])].map((p) => p.replace(/[^+\d]/g, ''))).filter((p) => p.replace(/\D/g, '').length >= 10);
      if (emails.length) { rec.contactPage = path; break; }
    }
  }
  emails.sort((a, b) => (b.endsWith('@' + d) ? 1 : 0) - (a.endsWith('@' + d) ? 1 : 0));
  Object.assign(rec, { emails: emails.slice(0, 3), phones: phones.slice(0, 2),
    linkedin: (html.match(LINKEDIN) || [])[1] || null, instagram: (html.match(INSTA) || [])[1] || null,
    facebook: ((html.match(FB) || [])[1] || null), tiktok: (html.match(TIKTOK) || [])[1] || null });
  if (rec.facebook && /^(tr|sharer|dialog|plugins|pages|profile\.php|share|login)$/i.test(rec.facebook)) rec.facebook = null;
  rec.title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]?.replace(/\s+/g, ' ').trim().slice(0, 120) || null;
  rec.text = pruneText(html);
  return rec;
}

// dropship / POD score: 0 = clean brand, >=3 = drop. Each tell is weak alone; the combination is not.
function dropshipScore(r) {
  let s = 0; const why = [];
  if (r.dropshipApps?.length) { s += 3; why.push('app:' + r.dropshipApps.join('/')); }
  const podShare = Math.max(r.podVendorShare || 0, r.podImageShare || 0);
  if (r.podApps?.length) { const hard = !r.catalogOk || podShare >= 0.5; s += hard ? 3 : 1; why.push('pod_app:' + r.podApps.join('/')); }
  if (podShare >= 0.5) { s += 3; why.push(`pod_catalog:${podShare}`); }
  else if (podShare > 0) { r.podMerchLine = true; why.push(`pod_merch_line:${podShare}`); }   // real brand with a Printful merch line (G Fuel) -> keep, flag
  if (r.aliImageShare >= 0.3) { s += 3; why.push(`ali_images:${r.aliImageShare}`); }
  else if (r.aliImageShare > 0) { s += 1; why.push(`ali_images_some:${r.aliImageShare}`); }
  if (r.inflatedShare >= 0.5) { s += 1; why.push(`inflated:${r.inflatedShare}`); }
  if (r.longTitleShare >= 0.5) { s += 1; why.push(`long_titles:${r.longTitleShare}`); }
  if (r.productCount > 3000 && r.vendorCount <= 2) { s += 1; why.push(`mega_catalog:${r.productCount}`); }
  if (r.untaggedShare >= 0.9 && r.productsSeen >= 20) { s += 1; why.push('untagged'); }
  return { score: s, why };
}
function gate(r) {
  if (r.fetch === 'blocked') return 'blocked';          // bot wall on the plain fetch -> recover with RENDER=1 (see SKILL.md)
  if (r.fetch !== 'ok') return 'unreachable';
  if (!r.isShopify) return 'not_shopify';
  if (r.offline) return 'drop_inactive';
  if (/\.myshopify\.com$/i.test(r.domain)) return 'drop_myshopify_domain';   // no custom domain = not an established brand
  if (r.passworded) return 'drop_password';
  const us = r.country === 'US' || (!r.country && r.currency === 'USD' && r.usAddress);
  if (!us) return 'drop_not_us';
  if (r.catalogOk && r.productsSeen === 0 && !(r.productCount > 0)) return 'drop_no_catalog';
  if (r.catalogOk && r.physicalShare < PHYSICAL_MIN) return 'drop_not_physical';
  if (r.lastUpdatedDays != null && r.lastUpdatedDays > STALE_DAYS) return 'drop_stale';
  const ds = dropshipScore(r); r.dropshipScore = ds.score; r.dropshipWhy = ds.why;
  if (ds.score >= 3) return 'drop_dropship_pod';
  if (r.amazonOnSite) return 'drop_amazon_on_site';
  return 'pass_free_gates';
}

const todo = input.filter((r) => { const p = done.get(r.domain); return !p || (process.env.RETRY === '1' && ['unreachable', 'blocked'].includes(p.status)); });
console.error(`${RUN}: ${input.length} input, ${done.size} done, ${todo.length} to fetch (CONC=${CONC})`);
let i = 0, n = 0; const t0 = Date.now();
const flush = () => { const all = input.map((r) => done.get(r.domain)).filter(Boolean); writeFileSync(OUT, JSON.stringify(all, null, 2)); };
async function worker() {
  while (i < todo.length) {
    const row = todo[i++]; let rec;
    try { rec = await analyse(row); } catch (e) { rec = { ...row, fetch: 'fail:' + (e.message || 'error') }; }
    rec.status = gate(rec); rec.usSource = rec.country === 'US' ? rec.countrySource : (rec.status !== 'drop_not_us' ? 'usd+address' : null);
    done.set(row.domain, rec); n++;
    if (DELAY) await new Promise((r) => setTimeout(r, DELAY));
    if (n % 50 === 0) { flush(); const el = (Date.now() - t0) / 1000, rate = n / el, eta = Math.round((todo.length - n) / rate); console.error(`${n}/${todo.length}  ${rate.toFixed(1)}/s  eta ${Math.floor(eta / 60)}m${eta % 60}s`); }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
flush();

const results = input.map((r) => done.get(r.domain)).filter(Boolean);
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const cols = ['domain', 'rank', 'status', 'shopName', 'podMerchLine', 'contactPage', 'country', 'province', 'city', 'countrySource', 'currency', 'productCount', 'physicalShare', 'medianPrice', 'lastUpdatedDays', 'dropshipScore', 'dropshipWhy', 'amazonOnSite', 'amazonStoreLink', 'amazonLinks', 'emails', 'phones', 'linkedin', 'instagram', 'facebook', 'tiktok', 'types', 'vendors', 'stack', 'title'];
writeFileSync(`${DIR}/${RUN}_ALL.csv`, [cols.join(',')].concat(results.map((r) => cols.map((c) => esc(Array.isArray(r[c]) ? r[c].join('|') : r[c])).join(','))).join('\n'));
const by = {}; for (const r of results) by[r.status] = (by[r.status] || 0) + 1;
console.error(`\n===== ${RUN}: FREE GATES DONE (${((Date.now() - t0) / 1000).toFixed(0)}s) =====`);
for (const s of ['pass_free_gates', 'drop_amazon_on_site', 'drop_dropship_pod', 'drop_stale', 'drop_not_physical', 'drop_no_catalog', 'drop_not_us', 'drop_password', 'drop_inactive', 'drop_myshopify_domain', 'not_shopify', 'blocked', 'unreachable']) console.error('  ', s + ':', by[s] || 0);
console.error(`-> ${by.pass_free_gates || 0} rows advance to classify (prep-classify.mjs) + Amazon SERP check (amazon-serp.mjs)`);
