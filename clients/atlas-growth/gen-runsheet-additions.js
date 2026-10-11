#!/usr/bin/env node
/*
 * gen-runsheet-additions.js :: Atlas Growth US residential home addition contractors, nationwide, warm states first.
 * Generated, never hand-typed (SKILL STEP 3). One row per QUERY x ANCHOR at zoom 13; scrape.js paginates each
 * viewport (scrape_tuning.paginate) and splits once where it saturates.
 *
 * ANCHORS are READ from gen-runsheet-pools.js (same folder) — the 586 GeoNames-derived centres built 2026-10-11
 * for the pools run (population-ordered greedy with minimum spacing; 362 in the 18 warm states). Parsing the
 * sibling file instead of copying 586 lines keeps one anchor table per client.
 *
 * Usage: node gen-runsheet-additions.js [--out <dir>] [--shards 8] [--states warm|all|TX,FL,...] [--queries core|full]
 *   --states warm  (default) = FL TX AZ CA GA NV NC SC TN AL LA MS OK AR NM HI UT VA
 *   --queries core (default) = Remodeler + General contractor + Custom home builder + 4 keyword rows (7 queries)
 *             full           = + Construction company, Home builder, Sunroom contractor, Contractor + 3 keyword rows (14 queries)
 * Writes atlas-growth-additions-runsheet.csv + shards-additions/shard-N.csv (round-robin so every shard spans all states).
 */
const fs = require('fs');
const path = require('path');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const OUT = arg('out', __dirname);
const NSHARDS = parseInt(arg('shards', '8'), 10);
const STATES_ARG = arg('states', 'warm');
const QSET = arg('queries', 'core');

const WARM = ['FL','TX','AZ','CA','GA','NV','NC','SC','TN','AL','LA','MS','OK','AR','NM','HI','UT','VA'];
// STEP 2: no native 'home addition' category exists (references/google-maps-categories.md). Remodeler and General
// contractor carry the trade; the builder types catch design-build firms; keyword rows (kw:addition, P3) are
// fuzzy-matched on names/descriptions and routed to classify if the allow-list drops them (SKILL STEP 5b).
const CORE = [
  { q: 'Remodeler',                 icp: 'addition',    pri: 'P1' },
  { q: 'General contractor',        icp: 'addition',    pri: 'P1' },
  { q: 'Custom home builder',       icp: 'addition',    pri: 'P2' },
  { q: 'home addition contractor',  icp: 'kw:addition', pri: 'P3' },
  { q: 'room addition contractor',  icp: 'kw:addition', pri: 'P3' },
  { q: 'second story addition',     icp: 'kw:addition', pri: 'P3' },
  { q: 'design build remodeling',   icp: 'kw:addition', pri: 'P3' },
];
const FULL_EXTRA = [
  { q: 'Construction company',      icp: 'addition',    pri: 'P2' },
  { q: 'Home builder',              icp: 'addition',    pri: 'P2' },
  { q: 'Sunroom contractor',        icp: 'addition',    pri: 'P2' },
  { q: 'Contractor',                icp: 'addition',    pri: 'P2' },
  { q: 'home additions',            icp: 'kw:addition', pri: 'P3' },
  { q: 'garage conversion',         icp: 'kw:addition', pri: 'P3' },
  { q: 'ADU builder',               icp: 'kw:addition', pri: 'P3' },
];
const queries = QSET === 'full' ? [...CORE, ...FULL_EXTRA] : CORE;

// anchors from the sibling generator: lines like ['AL', 'huntsville', 34.7304, -86.5859, 215006, 'P1'],
const sib = fs.readFileSync(path.join(__dirname, 'gen-runsheet-pools.js'), 'utf8');
const ANCHORS = [];
for (const m of sib.matchAll(/\['([A-Z]{2})',\s*'([a-z0-9-]+)',\s*(-?\d+\.\d+),\s*(-?\d+\.\d+),\s*(\d+),\s*'(P[12])'\]/g)) {
  ANCHORS.push([m[1], m[2], parseFloat(m[3]), parseFloat(m[4]), parseInt(m[5], 10), m[6]]);
}
if (ANCHORS.length < 500) throw new Error('anchor parse failed: ' + ANCHORS.length + ' rows from gen-runsheet-pools.js');

const states = STATES_ARG === 'all' ? null : new Set(STATES_ARG === 'warm' ? WARM : STATES_ARG.split(',').map(s => s.trim().toUpperCase()));
const anchors = ANCHORS.filter(a => !states || states.has(a[0]));
if (!anchors.length) throw new Error('no anchors selected for --states ' + STATES_ARG);
const header = 'cell_id,icp_type,query,lat,lng,zoom,priority';
const rows = [];
for (const [st, slug, lat, lng] of anchors) {
  queries.forEach((q, i) => rows.push([`${st.toLowerCase()}-${slug}-q${i}`, q.icp, q.q, lat, lng, 13, q.pri].join(',')));
}
const ids = new Set(rows.map(r => r.split(',')[0]));
if (ids.size !== rows.length) throw new Error('duplicate cell_id');
for (const [, , lat, lng] of ANCHORS) if (lng >= 0 || lat < 18 || lat > 72) throw new Error(`bad coord ${lat},${lng}`);
for (const q of queries) if (q.q.includes(',')) throw new Error('comma in query breaks readRunsheet (IMPROVEMENTS 2026-09-12)');
fs.writeFileSync(path.join(OUT, 'atlas-growth-additions-runsheet.csv'), [header, ...rows].join('\n') + '\n');
const shardDir = path.join(OUT, 'shards-additions');
fs.mkdirSync(shardDir, { recursive: true });
for (let s = 0; s < NSHARDS; s++) {
  const part = rows.filter((_, i) => i % NSHARDS === s);
  fs.writeFileSync(path.join(shardDir, `shard-${s}.csv`), [header, ...part].join('\n') + '\n');
}
const st = new Set(anchors.map(a => a[0]));
console.log(`anchors ${anchors.length} (of ${ANCHORS.length}) | states ${st.size} | queries ${queries.length} (${QSET}) | rows ${rows.length} | shards ${NSHARDS} -> ${OUT}`);
