#!/usr/bin/env node
/* to-emails-final.js — job-side bridge: verifier output (<stem>_full.csv from
 * skills/email-verify-debounce-bounceban/scripts/verify-millionverifier-bounceban.js) → owner/emails_final.csv
 * in the shape build-plusvibe.js `base` reads: place_id, email, verdict, email_kind, found_by, contact_name.
 *
 *   node verify/to-emails-final.js --full verify/out/input_2k_full.csv --qualified deliverable/restoration_qualified.csv --out owner/emails_final.csv
 *
 * One verified address can cover several Qualified rows (siblings share a domain mailbox): the address is
 * fanned to every Qualified row that carries it, so each lead gets its own emails_final row.
 * email_kind: personal when the local part is not a role mailbox AND the lead has a named owner whose name
 * the local part is built from (build-plusvibe re-checks this with its own name rule — this is a hint only),
 * company otherwise. found_by = site (the on-site harvest, STEP 6 fetch-sites + email-rank).
 */
const fs = require('fs');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const FULL = arg('full'), Q = arg('qualified'), OUT = arg('out');
if (!FULL || !Q || !OUT) { console.error('usage: --full <verifier _full.csv> --qualified <restoration_qualified.csv> --out <emails_final.csv>'); process.exit(1); }
function parseCsv(t) { const rows = []; let row = [], cur = '', q = false; for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; } else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (ch !== '\r') cur += ch; } if (cur || row.length) { row.push(cur); rows.push(row); } return rows; }
function table(f) { const R = parseCsv(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); const H = R[0]; return R.slice(1).filter(r => r.length === H.length).map(r => Object.fromEntries(H.map((h, i) => [h, r[i]]))); }
const ROLE = /^(info|office|contact|contactus|sales|admin|hello|hi|support|service|services|estimates?|quotes?|inquiry|inquiries|customerservice|customercare|help|team|mail|email|scheduling|schedule|dispatch|accounting|accounts|billing|marketing|jobs|careers|hr|frontdesk|reception|general|main|owner|president|manager|webmaster|noreply|no-reply|leads?|projects?|newsletter)$/i;
const letters = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
function kindFor(email, ownerName) {
  const local = String(email).split('@')[0].toLowerCase();
  if (ROLE.test(local)) return 'company';
  const parts = String(ownerName || '').trim().split(/\s+/); if (parts.length < 2) return 'company';
  const f = letters(parts[0]), l = letters(parts[parts.length - 1]), L = letters(local);
  if (f.length < 2 || l.length < 2) return 'company';
  return ([f, f + l, f[0] + l, f + l[0], l, l + f, l + f[0]].includes(L) || (L.startsWith(f) && L.includes(l))) ? 'personal' : 'company';
}
const full = table(FULL), qual = table(Q);
const verdictOf = new Map(); for (const r of full) if (r.Email) verdictOf.set(r.Email.trim().toLowerCase(), { verdict: r.verify_verdict || '', detail: r.verify_detail || '' });
const esc = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
const out = ['place_id,email,verdict,verify_detail,email_kind,found_by,contact_name,business_name'];
const rep = { verified_addresses: verdictOf.size, qualified_rows_with_email: 0, rows_written: 0, sendable_rows: 0, by_verdict: {}, by_kind: {} };
for (const r of qual) {
  const e = (r.email || '').trim().toLowerCase(); if (!e) continue; rep.qualified_rows_with_email++;
  const v = verdictOf.get(e); if (!v) continue;
  const kind = kindFor(e, r.owner_name);
  out.push([r.place_id, e, v.verdict, v.detail, kind, 'site', kind === 'personal' ? r.owner_name : '', r.company_name].map(esc).join(','));
  rep.rows_written++; rep.by_verdict[v.verdict] = (rep.by_verdict[v.verdict] || 0) + 1; if (v.verdict === 'sendable') { rep.sendable_rows++; rep.by_kind[kind] = (rep.by_kind[kind] || 0) + 1; }
}
fs.writeFileSync(OUT, out.join('\n') + '\n');
console.log(JSON.stringify(rep));
