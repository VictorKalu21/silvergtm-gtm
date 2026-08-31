#!/usr/bin/env node
/* TDD test for footprint-gate.js v2.
 * Scenario A (sparse geo, no country tokens): target Botswana, geo.sparse_geo=true.
 *   - city-ending address (Gaborone)          -> KEEP (old code wrongly dropped as wrong_country)
 *   - remote in-country school, >111km, no country token -> KEEP (old code dropped far_from_hubs)
 *   - "..., United States" bad geocode        -> DROP wrong_country
 *   - "..., South Africa" border bleed        -> DROP wrong_country
 * Scenario B (US, --keep-domestic): far-US kept, Canada dropped.
 * Scenario C (US, default): far-US still dropped (hub gate regression guard).
 */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const GATE = path.join(__dirname, '..', 'footprint-gate.js');
let fails = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }
function run(dir, rows, config, extraArgs) {
  fs.mkdirSync(dir, { recursive: true });
  const head = 'place_id,business_name,full_address,city,latitude,longitude';
  fs.writeFileSync(path.join(dir, 'in.csv'), [head, ...rows].join('\n'));
  fs.writeFileSync(path.join(dir, 'runsheet.csv'), 'cell_id,icp_type,query,lat,lng,zoom,priority\n' + config.hubs.map((h, i) => `c${i},t,q,${h[0]},${h[1]},13,P1`).join('\n'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ geo: config.geo }));
  execFileSync(process.execPath, [GATE, '--in', path.join(dir, 'in.csv'), '--runsheet', path.join(dir, 'runsheet.csv'), '--config', path.join(dir, 'config.json'), '--out', dir, ...(extraArgs || [])], { stdio: 'pipe' });
  const kept = fs.readFileSync(path.join(dir, 'leads_clean_qualified_infootprint.csv'), 'utf8').split(/\r?\n/).filter(l => l.trim()).slice(1);
  const dropped = fs.readFileSync(path.join(dir, 'excluded_geo.csv'), 'utf8').split(/\r?\n/).filter(l => l.trim()).slice(1);
  return { kept, dropped };
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fpgate-'));

// Scenario A — Botswana, sparse geo, hub = Gaborone (-24.65, 25.91)
const A = run(path.join(tmp, 'A'), [
  'bw1,Hillcrest Intl School,"Plot 123, Makoba, Gaborone",Gaborone,-24.65,25.91',
  'bw2,Remote Village School,"Village Rd, Maun",Maun,-19.98,23.42',           // ~560km from hub
  'us1,Bad Geocode School,"100 Main St, Springfield, United States",Springfield,39.78,-89.65',
  'za1,Border School,"1 Border Rd, Mafikeng, South Africa",Mafikeng,-25.86,25.64',
], { hubs: [[-24.65, 25.91]], geo: { region_default: 'Botswana', sparse_geo: true } });
check('A: Gaborone city-ending KEPT', A.kept.some(l => l.includes('bw1')));
check('A: remote in-country KEPT (sparse_geo skips hub gate)', A.kept.some(l => l.includes('bw2')));
check('A: United States DROPPED', A.dropped.some(l => l.includes('us1') && l.includes('wrong_country')));
check('A: South Africa DROPPED', A.dropped.some(l => l.includes('za1') && l.includes('wrong_country')));

// Scenario B — US target, --keep-domestic, hub = Phoenix (33.45, -112.07)
const usRows = [
  'phx1,Phoenix Biz,"1 Central Ave, Phoenix, AZ 85004, United States","Phoenix, AZ",33.45,-112.07',
  'sea1,Seattle Biz,"2 Pike St, Seattle, WA 98101, United States","Seattle, WA",47.61,-122.33',   // ~1800km from hub
  'ca1,Windsor Biz,"3 Ouellette Ave, Windsor, ON, Canada","Windsor, ON",42.32,-83.04',
];
const usCfg = { hubs: [[33.45, -112.07]], geo: { region_default: 'United States' } };
const B = run(path.join(tmp, 'B'), usRows, usCfg, ['--keep-domestic']);
check('B: in-hub US KEPT', B.kept.some(l => l.includes('phx1')));
check('B: far-US KEPT under --keep-domestic', B.kept.some(l => l.includes('sea1')));
check('B: Canada DROPPED under --keep-domestic', B.dropped.some(l => l.includes('ca1') && l.includes('wrong_country')));

// Scenario C — same US rows, default mode (hub gate ON): far-US must still drop
const C = run(path.join(tmp, 'C'), usRows, usCfg);
check('C: far-US DROPPED in default mode (regression)', C.dropped.some(l => l.includes('sea1') && l.includes('far_from_hubs')));
check('C: in-hub US KEPT in default mode', C.kept.some(l => l.includes('phx1')));

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
process.exit(fails ? 1 : 0);
