#!/usr/bin/env node
/* city-clean.js — the MCS register's "city" field is the installer's own typing: 129 of 1,464 send rows are
 * ALL CAPS ("NEWCASTLE" → the email read "around NEWCASTLE" on the 3-lead test), ~60 hold a street, a
 * county, a nation or "n/a", and ~20 are comma-joined address fragments. Job-side clean before `base`:
 *   - ALL CAPS / all lower → title case (keeps "upon", "on", "of", "the", "and" lower; "St." / "St" as is)
 *   - comma-joined → the first part that is not a street/estate/number fragment
 *   - a street, estate, number, county, nation, "n/a" → BLANK (city-fallback then geocodes it from lat/lon)
 * Writes <in>_cityclean.csv (same columns) and owner/city_probe_<stem>.csv (place_id, city, business_name —
 * the base-shaped input `build-plusvibe.js city-fallback --base` reads). Nothing here is engine data.
 *   node city-clean.js leads_icp_send.csv
 */
const fs = require('fs'), path = require('path');
const { csv } = require('../../../skills/google-maps-scrape/build-plusvibe.js');
const IN = process.argv[2] || 'leads_icp_send.csv', stem = path.basename(IN, '.csv');
const esc = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
const write = (f, H, rows) => fs.writeFileSync(f, [H.join(',')].concat(rows.map(r => H.map(h => esc(r[h])).join(','))).join('\n') + '\n');
const STREET = /\b(road|rd|street|st\b(?!\.? ?[a-z])|lane|ln|avenue|ave|drive|dr|close|court|crescent|way|place|park|estate|industrial|business|farm|unit|house|mill|yard|terrace|gardens|grove|square|row|hill road|number|suite|floor|centre|center|works|wharf|quay|view|walk|rise|mews|parade|approach|broadway|hill\b(?! [a-z]))\b|\d/i;
const REGION = /^(n\/?a|none|-|uk|united kingdom|england|scotland|wales|northern ireland|great britain)$|shire$|^county\b|^(greater london|greater manchester|west midlands|tyne and wear|merseyside|west yorkshire|south yorkshire|essex|kent|surrey|sussex|west sussex|east sussex|norfolk|suffolk|devon|cornwall|somerset|dorset|hampshire|berkshire|wiltshire|cumbria|durham|northumberland|cheshire|lancashire|lincolnshire|leicestershire|rutland|herefordshire|worcestershire|shropshire|staffordshire|derbyshire|nottinghamshire|cambridgeshire|hertfordshire|bedfordshire|buckinghamshire|oxfordshire|gloucestershire|warwickshire|northamptonshire|isle of wight|highland|fife|lothian|borders|powys|gwynedd|dyfed|clwyd|gwent|mid glamorgan|south glamorgan|west glamorgan|county antrim|county down|county armagh|county tyrone|county londonderry|county fermanagh|antrim|down|armagh|tyrone|londonderry|fermanagh|neath port talbot|rhondda cynon taf|caerphilly county borough|blaenau gwent)$/i;
const LGA = /^(city|county|borough|royal borough|district|region|council) of \s*/i;
const SMALL = new Set(['upon', 'on', 'of', 'the', 'and', 'in', 'under', 'le', 'la', 'by', 'cum', 'super', 'sub', 'next', 'juxta']);
function title(s) { return s.toLowerCase().split(/(\s+|-)/).map((w, i) => (SMALL.has(w) && i > 0) ? w : w.replace(/^(['(]?)([a-z])/, (m, p, c) => p + c.toUpperCase()).replace(/^Mc([a-z])/, (m, c) => 'Mc' + c.toUpperCase())).join(''); }
function clean(raw) {
  let s = String(raw || '').replace(/\s+/g, ' ').trim().replace(/[,\s]+$/, '');
  if (!s) return { city: '', why: 'blank' };
  const parts = s.split(',').map(p => p.trim()).filter(Boolean);
  let pick = '', why = 'kept';
  for (const p of parts) { if (STREET.test(p) || REGION.test(p)) continue; pick = p; break; }
  if (!pick) return { city: '', why: parts.some(p => REGION.test(p)) && !parts.some(p => STREET.test(p)) ? 'region_blanked' : 'street_blanked' };
  if (parts.length > 1) why = "comma_first_town";
  if (LGA.test(pick)) { pick = pick.replace(LGA, ""); why += "+lga_stripped"; }
  if (pick === pick.toUpperCase() && /[A-Z]{3,}/.test(pick)) { pick = title(pick); why = why === 'kept' ? 'title_cased' : why + '+title'; }
  else if (pick === pick.toLowerCase()) { pick = title(pick); why = why === 'kept' ? 'title_cased' : why + '+title'; }
  return { city: pick, why };
}
if (require.main === module) {
  const rows = csv(IN), H = Object.keys(rows[0]), rep = {}, changed = [];
  for (const r of rows) { const { city, why } = clean(r.city); rep[why] = (rep[why] || 0) + 1; if (city !== r.city) { changed.push([r.place_id, r.city, city, why]); r.city_register = r.city; r.city = city; } }
  write(`${stem}_cityclean.csv`, H, rows);
  fs.mkdirSync('owner', { recursive: true });
  write(`owner/city_probe_${stem}.csv`, ['place_id', 'city', 'business_name', 'latitude', 'longitude'], rows.map(r => ({ place_id: r.place_id, city: r.city, business_name: r.name, latitude: r.latitude, longitude: r.longitude })));
  fs.writeFileSync(`owner/city_clean_${stem}_changes.csv`, 'place_id,city_register,city_clean,why\n' + changed.map(c => c.map(esc).join(',')).join('\n') + '\n');
  console.log(JSON.stringify({ in: IN, rows: rows.length, ...rep, changed: changed.length, blank_now: rows.filter(r => !r.city).length }));
}
module.exports = { clean, title };
