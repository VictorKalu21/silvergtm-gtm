#!/usr/bin/env node
/*
 * google-maps-scrape :: run-batch.js — resumable multi-job batch driver
 * ---------------------------------------------------------------------
 * WHY: driving multi-country/multi-vertical batches with an inline shell loop
 * has two proven failure modes: (1) terminal closes -> the loop orphans and its
 * job list is unrecoverable except by process-archaeology; (2) an API outage
 * mid-batch makes jobs "complete" with exit!=0 / 0 rows and the loop marches on.
 * This driver persists the job list + state to disk, re-queues any job that
 * exits non-zero OR produces 0 rows (with backoff), and skip-guards jobs whose
 * leads_clean.csv already has rows -> re-running the same command resumes.
 *
 * Usage:
 *   node run-batch.js --batch <batch.json> [--job-retries 2] [--backoff-ms 60000]
 *                     [--max-retries 3] [--stall 30] [--engine <path>]
 * batch.json = [ { "id": "bw", "runsheet": "<path>", "config": "<path>", "out": "<dir>" }, ... ]
 * State: _batch_state.json next to batch.json — { id: {status, rows, attempts, updated} }.
 * Exit 0 = every job done with rows>0; exit 1 = one or more jobs still failed (safe to re-run).
 */
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const BATCH = arg('batch');
const JOB_RETRIES = parseInt(arg('job-retries', '2'), 10);
const BACKOFF_MS = parseInt(arg('backoff-ms', '60000'), 10);
const MAX_RETRIES = arg('max-retries', '3');
const STALL = arg('stall', '30');
const ENGINE = arg('engine', path.join(__dirname, 'run-scrape.js'));
if (!BATCH) { console.error('ERROR: --batch <batch.json> is required'); process.exit(1); }

const jobs = JSON.parse(fs.readFileSync(BATCH, 'utf8').replace(/^﻿/, ''));
const STATE_FILE = path.join(path.dirname(path.resolve(BATCH)), '_batch_state.json');
let state = {};
if (fs.existsSync(STATE_FILE)) {
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8').replace(/^﻿/, '')); }
  catch (e) { console.error(`ERROR: ${STATE_FILE} is corrupt JSON — fix it or delete it to start fresh (completed jobs are still skip-guarded by their leads_clean.csv).`); process.exit(1); }
}
const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
const rowCount = f => { if (!fs.existsSync(f)) return 0; return Math.max(0, fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(l => l.trim()).length - 1); };
const sleep = ms => spawnSync(process.execPath, ['-e', `setTimeout(()=>{}, ${ms})`]);

for (const job of jobs) {
  const outCsv = path.join(job.out, 'leads_clean.csv');
  const prior = rowCount(outCsv);
  if (prior > 0) { // idempotent skip-guard: already has data (this run or a previous one)
    state[job.id] = { status: 'done', rows: prior, attempts: (state[job.id] && state[job.id].attempts) || 0, updated: new Date().toISOString() };
    save(); console.log(`[${job.id}] SKIP — leads_clean.csv already has ${prior} rows`); continue;
  }
  let attempts = 0, ok = false;
  while (attempts < 1 + JOB_RETRIES && !ok) {
    attempts++;
    state[job.id] = { status: 'running', rows: 0, attempts, updated: new Date().toISOString() }; save();
    console.log(`[${job.id}] attempt ${attempts}/${1 + JOB_RETRIES} ...`);
    const r = spawnSync(process.execPath, [ENGINE, '--runsheet', job.runsheet, '--config', job.config, '--out', job.out, '--max-retries', MAX_RETRIES, '--stall', STALL], { stdio: 'inherit' });
    const rows = rowCount(outCsv);
    ok = r.status === 0 && rows > 0; // exit code AND row count — an outage can exit dirty OR zero the data
    state[job.id] = { status: ok ? 'done' : 'failed', rows, attempts, updated: new Date().toISOString() }; save();
    if (!ok && attempts < 1 + JOB_RETRIES) { console.log(`[${job.id}] failed (exit ${r.status}, ${rows} rows) — backoff ${BACKOFF_MS}ms then retry`); sleep(BACKOFF_MS); }
  }
}
console.log('\n==== BATCH SUMMARY ====');
let failed = 0;
for (const job of jobs) { const s = state[job.id] || { status: 'missing' }; if (s.status !== 'done') failed++; console.log(`${job.id.padEnd(16)} ${s.status.padEnd(8)} rows=${s.rows ?? 0} attempts=${s.attempts ?? 0}`); }
if (failed) { console.log(`\n${failed} job(s) NOT done — fix the cause and re-run the SAME command (state resumes).`); process.exit(1); }
console.log('\nAll jobs done.');
