#!/usr/bin/env node
/* gate3-stats.js :: read the gate-3 (qualify -> geo -> dedupe -> collapse) result before anyone
 * spends a credit on it.  RUN-FOLDER ONE-OFF — the UK sibling of the US run's gate3-stats.js.
 *
 * Four questions, in the order they bite:
 *   1. WHAT DID THE RULES KILL?  drop_reason counts over excluded_officp.csv (and excluded_geo.csv
 *      if present), each with 10 sampled rows printed as
 *      name · PRIMARY type · all types · reviews · city.
 *      The primary type is shown SEPARATELY because that is the only token the `deny` rules judge
 *      (qualify-leads.js:74) — a sample that shows only the joined string hides the asymmetry that
 *      dryrun-results.md rows 6/7/21 exist to police, and hides a mis-rejoined separator entirely.
 *   2. WHERE ARE THEY?  There is NO nation column on a Maps lead and geo.region_from_city is null
 *      for the UK (no state token to parse out of `city`), so nation is derived from the UK
 *      POSTCODE AREA — the leading letters of the outward code — parsed out of full_address.
 *      BT => Northern Ireland; the Scottish and Welsh area sets below; everything else England.
 *      Cross-border areas (CH, SY, TD, LL, NP, CA) are assigned by majority and listed as
 *      approximate in the output — this is a coverage sanity check, not a billing boundary.
 *   3. WHICH ROWS ARE BRANDED?  brand_family counts from collapse-domains.js (a flag, never a
 *      drop — see the config's brand_families note).
 *   4. WHERE IS THE MULTI-BRANCH VOLUME?  top 15 root_domains by location_count.
 *
 * Usage:
 *   node gate3-stats.js [--run <dir>] [--final leads_annotated.csv] [--excluded excluded_officp.csv]
 *                       [--geo-excluded excluded_geo.csv] [--samples 10]
 */
const fs = require('fs'), path = require('path');

function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const RUN = path.resolve(arg('run', __dirname));
const FINAL = path.resolve(RUN, arg('final', 'leads_annotated.csv'));
const EXCL = path.resolve(RUN, arg('excluded', 'excluded_officp.csv'));
const GEO_EXCL = path.resolve(RUN, arg('geo-excluded', 'excluded_geo.csv'));
const SAMPLES = Number(arg('samples', 10));

function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
function load(f) {
  if (!fs.existsSync(f)) return [];
  const R = pc(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')).filter(r => r.length > 1);
  const H = R.shift();
  return R.map(r => Object.fromEntries(H.map((h, i) => [h, r[i] == null ? '' : r[i]])));
}

// ---- UK postcode area -> nation -------------------------------------------------------------
const SCT = new Set(['AB','DD','DG','EH','FK','G','HS','IV','KA','KW','KY','ML','PA','PH','TD','ZE']);
const WLS = new Set(['CF','LD','LL','NP','SA']);
const NIR = new Set(['BT']);
const OTHER = { IM: 'Isle of Man', GY: 'Guernsey', JE: 'Jersey' }; // Crown Dependencies: NOT the UK
const SPLIT = new Set(['CH','SY','TD','LL','NP','CA','DG','HR']); // cross-border areas, assigned by majority
// last postcode in the address is the real one (it sits at the end of a UK address)
const PC_RE = /\b([A-Z]{1,2})[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}\b/gi;
function areaOf(addr) {
  const s = String(addr || '').toUpperCase();
  let m, last = null;
  PC_RE.lastIndex = 0;
  while ((m = PC_RE.exec(s)) !== null) last = m;
  return last ? last[1].toUpperCase() : '';
}
function nationOf(addr) {
  const a = areaOf(addr);
  if (!a) return { nation: 'UNKNOWN (no postcode in address)', area: '' };
  if (OTHER[a]) return { nation: OTHER[a], area: a };
  if (NIR.has(a)) return { nation: 'NIR', area: a };
  if (SCT.has(a)) return { nation: 'SCT', area: a };
  if (WLS.has(a)) return { nation: 'WLS', area: a };
  return { nation: 'ENG', area: a };
}

const prim = r => String(r.google_types || '').split('|')[0].trim();
const pad = (s, n) => String(s == null ? '' : s).slice(0, n).padEnd(n);

const fin = load(FINAL), ex = load(EXCL), geoEx = load(GEO_EXCL);
console.log(`gate3-stats :: ${path.basename(RUN)}`);
console.log(`  final   ${path.basename(FINAL)}: ${fin.length} rows` + (fin.length ? '' : '  (MISSING — run collapse-domains.js first)'));
console.log(`  dropped ${path.basename(EXCL)}: ${ex.length} rows | ${path.basename(GEO_EXCL)}: ${geoEx.length} rows`);

// ---- 1. drop reasons + samples ---------------------------------------------------------------
function dropSection(title, rows) {
  if (!rows.length) return;
  const by = {};
  for (const r of rows) { const k = r.drop_reason || '(none)'; (by[k] = by[k] || []).push(r); }
  console.log(`\n==== ${title} — ${rows.length} rows ====`);
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) console.log(`   ${pad(k, 26)} ${String(v.length).padStart(6)}`);
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n   --- ${k} (${v.length}) — ${Math.min(SAMPLES, v.length)} sampled ---`);
    // evenly spaced sample, not the first N: the first N are one shard's first tiles
    const step = Math.max(1, Math.floor(v.length / SAMPLES));
    for (let i = 0, n = 0; i < v.length && n < SAMPLES; i += step, n++) {
      const r = v[i];
      console.log(`     ${pad(r.name, 38)} | ${pad(prim(r), 24)} | ${pad(r.google_types, 46)} | ${String(r.review_count || '').padStart(5)} | ${r.city || ''}`);
    }
  }
}
dropSection('QUALIFY drops (excluded_officp.csv)', ex);
dropSection('FOOTPRINT-GATE drops (excluded_geo.csv)', geoEx);

// ---- 2. nation / postcode-area buckets --------------------------------------------------------
if (fin.length) {
  const nat = {}, areas = {}, splitSeen = new Set();
  for (const r of fin) {
    const { nation, area } = nationOf(r.full_address);
    nat[nation] = (nat[nation] || 0) + 1;
    if (area) { areas[area] = (areas[area] || 0) + 1; if (SPLIT.has(area)) splitSeen.add(area); }
  }
  console.log('\n==== FINAL by nation (postcode area parsed from full_address) ====');
  for (const [k, v] of Object.entries(nat).sort((a, b) => b[1] - a[1]))
    console.log(`   ${pad(k, 34)} ${String(v).padStart(6)}  ${(100 * v / fin.length).toFixed(1)}%`);
  if (splitSeen.size) console.log(`   note: cross-border areas present (${[...splitSeen].sort().join(', ')}) — assigned by majority, so nation counts are +/- a few rows.`);
  const topAreas = Object.entries(areas).sort((a, b) => b[1] - a[1]).slice(0, 20);
  console.log('\n   top 20 postcode areas: ' + topAreas.map(([a, n]) => `${a}=${n}`).join(' '));

  // ---- 3. brand families ---------------------------------------------------------------------
  const brands = {};
  for (const r of fin) if (r.brand_family) brands[r.brand_family] = (brands[r.brand_family] || 0) + 1;
  console.log('\n==== brand_family (a FLAG, not a drop) ====');
  const bEntries = Object.entries(brands).sort((a, b) => b[1] - a[1]);
  if (!bEntries.length) console.log('   none flagged' + ('brand_family' in (fin[0] || {}) ? '' : '   (no brand_family column — is this leads_annotated.csv?)'));
  for (const [k, v] of bEntries) console.log(`   ${pad(k, 30)} ${String(v).padStart(5)}`);
  const branded = bEntries.reduce((a, [, v]) => a + v, 0);
  if (bEntries.length) console.log(`   branded rows: ${branded} / ${fin.length} (${(100 * branded / fin.length).toFixed(1)}%) — independents: ${fin.length - branded}`);

  // ---- 4. top root domains by location_count -------------------------------------------------
  const dom = new Map();
  for (const r of fin) {
    if (!r.root_domain || r.website_class !== 'site') continue;
    const cur = dom.get(r.root_domain) || { rows: 0, location_count: 0, brand: r.brand_family || '' };
    cur.rows++;
    cur.location_count = Math.max(cur.location_count, parseInt(r.location_count, 10) || 0);
    if (!cur.brand && r.brand_family) cur.brand = r.brand_family;
    dom.set(r.root_domain, cur);
  }
  const top = [...dom.entries()].sort((a, b) => b[1].location_count - a[1].location_count || b[1].rows - a[1].rows).slice(0, 15);
  console.log('\n==== top 15 root_domains by location_count (multi-branch = 1 paid lookup, N rows) ====');
  for (const [d, v] of top) console.log(`   ${String(v.location_count).padStart(4)}  ${pad(d, 40)} ${v.brand ? '[' + v.brand + ']' : ''}`);
  console.log(`   distinct root domains: ${dom.size} | rows on a multi-location domain: ${fin.filter(r => r.is_multi_location === 'yes').length}`);
}
console.log('');
