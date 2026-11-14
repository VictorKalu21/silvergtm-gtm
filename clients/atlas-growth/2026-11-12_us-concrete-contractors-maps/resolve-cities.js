// resolve-cities.js — operator rules 2026-11-14: for the 131 blank-city rows take the READER's city only if it appears in the lead's website_text
// (case-insensitive) and is not a county/parish/borough; else the held county answer; else HOLD the row. Writes the base the engine `fill` runs on.
// Out: upload/plusvibe_base_601_resolved.csv (rows with a city) · upload/plusvibe_held_blank_city.csv · upload/city_resolution.json (place_id -> source) · counts
const fs = require('fs'); const { csv } = require('../../../skills/google-maps-scrape/build-plusvibe.js');
const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const wr = (f, H, rs) => fs.writeFileSync(f, [H.join(',')].concat(rs.map(r => H.map(h => esc(r[h])).join(','))).join('\n') + '\n');
const D = 'upload/personalize2/batches', base = csv('upload/plusvibe_base_601_cityheld.csv'), H = Object.keys(base[0]);
const held = JSON.parse(fs.readFileSync('upload/city_overrides_county_held.json', 'utf8')), geo = JSON.parse(fs.readFileSync('upload/city_overrides_geocode.json', 'utf8'));
const txt = new Map(), out = new Map();
for (const f of fs.readdirSync(D)) { const m = /^batch-(\d+)-(in|out)\.json$/.exec(f); if (!m) continue; const j = JSON.parse(fs.readFileSync(D + '/' + f, 'utf8').replace(/^﻿/, '')); if (m[2] === 'in') for (const it of j) txt.set(it.place_id, it.website_text || ''); else for (const [k, v] of Object.entries(j)) out.set(k, v); }
const COUNTY = /\b(county|parish|borough)\b/i; const src = {}, rep = { blank_in_base: 0, reader_supplied: 0, accepted: 0, rejected_not_in_text: 0, rejected_county: 0, county_applied: 0, held: 0, reject_reasons_blank_reader: 0 };
const keep = [], hold = [];
for (const r of base) {
  if (r.city) { src[r.place_id] = geo[r.place_id] ? 'fallback_geocode' : 'maps'; keep.push(r); continue; }
  rep.blank_in_base++;
  let rc = String((out.get(r.place_id) || {}).city || '').replace(/\s+/g, ' ').trim().replace(/,\s*[A-Z]{2}\s*$/, '').trim();
  let chosen = '', how = '';
  if (rc) { rep.reader_supplied++; if (COUNTY.test(rc)) rep.rejected_county++; else if (!(txt.get(r.place_id) || '').toLowerCase().includes(rc.toLowerCase())) rep.rejected_not_in_text++; else { chosen = rc; how = 'reader_site'; rep.accepted++; } }
  if (!chosen && held[r.place_id]) { chosen = held[r.place_id]; how = 'fallback_county'; rep.county_applied++; }
  if (chosen) { r.city = chosen; src[r.place_id] = how; keep.push(r); } else { src[r.place_id] = 'held_blank'; hold.push(r); rep.held++; }
}
wr('upload/plusvibe_base_601_resolved.csv', H, keep); wr('upload/plusvibe_held_blank_city.csv', H, hold); fs.writeFileSync('upload/city_resolution.json', JSON.stringify(src));
console.log(JSON.stringify({ ...rep, kept_rows: keep.length })); 
