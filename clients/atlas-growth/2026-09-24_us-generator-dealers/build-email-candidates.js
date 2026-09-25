#!/usr/bin/env node
/* build-email-candidates.js — STEP 6e without the finder rungs (operator 2026-09-25: "no need for email
 * waterfall, we already have emails"). Per ICP lead, gather the addresses already on disk (OEM dealer-list
 * email, on-site emails from site_text.jsonl, any email a reader put on a contact), rank them with the
 * engine's email-rank.js, and tag each with the named contact whose name builds the local part (the
 * build-plusvibe name rule). Output is the pre-verification candidate set, emails_final.csv shape with a
 * blank verdict: MillionVerifier/BounceBan fill it only after an explicit operator go.
 *   node build-email-candidates.js   (paths fixed to this run folder)
 */
const fs = require('fs');
const ENG = '../../../skills/google-maps-scrape/';
const { rankEmails } = require(ENG + 'email-rank.js');
const { localOwns, csv } = require(ENG + 'build-plusvibe.js');
const TRADE = 'electric,electrical,generator,generators,power,energy,standby,backup,solutions,systems,services,company,inc,llc,home,pros'.split(',');
const leads = csv('leads_icp.csv');
const site = new Map();
for (const l of fs.readFileSync('owner/site_text.jsonl', 'utf8').split('\n')) { if (!l.trim()) continue; const d = JSON.parse(l); if (d.emails?.length) site.set(d.place_id, d.emails); }
const contacts = new Map();
for (const l of fs.readFileSync('owner/contacts_final.jsonl', 'utf8').split('\n')) { if (!l.trim()) continue; const d = JSON.parse(l); contacts.set(d.place_id, d); }
const splitList = s => String(s || '').replace(/@([a-z0-9-]+),(com|net|org)\b/gi, '@$1.$2').split(/[;,\s|]+/).filter(x => x.includes('@'));
const esc = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
const H = ['place_id', 'business_name', 'state', 'root_domain', 'rank', 'email', 'email_kind', 'contact_name', 'contact_role', 'found_by', 'score', 'verdict'];
const out = [H.join(',')], sum = { leads: leads.length, with_email: 0, named: 0, named_with_email: 0, top_personal_owner_match: 0, top_company: 0, candidates: 0, by_found_by: {}, dupes_skipped: 0 };
const seenPid = new Set();
for (const L of leads) {
  if (seenPid.has(L.place_id)) { sum.dupes_skipped++; continue; } seenPid.add(L.place_id);
  const C = contacts.get(L.place_id), people = (C?.contacts || []).filter(c => c.name);
  if (C) sum.named++;
  const src = new Map(), cands = [];
  const push = (e, s) => { e = String(e).trim().toLowerCase(); if (!src.has(e)) { src.set(e, s); cands.push([e, s === 'site' ? 'site' : 'maps']); } };
  for (const p of people) if (p.email) push(p.email, 'reader');
  for (const e of splitList(L.email)) push(e, 'oem_list');
  for (const e of site.get(L.place_id) || []) push(e, 'site');
  const ranked = rankEmails(cands, L.root_domain || '', { tradeWords: TRADE });
  if (!ranked.length) continue;
  sum.with_email++; if (C) sum.named_with_email++;
  const rows = ranked.map(r => {
    const p = people.find(c => { const [f, ...l] = c.name.trim().split(/\s+/); return localOwns(r.email, f, l.join(' ')); });
    return { ...r, who: p, kind: p ? 'personal' : 'company' };
  });
  // a local part built from a named contact outranks everything; otherwise email-rank's order holds (stable)
  rows.sort((a, b) => (b.who ? 1 : 0) - (a.who ? 1 : 0));
  if (rows[0].who) sum.top_personal_owner_match++; else sum.top_company++;
  rows.forEach((r, i) => {
    const fb = src.get(r.email); sum.by_found_by[fb] = (sum.by_found_by[fb] || 0) + 1; sum.candidates++;
    out.push([L.place_id, L.name, L.state, L.root_domain, i + 1, r.email, r.kind, r.who?.name || '', r.who?.role_bucket || '', fb, r.score, ''].map(esc).join(','));
  });
}
fs.writeFileSync('owner/emails_candidates.csv', out.join('\n') + '\n');
fs.writeFileSync('owner/emails_candidates_summary.json', JSON.stringify(sum, null, 2));
console.log(JSON.stringify(sum));
