// resolve-domains.mjs — Tier 0.5 name->domain for the no-website track, adapted from
// skills/name-to-domain/scripts/script-resolve.mjs (the two documented adaptation points + a stricter guard).
//   brandOf(): the business name minus legal suffixes and a trailing " - <branch city>".
//   input:    leads_nowebsite.csv (place_id,name,city,phone_number,...), output: name2domain/resolved.jsonl
//   guard:    the skill accepts on brand-token-in-page. Local trades have generic names ("Power Solutions")
//             shared by many firms, so this also requires the lead's OWN phone (10 digits) or city on the
//             page (R4b consensus). phone match = "script_phone", city match = "script_city".
// Candidate generation, parked-domain reject and the concurrency pool are the skill's core, unchanged in spirit.
// Resumable: keys already in resolved.jsonl / tried.jsonl are skipped.
import fs from "node:fs";
import https from "node:https";
const RUN = new URL("../", import.meta.url);
const OUTDIR = new URL("name2domain/", RUN); fs.mkdirSync(OUTDIR, { recursive: true });
const RES = new URL("resolved.jsonl", OUTDIR), TRIED = new URL("tried.jsonl", OUTDIR);
function parseCsv(t){const R=[];let r=[],c="",q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===","){r.push(c);c="";}else if(ch==="\n"){r.push(c);R.push(r);r=[];c="";}else if(ch!=="\r")c+=ch;}}if(c!==""||r.length){r.push(c);R.push(r);}return R;}
const rows = parseCsv(fs.readFileSync(new URL("leads_nowebsite.csv", RUN), "utf8")).filter(r => r.length > 1);
const H = rows.shift(); const leads = rows.map(r => Object.fromEntries(H.map((h, i) => [h, r[i] ?? ""])));
const doneKeys = new Set();
for (const f of [RES, TRIED]) if (fs.existsSync(f)) for (const l of fs.readFileSync(f, "utf8").split("\n")) if (l.trim()) doneKeys.add(JSON.parse(l).place_id);
const queue = leads.filter(l => l.place_id && l.name && !doneKeys.has(l.place_id));

function brandOf(e) {
  return (e.name || "").replace(/\s+-\s+[^-]+$/, "")                       // "Acme Power - Falmouth" -> "Acme Power"
    .replace(/[,.]?\s*\b(inc|llc|l\.l\.c|ltd|co|corp|corporation|company|the|pllc|lp)\b\.?/gi, " ").trim();
}
const slugOf = b => b.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const norm = s => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const digits = s => (s || "").replace(/\D/g, "");
function candidates(e) {
  const s = slugOf(brandOf(e)); if (s.length < 4) return [];
  const c = [`${s}.com`, `${s}.net`, `${s}llc.com`, `${s}inc.com`, `${s}.us`, `${s}co.com`];
  const amp = slugOf(brandOf(e).replace(/&/g, "")); if (amp !== s) c.push(`${amp}.com`);
  return [...new Set(c)];
}
const PARK = /(domain (is )?for sale|buy this domain|parked (free|domain)|godaddy\.com\/domainfind|hugedomains|this domain (may be|is) for sale|sedoparking|dan\.com\b|afternic)/i;
function fetchOnce(host, path = "/", redirects = 0) {
  return new Promise(resolve => {
    const req = https.get({ host, path, headers: { "User-Agent": "Mozilla/5.0 (compatible; leadbot/1.0)", Accept: "text/html" }, timeout: 7000 }, res => {
      const { statusCode, headers } = res;
      if ([301, 302, 303, 307, 308].includes(statusCode) && headers.location && redirects < 3) {
        res.resume();
        try { const u = new URL(headers.location, `https://${host}${path}`);
          if (!/^https?:$/.test(u.protocol)) return resolve(null);
          return resolve(fetchOnce(u.hostname, u.pathname + u.search, redirects + 1)); } catch { return resolve(null); }
      }
      if (statusCode !== 200) { res.resume(); return resolve(null); }
      let body = ""; res.on("data", d => { if (body.length < 120000) body += d; }); res.on("end", () => resolve({ host, body }));
    });
    req.on("timeout", () => { req.destroy(); resolve(null); }); req.on("error", () => resolve(null));
  });
}
async function resolveEntry(e) {
  const bslug = slugOf(brandOf(e)), ph = digits(e.phone_number).slice(-10);
  const city = norm((e.city || "").split(",")[0]);
  for (const cand of candidates(e)) {
    const r = await fetchOnce(cand).catch(() => null);
    if (!r || !r.body || PARK.test(r.body)) continue;
    const nbody = norm(r.body), dbody = digits(r.body);
    const title = (r.body.match(/<title[^>]*>([^<]{0,160})<\/title>/i) || [])[1] || "";
    if (!(nbody.includes(bslug) || norm(title).includes(bslug))) continue;         // skill's brand guard
    if (ph.length === 10 && dbody.includes(ph)) return { domain: r.host.replace(/^www\./, ""), confidence: "script_phone" };
    if (city.length >= 4 && nbody.includes(city)) return { domain: r.host.replace(/^www\./, ""), confidence: "script_city" };
  }
  return null;
}
let done = 0, hit = 0; const total = queue.length;
async function worker() {
  while (queue.length) {
    const e = queue.shift(); const r = await resolveEntry(e).catch(() => null); done++;
    if (r) { hit++; fs.appendFileSync(RES, JSON.stringify({ place_id: e.place_id, name: e.name, ...r }) + "\n"); }
    else fs.appendFileSync(TRIED, JSON.stringify({ place_id: e.place_id }) + "\n");
    if (done % 100 === 0) console.error(`  ${done}/${total} processed, ${hit} resolved`);
  }
}
await Promise.all(Array.from({ length: 24 }, worker));
console.error(`DONE: ${hit}/${total} resolved`);
