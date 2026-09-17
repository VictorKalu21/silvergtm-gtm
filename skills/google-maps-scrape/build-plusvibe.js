#!/usr/bin/env node
/* build-plusvibe.js — STEP 7b: turn emails_final + contacts_final into a Plusvibe upload.
 *
 *   node build-plusvibe.js base  --leads <leads_icp.csv> --emails <owner/emails_final.csv> --contacts <owner/contacts_final.jsonl> --out <owner/plusvibe_base.csv> [--city-overrides <owner/city_overrides.json>]
 *   node build-plusvibe.js prep  --base <plusvibe_base.csv> --site <owner/site_text.jsonl> --dir <owner/personalize> [--batch 40] [--cap 4000]
 *   node build-plusvibe.js fill  --base <plusvibe_base.csv> --config <personalize-config.json> --dir <owner/personalize> --out <owner/plusvibe_upload.csv>
 *   node build-plusvibe.js redo  --dir <owner/personalize>              (next batch-N-in.json from the last fill's flags; exits 2 when nothing to redo)
 *   node build-plusvibe.js check --csv <any plusvibe csv>          (exit 1 if any name rides an address it does not own, or a placeholder value holds a line break)
 *   node build-plusvibe.js city-fallback --base <plusvibe_base.csv> --out <owner/city_overrides.json> [--leads <leads_icp.csv>] [--site-read <dir>]
 *                                        [--area-words <json>] [--districts <json>] [--user-agent <ua>] [--geocode-fixture <json>]
 *                                                                 (three rungs for a blank city; writes the place_id -> city file `base --city-overrides` reads)
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
// a placeholder value is dropped into one sentence: an embedded newline/tab ships a broken email
const flat = v => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
const PLACEHOLDER_COLS = ['business_type', 'inspection_type', 'inspection_singular', 'project_type', 'city'];
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
// A blank city is a broken email ("Noticed you do damp proofing around ."): a service-area listing
// carries no address, so `base` writes ''. `city-fallback` fills it from three rungs and writes the
// job-side place_id -> city file that `base --city-overrides` reads. Nothing here is engine data.
const DISTRICTS_DEFAULT = ['Fylde', 'Babergh', 'Mole Valley', 'Tonbridge and Malling', 'Wyre', 'North Hertfordshire', 'Huntingdonshire', 'Cherwell', 'Malvern Hills', 'Breckland', 'West Devon', 'Kirklees', 'Rushcliffe', 'Harborough', 'Cotswold', 'Greater London', 'Greater Manchester'];
const norm = v => flat(v).toLowerCase();
// Nominatim at zoom 14: `town` is a town; `city` is often a DISTRICT (Fylde, Mole Valley, Kirklees)
// and must be rejected; `village` is right but reads oddly in "around X", so it only wins when
// neither a town nor an acceptable city is there.
function pickGeocodeCity(address, districts) {
  const d = new Set((districts || DISTRICTS_DEFAULT).map(norm));
  const a = address || {}, town = flat(a.town), city = flat(a.city), village = flat(a.village);
  if (town) return { city: town, rung: 'geocode_town' };
  if (city && !d.has(norm(city))) return { city, rung: 'geocode_city' };
  if (village) return { city: village, rung: 'geocode_village' };
  return { city: '', rung: '' };
}
function loadDistricts(file) {
  if (!file) return DISTRICTS_DEFAULT.slice();
  const j = JSON.parse(strip(fs.readFileSync(file, 'utf8')));
  if (Array.isArray(j)) return j.map(String);                       // a list replaces the seed outright
  let d = DISTRICTS_DEFAULT.slice().concat((j.add || []).map(String));
  const drop = new Set((j.remove || []).map(norm));
  return d.filter(x => !drop.has(norm(x)));
}
// ['South West'] or {"South West": "the South West"} — the job supplies the wording, longest match wins
function loadAreaWords(file) {
  if (!file) return [];
  const j = JSON.parse(strip(fs.readFileSync(file, 'utf8')));
  const pairs = Array.isArray(j) ? j.map(x => [x, x]) : Object.entries(j);
  return pairs.map(([k, v]) => ({ match: norm(k), out: flat(v) })).filter(a => a.match);
}
function matchArea(name, list) { const n = norm(name); let best = null; for (const a of list) if (n.includes(a.match) && (!best || a.match.length > best.match.length)) best = a; return best ? best.out : ''; }
// keyless reverse geocode, one request per second, a User-Agent as the usage policy requires
const UA_DEFAULT = 'silvergtm-gtm google-maps-scrape city-fallback';
function nominatim(userAgent) {
  let last = 0;
  return async (pid, lat, lon) => {
    const wait = 1000 - (Date.now() - last); if (wait > 0) await new Promise(r => setTimeout(r, wait)); last = Date.now();
    try {
      const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
      const res = await fetch(u, { headers: { 'User-Agent': userAgent || UA_DEFAULT, Accept: 'application/json' } });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  };
}
// rung 1: batch outputs of a focused site re-read (same batch-out shape, value `city`), numeric order
function siteReadCities(dir) {
  const m = new Map(); if (!dir) return m;
  for (const d of [dir, path.join(dir, 'batches')]) {
    if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d).filter(f => /-out\.json$/.test(f)).sort((a, b) => (+(a.match(/\d+/) || [0])[0]) - (+(b.match(/\d+/) || [0])[0]))) {
      let o; try { o = JSON.parse(strip(fs.readFileSync(path.join(d, f), 'utf8'))); } catch (e) { continue; }
      for (const [pid, v] of Object.entries(o || {})) { const c = flat(v && typeof v === 'object' ? v.city : v); if (c) m.set(pid, c); }
    }
  }
  return m;
}
async function cityFallback(o) {
  const base = csv(o.base);
  const leads = o.leads ? new Map(csv(o.leads).map(r => [r.place_id, r])) : new Map();
  const site = siteReadCities(o.siteRead), districts = o.districts || DISTRICTS_DEFAULT, areas = o.areaWords || [];
  const need = base.filter(r => !flat(r.city));
  const out = {}, rep = { rows: base.length, blank_city: need.length, rung1_site_read: 0, rung2_geocode: 0, rung3_county_or_name: 0,
    site_read: 0, geocoded: 0, geocode_failed: 0, geocode_town: 0, geocode_city: 0, geocode_village: 0, district_rejected: 0, county: 0, name_area: 0, unresolved: 0, resolved: 0 };
  for (const r of need) {
    const take = (city, rung, group) => { out[r.place_id] = city; rep[rung]++; rep[group]++; rep.resolved++; };
    const hit = site.get(r.place_id);
    if (hit) { take(hit, 'site_read', 'rung1_site_read'); continue; }
    const L = leads.get(r.place_id) || {}, lat = flat(r.latitude || L.latitude), lon = flat(r.longitude || L.longitude);
    let county = '';
    if (lat && lon) {
      const j = await o.geocode(r.place_id, lat, lon);
      if (j) {
        rep.geocoded++; const a = j.address || {}; county = flat(a.county);
        const cityRaw = flat(a.city); if (cityRaw && !flat(a.town) && new Set(districts.map(norm)).has(norm(cityRaw))) rep.district_rejected++;
        const p = pickGeocodeCity(a, districts);
        if (p.city) { take(p.city, p.rung, 'rung2_geocode'); continue; }
      } else rep.geocode_failed++;
    }
    if (county) { take(county, 'county', 'rung3_county_or_name'); continue; }
    const area = matchArea(r.business_name || r.name || L.name || '', areas);
    if (area) { take(area, 'name_area', 'rung3_county_or_name'); continue; }
    rep.unresolved++;
  }
  if (o.out) fs.writeFileSync(o.out, JSON.stringify(out, null, 1));
  return { report: rep, overrides: out };
}

const COLS = ['first_name', 'last_name', 'email', 'city', 'state', 'business_type', 'inspection_type', 'inspection_singular', 'project_type', 'personalized_email', 'business_name', 'website', 'google_types', 'name_basis', 'email_kind', 'found_by', 'place_id'];
module.exports = { localOwns, personFor, cityOf, csv, flat, pickGeocodeCity, matchArea, cityFallback, DISTRICTS_DEFAULT, PLACEHOLDER_COLS };
if (require.main !== module) return;
const cmd = process.argv[2];

if (cmd === 'base') {
  const leads = new Map(csv(arg('leads')).map(r => [r.place_id, r]));
  const contacts = jsonl(arg('contacts'));
  // a job-side place_id -> city file (see `city-fallback`), applied before the fill so the override
  // is a first-class input instead of a hand patch of plusvibe_base.csv
  const ovr = arg('city-overrides') ? JSON.parse(strip(fs.readFileSync(arg('city-overrides'), 'utf8'))) : {};
  const rows = [], rep = { emails_sendable: 0, no_lead: 0, rows: 0, named: 0, role_mailbox: 0, personal_tag_not_owned: 0, city_overrides_applied: 0, blank_city: 0, by_kind: {} };
  for (const e of csv(arg('emails'))) {
    if (e.verdict !== 'sendable') continue; rep.emails_sendable++;
    const L = leads.get(e.place_id); if (!L) { rep.no_lead++; continue; }
    const cands = [e.contact_name, ...(contacts.get(e.place_id)?.contacts || []).map(c => c.name)].filter(Boolean);
    const p = personFor(e.email, cands);
    if (!p && ROLE.test(e.email.split('@')[0])) rep.role_mailbox++;
    if (!p && e.email_kind === 'personal') rep.personal_tag_not_owned++;
    rows.push({ first_name: p?.first || '', last_name: p?.last || '', email: e.email, city: flat(ovr[e.place_id]) || flat(cityOf(L)), state: stateOf(L), business_type: '', inspection_type: '', inspection_singular: '', project_type: '', personalized_email: '',
      business_name: L.name, website: L.website || '', google_types: L.google_types || '', name_basis: p ? 'local_match' : 'none', email_kind: e.email_kind, found_by: e.found_by, place_id: e.place_id });
  }
  // one row per lead: personal > registry > company, then a named row before an unnamed one
  const pri = { personal: 0, registry: 1, company: 2 }, best = new Map();
  const key = r => (pri[r.email_kind] ?? 3) * 2 + (r.first_name ? 0 : 1);
  for (const r of rows) { const b = best.get(r.place_id); if (!b || key(r) < key(b)) best.set(r.place_id, r); }
  const out = [...best.values()];
  rep.rows = out.length; rep.named = out.filter(r => r.first_name).length; for (const r of out) rep.by_kind[r.email_kind] = (rep.by_kind[r.email_kind] || 0) + 1;
  rep.city_overrides_applied = out.filter(r => flat(ovr[r.place_id])).length; rep.blank_city = out.filter(r => !r.city).length;
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
  // flat() first: a value with an embedded newline ('Hastings \nProud To Be A Respected') is one
  // sentence's worth of text, and it must be single-line BEFORE the length check decides on it
  const clean = (k, v, known) => { let s = flat(v).replace(/^["'“”‘’]+|["'“”‘’.]+$/g, '').trim(); if (k === 'city') { if (flat(known)) return flat(known); } if (!s || s.length > MAX || /cannot|unknown|n\/a/i.test(s)) return cfg.fallbacks[k] ?? ''; return s; };
  // consistency flags (deterministic, reported, never auto-corrected): the visit must not repeat the whole trade
  // phrase, and the outcome noun must belong to the trade (a foundation-repair shop does not sell 'waterproofing jobs')
  // the table is the CLIENT'S, not the engine's: cfg.outcome_by_type (business_type -> [allowed
  // project_type]) with the US foundation-repair run's table as the default. A business_type the
  // table does not hold cannot be checked, so it is counted and WARNed — an unchecked run must
  // never read as a clean one (fill_report's empty flag_outcome_off_trade used to say "checked").
  const OUTCOME_US_DEFAULT = { 'foundation repair': ['repair'], 'basement waterproofing': ['waterproofing'], 'crawl space repair': ['repair', 'encapsulation'], 'concrete leveling': ['leveling', 'lifting'], 'house leveling': ['leveling', 'lifting'], 'slab repair': ['repair', 'leveling'] };
  const OUTCOME = cfg.outcome_by_type || OUTCOME_US_DEFAULT;
  const outcomeTable = cfg.outcome_by_type ? 'config outcome_by_type' : 'engine default (US foundation repair)';
  const unchecked = new Map();
  const rep = { rows: base.length, personalized: 0, fallback_only: 0, blank_city: 0, outcome_table: outcomeTable, outcome_unchecked: 0, outcome_unchecked_types: [], flag_visit_repeats_trade: [], flag_outcome_off_trade: [], flag_word_used_3x: [], flag_free_in_visit: [] };
  for (const r of base) {
    const v = vals.get(r.place_id); if (v) rep.personalized++; else rep.fallback_only++;
    const filled = {}; for (const k of Object.keys(cfg.fallbacks)) filled[k] = clean(k, v?.[k], k === 'city' ? r.city : ''); 
    if (!filled.city) rep.blank_city++;
    if (filled.inspection_type.includes(filled.business_type)) rep.flag_visit_repeats_trade.push(r.place_id);
    if (OUTCOME[filled.business_type]) { if (!OUTCOME[filled.business_type].includes(filled.project_type)) rep.flag_outcome_off_trade.push(r.place_id); }
    else { rep.outcome_unchecked++; unchecked.set(filled.business_type, (unchecked.get(filled.business_type) || 0) + 1); }
    const words = (filled.business_type + ' ' + filled.inspection_type + ' ' + filled.project_type).toLowerCase().split(/\s+/);
    if (words.some(w => words.filter(x => x === w).length >= 3)) rep.flag_word_used_3x.push(r.place_id);   // 'concrete leveling / leveling estimates / leveling jobs'
    if (/\bfree\b/i.test(filled.inspection_type)) rep.flag_free_in_visit.push(r.place_id);
    for (const k of Object.keys(filled)) if (k in r) r[k] = filled[k];
    r.personalized_email = cfg.template.replace(/\{\{(\w+)\}\}/g, (_, k) => filled[k] ?? '');
  }
  rep.outcome_unchecked_types = [...unchecked.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} (${n})`);
  if (rep.outcome_unchecked) console.error(`WARN: flag_outcome_off_trade CHECKED NOTHING on ${rep.outcome_unchecked} of ${rep.rows} rows — their business_type is not in the ${outcomeTable} table: ${rep.outcome_unchecked_types.join(', ')}. Add an "outcome_by_type" block to the config or this guardrail is inert.`);
  // the name rule again, on the finished rows, so nothing upstream can reintroduce the bug
  const bad = base.filter(r => r.first_name && !localOwns(r.email, r.first_name, r.last_name));
  if (bad.length) { console.error('NAME RULE VIOLATION on ' + bad.length + ' rows:\n' + bad.map(r => `  ${r.first_name} ${r.last_name} <${r.email}>`).join('\n')); process.exit(1); }
  fs.writeFileSync(path.join(dir, 'fill_report.json'), JSON.stringify(rep, null, 2));
  writeCsv(arg('out'), COLS, base); console.log(JSON.stringify(rep));
} else if (cmd === 'redo') {
  // every flagged place_id from the last fill becomes the next batch; its values override on the next fill
  const dir = arg('dir'), bdir = path.join(dir, 'batches'), rep = JSON.parse(strip(fs.readFileSync(path.join(dir, 'fill_report.json'), 'utf8')));
  const ids = new Set(Object.entries(rep).filter(([k]) => k.startsWith('flag_')).flatMap(([, v]) => v));
  const items = new Map(); let next = 0;
  for (const f of fs.readdirSync(bdir)) { const m = /^batch-(\d+)-in\.json$/.exec(f); if (!m) continue; next = Math.max(next, +m[1] + 1); for (const it of JSON.parse(strip(fs.readFileSync(path.join(bdir, f), 'utf8')))) items.set(it.place_id, it); }
  const redo = [...ids].filter(id => items.has(id)).map(id => items.get(id));
  const noSite = [...ids].filter(id => !items.has(id));
  if (!redo.length) { console.log(JSON.stringify({ redo: 0, flagged_without_site_text: noSite })); process.exit(2); }
  fs.writeFileSync(path.join(bdir, `batch-${next}-in.json`), JSON.stringify(redo, null, 1));
  console.log(JSON.stringify({ redo: redo.length, batch: next, flagged_without_site_text: noSite }));
} else if (cmd === 'check') {
  const rows = csv(arg('csv'));
  const bad = rows.filter(r => r.first_name && !localOwns(r.email, r.first_name, r.last_name));
  const unfilled = rows.filter(r => /\{\{/.test(r.personalized_email || ''));
  // a placeholder value rides inside one sentence: a line break in it ships a broken email
  const breaks = []; for (const r of rows) for (const c of PLACEHOLDER_COLS) if (/[\r\n]/.test(r[c] || '')) breaks.push([c, r]);
  console.log(JSON.stringify({ rows: rows.length, named: rows.filter(r => r.first_name).length, name_rule_violations: bad.length, unfilled_placeholders: unfilled.length, linebreak_values: breaks.length }));
  for (const r of bad) console.log(`  VIOLATION ${r.first_name} ${r.last_name} <${r.email}> ${r.business_name}`);
  for (const [c, r] of breaks) console.log(`  LINEBREAK ${c} <${r.email}> ${JSON.stringify(r[c])}`);
  process.exit(bad.length || unfilled.length || breaks.length ? 1 : 0);
} else if (cmd === 'city-fallback') {
  const fixture = arg('geocode-fixture');
  const fx = fixture ? JSON.parse(strip(fs.readFileSync(fixture, 'utf8'))) : null;
  const geocode = fx ? async (pid, lat, lon) => fx[pid] ?? fx[`${lat},${lon}`] ?? null : nominatim(arg('user-agent', UA_DEFAULT));
  cityFallback({ base: arg('base'), leads: arg('leads'), siteRead: arg('site-read'), out: arg('out'),
    districts: loadDistricts(arg('districts')), areaWords: loadAreaWords(arg('area-words')), geocode })
    .then(({ report }) => console.log(JSON.stringify(report)))
    .catch(e => { console.error(String(e && e.stack || e)); process.exit(1); });
} else { console.error('usage: build-plusvibe.js base|prep|fill|redo|check|city-fallback ...'); process.exit(1); }
