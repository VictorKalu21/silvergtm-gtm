#!/usr/bin/env node
/* TDD test for run-batch.js using a stub engine (--engine override).
 * Stub behavior: job "flaky" fails (exit 1, no output) on 1st attempt, succeeds on 2nd.
 * Job "good" succeeds immediately. Job "done-already" has a pre-existing non-empty
 * leads_clean.csv and must be SKIPPED (stub must not run for it).
 * Asserts: all jobs end status=done in _batch_state.json; flaky has attempts=2;
 * done-already attempts=0; overall exit 0; re-run is a no-op (idempotent).
 */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const BATCH_DRIVER = path.join(__dirname, '..', 'run-batch.js');
let fails = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runbatch-'));

// stub engine: reads --out; "flaky" job fails on first attempt (marker file tracks attempts)
const stub = path.join(tmp, 'stub-engine.js');
fs.writeFileSync(stub, `
const fs=require('fs'),path=require('path');
function arg(n){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:null}
const out=arg('out'); fs.mkdirSync(out,{recursive:true});
const marker=path.join(out,'_attempt');
const n=fs.existsSync(marker)?parseInt(fs.readFileSync(marker,'utf8'),10)+1:1;
fs.writeFileSync(marker,String(n));
if(out.includes('flaky')&&n<2){process.exit(1)}                       // fail 1st attempt, write nothing
fs.writeFileSync(path.join(out,'leads_clean.csv'),'place_id,name\\nX1,Biz');
process.exit(0);
`);
// pre-completed job
fs.mkdirSync(path.join(tmp, 'out-done'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'out-done', 'leads_clean.csv'), 'place_id,name\nP1,Prior');
// batch file
const batch = path.join(tmp, 'batch.json');
fs.writeFileSync(batch, JSON.stringify([
  { id: 'good',         runsheet: 'rs.csv', config: 'cfg.json', out: path.join(tmp, 'out-good') },
  { id: 'flaky',        runsheet: 'rs.csv', config: 'cfg.json', out: path.join(tmp, 'out-flaky') },
  { id: 'done-already', runsheet: 'rs.csv', config: 'cfg.json', out: path.join(tmp, 'out-done') },
]));
execFileSync(process.execPath, [BATCH_DRIVER, '--batch', batch, '--engine', stub, '--job-retries', '2', '--backoff-ms', '10'], { stdio: 'pipe' });
const state = JSON.parse(fs.readFileSync(path.join(tmp, '_batch_state.json'), 'utf8'));
check('good done', state['good'] && state['good'].status === 'done' && state['good'].rows === 1);
check('flaky done after retry', state['flaky'] && state['flaky'].status === 'done' && state['flaky'].attempts === 2);
check('done-already skipped (0 attempts)', state['done-already'] && state['done-already'].status === 'done' && state['done-already'].attempts === 0);
check('no stub run for done-already', !fs.existsSync(path.join(tmp, 'out-done', '_attempt')));
// idempotent re-run: nothing re-executes
execFileSync(process.execPath, [BATCH_DRIVER, '--batch', batch, '--engine', stub, '--job-retries', '2', '--backoff-ms', '10'], { stdio: 'pipe' });
check('re-run idempotent (flaky still attempts=2)', String(fs.readFileSync(path.join(tmp, 'out-flaky', '_attempt'))) === '2');
console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
process.exit(fails ? 1 : 0);
