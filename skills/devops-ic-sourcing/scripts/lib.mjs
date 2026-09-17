// lib.mjs — shared helpers for the devops-ic-sourcing scripts. No dependencies.
import fs from "node:fs";
import https from "node:https";
import http from "node:http";

export const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export function loadConfig() {
  const p = process.env.CONFIG || "config.json";
  if (!fs.existsSync(p)) { console.error(`no ${p} — copy config.example.json to config.json in your run folder`); process.exit(1); }
  return JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, ""));
}

// ---------- CSV ----------
export function parseCSV(t) {
  const rows = []; let f = [], cur = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { f.push(cur); cur = ""; }
    else if (c === "\n") { f.push(cur); rows.push(f); f = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur !== "" || f.length) { f.push(cur); rows.push(f); }
  return rows.filter(r => r.length > 1 || (r[0] || "").trim());
}
export const csvEsc = v => { v = v == null ? "" : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
export function writeCSV(path, cols, rows) {
  fs.writeFileSync(path, [cols.join(",")].concat(rows.map(r => cols.map(c => csvEsc(r[c])).join(","))).join("\n") + "\n");
}
export function readCSVObjects(path) {
  const rows = parseCSV(fs.readFileSync(path, "utf8").replace(/^﻿/, ""));
  const h = rows.shift().map(s => s.trim());
  return rows.map(r => Object.fromEntries(h.map((k, i) => [k, (r[i] || "").trim()])));
}

// ---------- JSONL ----------
export function readJSONL(path) {
  if (!fs.existsSync(path)) return [];
  return fs.readFileSync(path, "utf8").split("\n").filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
export const appendJSONL = (path, obj) => fs.appendFileSync(path, JSON.stringify(obj) + "\n");

// ---------- HTTP ----------
export function fetchText(urlStr, { timeout = 15000, redirects = 0, headers = {}, method = "GET", body = null } = {}) {
  return new Promise(resolve => {
    let u; try { u = new URL(urlStr); } catch { return resolve({ err: "badurl" }); }
    const lib = u.protocol === "http:" ? http : https;
    const req = lib.request({ host: u.hostname, path: u.pathname + u.search, port: u.port || undefined, method,
      headers: { "User-Agent": UA, Accept: "text/html,application/json;q=0.9,*/*;q=0.8", ...headers }, timeout }, res => {
      const { statusCode, headers: h } = res;
      if ([301, 302, 303, 307, 308].includes(statusCode) && h.location && redirects < 4) {
        res.resume();
        try { const nu = new URL(h.location, u); if (!/^https?:$/.test(nu.protocol)) return resolve({ err: "badredir" });
          return resolve(fetchText(nu.toString(), { timeout, redirects: redirects + 1, headers }).then(r => ({ ...r, finalUrl: r.finalUrl || nu.toString() }))); }
        catch { return resolve({ err: "badredir" }); }
      }
      let out = ""; res.setEncoding("utf8");
      res.on("data", d => { if (out.length < 8_000_000) out += d; });
      res.on("end", () => resolve({ status: statusCode, body: out, finalUrl: u.toString(), headers: h }));
    });
    req.on("timeout", () => { req.destroy(); resolve({ err: "timeout" }); });
    req.on("error", e => resolve({ err: e.code || "error" }));
    if (body) req.write(body);
    req.end();
  });
}
export async function pool(items, conc, fn) {
  let i = 0; const out = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- HTML ----------
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…", bull: "•" };
export function decodeEntities(s) {
  return (s || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] ?? m;
  });
}
export function htmlToText(html) {
  let t = (html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  t = t.replace(/<\/(p|div|li|h\d|tr|br|ul|ol|section)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ");
  t = decodeEntities(t).replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  return t;
}
export function extractHrefs(html) {
  const out = []; const re = /href\s*=\s*["']?(https?:\/\/[^"'\s>]+)/gi; let m;
  while ((m = re.exec(html || ""))) out.push(m[1]);
  return out;
}

// ---------- domains ----------
const CC_SLD = /^(co|com|org|net|ac|gov|edu)$/;
export function registrable(host) {
  host = (host || "").toLowerCase().replace(/^www\./, "");
  const p = host.split(".");
  if (p.length <= 2) return host;
  if (p[p.length - 1].length === 2 && CC_SLD.test(p[p.length - 2])) return p.slice(-3).join(".");
  return p.slice(-2).join(".");
}
export function hostOf(u) { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } }
export const JUNK_HOST = /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|linkedin\.com|lnkd\.in|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|youtu\.be|glassdoor\.com|indeed\.com|github\.com|google\.com|goo\.gl|bit\.ly|apple\.com|microsoft\.com|amazon\.com|amazonaws\.com|w3\.org|schema\.org|wikipedia\.org|notion\.site|notion\.so|calendly\.com|medium\.com|builtin\.com|crunchbase\.com|wellfound\.com|angel\.co|eeoc\.gov|dol\.gov|whatsapp\.com|tiktok\.com|vimeo\.com|cloudflare\.com|gstatic\.com|googleapis\.com|greenhouse\.com|ashbyprd\.com|typekit\.net|unpkg\.com|sharepoint\.(us|com)|cloudfront\.net|jsdelivr\.net|fontawesome\.com|bootstrapcdn\.com|jquery\.com|wixstatic\.com|website-files\.com|webflow\.io|imgix\.net|wp\.com|wordpress\.com|gravatar\.com|giphy\.com|lever-client-logos\.[a-z]+|office\.com|live\.com|outlook\.com|gmail\.com|adobe\.com|salesforce\.com|hubspotusercontent[a-z0-9-]*\.net|gdpr\.eu|hubspot\.com|hsforms\.com|mailchimp\.com|typeform\.com|docsend\.com|loom\.com|figma\.com|slack\.com|zoom\.us|jobgether\.com|levels\.fyi|comparably\.com|g2\.com|trustpilot\.com|paylocity\.com|adp\.com|bamboohr\.com|myworkdayjobs\.com|icims\.com|smartrecruiters\.com|jobvite\.com|rippling\.com|gem\.com|dover\.com|welcometothejungle\.com|otta\.com|ycombinator\.com|producthunt\.com|forbes\.com|techcrunch\.com|inc\.com|bloomberg\.com|reuters\.com|nytimes\.com|wsj\.com|discord\.gg|discord\.com|reddit\.com|substack\.com|spotify\.com|pinterest\.com|threads\.net|bsky\.app|mastodon\.social|e-verify\.gov|uscis\.gov|ftc\.gov|sec\.gov|state\.gov|europa\.eu|gov\.uk|nyc\.gov|ca\.gov|ny\.gov|co\.uk\/government|policy\.[a-z]+|cookieyes\.com|onetrust\.com|iubenda\.com|osano\.com|termly\.io|greenhouse-hosted\.[a-z]+)$/i;
export const norm = s => (s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
export function slugStem(s) { return norm(s).replace(/(careers?|jobs?|inc|llc|ltd|corp|co|hq|team|talent|labs?|technologies|technology|tech|group|global|software|io|ai|app)$/g, ""); }
