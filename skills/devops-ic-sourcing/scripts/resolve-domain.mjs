// resolve-domain.mjs — Stage 4. Domain FROM THE SOURCE first, resolver last.
// Order per company: (1) outbound link on the ATS board page / board intro (WA-09), (2) links inside the
// company's own JD bodies, weighted by how many postings carry them and whether the domain stem matches the
// company name, (3) nothing found → written to domains_todo.csv for an in-session WebSearch pass; paste
// results into domains_manual.json ({ "<ats>:<slug>": "domain.com" }) and re-run to merge.
// Each candidate is verified alive (200, non-parked) before it is accepted. Writes domains.json.
// Run:  node <skill>/scripts/resolve-domain.mjs   (cwd = run folder)
import fs from "node:fs";
import { loadConfig, readJSONL, readCSVObjects, writeCSV, fetchText, pool, hostOf, registrable, JUNK_HOST, slugStem, norm, htmlToText } from "./lib.mjs";
const CFG = loadConfig();
const boards = readJSONL("boards.jsonl").filter(b => !b.err);
const postings = readJSONL("postings.jsonl");
const companies = readCSVObjects("companies.csv").filter(r => r.status !== "drop_no_match");
const manual = fs.existsSync("domains_manual.json") ? JSON.parse(fs.readFileSync("domains_manual.json", "utf8").replace(/^﻿/, "")) : {};
const prev = fs.existsSync("domains.json") ? JSON.parse(fs.readFileSync("domains.json", "utf8")) : {};
const PARK = /(domain (is )?for sale|buy this domain|parked (free|domain)|hugedomains|this domain (may be|is) for sale|sedoparking|dan\.com\b|godaddy\.com\/domainsearch)/i;

function candidates(key, b) {
  const [, slug] = key.split(":"); const stem = slugStem(slug), nameStem = slugStem(b?.name || "");
  const score = {};
  for (const [d, n] of Object.entries(b?.links || {})) if (!JUNK_HOST.test(d)) score[d] = (score[d] || 0) + 3 * n;   // board-page outbound link (re-filtered: junk list grows between runs)
  const mine = postings.filter(p => `${p.ats}:${p.slug}` === key);
  const perPosting = {};
  for (const p of mine) { const seen = new Set(); for (const h of p.body_links || []) { const host = hostOf(h); if (!host || JUNK_HOST.test(host)) continue; const d = registrable(host); if (!seen.has(d)) { seen.add(d); perPosting[d] = (perPosting[d] || 0) + 1; } } }
  for (const [d, n] of Object.entries(perPosting)) score[d] = (score[d] || 0) + n;                     // JD-body links, one vote per posting
  for (const d of Object.keys(score)) { const ds = slugStem(d.split(".")[0]); if (ds && (ds === stem || ds === nameStem || (stem.length > 3 && ds.includes(stem)) || (nameStem.length > 3 && ds.includes(nameStem)))) score[d] += 5; }
  return Object.entries(score).sort((a, b) => b[1] - a[1]).map(([d, s]) => ({ d, s, method: b?.links?.[d] ? "board_link" : "jd_link", name_match: slugStem(d.split(".")[0]) === stem || slugStem(d.split(".")[0]) === nameStem }));
}
async function alive(d) {
  const r = await fetchText(`https://${d}/`, { timeout: 12000 });
  if (r.err || !r.status || r.status >= 400) return { ok: false, why: r.err || `http${r.status}` };
  if (PARK.test(r.body || "")) return { ok: false, why: "parked" };
  const final = registrable(hostOf(r.finalUrl || `https://${d}/`));
  if (JUNK_HOST.test(final)) return { ok: false, why: `redirects to junk host ${final}` };   // e.g. a CDN host that 302s back to the ATS vendor
  const title = ((r.body || "").match(/<title[^>]*>([^<]{0,200})/i) || [])[1] || "";
  return { ok: true, final, title: title.trim(), text: htmlToText(r.body || "").slice(0, 3000) };
}

const out = { ...prev }; const todo = [];
await pool(companies, 8, async c => {
  const key = `${c.ats}:${c.slug}`; const b = boards.find(x => `${x.ats}:${x.slug}` === key);
  if (manual[key]) { const a = await alive(manual[key]); out[key] = { domain: a.ok ? a.final : manual[key], method: "websearch_manual", conf: a.ok ? "high" : "low", title: a.title || "", alive: a.ok }; return; }
  if (out[key]?.conf === "high") return;
  const cands = candidates(key, b).slice(0, 3);
  for (const cand of cands) {
    const a = await alive(cand.d);
    const strong = cand.method === "board_link" || cand.name_match;
    if (!a.ok) {
      // A first-party board link / name-matched domain that merely refuses our fetch (403, WAF, timeout) is still the
      // right domain — keep it at medium and do NOT fall through to a weaker JD link (that is how Clera became trigger.dev).
      if (strong) { out[key] = { domain: cand.d, method: cand.method, conf: "medium", score: cand.s, name_match: cand.name_match, alive: false, why: a.why }; return; }
      continue;
    }
    out[key] = { domain: a.final, method: cand.method, conf: strong ? "high" : cand.s >= 2 ? "medium" : "low", score: cand.s, name_match: cand.name_match, title: a.title, alive: true, homepage_text: a.text }; return;
  }
  out[key] = { domain: "", method: "none", conf: "none" };
});
fs.writeFileSync("domains.json", JSON.stringify(out, null, 1));
for (const c of companies) { const r = out[`${c.ats}:${c.slug}`]; if (!r || !r.domain || r.conf === "low") todo.push({ key: `${c.ats}:${c.slug}`, company: c.company, ats: c.ats, slug: c.slug, best_url: c.best_url, best_location: c.best_location, current_guess: r?.domain || "", conf: r?.conf || "" }); }
writeCSV("domains_todo.csv", ["key", "company", "ats", "slug", "best_url", "best_location", "current_guess", "conf"], todo);
const stat = {}; for (const c of companies) { const r = out[`${c.ats}:${c.slug}`]; const k = r?.domain ? `${r.method}/${r.conf}` : "none"; stat[k] = (stat[k] || 0) + 1; }
console.log(`domains: ${companies.length} companies → ${JSON.stringify(stat)} | ${todo.length} written to domains_todo.csv for WebSearch`);
