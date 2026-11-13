// joins verify/sample_1000.csv with the runner's mv.jsonl -> verify/mv_results_1000.csv; prints counts only
const fs = require('fs'); const { csv } = require('../../../skills/google-maps-scrape/build-plusvibe.js');
const rows = csv('verify/sample_1000.csv'); const mv = new Map();
for (const l of fs.readFileSync('verify/mv1000/mv.jsonl', 'utf8').split('\n').filter(Boolean)) { const d = JSON.parse(l); mv.set(d.email.toLowerCase(), d); }
const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const out = rows.map(r => { const d = mv.get(r.Email.toLowerCase()) || {}; return { ...r, mv_result: d.result || '', mv_subresult: d.subresult || '', mv_quality: d.quality || '', mv_role: d.role === true ? 'true' : d.role === false ? 'false' : '', mv_free: d.free === true ? 'true' : d.free === false ? 'false' : '', mv_error: d.error || '', mv_checked_at: d.checked_at || '' }; });
const H = Object.keys(out[0]); fs.writeFileSync('verify/mv_results_1000.csv', [H.join(',')].concat(out.map(r => H.map(h => esc(r[h])).join(','))).join('\n') + '\n');
const cnt = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const tab = (a, f) => { const g = {}; for (const r of a) { const k = f(r); (g[k] = g[k] || []).push(r); } return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, { n: v.length, ...cnt(v, r => r.mv_result) }])); };
const rep = { rows: out.length, composition: { named: cnt(out, r => r.owner_rung === 'none' ? 'unnamed' : 'named'), email_type: cnt(out, r => r.email_type), email_kind: cnt(out, r => r.email_kind), source: cnt(out, r => r.source), needs_review_rows: out.filter(r => r.needs_review).length, name_tied: out.filter(r => r.name_tied === 'yes').length },
  mv_overall: cnt(out, r => r.mv_result), by_email_type: tab(out, r => r.email_type), by_mv_role_flag: tab(out, r => 'mv_role=' + r.mv_role), by_email_kind: tab(out, r => r.email_kind), by_named: tab(out, r => r.owner_rung === 'none' ? 'unnamed' : 'named'),
  subresults_non_ok: cnt(out.filter(r => r.mv_result !== 'ok'), r => r.mv_result + '/' + r.mv_subresult), errors: out.filter(r => r.mv_result === 'error' || !r.mv_result).length };
rep.to_bounceban_catchall_plus_unknown = out.filter(r => r.mv_result === 'catch_all' || r.mv_result === 'unknown').length; rep.to_bounceban_if_error_and_invalid_also = out.filter(r => ['catch_all', 'unknown', 'error', 'invalid', ''].includes(r.mv_result)).length;
console.log(JSON.stringify(rep, null, 1));
