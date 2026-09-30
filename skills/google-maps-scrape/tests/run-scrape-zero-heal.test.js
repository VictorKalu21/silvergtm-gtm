#!/usr/bin/env node
/*
 * run-scrape-zero-heal.test.js :: the ok-with-0-rows blind spot (IMPROVEMENTS.md, LOW-MEDIUM).
 *
 * THE BUG IT GUARDS. run-scrape.js's heal loop re-buys a tile only when its status != 'ok'. A
 * tile-query that returns status:'ok' with COUNT 0 while the SAME centre's other queries return
 * hundreds of rows is not a real zero — it is an empty page the endpoint handed back — and
 * nothing in the coverage report flagged it (36 such pairs on the Atlas Growth UK run, e.g.
 * `damp proofing` = 0 at Guildford while `structural repair` at the same centre = 288).
 *
 * Scenario, no network (the same fake searchmaps.php process the paginate-heal test drives):
 *   centre A (6.43,3.42)  ZeroDamp -> ok + 0 rows   |   Big288 -> 288 rows
 *   centre B (6.50,3.50)  ZeroAlpha -> 0            |   ZeroBeta -> 0
 * Correct behaviour: ZeroDamp is re-bought ONCE (centre A is dense); neither of centre B's
 * queries is re-bought (a centre that is empty everywhere is a genuinely business-free area,
 * already reported as an empty_but_ok_center); the count is in the coverage report either way;
 * and --no-heal-zero reports the same count while buying nothing.
 */
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync, spawn } = require('child_process');
const { zeroRowSuspects } = require('../run-scrape.js');

let fails = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }

const RUN_SCRAPE = path.join(__dirname, '..', 'run-scrape.js');
const FAKE_API = path.join(__dirname, 'fake-searchmaps.js');
const PAGE = 150;

// ---------------------------------------------------------------------------
// 1. the pure selector
// ---------------------------------------------------------------------------
const cells = [
  { query: 'damp proofing', lat: 51.24, lng: -0.57, status: 'ok', count: 0 },
  { query: 'structural repair', lat: 51.24, lng: -0.57, status: 'ok', count: 288 },
  { query: 'mini piling', lat: 53.41, lng: -2.98, status: 'ok', count: 0 },
  { query: 'underpinning', lat: 53.41, lng: -2.98, status: 'ok', count: 0 },
  { query: 'basement waterproofing', lat: 51.41, lng: -0.30, status: 'ok', count: 0 },
  { query: 'basement waterproofing', lat: 51.41, lng: -0.30, status: 'ok', count: 12 }, // a later pass DID get rows
  { query: 'damp proofing', lat: 51.41, lng: -0.30, status: 'ok', count: 300 },
  { query: 'crack repair', lat: 55.95, lng: -3.19, status: 'timeout', count: 0 },       // not ok -> normal heal
  { query: 'house leveling', lat: 55.95, lng: -3.19, status: 'ok', count: 200 },
];
const sus = zeroRowSuspects(cells, 50).map(s => s.query + '@' + s.center).sort();
check('flags ok+0 at a dense centre', sus.includes('damp proofing@51.24,-0.57'));
check('a centre whose every query is 0 is NOT flagged', !sus.some(s => s.endsWith('@53.41,-2.98')));
check('a tile that returned rows on ANY pass is not a suspect', !sus.some(s => s.startsWith('basement waterproofing@')));
check('a non-ok tile is left to the normal heal loop', !sus.some(s => s.startsWith('crack repair@')));
check('exactly one suspect in the fixture', sus.length === 1);
check('the density threshold is configurable', zeroRowSuspects(cells, 500).length === 0);

// ---------------------------------------------------------------------------
// 2. end to end, through the real spawn boundary
// ---------------------------------------------------------------------------
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zheal-'));
const reqLog = path.join(dir, 'requests.log');
fs.writeFileSync(reqLog, '');

const portFile = path.join(dir, 'port');
const api = spawn(process.execPath, [FAKE_API, portFile, reqLog], { stdio: 'ignore' });
let port = null;
for (const deadline = Date.now() + 10000; Date.now() < deadline && !port; ) {
  if (fs.existsSync(portFile)) { const v = fs.readFileSync(portFile, 'utf8').trim(); if (v) port = v; }
  if (!port) execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},100)'], { stdio: 'ignore' });
}
if (!port) { console.log('FAIL fake API did not start'); api.kill(); process.exit(1); }

fs.writeFileSync(path.join(dir, '.env'), 'SCRAPER_TECH_KEY=test-key\n');
fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
  geo: { country: 'ng', footprint: { mode: 'areas' }, region_default: 'Nigeria' },
  scrape_tuning: { paginate: true, limit: PAGE, max_pages: 8 },
  qualify_rules: [],
}));
fs.writeFileSync(path.join(dir, 'runsheet.csv'),
  'cell_id,icp_type,query,lat,lng,zoom,priority\n' +
  'c1,trades,ZeroDamp,6.4290,3.4230,14,A\n' +          // ok + 0 at a DENSE centre -> re-buy once
  'c2,trades,Big288,6.4290,3.4230,14,A\n' +            // 288 rows at the same centre
  'c3,trades,ZeroAlpha,6.5000,3.5000,14,A\n' +         // a centre that is empty everywhere
  'c4,trades,ZeroBeta,6.5000,3.5000,14,A\n');

const env = { ...process.env, SCRAPER_API_HOST: '127.0.0.1', SCRAPER_API_PORT: port, SCRAPER_API_PROTO: 'http' };
function run(out, extra) {
  const before = fs.readFileSync(reqLog, 'utf8').split('\n').filter(Boolean).length;
  let code = 0, stdout = '';
  try {
    stdout = execFileSync(process.execPath, [RUN_SCRAPE, '--runsheet', path.join(dir, 'runsheet.csv'),
      '--config', path.join(dir, 'config.json'), '--out', out, '--env', path.join(dir, '.env'),
      '--max-retries', '2', ...extra], { stdio: 'pipe', env }).toString();
  } catch (e) { code = e.status == null ? 1 : e.status; stdout = (e.stdout || '').toString(); }
  const seen = fs.readFileSync(reqLog, 'utf8').split('\n').filter(Boolean).slice(before);
  return { code, stdout, seen, cov: JSON.parse(fs.readFileSync(path.join(out, 'coverage_report.json'), 'utf8')) };
}

// --- default: the re-buy runs ---
const outA = path.join(dir, 'out-heal');
const A = run(outA, []);
const zdA = A.seen.filter(l => l === 'ZeroDamp@0').length;

check('run exits 0 (an ok+0 tile is not a coverage failure)', A.code === 0);
check('coverage stays COMPLETE', A.cov.status === 'COMPLETE');
check('the dense centre is not reported empty-but-ok', !A.cov.empty_but_ok_centers.includes('6.43,3.42'));
check('the all-zero centre IS reported empty-but-ok', A.cov.empty_but_ok_centers.includes('6.50,3.50'));
check('coverage_report counts the ok+0 tile', A.cov.zero_row_suspects === 1);
check('it names the tile and the centre density', A.cov.zero_row_tiles.length === 1
  && A.cov.zero_row_tiles[0].query === 'ZeroDamp' && A.cov.zero_row_tiles[0].center_max === 288);
check('the default threshold is 50', A.cov.zero_row_min === 50);
check('it was re-bought ONCE (2 requests total: pass 0 + one re-buy)', zdA === 2);
check('coverage_report records the re-buy', A.cov.zero_row_rebought === 1);
check('a still-empty re-buy is reported as recovering nothing', A.cov.zero_row_recovered === 0);
check('the re-buy used the existing heal machinery (heal-zero/ dir + runsheet)',
  fs.existsSync(path.join(outA, 'heal-zero', 'run_log.json')) && fs.existsSync(path.join(outA, 'heal-zero-runsheet.csv')));
check('the heal-zero runsheet holds only the suspect tile',
  fs.readFileSync(path.join(outA, 'heal-zero-runsheet.csv'), 'utf8').trim().split('\n').length === 2);
check('an all-zero centre is NOT re-bought', A.seen.filter(l => l === 'ZeroAlpha@0').length === 1
  && A.seen.filter(l => l === 'ZeroBeta@0').length === 1);
check('the dense tile is not re-bought either', A.seen.filter(l => l === 'Big288@0').length === 1);
check('the dense tile paged to exhaustion (150 + 138)', A.seen.includes('Big288@' + PAGE) && A.seen.includes('Big288@' + PAGE * 2));
check('the count is printed in the coverage summary', /ok-but-0 tiles at dense centers \(>50\): 1 \| re-bought 1/.test(A.stdout));
check('the rows of the dense tile all reached leads_clean.csv',
  fs.readFileSync(path.join(outA, 'leads_clean.csv'), 'utf8').split('\n').filter(Boolean).length === 289);

// --- --no-heal-zero: counted, not bought ---
const outB = path.join(dir, 'out-nozero');
const B = run(outB, ['--no-heal-zero']);
check('--no-heal-zero still exits 0', B.code === 0);
check('--no-heal-zero still COUNTS the ok+0 tile', B.cov.zero_row_suspects === 1);
check('--no-heal-zero buys nothing', B.cov.zero_row_rebought === 0
  && B.seen.filter(l => l === 'ZeroDamp@0').length === 1
  && !fs.existsSync(path.join(outB, 'heal-zero')));
check('--no-heal-zero says so in the coverage summary', /ok-but-0 tiles at dense centers \(>50\): 1 \| re-buy DECLINED/.test(B.stdout));

// --- --zero-heal-min: the threshold is a flag ---
const outC = path.join(dir, 'out-minhigh');
const C = run(outC, ['--zero-heal-min', '500']);
check('--zero-heal-min 500 puts the centre below the density bar', C.cov.zero_row_suspects === 0
  && C.cov.zero_row_min === 500 && C.seen.filter(l => l === 'ZeroDamp@0').length === 1);

api.kill();
fs.rmSync(dir, { recursive: true, force: true });
console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
process.exit(fails ? 1 : 0);
