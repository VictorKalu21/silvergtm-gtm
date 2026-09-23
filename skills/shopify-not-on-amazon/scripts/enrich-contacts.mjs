// STEP 9a · Contact footprint enrichment for the LEADS only (cheap, free): walks the store's contact / policy / about /
// wholesale / press pages for emails, phones, LinkedIn and named people. Shopify's /policies/contact-information page is
// the most reliable source (Shopify requires it). Prefers addresses on the brand's own domain; drops generic-role noise
// only when a better address exists. Named people come from About/Team/Press page patterns ("Founded by X", "CEO X").
// Resume-safe. Output feeds merge.mjs final (Email / Phone / LinkedIn / Decision Maker fallbacks when no Apollo export).
//
//   RUN=<run> DIR=<dir> node enrich-contacts.mjs     # {RUN}_keeps.json x {RUN}_amazon_verify.json (lead statuses) -> {RUN}_contacts.json
//   env: CONC (6)  ALL=1 (enrich every keep, not just leads)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const DIR = process.env.DIR || '.', RUN = process.env.RUN || 'run', CONC = Number(process.env.CONC || 6);
const OUT = `${DIR}/${RUN}_contacts.json`;
const rd = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8').replace(/^﻿/, ''));
const keeps = rd(`${RUN}_keeps.json`); const vf = existsSync(`${DIR}/${RUN}_amazon_verify.json`) ? rd(`${RUN}_amazon_verify.json`) : {};
const LEAD = new Set(['none', 'listings_3p', 'listings_dormant']);
const rows = keeps.filter((k) => process.env.ALL === '1' || LEAD.has(vf[k.domain]?.amazon_status));
const done = existsSync(OUT) ? rd(`${RUN}_contacts.json`) : {};
const todo = rows.filter((r) => !done[r.domain]);
console.error(`${RUN}: ${rows.length} lead domains, ${Object.keys(done).length} done, ${todo.length} to enrich`);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const PATHS = ['/policies/contact-information', '/pages/contact', '/pages/contact-us', '/pages/customer-service', '/pages/help', '/pages/faq', '/pages/faqs', '/pages/about', '/pages/about-us', '/pages/our-story', '/pages/team', '/pages/press', '/pages/wholesale', '/policies/legal-notice', '/policies/privacy-policy', '/policies/terms-of-service'];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g;
const PHONE = /(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g;
const PERSON = /(?:founded by|founder(?:s)?[,:]?|co-founder[,:]?|ceo[,:]?|owner[,:]?|president[,:]?|head of e-?commerce[,:]?|started by|created by|meet)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z'’-]+){1,2})/g;
const BAD_EMAIL = /\.(?:png|jpe?g|gif|svg|webp|js|css)$|example\.|sentry|wixpress|schema\.org|\d{6,}@|@\d|noreply|no-reply|donotreply|@shopify\.com|@klaviyo|@gorgias|@zendesk|@[a-z0-9-]+\.myshopify\.com|yourwebsite|@email\.com|@domain\.com|adafeedback/i;
const GENERIC_LOCAL = /^(info|support|hello|contact|help|customerservice|customer-service|service|sales|orders|shop|team|care|hi|wholesale|press|privacy|legal|returns|billing|marketing|media|admin)@/i;
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ');
async function get(url) { try { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US' }, signal: AbortSignal.timeout(15000), redirect: 'follow' }); if (r.status !== 200) return null; return await r.text(); } catch { return null; } }
async function enrich(r) {
  const d = r.domain; const emails = new Map(), phones = new Map(), people = new Map(); let linkedin = r.linkedin || null;
  for (const p of PATHS) {
    const h = await get(`https://${d}${p}`); if (!h) continue; const t = strip(h);
    for (const m of h.matchAll(/mailto:([^"'?\s]+)/g)) { const e = m[1].toLowerCase(); if (!BAD_EMAIL.test(e) && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e)) emails.set(e, emails.get(e) || p); }
    for (const m of t.matchAll(EMAIL)) { const e = m[0].toLowerCase(); if (!BAD_EMAIL.test(e)) emails.set(e, emails.get(e) || p); }
    for (const m of t.matchAll(PHONE)) { const ph = m[0].replace(/[^+\d]/g, ''); if (ph.replace(/\D/g, '').length >= 10 && !phones.has(ph)) phones.set(ph, p); }
    if (!linkedin) { const li = h.match(/linkedin\.com\/company\/([A-Za-z0-9_.\-]+)/); if (li) linkedin = li[1]; }
    if (/about|story|team|press/.test(p)) for (const m of t.matchAll(PERSON)) { const name = m[1].trim(); if (!/^(Our|The|Shop|Free|New|Best|Get|All|Your|Learn|Meet)\b/.test(name)) people.set(name, (people.get(name) || 0) + 1); }
  }
  const own = [...emails.keys()].filter((e) => e.endsWith('@' + d) || e.endsWith('@' + d.replace(/^www\./, ''))); const other = [...emails.keys()].filter((e) => !own.includes(e));
  const ranked = [...own.filter((e) => !GENERIC_LOCAL.test(e)), ...own.filter((e) => GENERIC_LOCAL.test(e)), ...other.filter((e) => !GENERIC_LOCAL.test(e)), ...other];
  return { domain: d, emails: ranked.slice(0, 5), personalEmail: ranked.find((e) => !GENERIC_LOCAL.test(e)) || null, phones: [...phones.keys()].slice(0, 3), linkedin, people: [...people.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n), pagesHit: [...new Set([...emails.values(), ...phones.values()])] };
}
let i = 0, n = 0;
async function worker() { while (i < todo.length) { const r = todo[i++]; try { done[r.domain] = await enrich(r); } catch (e) { done[r.domain] = { domain: r.domain, error: e.message }; } n++; if (n % 20 === 0) { writeFileSync(OUT, JSON.stringify(done, null, 1)); console.error(`${n}/${todo.length}`); } } }
await Promise.all(Array.from({ length: CONC }, worker));
writeFileSync(OUT, JSON.stringify(done, null, 1));
const all = rows.map((r) => done[r.domain]).filter(Boolean);
console.error(`===== ${RUN}: CONTACTS DONE ===== any email ${all.filter((x) => x.emails?.length).length}/${all.length} | named-person email ${all.filter((x) => x.personalEmail).length} | phone ${all.filter((x) => x.phones?.length).length} | linkedin ${all.filter((x) => x.linkedin).length} | named person on site ${all.filter((x) => x.people?.length).length}`);
