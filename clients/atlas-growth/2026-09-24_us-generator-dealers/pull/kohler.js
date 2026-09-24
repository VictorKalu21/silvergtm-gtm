#!/usr/bin/env node
// Kohler / Rehlko home-generator dealer full-US pull.
// Recipe: icp-source-planner/library/oem-dealer-locators--us-generator-installers.md "## Kohler (Rehlko)".
// Endpoint: GET web-api.rehlko.com/geojson/energy/dealers?address=<zip5>&brand=energy&distMiles=100&maxItemPerPage=49&page=N
// Public-by-design key NEXT_PUBLIC_DEALER_LOCATOR_SUBSCRIPTION_KEY from kohlerhomeenergy.rehlko.com /_next/static chunk
// (re-grep the chunks if it rotates). Probed 2026-09-24: distMiles ignored (10 vs 199 -> same 31), state/empty address
// -> 400, result = dealers whose service territory covers the ZIP (Houston ~30, Queens 1, 10001 0, MT dealers 213-299 mi).
// Plan: phase A greedy ZCTA cover at d=20 mi; phase B snowball = query every found dealer's own ZIP until closure;
// phase C = random 300-ZCTA yield check (reported, not chased). Resume-safe via raw/kohler.queries.jsonl.
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, ['--no-warnings', ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(r.status ?? 1);
}
const RAW = path.join(__dirname, '..', 'raw');
const OUT = path.join(RAW, 'kohler.jsonl'), QLOG = path.join(RAW, 'kohler.queries.jsonl'), PROG = path.join(RAW, 'kohler.progress.json');
const ZCTA = require(path.join(RAW, 'zcta-2025.json'));
let KEY = process.env.REHLKO_KEY || ''; // resolved at runtime from the site's JS (public NEXT_PUBLIC_ key; never committed)
const COVER_D = 20, SAMPLE_N = 300, MIN_GAP_MS = 550, WORKERS = 2, MAX_TRIES = 7;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const rad = Math.PI / 180;
const hav = (a, b, c, d) => { const x = Math.sin((c - a) * rad / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin((d - b) * rad / 2) ** 2; return 2 * 3958.8 * Math.asin(Math.sqrt(x)); };
const ZSET = new Set(ZCTA.map(z => z[0]));
function cover(pts, d) {
  const cell = d / 69, g = new Map(), out = [];
  for (const p of pts) {
    const i = Math.floor(p[1] / cell), j = Math.floor(p[2] / cell); let ok = false;
    for (let a = -2; a <= 2 && !ok; a++) for (let b = -4; b <= 4 && !ok; b++) {
      const L = g.get((i + a) + ',' + (j + b)); if (L) for (const q of L) if (hav(p[1], p[2], q[1], q[2]) <= d) { ok = true; break; }
    }
    if (!ok) { out.push(p); const k = i + ',' + j; if (!g.has(k)) g.set(k, []); g.get(k).push(p); }
  }
  return out;
}
const done = new Map();
if (fs.existsSync(QLOG)) for (const l of fs.readFileSync(QLOG, 'utf8').split('\n')) { if (!l.trim()) continue; try { const o = JSON.parse(l); if (!o.failed) done.set(o.zip, o); } catch {} }
const seen = new Map(); // id -> postal
if (fs.existsSync(OUT)) for (const l of fs.readFileSync(OUT, 'utf8').split('\n')) { if (!l.trim()) continue; try { const o = JSON.parse(l); seen.set(o.id, o.postal); } catch {} }
const stats = { started: new Date().toISOString(), callsThisRun: 0, retries: 0, failed: 0, phases: {} };
const writeProg = () => { const t = PROG + '.tmp'; fs.writeFileSync(t, JSON.stringify({ ...stats, uniqueDealers: seen.size, zipsDone: done.size, updated: new Date().toISOString() }, null, 1)); fs.renameSync(t, PROG); };
let last = 0; const sleep = ms => new Promise(r => setTimeout(r, ms));
async function gate() { for (;;) { const now = Date.now(), w = last + MIN_GAP_MS - now; if (w <= 0) { last = now; return; } await sleep(w); } }
async function get(zip, page) {
  const url = `https://web-api.rehlko.com/geojson/energy/dealers?address=${zip}&brand=energy&distMiles=100&maxItemPerPage=49&page=${page}`;
  for (let t = 1; t <= MAX_TRIES; t++) {
    await gate();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60000), headers: { 'user-agent': UA, 'ocp-apim-subscription-key': KEY, authorization: 'Bearer ', origin: 'https://www.kohlerhomeenergy.rehlko.com', referer: 'https://www.kohlerhomeenergy.rehlko.com/' } });
      stats.callsThisRun++;
      if (res.status === 200) return await res.json();
      if (res.status === 400 || res.status === 404) return { info: [], totalPages: 0, totalRecords: 0, http: res.status };
      throw new Error('http ' + res.status);
    } catch (e) { stats.retries++; const back = Math.min(120000, 2000 * 2 ** (t - 1)) + Math.random() * 1000; console.error(`[retry ${t}] ${zip} p${page} ${e.message}`); await sleep(back); }
  }
  return null;
}
function norm(x, zip) {
  return { id: x.id, sf_id: x.sfId || '', sap_customer_number: x.sapCustomerNumber ?? null, name: (x.name || '').trim(), tier: x.accountSupType || '',
    product_line: x.productLine || '', product_sub_category: x.productSubCategory || '', generator_certification: x.generatorCertification || '',
    residential: /Home Generators/i.test(x.productSubCategory || ''), light_commercial: /Light Commercial/i.test(x.productSubCategory || ''),
    services_offered: x.servicesOffered || '', financing_programs: x.financingPrograms || '', utility_programs: x.externalCampaignParticipations || '',
    microsite_url: x.micrositeUrl || '', website: '', email: '', rehlko_rep_email: x.emailLead || '', phone: x.phone || (x.telephoneNumber ? String(x.telephoneNumber) : ''),
    street: (x.street || '').trim(), city: (x.city || '').trim(), state: (x.state || '').trim(), postal: x.postalCode != null ? String(x.postalCode).padStart(5, '0') : '', country: x.country || '',
    lat: x.latitude ?? null, lng: x.longitude ?? null, partner_hq_users: x.partnerHQUsers ?? null, website_locator: x.websiteLocator ?? null,
    first_query: zip, pulled_at: new Date().toISOString(), raw_keys: Object.keys(x).join(',') };
}
async function runZip(zip, phase) {
  let page = 1, pages = 1, n = 0, fresh = 0, total = 0;
  while (page <= pages) {
    const j = await get(zip, page); if (!j) { stats.failed++; fs.appendFileSync(QLOG, JSON.stringify({ zip, failed: true, phase }) + '\n'); return; }
    pages = j.totalPages || 0; total = j.totalRecords || 0; const lines = [];
    for (const x of j.info || []) { n++; if (x.country && x.country !== 'US') continue; if (!seen.has(x.id)) { const r = norm(x, zip); seen.set(x.id, r.postal); fresh++; lines.push(JSON.stringify(r)); } }
    if (lines.length) fs.appendFileSync(OUT, lines.join('\n') + '\n');
    page++;
  }
  const rec = { zip, phase, n, total, fresh, at: new Date().toISOString() };
  fs.appendFileSync(QLOG, JSON.stringify(rec) + '\n'); done.set(zip, rec);
  const P = stats.phases[phase]; P.done++; P.fresh += fresh;
  if (stats.callsThisRun % 25 === 0) { writeProg(); console.error(`${phase} ${P.done}/${P.planned} calls=${stats.callsThisRun} unique=${seen.size}`); }
}
async function runPhase(phase, zips) {
  const todo = zips.filter(z => !done.has(z)); stats.phases[phase] = stats.phases[phase] || { planned: 0, done: 0, fresh: 0 };
  stats.phases[phase].planned += todo.length; let i = 0;
  await Promise.all(Array.from({ length: WORKERS }, async () => { while (i < todo.length) await runZip(todo[i++], phase); }));
  writeProg(); console.error(`${phase}: ${todo.length} zips, unique=${seen.size}`);
}
async function resolveKey() {
  if (KEY) return; const B = 'https://www.kohlerhomeenergy.rehlko.com';
  const html = await (await fetch(B + '/find-a-dealer', { headers: { 'user-agent': UA } })).text();
  for (const c of [...new Set(html.match(/\/_next\/static\/[^"]+?\.js/g) || [])]) {
    const js = await (await fetch(B + c, { headers: { 'user-agent': UA } })).text();
    const m = js.match(/DEALER_LOCATOR_SUBSCRIPTION_KEY:"([0-9a-f]{32})"/); if (m) { KEY = m[1]; console.error('key resolved from ' + c); return; }
  }
  throw new Error('DEALER_LOCATOR_SUBSCRIPTION_KEY not found in page chunks');
}
async function main() {
  await resolveKey();
  const seeds = cover([...ZCTA].sort((a, b) => a[0].localeCompare(b[0])), COVER_D).map(z => z[0]);
  console.error(`phase A cover d=${COVER_D}: ${seeds.length} zips; resume ${done.size} done, ${seen.size} dealers`);
  await runPhase('A_cover', seeds);
  for (let round = 1; round <= 10; round++) {   // B: snowball dealer home ZIPs until closure
    const z = [...new Set([...seen.values()])].filter(p => p && ZSET.has(p) && !done.has(p));
    if (!z.length) break; console.error(`phase B round ${round}: ${z.length} dealer zips`); await runPhase('B_snowball', z);
  }
  // C: yield check on a deterministic pseudo-random sample of unqueried ZCTAs
  let s = 12345; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pool = ZCTA.map(z => z[0]).filter(z => !done.has(z)); const sample = [];
  while (sample.length < SAMPLE_N && pool.length) sample.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  const before = seen.size; await runPhase('C_yield_check', sample);
  stats.yieldCheck = { sample: sample.length, newDealers: seen.size - before, pctOfTotal: +(100 * (seen.size - before) / Math.max(1, seen.size)).toFixed(2) };
  stats.finished = new Date().toISOString(); writeProg();
  console.error(`DONE calls=${stats.callsThisRun} unique=${seen.size} yieldCheck=${JSON.stringify(stats.yieldCheck)}`);
}
main().catch(e => { console.error(e); writeProg(); process.exit(1); });
