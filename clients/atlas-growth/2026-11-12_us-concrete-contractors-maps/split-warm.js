#!/usr/bin/env node
/* split-warm.js — operator decision 2026-11-12: tag every row with its state; only the 18 warm states continue.
 * Input : leads_clean_qualified_infootprint.csv (after qualify + the foreign-pin geo gate, --keep-domestic)
 *         keyword_candidates.csv (+ kw/ geo-gated copy when pipeline.sh geo produced it) is split the same way.
 * Output: leads_warm.csv (+ state column) · leads_held_other_states.csv (non-warm + unknown state, NOT fetched/classified)
 *         split_report.json (counts, held by state, unknown-state counts, resolution source)
 * State: parsed from `city` ("City, ST"), else the last ", ST 12345" token of full_address, else the ZIP's first 3 digits
 *        against nothing (left unknown and held).
 */
const fs = require('fs');
const ENG = '../../../skills/google-maps-scrape/';
const { csv } = require(ENG + 'build-plusvibe.js');
const WARM = new Set('FL TX AZ CA GA NV NC SC TN AL LA MS OK AR NM HI UT VA'.split(' '));
const US = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const stateOf = r => {
  let m = String(r.city || '').match(/,\s*([A-Z]{2})\s*$/); if (m && US.has(m[1])) return [m[1], 'city'];
  m = String(r.full_address || '').match(/,\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?\s*(?:,\s*(?:USA|US|United States))?\s*$/); if (m && US.has(m[1])) return [m[1], 'address'];
  m = String(r.full_address || '').match(/\b([A-Z]{2})\s+\d{5}\b/); if (m && US.has(m[1])) return [m[1], 'address_any'];
  return ['', 'unknown'];
};
// Rows with no city / address (service-area listings) carry only lat/lng: take the state of the NEAREST row that has a
// parsed state (reference = every merged Maps row, maps/leads_clean.csv), within MAX_KM; else unknown (held).
const MAX_KM = 30, CELL = 0.25, grid = new Map();
for (const r of csv('maps/leads_clean.csv')) { const [st] = stateOf(r); const la = +r.latitude, lo = +r.longitude; if (!st || !isFinite(la) || !isFinite(lo)) continue; const k = Math.floor(la / CELL) + ',' + Math.floor(lo / CELL); (grid.get(k) || grid.set(k, []).get(k)).push([la, lo, st]); }
const hav = (a, b, c, d) => { const R = 6371, p = Math.PI / 180, x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
function nearestState(r) {
  const la = +r.latitude, lo = +r.longitude; if (!isFinite(la) || !isFinite(lo) || !r.latitude) return '';
  const ci = Math.floor(la / CELL), cj = Math.floor(lo / CELL); let best = 1e9, bs = '';
  for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) for (const [a, b, st] of grid.get((ci + di) + ',' + (cj + dj)) || []) { const d = hav(la, lo, a, b); if (d < best) { best = d; bs = st; } }
  return best <= MAX_KM ? bs : '';
}
function split(inFile, outWarm, outHeld, label) {
  if (!fs.existsSync(inFile)) return null;
  const rows = csv(inFile); if (!rows.length) return null;
  const H = [...Object.keys(rows[0]).filter(h => h !== 'state'), 'state'];
  const w = (f, rs) => fs.writeFileSync(f, [H.join(',')].concat(rs.map(r => H.map(h => esc(r[h])).join(','))).join('\n') + '\n');
  const warm = [], held = [], src = {}, heldBy = {};
  for (const r of rows) { let [st, how] = stateOf(r); if (!st) { st = nearestState(r); how = st ? 'nearest_listed_neighbor_30km' : 'unknown'; } r.state = st; src[how] = (src[how] || 0) + 1; if (WARM.has(st)) warm.push(r); else { held.push(r); const k = st || 'UNKNOWN'; heldBy[k] = (heldBy[k] || 0) + 1; } }
  w(outWarm, warm); w(outHeld, held);
  return { label, input: rows.length, warm: warm.length, held: held.length, state_source: src, held_by_state: Object.fromEntries(Object.entries(heldBy).sort((a, b) => b[1] - a[1])) };
}
const rep = [];
rep.push(split('leads_clean_qualified_infootprint.csv', 'leads_warm.csv', 'leads_held_other_states.csv', 'qualified'));
rep.push(split('keyword_candidates_infootprint.csv', 'keyword_candidates_warm.csv', 'keyword_candidates_held_other_states.csv', 'keyword_candidates'));
fs.writeFileSync('split_report.json', JSON.stringify(rep.filter(Boolean), null, 2)); console.log(JSON.stringify(rep.filter(Boolean), null, 1));
