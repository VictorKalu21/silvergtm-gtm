#!/usr/bin/env node
/* retry-http.js — the free http:// rung over EVERY failed home fetch (IMPROVEMENTS 2026-09-24: 35% recovered), job-side wrapper over the
 * engine's fetch-sites.js (its own transient-retry pass OOM-crashed on a 22k-record file, see IMPROVEMENTS 2026-11-12, so this run replaces
 * it). Failed rows (status != ok) -> retry/in.csv with website http://<host>/ -> fetch-sites.js (small file, its own retry pass works) ->
 * recovered rows replace the failed ones in owner/site_text.jsonl by a STREAMING merge (backup site_text.pre-retry.jsonl).
 *   node retry-http.js     (run from this folder)
 */
const fs = require('fs'), path = require('path'), readline = require('readline'), { spawnSync } = require('child_process');
const ENG = path.resolve(__dirname, '../../../skills/google-maps-scrape');
const { csv } = require(ENG + '/build-plusvibe.js');
(async () => {
  const SITE = 'owner/site_text.jsonl', failed = new Set();
  const rl = readline.createInterface({ input: fs.createReadStream(SITE), crlfDelay: Infinity });
  for await (const l of rl) { if (!l) continue; const d = JSON.parse(l); if (d.status !== 'ok') failed.add(d.place_id); }
  const leads = csv('leads_domains_work.csv').filter(l => failed.has(l.place_id));
  fs.mkdirSync('retry', { recursive: true });
  const hostOf = u => new URL(/^https?:\/\//i.test(u) ? u : 'http://' + u).hostname;
  const H = Object.keys(leads[0]); const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  fs.writeFileSync('retry/in.csv', [H.join(',')].concat(leads.map(l => H.map(h => esc(h === 'website' ? 'http://' + hostOf(l.website) + '/' : l[h])).join(','))).join('\n') + '\n');
  const r = spawnSync(process.execPath, [ENG + '/fetch-sites.js', '--in', 'retry/in.csv', '--out', 'owner_retry', '--concurrency', '12', '--config', path.resolve(__dirname, '../atlas-growth-concrete-maps-config.json')], { encoding: 'utf8', maxBuffer: 1 << 28 });
  fs.writeFileSync('retry/fetch.log', (r.stdout || '') + (r.stderr || ''));
  const rec = new Map(); for (const l of fs.readFileSync('owner_retry/site_text.jsonl', 'utf8').split('\n').filter(Boolean)) { const d = JSON.parse(l); if (d.status === 'ok') rec.set(d.place_id, l); }
  fs.copyFileSync(SITE, 'owner/site_text.pre-retry.jsonl');
  const out = fs.createWriteStream(SITE + '.new'); const rl2 = readline.createInterface({ input: fs.createReadStream('owner/site_text.pre-retry.jsonl'), crlfDelay: Infinity });
  let n = 0; for await (const l of rl2) { if (!l) continue; const id = (l.match(/"place_id":"([^"]+)"/) || [])[1]; if (rec.has(id)) { out.write(rec.get(id).replace(/}\s*$/, ',"recovered_via":"http_retry"}') + '\n'); n++; } else out.write(l + '\n'); }
  await new Promise(res => out.end(res)); fs.renameSync(SITE + '.new', SITE);
  fs.writeFileSync('retry/recovered_ids.json', JSON.stringify([...rec.keys()]));
  console.log(JSON.stringify({ failed_before: failed.size, recovered: rec.size, replaced_in_file: n, still_failed: failed.size - rec.size }));
})();
