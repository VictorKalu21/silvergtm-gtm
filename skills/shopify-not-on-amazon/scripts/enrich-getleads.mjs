// STEP 9d · Decision makers via the GetLeads hosted MCP (https://app.getleads.io/api/mcp, Bearer key), used to fill rows QuickEnrich
// missed. lookup_decision_makers returns C-suite / VP / Director / Head / President / Founder contacts with valid emails; 1 credit per
// contact returned, 0 when none; `limit` caps the spend per company. Resume-safe cache {RUN}_getleads.json.
//
//   GETLEADS_KEY=glb_live_... RUN=<run> DIR=<dir> node enrich-getleads.mjs input_dm.csv [output.csv]   # env: LIMIT_PER (3), ONLY_MISSING (1)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const KEY = process.env.GETLEADS_KEY; if (!KEY) { console.error('GETLEADS_KEY missing'); process.exit(1); }
const DIR = process.env.DIR || '.', RUN = process.env.RUN || 'run', [IN, OUT] = [process.argv[2], process.argv[3] || process.argv[2].replace(/\.csv$/, '_gl.csv')];
const LIMIT_PER = Number(process.env.LIMIT_PER || 3), ONLY_MISSING = process.env.ONLY_MISSING !== '0', MODE = process.env.MODE || 'decision_makers';   // MODE=colleagues -> getleads_lookup_colleagues with the agreed titles
const TITLES = 'Founder,Co-Founder,Owner,CEO,President,Head of Ecommerce,VP Ecommerce,Director of Ecommerce,Head of Growth,VP Growth,CMO,VP Marketing,Head of Marketing'.split(',');
const rank = (title) => { const t = (title || '').toLowerCase(); if (/assistant|human resources|\bhr\b|intern|coordinator|associate|specialist|analyst/.test(t)) return 999;
  const i = TITLES.findIndex((x) => new RegExp('(^|[^a-z])' + x.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)').test(t) && !(x.toLowerCase() === 'president' && /vice president|vp\b/.test(t))); return i < 0 ? 500 : i; };   // 500 = a decision maker outside the agreed list (VP/Director) - kept as a fallback
function parse(t) { const rows = []; let f = [], c = '', q = false; for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else if (ch === '"') q = true; else if (ch === ',') { f.push(c); c = ''; } else if (ch === '\n') { f.push(c); rows.push(f); f = []; c = ''; } else if (ch !== '\r') c += ch; } if (c.length || f.length) { f.push(c); rows.push(f); } return rows; }
const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const MCP = 'https://app.getleads.io/api/mcp'; let sid = null, id = 0;
async function rpc(method, params) {
  const res = await fetch(MCP, { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(sid ? { 'Mcp-Session-Id': sid } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }), signal: AbortSignal.timeout(60000) });
  sid = res.headers.get('mcp-session-id') || sid; const raw = await res.text(); const m = raw.match(/data: (\{.*\})/); return JSON.parse(m ? m[1] : raw);
}
await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'shopify-not-on-amazon', version: '1.0' } });
const CACHE = `${DIR}/${RUN}_getleads${MODE === 'colleagues' ? '_colleagues' : ''}.json`; const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
// the output always merges BOTH GetLeads caches (decision makers + colleagues) so a second pass never hides the first pass's finds
const OTHER = `${DIR}/${RUN}_getleads${MODE === 'colleagues' ? '' : '_colleagues'}.json`; const other = existsSync(OTHER) ? JSON.parse(readFileSync(OTHER, 'utf8')) : {};
const allContacts = (d) => [...((cache[d] || {}).contacts || []), ...((other[d] || {}).contacts || [])];
const rows = parse(readFileSync(IN, 'utf8')); const head = rows.shift(); const wi = head.indexOf('Website'); const fi = head.indexOf('Final Email'); const di = fi >= 0 ? fi : head.lastIndexOf('Decision Maker');   // "missing" = no Final Email (or no QuickEnrich DM)
const F = (p, k) => p[k] ?? p[k.toLowerCase().replace(/ /g, '_')] ?? '';
// lookup_decision_makers returns title-cased keys ("First Name", "Current Job Title"); lookup_colleagues returns snake_case (first_name, email_address, job_title)
const norm = (p) => ({ first: F(p, 'First Name') || p.first_name || '', last: F(p, 'Last Name') || p.last_name || '', email: F(p, 'Email') || p.email_address || '', title: F(p, 'Current Job Title') || p.job_title || F(p, 'title'), linkedin: F(p, 'Contact LinkedIn URL') || p.person_linkedin_url || '', phone: F(p, 'Cellphone') || p.cellphone || '', status: F(p, 'Email Verification Status') || p.email_status || '' });
const dom = (w) => (w || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase();
let credits = 0, remaining = null, hits = 0, n = 0;
for (const r of rows) {
  const d = dom(r[wi]); if (!d) continue; if (ONLY_MISSING && di >= 0 && r[di]) continue; n++;
  if (!cache[d]) {
    try { const args = MODE === 'colleagues' ? { email_domain: d, job_titles: TITLES, limit_per_item: LIMIT_PER, context: 'Filling decision maker and work email for a client lead list of Shopify brands that do not sell on Amazon.' } : { domain: d, limit: LIMIT_PER, require_email: true, context: 'Filling decision maker and work email for a client lead list of Shopify brands that do not sell on Amazon.' };
      const j = await rpc('tools/call', { name: MODE === 'colleagues' ? 'getleads_lookup_colleagues' : 'lookup_decision_makers', arguments: args });
      const text = j.result?.content?.[0]?.text || '{}'; const o = JSON.parse(text); cache[d] = { contacts: o.contacts || o.results || o.items || [], credits: o.query_credits_used ?? o.credits_used ?? 0, remaining: o.creditsRemaining ?? o.credits_remaining, total: o.total_available ?? o.total, raw: (o.contacts || o.results || o.items) ? undefined : text.slice(0, 300) }; }
    catch (e) { cache[d] = { contacts: [], error: String(e.message) }; }
    credits += cache[d].credits || 0; if (cache[d].remaining != null) remaining = cache[d].remaining;
    writeFileSync(CACHE, JSON.stringify(cache, null, 1)); await new Promise((r) => setTimeout(r, 300));
  }
  const people = (cache[d].contacts || []).map(norm).filter((p) => p.email).sort((a, b) => rank(a.title) - rank(b.title)); if (people.length) hits++;
  const p = people[0]; console.error(`  ${n} ${d} -> ${p ? `${p.first} ${p.last} (${p.title}) ${p.email}` : 'no match'}${cache[d].credits ? ' | ' + cache[d].credits + ' credit(s)' : ''}`);
}
// output: GetLeads columns + a FINAL decision-maker block = QuickEnrich when it found one, else GetLeads (agreed titles first, other execs as fallback)
const qi = { dm: head.lastIndexOf('Decision Maker'), title: head.lastIndexOf('DM Title'), email: head.lastIndexOf('DM Email'), phone: head.lastIndexOf('DM Phone'), li: head.lastIndexOf('DM LinkedIn') };
const extra = ['GL Decision Maker', 'GL Title', 'GL Email', 'GL LinkedIn', 'GL Phone', 'GL Alternates', 'GetLeads credits', 'Final Decision Maker', 'Final Title', 'Final Email', 'Final Phone', 'Final LinkedIn', 'Final Source'];
const out = [head.concat(extra).map(esc).join(',')];
for (const r of rows) { const d = dom(r[wi]); const c = cache[d] || {}; const people = allContacts(d).map(norm).filter((p) => p.email).sort((a, b) => rank(a.title) - rank(b.title)); const p = people[0] || {};
  const nm = (x) => [x.first, x.last].filter(Boolean).join(' ');
  const qe = qi.dm >= 0 && r[qi.dm] ? { dm: r[qi.dm], title: r[qi.title], email: r[qi.email], phone: r[qi.phone], li: r[qi.li], src: 'QuickEnrich' } : null;
  const fin = qe || (p.email ? { dm: nm(p), title: p.title, email: p.email, phone: p.phone, li: p.linkedin, src: rank(p.title) < 500 ? 'GetLeads' : 'GetLeads (exec outside title list)' } : { dm: '', title: '', email: '', phone: '', li: '', src: '' });
  out.push(r.concat([nm(p), p.title || '', p.email || '', p.linkedin || '', p.phone || '', people.slice(1, 3).map((x) => `${nm(x)} (${x.title}) ${x.email}`).join(' | '), (c.credits ?? 0) + ((other[d] || {}).credits ?? 0) || '', fin.dm, fin.title, fin.email, fin.phone, fin.li, fin.src]).map(esc).join(',')); }
writeFileSync(OUT, out.join('\n'));
console.error(`===== GETLEADS DONE ===== ${hits}/${n} domains with a decision maker | credits used this run ${credits} | remaining ${remaining ?? '?'} -> ${OUT}`);
