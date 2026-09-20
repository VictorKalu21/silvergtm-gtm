#!/usr/bin/env node
/*
 * gen-runsheet-au.js :: build the Atlas Growth **Australia** runsheet (+ round-robin shards) programmatically.
 * Generated, never hand-typed — SKILL STEP 3 ("generate it to avoid typos").
 * Mirror of clients/atlas-growth/gen-runsheet-uk.js with an Australian anchor set + Australian guards.
 *
 * One row per QUERY x TILE at zoom 13. The config runs with scrape_tuning.paginate:true, so each
 * tile is paged to exhaustion via `offset` (max_pages 6 x limit 150) BEFORE any quadrant split —
 * splits are therefore rare and the densify list below exists to seat a viewport over the parts of
 * a conurbation the core tile cannot hold, not to pre-build a fine grid.
 *
 * AUSTRALIAN LATITUDES ARE ALL NEGATIVE AND LONGITUDES ALL POSITIVE. There is no exception anywhere
 * on the continent: Cape York (-10.7) to Hobart (-42.9), Steep Point (113.2) to Byron Bay (153.6).
 * A sign error silently scrapes the wrong hemisphere and returns plausible-looking garbage, so the
 * guards below assert both signs on every tile AND that each tile sits inside its own state's box.
 *
 * Usage: node gen-runsheet-au.js [--out <dir>] [--shards 8]
 */
const fs = require('fs');
const path = require('path');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const OUT = arg('out', __dirname);
const NSHARDS = parseInt(arg('shards', '8'), 10);

// The ten queries from the AU handoff, IN DRAFT ORDER — the Maps probe (3 calls: Sydney underpinning,
// Melbourne restumping, Brisbane foundation repair) reorders them and may swap one out (GATE 1).
// P1 = the job itself under every Australian name for it: underpinning is the national word,
// restumping / reblocking are the VICTORIAN words for the same job on timber-stump houses (recommended
// ICP, not adjacent — operator decision at GATE 1), foundation repair / house levelling / slab lifting /
// resin injection are how the national franchises (Mainmark, Uretek, Buildfix) and their licensees label it.
// P2 = house raising (QLD/NSW): the same firms, but raising is a lift-and-build job, so it is tagged
// adjacent and judged by the site-text adjudication like the UK's damp-only segment.
const QUERIES = [
  { q: 'underpinning',                 icp: 'foundation', pri: 'P1' },
  { q: 'restumping',                   icp: 'foundation', pri: 'P1' },
  { q: 'reblocking',                   icp: 'foundation', pri: 'P1' },
  { q: 'foundation repair',            icp: 'foundation', pri: 'P1' },
  { q: 'house levelling',              icp: 'foundation', pri: 'P1' },
  { q: 'house relevelling',            icp: 'foundation', pri: 'P1' },
  { q: 'slab lifting',                 icp: 'foundation', pri: 'P1' },
  { q: 'resin injection underpinning', icp: 'foundation', pri: 'P1' },
  { q: 'subsidence repair',            icp: 'foundation', pri: 'P1' },
  { q: 'house raising',                icp: 'adjacent',   pri: 'P2' },
];

// ---------------------------------------------------------------------------
// ANCHORS — [state, slug, lat, lng]. state = NSW | VIC | QLD | WA | SA | TAS | ACT | NT.
// Every town above ~30k people plus the regional centres, so that no populated area sits more than
// ~40 km from a tile on the coasts and ~100 km inland. Coordinates are town-centre decimal degrees.
// ---------------------------------------------------------------------------
const ANCHORS = [
  // ===== NEW SOUTH WALES (Sydney core; 12 more tiles in DENSIFY) =====
  ['NSW', 'sydney-cbd',               -33.8688, 151.2093],
  ['NSW', 'newcastle',                -32.9283, 151.7817],
  ['NSW', 'maitland',                 -32.7335, 151.5570],
  ['NSW', 'cessnock',                 -32.8340, 151.3560],
  ['NSW', 'nelson-bay',               -32.7150, 152.1440],
  ['NSW', 'singleton',                -32.5670, 151.1690],
  ['NSW', 'muswellbrook',             -32.2650, 150.8900],
  ['NSW', 'gosford-central-coast',    -33.4269, 151.3417],
  ['NSW', 'wollongong',               -34.4278, 150.8931],
  ['NSW', 'shellharbour-kiama',       -34.5780, 150.8680],
  ['NSW', 'nowra',                    -34.8830, 150.6000],
  ['NSW', 'ulladulla',                -35.3590, 150.4730],
  ['NSW', 'batemans-bay',             -35.7080, 150.1740],
  ['NSW', 'bega',                     -36.6740, 149.8410],
  ['NSW', 'bowral',                   -34.4790, 150.4180],
  ['NSW', 'goulburn',                 -34.7540, 149.7180],
  ['NSW', 'queanbeyan',               -35.3530, 149.2320],
  ['NSW', 'katoomba-blue-mountains',  -33.7140, 150.3120],
  ['NSW', 'lithgow',                  -33.4830, 150.1570],
  ['NSW', 'bathurst',                 -33.4190, 149.5780],
  ['NSW', 'orange',                   -33.2840, 149.1000],
  ['NSW', 'mudgee',                   -32.5940, 149.5880],
  ['NSW', 'dubbo',                    -32.2569, 148.6011],
  ['NSW', 'parkes',                   -33.1370, 148.1760],
  ['NSW', 'wagga-wagga',              -35.1082, 147.3598],
  ['NSW', 'albury',                   -36.0737, 146.9135],
  ['NSW', 'griffith',                 -34.2900, 146.0400],
  ['NSW', 'broken-hill',              -31.9530, 141.4530],
  ['NSW', 'tamworth',                 -31.0900, 150.9290],
  ['NSW', 'armidale',                 -30.5150, 151.6650],
  ['NSW', 'inverell',                 -29.7740, 151.1120],
  ['NSW', 'moree',                    -29.4650, 149.8410],
  ['NSW', 'taree',                    -31.9110, 152.4610],
  ['NSW', 'forster-tuncurry',         -32.1810, 152.5140],
  ['NSW', 'port-macquarie',           -31.4333, 152.9000],
  ['NSW', 'coffs-harbour',            -30.2963, 153.1157],
  ['NSW', 'grafton',                  -29.6900, 152.9330],
  ['NSW', 'lismore',                  -28.8135, 153.2773],
  ['NSW', 'ballina',                  -28.8640, 153.5650],
  ['NSW', 'tweed-heads',              -28.1770, 153.5430],

  // ===== VICTORIA (Melbourne core; 10 more tiles in DENSIFY) =====
  ['VIC', 'melbourne-cbd',            -37.8136, 144.9631],
  ['VIC', 'geelong',                  -38.1499, 144.3617],
  ['VIC', 'ocean-grove-torquay',      -38.2610, 144.5200],
  ['VIC', 'colac',                    -38.3400, 143.5850],
  ['VIC', 'warrnambool',              -38.3818, 142.4880],
  ['VIC', 'portland-vic',             -38.3460, 141.6040],
  ['VIC', 'hamilton-vic',             -37.7440, 142.0240],
  ['VIC', 'ararat',                   -37.2840, 142.9310],
  ['VIC', 'horsham',                  -36.7110, 142.1990],
  ['VIC', 'ballarat',                 -37.5622, 143.8503],
  ['VIC', 'bendigo',                  -36.7570, 144.2794],
  ['VIC', 'castlemaine',              -37.0640, 144.2170],
  ['VIC', 'kyneton',                  -37.2450, 144.4510],
  ['VIC', 'sunbury',                  -37.5790, 144.7260],
  ['VIC', 'melton',                   -37.6830, 144.5830],
  ['VIC', 'echuca',                   -36.1290, 144.7520],
  ['VIC', 'swan-hill',                -35.3380, 143.5540],
  ['VIC', 'mildura',                  -34.2080, 142.1246],
  ['VIC', 'shepparton',               -36.3833, 145.4000],
  ['VIC', 'benalla',                  -36.5510, 145.9840],
  ['VIC', 'wangaratta',               -36.3580, 146.3125],
  ['VIC', 'wodonga',                  -36.1214, 146.8881],
  ['VIC', 'pakenham',                 -38.0710, 145.4850],
  ['VIC', 'warragul-drouin',          -38.1600, 145.9310],
  ['VIC', 'traralgon',                -38.1950, 146.5410],
  ['VIC', 'sale',                     -38.1100, 147.0680],
  ['VIC', 'bairnsdale',               -37.8250, 147.6110],
  ['VIC', 'leongatha',                -38.4760, 145.9460],
  ['VIC', 'wonthaggi',                -38.6050, 145.5920],
  ['VIC', 'mornington',               -38.2170, 145.0390],

  // ===== QUEENSLAND (Brisbane core; 6 more Brisbane + 3 Gold Coast + 2 Sunshine Coast in DENSIFY) =====
  ['QLD', 'brisbane-cbd',             -27.4698, 153.0251],
  ['QLD', 'ipswich',                  -27.6144, 152.7608],
  ['QLD', 'logan-central',            -27.6390, 153.1080],
  ['QLD', 'beaudesert',               -27.9880, 152.9960],
  ['QLD', 'caboolture',               -27.0840, 152.9510],
  ['QLD', 'redcliffe',                -27.2300, 153.1000],
  ['QLD', 'cleveland-redlands',       -27.5270, 153.2650],
  ['QLD', 'gold-coast-southport',     -27.9670, 153.4000],
  ['QLD', 'sunshine-coast-maroochydore', -26.6530, 153.0930],
  ['QLD', 'gympie',                   -26.1900, 152.6650],
  ['QLD', 'toowoomba',                -27.5598, 151.9507],
  ['QLD', 'warwick',                  -28.2150, 152.0340],
  ['QLD', 'dalby',                    -27.1830, 151.2630],
  ['QLD', 'kingaroy',                 -26.5410, 151.8380],
  ['QLD', 'roma',                     -26.5720, 148.7870],
  ['QLD', 'maryborough-qld',          -25.5410, 152.7010],
  ['QLD', 'hervey-bay',               -25.2880, 152.8410],
  ['QLD', 'bundaberg',                -24.8661, 152.3489],
  ['QLD', 'gladstone',                -23.8430, 151.2560],
  ['QLD', 'rockhampton',              -23.3791, 150.5100],
  ['QLD', 'yeppoon',                  -23.1330, 150.7440],
  ['QLD', 'emerald',                  -23.5270, 148.1580],
  ['QLD', 'mackay',                   -21.1411, 149.1861],
  ['QLD', 'airlie-beach-proserpine',  -20.4010, 148.5810],
  ['QLD', 'ayr-burdekin',             -19.5740, 147.4060],
  ['QLD', 'townsville',               -19.2590, 146.8169],
  ['QLD', 'innisfail',                -17.5230, 146.0300],
  ['QLD', 'cairns',                   -16.9186, 145.7781],
  ['QLD', 'mareeba',                  -17.0000, 145.4230],
  ['QLD', 'mount-isa',                -20.7256, 139.4927],

  // ===== WESTERN AUSTRALIA (Perth core; 6 more tiles in DENSIFY) =====
  ['WA', 'perth-cbd',                 -31.9505, 115.8605],
  ['WA', 'fremantle',                 -32.0569, 115.7439],
  ['WA', 'joondalup',                 -31.7440, 115.7660],
  ['WA', 'rockingham',                -32.2770, 115.7290],
  ['WA', 'mandurah',                  -32.5269, 115.7217],
  ['WA', 'bunbury',                   -33.3271, 115.6414],
  ['WA', 'busselton',                 -33.6520, 115.3450],
  ['WA', 'albany',                    -35.0269, 117.8837],
  ['WA', 'esperance',                 -33.8610, 121.8910],
  ['WA', 'kalgoorlie',                -30.7489, 121.4658],
  ['WA', 'northam',                   -31.6530, 116.6650],
  ['WA', 'geraldton',                 -28.7774, 114.6144],
  ['WA', 'karratha',                  -20.7364, 116.8464],
  ['WA', 'port-hedland',              -20.3100, 118.6000],
  ['WA', 'broome',                    -17.9614, 122.2359],

  // ===== SOUTH AUSTRALIA (Adelaide core; 5 more tiles in DENSIFY) =====
  ['SA', 'adelaide-cbd',              -34.9285, 138.6007],
  ['SA', 'gawler',                    -34.5980, 138.7450],
  ['SA', 'mount-barker',              -35.0670, 138.8560],
  ['SA', 'victor-harbor',             -35.5520, 138.6210],
  ['SA', 'murray-bridge',             -35.1190, 139.2740],
  ['SA', 'renmark-berri',             -34.1740, 140.7470],
  ['SA', 'mount-gambier',             -37.8284, 140.7804],
  ['SA', 'kadina-yorke',              -33.9640, 137.7140],
  ['SA', 'port-pirie',                -33.1770, 138.0170],
  ['SA', 'port-augusta',              -32.4920, 137.7650],
  ['SA', 'whyalla',                   -33.0330, 137.5640],
  ['SA', 'port-lincoln',              -34.7260, 135.8580],

  // ===== TASMANIA =====
  ['TAS', 'hobart',                   -42.8821, 147.3272],
  ['TAS', 'kingston-tas',             -42.9760, 147.3060],
  ['TAS', 'launceston',               -41.4332, 147.1441],
  ['TAS', 'devonport',                -41.1800, 146.3500],
  ['TAS', 'ulverstone',               -41.1570, 146.1700],
  ['TAS', 'burnie',                   -41.0520, 145.9040],

  // ===== AUSTRALIAN CAPITAL TERRITORY (Queanbeyan is the NSW side of the same market, above) =====
  ['ACT', 'canberra-civic',           -35.2809, 149.1300],
  ['ACT', 'tuggeranong',              -35.4140, 149.0660],

  // ===== NORTHERN TERRITORY =====
  ['NT', 'darwin',                    -12.4634, 130.8456],
  ['NT', 'palmerston-nt',             -12.4860, 130.9830],
  ['NT', 'alice-springs',             -23.6980, 133.8807],
];

// ---------------------------------------------------------------------------
// DENSIFY — extra tiles where the core viewport cannot hold the conurbation.
// Sydney 12 (13 total), Melbourne 10 (11), Brisbane 6 (7), Gold Coast 3 (4), Sunshine Coast 2 (3),
// Perth 6 (7), Adelaide 5 (6). Explicit suburb tiles rather than engine quadrant splits, because a
// split lands wherever the maths puts it and the suburbs are where the reactive-clay market is.
// ---------------------------------------------------------------------------
const DENSIFY = [
  // --- Sydney ---
  ['NSW', 'syd-parramatta',           -33.8150, 151.0011],
  ['NSW', 'syd-penrith',              -33.7510, 150.6940],
  ['NSW', 'syd-blacktown',            -33.7710, 150.9060],
  ['NSW', 'syd-castle-hill',          -33.7310, 151.0060],
  ['NSW', 'syd-hornsby',              -33.7020, 151.0990],
  ['NSW', 'syd-chatswood',            -33.7970, 151.1830],
  ['NSW', 'syd-dee-why-northern-beaches', -33.7530, 151.2870],
  ['NSW', 'syd-randwick-eastern-suburbs', -33.9140, 151.2410],
  ['NSW', 'syd-bankstown',            -33.9180, 151.0350],
  ['NSW', 'syd-liverpool',            -33.9200, 150.9240],
  ['NSW', 'syd-campbelltown',         -34.0650, 150.8140],
  ['NSW', 'syd-sutherland',           -34.0310, 151.0570],
  // --- Melbourne ---
  ['VIC', 'mel-dandenong',            -37.9870, 145.2150],
  ['VIC', 'mel-frankston',            -38.1440, 145.1230],
  ['VIC', 'mel-cheltenham-moorabbin', -37.9670, 145.0540],
  ['VIC', 'mel-box-hill',             -37.8190, 145.1220],
  ['VIC', 'mel-ringwood',             -37.8140, 145.2290],
  ['VIC', 'mel-greensborough',        -37.7050, 145.1030],
  ['VIC', 'mel-preston-northcote',    -37.7420, 145.0000],
  ['VIC', 'mel-craigieburn',          -37.6000, 144.9410],
  ['VIC', 'mel-footscray-sunshine',   -37.7900, 144.8600],
  ['VIC', 'mel-werribee',             -37.9000, 144.6600],
  // --- Brisbane ---
  ['QLD', 'bne-chermside',            -27.3850, 153.0310],
  ['QLD', 'bne-strathpine',           -27.3040, 152.9910],
  ['QLD', 'bne-indooroopilly',        -27.4990, 152.9740],
  ['QLD', 'bne-carindale',            -27.5050, 153.1020],
  ['QLD', 'bne-springwood',           -27.6130, 153.1330],
  ['QLD', 'bne-browns-plains',        -27.6600, 153.0500],
  // --- Gold Coast ---
  ['QLD', 'gc-helensvale-coomera',    -27.9170, 153.3340],
  ['QLD', 'gc-robina',                -28.0700, 153.3900],
  ['QLD', 'gc-coolangatta',           -28.1680, 153.5350],
  // --- Sunshine Coast ---
  ['QLD', 'sc-caloundra',             -26.8030, 153.1380],
  ['QLD', 'sc-noosa',                 -26.3980, 153.0900],
  // --- Perth ---
  ['WA', 'per-wanneroo',              -31.7480, 115.8030],
  ['WA', 'per-morley',                -31.8880, 115.9070],
  ['WA', 'per-midland',               -31.8890, 116.0100],
  ['WA', 'per-cannington',            -32.0170, 115.9340],
  ['WA', 'per-armadale',              -32.1500, 116.0140],
  ['WA', 'per-cockburn-success',      -32.1430, 115.8500],
  // --- Adelaide ---
  ['SA', 'adl-elizabeth',             -34.7130, 138.6710],
  ['SA', 'adl-modbury',               -34.8320, 138.6830],
  ['SA', 'adl-glenelg-west-beach',    -34.9800, 138.5150],
  ['SA', 'adl-marion-oaklands',       -35.0130, 138.5590],
  ['SA', 'adl-noarlunga',             -35.1390, 138.4980],
];

const TILES = [...ANCHORS.map(a => [...a, 'anchor']), ...DENSIFY.map(d => [...d, 'densify'])];

// --- sanity guards: a bad coordinate is the one error this file exists to prevent ---
// Per-state boxes (generous, decimal degrees). A tile outside its own state's box is a typo or a
// wrong state code — both would put the row under the wrong region token downstream.
const STATE_BOX = {
  NSW: { lat: [-37.6, -28.1], lng: [140.9, 153.7] },
  VIC: { lat: [-39.2, -33.9], lng: [140.9, 150.0] },
  QLD: { lat: [-29.2, -10.0], lng: [137.9, 153.6] },
  WA:  { lat: [-35.2, -13.6], lng: [112.9, 129.1] },
  SA:  { lat: [-38.1, -25.9], lng: [129.0, 141.1] },
  TAS: { lat: [-43.7, -39.5], lng: [143.8, 148.5] },
  ACT: { lat: [-35.95, -35.1], lng: [148.7, 149.4] },
  NT:  { lat: [-26.1, -10.9], lng: [129.0, 138.1] },
};
const seenSlug = new Set();
for (const [st, slug, lat, lng] of TILES) {
  if (seenSlug.has(slug)) { console.error(`ERROR: duplicate tile slug ${slug}`); process.exit(1); }
  seenSlug.add(slug);
  if (!(lat < 0)) { console.error(`ERROR: ${slug} lat ${lat} is not NEGATIVE — every Australian latitude is south of the equator`); process.exit(1); }
  if (!(lng > 0)) { console.error(`ERROR: ${slug} lng ${lng} is not POSITIVE — every Australian longitude is east of Greenwich`); process.exit(1); }
  // Continental band: Cape York -10.7 -> South East Cape -43.6; Steep Point 113.2 -> Cape Byron 153.6.
  if (!(lat > -44.0 && lat < -10.0)) { console.error(`ERROR: ${slug} lat ${lat} outside the Australian band -44.0..-10.0`); process.exit(1); }
  if (!(lng > 112.5 && lng < 154.0)) { console.error(`ERROR: ${slug} lng ${lng} outside the Australian band 112.5..154.0`); process.exit(1); }
  const box = STATE_BOX[st];
  if (!box) { console.error(`ERROR: ${slug} bad state code ${st} (want NSW|VIC|QLD|WA|SA|TAS|ACT|NT)`); process.exit(1); }
  if (!(lat >= box.lat[0] && lat <= box.lat[1] && lng >= box.lng[0] && lng <= box.lng[1])) {
    console.error(`ERROR: ${slug} (${lat}, ${lng}) is outside the ${st} box lat ${box.lat} lng ${box.lng} — typo or wrong state code`); process.exit(1);
  }
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
fs.writeFileSync(path.join(OUT, 'atlas-growth-au-runsheet.csv'), [HEAD, ...rows.map(line)].join('\n') + '\n');

// Round-robin shards so each worker spans ALL states and both priorities (an evenly-slow shard
// beats one shard that owns every Sydney tile). The merge afterwards dedupes the cross-shard overlap
// on place_id and unions google_types with '|'.
const shardDir = path.join(OUT, 'shards-au');
fs.mkdirSync(shardDir, { recursive: true });
const shards = Array.from({ length: NSHARDS }, () => []);
rows.forEach((r, i) => shards[i % NSHARDS].push(r));
shards.forEach((s, i) => fs.writeFileSync(path.join(shardDir, `shard-${i}.csv`), [HEAD, ...s.map(line)].join('\n') + '\n'));

const byState = {}; for (const [n] of ANCHORS) byState[n] = (byState[n] || 0) + 1;
const densByState = {}; for (const [n] of DENSIFY) densByState[n] = (densByState[n] || 0) + 1;
console.log(`anchors: ${ANCHORS.length} | densify: ${DENSIFY.length} | TILES: ${TILES.length}`);
console.log(`anchors by state:  ${Object.entries(byState).map(([k, v]) => k + '=' + v).join(' ')}`);
console.log(`densify by state:  ${Object.entries(densByState).map(([k, v]) => k + '=' + v).join(' ')}`);
console.log(`sydney tiles: ${TILES.filter(t => t[1] === 'sydney-cbd' || t[1].startsWith('syd-')).length} | melbourne tiles: ${TILES.filter(t => t[1] === 'melbourne-cbd' || t[1].startsWith('mel-')).length}`);
console.log(`queries: ${QUERIES.length} (P1=${QUERIES.filter(q => q.pri === 'P1').length}, P2=${QUERIES.filter(q => q.pri === 'P2').length})`);
console.log(`ROWS (query x tile): ${rows.length}  ->  atlas-growth-au-runsheet.csv`);
console.log(`shards: ${NSHARDS} x ~${Math.ceil(rows.length / NSHARDS)} rows -> shards-au/shard-0..${NSHARDS - 1}.csv`);
