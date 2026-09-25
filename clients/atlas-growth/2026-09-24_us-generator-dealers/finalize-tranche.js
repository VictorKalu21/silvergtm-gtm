#!/usr/bin/env node
/* finalize-tranche.js — after verify-millionverifier-bounceban.js has run on owner/verify/tranche_NN.csv:
 *   node finalize-tranche.js NN fallback  -> owner/verify/tranche_NNb.csv: for each lead whose rank-1 address was
 *                                          dropped, its next-ranked candidates (from emails_candidates.csv)
 *   node finalize-tranche.js NN final     -> upsert the tranche's verified rows (NN and NNb) into owner/emails_final.csv
 *                                          (one row per verified address; build-plusvibe base picks one per lead)
 */
const fs = require('fs');
const { csv } = require('../../../skills/google-maps-scrape/build-plusvibe.js');
const [NN, cmd] = process.argv.slice(2); const T = String(NN).padStart(2, '0');
const esc = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
const full = f => fs.existsSync(f) ? csv(f) : [];
const A = full(`owner/verify/t${T}/tranche_${T}_full.csv`), B = full(`owner/verify/t${T}b/tranche_${T}b_full.csv`);
if (!A.length) { console.error('no verify output for tranche ' + T); process.exit(1); }
const cands = csv('owner/emails_candidates.csv');
if (cmd === 'fallback') {
  const dropped = new Set(A.filter(r => r.verify_verdict === 'dropped').map(r => r.place_id));
  const tried = new Set(A.map(r => r.Email.toLowerCase()));
  const q = csv('owner/verify/queue.csv'), meta = new Map(q.map(r => [r.place_id, r]));
  const H = ['Email', 'tranche', 'place_id', 'business_name', 'city', 'state', 'email_kind', 'contact_name', 'contact_role', 'named', 'found_by', 'dealer', 'brands', 'brand_tiers', 'website', 'phone', 'rank'];
  const out = cands.filter(c => dropped.has(c.place_id) && c.rank !== '1' && !tried.has(c.email.toLowerCase())).map(c => {
    const m = meta.get(c.place_id) || {};
    return { ...m, Email: c.email, tranche: T + 'b', email_kind: c.email_kind, contact_name: c.contact_name, contact_role: c.contact_role, found_by: c.found_by, rank: c.rank };
  });
  fs.writeFileSync(`owner/verify/tranche_${T}b.csv`, [H.join(',')].concat(out.map(r => H.map(h => esc(r[h])).join(','))).join('\n') + '\n');
  console.log(JSON.stringify({ dropped_leads: dropped.size, fallback_addresses: out.length, fallback_leads: new Set(out.map(r => r.place_id)).size }));
} else if (cmd === 'final') {
  const F = 'owner/emails_final.csv', H = ['place_id', 'email', 'contact_name', 'email_kind', 'found_by', 'verdict', 'verify_detail', 'tranche'];
  const cur = new Map(full(F).map(r => [r.place_id + '|' + r.email, r]));
  const V = { sendable: 'sendable', risky: 'risky', dropped: 'dropped' }; const sum = { sendable: 0, risky: 0, dropped: 0 };
  for (const [rows, tag] of [[A, T], [B, T + 'b']]) for (const r of rows) {
    const v = V[r.verify_verdict] || r.verify_verdict; sum[v] = (sum[v] || 0) + 1;
    cur.set(r.place_id + '|' + r.Email.toLowerCase(), { place_id: r.place_id, email: r.Email.toLowerCase(), contact_name: r.contact_name, email_kind: r.email_kind, found_by: r.found_by, verdict: v, verify_detail: r.verify_detail, tranche: tag });
  }
  fs.writeFileSync(F, [H.join(',')].concat([...cur.values()].map(r => H.map(h => esc(r[h])).join(','))).join('\n') + '\n');
  const leads = new Set([...cur.values()].filter(r => r.verdict === 'sendable').map(r => r.place_id));
  console.log(JSON.stringify({ tranche: T, ...sum, emails_final_rows: cur.size, leads_with_sendable_total: leads.size }));
}
