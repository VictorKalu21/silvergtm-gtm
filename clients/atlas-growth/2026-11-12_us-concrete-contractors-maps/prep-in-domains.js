// prep-in-domains.js — one row per IN root domain (representative preferred) + a streamed site_text subset for exactly those rows.
// Out: leads_in_domains.csv (5,330) · owner_in/site_text.jsonl (their records; non-rep rows take the fanned copy of their rep's text)
const fs = require('fs'), readline = require('readline');
const { csv } = require('../../../skills/google-maps-scrape/build-plusvibe.js');
const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const rows = csv('leads_in_residential_flatwork.csv'); const pick = new Map();
for (const r of rows) { const k = r.root_domain; const cur = pick.get(k); if (!cur || (cur.rep_place_id_used && !r.rep_place_id_used)) pick.set(k, r); }
const leads = [...pick.values()]; const H = Object.keys(rows[0]);
fs.writeFileSync('leads_in_domains.csv', [H.join(',')].concat(leads.map(r => H.map(h => esc(r[h])).join(','))).join('\n') + '\n');
fs.mkdirSync('owner_in', { recursive: true }); const ids = new Set(leads.map(r => r.place_id)); const out = fs.createWriteStream('owner_in/site_text.jsonl'); let n = 0;
(async () => { for await (const l of readline.createInterface({ input: fs.createReadStream('owner/site_text_fanned.jsonl'), crlfDelay: Infinity })) { const id = (l.match(/"place_id":"([^"]+)"/) || [])[1]; if (ids.has(id)) { out.write(l + '\n'); n++; } } await new Promise(r => out.end(r)); console.log(JSON.stringify({ domains: leads.length, site_records: n })); })();
