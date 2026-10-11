#!/usr/bin/env node
/* assemble.js :: build the operator's deliverable from the engine's outputs (deterministic, $0). Job-side only.
 * Reads (run folder): leads_annotated.csv (collapse-domains: every qualified row + website_class, root_domain, location_count,
 *   brand_family, rep_place_id) · excluded_officp.csv (directory-stage drops, drop_reason) · classify/out*, classify-noweb/out
 *   (STEP 5e verdicts: place_id, business_type, confidence, why, services_offered[], insurance_work, evidence, services) ·
 *   classify/text.jsonl (which text the reader saw: site vs directory profile) · owner/site_text.jsonl (fetch-sites: status,
 *   emails[], socials{}) · owner/contacts_final.jsonl (optional, owner names).
 * Verdict map (ICP-restoration-us.md): residential_restoration -> Qualified; restoration_unconfirmed | unclear -> Review;
 *   commercial_only | inspection_only | cleaning_only | adjacent_trade | not_restoration -> Exclude; directory-stage drops -> Exclude
 *   (exclude_stage directory_qualify); no verdict at all (no text anywhere) -> Review (unclear, classify_confidence 'fallback').
 * Siblings (rows sharing a representative's domain) inherit the representative's verdict, evidence and site emails — the text is
 *   the same brand site — and are marked evidence_source 'shared site'.
 * Usage: node assemble.js [--run <dir>] */
const fs = require('fs'), path = require('path');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const RUN = path.resolve(arg('run', __dirname));
const { rankEmails } = require(path.join(RUN, '..', '..', '..', 'skills', 'google-maps-scrape', 'email-rank.js'));
function pc(t) { const R = []; let r = [], c = '', q = false; t = t.replace(/^﻿/, ''); for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else { if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\n') { r.push(c); R.push(r); r = []; c = ''; } else if (ch === '\r') { } else c += ch; } } if (c !== '' || r.length) { r.push(c); R.push(r); } return R; }
const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
function readCsv(f) { if (!fs.existsSync(f)) return []; const R = pc(fs.readFileSync(f, 'utf8')).filter(r => r.length > 1); const H = R.shift(); return R.map(r => Object.fromEntries(H.map((h, i) => [h, r[i] == null ? '' : r[i]]))); }
function writeCsv(f, rows, cols) { fs.writeFileSync(f, [cols.map(esc).join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n') + '\n'); }
function readJsonl(f) { if (!fs.existsSync(f)) return []; return fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); }
const TRADE = ['restoration','restore','remediation','mold','water','fire','flood','dry','damage','cleanup','clean','pro','pros','environmental','services','solutions','company','inc','llc','group','team','emergency','rapid','response','servpro','servicemaster','puroclean'];
const VERDICT = { residential_restoration: 'Qualified', restoration_unconfirmed: 'Review', unclear: 'Review', commercial_only: 'Exclude', inspection_only: 'Exclude', cleaning_only: 'Exclude', adjacent_trade: 'Exclude', not_restoration: 'Exclude' };
const COLS = ['verdict','verdict_reason','classify_confidence','evidence_source','company_name','website','website_domain','google_maps_url','phone','email','email_source','street','city','state','zip','google_rating','google_reviews','pct_5star','open_24_7','services_directory','services_offered','services_summary','insurance_work','evidence','facebook_url','instagram_url','linkedin_url','owner_name','owner_title','owner_evidence','brand_family','org_group','location_count','is_multi_location','metro','exclude_stage','place_id','latitude','longitude','directory_url'];

function assemble(run) {
  const annotated = readCsv(path.join(run, 'leads_annotated.csv'));
  const drops = readCsv(path.join(run, 'excluded_officp.csv'));
  const verdicts = new Map();
  for (const d of ['classify/out', 'classify/out2', 'classify/out3', 'classify-noweb/out']) {
    const dir = path.join(run, d); if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) { try { for (const o of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8').replace(/^﻿/, ''))) if (o && o.place_id && o.business_type) verdicts.set(o.place_id, o); } catch (e) { console.error('WARN bad classify json ' + d + '/' + f); } }
  }
  const textSrc = new Map(); for (const o of readJsonl(path.join(run, 'classify', 'text.jsonl'))) textSrc.set(o.place_id, o.source === 'directory_profile' ? 'directory profile' : 'site');
  for (const o of readJsonl(path.join(run, 'ownwords_text.jsonl'))) if (!textSrc.has(o.place_id)) textSrc.set(o.place_id, 'directory profile');
  const site = new Map(); for (const o of readJsonl(path.join(run, 'owner', 'site_text.jsonl'))) if (o.place_id) site.set(o.place_id, o);
  const owners = new Map(); for (const o of readJsonl(path.join(run, 'owner', 'contacts_final.jsonl'))) if (o.place_id) owners.set(o.place_id, o);
  const rows = [];
  const cityState = s => { const m = String(s || '').match(/^(.*?),\s*([A-Z]{2})$/); return m ? { city: m[1], state: m[2] } : { city: s, state: '' }; };
  const street = (addr, city) => { const a = String(addr || ''); const i = a.indexOf(', ' + city); return i > 0 ? a.slice(0, i) : (a.split(',').length > 2 ? a.split(',')[0] : ''); };
  for (const r of annotated) {
    const rep = r.rep_place_id && r.rep_place_id !== r.place_id ? r.rep_place_id : '';
    let v = verdicts.get(r.place_id), inherited = false;
    if (!v && rep) { v = verdicts.get(rep); inherited = !!v; }
    const s = site.get(r.place_id) || (rep ? site.get(rep) : null);
    const sharedSite = !site.get(r.place_id) && !!s;
    const bt = v ? v.business_type : 'unclear';
    const verdict = VERDICT[bt] || 'Review';
    const cands = s ? (s.emails || []) : [];
    const ranked = rankEmails(cands, r.root_domain || '', { tradeWords: TRADE });
    const best = ranked[0];
    const soc = (s && s.socials) || {};
    const first = a => Array.isArray(a) && a.length ? a[0] : '';
    const own = owners.get(r.place_id);
    const { city, state } = cityState(r.city);
    rows.push({
      verdict, verdict_reason: bt, classify_confidence: v ? (v.confidence || '') : 'fallback',
      evidence_source: !v ? '' : (inherited || sharedSite ? 'shared site' : (textSrc.get(rep || r.place_id) || textSrc.get(r.place_id) || 'site')),
      company_name: r.name, website: r.website, website_domain: r.root_domain, google_maps_url: r.place_link, phone: r.phone_number,
      email: best ? best.email : '', email_source: best ? (sharedSite ? 'site (shared domain)' : 'site') : '',
      street: street(r.full_address, city), city, state, zip: r.zip, google_rating: r.rating, google_reviews: r.review_count, pct_5star: r.pct_5star,
      open_24_7: r.hours ? 'yes' : '', services_directory: r.google_types.split('|').map(t => t.replace(/ service$/, '')).join(' | '),
      services_offered: v && Array.isArray(v.services_offered) ? v.services_offered.join(' | ') : '', services_summary: v ? (v.services || '') : '',
      insurance_work: v ? (v.insurance_work === true ? 'yes' : v.insurance_work === false ? 'no' : '') : '', evidence: v ? (v.evidence || '') : '',
      facebook_url: first(soc.facebook), instagram_url: first(soc.instagram), linkedin_url: first(soc.linkedin),
      owner_name: own ? (own.primary_name || '') : '', owner_title: own ? ((own.contacts || [])[0] || {}).title || '' : '', owner_evidence: own ? ((own.contacts || [])[0] || {}).evidence || '' : '',
      brand_family: r.brand_family, org_group: r.root_domain, location_count: r.location_count, is_multi_location: r.is_multi_location, metro: r.metro,
      exclude_stage: verdict === 'Exclude' ? 'site_text' : '', place_id: r.place_id, latitude: r.latitude, longitude: r.longitude, directory_url: r.directory_url,
    });
  }
  for (const r of drops) {
    const { city, state } = cityState(r.city);
    rows.push({ verdict: 'Exclude', verdict_reason: r.drop_reason, classify_confidence: '', evidence_source: '', company_name: r.name, website: r.website, website_domain: '', google_maps_url: r.place_link, phone: r.phone_number, email: '', email_source: '', street: street(r.full_address, city), city, state, zip: r.zip, google_rating: r.rating, google_reviews: r.review_count, pct_5star: r.pct_5star, open_24_7: r.hours ? 'yes' : '', services_directory: r.google_types.split('|').map(t => t.replace(/ service$/, '')).join(' | '), services_offered: '', services_summary: '', insurance_work: '', evidence: '', facebook_url: '', instagram_url: '', linkedin_url: '', owner_name: '', owner_title: '', owner_evidence: '', brand_family: '', org_group: '', location_count: '', is_multi_location: '', metro: r.metro, exclude_stage: 'directory_qualify', place_id: r.place_id, latitude: r.latitude, longitude: r.longitude, directory_url: r.directory_url });
  }
  const out = path.join(run, 'deliverable'); fs.mkdirSync(out, { recursive: true });
  writeCsv(path.join(out, 'restoration_all.csv'), rows, COLS);
  for (const v of ['Qualified', 'Review', 'Exclude']) writeCsv(path.join(out, `restoration_${v.toLowerCase()}.csv`), rows.filter(r => r.verdict === v), COLS);
  const cnt = (arr, k) => { const m = {}; for (const r of arr) m[r[k] || ''] = (m[r[k] || ''] || 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const q = rows.filter(r => r.verdict === 'Qualified');
  const pct = (n, d) => d ? (100 * n / d).toFixed(1) + '%' : '-';
  const lines = [];
  lines.push('# Atlas Growth — US restoration contractors (remediational.com) — deliverable summary', '', `Built ${new Date().toISOString().slice(0, 10)} from \`${path.basename(run)}\`. Source: remediational.com directory (29,837 listings, $0).`, '');
  lines.push('## Totals', '', '| verdict | rows |', '|---|---|'); for (const [k, n] of cnt(rows, 'verdict')) lines.push(`| ${k} | ${n} |`);
  lines.push('', '## Verdict reasons', '', '| reason | rows |', '|---|---|'); for (const [k, n] of cnt(rows, 'verdict_reason')) lines.push(`| ${k} | ${n} |`);
  lines.push('', '## Qualified: field fill', '', '| field | filled | % |', '|---|---|---|');
  for (const f of ['website', 'phone', 'email', 'street', 'facebook_url', 'instagram_url', 'owner_name', 'evidence']) { const n = q.filter(r => r[f]).length; lines.push(`| ${f} | ${n} | ${pct(n, q.length)} |`); }
  lines.push('', '## Qualified by evidence source', '', '| source | rows |', '|---|---|'); for (const [k, n] of cnt(q, 'evidence_source')) lines.push(`| ${k || '(none)'} | ${n} |`);
  lines.push('', '## Qualified: franchise / brand families (kept and flagged)', '', '| brand | rows |', '|---|---|'); for (const [k, n] of cnt(q, 'brand_family')) lines.push(`| ${k || '(independent)'} | ${n} |`);
  lines.push('', '## Qualified by state', '', '| state | rows |', '|---|---|'); for (const [k, n] of cnt(q, 'state')) lines.push(`| ${k} | ${n} |`);
  lines.push('', '## Qualified: review bands', '', '| band | rows |', '|---|---|');
  const bands = [['0', 0, 0], ['1-4', 1, 4], ['5-19', 5, 19], ['20-49', 20, 49], ['50-99', 50, 99], ['100+', 100, 1e9]];
  for (const [b, lo, hi] of bands) lines.push(`| ${b} | ${q.filter(r => { const n = parseFloat(r.google_reviews) || 0; return n >= lo && n <= hi; }).length} |`);
  lines.push('', '## Qualified: insurance work mentioned', '', '| insurance_work | rows |', '|---|---|'); for (const [k, n] of cnt(q, 'insurance_work')) lines.push(`| ${k || '(unknown)'} | ${n} |`);
  fs.writeFileSync(path.join(out, 'summary.md'), lines.join('\n') + '\n');
  console.log(`deliverable: ${rows.length} rows -> ${out}`); console.log('verdicts:', JSON.stringify(Object.fromEntries(cnt(rows, 'verdict'))));
  console.log('qualified email fill:', q.filter(r => r.email).length, '/', q.length);
}
assemble(RUN);
