#!/usr/bin/env node
/* build-upload.js — sequencer file for the MillionVerifier-ok rows, through the engine's build-plusvibe.js `base` (STEP 7b) as intended:
 *   1. verify/mv_results_1000.csv rows with mv_result=ok -> upload/emails_final_601.csv in the engine's emails_final shape
 *      (verdict=sendable, email, place_id, contact_name, email_kind personal|company, found_by)
 *   2. build-plusvibe.js base  (THE NAME RULE: first/last name ride an address only when its local part is built from that person's name)
 *   3. extras joined on (cleaned company name, phone, review_count, rating, owner flag, email_type, needs_review, ...) -> upload/plusvibe_601.csv
 * No personalisation (fill) step: no concrete personalize-config exists; the placeholder columns stay blank. No PlusVibe API call.
 */
const fs = require('fs'), { spawnSync } = require('child_process');
const E = '../../../skills/google-maps-scrape/'; const { csv } = require(E + 'build-plusvibe.js');
const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const wr = (f, H, rs) => fs.writeFileSync(f, [H.join(',')].concat(rs.map(r => H.map(h => esc(r[h])).join(','))).join('\n') + '\n');
const ok = csv('verify/mv_results_1000.csv').filter(r => r.mv_result === 'ok');
const EH = ['verdict', 'email', 'place_id', 'contact_name', 'email_kind', 'found_by'];
wr('upload/emails_final_601.csv', EH, ok.map(r => ({ verdict: 'sendable', email: r.Email.toLowerCase(), place_id: r.place_id, contact_name: r.contact_name || '', email_kind: r.name_tied === 'yes' ? 'personal' : 'company', found_by: r.source })));
const b = spawnSync(process.execPath, [E + 'build-plusvibe.js', 'base', '--leads', 'leads_in_domains.csv', '--emails', 'upload/emails_final_601.csv', '--contacts', 'owner_in/contacts_final.jsonl', '--out', 'upload/plusvibe_base_601.csv'], { encoding: 'utf8' });
console.log('base:', b.stdout.trim(), b.stderr.trim());
const base = new Map(csv('upload/plusvibe_base_601.csv').map(r => [r.place_id, r]));
const L = new Map(csv('leads_in_domains.csv').map(r => [r.place_id, r]));
const C = new Map(); for (const l of fs.readFileSync('owner_in/contacts_final.jsonl', 'utf8').split('\n').filter(Boolean)) { const d = JSON.parse(l); C.set(d.place_id, d); }
// cleaned company name: drop legal suffixes + trailing punctuation, normalise ALL CAPS / all lower, collapse spaces; flag suspicious shapes
const SUF = /[\s,.\-]+(l\.?\s?l\.?\s?c\.?|inc\.?|incorporated|corp\.?|corporation|co\.?|ltd\.?|llp|l\.?l\.?p\.?|pllc|pc|p\.?c\.?)\s*\.?$/i;
function clean(n) { let s = String(n || '').replace(/\s+/g, ' ').trim(); for (let i = 0; i < 3; i++) s = s.replace(SUF, '').trim(); s = s.replace(/[\s,.\-|:;&]+$/, '').replace(/^[\s,.\-|:;]+/, '').trim();
  if (s && s === s.toUpperCase() && /[A-Z]{3}/.test(s)) s = s.toLowerCase().replace(/(^|[\s'&(-])([a-z])/g, (m, a, c) => a + c.toUpperCase());
  else if (s && s === s.toLowerCase()) s = s.replace(/(^|[\s'&(-])([a-z])/g, (m, a, c) => a + c.toUpperCase());
  return s; }
function flags(raw, cl, city) { const f = []; const w = cl.split(/\s+/).filter(Boolean);
  if (w.length > 6) f.push('long_keyword_stuffed'); if (/[|–—]|\s-\s|:/.test(raw)) f.push('has_separator_tagline'); if (/\b(best|#\s?1|no\.?\s?1|affordable|cheap|top|near me|free (est|quote)|24\/7|licensed)\b/i.test(raw)) f.push('marketing_words');
  if (city && city.length > 2 && new RegExp('\\b' + city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(raw)) f.push('contains_city'); if (/\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/.test(raw)) f.push('contains_phone');
  if (cl.length < 3) f.push('too_short'); if (/[^\x00-\x7F]/.test(raw)) f.push('non_ascii'); if (/^(the\s)?(concrete|cement|paving|driveway|patio|stamped)\s*(contractors?|company|services|work|pros?)?$/i.test(cl)) f.push('generic_trade_name'); return f; }
const dig = p => String(p || '').replace(/\D/g, '').slice(-10);
const out = []; const WARM = new Set('FL TX AZ CA GA NV NC SC TN AL LA MS OK AR NM HI UT VA'.split(' '));
const strictWarn = [];
for (const r of ok) {
  const bs = base.get(r.place_id); if (!bs) continue; const l = L.get(r.place_id) || {}, c = C.get(r.place_id);
  const cn = clean(l.name), fl = flags(l.name, cn, (l.city || '').split(',')[0]);
  // guard on top of the engine's name rule (see the probe: 'brianpermenter@' vs owner Robert Permenter via the nickname rule): a >2-letter prefix before the surname that is not the first name -> nameless
  let fn = bs.first_name, ln = bs.last_name, nb = bs.name_basis;
  if (fn) { const loc = bs.email.split('@')[0].toLowerCase().replace(/[^a-z]/g, ''), la = ln.toLowerCase().replace(/[^a-z]/g, ''), fa = fn.toLowerCase().replace(/[^a-z]/g, ''); const at = la.length >= 4 ? loc.indexOf(la) : -1; if (at > 2) { const pre = loc.slice(0, at); if (!(fa.startsWith(pre) || pre.startsWith(fa))) { fn = ''; ln = ''; nb = 'none_guarded'; } } }
  out.push({ first_name: fn, last_name: ln, email: bs.email, company_name_clean: cn, company_name_raw: l.name, city: bs.city, state: bs.state || l.state, website: bs.website, phone: dig(l.phone_number).length >= 10 ? l.phone_number : '', review_count: l.review_count, rating: l.rating,
    owner_flag: c ? (c.primary_is_owner ? 'owner' : 'not_owner') : 'unknown_owner', email_type: r.email_type, email_kind: r.email_kind, name_basis: nb, needs_review: r.needs_review, company_name_flags: fl.join('|'), personalized_email: '', business_type: '', project_type: '', mv_result: r.mv_result, mv_role: r.mv_role, place_id: r.place_id, root_domain: l.root_domain });
}
const H = Object.keys(out[0]); wr('upload/plusvibe_601.csv', H, out);
const cnt = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const probe = new Set(); for (const f of ['verify/queue.csv', 'verify/rank2.csv']) for (const x of csv('../2026-11-11_us-concrete-contractors-yp/' + f)) probe.add(String(x.Email || x.email || '').toLowerCase());
const rep = { ok_rows_in: ok.length, rows_out: out.length, unique_emails: new Set(out.map(r => r.email.toLowerCase())).size, unique_leads: new Set(out.map(r => r.place_id)).size, overlap_with_probe_queue: out.filter(r => probe.has(r.email.toLowerCase())).length,
  out_of_warm_state_rows: out.filter(r => !WARM.has(r.state)).length, blank_state: out.filter(r => !r.state).length, state_counts: cnt(out, r => r.state),
  with_first_name: out.filter(r => r.first_name).length, without_first_name: out.filter(r => !r.first_name).length, name_basis: cnt(out, r => r.name_basis), first_name_by_email_type: cnt(out.filter(r => r.first_name), r => r.email_type), needs_review_rows: out.filter(r => r.needs_review).length,
  blank_city: out.filter(r => !r.city).length, with_phone: out.filter(r => r.phone).length, blank_review_count: out.filter(r => !r.review_count).length, owner_flag: cnt(out, r => r.owner_flag), email_type: cnt(out, r => r.email_type),
  company_name_changed_by_cleaning: out.filter(r => r.company_name_clean !== r.company_name_raw).length, company_name_flagged_rows: out.filter(r => r.company_name_flags).length, company_name_flag_types: cnt(out.filter(r => r.company_name_flags).flatMap(r => r.company_name_flags.split('|').map(f => ({ f }))), x => x.f) };
fs.writeFileSync('upload/dry_run_summary.json', JSON.stringify(rep, null, 2)); console.log(JSON.stringify(rep, null, 1));
