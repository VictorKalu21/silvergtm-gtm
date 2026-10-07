#!/usr/bin/env node
/* gap-tiles.js: BUILD a postal runsheet from a config allowlist, HEAL the gaps in run_log.json,
 * list ZIPs with no centroid instead of dropping them silently, honour --min-sep-km, refuse
 * prefix-mode configs, and never overwrite a runsheet without --force. No network. */
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const S = path.join(__dirname, '..', 'gap-tiles.js');
const { buildRows, parseQueries, loadCentroids } = require(S);
let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gaptiles-'));
const zips = path.join(tmp, 'zips.csv');
// three real Phoenix-area ZCTAs (2024 gazetteer) + one 1.3 km from 85004 to exercise --min-sep-km
fs.writeFileSync(zips, 'zip,lat,lng\n85004,33.45150,-112.07010\n85006,33.46510,-112.04830\n85281,33.42900,-111.93380\n85003,33.45120,-112.07840\n');
const C = loadCentroids(zips);
check('centroids load and pad', C.size === 4 && C.get('85004').lat === 33.4515);

// --- unit: buildRows ---
const q = parseQueries('Plumber:field_service, Electrician');
check('parseQueries: explicit icp + slug default', q.length === 2 && q[0].icp_type === 'field_service' && q[1].icp_type === 'electrician');
check('parseQueries: a kw: tag keeps its colon', parseQueries('septic pumping:kw:septic')[0].icp_type === 'kw:septic' && parseQueries('septic pumping:kw:septic')[0].query === 'septic pumping');
let r = buildRows(['85004', '85006', '00000', '85004'], q, C, { zoom: 14, prefix: 'z' });
check('rows = queries × unique ZIPs with a centroid', r.rows.length === 4 && r.tiles === 2);
check('missing ZIP reported, not dropped silently', r.missing.length === 1 && r.missing[0] === '00000');
check('runsheet columns + zoom', r.rows[0].cell_id === 'z85004-1' && r.rows[0].zoom === 14 && r.rows[0].priority === 'P1' && /^-112\.0701/.test(r.rows[0].lng));
r = buildRows(['85004', '85003', '85281'], q.slice(0, 1), C, { minSepKm: 2 });
check('--min-sep-km merges a ZIP 1.3 km from one already emitted', r.tiles === 2 && r.rows.map(x => x.cell_id).join(',') === 'z85004-1,z85281-2');

// --- cli: BUILD mode ---
const cfg = path.join(tmp, 'acme-config.json');
fs.writeFileSync(cfg, JSON.stringify({ geo: { country: 'us', footprint: { mode: 'postal', postal_allow: ['85004', '85281', '00000'], postal_match: 'exact' } } }));
let p = spawnSync('node', [S, '--zips', zips, '--config', cfg, '--queries', 'Plumber:field_service'], { encoding: 'utf8' });
const outSheet = path.join(tmp, 'acme-runsheet.csv');
check('build mode writes <client>-runsheet.csv next to the config', p.status === 0 && fs.existsSync(outSheet));
const sheet = fs.readFileSync(outSheet, 'utf8').trim().split('\n');
check('header is the engine runsheet header', sheet[0] === 'cell_id,icp_type,query,lat,lng,zoom,priority' && sheet.length === 3);
check('no-centroid ZIP is in the summary + a WARN', /"no_centroid":\["00000"\]/.test(p.stdout) && /WARN: 1 ZIP/.test(p.stderr));
p = spawnSync('node', [S, '--zips', zips, '--config', cfg, '--queries', 'Plumber'], { encoding: 'utf8' });
check('refuses to overwrite an existing runsheet without --force', p.status === 1 && /--force/.test(p.stderr));
const cfgUk = path.join(tmp, 'uk-config.json');
fs.writeFileSync(cfgUk, JSON.stringify({ geo: { footprint: { mode: 'postal', postal_allow: ['M', 'SW'], postal_match: 'prefix' } } }));
p = spawnSync('node', [S, '--zips', zips, '--config', cfgUk, '--queries', 'Plumber'], { encoding: 'utf8' });
check('prefix-mode (UK) config exits 2', p.status === 2 && /prefix/.test(p.stderr));

// --- cli: HEAL mode ---
const runDir = path.join(tmp, 'run'); fs.mkdirSync(runDir);
fs.writeFileSync(path.join(runDir, 'run_log.json'), JSON.stringify({ footprint_codes_with_no_results: ['85006', '85281'], per_cell: [] }));
p = spawnSync('node', [S, '--zips', zips, '--run-log', path.join(runDir, 'run_log.json'), '--runsheet', outSheet], { encoding: 'utf8' });
const gap = path.join(runDir, 'gap-runsheet.csv');
check('heal mode writes gap-runsheet.csv beside run_log.json', p.status === 0 && fs.existsSync(gap));
const g = fs.readFileSync(gap, 'utf8').trim().split('\n');
check('one row per runsheet query × gap ZIP, gap-prefixed ids', g.length === 3 && /^gap85006-1,field_service,Plumber,/.test(g[1]) && /^gap85281-2,/.test(g[2]));
fs.writeFileSync(path.join(runDir, 'run_log.json'), JSON.stringify({ footprint_codes_with_no_results: 'n/a' }));
p = spawnSync('node', [S, '--zips', zips, '--run-log', path.join(runDir, 'run_log.json'), '--runsheet', outSheet], { encoding: 'utf8' });
check('areas-mode run_log (n/a) exits 2 with a pointer to coverage_report.json', p.status === 2 && /coverage_report/.test(p.stderr));

fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
