// screen.mjs — Stage 3. Regex gates, no network, no LLM. Per posting: IC-title gate, explicit-tech gate
// (with the evidence sentence captured), posting-age flag. Rolls up to one row per company and prints
// the funnel — this is the Gate-2 readout. Writes postings_gated.jsonl + companies.csv.
// Run:  node <skill>/scripts/screen.mjs   (cwd = run folder)
import fs from "node:fs";
import { loadConfig, readJSONL, writeCSV } from "./lib.mjs";
const CFG = loadConfig();
const TITLE_ALLOW = new RegExp(CFG.title_allow, "i"), TITLE_DENY = new RegExp(CFG.title_deny, "i"), ROLE_WORD = new RegExp(CFG.title_role_word || "\\b(engineer|developer|sre|engineering)\\b", "i");
const TECH = Object.entries(CFG.tech).map(([k, v]) => [k, new RegExp(v, "i")]);
const NAME_DENY = CFG.company_deny_name ? new RegExp(CFG.company_deny_name, "i") : null;
const MAX_AGE = CFG.posting_max_age_days || 90;

function evidenceFor(text, re) {
  const sents = text.split(/(?<=[.!?])\s+|\n+|\s*[•·▪]\s*/).map(s => s.trim()).filter(Boolean);
  const hit = sents.find(s => re.test(s)) || "";
  return hit.length > 240 ? hit.slice(0, 237).replace(/\s+\S*$/, "") + "…" : hit;
}
const ageDays = iso => { const t = Date.parse(iso); return Number.isFinite(t) ? Math.round((Date.now() - t) / 86400000) : null; };

const postings = readJSONL("postings.jsonl");
const boards = Object.fromEntries(readJSONL("boards.jsonl").filter(b => !b.err).map(b => [`${b.ats}:${b.slug}`, b]));
fs.writeFileSync("postings_gated.jsonl", "");
const F = { postings: postings.length, title_ic: 0, title_ic_tech: 0, fresh: 0 }; const byTech = {}, byAts = {};
const co = new Map();
for (const p of postings) {
  const t = p.title || "";
  const titleOk = TITLE_ALLOW.test(t) && ROLE_WORD.test(t) && !TITLE_DENY.test(t);
  const techHits = TECH.filter(([, re]) => re.test(p.body_text || "")).map(([k]) => k);
  const titleTech = TECH.filter(([, re]) => re.test(t)).map(([k]) => k);
  const age = ageDays(p.posted_at || p.updated_at);
  const flags = [];
  if (!titleOk) flags.push(TITLE_DENY.test(t) ? "title_deny" : "title_nomatch");
  if (!techHits.length) flags.push("no_tech");
  if (age != null && age > MAX_AGE) flags.push("stale");
  const evidence = techHits.length ? evidenceFor(p.body_text || "", TECH.find(([k]) => k === techHits[0])[1]) : "";
  const row = { ...p, body_text: undefined, body_links: undefined, title_ok: titleOk, tech: techHits, tech_in_title: titleTech, age_days: age, evidence, flags, pass: titleOk && techHits.length > 0 };
  fs.appendFileSync("postings_gated.jsonl", JSON.stringify(row) + "\n");
  if (titleOk) F.title_ic++;
  if (row.pass) { F.title_ic_tech++; if (!flags.includes("stale")) F.fresh++; for (const k of techHits) byTech[k] = (byTech[k] || 0) + 1; byAts[p.ats] = (byAts[p.ats] || 0) + 1; }
  const key = `${p.ats}:${p.slug}`;
  if (!co.has(key)) co.set(key, { ats: p.ats, slug: p.slug, company: p.company_name || boards[key]?.name || p.slug, n_postings: 0, n_ic: 0, n_pass: 0, tech: new Set(), best: null, name_deny: NAME_DENY ? NAME_DENY.test(p.company_name || "") || NAME_DENY.test(p.slug) : false });
  const c = co.get(key); c.n_postings++; if (titleOk) c.n_ic++;
  if (row.pass) { c.n_pass++; techHits.forEach(k => c.tech.add(k)); if (!c.best || (age ?? 9e9) < (c.best.age_days ?? 9e9)) c.best = row; }
}
const rows = [...co.values()].map(c => ({ ats: c.ats, slug: c.slug, company: c.company, n_postings: c.n_postings, n_ic_titles: c.n_ic, n_ic_tech: c.n_pass, tech: [...c.tech].join("|"),
  best_title: c.best?.title || "", best_url: c.best?.url || "", best_posted_at: (c.best?.posted_at || "").slice(0, 10), best_age_days: c.best?.age_days ?? "", best_location: c.best?.location || "", evidence: c.best?.evidence || "",
  name_deny: c.name_deny ? "yes" : "", status: c.n_pass ? (c.name_deny ? "hold_name_deny" : "pass") : "drop_no_match" }));
rows.sort((a, b) => (b.n_ic_tech - a.n_ic_tech) || a.company.localeCompare(b.company));
writeCSV("companies.csv", ["ats", "slug", "company", "n_postings", "n_ic_titles", "n_ic_tech", "tech", "best_title", "best_url", "best_posted_at", "best_age_days", "best_location", "evidence", "name_deny", "status"], rows);
const pass = rows.filter(r => r.status === "pass"), hold = rows.filter(r => r.status === "hold_name_deny");
console.log(`FUNNEL  boards fetched: ${Object.keys(boards).length} | postings: ${F.postings} | IC-title: ${F.title_ic} | IC-title + explicit tech: ${F.title_ic_tech} (fresh ≤${MAX_AGE}d: ${F.fresh})`);
console.log(`COMPANIES  with ≥1 passing posting: ${pass.length + hold.length} → pass ${pass.length}, held on name-deny ${hold.length}, dropped (no passing posting) ${rows.length - pass.length - hold.length}`);
console.log(`by tech: ${JSON.stringify(byTech)} | by ATS: ${JSON.stringify(byAts)}`);
if (hold.length) console.log(`held: ${hold.map(r => r.company).join(", ")}`);
