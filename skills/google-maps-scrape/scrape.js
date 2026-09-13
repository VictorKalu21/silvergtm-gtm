#!/usr/bin/env node
/*
 * google-maps-scrape :: scraper.tech executor
 * One search call per (category x geo tile) by default; with scrape_tuning.paginate
 * it pages the viewport to exhaustion via `offset` (CORRECTED 2026-09-13: offset
 * pagination WORKS — the old "it's broken" note was stale, see paginate.js). Falls
 * back to quadrant-splitting at zoom+1 when a tile still saturates. Dedups on place_id, applies
 * the client footprint / DQ filters, and writes a clean list for enrichment.
 *
 * Usage:
 *   node scrape.js --runsheet <csv> --config <json> --out <dir> [--env <path>]
 *
 * Run-sheet CSV columns (header required):
 *   cell_id,icp_type,query,lat,lng,zoom,priority
 *
 * Config JSON (geo block; qualification is done separately by qualify-leads.js):
 *   { geo:{ country, footprint:{ mode:"postal"|"areas", postal_allow:[...], postal_match:"exact"|"prefix",
 *           postal_regex, postal_group, area_names:[...] }, area_label:{code:label} },
 *     scrape_tuning?:{ saturation, max_depth, quad_offset, limit, paginate, max_pages } }
 * NOTE: with paginate:true, SATURATION is effectively inert — a split then needs
 * max_pages*limit records. run_log.per_cell also becomes ONE roll-up event per runsheet
 * row (status 'ok' only if every page AND every sub-tile succeeded), which is what keeps
 * run-scrape.js's failedTiles() honest: it marks a tile ok if ANY event with that
 * query|lat|lng key is ok, and paginated pages share that key exactly.
 * NOTE: this stage only gates on closed + footprint. website / chains / category / size live in
 * qualify_rules (qualify-leads.js) so the clean list = the in-footprint, open universe.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const { pageTile, isOk } = require('./paginate');

// ---------------- tunables ----------------
// TEST SEAM: default unchanged. run-scrape.js:42 hardcodes SCRAPE_JS with no --engine
// override, so without an env-level host override the self-healing path cannot be tested
// at all — and the heal path is exactly what the pagination roll-up events exist to serve.
// Overridden only by tests pointing at a local fake searchmaps.php.
const API_HOST = process.env.SCRAPER_API_HOST || 'api.scraper.tech';
const API_PORT = process.env.SCRAPER_API_PORT || null;
const TRANSPORT = process.env.SCRAPER_API_PROTO === 'http' ? require('http') : https;
const API_PATH = '/searchmaps.php';
let LIMIT = 150;            // max records requested per call
let SATURATION = 90;        // >= this in one tile => likely incomplete => quadrant-split
let MAX_DEPTH = 1;          // levels of auto quadrant split (1 => up to 4 sub-tiles)
let QUAD_OFFSET = 0.025;    // deg offset for sub-tile centers (~2.8km)
let PAGINATE = false;       // opt-in: page each viewport via offset until exhausted (see paginate.js)
let MAX_PAGES = 8;          // guard on the offset loop (only used when PAGINATE)
const CALL_DELAY_MS = 350;  // politeness gap between calls
let COUNTRY = 'us';
const LANG = 'en';
let ZIP_RE = /\b(\d{5})(?:-\d{4})?\b/g; // postal-code matcher; default generic US ZIP. Override via geo.footprint.postal_regex.
let ZIP_GROUP = null;       // capture-group index for non-US postcodes (UK area letters etc.). Set via geo.footprint.postal_group.
let POSTAL_MATCH = 'exact'; // 'exact' (US ZIP) | 'prefix' (UK area letters etc.)
let FOOTPRINT_MODE = 'postal'; // 'postal' | 'areas' (areas => no postal filter; run-sheet tiles define the footprint)

// ---------------- args ----------------
function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? process.argv[i + 1] : def;
}
const RUNSHEET = arg('runsheet');
const CONFIG = arg('config');
const OUTDIR = arg('out', '.');
const ENVPATH = arg('env', path.join(__dirname, '.env'));
if (!RUNSHEET || !CONFIG) {
  console.error('ERROR: --runsheet and --config are required');
  process.exit(1);
}

// ---------------- helpers ----------------
const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function readCsv(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(l => l.trim());
  const head = lines.shift().split(',').map(s => s.trim());
  return lines.map(l => {
    const cells = l.split(',');
    const row = {};
    head.forEach((h, i) => row[h] = (cells[i] || '').trim());
    return row;
  });
}

function csvCell(v) {
  if (v == null) v = '';
  v = String(v);
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
function csvRow(arr) { return arr.map(csvCell).join(','); }

function parseZip(addr) {
  if (!addr) return null;
  if (ZIP_GROUP != null) {
    // capture-group mode (non-US): scan all matches, take the capture group of the LAST one
    // (postcode sits near the end of the address). Used e.g. for UK postcode-area letters.
    const re = new RegExp(ZIP_RE.source, ZIP_RE.flags.includes('g') ? ZIP_RE.flags : ZIP_RE.flags + 'g');
    let m, last = null;
    while ((m = re.exec(addr)) !== null) last = m;
    return last && last[ZIP_GROUP] ? last[ZIP_GROUP].toUpperCase() : null;
  }
  const m = addr.match(ZIP_RE);
  return m ? m[m.length - 1].slice(0, 5) : null; // last zip token in the string = the real one (zip is last in a US address); 5-digit core
}

function apiCall(query, lat, lng, zoom, offset) {
  const qs = new URLSearchParams({
    query, limit: LIMIT, country: COUNTRY, lang: LANG, lat, lng, offset: offset || 0, zoom
  }).toString();
  const opts = { host: API_HOST, path: `${API_PATH}?${qs}`, headers: { 'scraper-key': KEY }, timeout: 30000 };
  if (API_PORT) opts.port = API_PORT;
  return new Promise(resolve => {
    const req = TRANSPORT.get(opts, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({ status: 'parse_error', data: [] }); } });
    });
    req.on('error', e => resolve({ status: 'error', data: [], err: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 'timeout', data: [] }); });
  });
}

// Sub-tile centers for a quadrant split. QUAD_OFFSET is scaled by depth so a split
// actually SUBDIVIDES the parent viewport. It previously used a fixed offset at every
// depth, so max_depth>=2 spread sub-tiles OUTWARD by 2x the offset instead of inward.
// No-op for the shipped default (MAX_DEPTH=1 => only depth 0 splits => /2**0 === /1).
function quadCenters(lat, lng, depth) {
  const o = QUAD_OFFSET / Math.pow(2, depth);
  return [[o, o], [o, -o], [-o, o], [-o, -o]]
    .map(([dla, dln]) => [+(+lat + dla).toFixed(5), +(+lng + dln).toFixed(5)]);
}

// LEGACY PATH (PAGINATE off) — behaviour and run_log.json output are unchanged.
async function fetchTile(query, lat, lng, zoom, depth, log) {
  await sleep(CALL_DELAY_MS);
  const r = await apiCall(query, lat, lng, zoom);
  const recs = Array.isArray(r.data) ? r.data : [];
  log.calls++;
  const saturated = recs.length >= SATURATION && depth < MAX_DEPTH;
  log.events.push({ query, lat, lng, zoom, status: r.status, count: recs.length, split: saturated });
  let all = recs.slice();
  if (saturated) {
    for (const [sla, sln] of quadCenters(lat, lng, depth)) {
      const sub = await fetchTile(query, sla, sln, zoom + 1, depth + 1, log);
      all = all.concat(sub);
    }
  }
  return all;
}

// PAGED PATH (PAGINATE on). Emits exactly ONE roll-up event per runsheet row, covering
// every page and every descendant sub-tile:
//   status: 'ok' ONLY if every page of every sub-tile succeeded
//   count:  summed across pages + descendants
// Two reasons this must be a roll-up rather than one event per call:
//  (a) run-scrape.js::failedTiles marks a tile healthy if ANY event with key
//      query|lat|lng (2dp) is ok. Paginated pages share that key EXACTLY, so a tile
//      whose page 0 succeeded and page 2 timed out would score ok and never heal —
//      reintroducing the silent-coverage-hole class run-scrape.js exists to prevent.
//  (b) That key rounds to ~1.1km, so sub-tile centers frequently collide with OTHER
//      runsheet tiles' keys (with quad_offset 0.01, vi-core's child lands on vi-south's
//      key). Not emitting child events stops tile A's sub-tile from masking tile B's
//      genuine failure.
async function fetchTilePaged(query, lat, lng, zoom, depth, log, roll) {
  const isRoot = !roll;
  if (isRoot) roll = { ok: true, count: 0, pages: 0, splits: 0, statuses: [] };

  const res = await pageTile({
    call: off => apiCall(query, lat, lng, zoom, off),
    limit: LIMIT,
    paginate: true,
    maxPages: MAX_PAGES,
    delay: () => sleep(CALL_DELAY_MS),
  });

  log.calls += res.pages;
  roll.pages += res.pages;
  roll.count += res.records.length;
  for (const s of res.statuses) roll.statuses.push(s);
  if (!res.allOk) roll.ok = false;

  // Pagination exhausts the viewport, so a split is only warranted when the page guard
  // was actually hit — SATURATION cannot fire here (it would need max_pages*limit records).
  const saturated = res.pages >= MAX_PAGES && res.allOk && depth < MAX_DEPTH;
  let all = res.records.slice();
  if (saturated) {
    roll.splits++;
    for (const [sla, sln] of quadCenters(lat, lng, depth)) {
      const sub = await fetchTilePaged(query, sla, sln, zoom + 1, depth + 1, log, roll);
      all = all.concat(sub);
    }
  }

  if (isRoot) {
    log.events.push({
      query, lat, lng, zoom,
      status: roll.ok ? 'ok' : (roll.statuses.find(s => !isOk(s)) || 'error'),
      count: roll.count,
      split: roll.splits > 0,
      pages: roll.pages,
      splits: roll.splits,
      page_statuses: roll.statuses,
    });
  }
  return all;
}

// ---------------- main ----------------
const KEY = loadEnv(ENVPATH).SCRAPER_TECH_KEY;
if (!KEY) { console.error('ERROR: SCRAPER_TECH_KEY not found in ' + ENVPATH); process.exit(1); }

(async () => {
  const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  const geo = cfg.geo || {};
  const fp = geo.footprint || {};
  if (geo.country) COUNTRY = geo.country;                         // e.g. "gb"; default "us"
  if (fp.postal_regex) ZIP_RE = new RegExp(fp.postal_regex, 'g'); // override postal matcher (default generic US ZIP)
  if (fp.postal_group != null) ZIP_GROUP = fp.postal_group;       // capture-group index for non-US postcodes
  if (fp.postal_match) POSTAL_MATCH = fp.postal_match;            // 'exact' | 'prefix'
  if (fp.mode) FOOTPRINT_MODE = fp.mode;                          // 'postal' | 'areas'
  const tune = cfg.scrape_tuning || {};
  if (tune.saturation != null) SATURATION = tune.saturation;
  if (tune.max_depth != null) MAX_DEPTH = tune.max_depth;
  if (tune.quad_offset != null) QUAD_OFFSET = tune.quad_offset;
  if (tune.limit != null) LIMIT = tune.limit;
  if (tune.paginate != null) PAGINATE = tune.paginate;
  if (tune.max_pages != null) MAX_PAGES = tune.max_pages;
  const footprint = new Set((fp.postal_allow || []).map(s => String(s).toUpperCase()));
  const labels = geo.area_label || {};
  const inFootprint = (zip) => {
    if (FOOTPRINT_MODE === 'areas') return true;          // tiles define the footprint; no postal filter
    if (!zip) return false;
    if (POSTAL_MATCH === 'prefix') { for (const p of footprint) if (zip.startsWith(p)) return true; return false; }
    return footprint.has(zip);
  };
  const rows = readCsv(RUNSHEET);
  fs.mkdirSync(OUTDIR, { recursive: true });

  const log = { calls: 0, events: [] };
  const byId = new Map(); // place_id -> record (merged)

  for (const row of rows) {
    if (!row.query || !row.lat || !row.lng) continue;
    const recs = PAGINATE
      ? await fetchTilePaged(row.query, row.lat, row.lng, Number(row.zoom) || 13, 0, log)
      : await fetchTile(row.query, row.lat, row.lng, Number(row.zoom) || 13, 0, log);
    for (const rec of recs) {
      const id = rec.place_id;
      if (!id) continue;
      if (!byId.has(id)) {
        byId.set(id, { rec, icp: new Set(), types: new Set() });
      }
      const e = byId.get(id);
      e.icp.add(row.icp_type);
      (rec.types || []).forEach(t => e.types.add(t));
    }
    process.stderr.write(`. ${row.cell_id} (${row.query}) total-unique=${byId.size}\n`);
  }

  // classify + write
  const kept = [], excluded = [];
  const reasonCount = {};
  const zipsSeen = new Set();
  for (const { rec, icp, types } of byId.values()) {
    const zip = parseZip(rec.full_address);
    if (zip) zipsSeen.add(zip);
    let reason = null;
    if (rec.is_permanently_closed || rec.is_temporarily_closed) reason = 'closed';
    else if (!inFootprint(zip)) reason = 'out_of_footprint';
    // website / chains / category / size gates moved to qualify_rules (qualify-leads.js)

    const base = {
      place_id: rec.place_id, business_id: rec.business_id, name: rec.name,
      icp_type: [...icp].join('|'), google_types: [...types].join('|'),
      full_address: rec.full_address, city: rec.city, zip,
      neighborhood: labels[zip] || '', latitude: rec.latitude, longitude: rec.longitude,
      website: rec.website, phone_number: rec.phone_number, rating: rec.rating,
      review_count: rec.review_count, is_claimed: rec.is_claimed, verified: rec.verified,
      hours: JSON.stringify(rec.working_hours || {}), place_link: rec.place_link
    };
    if (reason) { excluded.push({ ...base, reason }); reasonCount[reason] = (reasonCount[reason] || 0) + 1; }
    else kept.push(base);
  }

  const cleanCols = ['place_id', 'business_id', 'name', 'icp_type', 'google_types', 'full_address', 'city', 'zip', 'neighborhood', 'latitude', 'longitude', 'website', 'phone_number', 'rating', 'review_count', 'is_claimed', 'verified', 'hours', 'place_link'];
  const exclCols = [...cleanCols.slice(0, 8), 'reason'];

  fs.writeFileSync(path.join(OUTDIR, 'leads_clean.csv'),
    [csvRow(cleanCols), ...kept.map(r => csvRow(cleanCols.map(c => r[c])))].join('\n'));
  fs.writeFileSync(path.join(OUTDIR, 'excluded.csv'),
    [csvRow(exclCols), ...excluded.map(r => csvRow(exclCols.map(c => r[c])))].join('\n'));
  fs.writeFileSync(path.join(OUTDIR, 'leads_raw.json'),
    JSON.stringify([...byId.values()].map(e => ({ ...e.rec, _icp: [...e.icp], _types: [...e.types] })), null, 2));

  const seenCovers = (p) => POSTAL_MATCH === 'prefix' ? [...zipsSeen].some(z => z.startsWith(p)) : zipsSeen.has(p);
  const missingCodes = FOOTPRINT_MODE === 'postal' ? [...footprint].filter(p => !seenCovers(p)).sort() : [];
  const splits = log.events.filter(e => e.split).length;
  const report = {
    api_calls: log.calls, quadrant_splits: splits,
    unique_businesses: byId.size, kept: kept.length, excluded: excluded.length,
    excluded_by_reason: reasonCount,
    footprint_codes_with_no_results: missingCodes,
    per_cell: log.events
  };
  fs.writeFileSync(path.join(OUTDIR, 'run_log.json'), JSON.stringify(report, null, 2));

  console.log('\n==== RUN SUMMARY ====');
  console.log('API calls:        ', log.calls, '(' + splits + ' quadrant splits)');
  console.log('Unique businesses:', byId.size);
  console.log('KEPT (clean):     ', kept.length);
  console.log('Excluded:         ', excluded.length, JSON.stringify(reasonCount));
  console.log('Footprint codes with NO results (coverage gaps):', missingCodes.length ? missingCodes.join(', ') : (FOOTPRINT_MODE === 'areas' ? 'n/a (areas mode)' : 'none'));
  console.log('Output ->', OUTDIR);
})();
