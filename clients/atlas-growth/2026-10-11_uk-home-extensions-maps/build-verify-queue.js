#!/usr/bin/env node
/* build-verify-queue.js — STEP 6e without the finder rungs (operator 2026-11-01: "2k contacts ran through
 * MV BounceBan"). Modelled on the battery run's build-email-candidates.js. Per NAMED Qualified lead, gather
 * the addresses already on disk (reader best_send_email, contact emails, on-site emails from
 * owner/site_text.jsonl), rank them with the engine's email-rank.js (UK trade words, country gb), tag the
 * address built from the named contact's name, keep the rank-1 address per lead, order the leads
 * priority A > B > C, then confidence high > medium > low, then owner-personal address first, and cut the
 * verify queue at --limit (default 2000). The rank-2 addresses are kept in the candidates file for the
 * fallback pass (battery gotcha 6: a dropped lead with one candidate is dead).
 *   node build-verify-queue.js [--limit 2000]   (paths fixed to this run folder)
 * Writes owner/emails_candidates.csv (every ranked address), owner/verify/queue_2k.csv (Email-first,
 * the exact input verify-millionverifier-bounceban.js takes), owner/verify/queue_2k_summary.json.
 */
const fs = require('fs'), path = require('path');
const ENG = path.join(__dirname, '../../../skills/google-maps-scrape/');
const { rankEmails } = require(ENG + 'email-rank.js');
const { localOwns, csv } = require(ENG + 'build-plusvibe.js');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const LIMIT = parseInt(arg('limit', '2000'), 10);
const TRADE = 'extension,extensions,loft,lofts,conversion,conversions,build,builds,builder,builders,building,buildings,construction,contractors,contracts,renovation,renovations,refurb,refurbishment,refurbishments,design,developments,development,property,properties,homes,home,ltd,limited,uk,group,services,solutions,london,joinery,carpentry,roofing,plastering,brickwork,maintenance'.split(',');
const R = __dirname;
const leads = csv(path.join(R, 'leads_icp.csv'));
const site = new Map();
for (const l of fs.readFileSync(path.join(R, 'owner/site_text.jsonl'), 'utf8').split('\n')) { if (!l.trim()) continue; let d; try { d = JSON.parse(l); } catch { continue; } if (d.emails?.length) site.set(d.place_id, d.emails); }
const contacts = new Map();
for (const l of fs.readFileSync(path.join(R, 'owner/contacts_final.jsonl'), 'utf8').split('\n')) { if (!l.trim()) continue; const d = JSON.parse(l); contacts.set(d.place_id, d); }
const prio = new Map();
for (const r of csv(path.join(R, 'deliverable/extension_builders_qualified.csv'))) prio.set(r.place_id, { priority: r.priority || 'C', town: r.town || '', nation: r.nation || '', postcode: r.postcode || '' });
const esc = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
const CH = ['place_id', 'business_name', 'city', 'root_domain', 'rank', 'email', 'email_kind', 'contact_name', 'contact_role', 'found_by', 'score', 'verdict'];
const cand = [CH.join(',')];
const picks = [];
const sum = { leads: leads.length, named: 0, named_with_email: 0, top_personal_owner_match: 0, top_company: 0, candidates: 0, by_found_by: {}, no_candidate_named: 0 };
const CONF = { high: 0, medium: 1, low: 2 };
for (const L of leads) {
  const C = contacts.get(L.place_id); if (!C || !C.primary_name) continue;
  sum.named++;
  const people = (C.contacts || []).filter(c => c.name);
  const src = new Map(), cands = [];
  const push = (e, s) => { e = String(e || '').trim().toLowerCase(); if (e && !src.has(e)) { src.set(e, s); cands.push([e, s === 'site' ? 'site' : 'maps']); } };
  if (C.best_send_email) push(C.best_send_email, 'reader');
  for (const p of people) if (p.email) push(p.email, 'reader');
  for (const e of site.get(L.place_id) || site.get(L.rep_place_id) || []) push(e, 'site');
  const ranked = rankEmails(cands, L.root_domain || '', { tradeWords: TRADE, country: 'gb' });
  if (!ranked.length) { sum.no_candidate_named++; continue; }
  sum.named_with_email++;
  const rows = ranked.map(r => { const p = people.find(c => { const t = c.name.trim().split(/\s+/); return localOwns(r.email, t[0], t[t.length - 1]); }); return { ...r, who: p, kind: p ? 'personal' : 'company' }; });
  rows.sort((a, b) => (b.who ? 1 : 0) - (a.who ? 1 : 0));
  if (rows[0].who) sum.top_personal_owner_match++; else sum.top_company++;
  rows.forEach((r, i) => { const fb = src.get(r.email); sum.by_found_by[fb] = (sum.by_found_by[fb] || 0) + 1; sum.candidates++; cand.push([L.place_id, L.name, L.city, L.root_domain, i + 1, r.email, r.kind, r.who?.name || '', r.who?.role_bucket || '', fb, r.score, ''].map(esc).join(',')); });
  const P = prio.get(L.place_id) || { priority: 'C', town: L.city || '', nation: '', postcode: '' };
  picks.push({ place_id: L.place_id, business_name: L.name, website: L.website, root_domain: L.root_domain, town: P.town || L.city || '', postcode: P.postcode, nation: P.nation, priority: P.priority, primary_name: C.primary_name, primary_first_name: C.primary_first_name || '', primary_title: C.primary_title || '', primary_role: C.primary_role || '', confidence: C.confidence || 'low', email: rows[0].email, email_kind: rows[0].kind, email_found_by: src.get(rows[0].email), email_score: rows[0].score, alt_email: rows[1]?.email || '', review_count: L.review_count });
}
picks.sort((a, b) => a.priority.localeCompare(b.priority) || (CONF[a.confidence] ?? 3) - (CONF[b.confidence] ?? 3) || (b.email_kind === 'personal') - (a.email_kind === 'personal') || (+b.review_count || 0) - (+a.review_count || 0));
const queue = picks.slice(0, LIMIT);
fs.mkdirSync(path.join(R, 'owner/verify'), { recursive: true });
fs.writeFileSync(path.join(R, 'owner/emails_candidates.csv'), cand.join('\n') + '\n');
const QH = ['Email', 'place_id', 'business_name', 'website', 'root_domain', 'town', 'postcode', 'nation', 'priority', 'primary_name', 'primary_first_name', 'primary_title', 'primary_role', 'confidence', 'email_kind', 'email_found_by', 'email_score', 'alt_email', 'review_count'];
fs.writeFileSync(path.join(R, 'owner/verify/queue_2k.csv'), [QH.join(','), ...queue.map(q => QH.map(h => esc(h === 'Email' ? q.email : q[h])).join(','))].join('\n') + '\n');
fs.writeFileSync(path.join(R, 'owner/verify/queue_rest.csv'), [QH.join(','), ...picks.slice(LIMIT).map(q => QH.map(h => esc(h === 'Email' ? q.email : q[h])).join(','))].join('\n') + '\n');
const cnt = (l, f) => l.reduce((m, r) => (m[f(r)] = (m[f(r)] || 0) + 1, m), {});
sum.queue = queue.length; sum.rest = picks.length - queue.length;
sum.queue_by_priority = cnt(queue, q => q.priority); sum.queue_by_confidence = cnt(queue, q => q.confidence); sum.queue_by_email_kind = cnt(queue, q => q.email_kind); sum.queue_by_found_by = cnt(queue, q => q.email_found_by); sum.queue_own_domain = queue.filter(q => q.root_domain && q.email.endsWith('@' + q.root_domain)).length; sum.queue_with_alt = queue.filter(q => q.alt_email).length;
fs.writeFileSync(path.join(R, 'owner/verify/queue_2k_summary.json'), JSON.stringify(sum, null, 2));
console.log(JSON.stringify(sum));
