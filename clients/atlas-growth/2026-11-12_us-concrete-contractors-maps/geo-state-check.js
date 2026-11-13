// geo-state-check.js — does each fallback-filled city fall inside the lead's state? Re-queries Nominatim (same generic UA, 1 req/s) for the
// filled rows only and compares address.state with the lead's state. Writes upload/city_state_check.json (place_id -> {lead_state, geo_state, match}).
const fs = require('fs'); const { csv } = require('../../../skills/google-maps-scrape/build-plusvibe.js');
const NAMES = { AL: 'Alabama', AR: 'Arkansas', AZ: 'Arizona', CA: 'California', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', LA: 'Louisiana', MS: 'Mississippi', NC: 'North Carolina', NM: 'New Mexico', NV: 'Nevada', OK: 'Oklahoma', SC: 'South Carolina', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VA: 'Virginia' };
const ovr = JSON.parse(fs.readFileSync('upload/city_overrides.json', 'utf8')); const L = new Map(csv('leads_in_domains.csv').map(r => [r.place_id, r]));
(async () => { const out = {}; let n = 0;
  for (const id of Object.keys(ovr)) { if (!ovr[id]) continue; const l = L.get(id); await new Promise(r => setTimeout(r, 1100));
    try { const r = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&lat=' + l.latitude + '&lon=' + l.longitude, { headers: { 'User-Agent': 'geocode-lookup/1.0', Accept: 'application/json' } }); const j = await r.json(); const gs = (j.address || {}).state || ''; out[id] = { lead_state: l.state, geo_state: gs, match: gs === NAMES[l.state] }; } catch (e) { out[id] = { lead_state: l.state, geo_state: '', match: null }; } n++; }
  fs.writeFileSync('upload/city_state_check.json', JSON.stringify(out)); const v = Object.values(out);
  console.log(JSON.stringify({ checked: n, match: v.filter(x => x.match === true).length, mismatch: v.filter(x => x.match === false).length, unknown: v.filter(x => x.match === null).length })); })();
