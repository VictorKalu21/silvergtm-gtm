#!/usr/bin/env node
/* pull-mcs.js :: pull the MCS "Find an Installer" register (battery-certified) via the page's own hidden
 * JSON API (web-scrape-triage Tier 1). Keyless: the nonce is read from the public page each run.
 *   GET https://mcscertified.com/wp-admin/admin-ajax.php?action=filter_installers&nonce=<nonce>
 *       &form_type=installers&technology[]=technology_battery&page=N          (12 rows/page, 233 pages)
 * Probe 2026-09-30 (pasted in RUN-NOTES.md): page 1 -> HTTP 200, success:true, pagination.total_count 2794,
 * 12/12 email, 11/12 website, 12/12 postcode. Resumable: pages already in mcs_raw.jsonl are skipped.
 * Output: mcs_raw.jsonl (one installer per line, raw fields) + mcs_leads.csv (engine lead shape, see below).
 *   node pull-mcs.js [--delay-ms 600] [--max-pages N]
 */
const fs = require('fs'), path = require('path');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const DELAY = +arg('delay-ms', 600), MAXP = +arg('max-pages', 0);
const RUN = __dirname, RAW = path.join(RUN, 'mcs_raw.jsonl'), CSV = path.join(RUN, 'mcs_leads.csv');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function nonce() {
  const html = await (await fetch('https://mcscertified.com/find-an-installer/', { headers: { 'User-Agent': UA } })).text();
  const m = html.match(/var mcsAjax = \{[^}]*"nonce":"([a-f0-9]+)"/); if (!m) throw new Error('nonce not found on page');
  return m[1];
}
async function page(n, N) {
  const url = `https://mcscertified.com/wp-admin/admin-ajax.php?action=filter_installers&nonce=${N}&form_type=installers&technology%5B%5D=technology_battery&page=${n}`;
  for (let a = 1; a <= 4; a++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Referer': 'https://mcscertified.com/find-an-installer/', 'X-Requested-With': 'XMLHttpRequest' } });
      if (r.status !== 200) throw new Error('HTTP ' + r.status);
      const j = await r.json(); if (!j.success) throw new Error('success:false');
      return j.data;
    } catch (e) { if (a === 4) throw e; await sleep(2000 * a); }
  }
}
(async () => {
  const done = new Set();
  if (fs.existsSync(RAW)) for (const l of fs.readFileSync(RAW, 'utf8').split('\n')) if (l.trim()) done.add(JSON.parse(l)._page);
  const N = await nonce();
  const first = await page(1, N); const total = first.pagination.total_pages, count = first.pagination.total_count;
  console.log(`nonce ${N} | pages ${total} | installers ${count} | already pulled pages: ${done.size}`);
  const last = MAXP ? Math.min(MAXP, total) : total;
  let calls = 1, rows = 0;
  const write = (p, d) => { fs.appendFileSync(RAW, d.data.map(r => JSON.stringify({ _page: p, ...r })).join('\n') + '\n'); rows += d.data.length; };
  if (!done.has(1)) write(1, first);
  for (let p = 2; p <= last; p++) {
    if (done.has(p)) continue;
    await sleep(DELAY); const d = await page(p, N); calls++; write(p, d);
    if (p % 20 === 0) console.log(`. page ${p}/${last} rows so far ${rows} calls ${calls}`);
  }
  // normalise -> engine lead shape (README ingest columns) + MCS fields
  const seen = new Map();
  for (const l of fs.readFileSync(RAW, 'utf8').split('\n')) if (l.trim()) { const r = JSON.parse(l); seen.set(r.installer_id, r); }
  const techs = r => Object.keys(r).filter(k => k.startsWith('technology_') && r[k] === '1').map(k => k.replace('technology_', '').replace(/_/g, ' '));
  const regions = r => Object.keys(r).filter(k => k.startsWith('region_') && r[k] === '1').length;
  const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const H = ['place_id', 'business_id', 'name', 'icp_type', 'google_types', 'full_address', 'city', 'zip', 'neighborhood', 'latitude', 'longitude', 'website', 'phone_number', 'email', 'rating', 'review_count', 'is_claimed', 'verified', 'hours', 'place_link',
    'certification_number', 'certification_body', 'technologies', 'tech_solar_pv', 'tech_battery', 'tech_ashp', 'regions_served'];
  const out = [H.join(',')];
  for (const r of seen.values()) {
    const addr = [r.address_line_1, r.address_line_2, r.address_line_3, r.county, r.postcode, 'United Kingdom'].filter(x => x && x.trim()).join(', ');
    const city = (r.address_line_3 || r.address_line_2 || r.county || '').trim();
    out.push([`mcs:${r.installer_id}`, `mcs:${r.installer_id}`, r.name, 'battery', ['MCS battery installer', ...techs(r).map(t => 'MCS ' + t)].join('|'), addr, city, r.postcode, '', r.lat, r.lng,
      r.website || '', r.telephone || '', r.email || '', '', '', 'true', 'true', '', `https://mcscertified.com/find-an-installer/?installer=${r.installer_id}`,
      r.certification_number, r.certification_body, techs(r).join('|'), r.technology_solar_pv, r.technology_battery, r.technology_ashp, regions(r)].map(esc).join(','));
  }
  fs.writeFileSync(CSV, out.join('\n') + '\n');
  const all = [...seen.values()];
  console.log(`DONE calls ${calls} | unique installers ${all.length} of ${count} | email ${all.filter(r => r.email).length} | website ${all.filter(r => r.website).length} | postcode ${all.filter(r => r.postcode).length} | battery+solar ${all.filter(r => r.technology_solar_pv === '1').length} | battery+heat pump ${all.filter(r => r.technology_ashp === '1').length}`);
  console.log(`-> ${CSV}`);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
