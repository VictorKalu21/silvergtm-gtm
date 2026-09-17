// merge-screen.mjs — Stage 5b. Merge the per-batch Haiku outputs (screen/screen-g*-out.json) into one
// screen.json, strip any BOM, verify every G2 company got a verdict, and print the keep/drop breakdown.
// Run:  node <skill>/scripts/merge-screen.mjs   (cwd = run folder)
import fs from "node:fs";
import { readCSVObjects } from "./lib.mjs";
const out = {}; const files = fs.readdirSync("screen").filter(f => /^screen-g\d+-out\.json$/.test(f)).sort();
for (const f of files) { let t = fs.readFileSync(`screen/${f}`, "utf8").replace(/^﻿/, "").trim(); t = t.replace(/^```(json)?\s*/i, "").replace(/```\s*$/, ""); let j; try { j = JSON.parse(t); } catch (e) { console.error(`  x ${f}: ${e.message}`); continue; } Object.assign(out, j); console.error(`  ✓ ${f}: ${Object.keys(j).length}`); }
const prev = fs.existsSync("screen.json") ? JSON.parse(fs.readFileSync("screen.json", "utf8")) : {};
const manual = fs.existsSync("screen_manual.json") ? JSON.parse(fs.readFileSync("screen_manual.json", "utf8")) : {};
const merged = { ...prev, ...out, ...manual };
fs.writeFileSync("screen.json", JSON.stringify(merged, null, 1));
const cos = readCSVObjects("companies.csv").filter(r => r.status !== "drop_no_match");
const missing = cos.filter(c => !merged[`${c.ats}:${c.slug}`]).map(c => `${c.ats}:${c.slug}`);
const stat = {}; for (const c of cos) { const v = merged[`${c.ats}:${c.slug}`]; if (!v) continue; const k = `${v.company_type}${v.keep ? "/keep" : "/drop"}`; stat[k] = (stat[k] || 0) + 1; }
console.log(`screen.json: ${Object.keys(merged).length} verdicts | ${JSON.stringify(stat)} | missing: ${missing.length}${missing.length ? " → " + missing.join(", ") : ""}`);
