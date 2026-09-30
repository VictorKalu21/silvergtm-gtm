#!/usr/bin/env node
/*
 * paginate-heal.test.js :: the roll-up-event <-> failedTiles contract, end to end.
 *
 * This is the only test that crosses the real spawn boundary
 * (run-scrape.js -> scrape.js -> HTTP), which is where the bug it guards lives.
 *
 * THE BUG IT GUARDS. run-scrape.js::failedTiles marks a runsheet tile healthy if ANY
 * per_cell event carrying its `query|lat|lng` key has status 'ok'. Paginated pages of one
 * tile share that key EXACTLY. So if scrape.js emitted one event per API call, a tile whose
 * page 0 succeeded and page 2 failed would score 'ok', never be healed, and ship as a
 * silent hole — the precise failure class run-scrape.js was written to eliminate (it cost a
 * 2-day recovery on a prior client). scrape.js therefore emits ONE roll-up event per
 * runsheet row under pagination, with status 'ok' only if every page succeeded.
 *
 * Scenario: two tiles. "Reliable" always succeeds. "FailOnce" returns status:"failed" on
 * page 2 the FIRST time it is asked and succeeds on every later attempt. Correct behaviour
 * is: pass 0 marks FailOnce unhealed -> one heal pass -> COMPLETE, and the page-2 records
 * (which pass 0 never saw) are present in the final leads_clean.csv.
 *
 * Uses the SCRAPER_API_HOST/PORT/PROTO seam in scrape.js; run-scrape.js hardcodes
 * SCRAPE_JS with no --engine override, so an env seam is the only way in.
 */
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync, spawn } = require('child_process');

let fails = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }

const RUN_SCRAPE = path.join(__dirname, '..', 'run-scrape.js');
const FAKE_API = path.join(__dirname, 'fake-searchmaps.js');
const PAGE = 150;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgheal-'));
const reqLog = path.join(dir, 'requests.log');
fs.writeFileSync(reqLog, '');

// The fake API runs as its OWN process: execFileSync below blocks this event loop
// entirely, so an in-process server would never answer the child's requests (it deadlocks).
// It binds an ephemeral port and publishes it to a portfile, which we poll for — a
// synchronous test cannot await a 'listening' event.
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
  'c1,financial,Reliable,6.4290,3.4230,14,A\n' +
  'c2,financial,FailOnce,6.4500,3.4400,14,A\n');

const out = path.join(dir, 'out');
let exitCode = 0;
try {
  execFileSync(process.execPath, [RUN_SCRAPE, '--runsheet', path.join(dir, 'runsheet.csv'),
    '--config', path.join(dir, 'config.json'), '--out', out, '--env', path.join(dir, '.env'),
    '--max-retries', '2'], {
    stdio: 'pipe',
    env: { ...process.env, SCRAPER_API_HOST: '127.0.0.1', SCRAPER_API_PORT: port, SCRAPER_API_PROTO: 'http' },
  });
} catch (e) { exitCode = e.status == null ? 1 : e.status; }
api.kill();

const cov = JSON.parse(fs.readFileSync(path.join(out, 'coverage_report.json'), 'utf8'));
const log = JSON.parse(fs.readFileSync(path.join(out, 'run_log.json'), 'utf8'));
const leads = fs.readFileSync(path.join(out, 'leads_clean.csv'), 'utf8');
const seen = fs.readFileSync(reqLog, 'utf8').split('\n').filter(Boolean);

// 1. The failure was DETECTED, not masked. Page 0 of FailOnce succeeded, so a per-call
//    event scheme would have scored this tile ok and shipped a hole.
const rollups = log.per_cell.filter(e => e.query === 'FailOnce');
check('pass 0 emits ONE roll-up event for the failing tile (not one per page)', rollups.length === 1);
check('that roll-up is NOT ok, despite page 0 succeeding', rollups[0] && rollups[0].status !== 'ok');
check('roll-up records the page count it actually made', rollups[0] && rollups[0].pages >= 2);

// 2. The healthy tile is unaffected and paged to exhaustion past a short page.
const good = log.per_cell.filter(e => e.query === 'Reliable');
check('healthy tile emits one ok roll-up', good.length === 1 && good[0].status === 'ok');
check('healthy tile paged past the short page (150+40=190)', good[0] && good[0].count === 190);

// 3. It healed, and the records pass 0 never saw are in the final list.
check('coverage reports COMPLETE after healing', cov.status === 'COMPLETE');
check('at least one heal pass ran', cov.heal_passes >= 1);
check('run-scrape exits 0', exitCode === 0);
check('page-2 records of the failed tile reach leads_clean.csv', leads.includes('FailOnce-150'));
check('page-2 records of the healthy tile reach leads_clean.csv', leads.includes('Reliable-150'));

// 4. Offset stepping is by limit, and a short page did not terminate the loop.
check('offsets stepped by limit', seen.includes('Reliable@0') && seen.includes('Reliable@' + PAGE));
check('short page did not stop the loop (asked for offset 300)', seen.includes('Reliable@' + PAGE * 2));

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
process.exit(fails ? 1 : 0);
