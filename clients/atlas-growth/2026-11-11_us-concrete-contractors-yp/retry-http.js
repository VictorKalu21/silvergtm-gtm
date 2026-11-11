#!/usr/bin/env node
/* retry-http.js — the free http:// rung (IMPROVEMENTS 2026-09-24: re-fetching failed rows with website=http://<host>/
 * recovered 35%). Job-side wrapper over the engine's fetch-sites.js; no engine change.
 *   node retry-http.js <tranche-dir ('.' or 't2')>
 * 1. failed rows of <dir>/owner/site_text.jsonl (status != ok) -> <dir>/retry/in.csv with website rewritten to http://<host>/
 * 2. fetch-sites.js on it -> <dir>/owner_retry/site_text.jsonl
 * 3. recovered rows (status ok) replace the failed ones in <dir>/owner/site_text.jsonl (backup: site_text.pre-retry.jsonl);
 *    <dir>/retry/recovered_ids.json lists them. Prints counts.
 */
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const D = process.argv[2] || '.';
const ENG = path.resolve(__dirname, '../../../skills/google-maps-scrape/');
const { csv } = require(ENG + '/build-plusvibe.js');
const SITE = path.join(D, 'owner/site_text.jsonl');
const recs = fs.readFileSync(SITE, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
const failed = new Map(recs.filter(r => r.status !== 'ok').map(r => [r.place_id, r]));
const leads = csv(path.join(D, 'leads_domains.csv')).filter(l => failed.has(l.place_id));
fs.mkdirSync(path.join(D, 'retry'), { recursive: true });
const hostOf = u => new URL(/^https?:\/\//i.test(u) ? u : 'http://' + u).hostname;
const H = Object.keys(leads[0]); const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
fs.writeFileSync(path.join(D, 'retry/in.csv'), [H.join(',')].concat(leads.map(l => H.map(h => esc(h === 'website' ? 'http://' + hostOf(l.website) + '/' : l[h])).join(','))).join('\n') + '\n');
const r = spawnSync(process.execPath, [ENG + '/fetch-sites.js', '--in', path.join(D, 'retry/in.csv'), '--out', path.join(D, 'owner_retry'), '--concurrency', '8', '--config', path.resolve(__dirname, '../atlas-growth-concrete-config.json')], { encoding: 'utf8' });
const rec2 = new Map(fs.readFileSync(path.join(D, 'owner_retry/site_text.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse).filter(x => x.status === 'ok').map(x => [x.place_id, x]));
fs.copyFileSync(SITE, path.join(D, 'owner/site_text.pre-retry.jsonl'));
fs.writeFileSync(SITE, recs.map(x => JSON.stringify(rec2.has(x.place_id) ? { ...rec2.get(x.place_id), recovered_via: 'http_retry' } : x)).join('\n') + '\n');
fs.writeFileSync(path.join(D, 'retry/recovered_ids.json'), JSON.stringify([...rec2.keys()]));
console.log(JSON.stringify({ dir: D, failed_before: failed.size, recovered: rec2.size, still_failed: failed.size - rec2.size, recovered_with_email: [...rec2.values()].filter(x => (x.emails || []).length).length }));
