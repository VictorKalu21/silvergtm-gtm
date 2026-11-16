#!/usr/bin/env node
/* match-contact-emails.js: join named contacts to the on-disk addresses (STEP 6e rung 1, $0, no credits).
 * Inputs: full/leads_icp.csv, full/owner/emails_candidates.csv (build-icp-emails.js),
 *         full/owner/contacts_*_clean.jsonl / contacts_sweep*.jsonl (every contacts file present; first file wins per lead).
 * A candidate address is the contact's own when build-plusvibe.js `localOwns(email, first, last)` says its local part is
 * built from that person's name. Picks, in order: the contact's own address, then the email-rank rank-1 company address.
 * Writes full/owner/emails_matched.csv (one row per ICP lead) + emails_matched_summary.json.
 *   node match-contact-emails.js
 */
const fs = require('fs'), path = require('path');
const { localOwns } = require('../../../skills/google-maps-scrape/build-plusvibe.js');
const F = path.join(__dirname, 'full'), O = path.join(F, 'owner');
function pc(t){const X=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);X.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);X.push(r);}return X;}
const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const rd = f => { const X = pc(fs.readFileSync(f, 'utf8')).filter(r => r.length > 1); const H = X.shift(); return X.map(r => Object.fromEntries(H.map((k, i) => [k, r[i] ?? '']))); };
const icp = rd(path.join(F, 'leads_icp.csv'));
const cands = new Map(); for (const r of rd(path.join(O, 'emails_candidates.csv'))) { if (!cands.has(r.place_id)) cands.set(r.place_id, []); cands.get(r.place_id).push(r); }
const files = fs.readdirSync(O).filter(f => /^contacts_.*\.jsonl$/.test(f) && (/_clean\.jsonl$/.test(f) || /^contacts_sweep/.test(f))).sort();
const people = new Map();
for (const f of files) for (const ln of fs.readFileSync(path.join(O, f), 'utf8').split('\n')) { if (!ln.trim()) continue; const o = JSON.parse(ln); if (!o.contacts || !o.contacts.length || people.has(o.place_id)) continue; people.set(o.place_id, { ...o, from: f }); }
const KEEP = ['owner_or_partner', 'gm', 'marketing', 'sales_manager', 'office_manager', 'other'];
const out = [['place_id', 'name', 'state', 'root_domain', 'contact_name', 'contact_first_name', 'contact_title', 'contact_role_bucket', 'contact_source', 'email', 'email_kind', 'email_rank', 'verdict'].join(',')];
const sum = { icp_leads: icp.length, contact_files: files, named: 0, named_owner_or_gm: 0, named_with_personal_email: 0, named_with_company_email: 0, named_no_email: 0, unnamed_with_company_email: 0, unnamed_no_email: 0 };
for (const L of icp) {
  const P = people.get(L.place_id);
  const cs = P ? [...P.contacts].sort((a, b) => KEEP.indexOf(a.role_bucket) - KEEP.indexOf(b.role_bucket)) : [];
  const C = cs[0];
  const E = cands.get(L.place_id) || [];
  let pick = null, kind = '';
  if (C) {
    for (const c of cs) { const [f, ...l] = String(c.name || '').trim().split(/\s+/); const hit = E.find(e => localOwns(e.email, f, l.join(' '))); if (hit) { pick = hit; kind = 'personal'; break; } }
    const own = cs.find(c => c.email) && !pick ? cs.find(c => c.email) : null; if (own) { pick = { email: own.email.toLowerCase(), rank: '' }; kind = 'personal_from_site'; }
  }
  if (!pick && E.length) { pick = E[0]; kind = 'company'; }
  if (C) { sum.named++; if (['owner_or_partner', 'gm'].includes(C.role_bucket)) sum.named_owner_or_gm++; if (!pick) sum.named_no_email++; else if (kind.startsWith('personal')) sum.named_with_personal_email++; else sum.named_with_company_email++; }
  else if (pick) sum.unnamed_with_company_email++; else sum.unnamed_no_email++;
  out.push([L.place_id, L.name, L.state, L.root_domain, C?.name || '', C?.first_name || '', C?.title || '', C?.role_bucket || '', C ? P.from : '', pick?.email || '', pick ? kind : '', pick?.rank || '', ''].map(esc).join(','));
}
fs.writeFileSync(path.join(O, 'emails_matched.csv'), out.join('\n') + '\n');
fs.writeFileSync(path.join(O, 'emails_matched_summary.json'), JSON.stringify(sum, null, 2));
console.log(JSON.stringify(sum, null, 1));
