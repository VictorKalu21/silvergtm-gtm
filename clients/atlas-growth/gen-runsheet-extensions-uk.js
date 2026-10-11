#!/usr/bin/env node
/*
 * gen-runsheet-extensions-uk.js :: build the Atlas Growth **UK home-extension contractors** runsheet
 * (+ round-robin shards + a 3-row calibration sheet) programmatically. Generated, never hand-typed
 * (SKILL STEP 3). Spec: clients/atlas-growth/ICP-extensions-uk.md (opened 2026-10-11, GATE 1 pending).
 *
 * TILES: the SAME 177-tile UK grid the 2026-09-16 foundation run shipped (150 anchors + 27 densify,
 * imported from gen-runsheet-uk.js so the coordinates cannot drift). Measured against real places
 * (no populated area > ~25 km from a tile; coverage healed to 0 unhealed tiles), so it is reused
 * as-is. Zoom 13, areas mode, pagination on — the config pages each viewport to exhaustion.
 *
 * QUERIES: Google has NO category for this trade (checked against references/google-maps-categories.md
 * 2026-10-11: no 'extension', 'loft', 'conversion' category exists), so every query here is a
 * KEYWORD that Maps text-matches against name + description + category. That is the only way to
 * reach the specialist; the generic 'builders' query is the volume lever (P3, --broad) and is OFF by
 * default because it returns every builder in every town (max_pages x 177 tiles ≈ 1,000+ calls per
 * query) and the extra rows carry no extension signal until the site-text gate reads them.
 *
 * WORDING: plural, bare nouns ('house extensions', not 'house extension contractor') — 'contractor'
 * is a US-idiom suffix UK firms rarely carry and Maps text-matches the query, so a suffix can only
 * NARROW the result (the 2026-09-16 UK run's 'underpinning' lesson). 'single storey' / 'double
 * storey' are the British spellings UK sites use; 'design and build' is the trading phrase of the
 * firms that do the whole job and is the richest ICP signal of the set.
 *
 * Usage: node gen-runsheet-extensions-uk.js [--out <dir>] [--shards 8] [--broad]
 */
const fs = require('fs');
const path = require('path');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const has = n => process.argv.includes('--' + n);
const OUT = arg('out', __dirname);
const NSHARDS = parseInt(arg('shards', '8'), 10);
const BROAD = has('broad');

const { TILES } = require('./gen-runsheet-uk.js');

// P1 = direct extension / conversion intent (the ICP). P2 = the adjacent self-labels an extension
// builder also carries. P3 = the bare builder queries, --broad only.
const QUERIES = [
  { q: 'house extensions',        icp: 'extension', pri: 'P1' },
  { q: 'home extensions',         icp: 'extension', pri: 'P1' },
  { q: 'extension builders',      icp: 'extension', pri: 'P1' },
  { q: 'loft conversions',        icp: 'extension', pri: 'P1' },
  { q: 'garage conversions',      icp: 'extension', pri: 'P1' },
  { q: 'single storey extension', icp: 'extension', pri: 'P1' },
  { q: 'double storey extension', icp: 'extension', pri: 'P1' },
  { q: 'design and build',        icp: 'extension', pri: 'P1' },
  { q: 'home renovations',        icp: 'adjacent',  pri: 'P2' },
  { q: 'basement conversions',    icp: 'adjacent',  pri: 'P2' },
];
const BROAD_QUERIES = [
  { q: 'builders',                icp: 'broad',     pri: 'P3' },
  { q: 'building contractors',    icp: 'broad',     pri: 'P3' },
];
const ACTIVE = BROAD ? [...QUERIES, ...BROAD_QUERIES] : QUERIES;

// 3-row calibration sheet: one P1 query on each of three dense, different-nation tiles. Read its
// leads_clean.csv + run_log.json BEFORE launching the full sheet: it tells us page depth per tile
// (the cost driver), the type mix the qualify rules must handle (how many rows are architects,
// kitchen fitters, hair salons), and whether the specialist universe is hundreds or thousands.
const CALIBRATION = [
  ['london-centre', 'house extensions'],
  ['manchester',    'loft conversions'],
  ['glasgow',       'design and build'],
];

const HEAD = 'cell_id,icp_type,query,lat,lng,zoom,priority';
const line = r => [r.cell_id, r.icp_type, r.query, r.lat, r.lng, r.zoom, r.priority].join(',');
const rows = [];
for (const [nat, slug, lat, lng] of TILES)
  for (let qi = 0; qi < ACTIVE.length; qi++) {
    const { q, icp, pri } = ACTIVE[qi];
    rows.push({ cell_id: `${nat.toLowerCase()}-${slug}-x${qi}`, icp_type: icp, query: q, lat, lng, zoom: 13, priority: pri });
  }
const bySlug = new Map(TILES.map(t => [t[1], t]));
const cal = CALIBRATION.map(([slug, q]) => {
  const t = bySlug.get(slug); if (!t) { console.error(`ERROR: calibration tile ${slug} not in the UK grid`); process.exit(1); }
  const qi = QUERIES.findIndex(x => x.q === q); if (qi < 0) { console.error(`ERROR: calibration query "${q}" not in QUERIES`); process.exit(1); }
  return { cell_id: `cal-${t[0].toLowerCase()}-${slug}-x${qi}`, icp_type: QUERIES[qi].icp, query: q, lat: t[2], lng: t[3], zoom: 13, priority: QUERIES[qi].pri };
});

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'atlas-growth-extensions-uk-runsheet.csv'), [HEAD, ...rows.map(line)].join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'atlas-growth-extensions-uk-calibration-runsheet.csv'), [HEAD, ...cal.map(line)].join('\n') + '\n');

// Round-robin shards: each worker spans all four nations and every priority (an evenly-slow shard
// beats one that owns every London tile). merge-shards.js dedupes the cross-shard overlap on place_id.
const shardDir = path.join(OUT, 'shards-extensions-uk');
fs.mkdirSync(shardDir, { recursive: true });
const shards = Array.from({ length: NSHARDS }, () => []);
rows.forEach((r, i) => shards[i % NSHARDS].push(r));
shards.forEach((s, i) => fs.writeFileSync(path.join(shardDir, `shard-${i}.csv`), [HEAD, ...s.map(line)].join('\n') + '\n'));

const byNation = {}; for (const [n] of TILES) byNation[n] = (byNation[n] || 0) + 1;
console.log(`tiles: ${TILES.length} (${Object.entries(byNation).map(([k, v]) => k + '=' + v).join(' ')}) | london tiles: ${TILES.filter(t => t[0] === 'ENG' && t[1].startsWith('london')).length}`);
console.log(`queries: ${ACTIVE.length} (P1=${ACTIVE.filter(q => q.pri === 'P1').length}, P2=${ACTIVE.filter(q => q.pri === 'P2').length}, P3=${ACTIVE.filter(q => q.pri === 'P3').length}${BROAD ? ', --broad ON' : ', --broad off'})`);
console.log(`ROWS (query x tile): ${rows.length}  ->  atlas-growth-extensions-uk-runsheet.csv`);
console.log(`calibration: ${cal.length} rows -> atlas-growth-extensions-uk-calibration-runsheet.csv`);
console.log(`shards: ${NSHARDS} x ~${Math.ceil(rows.length / NSHARDS)} rows -> shards-extensions-uk/shard-0..${NSHARDS - 1}.csv`);
