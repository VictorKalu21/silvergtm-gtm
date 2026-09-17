// assemble.mjs — Stage 7. Join the people (Apollo export or HeyReach/manual CSV) onto the qualified
// companies and emit the client's spreadsheet: name · company · role · source link · fit note, plus the
// evidence and provenance columns that let anyone spot-check a row in ten seconds. Cross-run dedupe on
// person LinkedIn URL + domain against every prior leads_*.csv listed in config.dedupe_files.
// Run:  node <skill>/scripts/assemble.mjs   (cwd = run folder; needs people.csv + companies.csv + domains.json + screen.json)
import fs from "node:fs";
import { loadConfig, readCSVObjects, writeCSV, registrable, hostOf, norm } from "./lib.mjs";
const CFG = loadConfig();
const P = CFG.people_cols || { first: "First Name", last: "Last Name", title: "Title", linkedin: "Person Linkedin Url", website: "Website", company: "Company", email: "Email" };
const companies = readCSVObjects("companies.csv");
const domains = JSON.parse(fs.readFileSync("domains.json", "utf8"));
const verdicts = fs.existsSync("screen.json") ? JSON.parse(fs.readFileSync("screen.json", "utf8").replace(/^﻿/, "")) : {};
const people = fs.existsSync(CFG.people_csv || "people.csv") ? readCSVObjects(CFG.people_csv || "people.csv") : [];
// sizes.json = { "<ats>:<slug>": { band: "51-200", employees: 120, source: "<linkedin url or apollo>" } } — written by the size-confirm step.
const sizes = fs.existsSync("sizes.json") ? JSON.parse(fs.readFileSync("sizes.json", "utf8").replace(/^\uFEFF/, "")) : {};
const [SIZE_LO, SIZE_HI] = CFG.size_band || [51, 500];
const sizeOk = s => { if (!s) return "unknown"; const n = +s.employees; if (Number.isFinite(n) && n > 0) return n >= SIZE_LO && n <= SIZE_HI ? "ok" : "out"; const m = (s.band || "").match(/(\d[\d,]*)\s*[-–]\s*(\d[\d,]*)|(\d[\d,]*)\s*\+/); if (!m) return "unknown"; const lo = +(m[1] || m[3]).replace(/,/g, ""), hi = m[2] ? +m[2].replace(/,/g, "") : Infinity; return hi < SIZE_LO || lo > SIZE_HI ? "out" : "ok"; };
const TITLE_ALLOW = new RegExp(CFG.title_allow, "i"), TITLE_DENY = new RegExp(CFG.title_deny, "i");
const seen = new Set();
for (const f of CFG.dedupe_files || []) if (fs.existsSync(f)) for (const r of readCSVObjects(f)) { if (r.linkedin_url) seen.add(r.linkedin_url.toLowerCase()); }

const byDomain = new Map();
const sizeDropped = [];
for (const c of companies) { const k = `${c.ats}:${c.slug}`; const d = domains[k]?.domain; if (!d) continue; const v = verdicts[k]; if (v && v.keep === false) continue; if (c.status !== "pass" && !(v && v.keep === true)) continue;
  const sz = sizeOk(sizes[k]); if (sz === "out") { sizeDropped.push(c.company); continue; }
  byDomain.set(d, { ...c, domain: d, verdict: v || {}, size: sizes[k] || {}, size_status: sz }); }
if (sizeDropped.length) console.error(`size gate dropped ${sizeDropped.length}: ${sizeDropped.join(", ")}`);

const leads = [], held = []; const runDate = new Date().toISOString().slice(0, 10);
for (const p of people) {
  const d = registrable(hostOf(p[P.website]?.startsWith("http") ? p[P.website] : `https://${p[P.website] || ""}`));
  const c = byDomain.get(d); if (!c) { held.push({ ...p, hold_reason: "no_company_match" }); continue; }
  const title = p[P.title] || "";
  if (!TITLE_ALLOW.test(title) || TITLE_DENY.test(title)) { held.push({ ...p, hold_reason: "person_title_gate" }); continue; }
  const li = (p[P.linkedin] || "").toLowerCase(); if (li && seen.has(li)) { held.push({ ...p, hold_reason: "dup_prior_run" }); continue; }
  if (li) seen.add(li);
  const posted = c.best_posted_at || "recently";
  const fit_note = `${title} at ${c.company}; ${c.company} is hiring a ${c.best_title} (${c.ats}, posted ${posted}) whose JD reads: "${c.evidence}"`;
  leads.push({ name: `${p[P.first] || ""} ${p[P.last] || ""}`.trim(), company: c.company, role: title, source_link: c.best_url, linkedin_url: p[P.linkedin] || "", fit_note,
    evidence: c.evidence, posting_title: c.best_title, posting_date: c.best_posted_at, ats: c.ats, domain: d, company_vertical: c.verdict.vertical || "", company_size: c.size.band || c.size.employees || c.verdict.size_hint || "", size_status: c.size_status, email: p[P.email] || "", run_date: runDate });
}
writeCSV(`leads_${runDate}.csv`, ["name", "company", "role", "source_link", "linkedin_url", "fit_note", "evidence", "posting_title", "posting_date", "ats", "domain", "company_vertical", "company_size", "size_status", "email", "run_date"], leads);
if (held.length) writeCSV(`leads_${runDate}_held.csv`, [...new Set(held.flatMap(h => Object.keys(h)))], held);
console.log(`leads: ${leads.length} across ${new Set(leads.map(l => l.domain)).size} companies | held: ${held.length} (${Object.entries(held.reduce((a, h) => (a[h.hold_reason] = (a[h.hold_reason] || 0) + 1, a), {})).map(([k, v]) => `${k} ${v}`).join(", ")}) | companies with no person yet: ${[...byDomain.keys()].filter(d => !leads.some(l => l.domain === d)).length}`);
