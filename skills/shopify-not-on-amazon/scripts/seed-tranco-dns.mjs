// STEP 0 (alternative source, zero credentials) · Tranco top-1M x DNS = Shopify stores with a rank.
// Every standard Shopify storefront resolves to Shopify's 23.227.38.0/24 (or CNAMEs to shops.myshopify.com),
// so a DNS lookup is a free Shopify test. Tranco rank = the free traffic proxy (top-100k ~ 50k+/mo).
// Misses stores fronted by Cloudflare/Vercel (headless / custom proxies) — HTTP Archive (httparchive.sql)
// is the fuller source when you have BigQuery; this one needs nothing but the Tranco CSV.
//
// Resolver pool = UDP public resolvers + DNS-over-HTTPS (Google, Cloudflare), round-robin with one retry on a
// different resolver: public resolvers rate-limit a single IP at ~50-100 answers/s, so mixing transports is
// what makes 300k lookups take ~30-40 min instead of hours. TLD pre-filter keeps only TLDs a US DTC brand uses.
//
//   curl -L -o top-1m.csv.zip https://tranco-list.eu/top-1m.csv.zip && unzip top-1m.csv.zip
//   RUN=<run> DIR=<dir> FROM=1 TO=300000 node seed-tranco-dns.mjs top-1m.csv   # -> {RUN}_seed.csv (domain,rank)
//   env: CONC (240)  TLDS (comma list; default com,co,net,shop,store,us,io,me,life,world,love,fit,beauty,skin,pet,dog,baby,kids,health,coffee,wine,bike,golf,surf,yoga,boutique,clothing,fashion,shoes,jewelry,toys,tools,cars,studio,design,supply,supplies,house,home,garden,kitchen,farm,organic,vet,care,fun,cool,ninja,xyz,live,online,site,website,today,now,one,plus,pro,tech,app)
import { readFileSync, writeFileSync } from 'node:fs';
import dns from 'node:dns';
const DIR = process.env.DIR || '.', RUN = process.env.RUN || 'run';
const FROM = Number(process.env.FROM || 1), TO = Number(process.env.TO || 300000), CONC = Number(process.env.CONC || 240);
const TLDS = new Set((process.env.TLDS || 'com,co,net,shop,store,us,io,me,life,world,love,fit,beauty,skin,pet,dog,baby,kids,health,coffee,wine,bike,golf,surf,yoga,boutique,clothing,fashion,shoes,jewelry,toys,tools,cars,studio,design,supply,supplies,house,home,garden,kitchen,farm,organic,vet,care,fun,cool,ninja,xyz,live,online,site,website,today,now,one,plus,pro,tech,app').split(','));
const SHOPIFY_NET = /^23\.227\.38\./;
const file = process.argv[2] || 'top-1m.csv';
const rows = readFileSync(file, 'utf8').split('\n').map((l) => l.trim().split(',')).filter((r) => r.length === 2 && +r[0] >= FROM && +r[0] <= TO && TLDS.has(r[1].split('.').pop()) && r[1].split('.').length === 2);
console.error(`${rows.length} domains after TLD filter (rank ${FROM}-${TO}), CONC=${CONC}`);

// ---- resolver pool ----
const udp = (ip) => { const r = new dns.promises.Resolver({ timeout: 4000, tries: 1 }); r.setServers([ip]); return async (d) => (await r.resolve4(d)); };
const doh = (base) => async (d) => { const res = await fetch(`${base}?name=${encodeURIComponent(d)}&type=A`, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(8000) }); if (res.status !== 200) throw Object.assign(new Error('http' + res.status), { code: 'EHTTP' }); const j = await res.json(); if (j.Status === 3) throw Object.assign(new Error('nx'), { code: 'ENOTFOUND' }); return (j.Answer || []).filter((a) => a.type === 1).map((a) => a.data); };
const POOL = [udp('8.8.8.8'), udp('1.1.1.1'), udp('9.9.9.9'), udp('8.8.4.4'), udp('1.0.0.1'), doh('https://dns.google/resolve'), doh('https://cloudflare-dns.com/dns-query'), doh('https://dns.google/resolve'), doh('https://cloudflare-dns.com/dns-query')];
let k = 0; const errs = {};
async function isShopify(d) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = POOL[k++ % POOL.length];
    try { const a = await r(d); return a.some((ip) => SHOPIFY_NET.test(ip)) ? 'a' : null; }
    catch (e) { const c = e.code || e.name; if (c === 'ENOTFOUND' || c === 'ENODATA') return null; errs[c] = (errs[c] || 0) + 1; }
  }
  errs.gave_up = (errs.gave_up || 0) + 1; return null;
}
const hits = []; let i = 0, n = 0, t0 = Date.now();
async function worker() { while (i < rows.length) { const [rank, d] = rows[i++]; const via = await isShopify(d); if (via) hits.push({ rank: +rank, domain: d, via }); n++; if (n % 10000 === 0) { console.error(`${n}/${rows.length}  shopify so far: ${hits.length}  ${(n / ((Date.now() - t0) / 1000)).toFixed(0)}/s  errs ${JSON.stringify(errs)}`); writeFileSync(`${DIR}/${RUN}_seed.csv`, 'domain,rank\n' + hits.map((h) => `${h.domain},${h.rank}`).join('\n')); } } }
await Promise.all(Array.from({ length: CONC }, worker));
hits.sort((a, b) => a.rank - b.rank);
writeFileSync(`${DIR}/${RUN}_seed.csv`, 'domain,rank\n' + hits.map((h) => `${h.domain},${h.rank}`).join('\n'));
console.error(`===== ${RUN}: ${hits.length} Shopify-resolving domains of ${rows.length} (${(100 * hits.length / rows.length).toFixed(2)}%) -> ${RUN}_seed.csv in ${((Date.now() - t0) / 1000).toFixed(0)}s  errs ${JSON.stringify(errs)}`);
