// STEP 9c · Decision maker + direct email via QuickEnrich (https://app.quickenrich.io/docs), run ONLY on the rows being delivered.
// One GET /api/employees/dataset-search per domain with the title list; QuickEnrich bills 1 credit per returned employee that has an
// email or phone, so the title list is the cost control (a company with three matching execs costs three credits). Resume-safe:
// {RUN}_quickenrich.json caches every response; re-running never re-bills a domain.
//
//   QUICKENRICH_KEY=qe_... RUN=<run> DIR=<dir> node enrich-quickenrich.mjs input.csv [output.csv]   # env: LIMIT, TITLES (comma list)
//   Output = input columns + Decision Maker / DM Title / DM Email / DM Email verified / DM Phone / DM LinkedIn / QuickEnrich credits
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const KEY = process.env.QUICKENRICH_KEY; if (!KEY) { console.error('QUICKENRICH_KEY missing'); process.exit(1); }
const DIR = process.env.DIR || '.', RUN = process.env.RUN || 'run', [IN, OUT] = [process.argv[2], process.argv[3] || process.argv[2].replace(/\.csv$/, '_dm.csv')];
// priority order = who the buyer wants to talk to first; the first match in this order is the Decision Maker column
// two tiers keep the bill down: QuickEnrich bills one credit per employee returned, and the `title` filter is capped at 255 characters.
// Tier 1 (owners) is searched first; tier 2 (ecommerce/growth/marketing leads) only when tier 1 finds nobody with an email.
const T1 = (process.env.TITLES_1 || 'Founder,Co-Founder,Owner,CEO,President').split(','), T2 = (process.env.TITLES_2 || 'COO,CMO,Head of Ecommerce,Director of Ecommerce,VP Ecommerce,Ecommerce Manager,Head of Growth,VP Growth,VP Marketing,Head of Marketing,Director of Marketing,General Manager').split(',');
const TITLES = [...T1, ...T2].map((t) => t.trim()).filter(Boolean);
for (const t of [T1, T2]) if (t.join(',').length > 255) { console.error('title list over 255 characters'); process.exit(1); }
const rank = (title) => { const t = (title || '').toLowerCase(); const i = TITLES.findIndex((x) => t.includes(x.toLowerCase())); return i < 0 ? 999 : i; };
function parse(t) { const rows = []; let f = [], c = '', q = false; for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else if (ch === '"') q = true; else if (ch === ',') { f.push(c); c = ''; } else if (ch === '\n') { f.push(c); rows.push(f); f = []; c = ''; } else if (ch !== '\r') c += ch; } if (c.length || f.length) { f.push(c); rows.push(f); } return rows; }
const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const CACHE = `${DIR}/${RUN}_quickenrich.json`; const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const rows = parse(readFileSync(IN, 'utf8')); const head = rows.shift(); const wi = head.indexOf('Website');
const dom = (w) => (w || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase();
let credits = 0, remaining = null, hits = 0, n = 0;
for (const r of rows) {
  if (process.env.LIMIT && n >= Number(process.env.LIMIT)) break; n++;
  const d = dom(r[wi]); if (!d) continue;
  if (!cache[d] || cache[d].status === 422 || cache[d].status === 0) {
    const call = async (titles) => { const u = new URL('https://app.quickenrich.io/api/employees/dataset-search'); u.searchParams.set('company_url', d); u.searchParams.set('title', titles.join(',')); u.searchParams.set('has_email', '1');
      try { const res = await fetch(u, { headers: { Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(30000) }); const j = await res.json(); return { status: res.status, data: j.data || [], meta: j.meta || {}, message: j.message }; }
      catch (e) { return { status: 0, data: [], meta: {}, error: String(e.message) }; } };
    let c = await call(T1); let used = c.meta?.credits_used || 0;
    if (c.status === 200 && !c.data.some((p) => p.email && p.email !== 'N/A')) { await new Promise((r) => setTimeout(r, 250)); const c2 = await call(T2); used += c2.meta?.credits_used || 0; if (c2.status === 200) c = { ...c2, data: [...c.data, ...c2.data], tier: 2 }; }
    c.meta = { ...(c.meta || {}), credits_used: used }; cache[d] = c;
    credits += used; if (c.meta?.remaining_credits != null) remaining = c.meta.remaining_credits;
    if (remaining !== null && remaining <= 0) { console.error('QuickEnrich credits exhausted; stopping'); writeFileSync(CACHE, JSON.stringify(cache, null, 1)); break; }
    writeFileSync(CACHE, JSON.stringify(cache, null, 1)); await new Promise((r) => setTimeout(r, 250));
  }
  const people = (cache[d].data || []).filter((p) => p.email && p.email !== 'N/A').sort((a, b) => rank(a.title) - rank(b.title));
  if (people.length) hits++;
  console.error(`  ${n}/${rows.length} ${d} -> ${people.length ? `${people[0].first_name} ${people[0].last_name} (${people[0].title}) ${people[0].email}` : 'no match'}${cache[d].meta?.credits_used ? ' | ' + cache[d].meta.credits_used + ' credit(s)' : ''}`);
}
const extra = ['Decision Maker', 'DM Title', 'DM Email', 'DM Email verified', 'DM Phone', 'DM LinkedIn', 'DM Alternates', 'QuickEnrich credits'];
const out = [head.concat(extra).map(esc).join(',')];
for (const r of rows) { const d = dom(r[wi]); const c = cache[d] || {}; const people = (c.data || []).filter((p) => p.email && p.email !== 'N/A').sort((a, b) => rank(a.title) - rank(b.title)); const p = people[0] || {};
  const alt = people.slice(1, 4).map((x) => `${x.first_name} ${x.last_name} (${x.title}) ${x.email}`).join(' | ');
  out.push(r.concat([p.first_name ? `${p.first_name} ${p.last_name}` : '', p.title || '', p.email || '', p.email_verification_date || '', p.employee_phone && p.employee_phone !== 'N/A' ? p.employee_phone : '', p.employee_linkedin && p.employee_linkedin !== 'N/A' ? p.employee_linkedin : '', alt, c.meta?.credits_used ?? '']).map(esc).join(',')); }
writeFileSync(OUT, out.join('\n'));
console.error(`===== QUICKENRICH DONE ===== ${hits}/${n} domains with a decision maker | credits used this run ${credits} | remaining ${remaining ?? '?'} -> ${OUT}`);
