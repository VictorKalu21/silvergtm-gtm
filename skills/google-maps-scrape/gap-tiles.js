#!/usr/bin/env node
/*
 * gap-tiles.js :: runsheet rows from ZIP centroids (postal mode).
 *
 * Two jobs, both reading references/us-zip-centroids.csv (US Census 2024 ZCTA gazetteer, zip,lat,lng):
 *
 *   1. BUILD a postal-mode runsheet from the config's allowlist — one row per query × ZIP centroid:
 *        node gap-tiles.js --config <client>-config.json --queries "Plumber:field_service,Electrician:field_service" \
 *                          [--zoom 14] [--min-sep-km 0] [--out <client>-runsheet.csv]
 *   2. HEAL the gaps SKILL.md STEP 5 loops over — one row per runsheet query × each ZIP in
 *      run_log.json `footprint_codes_with_no_results`:
 *        node gap-tiles.js --run-log <out>/run_log.json --runsheet <client>-runsheet.csv [--zoom 14] [--out <out>/gap-runsheet.csv]
 *
 * Output columns are the engine's: cell_id,icp_type,query,lat,lng,zoom,priority. Feed the file to
 * run-scrape.js exactly like a hand-written runsheet. A ZIP with no centroid (PO-box-only ZIPs are not
 * ZCTAs) is listed on stderr and in the JSON summary, never silently dropped.
 *
 * --min-sep-km N skips a ZIP whose centroid lies within N km of a ZIP already emitted for the same
 * query (dense urban ZIPs sit 1–2 km apart; a zoom-14 viewport is ~3 km wide, so 2 is a sane value).
 * Default 0 = every ZIP gets its own tile.
 *
 * Only US ZIP (postal_match "exact") allowlists are supported: the centroid file is US ZCTAs. A
 * prefix-mode (UK/intl) config exits 2 with a message.
 */
const fs = require('fs');
const path = require('path');

function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }

function parseCsv(txt) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
}
const csvCell = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };

function loadCentroids(file) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  const H = rows.shift().map(s => s.trim().toLowerCase());
  const iz = H.indexOf('zip'), ila = H.indexOf('lat'), ilo = H.indexOf('lng');
  if (iz < 0 || ila < 0 || ilo < 0) throw new Error('centroid file needs zip,lat,lng columns: ' + file);
  const m = new Map();
  for (const r of rows) { const z = String(r[iz] || '').trim().padStart(5, '0'); const la = +r[ila], lo = +r[ilo]; if (z && isFinite(la) && isFinite(lo)) m.set(z, { lat: la, lng: lo }); }
  return m;
}

// "Plumber:field_service,Electrician:field_service" | "Plumber,Electrician" (icp_type defaults to a slug of the query)
function parseQueries(spec) {
  return String(spec || '').split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const i = s.indexOf(':'); const query = (i < 0 ? s : s.slice(0, i)).trim(), icp = i < 0 ? '' : s.slice(i + 1).trim();   // first colon only: "septic pumping:kw:septic" keeps the kw: tag
    return { query, icp_type: icp || query.toLowerCase().replace(/[^a-z0-9]+/g, '_') };
  });
}

function queriesFromRunsheet(file) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  const H = rows.shift().map(s => s.trim());
  const iq = H.indexOf('query'), ii = H.indexOf('icp_type');
  const seen = new Map();
  for (const r of rows) { const q = (r[iq] || '').trim(); if (!q) continue; const k = q + '|' + (r[ii] || ''); if (!seen.has(k)) seen.set(k, { query: q, icp_type: (r[ii] || '').trim() }); }
  return [...seen.values()];
}

function kmBetween(a, b) {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// zips: string[]; queries: [{query, icp_type}]; returns { rows, missing } — rows in runsheet column order
function buildRows(zips, queries, centroids, { zoom = 14, prefix = 'z', priority = 'P1', minSepKm = 0 } = {}) {
  const rows = [], missing = [];
  const uniq = [...new Set(zips.map(z => String(z).trim().padStart(5, '0')).filter(Boolean))];
  const kept = [];               // centroids already emitted (shared across queries: the tile grid is the same for every query)
  for (const z of uniq) {
    const c = centroids.get(z);
    if (!c) { missing.push(z); continue; }
    if (minSepKm > 0 && kept.some(k => kmBetween(k, c) < minSepKm)) continue;
    kept.push({ ...c, zip: z });
  }
  let n = 0;
  for (const q of queries) for (const k of kept) {
    n++;
    rows.push({ cell_id: `${prefix}${k.zip}-${n}`, icp_type: q.icp_type, query: q.query, lat: k.lat.toFixed(5), lng: k.lng.toFixed(5), zoom, priority });
  }
  return { rows, missing, tiles: kept.length };
}

function writeRunsheet(rows, file) {
  const H = ['cell_id', 'icp_type', 'query', 'lat', 'lng', 'zoom', 'priority'];
  fs.writeFileSync(file, [H.join(',')].concat(rows.map(r => H.map(h => csvCell(r[h])).join(','))).join('\n') + '\n');
}

module.exports = { parseQueries, queriesFromRunsheet, buildRows, loadCentroids, kmBetween };
if (require.main !== module) return;

const ZIPS = arg('zips', path.join(__dirname, 'references', 'us-zip-centroids.csv'));
const CONFIG = arg('config'), RUNLOG = arg('run-log'), RUNSHEET = arg('runsheet'), QUERIES = arg('queries');
const ZOOM = parseInt(arg('zoom', '14'), 10), MIN_SEP = parseFloat(arg('min-sep-km', '0'));
if (!fs.existsSync(ZIPS)) { console.error('ERROR: centroid file not found: ' + ZIPS); process.exit(1); }
const centroids = loadCentroids(ZIPS);

let zips, queries, prefix, OUT;
if (RUNLOG) {
  // HEAL mode
  if (!RUNSHEET) { console.error('ERROR: --run-log needs --runsheet (the queries to re-run on each gap ZIP)'); process.exit(1); }
  const log = JSON.parse(fs.readFileSync(RUNLOG, 'utf8').replace(/^﻿/, ''));
  const gaps = log.footprint_codes_with_no_results;
  if (!Array.isArray(gaps)) { console.error('ERROR: run_log.json has no footprint_codes_with_no_results array (areas mode? use coverage_report.json)'); process.exit(2); }
  zips = gaps; queries = queriesFromRunsheet(RUNSHEET); prefix = 'gap';
  OUT = arg('out', path.join(path.dirname(RUNLOG), 'gap-runsheet.csv'));
} else if (CONFIG) {
  // BUILD mode
  const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8').replace(/^﻿/, ''));
  const fp = (cfg.geo && cfg.geo.footprint) || {};
  if (fp.mode !== 'postal') { console.error('ERROR: config geo.footprint.mode is not "postal" — areas mode tiles are placed by hand (SKILL STEP 3)'); process.exit(2); }
  if ((fp.postal_match || 'exact') !== 'exact') { console.error('ERROR: postal_match "' + fp.postal_match + '" — centroid file is US ZCTA only; prefix-mode (UK/intl) tiles are placed by hand'); process.exit(2); }
  if (!QUERIES && !RUNSHEET) { console.error('ERROR: --queries "Q:icp,Q2:icp" or --runsheet <existing> needed to know what to search'); process.exit(1); }
  zips = fp.postal_allow || []; queries = QUERIES ? parseQueries(QUERIES) : queriesFromRunsheet(RUNSHEET); prefix = 'z';
  OUT = arg('out', path.join(path.dirname(CONFIG), path.basename(CONFIG).replace(/-config\.json$/i, '') + '-runsheet.csv'));
} else {
  console.error('Usage:\n  node gap-tiles.js --config <client>-config.json --queries "Plumber:icp,..." [--zoom 14] [--min-sep-km 0] [--out runsheet.csv]\n  node gap-tiles.js --run-log <out>/run_log.json --runsheet <client>-runsheet.csv [--zoom 14] [--out gap-runsheet.csv]');
  process.exit(1);
}

const { rows, missing, tiles } = buildRows(zips, queries, centroids, { zoom: ZOOM, prefix, minSepKm: MIN_SEP });
if (fs.existsSync(OUT) && !RUNLOG && !process.argv.includes('--force')) { console.error('ERROR: ' + OUT + ' exists — pass --force to overwrite a runsheet'); process.exit(1); }
writeRunsheet(rows, OUT);
const summary = { mode: RUNLOG ? 'heal' : 'build', zips_in: [...new Set(zips)].length, tiles, queries: queries.length, rows: rows.length, zoom: ZOOM, min_sep_km: MIN_SEP, no_centroid: missing, out: OUT };
if (missing.length) console.error(`WARN: ${missing.length} ZIP(s) have no ZCTA centroid (PO-box-only or retired codes): ${missing.join(' ')} — place those by hand if they matter`);
console.log(JSON.stringify(summary));
