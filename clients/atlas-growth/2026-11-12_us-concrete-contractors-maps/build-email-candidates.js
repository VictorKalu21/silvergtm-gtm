#!/usr/bin/env node
/* build-email-candidates.js (Maps run; adapted from the 2026-11-11 YP probe script, same exclusion rules) — STEP 6e without finder rungs (as 2026-09-24 generator run): addresses already on disk
 * (site_text emails + addresses in Keenable snippets), filtered by explicit counted rules, ranked with email-rank.js,
 * then the verification queue (rank 1, unique per lead, one address per lead and per address) and rank-2 fallbacks.
 * Run from this folder. Nothing is verified or bought here.
 * Outputs: email_candidates.csv (every candidate, kept or excluded + rule), verify/queue.csv, verify/rank2.csv,
 *          probe_contacts_review.csv, email_summary.json
 */
const fs = require('fs');
const E = '../../../skills/google-maps-scrape/';
const { rankEmails, isFree, ownness } = require(E + 'email-rank.js');
const { localOwns: engineOwns, csv } = require(E + 'build-plusvibe.js');
// engine rule + a guard: the engine's nickname rule ('robert' -> 'bob' -> local[0]=='b' && endsWith(surname)) tied
// a "bob<surname>"-style local part to an owner with a different first name. Reject when a >2-letter prefix before the surname is not the first name.
const NICKF = { robert: ['rob', 'bob', 'bobby'], william: ['will', 'bill', 'billy'], james: ['jim', 'jimmy'], david: ['dave'], michael: ['mike'], thomas: ['tom'], richard: ['rick', 'dick', 'rich'], charles: ['chuck', 'charlie'], joseph: ['joe'], daniel: ['dan'], christopher: ['chris'], anthony: ['tony'], jonathan: ['jon'], joshua: ['josh'], matthew: ['matt'], steven: ['steve'], timothy: ['tim'] };
function localOwns(email, first, last) {
  if (!engineOwns(email, first, last)) return false;
  const loc = String(email).split('@')[0].toLowerCase().replace(/[^a-z]/g, ''), l = String(last).toLowerCase().replace(/[^a-z]/g, ''), f = String(first).toLowerCase().replace(/[^a-z]/g, '');
  const at = l.length >= 4 ? loc.indexOf(l) : -1;
  if (at > 2) { const pre = loc.slice(0, at); const forms = [f, ...(NICKF[f] || [])]; return forms.some(x => x === pre || x.startsWith(pre) || pre.startsWith(x)); }
  return true;
}
const { emailsFromText } = require(E + 'search-owner.js');
const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const writeCsv = (f, H, rows) => fs.writeFileSync(f, [H.join(',')].concat(rows.map(r => H.map(h => esc(r[h])).join(','))).join('\n') + '\n');
const jl = f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(JSON.parse);

const leads = csv('leads_in_domains.csv');
// wrong-site leads = a reader blanked best_website (the lead's site belongs to another business) or named a different root domain
const { rootDomain } = require(E + 'shared-hosts.js');
const mismatch = new Set(); const readOuts = [];
for (const d of ['owner_in/read/batches', 'sweep_in/read/batches']) for (const f of fs.readdirSync(d).filter(f => /-out\.json$/.test(f))) { const o = JSON.parse(fs.readFileSync(d + '/' + f, 'utf8').replace(/^\ufeff/, '')); for (const [id, v] of Object.entries(o)) readOuts.push([id, v]); }
const LBYID = new Map(leads.map(l => [l.place_id, l]));
for (const [id, v] of readOuts) { const l = LBYID.get(id); if (!l || !l.website) continue; const bw = (v.best_website || '').trim(); if (!bw) { mismatch.add(id); continue; } try { const h = new URL(/^https?:\/\//i.test(bw) ? bw : 'http://' + bw).hostname.replace(/^www\./, ''); if (rootDomain(h) !== l.root_domain) mismatch.add(id); } catch { } }
// the two leads that repeat probe IN leads (phone match, different domain) never get an email from this run
const PROBE = '../2026-11-11_us-concrete-contractors-yp/';
const dig = p => String(p || '').replace(/\D/g, '').slice(-10);
const probeIN = new Set(csv(PROBE + 'leads_icp_all.csv').map(r => dig(r.phone_number)).filter(Boolean));
const probeRepeat = new Set(leads.filter(l => probeIN.has(dig(l.phone_number))).map(l => l.place_id));
const probeAddr = new Set(); for (const f of ['verify/queue.csv', 'verify/rank2.csv']) for (const r of csv(PROBE + f)) probeAddr.add(String(r.Email || r.email || '').trim().toLowerCase());
const site = new Map(); for (const l of fs.readFileSync('owner_in/site_text.jsonl', 'utf8').split('\n')) { if (!l) continue; const d = JSON.parse(l); site.set(d.place_id, { emails: d.emails, emails_by_source: d.emails_by_source }); }
const serp = new Map(); for (const d of jl('sweep_in/serp/serp_text.jsonl')) serp.set(d.place_id, emailsFromText([d.biased_text, d.linkedin_text, d.broad_text].join(' ')));
const contacts = new Map(); for (const d of jl('owner_in/contacts_final.jsonl')) contacts.set(d.place_id, d);

// ---- exclusion tables (data) ----
const PLACEHOLDER_LOCAL = /^(your|youremail|your\.?name|yourname|name|email|example|user|username|someone|test|first\.?last)$/i;
const PLACEHOLDER_DOMAIN = /(^|\.)(mysite\.com|domain\.com|smith\.com|handle\.com|example\.(com|org|net)|email\.com|yourdomain\.com|company\.com|sentry\.io|wixpress\.com)$/i;
const VENDOR_DOMAIN = /(^|\.)(webador\.com|localleadnetwork\.com|eyebytes\.com|latofonts\.com|pageoneinsights\.com|zambuki\.com|silverscap\.com|wix\.com|squarespace\.com|godaddy\.com|weebly\.com|wordpress\.com|hubspot\.com)$/i;
const VENDOR_LOCAL = /^(typesetit|support|domains|webmaster|noreply|no-reply|hosting)$/i;   // vendor-style local parts seen on site templates
const TRADE_WORDS = new Set('concrete cement paving pavers paver stamped decorative driveway driveways patio patios flatwork masonry hardscape hardscapes works crete coatings coating builders custom quality premier elite precision construction contractors contractor contracting services service solutions company inc llc corp the and residential commercial landscaping landscape asphalt sealcoating finishing raising restoration design designs outdoor'.split(' '));
const COMPANYISH_LOCAL = /(concrete|cement|mason|paving|flatwork|driveway|patio|stamp|construct|contract|hardscape|coating|decorative|landscap|asphalt|build|crete|flooring|epoxy|pavers)/i;
const ROLE_NOISE = /^(noreply|no-reply|donotreply|do-not-reply|postmaster|abuse|privacy|legal|careers|jobs|hr|press|media|unsubscribe|bounce|mailer-daemon|webmaster|spam|security|compliance)$/i;
const letters = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const toks = s => String(s || '').toLowerCase().replace(/&/g, ' ').split(/[^a-z]+/).filter(t => t.length >= 3 && !TRADE_WORDS.has(t));
const labelOf = d => (String(d).split('.')[0] || '');

function tiedFree(email, lead, people) {         // is this free-mail address tied to THIS business or its named contact?
  const local = letters(email.split('@')[0]);
  const nameToks = toks(lead.name).filter(t => t.length >= 4 || t.length === 3);
  if (nameToks.some(t => local.includes(t))) return 'business_name_token';
  const lab = letters(labelOf(lead.root_domain));
  if (lab.length >= 5 && (lab.includes(local) || local.includes(lab))) return 'domain_label';
  for (const p of people) { const [f, ...l] = p.name.trim().split(/\s+/); if (localOwns(email, f, l.join(' '))) return 'contact_name'; const lt = letters(l.join(' ')), fi = letters(f); const at = local.indexOf(lt); if (lt.length >= 4 && at >= 0) { const pre = local.slice(0, at); if (pre.length <= 2 || (pre && fi.startsWith(pre))) return 'contact_surname'; } }   // a different first name before the surname is NOT tied to the owner
  if (COMPANYISH_LOCAL.test(local)) return 'company_style_local';
  return '';
}

const cand = [], counts = { candidates_total: 0, by_rule: {}, leads_with_candidates: 0 };
const bump = r => counts.by_rule[r] = (counts.by_rule[r] || 0) + 1;
for (const L of leads) {
  const C = contacts.get(L.place_id), people = (C?.contacts || []).filter(c => c.name);
  const s = site.get(L.place_id) || {}, bySrc = s.emails_by_source || {};
  const raw = new Map();      // email -> {src, via}
  for (const e of s.emails || []) { const k = e.toLowerCase(); if (!raw.has(k)) raw.set(k, { src: 'site', via: String(bySrc[e] || '') }); }
  for (const e of serp.get(L.place_id) || []) { const k = e.toLowerCase(); if (!raw.has(k)) raw.set(k, { src: 'serp', via: '' }); }
  for (const [e, m] of raw) {
    counts.candidates_total++;
    const dom = e.split('@')[1], local = e.split('@')[0];
    let rule = '', note = '';
    if (probeRepeat.has(L.place_id)) rule = 'repeats_probe_IN_lead';
    else if (mismatch.has(L.place_id)) rule = 'wrong_site_lead';
    else if (probeAddr.has(e)) rule = 'address_already_in_probe_queue';
    else if (ROLE_NOISE.test(local)) rule = 'role_noise';
    else if (PLACEHOLDER_LOCAL.test(local) || PLACEHOLDER_DOMAIN.test(dom)) rule = 'placeholder_template';
    else if (VENDOR_DOMAIN.test(dom) || (VENDOR_LOCAL.test(local) && !ownness(e, L.root_domain))) rule = 'web_vendor_agency_foundry';
    else if (isFree(e)) { const t = tiedFree(e, L, people); if (!t) rule = 'freemail_untied'; else note = 'freemail_tie:' + t; }
    else if (!ownness(e, L.root_domain)) { if (m.src === 'serp') rule = 'other_domain_from_snippet'; else note = 'email_domain_differs_from_website'; }
    cand.push({ place_id: L.place_id, business_name: L.name, root_domain: L.root_domain, email: e, source: m.src, via: m.via, rule, note });
    if (rule) bump(rule);
  }
}
// rank the survivors per lead
const byLead = new Map(); for (const c of cand) if (!c.rule) (byLead.get(c.place_id) || byLead.set(c.place_id, []).get(c.place_id)).push(c);
const TRADE_LIST = [...TRADE_WORDS];
const ranked = new Map(); let engineDrops = 0;
for (const L of leads) {
  const cs = byLead.get(L.place_id) || []; if (!cs.length) continue;
  const people = (contacts.get(L.place_id)?.contacts || []).filter(c => c.name);
  const r = rankEmails(cs.map(c => [c.email, c.source === 'site' ? 'site' : 'maps']), L.root_domain || '', { keepThirdParty: true, tradeWords: TRADE_LIST });
  const kept = new Set(r.map(x => x.email)); for (const c of cs) if (!kept.has(c.email)) { c.rule = 'engine_filter'; bump('engine_filter'); engineDrops++; }
  const rows = r.map(x => { const who = people.find(c => { const [f, ...l] = c.name.trim().split(/\s+/); return localOwns(x.email, f, l.join(' ')); }); return { ...x, who }; });
  rows.sort((a, b) => (b.who ? 1 : 0) - (a.who ? 1 : 0));         // a local part built from a named contact outranks the rest (stable)
  if (rows.length) ranked.set(L.place_id, rows);
}
// global uniqueness: one lead per address (the first lead in file order keeps it; the other loses it -> rule duplicate_address)
const owner = new Map(), finalRows = new Map();
for (const L of leads) {
  const rows = (ranked.get(L.place_id) || []).filter(x => { if (owner.has(x.email) && owner.get(x.email) !== L.place_id) { const c = cand.find(c => c.place_id === L.place_id && c.email === x.email); c.rule = 'duplicate_address_other_lead'; bump('duplicate_address_other_lead'); return false; } owner.set(x.email, L.place_id); return true; });
  if (rows.length) finalRows.set(L.place_id, rows);
}
const typeOf = x => (x.who || x.kind === 'person') ? 'person-named' : 'role/company mailbox';
const normN = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const candBy = new Map(cand.map(c => [c.place_id + '|' + c.email, c]));
const fileOf = new Map(); for (const [f, tag] of [['owner_in/contacts_read.jsonl', 'site'], ['sweep_in/contacts_sweep.jsonl', 'serp']]) for (const d of jl(f)) if (d.primary_name && !fileOf.has(d.place_id)) fileOf.set(d.place_id, tag);
const queue = [], rank2 = [];
for (const L of leads) {
  const C = contacts.get(L.place_id), rows = finalRows.get(L.place_id) || [], reasons = [];
  if (mismatch.has(L.place_id)) reasons.push('wrong_site');
  if (C) { if (C.confidence === 'low') reasons.push('reader_confidence_low'); const ev = normN(C.primary_evidence); if (ev && ev === normN(L.name)) reasons.push('owner_from_business_name_only'); }
  const top = rows[0];
  if (top && !top.own && !isFree(top.email)) reasons.push('email_domain_differs_from_website');
  if (top && isFree(top.email)) { const c = candBy.get(L.place_id + '|' + top.email); if (c && /company_style_local/.test(c.note)) reasons.push('freemail_tied_by_company_style_only'); }
  rows.forEach((x, i) => { const c = candBy.get(L.place_id + '|' + x.email); const rec = { place_id: L.place_id, business_name: L.name, state: L.state, review_count: L.review_count, first_name: C ? C.primary_first_name : '', is_owner: C ? (C.primary_is_owner ? 'yes' : 'no') : '', Email: x.email, email_type: x.own ? 'own-domain' : isFree(x.email) ? 'free-mail' : 'other-domain', source: c ? c.source : '', rank: i + 1, email_kind: typeOf(x), name_tied: x.who ? 'yes' : 'no', contact_name: x.who ? x.who.name : '', owner_rung: C ? fileOf.get(L.place_id) || '' : 'none', root_domain: L.root_domain, website: L.website, needs_review: i === 0 ? reasons.join('; ') : '' }; (i === 0 ? queue : rank2).push(rec); });
}
fs.mkdirSync('verify', { recursive: true });
const QH = ['Email', 'place_id', 'business_name', 'state', 'review_count', 'first_name', 'is_owner', 'email_type', 'source', 'rank', 'email_kind', 'name_tied', 'contact_name', 'owner_rung', 'root_domain', 'website', 'needs_review'];
writeCsv('verify/queue.csv', QH, queue); writeCsv('verify/rank2.csv', QH, rank2);
writeCsv('email_candidates.csv', ['place_id', 'business_name', 'root_domain', 'email', 'source', 'via', 'rule', 'note'], cand);
const named = leads.filter(l => contacts.has(l.place_id)), cnt = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const sum = { leads: leads.length, ...counts, engine_filter_drops: engineDrops, wrong_site_leads: mismatch.size, probe_repeat_leads: probeRepeat.size, named: named.length, named_by_rung: cnt(named, l => fileOf.get(l.place_id) || '?'),
  leads_with_rank1: queue.length, rank1_named: queue.filter(q => q.owner_rung !== 'none').length, rank1_unnamed: queue.filter(q => q.owner_rung === 'none').length,
  rank1_by_type: cnt(queue, q => q.email_type), rank1_by_type_named: cnt(queue.filter(q => q.owner_rung !== 'none'), q => q.email_type), rank1_by_type_unnamed: cnt(queue.filter(q => q.owner_rung === 'none'), q => q.email_type),
  rank1_by_kind: cnt(queue, q => q.email_kind), rank1_name_tied: queue.filter(q => q.name_tied === 'yes').length, rank1_by_source: cnt(queue, q => q.source),
  rank1_unique: new Set(queue.map(q => q.Email)).size, rank2: rank2.length, rank2_unique: new Set(rank2.map(q => q.Email)).size, needs_review_rows: queue.filter(q => q.needs_review).length, needs_review_by_reason: {} };
for (const q of queue) for (const r of q.needs_review.split('; ').filter(Boolean)) sum.needs_review_by_reason[r] = (sum.needs_review_by_reason[r] || 0) + 1;
fs.writeFileSync('email_summary.json', JSON.stringify(sum, null, 2)); console.log(JSON.stringify(sum, null, 2));
