// verify-domains.mjs — deterministic gate on model-found domains (name2domain/batches/batch-N-out.json).
// A Haiku "high" is a claim, not a check: in the pilot one "high" domain did not even resolve (ENOTFOUND).
// For each non-empty domain: fetch https://<d>/ (then http://, then www.) with redirects, and the /contact
// page if the homepage lacks both; verdict = phone (lead's 10 digits on the site) | city | live_nomatch | dead.
// Keep phone/city matches. A site that exists but can't be matched from raw HTML (JS builders, 403/503) is kept
// only when the model said high (it saw the evidence in search); the owner read's ENTITY-MATCH is the backstop.
// Dead = does not resolve / refused / 404 / 410 — the model-invented domain case. Always dropped.
// Usage: node pull/verify-domains.mjs [batchNums...]  -> name2domain/verified.jsonl (appends; skips done keys)
import fs from "node:fs"; import https from "node:https"; import http from "node:http";
const RUN = new URL("../", import.meta.url), B = new URL("name2domain/batches/", RUN);
const OUT = new URL("name2domain/verified.jsonl", RUN);
const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l).key) : []);
const nums = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(B).map(f => (f.match(/^batch-(\d+)-out\.json$/) || [])[1]).filter(Boolean);
const norm = s => (s || "").toLowerCase().replace(/[^a-z0-9]/g, ""), digits = s => (s || "").replace(/\D/g, "");
function get(url, n = 0) {
  return new Promise(res => {
    let u; try { u = new URL(url); } catch { return res(null); }
    const lib = u.protocol === "http:" ? http : https;
    const req = lib.get(u, { headers: { "User-Agent": "Mozilla/5.0 (compatible; leadbot/1.0)" }, timeout: 9000 }, r => {
      if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location && n < 4) { r.resume(); return res(get(new URL(r.headers.location, u).href, n + 1)); }
      if (r.statusCode >= 400) { r.resume(); return res({ status: r.statusCode, body: "" }); }
      let body = ""; r.on("data", d => { if (body.length < 300000) body += d; }); r.on("end", () => res({ status: r.statusCode, body }));
    });
    req.on("timeout", () => { req.destroy(); res(null); }); req.on("error", e => res({ err: e.code }));
  });
}
async function verify(it, v) {
  const d = v.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  let r = null;
  for (const u of [`https://${d}/`, `http://${d}/`, `https://www.${d}/`]) { r = await get(u); if (r && r.body) break; }
  if (!r) return { verdict: "dead", detail: "timeout" };
  if (r.err === "ENOTFOUND" || r.err === "ECONNREFUSED" || r.status === 404 || r.status === 410) return { verdict: "dead", detail: r.err || r.status };
  if (!r.body) return { verdict: "live_unreadable", detail: r.err || r.status };   // 403/503/JS shell: exists, can't read
  let body = r.body;
  const ph = digits(it.phone).slice(-10), city = norm((it.city || "").split(",")[0]);
  const has = b => ({ phone: ph.length === 10 && digits(b).includes(ph), city: city.length >= 4 && norm(b).includes(city) });
  let h = has(body);
  if (!h.phone && !h.city) { const c = await get(`https://${d}/contact`) || {}; if (c.body) { body += c.body; h = has(body); } }
  const brand = norm((it.name || "").replace(/\b(inc|llc|co|corp|company|the)\b/gi, "")).slice(0, 8);
  if (h.phone) return { verdict: "phone" }; if (h.city) return { verdict: "city" };
  return { verdict: "live_nomatch", brand_on_page: brand.length >= 4 && norm(body).includes(brand) };
}
const tally = {};
for (const n of nums) {
  const inp = Object.fromEntries(JSON.parse(fs.readFileSync(new URL(`batch-${n}-in.json`, B))).map(x => [x.key, x]));
  let out; try { out = JSON.parse(fs.readFileSync(new URL(`batch-${n}-out.json`, B), "utf8").replace(/^﻿/, "")); } catch { continue; }
  await Promise.all(Object.entries(out).map(async ([k, v]) => {
    if (done.has(k) || !inp[k]) return;
    const rec = { key: k, batch: +n, name: inp[k].name, domain: (v.domain || "").trim().toLowerCase(), model_conf: v.confidence || "", facebook: v.facebook || "" };
    if (rec.domain) Object.assign(rec, await verify(inp[k], rec)); else rec.verdict = "blank";
    rec.keep = ["phone", "city"].includes(rec.verdict) || (["live_nomatch", "live_unreadable"].includes(rec.verdict) && rec.model_conf === "high");
    tally[rec.verdict] = (tally[rec.verdict] || 0) + 1; if (rec.keep) tally.kept = (tally.kept || 0) + 1;
    fs.appendFileSync(OUT, JSON.stringify(rec) + "\n");
  }));
}
console.log(JSON.stringify(tally));
