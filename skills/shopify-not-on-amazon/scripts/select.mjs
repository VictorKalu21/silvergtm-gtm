// STEP 10 · Final selection for a client batch. Reads {RUN}_LEADS_full.csv (merge.mjs final), applies the persistent denylist
// (denylist.json in DIR: {domain: reason} - hand exclusions from every run, retailers / non-US parents / licensed merch / verifier
// misses), excludes domains already delivered (DELIVERED=path/to/prior.csv, repeatable), ranks by the buyer's criteria and caps
// fashion/jewelry/alcohol/medical at CAP_SHARE. N=0 exports the whole ranked pool (let the buyer cut it).
//
//   RUN=<run> DIR=<dir> N=100 CAP_SHARE=0.25 node select.mjs             # -> {RUN}_SELECT.csv
//   env: MIN_SEARCHES (0) MIN_VISITS (0) REQUIRE_CONTACT (1) DELIVERED (comma list of csvs whose Website column is excluded)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const DIR = process.env.DIR || '.', RUN = process.env.RUN || 'run', N = Number(process.env.N ?? 100), CAP = Number(process.env.CAP_SHARE ?? 0.25);
const MIN_S = Number(process.env.MIN_SEARCHES || 0), MIN_V = Number(process.env.MIN_VISITS || 0), REQ = process.env.REQUIRE_CONTACT !== '0';
function parse(t) { const rows = []; let f = [], c = '', q = false; for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else if (ch === '"') q = true; else if (ch === ',') { f.push(c); c = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; if (c !== '' || f.length) { f.push(c); rows.push(f); f = []; c = ''; } } else c += ch; } if (c !== '' || f.length) { f.push(c); rows.push(f); } return rows; }
const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const dom = (w) => (w || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
const deny = existsSync(`${DIR}/denylist.json`) ? JSON.parse(readFileSync(`${DIR}/denylist.json`, 'utf8')) : {};
const delivered = new Set((process.env.DELIVERED || '').split(',').filter(Boolean).flatMap((f) => { const r = parse(readFileSync(f, 'utf8')); const h = r.shift(); const i = h.indexOf('Website'); return i < 0 ? [] : r.map((x) => dom(x[i])); }));
const rows = parse(readFileSync(`${DIR}/${RUN}_LEADS_full.csv`, 'utf8')); const head = rows.shift();
const R = rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
const PREF = /supplement|skincare|beauty|cosmetic|\bpet|home|kitchen|garden|outdoor|office|stationery|household|food|beverage|baby|kids|health|wellness/i;
const CAPC = /apparel|fashion|clothing|footwear|shoes|jewel|watch|alcohol|wine|beer|spirits|brewery|medical|pharma|dental/i;
const GENERIC_MAIL = /^(info|support|hello|contact|help|customerservice|customer-service|service|sales|orders|shop|team|care|hi|wholesale|press|privacy|legal|returns|billing|marketing|media|admin|customercare|clientservice|customersupport|cs|ask|success)@/i;
const num = (v) => Number(String(v ?? '').replace(/[^0-9.]/g, '')) || 0;
const searches = (r) => num(r['Amazon branded searches/mo']), visits = (r) => num((r['Estimated Traffic/Sales'] || '').match(/~([\d,]+) visits/)?.[1]);
const score = (r) => { let s = 0; if (PREF.test(r.Category)) s += 30; if (CAPC.test(r.Category)) s -= 10; if (/Other/.test(r.Category)) s -= 5;
  const sv = searches(r); s += sv >= 5000 ? 25 : sv >= 1000 ? 15 : 0; const vv = visits(r); s += vv >= 100000 ? 15 : vv >= 50000 ? 10 : vv >= 20000 ? 5 : 0;
  if (r.Email && !GENERIC_MAIL.test(r.Email)) s += 15; else if (r.Email) s += 8; if (r.Phone) s += 5; if (r.LinkedIn) s += 4; if (r['Decision Maker'] && !/TBD/i.test(r['Decision Maker'])) s += 10;
  if (/resellers/i.test(r['Amazon Presence Status'])) s += 5; return s; };
let pool = R.filter((r) => { const d = dom(r.Website); return !deny[d] && !delivered.has(d) && (!REQ || r.Email || r.Phone) && searches(r) >= MIN_S && visits(r) >= MIN_V; }).sort((a, b) => score(b) - score(a));
const unc = pool.filter((r) => !CAPC.test(r.Category)), cap = pool.filter((r) => CAPC.test(r.Category));
let pick; if (N > 0) { const maxCap = Math.floor(N * CAP); pick = [...unc.slice(0, N - Math.min(maxCap, cap.length)), ...cap.slice(0, maxCap)].slice(0, N); } else { const maxCap = Math.floor((unc.length / (1 - CAP)) * CAP); pick = [...unc, ...cap.slice(0, maxCap)]; }
pick.sort((a, b) => score(b) - score(a));
const out = [head.map(esc).join(',')].concat(pick.map((r) => head.map((h) => esc(r[h])).join(',')));
writeFileSync(`${DIR}/${RUN}_SELECT.csv`, out.join('\n'));
const cat = {}; for (const r of pick) cat[r.Category] = (cat[r.Category] || 0) + 1;
console.error(`${RUN}: pool ${pool.length} (denied ${R.length - pool.length}) -> selected ${pick.length}; capped-category share ${(100 * pick.filter((r) => CAPC.test(r.Category)).length / (pick.length || 1)).toFixed(0)}%`);
console.error(`  email ${pick.filter((r) => r.Email).length} | non-generic email ${pick.filter((r) => r.Email && !GENERIC_MAIL.test(r.Email)).length} | phone ${pick.filter((r) => r.Phone).length} | linkedin ${pick.filter((r) => r.LinkedIn).length}`);
console.error('  ' + Object.entries(cat).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`).join(' | '));
