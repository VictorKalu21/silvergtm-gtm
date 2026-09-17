// discover-parse.mjs — Stage 1. Parse WebSearch hits (one URL per line, optional <TAB>query) into
// a deduped ATS slug list. Writes discovery/slugs.json. Pure text parsing, no network.
// Run:  node <skill>/scripts/discover-parse.mjs        (cwd = run folder holding config.json)
import fs from "node:fs";
import { loadConfig } from "./lib.mjs";
const CFG = loadConfig();
const hitsPath = CFG.hits_file || "discovery/hits.txt";
const lines = fs.readFileSync(hitsPath, "utf8").split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));

function parse(url) {
  let m;
  if ((m = url.match(/^https?:\/\/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/([^\/?#]+)\/jobs\/(\d+)/i))) return { ats: "greenhouse", slug: m[1].toLowerCase(), job_id: m[2] };
  if ((m = url.match(/^https?:\/\/(?:boards|job-boards)\.greenhouse\.io\/embed\/job_app\?(?:.*&)?(?:for=([^&]+))?.*?token=(\d+)/i))) return m[1] ? { ats: "greenhouse", slug: m[1].toLowerCase(), job_id: m[2] } : { ats: "greenhouse", slug: null, job_id: m[2], note: "embed token without board slug — resolve by hand or drop" };
  if ((m = url.match(/^https?:\/\/jobs\.lever\.co\/([^\/?#]+)\/([0-9a-f-]{36})/i))) return { ats: "lever", slug: m[1], job_id: m[2] };
  if ((m = url.match(/^https?:\/\/jobs\.ashbyhq\.com\/([^\/?#]+)\/([0-9a-f-]{36})/i))) return { ats: "ashby", slug: decodeURIComponent(m[1]), job_id: m[2] };
  if ((m = url.match(/^https?:\/\/apply\.workable\.com\/([^\/?#]+)\/j\/([A-Z0-9]+)/i))) return { ats: "workable", slug: m[1].toLowerCase(), job_id: m[2] };
  return null;
}

const slugs = new Map(); const unparsed = [];
for (const line of lines) {
  const [url, query = ""] = line.split("\t");
  const p = parse(url.trim());
  if (!p) { unparsed.push(url); continue; }
  const key = `${p.ats}:${(p.slug || "?").toLowerCase()}`;
  if (!slugs.has(key)) slugs.set(key, { ats: p.ats, slug: p.slug, hit_urls: [], hit_job_ids: [], queries: new Set(), note: p.note || "" });
  const e = slugs.get(key); e.hit_urls.push(url.trim()); e.hit_job_ids.push(p.job_id); if (query) e.queries.add(query.trim());
}
const out = [...slugs.values()].map(e => ({ ...e, queries: [...e.queries] }));
fs.mkdirSync("discovery", { recursive: true });
fs.writeFileSync("discovery/slugs.json", JSON.stringify(out, null, 1));
const byAts = {}; for (const e of out) byAts[e.ats] = (byAts[e.ats] || 0) + 1;
console.log(`hits: ${lines.length} | unique boards: ${out.length} | by ATS: ${JSON.stringify(byAts)} | unparsed: ${unparsed.length}`);
if (unparsed.length) console.log("  unparsed:", unparsed.join(", "));
const noSlug = out.filter(e => !e.slug); if (noSlug.length) console.log(`  ${noSlug.length} embed hits without a board slug (dropped unless resolved): ${noSlug.map(e => e.hit_urls[0]).join(", ")}`);
