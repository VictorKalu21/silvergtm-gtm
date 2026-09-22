// STEP 8/9 merge.
//   node merge.mjs classify   # Haiku verdicts (by DOMAIN, never index) x signal -> {RUN}_keeps.json (+ _dropped_classify.csv)
//   node merge.mjs final      # keeps x amazon_ac x amazon_verify x optional {RUN}_people.csv (Apollo export)
//                             #   -> {RUN}_LEADS.csv (deliverable columns) + {RUN}_LEADS_full.csv + {RUN}_excluded_amazon.csv + {RUN}_needs_check.csv
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const DIR = process.env.DIR || '.', RUN = process.env.RUN || 'run', MODE = process.argv[2] || 'classify';
const rd = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8').replace(/^﻿/, ''));
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const csv = (cols, rows) => [cols.join(',')].concat(rows.map((r) => cols.map((c) => esc(Array.isArray(r[c]) ? r[c].join(' | ') : r[c])).join(','))).join('\n');
function parseCsv(text) { const rows = []; let f = [], cur = '', q = false; for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === ',') { f.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; if (cur !== '' || f.length) { f.push(cur); rows.push(f); f = []; cur = ''; } } else cur += c; } if (cur !== '' || f.length) { f.push(cur); rows.push(f); } return rows; }
const rows = rd(`${RUN}_signal.json`);

if (MODE === 'classify') {
  const vmap = new Map(); let total = 0;
  for (let b = 0; existsSync(`${DIR}/${RUN}_review_batch_${b}_out.json`); b++) for (const v of rd(`${RUN}_review_batch_${b}_out.json`)) if (v && v.domain) { vmap.set(v.domain.trim().toLowerCase(), v); total++; }
  const survivors = rows.filter((r) => r.status === 'pass_free_gates');
  const keeps = [], dropped = [], unmatched = [];
  for (const r of survivors) {
    const v = vmap.get(r.domain.toLowerCase());
    if (!v) { unmatched.push(r); continue; }
    if (v.isKeep) keeps.push({ ...r, text: undefined, category: v.category || '', classifyReason: v.reason || '' });
    else dropped.push({ domain: r.domain, rank: r.rank, brand: r.shopName, dropReason: v.reason || v.category || 'not_brand' });
  }
  writeFileSync(`${DIR}/${RUN}_keeps.json`, JSON.stringify(keeps, null, 1));
  writeFileSync(`${DIR}/${RUN}_dropped_classify.csv`, csv(['domain', 'rank', 'brand', 'dropReason'], dropped));
  if (unmatched.length) writeFileSync(`${DIR}/${RUN}_unmatched.json`, JSON.stringify(unmatched.map((r) => r.domain), null, 1));
  console.error(`===== ${RUN} CLASSIFY MERGE (by domain) ===== survivors ${survivors.length}, verdicts ${total}`);
  console.error(`  KEEP: ${keeps.length} -> ${RUN}_keeps.json | dropped ${dropped.length} | UNMATCHED (re-run): ${unmatched.length}`);
} else if (MODE === 'final') {
  const keeps = rd(`${RUN}_keeps.json`);
  const ac = existsSync(`${DIR}/${RUN}_amazon_ac.json`) ? rd(`${RUN}_amazon_ac.json`) : {};
  const vf = existsSync(`${DIR}/${RUN}_amazon_verify.json`) ? rd(`${RUN}_amazon_verify.json`) : {};
  // optional Apollo people export, matched by domain; best title wins
  const people = new Map();
  if (existsSync(`${DIR}/${RUN}_people.csv`)) {
    const t = parseCsv(readFileSync(`${DIR}/${RUN}_people.csv`, 'utf8').replace(/^﻿/, '')); const head = t.shift().map((h) => h.trim().toLowerCase());
    const ix = (names) => head.findIndex((h) => names.includes(h));
    const iF = ix(['first name']), iL = ix(['last name']), iT = ix(['title']), iE = ix(['email']), iP = ix(['corporate phone', 'work direct phone', 'mobile phone', 'phone']), iLi = ix(['person linkedin url', 'linkedin url']), iW = ix(['website', 'company website', 'company domain', 'domain']);
    const PRI = [/founder|ceo|owner|president|chief executive/i, /e-?commerce|marketplace|amazon|digital|dtc|online/i, /marketing|growth|brand|revenue|sales|operations|coo|cmo/i];
    const score = (title) => { const i = PRI.findIndex((p) => p.test(title || '')); return i < 0 ? 9 : i; };
    for (const r of t) { const d = (r[iW] || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''); if (!d) continue;
      const p = { name: `${r[iF] || ''} ${r[iL] || ''}`.trim(), title: r[iT] || '', email: r[iE] || '', phone: iP >= 0 ? r[iP] : '', linkedin: iLi >= 0 ? r[iLi] : '' };
      const prev = people.get(d); if (!prev || score(p.title) < score(prev.title)) people.set(d, p); }
  }
  const trafficText = (r) => { const k = r.rank; if (!k) return 'rank n/a'; const src = r.rankSource || 'Tranco'; const band = k <= 50000 ? 'very high (100k+/mo likely)' : k <= 100000 ? 'high (50k+/mo likely)' : k <= 250000 ? 'medium (20-50k/mo est.)' : 'low'; return `${src} #${k.toLocaleString('en-US')} - ${band}`; };
  const STATUS = { none: 'No Amazon presence found (rendered search, verified {d})', listings_3p: 'Unauthorized resellers only - no brand store, not sold by brand (verified {d})', listings_unverified: 'Listings exist - seller not verified', brand_store: 'Brand store on Amazon (official)', listings_official: 'Sold by brand / Amazon.com (official)', blocked: 'Not checked (Amazon throttled)' };
  const leads = [], excluded = [], needs = [];
  for (const k of keeps) {
    const a = ac[k.domain], v = vf[k.domain]; const st = v?.amazon_status || (a ? (a.demand === 'none' ? 'listings_unverified' : 'listings_unverified') : 'blocked');
    const p = people.get(k.domain) || {};
    const row = {
      'Brand': k.shopName || k.brand || k.domain, 'Website': `https://${k.domain}`, 'Category': k.category || '', 'Estimated Traffic/Sales': trafficText(k),
      'Amazon Presence Status': (STATUS[st] || st).replace('{d}', v?.checkedAt || ''),
      'Email': p.email || (k.emails || [])[0] || '', 'Phone': p.phone || (k.phones || [])[0] || '', 'LinkedIn': p.linkedin || (k.linkedin ? `https://www.linkedin.com/company/${k.linkedin}` : ''),
      'Decision Maker': p.name ? `${p.name} - ${p.title}` : '',
      // extras
      'State': k.province || '', 'City': k.city || '', 'Products': k.productCount, 'Median price': k.medianPrice, 'Instagram': k.instagram ? `https://instagram.com/${k.instagram}` : '', 'All emails': k.emails || [],
      'Amazon demand (autocomplete)': a?.demand || '', 'Amazon evidence': v?.storeHref || (v?.evidence || []).map((e) => e.asin).join(' | ') || '', 'Amazon seller seen': v?.seller || '', 'Rank': k.rank, 'Stack': k.stack || '', 'Classify note': k.classifyReason || '', 'Ambiguous name': a?.ambiguous ? 'yes' : '',
    };
    if (st === 'none' || st === 'listings_3p') leads.push(row); else if (st === 'brand_store' || st === 'listings_official') excluded.push(row); else needs.push(row);
  }
  const DELIV = ['Brand', 'Website', 'Category', 'Estimated Traffic/Sales', 'Amazon Presence Status', 'Email', 'Phone', 'LinkedIn', 'Decision Maker'];
  const FULL = [...DELIV, 'State', 'City', 'Products', 'Median price', 'Instagram', 'All emails', 'Amazon demand (autocomplete)', 'Amazon evidence', 'Amazon seller seen', 'Rank', 'Stack', 'Classify note', 'Ambiguous name'];
  writeFileSync(`${DIR}/${RUN}_LEADS.csv`, csv(DELIV, leads)); writeFileSync(`${DIR}/${RUN}_LEADS_full.csv`, csv(FULL, leads));
  writeFileSync(`${DIR}/${RUN}_excluded_amazon.csv`, csv(FULL, excluded)); writeFileSync(`${DIR}/${RUN}_needs_check.csv`, csv(FULL, needs));
  console.error(`===== ${RUN} FINAL ===== keeps ${keeps.length}`);
  console.error(`  LEADS (no official Amazon presence): ${leads.length} -> ${RUN}_LEADS.csv  (${leads.filter((r) => /resellers/.test(r['Amazon Presence Status'])).length} reseller-only)`);
  console.error(`  excluded (official on Amazon): ${excluded.length} | needs manual check / unverified: ${needs.length}`);
  console.error(`  decision makers filled: ${leads.filter((r) => r['Decision Maker']).length}/${leads.length}  emails: ${leads.filter((r) => r.Email).length}/${leads.length}`);
} else { console.error('usage: node merge.mjs [classify|final]'); process.exit(1); }
