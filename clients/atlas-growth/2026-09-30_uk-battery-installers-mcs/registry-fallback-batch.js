#!/usr/bin/env node
/* registry-fallback-batch.js — job-side personalisation for leads with NO site text (the B held registry-only rows):
 * instead of the config's single fallback ("solar and battery storage" for everyone), derive business_type from the
 * MCS register's own `technologies` field + the trading name, and write a batch-N-out.json that `fill` reads like
 * any Haiku batch. Deterministic, no model. Same five allowed values as personalize-config-battery-uk.json.
 *   node registry-fallback-batch.js --leads <leads.csv> --dir <personalize dir> --n <batch number>
 */
const fs = require('fs'), path = require('path');
const { csv } = require('../../../skills/google-maps-scrape/build-plusvibe.js');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const L = new Map(csv(arg('leads')).map(r => [r.place_id, r]));
const dir = arg('dir'), ids = JSON.parse(fs.readFileSync(path.join(dir, 'no_site_text.json'), 'utf8'));
const MAP = { 'solar and battery storage': 'solar and battery', 'home battery storage': 'battery', 'solar pv': 'solar', 'heat pumps and solar': 'heat pump and solar', 'renewable energy installs': 'install' };
const out = {}, mix = {};
for (const pid of ids) {
  const r = L.get(pid); if (!r) continue;
  const t = (r.technologies || '').toLowerCase(), name = (r.name || '').toLowerCase();
  let bt;
  if (/heat ?pump|renewable heat|\bashp\b/.test(name)) bt = 'heat pumps and solar';
  else if (/\brenewable|green energy|eco energy|energy solutions/.test(name) && t.includes('ashp')) bt = 'renewable energy installs';
  else if (!t.includes('solar pv')) bt = 'home battery storage';
  else bt = 'solar and battery storage';
  out[pid] = { business_type: bt, inspection_type: 'home energy surveys', inspection_singular: 'home energy survey', project_type: MAP[bt], city: r.city || '', evidence: 'MCS register technologies: ' + (r.technologies || '') };
  mix[bt] = (mix[bt] || 0) + 1;
}
fs.writeFileSync(path.join(dir, 'batches', `batch-${arg('n')}-out.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ rows: Object.keys(out).length, mix }));
