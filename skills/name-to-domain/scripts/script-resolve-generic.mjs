// Tier 0.5 (adapted from skills/name-to-domain/scripts/script-resolve.mjs)
// Adaptation points per the file header:
//   brandOf() -> reads brand from the `name` column (this list has no URL/headline context)
//   input glob -> work/batches/batch-<N>-in.json
// Reusable core kept intact: candidate generation, parked-domain reject,
// brand-token-in-page guard, concurrency pool.
import fs from "node:fs";
import https from "node:https";

let need = [];
for (let i = 1; i <= 40; i++) {
  const p = `work/batches/batch-${i}-in.json`;
  if (!fs.existsSync(p)) continue;
  for (const e of JSON.parse(fs.readFileSync(p, "utf8"))) need.push(e);
}
const seen = new Set();
need = need.filter(e => (seen.has(e.key) ? false : (seen.add(e.key), true)));

const TLD = /\.(com|io|ai|co|net|org|app|dev|tech|so|xyz|works|work|health|pro|cloud|studio|agency|team|life|media|group|solutions|consulting|academy|world|shop|store|lv|de|se|fi|dk|nl|it|fr|es|pl|in|us|uk|ca|au|nz|sg|my|id|ph|jp|no|ie|ch|at|be|eu|mx|br)$/i;

// brandOf: clean the raw list name down to the brand token
function brandOf(e) {
  let b = String(e.name || "");
  b = b.replace(/\s*\((?:formerly|previously|acquired|YC|ASX|@|CRM)[^)]*\)/gi, " "); // notes
  b = b.replace(/\s*\([^)]*\)\s*/g, " ");                                            // any parenthetical
  b = b.split(/\s+[-–—:]\s+/)[0];                                                    // drop tagline after dash
  b = b.replace(/[®™]/g, " ");
  b = b.replace(/,?\s*\b(inc|llc|ltd|limited|corp|corporation|gmbh|plc|pvt|private|aps|oy|oü|ou|ab|as|a\/s|bv|sarl|co)\b\.?/gi, " ");
  b = b.replace(/^the\s+/i, "");
  return b.replace(/\s+/g, " ").trim();
}
const slugOf = b => b.toLowerCase().replace(/[^a-z0-9]/g, "");
const norm = s => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// an explicit domain written into the company name is the strongest signal
function embedded(name) {
  const m = String(name).match(/\b([a-z0-9][a-z0-9-]{1,40}(?:\.[a-z0-9-]{2,20})+)\b/i);
  if (m && TLD.test(m[1])) return m[1].toLowerCase();
  return null;
}

function candidates(e) {
  const brand = brandOf(e);
  const s = slugOf(brand);
  const c = [];
  const emb = embedded(e.name);
  if (emb) c.push(emb);
  if (s && s.length >= 2) {
    for (const t of ["com","io","ai","co","app","so","net","org","tech","dev"]) c.push(`${s}.${t}`);
    c.push(`get${s}.com`, `${s}hq.com`, `${s}app.com`, `try${s}.com`);
    // first significant word only, for multiword brands
    const words = brand.split(/\s+/).filter(w => w.length > 2);
    if (words.length > 1) {
      const f = slugOf(words[0]);
      if (f.length >= 4) for (const t of ["com","io","ai","co"]) c.push(`${f}.${t}`);
    }
  }
  return [...new Set(c)].slice(0, 22);
}

const PARK = /(domain (is )?for sale|buy this domain|parked (free|domain)|godaddy\.com\/domainfind|hugedomains|this domain (may be|is) for sale|sedoparking|dan\.com\b|afternic|namecheap parking|future home of|under construction)/i;

function fetchOnce(host, path = "/", redirects = 0) {
  return new Promise(resolve => {
    const req = https.get(
      { host, path, headers: { "User-Agent": "Mozilla/5.0 (compatible; leadbot/1.0)", Accept: "text/html" }, timeout: 7000 },
      res => {
        const { statusCode, headers } = res;
        if ([301,302,303,307,308].includes(statusCode) && headers.location && redirects < 3) {
          res.resume();
          try {
            const u = new URL(headers.location, `https://${host}${path}`);
            if (u.protocol !== "https:" && u.protocol !== "http:") return resolve(null);
            return resolve(fetchOnce(u.hostname, u.pathname + u.search, redirects + 1).then(r => r && { ...r, host: u.hostname }));
          } catch { return resolve(null); }
        }
        if (statusCode !== 200) { res.resume(); return resolve(null); }
        let body = "";
        res.on("data", d => { if (body.length < 60000) body += d; });
        res.on("end", () => resolve({ host, body }));
      }
    );
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
  });
}

// brand-token-in-page guard: only accept a guessed domain if the page says the brand
function pageMatches(body, brand) {
  if (PARK.test(body)) return false;
  const nb = norm(body);
  const s = slugOf(brand);
  if (s.length >= 4 && nb.includes(s)) return true;
  const words = brand.split(/\s+/).map(norm).filter(w => w.length > 3);
  if (words.length >= 2 && words.every(w => nb.includes(w))) return true;
  return false;
}

async function resolveOne(e) {
  const brand = brandOf(e);
  const emb = embedded(e.name);
  for (const cand of candidates(e)) {
    const r = await fetchOnce(cand.replace(/^www\./, ""));
    if (!r) continue;
    const finalHost = r.host.replace(/^www\./, "");
    // an embedded domain that serves a real page is accepted even if the brand string differs
    if (cand === emb && !PARK.test(r.body)) return { domain: finalHost, resolved: brand, confidence: "script" };
    if (pageMatches(r.body, brand)) return { domain: finalHost, resolved: brand, confidence: "script" };
  }
  return null;
}

const out = {};
let done = 0;
const queue = need.slice();
async function worker() {
  while (queue.length) {
    const e = queue.shift();
    try { const r = await resolveOne(e); if (r) out[e.key] = r; } catch {}
    if (++done % 40 === 0) process.stderr.write(`${done}/${need.length} (${Object.keys(out).length} hit)\n`);
  }
}
await Promise.all(Array.from({ length: 24 }, worker));
fs.writeFileSync("work/script_resolved.json", JSON.stringify(out, null, 2));
console.log(`Tier 0.5: resolved ${Object.keys(out).length}/${need.length}`);
