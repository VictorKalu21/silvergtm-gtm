// script-resolve.mjs — TIER 0.5: FREE domain resolver (no LLM/model tokens, no API keys).
//
// Guess-and-verify over HTTP: derive a brand slug for each company, try the common
// domain patterns, fetch them, and accept the FIRST that returns a real (non-parked)
// page whose HTML/title actually contains the brand token. Anything it can't verify is
// left for the Tier-1 Haiku web-verify pass. On a real RB2B run this cleared 623/961 (65%)
// of the misses before a single subagent token was spent.
//
// This is the ORIGINAL RB2B-shaped reference implementation (kept as-is). Two adaptation
// points when you point it at a name-to-domain workdir:
//   • brandOf(e)  — here it prefers the company after "@" in a LinkedIn headline, else the
//     name. For a generic list, feed it {name, context} and read the brand from context.
//   • the input glob — here it reads dbatch-<N>-in.json + resolved_partial.json. Point it at
//     the skill's batches/batch-<N>-in.json (arrays of {key,name,<context...>}) instead.
// Everything below the input section (candidate generation, parked-domain reject, the
// brand-token-in-page guard, the concurrency pool) is the reusable core — leave it intact.
//
// Usage: node script-resolve.mjs   (writes script_resolved.json keyed by entry .key)
import fs from "node:fs";
import https from "node:https";

const DIR = new URL("./", import.meta.url);
const already = JSON.parse(fs.readFileSync(new URL("resolved_partial.json", DIR), "utf8"));

// build remaining queue from all input batches, minus keys already resolved
let need = [];
for (let i = 1; i <= 20; i++) {
  const p = new URL(`dbatch-${i}-in.json`, DIR);
  if (!fs.existsSync(p)) continue;
  for (const e of JSON.parse(fs.readFileSync(p, "utf8"))) need.push(e);
}
const seen = new Set();
need = need.filter((e) => (seen.has(e.key) ? false : (seen.add(e.key), true)));
const remaining = need.filter((e) => !already[e.key]);

// derive the real brand: prefer the company after "@" in the headline, else name
function brandOf(e) {
  const m = (e.headline || "").match(/@\s*([A-Za-z0-9][A-Za-z0-9 .&'\-]{0,40}?)(?:\s*[|·–—]|$)/);
  let b = (m ? m[1] : e.name || "").trim();
  b = b.replace(/\b(inc|llc|ltd|co|corp|the)\b/gi, "").trim();
  return b;
}
const slugOf = (b) => b.toLowerCase().replace(/[^a-z0-9]/g, "");
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function candidates(brand) {
  const s = slugOf(brand);
  if (!s || s.length < 2) return [];
  const tlds = ["com", "io", "ai", "co", "app", "so", "com/"];
  const c = [];
  for (const t of tlds) c.push(`${s}.${t}`.replace(/\/$/, ""));
  c.push(`get${s}.com`, `${s}hq.com`, `${s}.tech`);
  return [...new Set(c)];
}

const PARK = /(domain (is )?for sale|buy this domain|parked (free|domain)|godaddy\.com\/domainfind|hugedomains|this domain (may be|is) for sale|sedoparking|dan\.com\b)/i;

function fetchOnce(host, path = "/", redirects = 0) {
  return new Promise((resolve) => {
    const req = https.get(
      { host, path, headers: { "User-Agent": "Mozilla/5.0 (compatible; leadbot/1.0)", Accept: "text/html" }, timeout: 6000 },
      (res) => {
        const { statusCode, headers } = res;
        if ([301, 302, 303, 307, 308].includes(statusCode) && headers.location && redirects < 3) {
          res.resume();
          try {
            const u = new URL(headers.location, `https://${host}${path}`);
            if (u.protocol !== "https:" && u.protocol !== "http:") return resolve(null);
            return resolve(fetchOnce(u.hostname, u.pathname + u.search, redirects + 1).then((r) => r && { ...r, host: u.hostname }));
          } catch { return resolve(null); }
        }
        if (statusCode !== 200) { res.resume(); return resolve(null); }
        let body = "";
        res.on("data", (d) => { if (body.length < 20000) body += d; });
        res.on("end", () => resolve({ host, body }));
      }
    );
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
  });
}

async function resolveEntry(e) {
  const brand = brandOf(e);
  const bslug = slugOf(brand);
  for (const cand of candidates(brand)) {
    const r = await fetchOnce(cand).catch(() => null);
    const res = r && (r.then ? await r : r);
    if (!res || !res.body) continue;
    if (PARK.test(res.body)) continue;
    const nbody = norm(res.body.slice(0, 8000));
    const title = (res.body.match(/<title[^>]*>([^<]{0,120})<\/title>/i) || [])[1] || "";
    // accept if the brand token appears in the page/title (guards against wrong-site lookalikes)
    if (bslug.length >= 3 && (nbody.includes(bslug) || norm(title).includes(bslug))) {
      return { resolved: brand, domain: res.host.replace(/^www\./, ""), confidence: "script" };
    }
  }
  return null; // couldn't verify -> leave for the LLM pass
}

// simple concurrency pool
const CONC = 24;
const out = {};
let done = 0, hit = 0;
const queue = [...remaining];
async function worker() {
  while (queue.length) {
    const e = queue.shift();
    const r = await resolveEntry(e).catch(() => null);
    done++;
    if (r) { out[e.key] = r; hit++; }
    if (done % 50 === 0) console.error(`  ${done}/${remaining.length} processed, ${hit} resolved`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));

fs.writeFileSync(new URL("script_resolved.json", DIR), JSON.stringify(out, null, 2));
console.error(`\nDONE: ${hit}/${remaining.length} resolved by script -> script_resolved.json`);
