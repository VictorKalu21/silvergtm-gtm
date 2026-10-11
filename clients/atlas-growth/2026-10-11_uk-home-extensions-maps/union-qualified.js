#!/usr/bin/env node
/* union-qualified.js :: STEP 5b bookkeeping for the UK extensions run (deterministic, $0).
 * Inputs (run folder): maps/leads_clean_qualified.csv (main config), maps/excluded_officp.csv (main drops),
 *   maps/recover-baretype/, maps/recover-generic/, maps/recover-unrated/ leads_clean_qualified.csv (the three
 *   recovery passes over the main drops — recover-*-extensions-uk-config.json).
 * Writes: leads_qualified.csv = main KEEP + recovered rows (dedupe on place_id, track column added);
 *         excluded_maps.csv = every other main drop with drop_reason (the GATE 2 drop-reason audit + deliverable).
 * No kw: keyword-candidates track in this run: every query is a keyword (Google has no extension category),
 * so routing not_in_icp keyword rows to classify would send every trade primary in the UK to a site fetch —
 * the name recoveries ARE this run's keyword recovery (RUN-NOTES.md, lever L3 if the operator wants the wider track).
 * Usage: node union-qualified.js [--run <dir>] */
const fs = require('fs'), path = require('path');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const RUN = path.resolve(arg('run', __dirname));
function pc(t) { const R = []; let r = [], c = '', q = false; t = t.replace(/^﻿/, ''); for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else { if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\n') { r.push(c); R.push(r); r = []; c = ''; } else if (ch !== '\r') c += ch; } } if (c.length || r.length) { r.push(c); R.push(r); } return R; }
const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
function load(f) { if (!fs.existsSync(f)) return { H: null, rows: [] }; const R = pc(fs.readFileSync(f, 'utf8')).filter(r => r.length > 1); const H = R.shift(); return { H, rows: R.map(r => Object.fromEntries(H.map((h, i) => [h, r[i] == null ? '' : r[i]]))) }; }
const main = load(path.join(RUN, 'maps', 'leads_clean_qualified.csv'));
const drops = load(path.join(RUN, 'maps', 'excluded_officp.csv'));
if (!main.H) { console.error('ERROR: maps/leads_clean_qualified.csv missing'); process.exit(1); }
const H = main.H;
const seen = new Set(main.rows.map(r => r.place_id));
const qualified = main.rows.map(r => ({ ...r, track: 'main' }));
const recCounts = {};
for (const t of ['baretype', 'generic', 'unrated']) {
  const rec = load(path.join(RUN, 'maps', `recover-${t}`, 'leads_clean_qualified.csv'));
  let n = 0;
  for (const r of rec.rows) { if (seen.has(r.place_id)) continue; seen.add(r.place_id); qualified.push({ ...r, track: `recover_${t}` }); n++; }
  recCounts[t] = n;
}
const excluded = drops.rows.filter(r => !seen.has(r.place_id));
const w = (f, rows, cols) => fs.writeFileSync(f, [cols.map(esc).join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n') + '\n');
w(path.join(RUN, 'leads_qualified.csv'), qualified, [...H, 'track']);
w(path.join(RUN, 'excluded_maps.csv'), excluded, [...H, 'drop_reason']);
const by = {}; for (const r of excluded) by[r.drop_reason] = (by[r.drop_reason] || 0) + 1;
console.log(`qualified ${qualified.length} (main ${main.rows.length} + recovered ${JSON.stringify(recCounts)}) | excluded_maps ${excluded.length} ${JSON.stringify(by)}`);
