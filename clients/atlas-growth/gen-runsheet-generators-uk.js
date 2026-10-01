#!/usr/bin/env node
/*
 * gen-runsheet-generators-uk.js :: build the Atlas Growth **UK generator installers** runsheet
 * (+ round-robin shards + a 3-row calibration sheet) programmatically. Generated, never hand-typed
 * (SKILL STEP 3). Spec: clients/atlas-growth/ICP-generators-uk.md, option B (operator, 2026-09-30).
 *
 * TILES: the SAME 177-tile UK grid the 2026-09-16 foundation run shipped (150 anchors + 27 densify,
 * imported from gen-runsheet-uk.js so the coordinates cannot drift). That grid was measured against
 * real places (PIPELINE.md STEP 4: no populated area > ~25 km from a tile; Orkney the worst gap at
 * 60.7 km) and its coverage was healed to 0 unhealed tiles, so it is reused as-is rather than
 * re-derived. Zoom 13, areas mode, pagination on — the config pages each viewport to exhaustion.
 *
 * QUERIES: generator-INTENT only. The UK has no OEM dealer locator to act as a spine (Generac UK
 * returned 0 dealers on three postcodes; see the ICP doc), so Maps IS the universe here, and the
 * universe is small: UK homes rarely buy a standby generator, and the word "generator" on UK Maps
 * is dominated by HIRE companies (Aggreko, Speedy, HSS …) which the config denies. Queries are
 * therefore install-worded. No bare "electrician" — that would return every electrician in the
 * country (tens of thousands) with no backup-power signal; an electrician who installs generators
 * text-matches "generator installation" anyway. No battery-storage query — that is option A
 * (MCS register spine), a separate list and a separate offer.
 *
 * Usage: node gen-runsheet-generators-uk.js [--out <dir>] [--shards 8]
 */
const fs = require('fs');
const path = require('path');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const OUT = arg('out', __dirname);
const NSHARDS = parseInt(arg('shards', '8'), 10);

const { TILES } = require('./gen-runsheet-uk.js');

// P1 = direct install intent (the ICP). P2 = the two UK labels a generator INSTALLER also carries:
// "generator engineer" is how UK service/installation firms self-describe (an engineer installs,
// commissions and services standby sets), and "generator shop" text-matches Google's own category
// string "Electric generator shop", which is where Maps files sales-and-install dealers.
// WORDING: "backup generator" not "backup generator installer" — UK sites say "backup generator" /
// "back-up power"; the -installer suffix only narrows a text match (Maps stage is volume-safe).
const QUERIES = [
  { q: 'generator installation',       icp: 'generator', pri: 'P1' },
  { q: 'standby generator installer',  icp: 'generator', pri: 'P1' },
  { q: 'backup generator',             icp: 'generator', pri: 'P1' },
  { q: 'generator engineer',           icp: 'generator', pri: 'P2' },
  { q: 'generator shop',               icp: 'generator', pri: 'P2' },
];

// 3-row calibration sheet (ICP doc: "run a 3-call calibration probe before promising any number").
// One P1/P2 query on each of three dense, different-nation tiles. Read its leads_clean.csv +
// run_log.json BEFORE launching the 885-row sheet: it tells us the hire/sales/install mix the
// qualify rules must handle, and whether the universe is hundreds or thousands.
const CALIBRATION = [
  ['london-centre', 'generator installation'],
  ['manchester',    'standby generator installer'],
  ['glasgow',       'generator engineer'],
];

const HEAD = 'cell_id,icp_type,query,lat,lng,zoom,priority';
const line = r => [r.cell_id, r.icp_type, r.query, r.lat, r.lng, r.zoom, r.priority].join(',');
const rows = [];
for (const [nat, slug, lat, lng] of TILES)
  for (let qi = 0; qi < QUERIES.length; qi++) {
    const { q, icp, pri } = QUERIES[qi];
    rows.push({ cell_id: `${nat.toLowerCase()}-${slug}-g${qi}`, icp_type: icp, query: q, lat, lng, zoom: 13, priority: pri });
  }
const bySlug = new Map(TILES.map(t => [t[1], t]));
const cal = CALIBRATION.map(([slug, q]) => {
  const t = bySlug.get(slug); if (!t) { console.error(`ERROR: calibration tile ${slug} not in the UK grid`); process.exit(1); }
  const qi = QUERIES.findIndex(x => x.q === q); if (qi < 0) { console.error(`ERROR: calibration query "${q}" not in QUERIES`); process.exit(1); }
  return { cell_id: `cal-${t[0].toLowerCase()}-${slug}-g${qi}`, icp_type: QUERIES[qi].icp, query: q, lat: t[2], lng: t[3], zoom: 13, priority: QUERIES[qi].pri };
});

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'atlas-growth-generators-uk-runsheet.csv'), [HEAD, ...rows.map(line)].join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'atlas-growth-generators-uk-calibration-runsheet.csv'), [HEAD, ...cal.map(line)].join('\n') + '\n');

// Round-robin shards: each worker spans all four nations and both priorities (an evenly-slow shard
// beats one that owns every London tile). merge-shards.js dedupes the cross-shard overlap on place_id.
const shardDir = path.join(OUT, 'shards-generators-uk');
fs.mkdirSync(shardDir, { recursive: true });
const shards = Array.from({ length: NSHARDS }, () => []);
rows.forEach((r, i) => shards[i % NSHARDS].push(r));
shards.forEach((s, i) => fs.writeFileSync(path.join(shardDir, `shard-${i}.csv`), [HEAD, ...s.map(line)].join('\n') + '\n'));

const byNation = {}; for (const [n] of TILES) byNation[n] = (byNation[n] || 0) + 1;
console.log(`tiles: ${TILES.length} (${Object.entries(byNation).map(([k, v]) => k + '=' + v).join(' ')}) | london tiles: ${TILES.filter(t => t[0] === 'ENG' && t[1].startsWith('london')).length}`);
console.log(`queries: ${QUERIES.length} (P1=${QUERIES.filter(q => q.pri === 'P1').length}, P2=${QUERIES.filter(q => q.pri === 'P2').length})`);
console.log(`ROWS (query x tile): ${rows.length}  ->  atlas-growth-generators-uk-runsheet.csv`);
console.log(`calibration: ${cal.length} rows -> atlas-growth-generators-uk-calibration-runsheet.csv`);
console.log(`shards: ${NSHARDS} x ~${Math.ceil(rows.length / NSHARDS)} rows -> shards-generators-uk/shard-0..${NSHARDS - 1}.csv`);
