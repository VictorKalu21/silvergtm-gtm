// qualified.mjs — Stage 6a. Join companies + domains + screen verdicts + sizes into the company-level
// hand-off for the people step (Apollo upload / HeyReach / manual): companies_qualified.csv.
// status: ok (product/unclear + size in band) · size_unknown (needs Apollo firmographics) · size_out · screened_out · no_domain
// Run:  node <skill>/scripts/qualified.mjs   (cwd = run folder)
import fs from "node:fs";
import { loadConfig, readCSVObjects, writeCSV } from "./lib.mjs";
const CFG = loadConfig(); const [LO, HI] = CFG.size_band || [51, 500];
const J = f => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, "")) : {};
const domains = J("domains.json"), screen = J("screen.json"), sizes = J("sizes.json");
const bandOk = s => { if (!s) return "size_unknown"; const n = +s.employees; if (Number.isFinite(n) && n > 0) return n >= LO && n <= HI ? "ok" : "size_out"; const m = (s.band || "").match(/(\d[\d,]*)\s*[-–]\s*(\d[\d,]*)|(\d[\d,]*)\s*\+/); if (!m) return "size_unknown"; const lo = +(m[1] || m[3]).replace(/,/g, ""), hi = m[2] ? +m[2].replace(/,/g, "") : Infinity; return hi < LO || lo > HI ? "size_out" : "ok"; };
const rows = readCSVObjects("companies.csv").filter(r => r.status !== "drop_no_match").map(c => {
  const k = `${c.ats}:${c.slug}`, d = domains[k] || {}, v = screen[k] || {}, s = sizes[k] || null;
  let status = !d.domain ? "no_domain" : v.keep === false ? "screened_out" : bandOk(s);
  return { status, company: c.company, domain: d.domain || "", ats: c.ats, slug: c.slug, company_type: v.company_type || "", vertical: v.vertical || "", size_band: s?.band || "", employees: s?.employees || "", size_source: s?.source || "",
    n_ic_tech_postings: c.n_ic_tech, best_title: c.best_title, best_url: c.best_url, best_posted_at: c.best_posted_at, best_location: c.best_location, evidence: c.evidence, screen_reason: v.reason || "", domain_method: d.method || "" };
});
const order = { ok: 0, size_unknown: 1, size_out: 2, screened_out: 3, no_domain: 4 };
rows.sort((a, b) => order[a.status] - order[b.status] || b.n_ic_tech_postings - a.n_ic_tech_postings || a.company.localeCompare(b.company));
writeCSV("companies_qualified.csv", Object.keys(rows[0]), rows);
const stat = {}; rows.forEach(r => stat[r.status] = (stat[r.status] || 0) + 1);
console.log(`companies_qualified.csv: ${rows.length} rows | ${JSON.stringify(stat)}`);
for (const r of rows.filter(r => r.status === "ok" || r.status === "size_unknown")) console.log(`  [${r.status.padEnd(12)}] ${r.company.slice(0, 24).padEnd(25)} ${r.domain.padEnd(22)} ${String(r.employees || r.size_band).padEnd(10)} ${r.vertical.slice(0, 34)}`);
