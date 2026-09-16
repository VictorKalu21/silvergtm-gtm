#!/usr/bin/env node
/*
 * google-maps-scrape :: self-healing wrapper around scrape.js
 *
 * WHY THIS EXISTS: scrape.js swallows API failures — on a network drop it
 * resolves a tile with empty data and a status flag (error/timeout/failed/
 * parse_error) instead of throwing, then finishes with a normal RUN SUMMARY.
 * In `areas` mode there is no coverage alarm, so a dropped connection becomes
 * a silent hole that ships looking complete. (This cost a 2-day SolveX
 * recovery: a 75% coverage loss + a missed Northern Ireland that even careful
 * manual healing didn't catch, because intermittent single-tile failures don't
 * look like the frozen-counter signature a human watches for.)
 *
 * The failure signal already exists — scrape.js records `status` per tile in
 * run_log.per_cell. This wrapper acts on it: it runs scrape.js, audits per_cell,
 * and AUTO-REFILLS any tile that never returned status:'ok', looping until the
 * coverage is clean or it gives up. It does NOT edit scrape.js.
 *
 * Usage:
 *   node run-scrape.js --runsheet <csv> --config <json> --out <dir>
 *                      [--env <path>] [--max-retries 3] [--stall 30] [--resume]
 *
 * --resume: skip tiles that already reached status:'ok' in a previous run into this same
 *   --out dir (reads every run_log.json under it: the top-level one plus any heal- and
 *   resume- subdirs). A run killed by an outage or an exhausted API plan then costs only the
 *   tiles it never got, instead of re-billing the whole runsheet. Without the flag the
 *   behaviour is unchanged: pass 0 always re-scrapes every tile.
 *
 * Exit codes:
 *   0  every runsheet tile reached status:'ok'. <out>/leads_clean.csv is the
 *      healed, deduped, complete list. <out>/coverage_report.json = COMPLETE.
 *   1  one or more tiles could not be healed after --max-retries (e.g. a
 *      sustained outage). NOTHING downstream should run on this list.
 *      <out>/coverage_report.json = INCOMPLETE and lists the dead tiles.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i > -1 ? process.argv[i + 1] : def; }
const RUNSHEET = arg('runsheet');
const CONFIG = arg('config');
const OUT = arg('out', '.');
const ENVPATH = arg('env');
const MAX_RETRIES = Number(arg('max-retries', 3));
const STALL_N = Number(arg('stall', 30));
const RESUME = process.argv.includes('--resume');
if (require.main === module && (!RUNSHEET || !CONFIG)) { console.error('ERROR: --runsheet and --config are required'); process.exit(2); }
const SCRAPE_JS = path.join(__dirname, 'scrape.js');

const key = (q, la, ln) => `${q}|${Number(la).toFixed(2)}|${Number(ln).toFixed(2)}`;

function readRunsheet(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(l => l.trim());
  const head = lines.shift().split(',').map(s => s.trim());
  return lines.map(l => { const c = l.split(','); const r = {}; head.forEach((h, i) => r[h] = (c[i] || '').trim()); return r; });
}
function writeRunsheet(rows, file) {
  const head = 'cell_id,icp_type,query,lat,lng,zoom,priority';
  const body = rows.map(r => [r.cell_id, r.icp_type, r.query, r.lat, r.lng, r.zoom || 12, r.priority || 'P1']
    .map(v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(','));
  fs.writeFileSync(file, [head, ...body].join('\n') + '\n');
}

// Run scrape.js into <dir>; resolve when it exits. Watches stderr for a frozen
// total-unique (the live outage signature) and prints a loud one-time warning.
function runScrape(runsheet, dir) {
  return new Promise((resolve) => {
    const args = ['--runsheet', runsheet, '--config', CONFIG, '--out', dir];
    if (ENVPATH) args.push('--env', ENVPATH);
    const ch = spawn(process.execPath, [SCRAPE_JS, ...args], { stdio: ['ignore', 'inherit', 'pipe'] });
    let prev = null, frozen = 0, warned = false, buf = '';
    ch.stderr.on('data', d => {
      process.stderr.write(d);
      buf += d.toString();
      let nl; while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        const m = line.match(/total-unique=(\d+)/);
        if (!m) continue;
        const n = +m[1];
        if (n === prev) { frozen++; } else { frozen = 0; warned = false; }
        prev = n;
        if (frozen >= STALL_N && !warned) {
          warned = true;
          console.log(`\n[run-scrape] ⚠ STALL: total-unique frozen at ${n} for ${frozen} tiles — likely an API/network outage in progress. Tiles are being recorded empty; they will be auto-refilled after this pass.\n`);
        }
      }
    });
    ch.on('close', code => resolve(code));
  });
}

// Every run_log.json under <OUT>: the top-level pass plus any heal- or resume- subdir.
// Resume correctness depends on reading ALL of them — a tile healed on pass 2 of an earlier
// run is already paid for and must not be re-scraped.
function allRunLogs(dir) {
  const out = [];
  const top = path.join(dir, 'run_log.json');
  if (fs.existsSync(top)) out.push(top);
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || !/^(heal|resume)-/.test(e.name)) continue;
    const f = path.join(dir, e.name, 'run_log.json');
    if (fs.existsSync(f)) out.push(f);
  }
  return out;
}
// Union of tile keys that reached status:'ok' across the given run_logs.
function okKeysFrom(paths) {
  const ok = new Set();
  for (const f of paths) {
    let log; try { log = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
    for (const e of (log.per_cell || [])) {
      if (e.status === 'ok' || e.status === 'OK') ok.add(key(e.query, e.lat, e.lng));
    }
  }
  return ok;
}
// Every per_cell entry across the given run_logs (for the empty-but-ok report).
function allPerCell(paths) {
  const rows = [];
  for (const f of paths) {
    let log; try { log = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
    for (const e of (log.per_cell || [])) rows.push(e);
  }
  return rows;
}

// Which runsheet tiles did NOT reach status:'ok' in this run_log? (never-attempted counts as failed too)
function failedTiles(runLogPath, rows) {
  const log = JSON.parse(fs.readFileSync(runLogPath, 'utf8'));
  const okKeys = new Set();
  for (const e of log.per_cell) if (e.status === 'ok' || e.status === 'OK') okKeys.add(key(e.query, e.lat, e.lng));
  return rows.filter(r => !okKeys.has(key(r.query, r.lat, r.lng)));
}

// Merge src/leads_clean.csv into <OUT>/leads_clean.csv, dedup on place_id (col 0).
function mergeLeads(srcDir) {
  const master = path.join(OUT, 'leads_clean.csv');
  const src = path.join(srcDir, 'leads_clean.csv');
  if (!fs.existsSync(src)) return;
  const rd = f => fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean);
  const a = fs.existsSync(master) ? rd(master) : null;
  const b = rd(src);
  const hdr = (a ? a[0] : b[0]);
  const seen = new Set(); const out = [hdr];
  for (const set of [a ? a.slice(1) : [], b.slice(1)]) for (const line of set) {
    const pid = line.split(',')[0]; if (seen.has(pid)) continue; seen.add(pid); out.push(line);
  }
  fs.writeFileSync(master, out.join('\n') + '\n');
}

module.exports = { key, readRunsheet, failedTiles, writeRunsheet, allRunLogs, okKeysFrom, allPerCell };
if (require.main !== module) return;

(async () => {
  const allRows = readRunsheet(RUNSHEET);
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`[run-scrape] ${allRows.length} tiles | up to ${MAX_RETRIES} heal passes | hard-fail on unhealable gaps`);

  // pass 0 — full run into OUT, or (with --resume) only the tiles not already ok
  let pending;
  let priorOk = 0;
  if (RESUME) {
    const ok = okKeysFrom(allRunLogs(OUT));
    const todo = allRows.filter(r => !ok.has(key(r.query, r.lat, r.lng)));
    priorOk = allRows.length - todo.length;
    console.log(`[run-scrape] --resume: ${priorOk}/${allRows.length} tiles already ok from a previous run | ${todo.length} to scrape`);
    if (!todo.length) {
      // nothing left to buy — fall through to the report with an empty pending set
      mergeLeads(OUT);
      pending = [];
    } else {
      // pick a fresh resume-N dir so an earlier run's logs are never overwritten
      let n = 0; while (fs.existsSync(path.join(OUT, `resume-${n}`))) n++;
      const rDir = path.join(OUT, `resume-${n}`);
      const rSheet = path.join(OUT, `resume-${n}-runsheet.csv`);
      writeRunsheet(todo, rSheet);
      await runScrape(rSheet, rDir);
      mergeLeads(rDir);
      pending = failedTiles(path.join(rDir, 'run_log.json'), todo);
      console.log(`[run-scrape] resume pass: ${todo.length - pending.length}/${todo.length} new tiles ok` + (pending.length ? ` | ${pending.length} failed -> healing` : ''));
    }
  } else {
    await runScrape(RUNSHEET, OUT);
    mergeLeads(OUT); // canonicalize (no-op merge, dedups)
    pending = failedTiles(path.join(OUT, 'run_log.json'), allRows);
    console.log(`[run-scrape] pass 0: ${allRows.length - pending.length}/${allRows.length} tiles ok` + (pending.length ? ` | ${pending.length} failed -> healing` : ''));
  }

  // heal loop
  let attempt = 0;
  while (pending.length && attempt < MAX_RETRIES) {
    attempt++;
    const healRunsheet = path.join(OUT, `heal-${attempt}-runsheet.csv`);
    const healDir = path.join(OUT, `heal-${attempt}`);
    writeRunsheet(pending, healRunsheet);
    console.log(`[run-scrape] heal pass ${attempt}: re-scraping ${pending.length} failed tiles...`);
    await runScrape(healRunsheet, healDir);
    mergeLeads(healDir);
    pending = failedTiles(path.join(healDir, 'run_log.json'), pending);
    console.log(`[run-scrape] heal pass ${attempt}: ${pending.length} still failing`);
  }

  // genuinely-empty-but-ok centers: report for awareness (NOT a failure)
  const finalCells = allPerCell(allRunLogs(OUT));
  const byCenter = {};
  for (const e of finalCells) {
    const c = `${Number(e.lat).toFixed(2)},${Number(e.lng).toFixed(2)}`;
    (byCenter[c] = byCenter[c] || []).push(e);
  }
  const emptyOkCenters = Object.entries(byCenter)
    .filter(([, evs]) => evs.every(e => (e.status === 'ok' || e.status === 'OK') && e.count === 0))
    .map(([c]) => c);

  const complete = pending.length === 0;
  const report = {
    status: complete ? 'COMPLETE' : 'INCOMPLETE',
    runsheet_tiles: allRows.length,
    resumed_tiles_skipped: RESUME ? priorOk : 0,
    heal_passes: attempt,
    unhealed_tiles: pending.map(r => ({ query: r.query, lat: r.lat, lng: r.lng })),
    empty_but_ok_centers: emptyOkCenters,
    note: complete
      ? 'Every runsheet tile reached status:ok. leads_clean.csv is the healed, deduped, complete list.'
      : `${pending.length} tile(s) could not be healed after ${MAX_RETRIES} retries (sustained outage?). Do NOT run downstream on this list — re-run when the connection is stable.`
  };
  fs.writeFileSync(path.join(OUT, 'coverage_report.json'), JSON.stringify(report, null, 2));

  console.log('\n==== COVERAGE ' + report.status + ' ====');
  console.log(`tiles: ${allRows.length}${RESUME ? ` (${priorOk} skipped by --resume)` : ''} | heal passes: ${attempt} | empty-but-ok centers: ${emptyOkCenters.length}`);
  if (!complete) {
    console.log(`✗ UNHEALED tiles (${pending.length}):`);
    for (const r of pending) console.log(`   ${r.query} @ ${r.lat},${r.lng}`);
    console.log('coverage_report.json = INCOMPLETE — downstream blocked.');
    process.exit(1);
  }
  console.log('✓ leads_clean.csv is complete. coverage_report.json = COMPLETE.');
  process.exit(0);
})();
