#!/usr/bin/env node
// Generac HOME STANDBY (category 1) full-US dealer pull.
// Recipe: icp-source-planner/library/oem-dealer-locators--us-generator-installers.md "## Generac".
// v2 log (generac.queries.v2.jsonl): v1 used n>=100 as saturation, which was wrong (see SUBCAP below).
// Probed 2026-09-24: no page/pageSize/limit param, no state or country-wide query (USA w/o postalCode -> 0),
// centroidLatitude/Longitude ignored (postalCode sets the centre), hard cap 100 = 50 tier dealers + 50 aligned contractors, each sorted tier-group then distance.
// => adaptive ZIP grid: seed greedy cover of ZCTA centroids at r=50 (cover 40 mi), any query returning
//    100 (saturated) is split into a greedy cover at 25 -> 10 -> 5 mi of the ZCTAs inside its disk.
// Resume-safe: every finished query appends to raw/generac.queries.jsonl; new dealers append to
// raw/generac.jsonl; the plan is deterministic, so a rerun replays the log and continues where it stopped.
// Usage: node pull/generac.js            (needs NODE_USE_ENV_PROXY=1 behind the agent proxy; auto re-execs)
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, ['--no-warnings', ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(r.status ?? 1);
}
const RAW = path.join(__dirname, '..', 'raw');
const OUT = path.join(RAW, 'generac.jsonl'), QLOG = path.join(RAW, 'generac.queries.v2.jsonl'), PROG = path.join(RAW, 'generac.progress.json');
const ZCTA = require(path.join(RAW, 'zcta-2025.json')); // [zip, lat, lng, aland_sqmi] 50 states + DC (Census 2025 gazetteer)
const LEVELS = [{ r: 50, d: 40 }, { r: 25, d: 20 }, { r: 10, d: 7 }, { r: 5, d: 3.5 }];
const CAP = 100, SUBCAP = 50, ALIGNED = new Set([20, 21]), MIN_GAP_MS = 550, WORKERS = 2, MAX_TRIES = 7;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

const rad = Math.PI / 180;
const hav = (a, b, c, d) => { const x = Math.sin((c - a) * rad / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin((d - b) * rad / 2) ** 2; return 2 * 3958.8 * Math.asin(Math.sqrt(x)); };
const ZBY = new Map(ZCTA.map(z => [z[0], z]));

// greedy cover: choose centres (from pts, in order) so every pt is within d miles of a centre
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
// Next level = ONE greedy cover over the union of ZCTAs inside any saturated parent disk (+margin); per-parent covers
// overlapped ~3x (3,728 vs 1,351 queries at r=25). ZIPs already queried at that radius are placed first so a resume reuses them.
function nextLevel(parents, lvl) {
  const L = LEVELS[lvl + 1]; if (!L || !parents.length) return [];
  const P = parents.map(q => { const c = ZBY.get(q.zip); return { lat: c[1], lng: c[2], m: q.r + (q.r - LEVELS[lvl].d) }; });
  const pts = ZCTA.filter(z => P.some(p => Math.abs(p.lat - z[1]) < p.m / 60 && hav(p.lat, p.lng, z[1], z[2]) <= p.m));
  const isDone = z => done.has(z[0] + '@' + L.r);
  pts.sort((a, b) => (isDone(b) - isDone(a)) || a[0].localeCompare(b[0]));
  return cover(pts, L.d).map(z => ({ zip: z[0], r: L.r, lvl: lvl + 1 }));
}
const key = q => q.zip + '@' + q.r;

// ---- state from disk
const done = new Map();          // key -> {n, saturated, failed}
if (fs.existsSync(QLOG)) for (const l of fs.readFileSync(QLOG, 'utf8').split('\n')) { if (!l.trim()) continue; try { const o = JSON.parse(l); if (!o.failed) done.set(o.key, o); } catch {} }
const seen = new Set();
if (fs.existsSync(OUT)) for (const l of fs.readFileSync(OUT, 'utf8').split('\n')) { if (!l.trim()) continue; try { seen.add(JSON.parse(l).id); } catch {} }
const unsatDisks = [];           // completed unsaturated queries: a child entirely inside one is skippable
const insideKnown = q => { const c = ZBY.get(q.zip); return unsatDisks.some(u => hav(c[1], c[2], u.lat, u.lng) + q.r <= u.r); };

const stats = { started: new Date().toISOString(), callsThisRun: 0, retries: 0, failed: 0, skippedInside: 0, byLevel: {}, unresolved: [] };
for (const L of LEVELS) stats.byLevel[L.r] = { planned: 0, calls: 0, saturated: 0 };
const writeProg = () => { const t = PROG + '.tmp'; fs.writeFileSync(t, JSON.stringify({ ...stats, uniqueDealers: seen.size, queriesDone: done.size, updated: new Date().toISOString() }, null, 1)); fs.renameSync(t, PROG); };

let last = 0; const sleep = ms => new Promise(r => setTimeout(r, ms));
async function gate() { for (;;) { const now = Date.now(), wait = last + MIN_GAP_MS - now; if (wait <= 0) { last = now; return; } await sleep(wait); } }
async function fetchQ(q) {
  const body = JSON.stringify({ category: '1', city: '', countryCode: 'USA', postalCode: q.zip, radius: q.r, siteID: 1, stateProvince: '', dealerServices: [], testMode: false });
  for (let t = 1; t <= MAX_TRIES; t++) {
    await gate();
    try {
      const res = await fetch('https://www.generac.com/DealerLocatorApi/GetDealers', { method: 'POST', body, signal: AbortSignal.timeout(90000),
        headers: { 'content-type': 'application/json', 'user-agent': UA, referer: 'https://www.generac.com/home-standby-generators/home-dealer-locator/', origin: 'https://www.generac.com' } });
      if (res.status === 200) { const j = await res.json(); if (j && Array.isArray(j.dealers)) return j; if (j && j.resultCount === 0) return { resultCount: 0, dealers: [] }; }
      if (res.status === 400 || res.status === 404) return { resultCount: 0, dealers: [], http: res.status };
      throw new Error('http ' + res.status);
    } catch (e) {
      stats.retries++; const back = Math.min(120000, 2000 * 2 ** (t - 1)) + Math.random() * 1000;
      console.error(`[retry ${t}] ${key(q)} ${e.message} -> sleep ${Math.round(back / 1000)}s`); await sleep(back);
    }
  }
  return null;
}
const tierName = x => { const img = ((x.dealerClassImageViewModel || {}).imageUrl || '').split('/').pop().replace(/\.png$/, '');
  return (x.dealerStatus || '').trim() || ({ prestige: 'Prestige', 'aligned-contractor-1': 'Aligned Contractor', 'aligned-contractor-service-warranty': 'Aligned Contractor (Service & Warranty)' }[img] || img || ''); };
function norm(x, q) {
  const services = (x.dealerServiceDetailsList || []).map(s => s.dealerServiceName);
  return { id: String(x.id), dealer_number: x.user2 || '', name: (x.dealerName || '').trim(), tier: tierName(x), dealer_class: x.dealerClass, dealer_status: (x.dealerStatus || '').trim(),
    badge: ((x.dealerClassImageViewModel || {}).imageUrl || '').split('/').pop(), services, sales: services.includes('Sales'), service: services.includes('Service'),
    email: (x.email || '').trim(), website: (x.webSite || '').trim(), phone: x.phone ? String(x.phone) : '',
    address1: (x.address1 || '').trim(), address2: (x.address2 || '').trim(), city: (x.city || '').trim(), state: (x.stateProvince || '').trim(), postal: (x.postal || '').trim(), country: x.countryCode,
    lat: x.latitude ? Number(x.latitude) : null, lng: x.longitude ? Number(x.longitude) : null, rating: x.rating ?? null, distributor: !!x.distributor,
    user1: x.user1 || '', user3: x.user3 || '', category: '1', first_query: key(q), pulled_at: new Date().toISOString() };
}

async function main() {
  let queue = cover([...ZCTA].sort((a, b) => a[0].localeCompare(b[0])), LEVELS[0].d).map(z => ({ zip: z[0], r: LEVELS[0].r, lvl: 0 }));
  stats.byLevel[50].planned = queue.length;
  console.error(`seeds ${queue.length}; resume: ${done.size} queries done, ${seen.size} dealers`);
  let lvl = 0;
  while (queue.length) {
    const satParents = [], pending = [];
    for (const q of queue) {
      const k = key(q), prev = done.get(k);
      if (prev) { if (prev.saturated) satParents.push(q); else { const c = ZBY.get(q.zip); unsatDisks.push({ lat: c[1], lng: c[2], r: q.r }); } }
      else pending.push(q);
    }
    let i = 0;
    const worker = async () => {
      while (i < pending.length) {
        const q = pending[i++], k = key(q);
        if (q.lvl > 0 && insideKnown(q)) { stats.skippedInside++; continue; }
        const j = await fetchQ(q); stats.callsThisRun++; stats.byLevel[q.r].calls++;
        if (!j) { stats.failed++; fs.appendFileSync(QLOG, JSON.stringify({ key: k, failed: true, at: new Date().toISOString() }) + '\n'); continue; }
        const ds = j.dealers || []; let fresh = 0; const lines = [];
        for (const x of ds) { if (x.countryCode && x.countryCode !== 'USA') continue; const id = String(x.id); if (!seen.has(id)) { seen.add(id); fresh++; lines.push(JSON.stringify(norm(x, q))); } }
        if (lines.length) fs.appendFileSync(OUT, lines.join('\n') + '\n');
        // Cap is TWO sub-caps of 50 (probed 2026-09-24, 11793 r50 = 50 tier dealers + 50 aligned contractors; r25 = 50 + 12
        // and it silently dropped 11 of 37 dealers within 10 mi). Saturated = either bucket at 50. Class 1 (no badge) is
        // counted in both buckets (bucket unknown -> conservative).
        const aligned = ds.filter(x => ALIGNED.has(x.dealerClass) || x.dealerClass === 1).length;
        const tiered = ds.filter(x => !ALIGNED.has(x.dealerClass)).length;
        const saturated = ds.length >= CAP || aligned >= SUBCAP || tiered >= SUBCAP;
        const rec = { key: k, zip: q.zip, r: q.r, lvl: q.lvl, n: ds.length, tiered, aligned, fresh, saturated, http: j.http || 200, at: new Date().toISOString(), ids: ds.map(x => String(x.id)) };
        fs.appendFileSync(QLOG, JSON.stringify(rec) + '\n'); done.set(k, rec);
        if (saturated) { stats.byLevel[q.r].saturated++; satParents.push(q); if (!LEVELS[q.lvl + 1]) stats.unresolved.push(k); }
        else { const c = ZBY.get(q.zip); unsatDisks.push({ lat: c[1], lng: c[2], r: q.r }); }
        if (stats.callsThisRun % 20 === 0) { writeProg(); console.error(`L${q.r} ${i}/${pending.length} calls=${stats.callsThisRun} unique=${seen.size} saturated=${satParents.length}`); }
      }
    };
    await Promise.all(Array.from({ length: WORKERS }, worker));
    queue = nextLevel(satParents, lvl); lvl++;
    if (LEVELS[lvl]) stats.byLevel[LEVELS[lvl].r].planned += queue.length;
    writeProg(); console.error(`level done -> ${queue.length} child queries`);
  }
  // saturated queries at the last level have no children -> unresolved
  for (const [k, o] of done) if (o.saturated && o.r === LEVELS[LEVELS.length - 1].r && !stats.unresolved.includes(k)) stats.unresolved.push(k);
  stats.finished = new Date().toISOString(); writeProg();
  console.error(`DONE calls=${stats.callsThisRun} unique=${seen.size} failed=${stats.failed} unresolved=${stats.unresolved.length}`);
}
main().catch(e => { console.error(e); writeProg(); process.exit(1); });
