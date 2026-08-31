#!/usr/bin/env node
/*
 * google-maps-scrape :: scraper.tech executor
 * One search call per (category x geo tile). Auto-densifies a tile when it
 * saturates (offset pagination is broken on this API, so we split the
 * viewport into quadrants at zoom+1 instead). Dedups on place_id, applies
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
 *     scrape_tuning?:{ saturation, max_depth, quad_offset, limit } }
 * NOTE: this stage only gates on closed + footprint. website / chains / category / size live in
 * qualify_rules (qualify-leads.js) so the clean list = the in-footprint, open universe.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

// ---------------- tunables ----------------
const API_HOST = 'api.scraper.tech';
const API_PATH = '/searchmaps.php';
let LIMIT = 150;            // max records requested per call
let SATURATION = 90;        // >= this in one tile => likely incomplete => quadrant-split
let MAX_DEPTH = 1;          // levels of auto quadrant split (1 => up to 4 sub-tiles)
let QUAD_OFFSET = 0.025;    // deg offset for sub-tile centers (~2.8km)
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

function apiCall(query, lat, lng, zoom) {
  const qs = new URLSearchParams({
    query, limit: LIMIT, country: COUNTRY, lang: LANG, lat, lng, offset: 0, zoom
  }).toString();
  const opts = { host: API_HOST, path: `${API_PATH}?${qs}`, headers: { 'scraper-key': KEY }, timeout: 30000 };
  return new Promise(resolve => {
    const req = https.get(opts, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({ status: 'parse_error', data: [] }); } });
    });
    req.on('error', e => resolve({ status: 'error', data: [], err: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 'timeout', data: [] }); });
  });
}

async function fetchTile(query, lat, lng, zoom, depth, log) {
  await sleep(CALL_DELAY_MS);
  const r = await apiCall(query, lat, lng, zoom);
  const recs = Array.isArray(r.data) ? r.data : [];
  log.calls++;
  const saturated = recs.length >= SATURATION && depth < MAX_DEPTH;
  log.events.push({ query, lat, lng, zoom, status: r.status, count: recs.length, split: saturated });
  let all = recs.slice();
  if (saturated) {
    const o = QUAD_OFFSET;
    for (const [dla, dln] of [[o, o], [o, -o], [-o, o], [-o, -o]]) {
      const sub = await fetchTile(query, +(+lat + dla).toFixed(5), +(+lng + dln).toFixed(5), zoom + 1, depth + 1, log);
      all = all.concat(sub);
    }
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
    const recs = await fetchTile(row.query, row.lat, row.lng, Number(row.zoom) || 13, 0, log);
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
