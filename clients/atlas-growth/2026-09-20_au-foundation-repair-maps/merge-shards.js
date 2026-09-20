#!/usr/bin/env node
/* merge-shards.js :: roll the 8 AU shard outputs up into one run-level list.  RUN-FOLDER ONE-OFF (ported unchanged from the UK run 2026-09-20; only this header line differs).
 *
 * The 1820-row AU runsheet was split round-robin across shard-0..7, so the SAME business is
 * returned by several shards (a different category query, or a neighbouring tile, hits it).
 * Cross-shard overlap is expected and is removed here on `place_id` — unioning `google_types`
 * and `icp_type` across every hit, exactly as scrape.js does WITHIN a shard (scrape.js:283).
 *
 * THE SEPARATOR RULE (IMPROVEMENTS.md, HIGH, 2026-09-11 — "google_types separator"):
 * scrape.js joins google_types with '|' and qualify-leads.js derives the PRIMARY type as
 * google_types.split('|')[0] (qualify-leads.js:60 and :74). Rejoin with anything else and that
 * split returns the WHOLE string, silently turning the primary-only `deny` into an any-match
 * deny — which would delete real UK firms that merely carry `Structural engineer` /
 * `Building materials supplier` as a SECONDARY tag (fixture rows 6, 7 in dryrun-results.md).
 * So: split on [;|], rejoin with '|', and keep the FIRST hit's type order so the primary type
 * that qualify-leads.js reads is the one Google actually primaried.
 *
 * Base row on a duplicate = the hit with the HIGHEST review_count (the most complete listing;
 * the review floor is a qualify rule, so an under-counted duplicate must not be the survivor).
 * Empty website/phone on the base are backfilled from a sibling hit — never overwritten.
 *
 * Also rolls up, because a row count is NOT evidence of coverage:
 *   coverage_summary.json  per-shard coverage_report.json status + runsheet_tiles + heal_passes
 *                          + unhealed_tiles, plus rows-in / unique place_ids / dupes removed.
 *   calls_summary.json     every run_log.json under the shard dirs (incl. the heal- and resume-
 *                          subdirs run-scrape.js writes): events, calls (sum of `pages` where
 *                          the paginated roll-up event has
 *                          one, else 1), calls per runsheet row, page-depth histogram, tiles
 *                          that came back count 0, and every non-ok status.
 *
 * EXTRA SOURCE DIRS (added 2026-09-16 for GATE 3 / P10, the re-buy of the 36 `ok`+count-0
 * (tile,query) rows). `rebuy/` is AUTO-DETECTED when it holds a leads_clean.csv, and any other
 * directory can be added with a repeatable `--extra <dir>`; `--no-extra` turns auto-detection off.
 * An extra is ingested with EXACTLY the shard semantics — same place_id dedupe, same google_types /
 * icp_type union, same highest-review_count base row, same '|' rejoin — so a business the re-buy
 * returned that the shards already had is a union, never a second row, and its run_logs are folded
 * into calls_summary.json like any other.
 *
 * ONE DELIBERATE ASYMMETRY: an extra does NOT add to `runsheet_rows`. The re-buy re-bought 36 rows
 * that the 1770-row sheet ALREADY commissioned, so adding them to the denominator would double-count
 * the sheet and understate calls/row. Calls go UP (they were really spent), the denominator does
 * not — which is the honest reading of "what did this sheet cost".
 *
 * REFUSES (exit 1) if any shard OR extra is missing coverage_report.json or reports INCOMPLETE —
 * that is SKILL STEP 4's "exit 0 = COMPLETE" gate, and a hole here ships looking complete.
 * --allow-incomplete overrides it deliberately (the summaries are still written either way).
 *
 * Usage:
 *   node merge-shards.js [--run <dir>] [--shards 8] [--runsheet <csv>] [--allow-incomplete]
 *                        [--extra <dir> ...] [--no-extra]
 */
const fs = require('fs'), path = require('path');

function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const RUN = path.resolve(arg('run', __dirname));
const N = Number(arg('shards', 8));
const RUNSHEET = arg('runsheet', '');
const ALLOW_INCOMPLETE = process.argv.includes('--allow-incomplete');
// --extra is repeatable; rebuy/ is auto-detected unless --no-extra is passed.
const EXTRA_DIRS = [];
for (let i = 0; i < process.argv.length; i++) if (process.argv[i] === '--extra' && process.argv[i + 1]) EXTRA_DIRS.push(process.argv[i + 1]);
if (!process.argv.includes('--no-extra') && !EXTRA_DIRS.length && fs.existsSync(path.join(RUN, 'rebuy', 'leads_clean.csv'))) EXTRA_DIRS.push('rebuy');
const EXTRAS = EXTRA_DIRS.map(d => ({ name: path.basename(path.resolve(RUN, d)), dir: path.resolve(RUN, d) }));

// CSV reader/writer (quoted cells: leads_clean has quoted addresses and hours JSON)
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const readCsv = f => { const R = pc(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')).filter(r => r.length > 1); const H = R.shift(); return { H, rows: R }; };

const SEP = '|';
const splitTags = s => String(s == null ? '' : s).split(/\s*[;|]\s*/).map(t => t.trim()).filter(Boolean);
const reviews = v => { const n = parseInt(String(v == null ? '' : v).replace(/[^0-9-]/g, ''), 10); return isFinite(n) ? n : 0; };

// ---------------------------------------------------------------- coverage roll-up
const perShard = [];
for (let i = 0; i < N; i++) {
  const dir = path.join(RUN, `shard-${i}`);
  const covPath = path.join(dir, 'coverage_report.json');
  let cov = null, covErr = null;
  if (fs.existsSync(covPath)) { try { cov = JSON.parse(fs.readFileSync(covPath, 'utf8')); } catch (e) { covErr = e.message; } }
  perShard.push({
    shard: i,
    dir_exists: fs.existsSync(dir),
    leads_file: fs.existsSync(path.join(dir, 'leads_clean.csv')),
    status: cov ? (cov.status || 'UNKNOWN') : (covErr ? 'UNPARSEABLE' : 'MISSING'),
    runsheet_tiles: cov ? (cov.runsheet_tiles ?? null) : null,
    heal_passes: cov ? (cov.heal_passes ?? null) : null,
    unhealed_tiles: cov ? (cov.unhealed_tiles || []) : [],
    empty_but_ok_centers: cov ? (cov.empty_but_ok_centers || []).length : null,
    rows: 0, // filled by the merge below
  });
}
// Extras get the identical coverage read-out, so a half-finished re-buy cannot ride in silently.
const perExtra = [];
for (const x of EXTRAS) {
  const covPath = path.join(x.dir, 'coverage_report.json');
  let cov = null, covErr = null;
  if (fs.existsSync(covPath)) { try { cov = JSON.parse(fs.readFileSync(covPath, 'utf8')); } catch (e) { covErr = e.message; } }
  perExtra.push({
    extra: x.name, dir: path.relative(RUN, x.dir),
    dir_exists: fs.existsSync(x.dir),
    leads_file: fs.existsSync(path.join(x.dir, 'leads_clean.csv')),
    status: cov ? (cov.status || 'UNKNOWN') : (covErr ? 'UNPARSEABLE' : 'MISSING'),
    runsheet_tiles: cov ? (cov.runsheet_tiles ?? null) : null,
    heal_passes: cov ? (cov.heal_passes ?? null) : null,
    unhealed_tiles: cov ? (cov.unhealed_tiles || []) : [],
    empty_but_ok_centers: cov ? (cov.empty_but_ok_centers || []).length : null,
    rows: 0, new_place_ids: 0,
  });
}
const badShards = perShard.filter(s => s.status !== 'COMPLETE');
const badExtras = perExtra.filter(s => s.status !== 'COMPLETE');

// ---------------------------------------------------------------- calls roll-up (run_log.json)
// Same discovery rule as run-scrape.js::allRunLogs — the top-level log plus any heal-/resume- subdir.
function runLogsFor(dir) {
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
const calls = {
  run_logs: [], total_events: 0, total_calls: 0,
  events_with_pages: 0, events_without_pages: 0,
  page_depth_histogram: {}, quadrant_splits: 0,
  zero_count_tiles: 0, zero_count_examples: [],
  non_ok_events: 0, non_ok_by_status: {}, non_ok_examples: [],
  per_shard: [],
};
for (let i = 0; i < N; i++) {
  const dir = path.join(RUN, `shard-${i}`);
  const shardStat = { shard: i, logs: 0, events: 0, calls: 0, non_ok: 0, zero_count: 0 };
  for (const f of runLogsFor(dir)) {
    let log; try { log = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
    calls.run_logs.push(path.relative(RUN, f));
    shardStat.logs++;
    for (const e of (log.per_cell || [])) {
      calls.total_events++; shardStat.events++;
      // A paginated roll-up event carries `pages` (one event per runsheet row, every page and
      // descendant sub-tile summed — scrape.js:204). A legacy single-call event has no `pages`.
      const pages = Number.isFinite(e.pages) ? e.pages : 1;
      calls.total_calls += pages; shardStat.calls += pages;
      if (Number.isFinite(e.pages)) { calls.events_with_pages++; calls.page_depth_histogram[e.pages] = (calls.page_depth_histogram[e.pages] || 0) + 1; }
      else calls.events_without_pages++;
      if (e.split) calls.quadrant_splits++;
      if (Number(e.count) === 0) {
        calls.zero_count_tiles++; shardStat.zero_count++;
        if (calls.zero_count_examples.length < 25) calls.zero_count_examples.push({ shard: i, query: e.query, lat: e.lat, lng: e.lng, status: e.status });
      }
      const st = String(e.status || '').toLowerCase();
      if (st !== 'ok') {
        calls.non_ok_events++; shardStat.non_ok++;
        calls.non_ok_by_status[e.status] = (calls.non_ok_by_status[e.status] || 0) + 1;
        if (calls.non_ok_examples.length < 25) calls.non_ok_examples.push({ shard: i, query: e.query, lat: e.lat, lng: e.lng, status: e.status, count: e.count, log: path.relative(RUN, f) });
      }
    }
  }
  calls.per_shard.push(shardStat);
}
// Extra dirs (the P10 re-buy): same walk, same accounting, kept visible as their own bucket.
calls.per_extra = [];
for (const x of EXTRAS) {
  const xStat = { extra: x.name, logs: 0, events: 0, calls: 0, non_ok: 0, zero_count: 0 };
  for (const f of runLogsFor(x.dir)) {
    let log; try { log = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
    calls.run_logs.push(path.relative(RUN, f));
    xStat.logs++;
    for (const e of (log.per_cell || [])) {
      calls.total_events++; xStat.events++;
      const pages = Number.isFinite(e.pages) ? e.pages : 1;
      calls.total_calls += pages; xStat.calls += pages;
      if (Number.isFinite(e.pages)) { calls.events_with_pages++; calls.page_depth_histogram[e.pages] = (calls.page_depth_histogram[e.pages] || 0) + 1; }
      else calls.events_without_pages++;
      if (e.split) calls.quadrant_splits++;
      if (Number(e.count) === 0) {
        calls.zero_count_tiles++; xStat.zero_count++;
        if (calls.zero_count_examples.length < 25) calls.zero_count_examples.push({ extra: x.name, query: e.query, lat: e.lat, lng: e.lng, status: e.status });
      }
      const st = String(e.status || '').toLowerCase();
      if (st !== 'ok') {
        calls.non_ok_events++; xStat.non_ok++;
        calls.non_ok_by_status[e.status] = (calls.non_ok_by_status[e.status] || 0) + 1;
        if (calls.non_ok_examples.length < 25) calls.non_ok_examples.push({ extra: x.name, query: e.query, lat: e.lat, lng: e.lng, status: e.status, count: e.count, log: path.relative(RUN, f) });
      }
    }
  }
  calls.per_extra.push(xStat);
}
// denominator = runsheet rows actually commissioned (per-SHARD coverage only — see the header note:
// an extra re-buys rows the sheet already commissioned, so it must not inflate the denominator),
// or --runsheet as a fallback
let runsheetRows = perShard.reduce((a, s) => a + (s.runsheet_tiles || 0), 0);
if (!runsheetRows && RUNSHEET && fs.existsSync(RUNSHEET)) runsheetRows = fs.readFileSync(RUNSHEET, 'utf8').split(/\r?\n/).filter(l => l.trim()).length - 1;
calls.runsheet_rows = runsheetRows || null;
calls.calls_per_runsheet_row = runsheetRows ? +(calls.total_calls / runsheetRows).toFixed(3) : null;
calls.events_per_runsheet_row = runsheetRows ? +(calls.total_events / runsheetRows).toFixed(3) : null;
fs.writeFileSync(path.join(RUN, 'calls_summary.json'), JSON.stringify(calls, null, 2));

// ---------------------------------------------------------------- merge leads_clean.csv
let HEAD = null;
const byId = new Map();   // place_id -> { row (base), types[], icps[] }  (types[] order = FIRST hit's order)
let rowsIn = 0, dupes = 0, noPid = 0;
// One ingest path for every source, so an extra can never drift from shard semantics.
function ingest(f) {
  const { H, rows } = readCsv(f);
  if (!HEAD) HEAD = H;
  let n = 0, fresh = 0;
  for (const r of rows) {
    const o = Object.fromEntries(H.map((h, j) => [h, r[j] == null ? '' : r[j]]));
    const pid = (o.place_id || '').trim();
    if (!pid) { noPid++; continue; }
    n++; rowsIn++;
    const hit = byId.get(pid);
    if (!hit) {
      byId.set(pid, { row: o, types: splitTags(o.google_types), icps: splitTags(o.icp_type) });
      fresh++;
      continue;
    }
    dupes++;
    // union, preserving the FIRST hit's order => first hit's first type stays the primary type
    for (const t of splitTags(o.google_types)) if (!hit.types.includes(t)) hit.types.push(t);
    for (const t of splitTags(o.icp_type)) if (!hit.icps.includes(t)) hit.icps.push(t);
    // base = highest review_count hit; the unioned tags are re-applied at write time
    if (reviews(o.review_count) > reviews(hit.row.review_count)) {
      const prev = hit.row;
      hit.row = o;
      for (const k of Object.keys(prev)) if (!String(hit.row[k] || '').trim() && String(prev[k] || '').trim()) hit.row[k] = prev[k];
    } else {
      for (const k of Object.keys(o)) if (!String(hit.row[k] || '').trim() && String(o[k] || '').trim()) hit.row[k] = o[k];
    }
  }
  return { n, fresh };
}
for (let i = 0; i < N; i++) {
  const f = path.join(RUN, `shard-${i}`, 'leads_clean.csv');
  if (!fs.existsSync(f)) continue;
  const { n } = ingest(f);
  const s = perShard.find(s => s.shard === i); if (s) s.rows = n;
}
// Extras LAST and deliberately so: the shards define the base row and the primary type order, and a
// re-buy of a tile the shards already covered must not be able to reorder google_types underneath
// qualify-leads.js's primary-type deny (the separator rule above, one level up).
let extraRowsIn = 0, extraNew = 0;
for (const x of EXTRAS) {
  const f = path.join(x.dir, 'leads_clean.csv');
  if (!fs.existsSync(f)) continue;
  const { n, fresh } = ingest(f);
  const e = perExtra.find(e => e.extra === x.name); if (e) { e.rows = n; e.new_place_ids = fresh; }
  extraRowsIn += n; extraNew += fresh;
}

const summary = {
  run: path.basename(RUN),
  shards: perShard.map(s => ({
    shard: s.shard, status: s.status, rows: s.rows,
    runsheet_tiles: s.runsheet_tiles, heal_passes: s.heal_passes,
    unhealed_tiles: s.unhealed_tiles.length, unhealed_tile_detail: s.unhealed_tiles,
    empty_but_ok_centers: s.empty_but_ok_centers,
  })),
  totals: {
    runsheet_tiles: perShard.reduce((a, s) => a + (s.runsheet_tiles || 0), 0),
    heal_passes: perShard.reduce((a, s) => a + (s.heal_passes || 0), 0),
    unhealed_tiles: perShard.reduce((a, s) => a + s.unhealed_tiles.length, 0),
    rows_in: rowsIn,
    rows_in_from_extras: extraRowsIn,
    new_place_ids_from_extras: extraNew,
    rows_without_place_id: noPid,
    unique_place_ids: byId.size,
    cross_shard_duplicates_removed: dupes,
  },
  extras: perExtra.map(s => ({
    extra: s.extra, dir: s.dir, status: s.status, rows: s.rows, new_place_ids: s.new_place_ids,
    runsheet_tiles: s.runsheet_tiles, heal_passes: s.heal_passes,
    unhealed_tiles: s.unhealed_tiles.length, unhealed_tile_detail: s.unhealed_tiles,
    empty_but_ok_centers: s.empty_but_ok_centers,
  })),
  incomplete_shards: [...badShards.map(s => ({ shard: s.shard, status: s.status })),
                      ...badExtras.map(s => ({ extra: s.extra, status: s.status }))],
  all_complete: badShards.length === 0 && badExtras.length === 0,
  allow_incomplete_used: ALLOW_INCOMPLETE,
};
fs.writeFileSync(path.join(RUN, 'coverage_summary.json'), JSON.stringify(summary, null, 2));

if ((badShards.length || badExtras.length) && !ALLOW_INCOMPLETE) {
  console.error('\n✗ REFUSING TO MERGE — coverage is not COMPLETE for every shard/extra.');
  for (const s of badExtras) console.error(`   extra ${s.extra}: ${s.status}` + (s.unhealed_tiles.length ? ` (${s.unhealed_tiles.length} unhealed tiles)` : ''));
  for (const s of badShards) {
    console.error(`   shard-${s.shard}: ${s.status}` +
      (s.unhealed_tiles.length ? ` (${s.unhealed_tiles.length} unhealed tiles, e.g. ${s.unhealed_tiles.slice(0, 3).map(t => `${t.query}@${t.lat},${t.lng}`).join(' ; ')})` : '') +
      (s.status === 'MISSING' ? ' — no coverage_report.json; did run-scrape.js finish for this shard?' : ''));
  }
  console.error('   SKILL STEP 4: a scrape that did not exit 0 is a silent coverage hole — re-run the shard');
  console.error('   (run-scrape.js --resume only re-buys the tiles that never reached status:ok).');
  console.error('   coverage_summary.json + calls_summary.json were still written, for diagnosis.');
  console.error('   Override deliberately with --allow-incomplete if the gap is understood and accepted.\n');
  process.exit(1);
}
if (!HEAD) { console.error('ERROR: no shard produced leads_clean.csv — nothing to merge'); process.exit(1); }

// write merged leads_clean.csv (tags re-joined with '|', see the separator rule above)
const out = [HEAD.map(esc).join(',')];
for (const hit of byId.values()) {
  hit.row.google_types = hit.types.join(SEP);
  hit.row.icp_type = hit.icps.join(SEP);
  out.push(HEAD.map(h => esc(hit.row[h])).join(','));
}
fs.writeFileSync(path.join(RUN, 'leads_clean.csv'), out.join('\n') + '\n');

// concat excluded.csv (closed / out-of-footprint at the SCRAPE stage — audit trail, not deduped
// on purpose: a row excluded in one shard may be kept in another, and both facts are evidence)
let exHead = null; const exRows = [];
const excludedSources = [];
for (let i = 0; i < N; i++) excludedSources.push(path.join(RUN, `shard-${i}`, 'excluded.csv'));
for (const x of EXTRAS) excludedSources.push(path.join(x.dir, 'excluded.csv'));
for (const f of excludedSources) {
  if (!fs.existsSync(f)) continue;
  const { H, rows } = readCsv(f);
  if (!exHead) exHead = H;
  for (const r of rows) exRows.push(r);
}
// Only write it if it has CONTENT: the re-buy's run-scrape.js emits a header-only excluded.csv
// (0 scrape-stage exclusions), and materialising that at run level would put an empty file where
// REPORT 2 recorded there is none — a file that exists is read as evidence that something was excluded.
if (exHead && exRows.length) fs.writeFileSync(path.join(RUN, 'excluded.csv'), [exHead.map(esc).join(','), ...exRows.map(r => r.map(esc).join(','))].join('\n') + '\n');

const t = summary.totals;
console.log(`merged ${t.rows_in} shard rows -> ${t.unique_place_ids} unique place_ids (${t.cross_shard_duplicates_removed} cross-shard dupes removed)`);
console.log(`shards: ${summary.shards.map(s => s.shard + '=' + s.status + '(' + s.rows + ')').join(' ')}`);
console.log(`runsheet tiles: ${t.runsheet_tiles} | heal passes: ${t.heal_passes} | unhealed tiles: ${t.unhealed_tiles}`);
if (perExtra.length) console.log(`extras: ${summary.extras.map(s => s.extra + '=' + s.status + '(' + s.rows + ' rows, ' + s.new_place_ids + ' new place_ids, ' + s.runsheet_tiles + ' tiles)').join(' ')}`);
console.log(exHead && exRows.length
  ? `excluded.csv: ${exRows.length} rows`
  : `excluded.csv: NOT WRITTEN — no shard or extra produced a non-empty excluded.csv (0 scrape-stage exclusions); the run folder will not contain one`);
console.log(`calls: ${calls.total_calls} over ${calls.total_events} events = ${calls.calls_per_runsheet_row} calls/runsheet row | page depth ${JSON.stringify(calls.page_depth_histogram)}`);
if (calls.per_extra && calls.per_extra.length) console.log(`  of which extras: ${calls.per_extra.map(s => s.extra + '=' + s.calls + ' calls/' + s.events + ' events').join(' ')} (denominator stays the ${calls.runsheet_rows} commissioned rows — extras re-buy rows already counted)`);
console.log(`zero-count tiles: ${calls.zero_count_tiles} | non-ok events: ${calls.non_ok_events} ${JSON.stringify(calls.non_ok_by_status)}`);
console.log(summary.all_complete ? '✓ ALL SHARDS COMPLETE -> leads_clean.csv + excluded.csv + coverage_summary.json + calls_summary.json'
  : `⚠ MERGED WITH INCOMPLETE SHARDS (${summary.incomplete_shards.map(s => s.shard).join(',')}) — --allow-incomplete was passed`);
