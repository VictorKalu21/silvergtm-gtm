#!/usr/bin/env node
/*
 * google-maps-scrape :: footprint gate (areas + postal modes)
 * -----------------------------------------------------------
 * Fixes the `areas`-mode bleed: searchmaps.php expands its radius to fill ~100
 * results and service-area pins ignore tile bounds, so a scrape pulls in
 * businesses from non-targeted / excluded / even cross-border metros. qualify
 * gates on type/reviews, NOT geography, so nothing else catches it.
 *
 * This runs AFTER qualify-leads.js and BEFORE build-netnew.js (cross-run dedupe).
 * It drops any lead that is:
 *   - farther than --hub-radius-deg (default 1.0deg ~= 111km) from EVERY tile
 *     center in the run sheet (the target hubs), OR
 *   - in a country whose name doesn't match geo.region_default (belt+braces:
 *     a country=xx scrape can still return neighbouring-country pins), OR
 *   - (if geo.region_from_city is set) whose state/region token isn't in the
 *     footprint region set (--regions, optional).
 *
 * Usage:
 *   node footprint-gate.js --in <qualified.csv> --runsheet <runsheet.csv> \
 *        --config <config.json> --out <dir> [--hub-radius-deg 1.0] [--regions "TX,NY"]
 *
 * Outputs (into --out): leads_clean_qualified_infootprint.csv (kept),
 *   excluded_geo.csv (dropped, with drop_reason), footprint_gate_report.json
 */
const fs = require('fs');
const path = require('path');

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i > -1 ? process.argv[i + 1] : def; }
const IN = arg('in'), RUNSHEET = arg('runsheet'), CONFIG = arg('config'), OUTDIR = arg('out', '.');
const HUB_RADIUS_DEG = parseFloat(arg('hub-radius-deg', '1.0'));
const REGIONS_ARG = arg('regions', '');
const KEEP_DOMESTIC = process.argv.includes('--keep-domestic'); // drop only foreign-country pins; keep ALL in-country (skips hub gate)
if (!IN || !RUNSHEET || !CONFIG) { console.error('ERROR: --in, --runsheet and --config are required'); process.exit(1); }

const HUB_RADIUS_KM = HUB_RADIUS_DEG * 111.0; // 1deg latitude ~= 111km

function readCsv(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  const head = splitCsv(lines.shift());
  return { head, rows: lines.map(l => { const c = splitCsv(l); const o = {}; head.forEach((h, i) => o[h] = (c[i] ?? '').trim()); return o; }) };
}
// minimal CSV splitter that respects double-quoted cells (leads_clean has quoted addresses)
function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else { if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; }
  }
  out.push(cur); return out;
}
function csvCell(v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function csvRow(a) { return a.map(csvCell).join(','); }

function haversineKm(la1, ln1, la2, ln2) {
  const R = 6371, toR = d => d * Math.PI / 180;
  const dLa = toR(la2 - la1), dLn = toR(ln2 - ln1);
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(toR(la1)) * Math.cos(toR(la2)) * Math.sin(dLn / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8').replace(/^﻿/, ''));
const geo = cfg.geo || {};
const regionDefault = (geo.region_default || '').toLowerCase().trim();
// Hub-radius gate is skipped under --keep-domestic (client wants all in-country volume)
// or geo.sparse_geo:true (large sparse countries: legit leads sit far from the few named hubs).
const HUB_GATE_ON = !KEEP_DOMESTIC && geo.sparse_geo !== true;
// Foreign-country blocklist (INVERTED wrong_country logic). Many geos' scraper.tech
// addresses END IN THE CITY with no country token at all — "last token != target"
// falsely dropped ~66% of legit leads there. Instead: drop ONLY when the last token
// IS a recognized foreign country name. City tokens aren't in the set -> kept.
const COUNTRY_ALIASES = {
  'united states': ['united states', 'united states of america', 'usa', 'us'],
  'united kingdom': ['united kingdom', 'uk', 'england', 'scotland', 'wales'],
  'united arab emirates': ['united arab emirates', 'uae'],
  'south korea': ['south korea', 'korea'],
  'eswatini': ['eswatini', 'swaziland'],
  'czech republic': ['czech republic', 'czechia'],
  'gambia': ['gambia', 'the gambia'],
  'ivory coast': ['ivory coast', "cote d'ivoire", "côte d'ivoire"],
  'congo': ['congo', 'democratic republic of the congo', 'dr congo', 'drc', 'republic of the congo'],
  'cape verde': ['cape verde', 'cabo verde'],
  'turkey': ['turkey', 'türkiye'],
};
const COUNTRIES = new Set(['afghanistan','albania','algeria','angola','argentina','australia','austria','bahrain','bangladesh','belgium','benin','botswana','brazil','bulgaria','burkina faso','burundi','cameroon','canada','cape verde','cabo verde','central african republic','chad','china','colombia','comoros','congo','democratic republic of the congo','dr congo','drc','republic of the congo','croatia','cyprus','czech republic','czechia','denmark','djibouti','egypt','equatorial guinea','eritrea','estonia','eswatini','swaziland','ethiopia','finland','france','gabon','gambia','the gambia','georgia','germany','ghana','greece','guinea','guinea-bissau','hungary','iceland','india','indonesia','iran','iraq','ireland','israel','italy','ivory coast',"cote d'ivoire","côte d'ivoire",'japan','jordan','kenya','kuwait','latvia','lebanon','lesotho','liberia','libya','lithuania','luxembourg','madagascar','malawi','malaysia','maldives','mali','malta','mauritania','mauritius','mexico','morocco','mozambique','namibia','nepal','netherlands','new zealand','niger','nigeria','north macedonia','norway','oman','pakistan','philippines','poland','portugal','qatar','romania','russia','rwanda','saudi arabia','senegal','serbia','seychelles','sierra leone','singapore','slovakia','slovenia','somalia','south africa','south korea','korea','south sudan','spain','sri lanka','sudan','sweden','switzerland','syria','tanzania','thailand','togo','tunisia','turkey','türkiye','uganda','ukraine','united arab emirates','uae','united kingdom','uk','england','scotland','wales','united states','united states of america','usa','us','uruguay','venezuela','vietnam','yemen','zambia','zimbabwe']);
if (regionDefault) {
  const aliasGroup = Object.values(COUNTRY_ALIASES).find(g => g.includes(regionDefault)) || [regionDefault];
  for (const a of aliasGroup) COUNTRIES.delete(a); // never drop the target's own name
}
const regionRe = geo.region_from_city ? new RegExp(geo.region_from_city) : null;
const regionSet = new Set(REGIONS_ARG.split(',').map(s => s.trim().toUpperCase()).filter(Boolean));

// hubs = unique tile centers from the run sheet
const rs = readCsv(RUNSHEET);
const hubs = [];
const seenHub = new Set();
for (const r of rs.rows) {
  const la = parseFloat(r.lat), ln = parseFloat(r.lng);
  if (!isFinite(la) || !isFinite(ln)) continue;
  const key = la.toFixed(3) + ',' + ln.toFixed(3);
  if (!seenHub.has(key)) { seenHub.add(key); hubs.push([la, ln]); }
}
if (!hubs.length) { console.error('ERROR: no valid tile centers found in run sheet'); process.exit(1); }

// last comma-separated token of an address is usually the country
function addrCountry(addr) {
  if (!addr) return '';
  const parts = addr.split(',').map(s => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1].toLowerCase() : '';
}

const { head, rows } = readCsv(IN);
const kept = [], dropped = [];
const reasonCount = {};
const foreignCount = {};
for (const row of rows) {
  const la = parseFloat(row.latitude), ln = parseFloat(row.longitude);
  let reason = null;

  // 1) nearest-hub distance (primary geo gate). Missing coords => cannot gate => keep.
  if (HUB_GATE_ON && isFinite(la) && isFinite(ln)) {
    let best = Infinity;
    for (const [hla, hln] of hubs) { const d = haversineKm(la, ln, hla, hln); if (d < best) best = d; }
    if (best > HUB_RADIUS_KM) reason = 'far_from_hubs';
  }

  // 2) foreign country (belt + braces), INVERTED: drop ONLY when the last address
  // token IS a recognized foreign country. Robust to city-ending addresses.
  if (!reason) {
    const ac = addrCountry(row.full_address);
    if (ac && COUNTRIES.has(ac)) { reason = 'wrong_country'; foreignCount[ac] = (foreignCount[ac] || 0) + 1; }
  }

  // 3) wrong region/state (only if a region regex + an allow set were supplied)
  if (!reason && regionRe && regionSet.size) {
    const m = (row.city || '').match(regionRe) || (row.full_address || '').match(regionRe);
    const st = m ? (m[1] || m[0]).toUpperCase() : '';
    if (st && !regionSet.has(st)) reason = 'wrong_region';
  }

  if (reason) { dropped.push({ ...row, drop_reason: reason }); reasonCount[reason] = (reasonCount[reason] || 0) + 1; }
  else kept.push(row);
}

fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(path.join(OUTDIR, 'leads_clean_qualified_infootprint.csv'),
  [csvRow(head), ...kept.map(r => csvRow(head.map(h => r[h])))].join('\n'));
fs.writeFileSync(path.join(OUTDIR, 'excluded_geo.csv'),
  [csvRow([...head, 'drop_reason']), ...dropped.map(r => csvRow([...head, 'drop_reason'].map(h => r[h])))].join('\n'));

const report = {
  input: kept.length + dropped.length, hubs: hubs.length, hub_radius_deg: HUB_RADIUS_DEG,
  hub_gate: HUB_GATE_ON, keep_domestic: KEEP_DOMESTIC,
  kept: kept.length, dropped: dropped.length, dropped_by_reason: reasonCount,
  foreign_countries: foreignCount,
};
fs.writeFileSync(path.join(OUTDIR, 'footprint_gate_report.json'), JSON.stringify(report, null, 2));

console.log('==== FOOTPRINT GATE ====');
console.log('Input leads:      ', report.input);
console.log('Hubs (tile ctrs): ', hubs.length, '| radius', HUB_RADIUS_DEG + 'deg (~' + Math.round(HUB_RADIUS_KM) + 'km)');
console.log('KEPT in-footprint:', kept.length);
console.log('Dropped:          ', dropped.length, JSON.stringify(reasonCount));
console.log('Output ->', OUTDIR);
