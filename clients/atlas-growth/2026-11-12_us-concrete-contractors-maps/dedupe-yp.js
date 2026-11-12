#!/usr/bin/env node
/* dedupe-yp.js — operator 2026-11-12: dedupe the Maps warm set against the Yellow Pages probe (2026-11-11) by root domain +
 * phone (YP rows have no place_id), AFTER collapse-domains, and carry the probe's verdict/owner/email forward instead of
 * re-reading those businesses.
 * Probe universe = every classified probe lead (t1 leads_classified.csv 402 + t2/leads_classified.csv 480) + the 200 IN leads.
 * Rule: a root-domain match removes every row of that domain from the work set; a phone-only match removes that row unless it is
 * its domain's representative (then it stays, flagged phone_overlap_kept, so its siblings keep a representative).
 * Out: leads_annotated_work.csv, leads_domains_work.csv, leads_nowebsite_work.csv (work set) · yp_overlap.csv (carried-forward data)
 *      · yp_overlap_report.json
 */
const fs = require('fs');
const ENG = '../../../skills/google-maps-scrape/', P = '../2026-11-11_us-concrete-contractors-yp/';
const { csv } = require(ENG + 'build-plusvibe.js'); const { rootDomain, hostOf } = require(ENG + 'shared-hosts.js');
const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const wr = (f, H, rs) => fs.writeFileSync(f, [H.join(',')].concat(rs.map(r => H.map(h => esc(r[h])).join(','))).join('\n') + '\n');
const dig = p => String(p || '').replace(/\D/g, '').slice(-10);
const dom = u => { try { const h = hostOf(u); return h ? rootDomain(h) : ''; } catch { return ''; } };
// probe universe
const probe = [];
for (const [f, t] of [[P + 'leads_classified.csv', '1'], [P + 't2/leads_classified.csv', '2']]) for (const r of csv(f)) probe.push({ ypid: r.ypid, name: r.name, tranche: t, root: r.root_domain || dom(r.website), phone: dig(r.phone_number), type: r.business_type });
const IN = new Set(csv(P + 'leads_icp_all.csv').map(r => r.ypid));
const contacts = new Map(); try { for (const l of fs.readFileSync(P + 'owner/contacts_final.jsonl', 'utf8').split('\n').filter(Boolean)) { const d = JSON.parse(l); contacts.set(d.place_id.replace(/^yp_/, ''), d); } } catch { }
const q1 = new Map(); try { for (const r of csv(P + 'verify/queue.csv')) q1.set(r.place_id.replace(/^yp_/, ''), r.Email); } catch { }
const byDom = new Map(), byPhone = new Map();
for (const p of probe) { if (p.root) byDom.set(p.root, p); if (p.phone) byPhone.set(p.phone, p); }
const ann = csv('leads_annotated.csv'), doms = csv('leads_domains.csv'), nowb = csv('leads_nowebsite.csv');
const repIds = new Set(doms.map(r => r.place_id));
const hit = new Map(), domHit = new Set();
for (const r of [...ann]) { const d = r.root_domain, ph = dig(r.phone_number); const pd = d && byDom.get(d), pp = ph && byPhone.get(ph); if (pd) { hit.set(r.place_id, { p: pd, by: 'root_domain' }); domHit.add(d); } else if (pp) hit.set(r.place_id, { p: pp, by: 'phone' }); }
const drop = new Set(), kept = [];
for (const r of ann) { const h = hit.get(r.place_id); if (!h && !(r.root_domain && domHit.has(r.root_domain))) continue; if (r.root_domain && domHit.has(r.root_domain)) drop.add(r.place_id); else if (repIds.has(r.place_id)) kept.push(r.place_id); else drop.add(r.place_id); }
const nowbHit = nowb.filter(r => byPhone.has(dig(r.phone_number)) && !hit.has(r.place_id));
const nowbDrop = new Set(nowb.filter(r => byPhone.has(dig(r.phone_number))).map(r => r.place_id));
const ovl = []; for (const r of ann) { const h = hit.get(r.place_id) || (r.root_domain && domHit.has(r.root_domain) ? { p: byDom.get(r.root_domain), by: 'root_domain(sibling)' } : null); if (!h) continue; const p = h.p, c = contacts.get(p.ypid);
  ovl.push({ place_id: r.place_id, name: r.name, state: r.state, root_domain: r.root_domain, phone_number: r.phone_number, matched_by: h.by, removed_from_work_set: drop.has(r.place_id) ? 'yes' : 'no_phone_overlap_kept', probe_ypid: p.ypid, probe_name: p.name, probe_tranche: p.tranche, probe_business_type: p.type, probe_IN: IN.has(p.ypid) ? 'yes' : '', probe_owner: c ? c.primary_name : '', probe_rank1_email: q1.get(p.ypid) || '' }); }
wr('yp_overlap.csv', Object.keys(ovl[0] || { place_id: 1 }), ovl);
const H1 = Object.keys(ann[0]); wr('leads_annotated_work.csv', H1, ann.filter(r => !drop.has(r.place_id)));
wr('leads_domains_work.csv', Object.keys(doms[0]), doms.filter(r => !drop.has(r.place_id)));
wr('leads_nowebsite_work.csv', Object.keys(nowb[0]), nowb.filter(r => !nowbDrop.has(r.place_id)));
const rep = { probe_universe: probe.length, probe_IN: IN.size, maps_rows_in_annotated: ann.length, overlap_rows: ovl.length, by: ovl.reduce((a, o) => (a[o.matched_by] = (a[o.matched_by] || 0) + 1, a), {}), removed_from_work_set: drop.size, kept_phone_overlap_reps: kept.length, overlap_with_probe_IN: ovl.filter(o => o.probe_IN).length, overlap_verdict_split: ovl.reduce((a, o) => (a[o.probe_business_type] = (a[o.probe_business_type] || 0) + 1, a), {}), nowebsite_rows_phone_overlap_removed: nowbDrop.size, work_set_rows: ann.length - drop.size, work_set_domains: doms.length - [...drop].filter(id => repIds.has(id)).length };
fs.writeFileSync('yp_overlap_report.json', JSON.stringify(rep, null, 2)); console.log(JSON.stringify(rep, null, 2));
