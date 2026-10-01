#!/usr/bin/env node
/* split-send-hold.js — operator directive 2026-09-30: "hold 501 registry rows, to send later".
 * Splits leads_icp.csv into the first-send list (every residential-confirmed row) and the held list
 * (fit == no_website_registry_only: the register proves battery certification, no site text could be read),
 * and stages the verification input for each as a separate queue so the held rows are never verified or
 * uploaded by accident. Nothing here spends a credit; verification still needs MV/BB keys and an explicit go.
 *   node split-send-hold.js
 * Writes: leads_icp_send.csv, leads_icp_held_registry_only.csv,
 *         owner/verify/queue_send.csv (rank-1 candidate per send lead, `Email` column first — the exact
 *         input shape verify-millionverifier-bounceban.js takes), owner/verify/queue_held.csv (same, held).
 */
const fs = require('fs');
const { csv } = require('../../../skills/google-maps-scrape/build-plusvibe.js');
const HOLD = 'no_website_registry_only';
const esc = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
const write = (f, H, rows) => fs.writeFileSync(f, [H.join(',')].concat(rows.map(r => H.map(h => esc(r[h])).join(','))).join('\n') + (rows.length ? '\n' : ''));
const icp = csv('leads_icp.csv'), H = Object.keys(icp[0]);
const send = icp.filter(r => r.fit !== HOLD), held = icp.filter(r => r.fit === HOLD);
write('leads_icp_send.csv', H, send); write('leads_icp_held_registry_only.csv', H, held);
fs.mkdirSync('owner/verify', { recursive: true });
const L = new Map(icp.map(r => [r.place_id, r]));
const named = new Set(fs.readFileSync('owner/contacts_final.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l).place_id));
const rank1 = csv('owner/emails_candidates.csv').filter(r => r.rank === '1' && L.has(r.place_id)).map(r => {
  const l = L.get(r.place_id);
  return { Email: r.email, place_id: r.place_id, business_name: l.name, city: l.city, fit: l.fit, fit_segment: l.fit_segment, email_kind: r.email_kind, contact_name: r.contact_name, contact_role: r.contact_role, named: named.has(r.place_id), found_by: r.found_by, website: l.website, phone: l.phone_number, rank: r.rank };
});
// order: address built from the named contact's name > named lead on a company mailbox > unnamed; stable by place_id
const k = r => [r.email_kind === 'personal' ? 0 : 1, r.named ? 0 : 1, r.place_id];
const cmp = (a, b) => { const x = k(a), y = k(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; };
const QH = ['Email', 'place_id', 'business_name', 'city', 'fit', 'fit_segment', 'email_kind', 'contact_name', 'contact_role', 'named', 'found_by', 'website', 'phone', 'rank'];
const qs = rank1.filter(r => r.fit !== HOLD).sort(cmp), qh = rank1.filter(r => r.fit === HOLD).sort(cmp);
write('owner/verify/queue_send.csv', QH, qs); write('owner/verify/queue_held.csv', QH, qh);
const sum = q => ({ leads: q.length, personal: q.filter(r => r.email_kind === 'personal').length, named: q.filter(r => r.named).length, unique_emails: new Set(q.map(r => r.Email.toLowerCase())).size });
console.log(JSON.stringify({ icp: icp.length, send: send.length, held: held.length, send_no_email: send.length - qs.length, held_no_email: held.length - qh.length, queue_send: sum(qs), queue_held: sum(qh) }));
