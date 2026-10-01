#!/usr/bin/env node
/* geocode-fixture.js — Nominatim reverse geocode for every blank-city row, through the container's HTTPS
 * proxy via curl (Node 22's global fetch ignores HTTPS_PROXY here: 3-call probe 2026-09-30 → 429 direct,
 * 200 via curl). Writes owner/geocode_fixture.json keyed by place_id in the exact shape
 * `build-plusvibe.js city-fallback --geocode-fixture` reads, so the engine runs offline on it. Resumable;
 * 1 request / 1.2 s (Nominatim policy); a 429/5xx is retried once after 5 s.
 *   node geocode-fixture.js owner/city_probe_leads_icp_send.csv [more probe csvs...]
 */
const fs = require('fs'), { execFileSync } = require('child_process');
const { csv } = require('../../../skills/google-maps-scrape/build-plusvibe.js');
const OUT = 'owner/geocode_fixture.json', UA = 'silvergtm-gtm city-fallback (gtm@audacityinvestments.com)';
const fx = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = (lat, lon) => { const o = execFileSync('curl', ['-sS', '-m', '25', '-A', UA, '-w', '\n%{http_code}', `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&lat=${lat}&lon=${lon}`], { encoding: 'utf8' }); const i = o.lastIndexOf('\n'); return { code: o.slice(i + 1).trim(), body: o.slice(0, i) }; };
(async () => {
  const rep = { need: 0, done_before: 0, ok: 0, fail: 0 };
  for (const f of process.argv.slice(2)) for (const r of csv(f)) {
    if (String(r.city || '').trim() || !r.latitude || !r.longitude) continue; rep.need++;
    if (fx[r.place_id]) { rep.done_before++; continue; }
    let res = get(r.latitude, r.longitude);
    if (res.code !== '200') { await sleep(5000); res = get(r.latitude, r.longitude); }
    if (res.code === '200') { try { fx[r.place_id] = JSON.parse(res.body); rep.ok++; } catch (e) { rep.fail++; } } else { rep.fail++; console.error(`${r.place_id} HTTP ${res.code}`); }
    fs.writeFileSync(OUT, JSON.stringify(fx));
    await sleep(1200);
  }
  console.log(JSON.stringify(rep));
})();
