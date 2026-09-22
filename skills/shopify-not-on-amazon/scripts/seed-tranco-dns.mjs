// STEP 0 (alternative source, zero credentials) · Tranco top-1M x DNS = Shopify stores with a rank.
// Every standard Shopify storefront resolves to Shopify's 23.227.38.0/24 (or CNAMEs to shops.myshopify.com),
// so a DNS lookup is a free, ~1ms Shopify test. Tranco rank = the free traffic proxy (top-100k ~ 50k+/mo).
// Misses stores fronted by Cloudflare/Vercel (headless / custom proxies) — HTTP Archive (httparchive.sql)
// is the fuller source when you have BigQuery; this one needs nothing but the Tranco CSV.
//
//   curl -L -o top-1m.csv.zip https://tranco-list.eu/top-1m.csv.zip && unzip top-1m.csv.zip
//   RUN=<run> DIR=<dir> FROM=1 TO=200000 node seed-tranco-dns.mjs top-1m.csv   # -> {RUN}_seed.csv (domain,rank)
//   then: node prep-input.mjs {RUN}_seed.csv
import { readFileSync, writeFileSync } from 'node:fs';
import { promises as dns } from 'node:dns';
const DIR = process.env.DIR || '.', RUN = process.env.RUN || 'run';
const FROM = Number(process.env.FROM || 1), TO = Number(process.env.TO || 200000), CONC = Number(process.env.CONC || 200);
const SHOPIFY_NET = /^23\.227\.38\./;
const SKIP_TLD = /\.(gov|edu|mil|int)$|\.(ac|edu|gov)\.[a-z]{2}$/;
const file = process.argv[2] || 'top-1m.csv';
const rows = readFileSync(file, 'utf8').split('\n').map((l) => l.trim().split(',')).filter((r) => r.length === 2 && +r[0] >= FROM && +r[0] <= TO && !SKIP_TLD.test(r[1]));
console.error(`${rows.length} domains (rank ${FROM}-${TO}), CONC=${CONC}`);
const hits = []; let i = 0, n = 0, t0 = Date.now();
async function isShopify(d) {
  try { const a = await dns.resolve4(d); if (a.some((ip) => SHOPIFY_NET.test(ip))) return 'a'; } catch {}
  try { const c = await dns.resolveCname(d); if (c.some((x) => /myshopify\.com$/i.test(x))) return 'cname'; } catch {}
  return null;
}
async function worker() { while (i < rows.length) { const [rank, d] = rows[i++]; const via = await isShopify(d); if (via) hits.push({ rank: +rank, domain: d, via }); n++; if (n % 20000 === 0) console.error(`${n}/${rows.length}  shopify so far: ${hits.length}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`); } }
await Promise.all(Array.from({ length: CONC }, worker));
hits.sort((a, b) => a.rank - b.rank);
writeFileSync(`${DIR}/${RUN}_seed.csv`, 'domain,rank\n' + hits.map((h) => `${h.domain},${h.rank}`).join('\n'));
console.error(`===== ${RUN}: ${hits.length} Shopify-resolving domains of ${rows.length} (${(100 * hits.length / rows.length).toFixed(1)}%) -> ${RUN}_seed.csv in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
