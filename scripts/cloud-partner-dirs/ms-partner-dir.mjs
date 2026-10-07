// Microsoft / Azure partner directory → deduped partner list for a filter (Tier-0 REST, no auth).
// Usage: node ms-partner-dir.mjs <country> "<filter kv;kv>" <outfile.jsonl> [passes=2]
// API returns pages in RANDOM order with repeats; page until empty, dedupe by id, repeat passes and union.
import fs from 'node:fs';
const B = 'https://main.prod.marketplacepartnerdirectory.azure.com/api/partners';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36';
const [country, extra, outfile, passesArg] = process.argv.slice(2); const passes = Number(passesArg || 2);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function page(sort, off) {
  const filter = `sort=${sort};pageSize=20;pageOffset=${off};onlyThisCountry=true;country=${country};radius=100;locationNotRequired=true;${extra}`;
  for (let i = 0; i < 4; i++) { try { const r = await fetch(B + '?filter=' + encodeURIComponent(filter), { headers: { 'User-Agent': UA } }); if (!r.ok) throw new Error('HTTP ' + r.status); return (await r.json()).matchingPartners?.items || []; } catch (e) { if (i === 3) throw e; await sleep(1000 * (i + 1)); } }
}
const seen = new Map();
if (outfile && fs.existsSync(outfile)) for (const l of fs.readFileSync(outfile, 'utf8').split('\n').filter(Boolean)) { const o = JSON.parse(l); seen.set(o.id, o); }
let newTotal = 0;
for (let p = 0; p < passes; p++) {
  const sort = p % 3; let empty = 0, added = 0;
  for (let off = 0; off < 400 && empty < 3; off += 4) {
    const res = await Promise.all([0, 1, 2, 3].map(k => page(sort, off + k)));
    for (const items of res) { if (!items.length) empty++; else empty = 0; for (const it of items) if (!seen.has(it.id)) { seen.set(it.id, it); added++; } }
    await sleep(150);
  }
  newTotal += added; console.error(`${country} [${extra}] pass ${p + 1} (sort=${sort}): +${added} → ${seen.size} unique`);
}
if (outfile) fs.writeFileSync(outfile, [...seen.values()].map(o => JSON.stringify(o)).join('\n') + (seen.size ? '\n' : ''));
console.log(JSON.stringify({ country, extra, unique: seen.size, added: newTotal }));
