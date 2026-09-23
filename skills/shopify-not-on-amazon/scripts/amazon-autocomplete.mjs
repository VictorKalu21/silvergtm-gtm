// STEP 7a · FREE bulk Amazon-demand triage via Amazon's public autocomplete endpoint (no bot wall,
// fast, 5k brands in minutes). What it measures: whether Amazon shoppers search for this BRAND on
// Amazon. Zero brand suggestions = nobody buys this brand on Amazon = strongest cheap "not on Amazon"
// signal. Rich suggestions = the brand has Amazon demand (official OR resellers) -> amazon-verify.mjs
// decides which. It is a PRIOR for ordering the render step, never the final verdict. Resume-safe.
//
//   RUN=<run> DIR=<dir> node amazon-autocomplete.mjs   # {RUN}_signal.json survivors -> {RUN}_amazon_ac.json
//   env: CONC (4) SOURCE (signal|keeps) LIMIT
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const DIR = process.env.DIR || '.', RUN = process.env.RUN || 'run', CONC = Number(process.env.CONC || 4);
const OUT = `${DIR}/${RUN}_amazon_ac.json`;
const rd = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8').replace(/^﻿/, ''));
export const brandOf = (r) => {
  let b = (r.shopName || '').trim();
  if (!b && r.title) b = r.title.split(/\s[|–—-]\s|\s[|–—]|:\s/)[0].trim();
  if (!b || b.length > 40 || /^(home|welcome|shop|official)/i.test(b) || isGenericName(b)) b = r.domain.replace(/\.[a-z.]+$/, '').replace(/[-_]/g, ' ');   // "Kids Shoes | Stride Rite" -> striderite
  return b.replace(/\s*(official (store|site|website)|online store|store|shop|®|™)\s*$/i, '').replace(/[,\s]+(us|usa|u\.s\.a?\.?|united states|america|north america|uk|canada|ca|eu|inc\.?|llc|co\.?|ltd\.?)\s*$/i, '').trim();
};
// name variants to try, longest first: "HexClad Cookware" -> "hexclad"; "Dr. Squatch" -> "dr squatch"
export const brandVariants = (b) => { const w = b.split(/\s+/); const out = [b]; if (w.length > 1) out.push(w.slice(0, -1).join(' ')); if (w.length > 2) out.push(w[0]); return [...new Set(out.map((x) => x.toLowerCase()))].filter((x) => !isGenericName(x)); };   // never a bare category word
export const tok = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');   // BrüMate -> brumate
// words that never identify a brand on their own (categories, corporate suffixes, marketing filler)
export const GENERIC_WORDS = new Set('inc llc co corp ltd labs lab brand brands collective cosmetics beauty apparel clothing shop store official usa us home products product technology technologies tech electronics equipment supply supplies goods group international global online the and of by for american america natural pure black white smart pro best premium classic modern little big great simple urban fresh green blue red gold silver north south east west new old happy daily real true one my house life love world designs design studio outlet boutique jewelry skincare wear workwear nutrition health organic coffee foods food kitchen garden outdoor outdoors gear sports sport fitness yoga baby kids pet pets 1913 fishing bikes bike ebikes golf tea jerky candles candle soap bedding furniture lighting lights mattress dog cat watches watch eyewear sunglasses records books music cases case denim shirts boots scrubs supplements vitamins wellness skin hair haircare makeup rings guitars drums audio speakers tools hardware parts exhausts power cargo control rockets toys games plants seeds bulbs nursery gardens living sleep mens womens men women shoes footwear bags travel luggage pouches paper stationery decor textiles fabrics fabric candy chocolate cheese butter spice spices sauce sauces snacks protein bars drinks beverages water wine beer spirits com net org'.split(' '));
export const isGenericName = (name) => { const w = (name || '').toLowerCase().split(/[\s&'’.,/-]+/).map(tok).filter(Boolean); return !w.length || w.every((x) => GENERIC_WORDS.has(x) || x.length < 3); };

// Only run the crawl when executed directly; the other scripts import the helpers above (and this file must not read run files then).
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await (async () => {
const src = process.env.SOURCE === 'keeps' || (!process.env.SOURCE && existsSync(`${DIR}/${RUN}_keeps.json`)) ? rd(`${RUN}_keeps.json`) : rd(`${RUN}_signal.json`).filter((r) => r.status === 'pass_free_gates');
const done = existsSync(OUT) ? rd(`${RUN}_amazon_ac.json`) : {};
let todo = src.filter((r) => !done[r.domain]); if (process.env.LIMIT) todo = todo.slice(0, Number(process.env.LIMIT));
console.error(`${RUN}: ${src.length} brands, ${Object.keys(done).length} done, ${todo.length} to check`);

async function suggest(prefix) {
  const u = `https://completion.amazon.com/api/2017/suggestions?mid=ATVPDKIKX0DER&alias=aps&prefix=${encodeURIComponent(prefix)}&limit=11`;
  const c = new AbortController(); const tm = setTimeout(() => c.abort(), 15000);
  try {
    const res = await fetch(u, { signal: c.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36', 'Accept': 'application/json' } });
    if (res.status !== 200) return { error: 'http_' + res.status };
    return { sugg: ((await res.json()).suggestions || []).map((s) => s.value) };
  } catch (e) { return { error: e.name === 'AbortError' ? 'timeout' : e.message }; } finally { clearTimeout(tm); }
}
async function check(r) {
  const brand = brandOf(r); let best = null;
  const variants = brandVariants(brand); if (!variants.length) variants.push(brand.toLowerCase());
  for (const q of variants) {           // try the full name, then drop the trailing word ("Gymshark US" -> "gymshark")
    const s = await suggest(q); if (s.error) return { domain: r.domain, brand, error: s.error, retryable: true };
    const t = tok(q); const hits = s.sugg.filter((x) => tok(x).includes(t));
    const cur = { domain: r.domain, brand, query: q, suggestions: s.sugg, brandHits: hits.length, ambiguous: t.length <= 4 };
    if (!best || hits.length > best.brandHits) best = cur;
    if (hits.length) break;
  }
  best.demand = best.brandHits === 0 ? 'none' : best.brandHits <= 2 ? 'low' : 'high';
  return best;
}
let i = 0, n = 0;
async function worker() { while (i < todo.length) { const r = todo[i++]; done[r.domain] = await check(r); n++; if (n % 100 === 0) { writeFileSync(OUT, JSON.stringify(done, null, 2)); console.error(`${n}/${todo.length}`); } await new Promise((s) => setTimeout(s, 150)); } }
await Promise.all(Array.from({ length: CONC }, worker));
writeFileSync(OUT, JSON.stringify(done, null, 2));
const by = {}; for (const v of Object.values(done)) by[v.demand || 'error'] = (by[v.demand || 'error'] || 0) + 1;
console.error(`===== ${RUN}: AMAZON AUTOCOMPLETE DONE ===== demand:`, JSON.stringify(by));
console.error(`-> 'none' = strongest free not-on-Amazon prior; verify with amazon-verify.mjs before it goes in a deliverable`);
})();
