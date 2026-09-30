#!/usr/bin/env node
/*
 * gen-runsheet-uk.js :: build the Atlas Growth **UK** runsheet (+ round-robin shards) programmatically.
 * Generated, never hand-typed — SKILL STEP 3 ("generate it to avoid typos").
 * Mirror of clients/atlas-growth/gen-runsheet.js (the US run) with a UK anchor set + UK guards.
 *
 * One row per QUERY x TILE at zoom 13. The config runs with scrape_tuning.paginate:true, so each
 * tile is paged to exhaustion via `offset` (max_pages 6 x limit 150) BEFORE any quadrant split —
 * splits are therefore rare and the densify list below exists to seat a viewport over the parts of
 * a conurbation the core tile cannot hold, not to pre-build a fine grid.
 *
 * UK LONGITUDES ARE MOSTLY NEGATIVE. East of Greenwich is POSITIVE and that is not a typo:
 * Norwich, Great Yarmouth, Lowestoft, Ipswich, Bury St Edmunds, Colchester, Chelmsford, Southend,
 * King's Lynn, Medway, Maidstone, Canterbury, Dover, Ashford, Hastings, Eastbourne, Tunbridge Wells,
 * Cambridge, Bromley and Romford all sit east of 0. Everything else in the UK is west of it.
 * A sign error silently scrapes the wrong place and returns plausible-looking garbage.
 *
 * Usage: node gen-runsheet-uk.js [--out <dir>] [--shards 8]
 */
const fs = require('fs');
const path = require('path');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const OUT = arg('out', __dirname);
const NSHARDS = parseInt(arg('shards', '8'), 10);

// P1 = direct structural-repair intent. P2 = the words this trade actually self-labels with in the UK
// (damp-proofing / structural waterproofing is ~60% of the universe per
// skills/icp-source-planner/library/google-maps--uk-foundation-repair.md), so P2 is where the volume is.
// `foundation repair` is kept although it barely exists as a UK label — one query is cheap insurance.
// WORDING NOTE: the operator's list said `underpinning contractor`; shortened to `underpinning`.
// "contractor" is a US-idiom suffix that UK firms rarely carry in their name or Google category, and
// Maps text-matches the query, so the suffix can only NARROW the result set. Maps stage is volume-safe.
const QUERIES = [
  { q: 'underpinning',            icp: 'foundation', pri: 'P1' },
  { q: 'subsidence repair',       icp: 'foundation', pri: 'P1' },
  { q: 'structural repair',       icp: 'foundation', pri: 'P1' },
  { q: 'foundation repair',       icp: 'foundation', pri: 'P1' },
  { q: 'damp proofing',           icp: 'adjacent',   pri: 'P2' },
  { q: 'basement waterproofing',  icp: 'adjacent',   pri: 'P2' },
  { q: 'structural waterproofing',icp: 'adjacent',   pri: 'P2' },
  { q: 'cellar tanking',          icp: 'adjacent',   pri: 'P2' },
  { q: 'mini piling',             icp: 'adjacent',   pri: 'P2' },
  { q: 'wall tie replacement',    icp: 'adjacent',   pri: 'P2' },
];

// ---------------------------------------------------------------------------
// ANCHORS — [nation, slug, lat, lng]. nation = ENG | SCT | WLS | NIR.
// Every UK town over ~60-70k plus the regional centres that keep any populated
// place within ~25km of a tile. Coordinates are town-centre decimal degrees.
// ---------------------------------------------------------------------------
const ANCHORS = [
  // ===== ENGLAND — London (core; 12 more tiles in DENSIFY) =====
  ['ENG', 'london-centre',        51.5074,  -0.1278],

  // ===== ENGLAND — West Midlands / Marches =====
  ['ENG', 'birmingham',           52.4862,  -1.8904],
  ['ENG', 'wolverhampton',        52.5862,  -2.1288],
  ['ENG', 'coventry',             52.4068,  -1.5197],
  ['ENG', 'stoke-on-trent',       53.0027,  -2.1794],
  ['ENG', 'telford',              52.6784,  -2.4453],
  ['ENG', 'shrewsbury',           52.7069,  -2.7527],
  ['ENG', 'hereford',             52.0567,  -2.7160],
  ['ENG', 'worcester',            52.1936,  -2.2216],

  // ===== ENGLAND — South West =====
  ['ENG', 'gloucester',           51.8642,  -2.2380],
  ['ENG', 'cheltenham',           51.8994,  -2.0783],
  ['ENG', 'bristol',              51.4545,  -2.5879],
  ['ENG', 'bath',                 51.3811,  -2.3590],
  ['ENG', 'weston-super-mare',    51.3460,  -2.9770],
  ['ENG', 'taunton',              51.0150,  -3.1000],
  ['ENG', 'yeovil',               50.9410,  -2.6320],
  ['ENG', 'exeter',               50.7184,  -3.5339],
  ['ENG', 'torquay',              50.4619,  -3.5253],
  ['ENG', 'plymouth',             50.3755,  -4.1427],
  ['ENG', 'barnstaple',           51.0800,  -4.0600],
  ['ENG', 'st-austell',           50.3400,  -4.7900],
  ['ENG', 'truro',                50.2632,  -5.0510],
  ['ENG', 'penzance',             50.1186,  -5.5370],
  ['ENG', 'weymouth',             50.6140,  -2.4570],
  ['ENG', 'bournemouth-poole',    50.7192,  -1.8808],
  ['ENG', 'salisbury',            51.0688,  -1.7945],
  ['ENG', 'swindon',              51.5685,  -1.7722],

  // ===== ENGLAND — Central South =====
  ['ENG', 'southampton',          50.9097,  -1.4044],
  ['ENG', 'portsmouth',           50.8198,  -1.0880],
  ['ENG', 'basingstoke',          51.2665,  -1.0870],
  ['ENG', 'reading',              51.4543,  -0.9781],
  ['ENG', 'slough',               51.5105,  -0.5950],
  ['ENG', 'oxford',               51.7520,  -1.2577],
  ['ENG', 'aylesbury',            51.8156,  -0.8084],
  ['ENG', 'high-wycombe',         51.6287,  -0.7482],
  ['ENG', 'milton-keynes',        52.0406,  -0.7594],
  ['ENG', 'northampton',          52.2405,  -0.9027],
  ['ENG', 'kettering-corby',      52.3930,  -0.7290],
  ['ENG', 'bedford',              52.1360,  -0.4670],
  ['ENG', 'luton',                51.8787,  -0.4200],
  ['ENG', 'stevenage',            51.9038,  -0.2018],

  // ===== ENGLAND — East Anglia + Essex (POSITIVE longitudes) =====
  ['ENG', 'cambridge',            52.2053,   0.1218],
  ['ENG', 'peterborough',         52.5695,  -0.2405],
  ['ENG', 'kings-lynn',           52.7520,   0.4020],
  ['ENG', 'norwich',              52.6309,   1.2974],
  ['ENG', 'great-yarmouth',       52.6083,   1.7300],
  ['ENG', 'lowestoft',            52.4800,   1.7500],
  ['ENG', 'ipswich',              52.0567,   1.1482],
  ['ENG', 'bury-st-edmunds',      52.2450,   0.7110],
  ['ENG', 'colchester',           51.8959,   0.8919],
  ['ENG', 'chelmsford',           51.7356,   0.4685],
  ['ENG', 'southend-on-sea',      51.5400,   0.7100],

  // ===== ENGLAND — Kent / Sussex / Surrey (mostly POSITIVE longitudes) =====
  ['ENG', 'medway-chatham',       51.3800,   0.5200],
  ['ENG', 'maidstone',            51.2720,   0.5290],
  ['ENG', 'canterbury',           51.2802,   1.0789],
  ['ENG', 'dover',                51.1279,   1.3134],
  ['ENG', 'ashford-kent',         51.1465,   0.8750],
  ['ENG', 'hastings',             50.8543,   0.5735],
  ['ENG', 'eastbourne',           50.7687,   0.2900],
  ['ENG', 'tunbridge-wells',      51.1324,   0.2637],
  ['ENG', 'crawley',              51.1092,  -0.1872],
  ['ENG', 'brighton-hove',        50.8225,  -0.1372],
  ['ENG', 'guildford',            51.2362,  -0.5704],

  // ===== ENGLAND — East Midlands + Lincolnshire =====
  ['ENG', 'leicester',            52.6369,  -1.1398],
  ['ENG', 'nottingham',           52.9548,  -1.1581],
  ['ENG', 'derby',                52.9225,  -1.4746],
  ['ENG', 'mansfield',            53.1450,  -1.1980],
  ['ENG', 'chesterfield',         53.2350,  -1.4210],
  ['ENG', 'lincoln',              53.2307,  -0.5406],
  ['ENG', 'grimsby',              53.5675,  -0.0800],
  ['ENG', 'scunthorpe',           53.5900,  -0.6500],

  // ===== ENGLAND — Yorkshire / Humber (the east half of the M62 corridor) =====
  ['ENG', 'kingston-upon-hull',   53.7457,  -0.3367],
  ['ENG', 'york',                 53.9600,  -1.0873],
  ['ENG', 'scarborough',          54.2830,  -0.3990],
  ['ENG', 'leeds',                53.8008,  -1.5491],
  ['ENG', 'bradford',             53.7960,  -1.7594],
  ['ENG', 'huddersfield',         53.6450,  -1.7850],
  ['ENG', 'barnsley',             53.5526,  -1.4797],
  ['ENG', 'doncaster',            53.5228,  -1.1285],
  ['ENG', 'sheffield',            53.3811,  -1.4701],

  // ===== ENGLAND — North West (the west half of the M62 corridor) + Cumbria =====
  ['ENG', 'manchester',           53.4808,  -2.2426],
  ['ENG', 'rochdale',             53.6160,  -2.1550],
  ['ENG', 'bolton',               53.5769,  -2.4282],
  ['ENG', 'wigan',                53.5450,  -2.6318],
  ['ENG', 'warrington',           53.3900,  -2.5970],
  ['ENG', 'liverpool',            53.4084,  -2.9916],
  ['ENG', 'southport',            53.6480,  -3.0100],
  ['ENG', 'chester',              53.1934,  -2.8931],
  ['ENG', 'preston',              53.7632,  -2.7031],
  ['ENG', 'blackpool',            53.8175,  -3.0357],
  ['ENG', 'blackburn',            53.7486,  -2.4820],
  ['ENG', 'burnley',              53.7890,  -2.2480],
  ['ENG', 'lancaster',            54.0466,  -2.8007],
  ['ENG', 'kendal',               54.3280,  -2.7460],
  ['ENG', 'barrow-in-furness',    54.1108,  -3.2261],
  ['ENG', 'workington',           54.6420,  -3.5440],
  ['ENG', 'carlisle',             54.8925,  -2.9329],

  // ===== ENGLAND — North East =====
  ['ENG', 'middlesbrough',        54.5742,  -1.2350],
  ['ENG', 'hartlepool',           54.6858,  -1.2120],
  ['ENG', 'darlington',           54.5235,  -1.5598],
  ['ENG', 'durham',               54.7767,  -1.5757],
  ['ENG', 'sunderland',           54.9069,  -1.3838],
  ['ENG', 'newcastle-upon-tyne',  54.9783,  -1.6178],
  ['ENG', 'hexham',               54.9710,  -2.1010],
  ['ENG', 'ashington-morpeth',    55.1810,  -1.5680],
  ['ENG', 'berwick-upon-tweed',   55.7710,  -2.0050],

  // ===== SCOTLAND =====
  ['SCT', 'glasgow',              55.8642,  -4.2518],
  ['SCT', 'edinburgh',            55.9533,  -3.1883],
  ['SCT', 'aberdeen',             57.1497,  -2.0943],
  ['SCT', 'dundee',               56.4620,  -2.9707],
  ['SCT', 'montrose-arbroath',    56.7100,  -2.4700],
  ['SCT', 'perth',                56.3950,  -3.4308],
  ['SCT', 'stirling',             56.1165,  -3.9369],
  ['SCT', 'falkirk',              56.0019,  -3.7839],
  ['SCT', 'livingston',           55.8830,  -3.5230],
  ['SCT', 'dunfermline',          56.0719,  -3.4393],
  ['SCT', 'kirkcaldy',            56.1130,  -3.1600],
  ['SCT', 'greenock',             55.9500,  -4.7600],
  ['SCT', 'kilmarnock',           55.6110,  -4.4960],
  ['SCT', 'ayr',                  55.4586,  -4.6292],
  ['SCT', 'stranraer',            54.9020,  -5.0270],
  ['SCT', 'dumfries',             55.0700,  -3.6030],
  ['SCT', 'galashiels-borders',   55.6180,  -2.8080],
  ['SCT', 'inverness',            57.4778,  -4.2247],
  ['SCT', 'elgin',                57.6500,  -3.3150],
  ['SCT', 'fort-william',         56.8198,  -5.1052],
  ['SCT', 'oban',                 56.4150,  -5.4700],
  ['SCT', 'wick-caithness',       58.4390,  -3.0940],

  // ===== WALES =====
  ['WLS', 'cardiff',              51.4816,  -3.1791],
  ['WLS', 'newport',              51.5842,  -2.9977],
  ['WLS', 'swansea',              51.6214,  -3.9436],
  ['WLS', 'bridgend',             51.5040,  -3.5770],
  ['WLS', 'merthyr-tydfil',       51.7480,  -3.3810],
  ['WLS', 'llanelli',             51.6810,  -4.1620],
  ['WLS', 'carmarthen',           51.8560,  -4.3100],
  ['WLS', 'haverfordwest',        51.8010,  -4.9700],
  ['WLS', 'aberystwyth',          52.4140,  -4.0810],
  ['WLS', 'newtown-powys',        52.5150,  -3.3130],
  ['WLS', 'wrexham',              53.0428,  -2.9927],
  ['WLS', 'rhyl-colwyn-bay',      53.3190,  -3.4890],
  ['WLS', 'bangor-gwynedd',       53.2274,  -4.1293],

  // ===== NORTHERN IRELAND =====
  ['NIR', 'belfast',              54.5973,  -5.9301],
  ['NIR', 'lisburn',              54.5162,  -6.0580],
  ['NIR', 'craigavon',            54.4470,  -6.3870],
  ['NIR', 'newry',                54.1751,  -6.3402],
  ['NIR', 'ballymena',            54.8643,  -6.2758],
  ['NIR', 'coleraine',            55.1320,  -6.6680],
  ['NIR', 'londonderry',          54.9966,  -7.3086],
  ['NIR', 'omagh',                54.5980,  -7.3100],
  ['NIR', 'enniskillen',          54.3440,  -7.6310],
];

// ---------------------------------------------------------------------------
// DENSIFY — extra tiles where the core viewport cannot hold the conurbation.
// London gets 12 (boroughs + outer ring) so the capital is 13 tiles in total.
// ---------------------------------------------------------------------------
const DENSIFY = [
  // --- London: N / S / E / W inner, then the outer ring ---
  ['ENG', 'london-north-wood-green',  51.5970,  -0.1100],
  ['ENG', 'london-south-streatham',   51.4280,  -0.1230],
  ['ENG', 'london-east-stratford',    51.5416,  -0.0042],
  ['ENG', 'london-west-ealing',       51.5130,  -0.3040],
  ['ENG', 'london-croydon',           51.3762,  -0.0982],
  ['ENG', 'london-bromley',           51.4060,   0.0150],
  ['ENG', 'london-romford',           51.5750,   0.1830],
  ['ENG', 'london-enfield',           51.6520,  -0.0810],
  ['ENG', 'london-harrow',            51.5800,  -0.3420],
  ['ENG', 'london-kingston',          51.4120,  -0.3000],
  ['ENG', 'london-uxbridge',          51.5460,  -0.4780],
  ['ENG', 'london-watford',           51.6565,  -0.3903],
  // --- Birmingham +3 (Solihull / Sutton Coldfield / Walsall) ---
  ['ENG', 'bham-solihull',            52.4120,  -1.7780],
  ['ENG', 'bham-sutton-coldfield',    52.5630,  -1.8240],
  ['ENG', 'bham-walsall',             52.5860,  -1.9820],
  // --- Manchester +3 (Trafford/Altrincham, Bury, Tameside/Ashton) ---
  ['ENG', 'mcr-altrincham',           53.3870,  -2.3510],
  ['ENG', 'mcr-bury',                 53.5930,  -2.2970],
  ['ENG', 'mcr-ashton-under-lyne',    53.4900,  -2.0970],
  // --- Leeds / Bradford +2 ---
  ['ENG', 'leeds-north-moortown',     53.8380,  -1.5480],
  ['ENG', 'bradford-keighley',        53.8670,  -1.9110],
  // --- Glasgow +2 ---
  ['SCT', 'glasgow-paisley',          55.8456,  -4.4239],
  ['SCT', 'glasgow-east-kilbride',    55.7644,  -4.1770],
  // --- +1 each: Liverpool, Sheffield, Bristol, Newcastle, Edinburgh ---
  ['ENG', 'liverpool-south-garston',  53.3550,  -2.8800],
  ['ENG', 'sheffield-north',          53.4600,  -1.4700],
  ['ENG', 'bristol-north-filton',     51.5100,  -2.5700],
  ['ENG', 'newcastle-gateshead-sth',  54.9000,  -1.5200],
  ['SCT', 'edinburgh-west',           55.9200,  -3.2800],
];

const TILES = [...ANCHORS.map(a => [...a, 'anchor']), ...DENSIFY.map(d => [...d, 'densify'])];

// --- sanity guards: a bad coordinate is the one error this file exists to prevent ---
const NATIONS = new Set(['ENG', 'SCT', 'WLS', 'NIR']);
const seenSlug = new Set();
for (const [nat, slug, lat, lng] of TILES) {
  if (seenSlug.has(slug)) { console.error(`ERROR: duplicate tile slug ${slug}`); process.exit(1); }
  seenSlug.add(slug);
  // UK mainland band: Lizard Point 49.96N -> Muckle Flugga 60.86N; Mullaghmore/Fermanagh -8.2E -> Lowestoft 1.76E.
  if (!(lat > 49.9 && lat < 60.9)) { console.error(`ERROR: ${slug} lat ${lat} outside the UK band 49.9..60.9`); process.exit(1); }
  if (!(lng > -8.3 && lng < 1.8)) { console.error(`ERROR: ${slug} lng ${lng} outside the UK band -8.3..1.8 (UK longitudes are mostly NEGATIVE; only East Anglia/Kent/Essex are positive)`); process.exit(1); }
  if (!NATIONS.has(nat)) { console.error(`ERROR: ${slug} bad nation code ${nat} (want ENG|SCT|WLS|NIR)`); process.exit(1); }
}

const HEAD = 'cell_id,icp_type,query,lat,lng,zoom,priority';
const rows = [];
for (const [nat, slug, lat, lng, kind] of TILES)
  for (let qi = 0; qi < QUERIES.length; qi++) {
    const { q, icp, pri } = QUERIES[qi];
    rows.push({ cell_id: `${nat.toLowerCase()}-${slug}-q${qi}`, icp_type: icp, query: q, lat, lng, zoom: 13, priority: pri, _kind: kind });
  }
const line = r => [r.cell_id, r.icp_type, r.query, r.lat, r.lng, r.zoom, r.priority].join(',');

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'atlas-growth-uk-runsheet.csv'), [HEAD, ...rows.map(line)].join('\n') + '\n');

// Round-robin shards so each worker spans ALL nations and both priorities (an evenly-slow shard
// beats one shard that owns every London tile). The merge afterwards dedupes the cross-shard overlap
// on place_id and unions google_types with '|'.
const shardDir = path.join(OUT, 'shards');
fs.mkdirSync(shardDir, { recursive: true });
const shards = Array.from({ length: NSHARDS }, () => []);
rows.forEach((r, i) => shards[i % NSHARDS].push(r));
shards.forEach((s, i) => fs.writeFileSync(path.join(shardDir, `shard-${i}.csv`), [HEAD, ...s.map(line)].join('\n') + '\n'));

const byNation = {}; for (const [n] of ANCHORS) byNation[n] = (byNation[n] || 0) + 1;
const densByNation = {}; for (const [n] of DENSIFY) densByNation[n] = (densByNation[n] || 0) + 1;
console.log(`anchors: ${ANCHORS.length} | densify: ${DENSIFY.length} | TILES: ${TILES.length}`);
console.log(`anchors by nation:  ${Object.entries(byNation).map(([k, v]) => k + '=' + v).join(' ')}`);
console.log(`densify by nation:  ${Object.entries(densByNation).map(([k, v]) => k + '=' + v).join(' ')}`);
// NB: filter on nation too — 'londonderry' (NIR) also starts with "london".
console.log(`london tiles: ${TILES.filter(t => t[0] === 'ENG' && t[1].startsWith('london')).length}`);
console.log(`queries: ${QUERIES.length} (P1=${QUERIES.filter(q => q.pri === 'P1').length}, P2=${QUERIES.filter(q => q.pri === 'P2').length})`);
console.log(`ROWS (query x tile): ${rows.length}  ->  atlas-growth-uk-runsheet.csv`);
console.log(`shards: ${NSHARDS} x ~${Math.ceil(rows.length / NSHARDS)} rows -> shards/shard-0..${NSHARDS - 1}.csv`);
