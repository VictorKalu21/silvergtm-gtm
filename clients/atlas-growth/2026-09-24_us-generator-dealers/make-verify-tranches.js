#!/usr/bin/env node
/* make-verify-tranches.js — split the rank-1 email candidates into verification tranches so the operator
 * can verify "lil by lil" (2026-09-25: first 3k, dealer lists specifically; the rest is banked).
 * Order: dealer-list leads first (brands non-empty), then Maps-only. Within each: address built from the
 * named contact's name > named lead on a company mailbox > unnamed; then OEM tier (Elite/PowerPro/Premier/
 * Platinum/Titanium > other listed tiers), then brand_count. Stable and deterministic: re-running after new
 * candidates never reshuffles an already-written tranche (existing tranche files are kept, new rows append).
 *   node make-verify-tranches.js [--size 3000]
 * Writes owner/verify/queue.csv (every rank-1 row with its tranche) and owner/verify/tranche_NN.csv (Email column
 * first, for verify-millionverifier-bounceban.js).
 */
const fs = require('fs'), path = require('path');
const { csv } = require('../../../skills/google-maps-scrape/build-plusvibe.js');
const SIZE = +(process.argv[process.argv.indexOf('--size') + 1] || 3000) || 3000;
const DIR = 'owner/verify'; fs.mkdirSync(DIR, { recursive: true });
const L = new Map(csv('leads_icp.csv').map(r => [r.place_id, r]));
const TOP = /elite|power ?pro|premier|platinum|titanium|gold|installer/i;
const rows = csv('owner/emails_candidates.csv').filter(r => r.rank === '1').map(r => {
  const l = L.get(r.place_id) || {};
  const dealer = !!(l.brands || '').trim();
  const who = r.email_kind === 'personal' ? 0 : r.contact_name ? 1 : 0;
  return { ...r, dealer, brands: l.brands || '', brand_tiers: l.brand_tiers || '', city: l.city || '', phone: l.phone_number || '', website: l.website || '',
    k: [dealer ? 0 : 1, r.email_kind === 'personal' ? 0 : 1, 0, TOP.test(l.brand_tiers || '') ? 0 : 1, -(+l.brand_count || 0)] };
});
// named-on-company-mailbox beats unnamed: needs contacts_final
const named = new Set(fs.readFileSync('owner/contacts_final.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l).place_id));
for (const r of rows) { r.named = named.has(r.place_id); r.k[2] = r.named ? 0 : 1; }
// keep already-assigned tranches fixed
const QF = path.join(DIR, 'queue.csv'), prev = fs.existsSync(QF) ? new Map(csv(QF).map(r => [r.place_id, +r.tranche])) : new Map();
const cmp = (a, b) => { for (let i = 0; i < a.k.length; i++) if (a.k[i] !== b.k[i]) return a.k[i] - b.k[i]; return a.place_id < b.place_id ? -1 : 1; };
const fresh = rows.filter(r => !prev.has(r.place_id)).sort(cmp);
const counts = {}; for (const t of prev.values()) counts[t] = (counts[t] || 0) + 1;
let t = Math.max(1, ...prev.values());
for (const r of fresh) { while ((counts[t] || 0) >= SIZE) t++; r.tranche = t; counts[t] = (counts[t] || 0) + 1; }
for (const r of rows) if (prev.has(r.place_id)) r.tranche = prev.get(r.place_id);
rows.sort((a, b) => a.tranche - b.tranche || cmp(a, b));
const esc = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
const H = ['tranche', 'place_id', 'business_name', 'city', 'state', 'email', 'email_kind', 'contact_name', 'contact_role', 'named', 'found_by', 'dealer', 'brands', 'brand_tiers', 'website', 'phone'];
fs.writeFileSync(QF, [H.join(',')].concat(rows.map(r => H.map(h => esc(r[h])).join(','))).join('\n') + '\n');
const TH = ['Email', ...H.filter(h => h !== 'email')], sum = {};
for (const n of [...new Set(rows.map(r => r.tranche))]) {
  const f = path.join(DIR, `tranche_${String(n).padStart(2, '0')}.csv`), part = rows.filter(r => r.tranche === n);
  fs.writeFileSync(f, [TH.join(',')].concat(part.map(r => TH.map(h => esc(h === 'Email' ? r.email : r[h])).join(','))).join('\n') + '\n');
  sum[n] = { rows: part.length, dealer: part.filter(r => r.dealer).length, personal: part.filter(r => r.email_kind === 'personal').length, named: part.filter(r => r.named).length };
}
fs.writeFileSync(path.join(DIR, 'tranches_summary.json'), JSON.stringify(sum, null, 2));
console.log(JSON.stringify(sum));
