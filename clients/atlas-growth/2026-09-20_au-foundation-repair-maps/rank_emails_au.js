#!/usr/bin/env node
/* rank_emails_au.js :: RUN-FOLDER JOB SCRIPT — pick each AU lead's best on-site email.
 *
 * Imports the engine's ranking (skills/google-maps-scrape/email-rank.js, SKILL STEP 6 1b: "a job
 * script imports it instead of re-implementing the scoring") and adds ONLY the Australian job tuning
 * the engine does not carry yet (IMPROVEMENTS.md entry written at write-back, not fixed here):
 *   - SAME_COMPANY_TLD gains com.au / net.au / org.au / au / id.au so buildfix.com.au owns
 *     info@buildfix.com and reblocking.melbourne-style twins are judged, not dropped (the exported
 *     Set is extended in place — no engine edit).
 *   - AU ISP free-mail (bigpond, optusnet, iinet, tpg, westnet, internode, dodo, adam, ozemail,
 *     y7mail, exemail, live.com.au) counts as free like gmail, so a one-man restumper's
 *     bigpond address is kept instead of being dropped as third-party-off-the-site.
 *   - AU directory / marketplace domains (hipages, oneflare, serviceseeking, airtasker, localsearch,
 *     yellowpages, truelocal, productreview, houzz.com.au) are third-party, never a mailbox.
 *   - Template placeholders the harvest picks off Wix/Squarespace/Webflow boilerplate and CSS font
 *     licences (email@mysite.com, name@email.com, @mailservice.com, font foundries) are dropped.
 *
 * Reads leads_qualified.csv + owner/site_text.jsonl (keyed by the domain representative; a lead
 * with rep_place_id != place_id inherits the rep's harvest, flagged emails_from_rep=Y).
 * Writes leads_qualified_contacts.csv = every lead column + the email block the deliverable reads:
 *   email, email_type (person|generic|other), email_own_domain (Y/N), email_own_basis
 *   (exact|subdomain|sibling|free|), email_person_shape, email_source, first_name_hint,
 *   last_name_hint, all_emails (ranked, ';'), site_emails_all (raw union), emails_from_rep.
 *
 *   node rank_emails_au.js [--dry-run]
 */
const fs = require('fs'), path = require('path');
const ER = require('../../../skills/google-maps-scrape/email-rank.js');
const HERE = __dirname, DRY = process.argv.includes('--dry-run');
for (const t of ['com.au', 'net.au', 'org.au', 'au', 'id.au']) ER.SAME_COMPANY_TLD.add(t);

const FREE_AU = /@(bigpond|optusnet|iinet|tpg|westnet|internode|dodo|adam|ozemail|y7mail|exemail|aapt|primus|iprimus|netspace|people|live|bigpond\.net|optushome)\.(com|net|com\.au|net\.au)$/i;
const DIRECTORY_AU = /@(.*\.)?(hipages|oneflare|serviceseeking|airtasker|localsearch|yellowpages|truelocal|productreview|houzz|bark|yelp|wordofmouth|startlocal|hotfrog|cylex|aussieweb|pinkpages|dlook|whereis)\.(com|net|com\.au|net\.au)$/i;
const PLACEHOLDER = /@(mysite|email|mailservice|example|domain|yourdomain|company|website|sentry|wixpress|micahrich|indiantypefoundry|eyebytes|fontspring|myfonts|fonts|typekit|latofonts|impallari|pixelspread|rfuenzalida|fontsquirrel|googlemail\.co|2x\.png|jsdelivr)\.(com|net|org|io)$|^(email|name|yourname|your|user|username|firstname|johndoe|john\.doe|jane\.doe|test|impallari|mymail)@|@test\.com$|\.tld$/i;

// AU trade / place tokens: a separated local part carrying one is a TRADING name, not first.last
// (goldenstar.reblocking@, melbourne.bestreblocking@, nextlevel_restumping@, mge.au@mainmark.com).
const AU_TRADE_GEO = /(restump|reblock|underpin|relevel|levell|leveling|foundation|piling|pier|slab|raising|stump|concret|construct|building|builder|melbourne|sydney|brisbane|perth|adelaide|geelong|hobart|canberra|darwin|ballarat|bendigo|newcastle|wollongong|goldcoast|sunshine|toowoomba|townsville|cairns|nsw|qld|vic|tas|wa$|sa$|^au$|^aus$|^mge$|^oz$)/;
const auPerson = nm => !!nm && !(nm.pattern !== 'first_name' && (AU_TRADE_GEO.test(nm.first.toLowerCase()) || AU_TRADE_GEO.test(nm.last.toLowerCase()) || nm.last.length < 3 || nm.first.length < 2));
const NAME_STOP = new Set(['pty', 'ltd', 'the', 'and', 'group', 'services', 'solutions', 'australia', 'australian', 'trustee', 'for', 'house', 'home', 'level', 'total', 'master', 'masters', 'best', 'always', 'first', 'last', 'north', 'south', 'east', 'west', 'northern', 'southern', 'eastern', 'western', 'valley', 'coast', 'hunter', 'city', 'metro', 'regional', 'division', 'company', 'specialist', 'specialists', 'expert', 'experts', 'affordable', 'budget', 'quality', 'reliable', 'advanced', 'ground', 'structural', 'remedial', 'engineering', 'excavations', 'excavation']);
const compact = s => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
/** A third-party domain whose label is built from THIS business's name is the company's other domain (name_match). */
function nameMatch(email, bizName, root) {
  const label = ER.splitDomain(email.split('@')[1]).label.replace(/[^a-z0-9]/g, '');
  if (label.length < 6) return false;
  const cn = compact(bizName), cr = ER.splitDomain(root).label.replace(/[^a-z0-9]/g, '');
  if (cn.includes(label) || (cr && cr.includes(label))) return true;
  const toks = String(bizName || '').toLowerCase().replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(t => t.length >= 5 && !NAME_STOP.has(t) && !AU_TRADE_GEO.test(t));
  return toks.some(t => label.includes(t));
}

const strip = s => s.replace(/^﻿/, '');
function parse(l) { const c = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { c.push(cur); cur = ''; } else cur += ch; } c.push(cur); return c; }
function csv(f) { const L = strip(fs.readFileSync(f, 'utf8')).split(/\r?\n/).filter(l => l.trim()); const H = parse(L.shift()); return { H, rows: L.map(l => { const c = parse(l); return Object.fromEntries(H.map((h, i) => [h, c[i] ?? ''])); }) }; }
const esc = s => { s = String(s ?? ''); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

const { H, rows: leads } = csv(path.join(HERE, 'leads_qualified.csv'));
const site = {};
for (const l of strip(fs.readFileSync(path.join(HERE, 'owner', 'site_text.jsonl'), 'utf8')).split(/\r?\n/)) { if (!l.trim()) continue; const d = JSON.parse(l); site[d.place_id] = d; }

const EXTRA = ['email', 'email_type', 'email_own_domain', 'email_own_basis', 'email_person_shape', 'email_source', 'first_name_hint', 'last_name_hint', 'all_emails', 'site_emails_all', 'emails_from_rep', 'emails_dropped'];
const out = [], st = { leads: 0, with_candidates: 0, with_email: 0, person: 0, generic: 0, other: 0, own: 0, free: 0, sibling: 0, from_rep: 0, dropped_placeholder: 0, dropped_directory: 0, dropped_third_party: 0, dropped_engine: 0, name_match: 0, person_demoted: 0 };
for (const r of leads) {
  st.leads++;
  // a directory-listing root (localsearch, yellowpages ...) is not the business's site: never inherit the rep's harvest
  const DIRECTORY_HOSTS = new Set(['localsearch.com.au', 'yellowpages.com.au', 'truelocal.com.au', 'hipages.com.au', 'oneflare.com.au', 'serviceseeking.com.au', 'hotfrog.com.au', 'startlocal.com.au', 'dlook.com.au', 'aussieweb.com.au', 'cylex.com.au', 'yelp.com', 'wordofmouth.com.au', 'productreview.com.au', 'houzz.com.au', 'airtasker.com']);
  const dirHost = DIRECTORY_HOSTS.has(r.root_domain);
  const rep = (dirHost ? r.place_id : r.rep_place_id) || r.place_id, s = site[rep] || (dirHost ? null : site[r.place_id]);
  const root = r.root_domain || '';
  const raw = new Map();  // email -> source rung
  if (s) {
    const bys = s.emails_by_source || {};
    // fetch-sites writes emails_by_source as { email: rung }; tolerate the inverse { rung: [emails] } too
    for (const [k0, v] of Object.entries(bys)) {
      if (Array.isArray(v)) { for (const e of v) { const k = String(e).toLowerCase().trim(); if (!raw.has(k)) raw.set(k, k0); } }
      else { const k = k0.toLowerCase().trim(); if (!raw.has(k)) raw.set(k, String(v)); }
    }
    for (const e of (s.emails || [])) { const k = String(e).toLowerCase().trim(); if (!raw.has(k)) raw.set(k, 'site'); }
  }
  for (const e of (r.site_emails || '').split(/[;,\s]+/)) { const k = e.toLowerCase().trim(); if (k && !raw.has(k)) raw.set(k, 'site'); }
  const dropped = [], cands = [];
  for (const [e, rung] of raw) {
    if (PLACEHOLDER.test(e)) { dropped.push('placeholder:' + e); st.dropped_placeholder++; continue; }
    if (DIRECTORY_AU.test(e)) { dropped.push('directory:' + e); st.dropped_directory++; continue; }
    let own = ER.ownness(e, root); const free = ER.FREE.test('@' + e.split('@')[1] + '.') || FREE_AU.test(e);
    if (!own && !free && nameMatch(e, r.name, root)) { own = 'name_match'; st.name_match++; }
    if (!own && !free) { dropped.push('third_party:' + e); st.dropped_third_party++; continue; }
    cands.push({ email: e, source: 'site', rung, free, own });
  }
  if (raw.size) st.with_candidates++;
  const ranked = ER.rankEmails(cands, root, { keepThirdParty: true }).map(x => {
    const c = cands.find(y => y.email === x.email); const nm = ER.nameFromLocal(x.local);
    if (x.kind === 'person' && !auPerson(nm)) { x.kind = 'other'; x.person = null; st.person_demoted++; }
    if (c.own) { x.own = true; x.basis = c.own; }
    x.score = (x.kind === 'person' ? 3 : x.kind === 'generic' ? 2 : 1) * 10 + (x.own ? 3 : 1);
    return x;
  }).sort((a, b) => b.score - a.score);
  st.dropped_engine += cands.length - ranked.length;
  for (const c of cands) if (!ranked.find(x => x.email === c.email)) dropped.push('engine:' + c.email);
  const best = ranked[0];
  const o = { ...r };
  if (best) {
    const c = cands.find(x => x.email === best.email);
    const nm = best.kind === 'person' ? ER.nameFromLocal(best.local) : null;
    o.email = best.email; o.email_type = best.kind; o.email_own_domain = best.own ? 'Y' : 'N';
    o.email_own_basis = best.own ? best.basis : (c.free ? 'free' : ''); o.email_person_shape = nm ? nm.pattern : '';
    o.email_source = 'site_harvest:' + c.rung; o.first_name_hint = nm ? nm.first : ''; o.last_name_hint = nm ? nm.last : '';
    st.with_email++; st[best.kind]++; if (best.own) st.own++; if (c.free) st.free++; if (best.basis === 'sibling') st.sibling++;
    if (rep !== r.place_id) st.from_rep++;
  } else { for (const k of ['email', 'email_type', 'email_own_domain', 'email_own_basis', 'email_person_shape', 'email_source', 'first_name_hint', 'last_name_hint']) o[k] = ''; }
  o.all_emails = ranked.map(x => x.email).join(';'); o.site_emails_all = [...raw.keys()].join(';');
  o.emails_from_rep = rep !== r.place_id && s ? 'Y' : ''; o.emails_dropped = dropped.join(';');
  out.push(o);
}
const cols = [...H, ...EXTRA.filter(c => !H.includes(c))];
if (!DRY) fs.writeFileSync(path.join(HERE, 'leads_qualified_contacts.csv'), cols.join(',') + '\n' + out.map(o => cols.map(c => esc(o[c])).join(',')).join('\n') + '\n');
console.log(JSON.stringify(st));
console.log('unique best emails', new Set(out.filter(o => o.email).map(o => o.email)).size, DRY ? '(dry run)' : '-> leads_qualified_contacts.csv');
