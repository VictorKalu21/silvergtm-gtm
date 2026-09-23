// OPTIONAL paid enrichment via DataForSEO (the buyer of this list pays for it). Three modes, all resume-safe:
//   node dataforseo.mjs amazon-volume   # Amazon.com monthly search volume for each brand name = "branded searches on Amazon"
//                                       #   -> {RUN}_dfs_amazon.json   (Labs: dataforseo_labs/amazon/bulk_search_volume/live, <=1000 keywords/call)
//   node dataforseo.mjs traffic         # estimated monthly organic+paid visits per domain -> {RUN}_dfs_traffic.json
//                                       #   (Labs: dataforseo_labs/google/bulk_traffic_estimation/live, <=1000 targets/call)
//   node dataforseo.mjs serp-store      # Google store-page check. CALIBRATED AND REJECTED: 2/60 and 0/10 recall on brands with a confirmed
//                                       #   Amazon store (see IMPROVEMENTS.md #5). Kept for reference only; do not use as a screen.
//                                       #   -> {RUN}_dfs_serp.json  (serp/google/organic/live/regular, 1 query per brand, ~$0.002 each)
// env: DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD (required), RUN, DIR, LIMIT,
//      SOURCE = input  -> every seeded domain ({RUN}_input.json) - use this for `traffic` BEFORE the gates: at ~$0.0001/domain it is far
//                         cheaper to cut the population to 20k+/50k+ visits first than to fetch 3 pages from every store
//             = signal -> gate survivors      = keeps -> classified brands (default when {RUN}_keeps.json exists)
// NOTE: endpoint paths and response shapes follow the DataForSEO v3 docs as of 2026-09; written without a live account,
//       so run `LIMIT=5` first and eyeball {RUN}_dfs_*.json before a full batch. merge.mjs final picks these files up if present.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { brandOf, brandVariants, tok, GENERIC_WORDS } from './amazon-autocomplete.mjs';
const DIR = process.env.DIR || '.', RUN = process.env.RUN || 'run', MODE = process.argv[2];
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64');
if (!MODE || !process.env.DATAFORSEO_LOGIN) { console.error('usage: DATAFORSEO_LOGIN=.. DATAFORSEO_PASSWORD=.. node dataforseo.mjs [amazon-volume|traffic|serp-store]'); process.exit(1); }
const rd = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8').replace(/^﻿/, ''));
const src = process.env.SOURCE === 'input' ? rd(`${RUN}_input.json`)
  : process.env.SOURCE === 'signal' || !existsSync(`${DIR}/${RUN}_keeps.json`) ? rd(`${RUN}_signal.json`).filter((r) => r.status === 'pass_free_gates')
  : rd(`${RUN}_keeps.json`);
const rows = process.env.LIMIT ? src.slice(0, Number(process.env.LIMIT)) : src;
const ac = existsSync(`${DIR}/${RUN}_amazon_ac.json`) ? rd(`${RUN}_amazon_ac.json`) : {};
const QOVR = existsSync(`${DIR}/${RUN}_query_overrides.json`) ? rd(`${RUN}_query_overrides.json`) : {};   // same hand overrides the verifier uses
const queryOf = (r) => QOVR[r.domain] || ac[r.domain]?.query || brandVariants(brandOf(r))[0];

async function post(path, body) {
  const res = await fetch(`https://api.dataforseo.com/v3/${path}`, { method: 'POST', headers: { Authorization: AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  const j = await res.json();
  if (j.status_code !== 20000) throw new Error(`dataforseo ${j.status_code} ${j.status_message}`);
  return j.tasks || [];
}
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

if (MODE === 'amazon-volume') {
  const OUT = `${DIR}/${RUN}_dfs_amazon.json`; const done = existsSync(OUT) ? rd(`${RUN}_dfs_amazon.json`) : {};
  const todo = rows.filter((r) => !done[r.domain]);
  for (const batch of chunk(todo, 1000)) {
    const kw = new Map(batch.map((r) => [queryOf(r).toLowerCase(), r.domain]));
    const tasks = await post('dataforseo_labs/amazon/bulk_search_volume/live', [{ keywords: [...kw.keys()], location_code: 2840, language_code: 'en' }]);
    for (const t of tasks) for (const res of t.result || []) for (const it of res.items || []) { const d = kw.get((it.keyword || '').toLowerCase()); if (d) done[d] = { keyword: it.keyword, amazon_search_volume: it.search_volume ?? null, cost: t.cost }; }
    for (const [k, d] of kw) if (!done[d]) done[d] = { keyword: k, amazon_search_volume: null, note: 'no data' };
    writeFileSync(OUT, JSON.stringify(done, null, 1)); console.error(`amazon-volume: ${Object.keys(done).length}/${rows.length}`);
  }
} else if (MODE === 'traffic') {
  const OUT = `${DIR}/${RUN}_dfs_traffic.json`; const done = existsSync(OUT) ? rd(`${RUN}_dfs_traffic.json`) : {};
  const todo = rows.filter((r) => !done[r.domain]);
  for (const batch of chunk(todo, 1000)) {
    const tasks = await post('dataforseo_labs/google/bulk_traffic_estimation/live', [{ targets: batch.map((r) => r.domain), location_code: 2840, language_code: 'en' }]);
    for (const t of tasks) for (const res of t.result || []) for (const it of res.items || []) { const d = (it.target || '').replace(/^www\./, ''); done[d] = { organic_etv: it.metrics?.organic?.etv ?? null, paid_etv: it.metrics?.paid?.etv ?? null, organic_keywords: it.metrics?.organic?.count ?? null }; }
    for (const r of batch) if (!done[r.domain]) done[r.domain] = { organic_etv: null, note: 'no data' };
    writeFileSync(OUT, JSON.stringify(done, null, 1)); console.error(`traffic: ${Object.keys(done).length}/${rows.length}`);
  }
} else if (MODE === 'serp-store') {
  const OUT = `${DIR}/${RUN}_dfs_serp.json`; const done = existsSync(OUT) ? rd(`${RUN}_dfs_serp.json`) : {};
  const todo = rows.filter((r) => !done[r.domain]);
  // Amazon's byline uses the registered brand name, which is usually the store name minus corporate/category words
  // ("Visit the WYZE Store", not "wyze labs"): query the full name AND the stripped variant when they differ.
  const variants = (r) => { const q = queryOf(r); const stripped = q.split(/\s+/).filter((w) => !GENERIC_WORDS.has(tok(w))).join(' '); return [...new Set([q, stripped].filter((x) => x && tok(x).length >= 3))]; };
  const jobs = todo.flatMap((r) => variants(r).map((q, i) => ({ r, q, tag: `${r.domain}|${i}` })));
  for (const batch of chunk(jobs, 20)) {
    // QUERY_MODE=stores (default): site:amazon.com/stores "<brand>" matches the store page title ("Amazon.com: <Brand>").
    // QUERY_MODE=byline: site:amazon.com "Visit the <brand> Store" - calibrated at 2/60 recall (Google does not index the byline text); kept for reference.
    const kw = (q) => process.env.QUERY_MODE === 'byline' ? `site:amazon.com "Visit the ${q} Store"` : `site:amazon.com/stores "${q}"`;
    const tasks = await post('serp/google/organic/live/regular', batch.map((j) => ({ keyword: kw(j.q), location_code: 2840, language_code: 'en', depth: 10, tag: j.tag })));
    for (const t of tasks) {
      const d = (t.data?.tag || '').split('|')[0]; if (!d) continue;
      const items = (t.result?.[0]?.items || []).filter((i) => i.type === 'organic');
      const storeHit = items.find((i) => /amazon\.com\/stores\//i.test(i.url || '')) || items.find((i) => /Visit the .* Store/i.test((i.title || '') + ' ' + (i.description || '')));
      const rec = { query: t.data?.keyword, hits: items.length, store_url: storeHit?.url || null, store_title: storeHit?.title || null, google_store_found: !!storeHit, cost: (done[d]?.cost || 0) + (t.cost || 0) };
      if (!done[d] || (rec.google_store_found && !done[d].google_store_found)) done[d] = { ...rec, cost: (done[d]?.cost || 0) + (t.cost || 0) }; else done[d].cost = rec.cost;
    }
    for (const r of batch) if (!done[r.domain]) done[r.domain] = { hits: 0, google_store_found: false, note: 'no result' };
    writeFileSync(OUT, JSON.stringify(done, null, 1)); console.error(`serp-store: ${Object.keys(done).length}/${rows.length}`);
  }
} else { console.error('unknown mode'); process.exit(1); }
