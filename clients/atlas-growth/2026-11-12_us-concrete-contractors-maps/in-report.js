// in-report.js — writes leads_in_residential_flatwork.csv and prints the stage-5 report numbers (no spend, no engine call).
const fs = require('fs'), readline = require('readline');
const { csv } = require('../../../skills/google-maps-scrape/build-plusvibe.js');
const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const dig = p => String(p || '').replace(/\D/g, '').slice(-10);
const rows = csv('leads_classified.csv'); const P = '../2026-11-11_us-concrete-contractors-yp/';
const probe = []; for (const f of [P + 'leads_classified.csv', P + 't2/leads_classified.csv']) for (const r of csv(f)) probe.push(r);
const pd = new Set(probe.map(r => r.root_domain).filter(Boolean)), pp = new Set(probe.map(r => dig(r.phone_number)).filter(Boolean));
const by = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const sortObj = o => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]));
const inn = rows.filter(r => r.business_type_final === 'residential_flatwork');
const H = Object.keys(rows[0]); fs.writeFileSync('leads_in_residential_flatwork.csv', [H.join(',')].concat(inn.map(r => H.map(h => esc(r[h])).join(','))).join('\n') + '\n');
const out = {};
out.verdicts_final = sortObj(by(rows, r => r.business_type_final)); out.verdicts_own_before_fanout = sortObj(by(rows, r => r.own_verdict));
const unc = rows.filter(r => r.business_type_final === 'unclear'); out.unclear_by_text = by(unc, r => r.had_text === 'yes' ? 'had_text' : 'no_text');
out.IN_rows = inn.length; out.IN_domains = new Set(inn.map(r => r.root_domain)).size; out.IN_multi_row_domains = Object.values(by(inn, r => r.root_domain)).filter(n => n > 1).length;
out.IN_reps_only = inn.filter(r => !r.rep_place_id_used).length;
out.IN_with_brand_family_flag = inn.filter(r => r.brand_family).length;
out.IN_by_state = sortObj(by(inn, r => r.state));
const rc = inn.map(r => r.review_count === '' ? null : +r.review_count); out.review_count = { blank: rc.filter(x => x == null).length, lt5: rc.filter(x => x != null && x < 5).length, '5_14': rc.filter(x => x != null && x >= 5 && x < 15).length, '15_49': rc.filter(x => x != null && x >= 15 && x < 50).length, '50plus': rc.filter(x => x != null && x >= 50).length };
out.confidence = by(inn, r => r.confidence || 'blank'); out.also_commercial_true = inn.filter(r => r.also_commercial === 'true').length;
out.with_phone = inn.filter(r => dig(r.phone_number).length >= 10).length;
out.overlap_with_yp_probe = { by_domain: inn.filter(r => pd.has(r.root_domain)).length, by_phone: inn.filter(r => pp.has(dig(r.phone_number))).length };
out.needs_review_evidence = by(inn, r => r.needs_review || 'ok');
out.sibling_verdict_disagree_in_IN = inn.filter(r => r.verdict_disagrees === 'yes').length;
(async () => {
  const ok = new Set(); for await (const l of readline.createInterface({ input: fs.createReadStream('owner/site_text_fanned.jsonl'), crlfDelay: Infinity })) { if (!l) continue; if (/"status":"ok"/.test(l.slice(0, 4000))) { const id = (l.match(/"place_id":"([^"]+)"/) || [])[1]; if (id) ok.add(id); } }
  out.IN_with_ok_site_text = inn.filter(r => ok.has(r.place_id)).length; out.owner_batches_if_run_at_40 = Math.ceil(inn.length / 40); out.owner_batches_if_run_at_40_domains_only = Math.ceil(out.IN_domains / 40);
  console.log(JSON.stringify(out, null, 1));
})();
