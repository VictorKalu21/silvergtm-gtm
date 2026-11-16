#!/usr/bin/env node
/* build-icp-emails.js: the scope cut, plus STEP 6e rung 1 (addresses already on disk). $0, no finder or verifier credits.
 *  1. full/leads_icp.csv: the CLEAN fit set (operator 2026-11-16: "clean 3,491 only"). It keeps a domain
 *     representative when business_type = residential_foundation, it has no lead-gen flag (no deterministic
 *     shared_phone / shared_text / homoglyph_text and no model lead_gen), and the model did not flag it
 *     out_of_business. Adds a `state` column (address state, else the nearest runsheet anchor).
 *  2. full/owner/emails_candidates.csv: every on-site address per ICP lead (site_text.jsonl `emails`), ranked by
 *     the engine's email-rank.js (country us, foundation trade words). rank 1 = the pick. verdict is blank until
 *     MillionVerifier/BounceBan run on an explicit go. Named-contact matching happens after the owner read.
 *   node build-icp-emails.js   (paths fixed to this run folder)
 */
const fs = require('fs'), path = require('path');
const { rankEmails } = require('../../../skills/google-maps-scrape/email-rank.js');
const R = __dirname, F = path.join(R, 'full');
function pc(t){const X=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);X.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);X.push(r);}return X;}
const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const rd = f => { const X = pc(fs.readFileSync(f, 'utf8')).filter(r => r.length > 1); const H = X.shift(); return { H, rows: X.map(r => Object.fromEntries(H.map((k, i) => [k, r[i] ?? '']))) }; };

const { H, rows: cls } = rd(path.join(F, 'leads_domains_classified.csv'));
const model = new Map();
for (const f of fs.readdirSync(path.join(F, 'classify/out'))) for (const o of JSON.parse(fs.readFileSync(path.join(F, 'classify/out', f), 'utf8'))) model.set(o.place_id, o);
const det = new Set(rd(path.join(F, 'leadgen_flags.csv')).rows.filter(r => /shared_phone|shared_text|homoglyph_text/.test(r.leadgen_flags)).map(r => r.root_domain));
// state
const anchors = []; { const seen = new Set(); for (const r of pc(fs.readFileSync(path.join(R, '../atlas-growth-foundation-us-runsheet.csv'), 'utf8')).slice(1)) { if (r.length < 5) continue; const k = r[0].replace(/-q\d+$/, ''); if (seen.has(k)) continue; seen.add(k); anchors.push([k.slice(0, 2).toUpperCase(), +r[3], +r[4]]); } }
const stateOf = r => { const m = (r.full_address || '').match(/,\s*([A-Z]{2})\s+\d{5}/); if (m) return m[1]; const la = +r.latitude, lo = +r.longitude; if (!la || !lo) return ''; let b = '', bd = 1e9; for (const [s, a, o] of anchors) { const d = (a - la) ** 2 + ((o - lo) * Math.cos(la * Math.PI / 180)) ** 2; if (d < bd) { bd = d; b = s; } } return b; };

const drop = { not_fit: 0, leadgen_strong: 0, leadgen_soft: 0, out_of_business: 0 };
const icp = [];
for (const r of cls) {
  if (r.business_type !== 'residential_foundation') { drop.not_fit++; continue; }
  const m = model.get(r.place_id) || {};
  if (det.has(r.root_domain)) { drop.leadgen_strong++; continue; }
  if (m.lead_gen) { drop.leadgen_soft++; continue; }
  if (m.out_of_business) { drop.out_of_business++; continue; }
  icp.push({ ...r, state: stateOf(r), fit_services: (m.services || []).join('|'), fit_evidence: m.evidence || '' });
}
const OH = [...H, 'state', 'fit_services', 'fit_evidence'];
fs.writeFileSync(path.join(F, 'leads_icp.csv'), [OH.join(','), ...icp.map(r => OH.map(k => esc(r[k])).join(','))].join('\n') + '\n');

// on-site emails
const site = new Map();
for (const ln of fs.readFileSync(path.join(F, 'owner/site_text.jsonl'), 'utf8').split('\n')) { if (!ln.trim()) continue; try { const o = JSON.parse(ln); if (o.emails && o.emails.length) site.set(o.place_id, o.emails); } catch {} }
const TRADE = ['foundation', 'foundations', 'repair', 'repairs', 'waterproofing', 'crawl', 'crawlspace', 'concrete', 'leveling', 'levelling', 'basement', 'structural', 'pier', 'piers', 'piering', 'jacking', 'lifting', 'drainage'];
const out = ['place_id,name,state,root_domain,rank,email,email_kind,own_domain,score,found_by,verdict'];
const sum = { icp_leads: icp.length, dropped: drop, with_site_email: 0, with_own_domain_pick: 0, with_person_shaped_pick: 0, with_freemail_pick: 0, candidates: 0, no_email: 0 };
for (const L of icp) {
  const ranked = rankEmails((site.get(L.place_id) || []).map(e => [e, 'site']), L.root_domain, { country: 'us', tradeWords: TRADE });
  if (!ranked.length) { sum.no_email++; continue; }
  sum.with_site_email++;
  const t = ranked[0]; if (t.own) sum.with_own_domain_pick++; if (t.kind === 'person') sum.with_person_shaped_pick++; if (!t.own) sum.with_freemail_pick++;
  ranked.forEach((x, i) => { sum.candidates++; out.push([L.place_id, L.name, L.state, L.root_domain, i + 1, x.email, x.kind, x.own ? 1 : 0, x.score, 'site', ''].map(esc).join(',')); });
}
fs.mkdirSync(path.join(F, 'owner'), { recursive: true });
fs.writeFileSync(path.join(F, 'owner/emails_candidates.csv'), out.join('\n') + '\n');
fs.writeFileSync(path.join(F, 'owner/emails_candidates_summary.json'), JSON.stringify(sum, null, 2));
console.log(JSON.stringify(sum, null, 1));
