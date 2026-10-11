#!/usr/bin/env node
/* union-qualified.js :: STEP 5b bookkeeping for this run (deterministic, $0).
 * Inputs (run folder): maps/leads_clean_qualified.csv (main config), maps/excluded_officp.csv (main drops),
 *   maps/recover/leads_clean_qualified.csv (generic-type recovery over the main drops).
 * Writes: leads_qualified.csv = main KEEP + recovered rows (dedupe on place_id);
 *         keyword_candidates.csv = kw:addition rows dropped ONLY by the allow rule (not_in_icp) and not recovered
 *           -> they skip qualify and go straight to the site-text classify (SKILL STEP 5b keyword recovery);
 *         excluded_maps.csv = every other main drop (denies, non-keyword not_in_icp) with drop_reason, for assemble.js.
 * Usage: node union-qualified.js [--run <dir>] */
const fs = require('fs'), path = require('path');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const RUN = path.resolve(arg('run', __dirname));
function pc(t) { const R = []; let r = [], c = '', q = false; t = t.replace(/^﻿/, ''); for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else { if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\n') { r.push(c); R.push(r); r = []; c = ''; } else if (ch === '\r') { } else c += ch; } } if (c !== '' || r.length) { r.push(c); R.push(r); } return R; }
const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
function load(f) { if (!fs.existsSync(f)) return { H: null, rows: [] }; const R = pc(fs.readFileSync(f, 'utf8')).filter(r => r.length > 1); const H = R.shift(); return { H, rows: R.map(r => Object.fromEntries(H.map((h, i) => [h, r[i] == null ? '' : r[i]]))) }; }
const main = load(path.join(RUN, 'maps', 'leads_clean_qualified.csv'));
const drops = load(path.join(RUN, 'maps', 'excluded_officp.csv'));
const rec = load(path.join(RUN, 'maps', 'recover', 'leads_clean_qualified.csv'));
if (!main.H) { console.error('ERROR: maps/leads_clean_qualified.csv missing'); process.exit(1); }
const H = main.H; // leads_clean columns (recovery rows carry drop_reason too; dropped on write)
const seen = new Set(main.rows.map(r => r.place_id));
const recovered = rec.rows.filter(r => !seen.has(r.place_id)); recovered.forEach(r => seen.add(r.place_id));
const qualified = [...main.rows, ...recovered];
const kw = [], excluded = [];
for (const r of drops.rows) { if (seen.has(r.place_id)) continue; if (/(^|\|)kw:/.test(r.icp_type || '') && r.drop_reason === 'not_in_icp') kw.push(r); else excluded.push(r); }
const w = (f, rows, cols) => fs.writeFileSync(f, [cols.map(esc).join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n') + '\n');
w(path.join(RUN, 'leads_qualified.csv'), qualified, H);
w(path.join(RUN, 'keyword_candidates.csv'), kw, [...H, 'drop_reason']);
w(path.join(RUN, 'excluded_maps.csv'), excluded, [...H, 'drop_reason']);
const by = {}; for (const r of excluded) by[r.drop_reason] = (by[r.drop_reason] || 0) + 1;
console.log(`qualified ${qualified.length} (main ${main.rows.length} + recovered ${recovered.length}) | keyword candidates -> classify ${kw.length} | excluded_maps ${excluded.length} ${JSON.stringify(by)}`);
