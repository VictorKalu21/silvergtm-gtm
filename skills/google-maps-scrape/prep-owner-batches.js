#!/usr/bin/env node
/* prep-owner-batches.js — build the batch files a MODEL reads with the job's owner-prompt.md.
 *
 * This is the in-session counterpart of the Clay column (SKILL STEP 6, flow 1b): deterministic
 * Node assembles per-lead evidence from what is already on disk; a Haiku subagent per batch
 * applies owner-prompt.md and writes batch-N-out.json; merge-owner-reads.js joins it back.
 * The model is the ONLY reader. No regex names anything here.
 *
 *   node prep-owner-batches.js --leads <leads_icp.csv> --dir <out>/owner --out <out>/owner/read
 *        [--batch 40] [--cap-site 3000] [--cap-page 4000] [--cap-serp 2500] [--only-missing <contacts.jsonl>]
 *        [--ch <companies_house.jsonl>[,<companies_house_lowconf.jsonl>,<companies_house_pass2.jsonl>]]
 *
 * Reads (all optional except leads): <dir>/site_text.jsonl, <dir>/owner_pages.jsonl,
 *   <dir>/serp/serp_text.jsonl, <dir>/sweep.jsonl + <dir>/site_recovered.jsonl (web-search evidence),
 *   and the --ch registry files (paths as given, or relative to <dir>).
 * Writes: <out>/batches/batch-<N>-in.json, <out>/manifest.json, <out>/skipped_none.json
 *
 * COMPANIES HOUSE IS EVIDENCE (IMPROVEMENTS.md 2026-09-17): the registry block used to be injected
 * into the batches by a separate step AFTER this script had already dropped every lead with no page
 * text — on the UK run that silently lost 192 leads that carried active CH officers, the only
 * evidence an address-less service-area listing will ever have. `--ch` injects `ch_directors` HERE,
 * before the skip decision, so the skip test is "no evidence of ANY kind"; `skipped_none.json`
 * records a reason per lead (`no_text` = a source produced something for the lead but no readable
 * text — a site fetched empty, a CH match with no active officers; `nothing` = no source had it at
 * all) so the two stop being the same number.
 */
const fs = require('fs'), path = require('path');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const LEADS = arg('leads'), DIR = arg('dir'), OUT = arg('out');
const BATCH = parseInt(arg('batch', '40'), 10);
const CAP_SITE = parseInt(arg('cap-site', '3000'), 10), CAP_PAGE = parseInt(arg('cap-page', '4000'), 10), CAP_SERP = parseInt(arg('cap-serp', '2500'), 10);
const ONLY_MISSING = arg('only-missing', '');
const CH = arg('ch', '');
if (!LEADS || !DIR || !OUT) { console.error('usage: --leads <csv> --dir <owner dir> --out <read dir>'); process.exit(1); }

const strip = s => s.replace(/^﻿/, '');
function csv(f) { const L = strip(fs.readFileSync(f, 'utf8')).split(/\r?\n/).filter(l => l.trim()); const H = parse(L.shift()); return L.map(l => { const c = parse(l); return Object.fromEntries(H.map((h, i) => [h, c[i] ?? ''])); }); }
function parse(l) { const c = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { c.push(cur); cur = ''; } else cur += ch; } c.push(cur); return c; }
function jsonl(f) { const m = new Map(); if (!fs.existsSync(f)) return m; for (const l of strip(fs.readFileSync(f, 'utf8')).split(/\r?\n/)) { if (!l.trim()) continue; try { const d = JSON.parse(l); if (d.place_id) m.set(d.place_id, d); } catch (e) { } } return m; }

// Site text arrives as "=== <label> (<url>)\n<text>" sections. Rank people-bearing pages first.
const PEOPLE = /(about|team|meet|staff|owner|founder|leadership|who-we-are|our-story|management)/i;
function pickSite(text, cap) {
  if (!text) return '';
  const secs = text.split(/(?=^=== )/m).map(s => s.trim()).filter(Boolean);
  secs.sort((a, b) => (PEOPLE.test(b.split('\n')[0]) ? 1 : 0) - (PEOPLE.test(a.split('\n')[0]) ? 1 : 0));
  let out = ''; for (const s of secs) { if (out.length >= cap) break; out += (out ? '\n\n' : '') + s.slice(0, cap - out.length); }
  return out;
}
const squash = s => (s || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

// ---- Companies House ---------------------------------------------------------------------------
// Rendered EXACTLY as the job-side inject_ch_directors.py rendered it, because owner-prompt.md keys
// on this wording: the `[matched|low_confidence match]` tag, the DEMOTED sentence, and the pass-2
// records' own confidence string. Do not reword without rewording the prompt's registry rule.
function chTag(file) { const b = path.basename(file).toLowerCase(); return /pass2/.test(b) ? 'pass2' : /lowconf|low_confidence|candidate/.test(b) ? 'low_confidence' : 'matched'; }
function loadCh(spec) {
  const all = new Map(), dir = new Map();          // all = every record (source-presence); dir = renderable
  for (const raw of String(spec || '').split(',').map(s => s.trim()).filter(Boolean)) {
    const file = fs.existsSync(raw) ? raw : path.join(DIR, raw);
    if (!fs.existsSync(file)) { console.error('WARN: --ch file not found: ' + raw); continue; }
    const tag = chTag(file);
    for (const [pid, o] of jsonl(file)) {
      // a record the registry could not match is the registry saying "nothing" — it is not a source
      // that HAD this lead, so it must not turn a `nothing` skip into a `no_text` one
      if (!all.has(pid) && (o.matched || (o.officers || []).length)) all.set(pid, o);
      if (!(o.officers || []).length) continue;
      if (dir.has(pid) && tag !== 'matched') continue;   // an engine match wins over a candidate
      // The file supplies the tag, EXCEPT: pass-2 records carry their own, and an engine match the
      // city-only demotion relabelled carries `low_confidence` + `demoted_reason`, so the reader
      // sees `[low_confidence match]` and applies owner-prompt.md Companies House rule 3.
      let conf = tag;
      if (tag === 'pass2') conf = o.confidence || 'pass2';
      else if (tag === 'matched' && o.demoted_reason) conf = o.confidence || 'low_confidence';
      dir.set(pid, { confidence: conf, demoted: o.demoted_reason || '', company: o.ch_company, number: o.ch_number, officers: o.officers });
    }
  }
  return { all, dir };
}
function chBlock(c) {
  const lines = c.officers.slice(0, 8).map(x => `${x.name} — ${x.role} (appointed ${x.appointed_on ?? ''})`);
  const demo = c.demoted ? `  (DEMOTED: ${c.demoted} — the ONLY basis for this match was the town name, so it is a `
    + `CANDIDATE, not authoritative: apply Companies House rule 3 before you output anybody from it)` : '';
  return `Companies House [${c.confidence} match]${demo}: ${c.company} (${c.number})\n` + lines.join('\n');
}

const leads = csv(LEADS);
const site = jsonl(path.join(DIR, 'site_text.jsonl'));
const pages = jsonl(path.join(DIR, 'owner_pages.jsonl'));
const serp = jsonl(path.join(DIR, 'serp', 'serp_text.jsonl'));
const sweep = jsonl(path.join(DIR, 'sweep.jsonl')), recovered = jsonl(path.join(DIR, 'site_recovered.jsonl'));
const ch = CH ? loadCh(CH) : { all: new Map(), dir: new Map() };
const already = ONLY_MISSING ? new Set([...jsonl(ONLY_MISSING).values()].filter(d => (d.contacts || []).length).map(d => d.place_id)) : new Set();

const items = [], skipped = [];
for (const r of leads) {
  if (already.has(r.place_id)) continue;
  const s = site.get(r.place_id), p = pages.get(r.place_id), q = serp.get(r.place_id);
  const web = [...(sweep.get(r.place_id)?.contacts || []), ...(recovered.get(r.place_id)?.contacts || [])]
    .map(c => `${c.name}${c.title ? ' — ' + c.title : ''}: "${c.evidence || ''}"`).join('\n');
  const item = {
    place_id: r.place_id, business_name: r.name, full_address: r.full_address, zip: r.zip, neighborhood: r.neighborhood,
    city: r.city, state: r.state, website: r.website, brand_family: r.brand_family || '',
    emails: s?.emails || [],
    site_text: squash(pickSite(s?.text, CAP_SITE)),
    owner_page_url: p?.url || '', owner_page_text: squash((p?.text || '').slice(0, CAP_PAGE)),
    serp_text: squash([q?.biased_text, q?.linkedin_text, q?.broad_text].filter(Boolean).join('\n---\n').slice(0, CAP_SERP)),
    web_search_evidence: web,
    ch_directors: ch.dir.has(r.place_id) ? chBlock(ch.dir.get(r.place_id)) : '',
  };
  // skip only on NO EVIDENCE OF ANY KIND — the registry counts, and for a service-area lead it is
  // the only evidence there will ever be. Record WHY, so "no text" and "nothing at all" differ.
  if (!item.site_text && !item.owner_page_text && !item.serp_text && !item.web_search_evidence && !item.ch_directors) {
    const seen = site.has(r.place_id) || pages.has(r.place_id) || serp.has(r.place_id) || sweep.has(r.place_id) || recovered.has(r.place_id) || ch.all.has(r.place_id);
    skipped.push({ place_id: r.place_id, reason: seen ? 'no_text' : 'nothing' }); continue;
  }
  items.push(item);
}
fs.mkdirSync(path.join(OUT, 'batches'), { recursive: true });
let n = 0; for (let i = 0; i < items.length; i += BATCH) { fs.writeFileSync(path.join(OUT, 'batches', `batch-${n}-in.json`), JSON.stringify(items.slice(i, i + BATCH), null, 1)); n++; }
const byReason = skipped.reduce((a, s) => (a[s.reason] = (a[s.reason] || 0) + 1, a), {});
const manifest = { leads: leads.length, skipped_already: already.size, skipped_none: skipped.length, skipped_none_by_reason: byReason,
  items: items.length, with_ch_directors: items.filter(i => i.ch_directors).length, batches: n, batch_size: BATCH,
  caps: { site: CAP_SITE, page: CAP_PAGE, serp: CAP_SERP }, sources: { site: site.size, owner_pages: pages.size, serp: serp.size, web_search: sweep.size + recovered.size, ch: ch.dir.size } };
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(OUT, 'skipped_none.json'), JSON.stringify(skipped));
console.log(JSON.stringify(manifest));
