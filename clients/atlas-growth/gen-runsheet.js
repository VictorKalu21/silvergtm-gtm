#!/usr/bin/env node
/*
 * gen-runsheet.js :: build the Atlas Growth runsheet (+ round-robin shards) programmatically.
 * Generated, never hand-typed — SKILL STEP 3 ("generate it to avoid typos").
 *
 * One row per QUERY x TILE at zoom 13. scrape.js auto-quadrant-splits any tile that saturates
 * (>=90 records), so the densification list below is deliberately light: it exists to seat a
 * viewport over the suburbs of the biggest metros, not to pre-build a fine grid.
 *
 * WESTERN LONGITUDES ARE NEGATIVE. A positive value silently scrapes the wrong hemisphere and
 * returns plausible-looking garbage.
 *
 * Usage: node gen-runsheet.js [--out <dir>] [--shards 8]
 */
const fs = require('fs');
const path = require('path');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const OUT = arg('out', __dirname);
const NSHARDS = parseInt(arg('shards', '8'), 10);

// P1 = direct intent, P2 = adjacent self-labeling (same businesses, different category words).
const QUERIES = [
  { q: 'foundation repair',          icp: 'foundation', pri: 'P1' },
  { q: 'foundation contractor',      icp: 'foundation', pri: 'P1' },
  { q: 'foundation repair company',  icp: 'foundation', pri: 'P1' },
  { q: 'basement waterproofing',     icp: 'adjacent',   pri: 'P2' },
  { q: 'crawl space repair',         icp: 'adjacent',   pri: 'P2' },
  { q: 'crawl space encapsulation',  icp: 'adjacent',   pri: 'P2' },
  { q: 'concrete leveling',          icp: 'adjacent',   pri: 'P2' },
  { q: 'mudjacking',                 icp: 'adjacent',   pri: 'P2' },
  { q: 'house leveling',             icp: 'adjacent',   pri: 'P2' },
  { q: 'structural repair',          icp: 'adjacent',   pri: 'P2' },
];

// 108 metro anchors: 10 footprint states + 3 border metros that serve the footprint from outside it.
const ANCHORS = [
  // --- TEXAS (20) ---
  ['TX', 'houston',            29.7604,  -95.3698],
  ['TX', 'dallas',             32.7767,  -96.7970],
  ['TX', 'fort-worth',         32.7555,  -97.3308],
  ['TX', 'san-antonio',        29.4241,  -98.4936],
  ['TX', 'austin',             30.2672,  -97.7431],
  ['TX', 'el-paso',            31.7619, -106.4850],
  ['TX', 'corpus-christi',     27.8006,  -97.3964],
  ['TX', 'lubbock',            33.5779, -101.8552],
  ['TX', 'amarillo',           35.2220, -101.8313],
  ['TX', 'mcallen',            26.2034,  -98.2300],
  ['TX', 'waco',               31.5493,  -97.1467],
  ['TX', 'killeen-temple',     31.1171,  -97.7278],
  ['TX', 'beaumont',           30.0802,  -94.1266],
  ['TX', 'midland-odessa',     31.9973, -102.0779],
  ['TX', 'tyler',              32.3513,  -95.3011],
  ['TX', 'abilene',            32.4487,  -99.7331],
  ['TX', 'wichita-falls',      33.9137,  -98.4934],
  ['TX', 'laredo',             27.5306,  -99.4803],
  ['TX', 'brownsville',        25.9017,  -97.4975],
  ['TX', 'college-station',    30.6280,  -96.3344],
  // --- GEORGIA (12) ---
  ['GA', 'atlanta',            33.7490,  -84.3880],
  ['GA', 'augusta',            33.4735,  -82.0105],
  ['GA', 'columbus-ga',        32.4610,  -84.9877],
  ['GA', 'savannah',           32.0809,  -81.0912],
  ['GA', 'macon',              32.8407,  -83.6324],
  ['GA', 'athens-ga',          33.9519,  -83.3576],
  ['GA', 'albany-ga',          31.5785,  -84.1557],
  ['GA', 'warner-robins',      32.6130,  -83.6242],
  ['GA', 'valdosta',           30.8327,  -83.2785],
  ['GA', 'gainesville-ga',     34.2979,  -83.8241],
  ['GA', 'rome-ga',            34.2570,  -85.1647],
  ['GA', 'dalton',             34.7698,  -84.9702],
  // --- ALABAMA (11) ---
  ['AL', 'birmingham',         33.5186,  -86.8104],
  ['AL', 'montgomery',         32.3668,  -86.3000],
  ['AL', 'mobile',             30.6954,  -88.0399],
  ['AL', 'huntsville',         34.7304,  -86.5861],
  ['AL', 'tuscaloosa',         33.2098,  -87.5692],
  ['AL', 'auburn-opelika',     32.6099,  -85.4808],
  ['AL', 'dothan',             31.2232,  -85.3905],
  ['AL', 'decatur-al',         34.6059,  -86.9833],
  ['AL', 'florence-al',        34.7998,  -87.6773],
  ['AL', 'anniston',           33.6598,  -85.8316],
  ['AL', 'gadsden',            34.0143,  -86.0066],
  // --- MISSISSIPPI (10) ---
  ['MS', 'jackson-ms',         32.2988,  -90.1848],
  ['MS', 'gulfport-biloxi',    30.3674,  -89.0928],
  ['MS', 'hattiesburg',        31.3271,  -89.2903],
  ['MS', 'tupelo',             34.2576,  -88.7034],
  ['MS', 'meridian',           32.3643,  -88.7037],
  ['MS', 'southaven',          34.9890,  -90.0126],
  ['MS', 'starkville',         33.4504,  -88.8184],
  ['MS', 'columbus-ms',        33.4957,  -88.4273],
  ['MS', 'greenville-ms',      33.4101,  -91.0618],
  ['MS', 'vicksburg',          32.3526,  -90.8779],
  // --- COLORADO (10) ---
  ['CO', 'denver',             39.7392, -104.9903],
  ['CO', 'colorado-springs',   38.8339, -104.8214],
  ['CO', 'fort-collins',       40.5853, -105.0844],
  ['CO', 'boulder',            40.0150, -105.2705],
  ['CO', 'pueblo',             38.2544, -104.6091],
  ['CO', 'greeley',            40.4233, -104.7091],
  ['CO', 'grand-junction',     39.0639, -108.5506],
  ['CO', 'loveland',           40.3978, -105.0750],
  ['CO', 'longmont',           40.1672, -105.1019],
  ['CO', 'castle-rock',        39.3722, -104.8561],
  // --- MISSOURI (9) ---
  ['MO', 'st-louis',           38.6270,  -90.1994],
  ['MO', 'kansas-city-mo',     39.0997,  -94.5786],
  ['MO', 'springfield-mo',     37.2090,  -93.2923],
  ['MO', 'columbia-mo',        38.9517,  -92.3341],
  ['MO', 'joplin',             37.0842,  -94.5133],
  ['MO', 'jefferson-city',     38.5767,  -92.1735],
  ['MO', 'st-joseph',          39.7675,  -94.8467],
  ['MO', 'cape-girardeau',     37.3059,  -89.5181],
  ['MO', 'branson',            36.6437,  -93.2185],
  // --- LOUISIANA (9) ---
  ['LA', 'new-orleans',        29.9511,  -90.0715],
  ['LA', 'baton-rouge',        30.4515,  -91.1871],
  ['LA', 'shreveport',         32.5252,  -93.7502],
  ['LA', 'lafayette-la',       30.2241,  -92.0198],
  ['LA', 'lake-charles',       30.2266,  -93.2174],
  ['LA', 'monroe-la',          32.5093,  -92.1193],
  ['LA', 'alexandria-la',      31.3113,  -92.4451],
  ['LA', 'houma',              29.5958,  -90.7195],
  ['LA', 'slidell-covington',  30.2752,  -89.7812],
  // --- ARKANSAS (9) ---
  ['AR', 'little-rock',        34.7465,  -92.2896],
  ['AR', 'nw-arkansas',        36.0626,  -94.1574],
  ['AR', 'fort-smith',         35.3859,  -94.3985],
  ['AR', 'jonesboro',          35.8423,  -90.7043],
  ['AR', 'conway',             35.0887,  -92.4421],
  ['AR', 'hot-springs',        34.5037,  -93.0552],
  ['AR', 'pine-bluff',         34.2284,  -92.0032],
  ['AR', 'texarkana',          33.4418,  -94.0377],
  ['AR', 'russellville',       35.2784,  -93.1338],
  // --- OKLAHOMA (8) ---
  ['OK', 'oklahoma-city',      35.4676,  -97.5164],
  ['OK', 'tulsa',              36.1540,  -95.9928],
  ['OK', 'lawton',             34.6036,  -98.3959],
  ['OK', 'stillwater',         36.1156,  -97.0584],
  ['OK', 'enid',               36.3956,  -97.8784],
  ['OK', 'muskogee',           35.7479,  -95.3697],
  ['OK', 'ardmore',            34.1743,  -97.1436],
  ['OK', 'bartlesville',       36.7473,  -95.9808],
  // --- KANSAS (7) ---
  ['KS', 'wichita',            37.6872,  -97.3301],
  ['KS', 'overland-park',      38.9822,  -94.6708],
  ['KS', 'topeka',             39.0473,  -95.6752],
  ['KS', 'lawrence-ks',        38.9717,  -95.2353],
  ['KS', 'manhattan-ks',       39.1836,  -96.5717],
  ['KS', 'salina',             38.8403,  -97.6114],
  ['KS', 'hutchinson',         38.0608,  -97.9298],
  // --- BORDER METROS (3) — serve the footprint from outside it. Kept only if within 1.0 deg
  // of these tiles (RUN-PLAN 4.3 pass 2); all other TN/FL pins are dropped.
  ['TN', 'memphis',            35.1495,  -90.0490],
  ['TN', 'chattanooga',        35.0456,  -85.3097],
  ['FL', 'jacksonville',       30.3322,  -81.6557],
];

// Suburb tiles for the metros whose core viewport cannot hold the whole market.
const DENSIFY = [
  ['TX', 'houston-spring',       30.0800, -95.4200], ['TX', 'houston-katy',        29.7900, -95.8200],
  ['TX', 'houston-sugar-land',   29.6200, -95.6300], ['TX', 'houston-pasadena',    29.6900, -95.2100],
  ['TX', 'houston-humble',       29.9900, -95.2600],
  ['TX', 'dallas-plano',         33.0200, -96.7000], ['TX', 'dallas-mesquite',     32.8100, -96.6200],
  ['TX', 'dallas-irving',        32.8100, -96.9500],
  ['TX', 'fw-arlington',         32.7400, -97.1100], ['TX', 'fw-keller',           32.9300, -97.2500],
  ['TX', 'sa-stone-oak',         29.6200, -98.4900], ['TX', 'sa-west',             29.4500, -98.6800],
  ['TX', 'austin-round-rock',    30.5100, -97.6800], ['TX', 'austin-kyle',         30.0900, -97.8300],
  ['GA', 'atl-marietta',         33.9500, -84.5500], ['GA', 'atl-alpharetta',      34.0700, -84.2900],
  ['GA', 'atl-decatur',          33.7900, -84.2000], ['GA', 'atl-jonesboro',       33.5200, -84.3500],
  ['GA', 'atl-douglasville',     33.7500, -84.7500],
  ['CO', 'den-aurora',           39.7100,-104.8100], ['CO', 'den-lakewood',        39.7000,-105.0800],
  ['CO', 'den-littleton',        39.5600,-104.9900],
  ['MO', 'stl-st-charles',       38.7800, -90.5100], ['MO', 'stl-south-county',    38.5200, -90.3200],
  ['MO', 'kc-independence',      39.0900, -94.4200], ['MO', 'kc-north',            39.2400, -94.5800],
  ['OK', 'okc-norman',           35.2200, -97.4400], ['OK', 'okc-edmond',          35.6500, -97.4800],
  ['OK', 'tulsa-broken-arrow',   36.0500, -95.7900],
  ['LA', 'nola-metairie',        30.0000, -90.2500],
  ['AL', 'bham-hoover',          33.4000, -86.8000],
  ['TN', 'memphis-bartlett',     35.2000, -89.8700],
  ['FL', 'jax-orange-park',      30.1700, -81.7100],
];

const TILES = [...ANCHORS.map(a => [...a, 'anchor']), ...DENSIFY.map(d => [...d, 'densify'])];

// --- sanity guards: a bad coordinate is the one error this file exists to prevent ---
const seenSlug = new Set();
for (const [st, slug, lat, lng] of TILES) {
  if (seenSlug.has(slug)) { console.error(`ERROR: duplicate tile slug ${slug}`); process.exit(1); }
  seenSlug.add(slug);
  if (!(lat > 24 && lat < 41)) { console.error(`ERROR: ${slug} lat ${lat} outside the footprint band`); process.exit(1); }
  if (!(lng < -80 && lng > -110)) { console.error(`ERROR: ${slug} lng ${lng} outside the footprint band -110..-80 (must be NEGATIVE)`); process.exit(1); }
  if (!/^[A-Z]{2}$/.test(st)) { console.error(`ERROR: ${slug} bad state ${st}`); process.exit(1); }
}

const HEAD = 'cell_id,icp_type,query,lat,lng,zoom,priority';
const rows = [];
for (const [st, slug, lat, lng, kind] of TILES)
  for (let qi = 0; qi < QUERIES.length; qi++) {
    const { q, icp, pri } = QUERIES[qi];
    rows.push({ cell_id: `${st.toLowerCase()}-${slug}-q${qi}`, icp_type: icp, query: q, lat, lng, zoom: 13, priority: pri, _kind: kind });
  }
const line = r => [r.cell_id, r.icp_type, r.query, r.lat, r.lng, r.zoom, r.priority].join(',');

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'atlas-growth-runsheet.csv'), [HEAD, ...rows.map(line)].join('\n') + '\n');

// Round-robin shards so each worker spans ALL metros and both priorities (an evenly-slow shard
// beats one shard that owns every Texas tile). Merge afterwards dedupes the cross-shard overlap.
const shardDir = path.join(OUT, 'shards');
fs.mkdirSync(shardDir, { recursive: true });
const shards = Array.from({ length: NSHARDS }, () => []);
rows.forEach((r, i) => shards[i % NSHARDS].push(r));
shards.forEach((s, i) => fs.writeFileSync(path.join(shardDir, `shard-${i}.csv`), [HEAD, ...s.map(line)].join('\n') + '\n'));

const byState = {};
for (const [st] of ANCHORS) byState[st] = (byState[st] || 0) + 1;
console.log(`anchors: ${ANCHORS.length} | densify: ${DENSIFY.length} | TILES: ${TILES.length}`);
console.log(`anchors by state: ${Object.entries(byState).map(([k, v]) => k + '=' + v).join(' ')}`);
console.log(`queries: ${QUERIES.length} (P1=${QUERIES.filter(q => q.pri === 'P1').length}, P2=${QUERIES.filter(q => q.pri === 'P2').length})`);
console.log(`ROWS (query x tile): ${rows.length}  ->  atlas-growth-runsheet.csv`);
console.log(`shards: ${NSHARDS} x ~${Math.ceil(rows.length / NSHARDS)} rows -> shards/shard-0..${NSHARDS - 1}.csv`);
