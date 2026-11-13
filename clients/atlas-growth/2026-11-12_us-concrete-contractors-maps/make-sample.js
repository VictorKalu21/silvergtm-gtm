// seeded random sample (mulberry32, seed 20261113) of exactly 1,000 rows of verify/queue.csv -> verify/sample_1000.csv + verify/queue_remaining.csv
const fs = require('fs'); const { csv } = require('../../../skills/google-maps-scrape/build-plusvibe.js');
const rows = csv('verify/queue.csv'); const H = Object.keys(rows[0]);
const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
let a = 20261113 >>> 0; const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const idx = rows.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
const pick = new Set(idx.slice(0, 1000)); const w = (f, rs) => fs.writeFileSync(f, [H.join(',')].concat(rs.map(r => H.map(h => esc(r[h])).join(','))).join('\n') + '\n');
w('verify/sample_1000.csv', rows.filter((_, i) => pick.has(i))); w('verify/queue_remaining.csv', rows.filter((_, i) => !pick.has(i)));
console.log(JSON.stringify({ queue: rows.length, sample: pick.size, remaining: rows.length - pick.size }));
