#!/usr/bin/env node
/* build-plusvibe.js — STEP 7b: turn emails_final + contacts_final into a Plusvibe upload.
 *
 *   node build-plusvibe.js base  --leads <leads_icp.csv> --emails <owner/emails_final.csv> --contacts <owner/contacts_final.jsonl> --out <owner/plusvibe_base.csv>
 *   node build-plusvibe.js prep  --base <plusvibe_base.csv> --site <owner/site_text.jsonl> --dir <owner/personalize> [--batch 40] [--cap 4000]
 *   node build-plusvibe.js fill  --base <plusvibe_base.csv> --config <personalize-config.json> --dir <owner/personalize> --out <owner/plusvibe_upload.csv>
 *   node build-plusvibe.js check --csv <any plusvibe csv>          (exit 1 if any name rides an address it does not own)
 *
 * THE NAME RULE (the bug this file exists to prevent): a first/last name is attached to an address
 * ONLY when the address's local part is built from that person's name (f, fl, f.l, f_l, f-l, fil,
 * fli, l, lf, or starts-with-first + contains-last). A role mailbox (info@, office@, frontdesk@ ...)
 * is ALWAYS nameless, whatever an upstream "personal" tag says. Every row carries name_basis
 * (local_match | none) so the decision is auditable, and `check` re-applies the rule to any CSV
 * before upload. The rule needs no upstream trust: it is recomputable from the row alone.
 */
const fs = require('fs'), path = require('path');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const strip = s => s.replace(/^﻿/, '');
function parse(l) { const c = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { c.push(cur); cur = ''; } else cur += ch; } c.push(cur); return c; }
function csv(f) { const t = strip(fs.readFileSync(f, 'utf8')); const rows = []; let cur = '', q = false, lines = []; for (let i = 0; i < t.length; i++) { const ch = t[i]; if (ch === '"') q = !q; if ((ch === '\n' || ch === '\r') && !q) { if (cur.trim()) lines.push(cur); cur = ''; } else cur += ch; } if (cur.trim()) lines.push(cur); const H = parse(lines.shift()); for (const l of lines) { const c = parse(l); rows.push(Object.fromEntries(H.map((h, i) => [h, c[i] ?? '']))); } return rows; }
function jsonl(f) { const m = new Map(); if (!f || !fs.existsSync(f)) return m; for (const l of strip(fs.readFileSync(f, 'utf8')).split(/\r?\n/)) { if (!l.trim()) continue; try { const d = JSON.parse(l); if (d.place_id) m.set(d.place_id, d); } catch (e) { } } return m; }
const esc = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
function writeCsv(f, cols, rows) { fs.writeFileSync(f, cols.join(',') + '\n' + rows.map(r => cols.map(c => esc(r[c])).join(',')).join('\n') + (rows.length ? '\n' : '')); }

// ---- the name rule -------------------------------------------------------------------------
const ROLE = /^(info|office|contact|contactus|sales|admin|hello|hi|support|service|services|estimates?|quotes?|inquiry|inquiries|customerservice|customercare|help|team|mail|email|scheduling|schedule|dispatch|accounting|accounts|billing|marketing|jobs|careers|hr|frontdesk|reception|general|main|owner|president|manager|webmaster|noreply|no-reply|leads?|projects?|newsletter)$/i;
const letters = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
// common US nicknames: an owner signs "Joshua Alexander" on the About page and reads josh@
const NICK = { joshua: ['josh'], david: ['dave'], james: ['jim', 'jimmy'], jimmy: ['jim'], thomas: ['tom', 'tommy'], christopher: ['chris'], daniel: ['dan', 'danny'], robert: ['rob', 'bob', 'bobby'], william: ['will', 'bill', 'billy'], michael: ['mike'], patrick: ['pat'], richard: ['rick', 'rich', 'dick'], matthew: ['matt'], anthony: ['tony'], joseph: ['joe', 'joey'], jonathan: ['jon'], nicholas: ['nick'], timothy: ['tim'], steven: ['steve'], stephen: ['steve'], edward: ['ed', 'eddie'], charles: ['chuck', 'charlie'], kenneth: ['ken'], ronald: ['ron'], donald: ['don'], gregory: ['greg'], jeffrey: ['jeff'], benjamin: ['ben'], samuel: ['sam'], alexander: ['alex'], andrew: ['andy', 'drew'], douglas: ['doug'], raymond: ['ray'], lawrence: ['larry'], gerald: ['jerry'], jerome: ['jerry'], zachary: ['zach', 'zack'], nathaniel: ['nate'], nathan: ['nate'], jacob: ['jake'], elizabeth: ['liz', 'beth'], jennifer: ['jen'], katherine: ['kate', 'kathy'], kathryn: ['kate', 'kathy'], margaret: ['meg', 'peggy'], rebecca: ['becky'], deborah: ['deb', 'debbie'], susan: ['sue'], patricia: ['pat', 'patty'], victoria: ['vicky'], christina: ['chris', 'tina'] };
const forms = f => [f, ...(NICK[f] || [])];
function localOwns(email, first, last) {
  const raw = String(email || '').split('@')[0].toLowerCase();
  if (!raw || ROLE.test(raw)) return false;
  const local = letters(raw), l = letters(last);
  if (local.length < 2 || l.length < 2) return false;
  for (const f of forms(letters(String(first || '').trim().split(/\s+/)[0]))) {
    if (f.length < 2) continue;
    if ([f, f + l, f[0] + l, f + l[0], l, l + f, l + f[0], f[0] + l[0]].includes(local)) return true;   // luke, lukesanderson, lsanderson, lukes, sanderson, sandersonluke, sandersonl, ls
    if (f.length >= 3 && local.startsWith(f)) return true;                                          // josh@, garrettsales@, graham.mrcrawl@
    if (local[0] === f[0] && local.endsWith(l)) return true;                                        // jfpouwels@
    if (local[0] === f[0] && local.length >= 4 && l.startsWith(local.slice(1))) return true;       // gbev@ (Giulio Bevilacqua)
  }
  return l.length >= 5 && local.startsWith(l);                                                       // zablocki.inc@
}
function personFor(email, candidates) {
  for (const c of candidates) { const t = String(c || '').replace(/[.,]/g, '').trim().split(/\s+/); if (t.length < 2) continue; if (localOwns(email, t[0], t[t.length - 1])) return { first: t[0], last: t[t.length - 1] }; }
  return null;
}
// ---- city --------------------------------------------------------------------------------------
const STATES = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '));
function cityOf(L) {
  let c = (L.city || '').split(',')[0].trim();
  if (!c) { const m = /,\s*([A-Za-z .'-]+),\s*[A-Z]{2}\s*\d{5}/.exec(L.full_address || ''); c = m ? m[1].trim() : ''; }
  const t = c.split(/\s+/); if (t.length > 1 && STATES.has(t[t.length - 1].toUpperCase())) c = t.slice(0, -1).join(' ');
  return c;
}
function stateOf(L) { if (L.state) return L.state; const m = /,\s*([A-Z]{2})\b/.exec((L.city || '') + ' ' + (L.full_address || '')); return m ? m[1] : ''; }

const COLS = ['first_name', 'last_name', 'email', 'city', 'state', 'business_type', 'inspection_type', 'inspection_singular', 'project_type', 'personalized_email', 'business_name', 'website', 'google_types', 'name_basis', 'email_kind', 'found_by', 'place_id'];
module.exports = { localOwns, personFor, cityOf, csv };
if (require.main !== module) return;
const cmd = process.argv[2];

if (cmd === 'base') {
  const leads = new Map(csv(arg('leads')).map(r => [r.place_id, r]));
  const contacts = jsonl(arg('contacts'));
  const rows = [], rep = { emails_sendable: 0, no_lead: 0, rows: 0, named: 0, role_mailbox: 0, personal_tag_not_owned: 0, by_kind: {} };
  for (const e of csv(arg('emails'))) {
    if (e.verdict !== 'sendable') continue; rep.emails_sendable++;
    const L = leads.get(e.place_id); if (!L) { rep.no_lead++; continue; }
    const cands = [e.contact_name, ...(contacts.get(e.place_id)?.contacts || []).map(c => c.name)].filter(Boolean);
    const p = personFor(e.email, cands);
    if (!p && ROLE.test(e.email.split('@')[0])) rep.role_mailbox++;
    if (!p && e.email_kind === 'personal') rep.personal_tag_not_owned++;
    rows.push({ first_name: p?.first || '', last_name: p?.last || '', email: e.email, city: cityOf(L), state: stateOf(L), business_type: '', inspection_type: '', inspection_singular: '', project_type: '', personalized_email: '',
      business_name: L.name, website: L.website || '', google_types: L.google_types || '', name_basis: p ? 'local_match' : 'none', email_kind: e.email_kind, found_by: e.found_by, place_id: e.place_id });
  }
  // one row per lead: personal > registry > company, then a named row before an unnamed one
  const pri = { personal: 0, registry: 1, company: 2 }, best = new Map();
  const key = r => (pri[r.email_kind] ?? 3) * 2 + (r.first_name ? 0 : 1);
  for (const r of rows) { const b = best.get(r.place_id); if (!b || key(r) < key(b)) best.set(r.place_id, r); }
  const out = [...best.values()];
  rep.rows = out.length; rep.named = out.filter(r => r.first_name).length; for (const r of out) rep.by_kind[r.email_kind] = (rep.by_kind[r.email_kind] || 0) + 1;
  writeCsv(arg('out'), COLS, out); console.log(JSON.stringify(rep));
} else if (cmd === 'prep') {
  const base = csv(arg('base')), site = jsonl(arg('site')), dir = arg('dir'), B = parseInt(arg('batch', '40'), 10), CAP = parseInt(arg('cap', '4000'), 10);
  const bdir = path.join(dir, 'batches'); fs.mkdirSync(bdir, { recursive: true });
  const done = new Set(); let next = 0;
  for (const f of fs.readdirSync(bdir)) { const m = /^batch-(\d+)-(in|out)\.json$/.exec(f); if (!m) continue; next = Math.max(next, +m[1] + 1); if (m[2] === 'in') for (const it of JSON.parse(strip(fs.readFileSync(path.join(bdir, f), 'utf8')))) done.add(it.place_id); }
  const items = [], noSite = [];
  for (const r of base) { if (done.has(r.place_id)) continue; const t = site.get(r.place_id)?.text || ''; if (!t.trim()) { noSite.push(r.place_id); continue; }
    items.push({ place_id: r.place_id, business_name: r.business_name, city: r.city, state: r.state, google_types: r.google_types, website: r.website, website_text: t.slice(0, CAP) }); }
  const ids = []; for (let i = 0; i < items.length; i += B) { fs.writeFileSync(path.join(bdir, `batch-${next}-in.json`), JSON.stringify(items.slice(i, i + B), null, 1)); ids.push(next++); }
  fs.writeFileSync(path.join(dir, 'no_site_text.json'), JSON.stringify(noSite));
  console.log(JSON.stringify({ base: base.length, already_batched: done.size, no_site_text: noSite.length, items: items.length, new_batches: ids }));
} else if (cmd === 'fill') {
  const base = csv(arg('base')), cfg = JSON.parse(strip(fs.readFileSync(arg('config'), 'utf8'))), dir = arg('dir'), MAX = cfg.max_value_len || 60;
  const vals = new Map(); const bdir = path.join(dir, 'batches');
  // numeric order, so a later redo batch (batch-7 over batch-4) overrides the earlier value
  for (const f of fs.readdirSync(bdir).filter(f => /^batch-\d+-out\.json$/.test(f)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0])) { let o; try { o = JSON.parse(strip(fs.readFileSync(path.join(bdir, f), 'utf8'))); } catch (e) { console.error('unparseable ' + f); process.exit(1); } for (const [pid, v] of Object.entries(o)) vals.set(pid, v); }
  const clean = (k, v, known) => { let s = String(v ?? '').trim().replace(/^["'“”‘’]+|["'“”‘’.]+$/g, '').trim(); if (k === 'city') { if (known) return known; } if (!s || s.length > MAX || /cannot|unknown|n\/a/i.test(s)) return cfg.fallbacks[k] ?? ''; return s; };
  // consistency flags (deterministic, reported, never auto-corrected): the visit must not repeat the whole trade
  // phrase, and the outcome noun must belong to the trade (a foundation-repair shop does not sell 'waterproofing jobs')
  const OUTCOME = { 'foundation repair': ['repair'], 'basement waterproofing': ['waterproofing'], 'crawl space repair': ['repair', 'encapsulation'], 'concrete leveling': ['leveling', 'lifting'], 'house leveling': ['leveling', 'lifting'], 'slab repair': ['repair', 'leveling'] };
  const rep = { rows: base.length, personalized: 0, fallback_only: 0, blank_city: 0, flag_visit_repeats_trade: [], flag_outcome_off_trade: [] };
  for (const r of base) {
    const v = vals.get(r.place_id); if (v) rep.personalized++; else rep.fallback_only++;
    const filled = {}; for (const k of Object.keys(cfg.fallbacks)) filled[k] = clean(k, v?.[k], k === 'city' ? r.city : ''); 
    if (!filled.city) rep.blank_city++;
    if (filled.inspection_type.includes(filled.business_type)) rep.flag_visit_repeats_trade.push(r.place_id);
    if (OUTCOME[filled.business_type] && !OUTCOME[filled.business_type].includes(filled.project_type)) rep.flag_outcome_off_trade.push(r.place_id);
    for (const k of Object.keys(filled)) if (k in r) r[k] = filled[k];
    r.personalized_email = cfg.template.replace(/\{\{(\w+)\}\}/g, (_, k) => filled[k] ?? '');
  }
  // the name rule again, on the finished rows, so nothing upstream can reintroduce the bug
  const bad = base.filter(r => r.first_name && !localOwns(r.email, r.first_name, r.last_name));
  if (bad.length) { console.error('NAME RULE VIOLATION on ' + bad.length + ' rows:\n' + bad.map(r => `  ${r.first_name} ${r.last_name} <${r.email}>`).join('\n')); process.exit(1); }
  writeCsv(arg('out'), COLS, base); console.log(JSON.stringify(rep));
} else if (cmd === 'check') {
  const rows = csv(arg('csv'));
  const bad = rows.filter(r => r.first_name && !localOwns(r.email, r.first_name, r.last_name));
  const unfilled = rows.filter(r => /\{\{/.test(r.personalized_email || ''));
  console.log(JSON.stringify({ rows: rows.length, named: rows.filter(r => r.first_name).length, name_rule_violations: bad.length, unfilled_placeholders: unfilled.length }));
  for (const r of bad) console.log(`  VIOLATION ${r.first_name} ${r.last_name} <${r.email}> ${r.business_name}`);
  process.exit(bad.length || unfilled.length ? 1 : 0);
} else { console.error('usage: build-plusvibe.js base|prep|fill|check ...'); process.exit(1); }
