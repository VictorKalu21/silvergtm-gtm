// Google Cloud Partner Finder → union of capped (≤30) facet queries per country (Tier-0 batchexecute RPC, no auth).
// Usage: node gcp-finder.mjs US CA IL   → data/ai-reserve/gcp-partners.jsonl + gcp-partners.csv
// Request: f.req=[[["EkbYOc", JSON("[kw|null, [null,null,[cc],null,[[competency,[lvl]]],[[tier_gcp_service,[t]]]], null, 30"), null, "generic"]]]
// Slots: 3 = country codes · 5 = competency facets · 6 = tier facets · page size (max 30, no cursor) → split any ≥29 result by keyword.
import fs from 'node:fs';
const EP = 'https://cloud.google.com/find-a-partner/_/PartnerFinder/data/batchexecute?rpcids=EkbYOc&source-path=%2Ffind-a-partner%2F&hl=en-US';
const PROFILE = 'https://cloud.google.com/find-a-partner/_/PartnerFinder/data/batchexecute?rpcids=aqkqoe&source-path=%2Ffind-a-partner%2F&hl=en-US';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36';
const OUT = process.env.OUT_DIR || 'data/ai-reserve';
const countries = process.argv.slice(2); if (!countries.length) { console.error('give country codes'); process.exit(1); }
const TIERS = [2, 3, 4]; // 2 Select · 3 Premier · 4 Diamond (Google Cloud • Services)
const COMPS = ['artificial_intelligence', 'gemini_enterprise', 'data_analytics', 'application_modernization', 'infrastructure_modernization', 'security', 'databases', 'looker', 'apigee', 'chrome_enterprise', 'maps', 'work_transformation', 'financial_services', 'healthcare_and_life_sciences', 'retail_and_consumer_goods', 'telecommunications_media_and_gaming', 'manufacturing', 'public_sector', 'education', 'energy_and_utilities', 'supply_chain_and_logistics', 'marketing_analytics', 'devops', 'sap_on_google_cloud', 'machine_learning', 'cloud_migration'];
const KW = ['cloud', 'data', 'ai', 'tech', 'consult', 'digital', 'labs', 'solutions', 'systems', 'group', 'partners', 'services', 'software', 'analytics', 'managed', 'devops', 'security', 'inc', 'llc', 'ltd', 'global', 'it', 'net', 'soft', 'logic', 'ware', 'one', 'pro', ...'abcdefghijklmnopqrstuvwxyz', ...'0123456789'];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function parse(raw) { const i = raw.indexOf('[["wrb.fr"'); if (i < 0) return null; let depth = 0, j = i, inStr = false, esc = false; for (; j < raw.length; j++) { const c = raw[j]; if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; } if (c === '"') inStr = true; else if (c === '[') depth++; else if (c === ']') { depth--; if (depth === 0) { j++; break; } } } const arr = JSON.parse(raw.slice(i, j)); return arr[0][2] ? JSON.parse(arr[0][2]) : null; }
async function rpc(url, inner, tries = 4) { const body = new URLSearchParams({ 'f.req': JSON.stringify([[[url === EP ? 'EkbYOc' : 'aqkqoe', JSON.stringify(inner), null, 'generic']]]) }); for (let t = 0; t < tries; t++) { try { const r = await fetch(url, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body }); if (!r.ok) throw new Error('HTTP ' + r.status); return parse(await r.text()); } catch (e) { if (t === tries - 1) throw e; await sleep(1200 * (t + 1)); } } }
const strip = (h) => (h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#39;|&amp;|&quot;/g, m => ({ '&nbsp;': ' ', '&#39;': "'", '&amp;': '&', '&quot;': '"' }[m])).replace(/\s+/g, ' ').trim();
const walkStr = (x, out = []) => { if (Array.isArray(x)) x.forEach(y => walkStr(y, out)); else if (typeof x === 'string') out.push(x); return out; };
function row(r, cc) { const p = r[0] || []; const strs = walkStr(p); return { profile_id: p[0], legal_entity: p[1], name: p[2], tagline: p[3], description: strip(p[4]).slice(0, 1200), countries: [...new Set(strs.filter(s => /^[A-Z]{2}$/.test(s)))].join(';'), slug: typeof p[p.length - 1] === 'string' && !/\//.test(p[p.length - 1]) ? p[p.length - 1] : (strs.find(s => /^[a-z0-9-]+$/.test(s) && s.length > 3 && !/^[a-z]{2}$/.test(s)) || ''), tiers_raw: JSON.stringify(r[1] || []).slice(0, 400), comps_raw: JSON.stringify(r[2] || []).slice(0, 600), found_via: cc, score: typeof r[r.length - 1] === 'number' ? r[r.length - 1] : null }; }
const seen = new Map(); let calls = 0;
async function query(kw, cc, comp, lvl, tier, label) {
  const filt = [null, null, [cc], null, comp ? [[`competency_${comp}`, [lvl]]] : null, tier ? [['tier_gcp_service', [tier]]] : null];
  const p = await rpc(EP, [kw, filt, null, 30]); calls++; const rows = (p && p[0]) || []; let added = 0;
  for (const r of rows) { const o = row(r, label); if (!o.profile_id) continue; if (!seen.has(o.profile_id)) { seen.set(o.profile_id, o); added++; } else { const e = seen.get(o.profile_id); if (!e.found_via.includes(label)) e.found_via += '|' + label; } }
  return { n: rows.length, added };
}
for (const cc of countries) {
  const before = seen.size;
  for (const tier of TIERS) {
    const base = await query(null, cc, null, null, tier, `${cc}:t${tier}`);
    const capped = base.n >= 29;
    for (const comp of COMPS) for (const lvl of [1, 2]) { const r = await query(null, cc, comp, lvl, tier, `${cc}:t${tier}:${comp}${lvl}`); if (r.n >= 29) for (const k of KW) await query(k, cc, comp, lvl, tier, `${cc}:t${tier}:${comp}${lvl}:${k}`); await sleep(80); }
    if (capped) for (const k of KW) await query(k, cc, null, null, tier, `${cc}:t${tier}:kw:${k}`);
  }
  for (const k of KW) await query(k, cc, null, null, null, `${cc}:kw:${k}`);
  console.error(`${cc}: +${seen.size - before} → ${seen.size} unique (${calls} calls)`);
}
const all = [...seen.values()];
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/gcp-partners.jsonl`, all.map(o => JSON.stringify(o)).join('\n') + '\n');
const cols = Object.keys(all[0]); const esc = (v) => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
fs.writeFileSync(`${OUT}/gcp-partners.csv`, [cols.join(','), ...all.map(o => cols.map(c => esc(o[c])).join(','))].join('\n'));
console.error(`wrote ${all.length} partners, ${calls} calls → ${OUT}/gcp-partners.csv`);
