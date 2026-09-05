// STEP 1-4 signal pipeline for the web-visitor de-ID qualify skill.
// Fetch each homepage once (free) and derive ALL the free-gate signals from that one fetch:
//   (2) ad pixel present  (3) NO de-id pixel (+Knock2)  (4) routes-to-sales
// Also saves a pruned homepage-text blob per row for the later Haiku B2B classify (step 5),
// and the facebook.com link (for step 6 page-ID resolution). Cracks GTM containers so pixels
// fired via Tag Manager are visible. RUN-param driven.
//
//   RUN=<run> node pipeline.mjs      # reads {RUN}_input.json, writes {RUN}_signal.json + _ALL.csv
//
// Input row shape (from an Apollo accounts-export -> json): {name, website, employees, state, industry, desc}
import { readFileSync, writeFileSync } from 'node:fs';
const DIR = process.env.DIR || '.';
const RUN = process.env.RUN || 'run';
const input = JSON.parse(readFileSync(`${DIR}/${RUN}_input.json`, 'utf8').replace(/^﻿/, ''));

// ---- ad pixels: STRICT. A real ad account id, not bare GA4/GTM ----
const AD_PIXELS = {
  google_ads: [/AW-\d{6,}/, /googleadservices\.com\/pagead\/conversion/i, /gtag\/js\?id=AW-/i],
  meta:       [/fbq\s*\(/i, /connect\.facebook\.net\/[^"']*\/fbevents\.js/i, /facebook\.com\/tr\?id=\d/i],
  linkedin:   [/snap\.licdn\.com\/li\.lms-analytics\/insight\.min\.js/i, /_linkedin_partner_id/i],
  bing: [/bat\.bing\.com/i], tiktok: [/analytics\.tiktok\.com/i], twitter: [/static\.ads-twitter\.com/i], reddit: [/redditstatic\.com\/ads/i],
};
const PRIMARY = ['google_ads', 'meta', 'linkedin'];

// ---- de-id / visitor de-anon tools: EXCLUDE if present (greenfield only). Knock2 added. ----
const DEID = {
  knock2: [/knock2/i, /getknock2/i, /\bknock2\.(?:io|com|ai)\b/i],
  rb2b: [/\brb2b\b/i, /s\.rb2b\.com/i], leadfeeder: [/lftracker/i, /sc\.lfeeder\.com/i, /lfeeder/i], albacross: [/albacross/i],
  warmly: [/warmly\.ai/i, /getwarmly/i], clearbit_reveal: [/clearbitjs\.com/i, /x\.clearbit\.com/i], vector: [/vector\.co/i, /getvector/i],
  koala: [/getkoala\.com/i], snitcher: [/snitcher/i], lead_forensics: [/leadforensics/i], sixsense: [/6sc\.co/i, /6sense/i],
  demandbase: [/demandbase/i, /company-target\.com/i], zoominfo_websights: [/ws\.zoominfo\.com/i], factors: [/factors\.ai/i], opensend: [/opensend/i],
};

// ---- routes-to-sales: a human sales motion exists on the site ----
const SALES_CTA = /book a demo|request a demo|get a demo|schedule a demo|talk to (sales|an expert|us)|contact sales|see it in action|request (a )?(quote|pricing|consultation|proposal)|get (a )?quote|start (a |your )?(free )?trial|get started|speak (to|with) (an? )?(expert|specialist|advisor|rep)/i;
const HAS_FORM = /<form[\s>]/i;
const CLICK_TO_CALL = /href=["']tel:/i;

const GTM = [/GTM-[A-Z0-9]{4,}/, /googletagmanager\.com\/gtm\.js/i];
const GA4 = [/gtag\/js\?id=G-/i, /\bG-[A-Z0-9]{8,}\b/, /google-analytics\.com\/analytics\.js/i, /googletagmanager\.com\/gtag\/js/i];
const CONTAINER = { google_ads: [/AW-\d{6,}/], meta: [/fbq\s*\(/i, /facebook\.com\/tr\?id=\d/i, /connect\.facebook\.net\/[^"']*\/fbevents\.js/i], linkedin: [/_linkedin_partner_id/i, /snap\.licdn\.com\/li\.lms-analytics/i] };
const FB_LINK = /(?:https?:)?\/\/(?:www\.|web\.)?facebook\.com\/([A-Za-z0-9_.\-]{2,})/i;

const any = (t, p) => p.some((x) => x.test(t));
const norm = (u) => { if (!u) return null; let s = String(u).trim(); if (!/^https?:\/\//i.test(s)) s = 'https://' + s; try { return new URL(s).href; } catch { return null; } };

async function get(url) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), Number(process.env.TIMEOUT) || 20000);
  try { const r = await fetch(url, { redirect: 'follow', signal: c.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' } }); return { ok: true, status: r.status, finalUrl: r.url, html: await r.text() }; }
  catch (e) { return { ok: false, err: e.name === 'AbortError' ? 'timeout' : (e.cause?.code || e.message) }; } finally { clearTimeout(t); }
}
async function resolveGtm(ids) { const found = new Set(); for (const id of ids) { const js = await get(`https://www.googletagmanager.com/gtm.js?id=${id}`); if (!js.ok) continue; for (const [n, p] of Object.entries(CONTAINER)) if (any(js.html, p)) found.add(n); } return [...found]; }

// prune homepage HTML -> compact text for the LLM classify step (strip chrome, cap length)
function pruneText(html) {
  let t = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  return t.slice(0, 2500);
}

const results = []; let i = 0, done = 0; const CONC = 20; const t0 = Date.now();
async function worker() {
  while (i < input.length) {
    const row = input[i++]; const url = norm(row.website);
    if (!url) { results.push({ ...row, fetch: 'no_website' }); done++; continue; }
    let res = await get(url);
    if (!res.ok) { const r2 = await get(url.replace(/^https/, 'http')); if (r2.ok) res = r2; }
    const rec = { ...row, url };
    if (!res.ok) { rec.fetch = 'fail:' + res.err; results.push(rec); done++; tick(); continue; }
    const html = res.html;
    const pixels = []; for (const [n, p] of Object.entries(AD_PIXELS)) if (any(html, p)) pixels.push(n);
    const deid = []; for (const [n, p] of Object.entries(DEID)) if (any(html, p)) deid.push(n);
    const hasGtm = any(html, GTM), hasGa = any(html, GA4);
    const gtmIds = [...new Set([...html.matchAll(/GTM-[A-Z0-9]{4,}/g)].map((m) => m[0]))];
    let primary = pixels.filter((p) => PRIMARY.includes(p)); let paidVia = primary.length ? 'html' : null;
    if (!primary.length && hasGtm && gtmIds.length && !deid.length) {
      const gp = await resolveGtm(gtmIds); const gprim = gp.filter((p) => PRIMARY.includes(p));
      if (gprim.length) { primary = [...new Set([...primary, ...gprim])]; paidVia = 'gtm_container'; rec.gtmPixels = gp; }
    }
    const salesCta = SALES_CTA.test(html), hasForm = HAS_FORM.test(html), clickCall = CLICK_TO_CALL.test(html);
    const fb = (html.match(FB_LINK) || [])[1] || null;
    Object.assign(rec, {
      fetch: 'ok', status: res.status, finalUrl: res.finalUrl,
      pixels, primaryPixels: primary, deid, hasGtm, hasGa,
      hasPaidPixel: primary.length > 0, hasDeid: deid.length > 0, paidVia,
      salesCta, hasForm, clickCall, routesToSales: salesCta || hasForm || clickCall,
      fbHandle: (fb && !/^(tr|sharer|dialog|plugins|pages|profile\.php)$/i.test(fb) ? fb : null) || row.fbApollo || null,
      text: pruneText(html),
    });
    results.push(rec); done++; tick();
  }
}
function tick() { if (done % 100 === 0) { const el = (Date.now() - t0) / 1000, rate = done / el, eta = Math.round((input.length - done) / rate); console.error(`${done}/${input.length}  ${rate.toFixed(1)}/s  eta ${Math.floor(eta / 60)}m${eta % 60}s`); } }

await Promise.all(Array.from({ length: CONC }, worker));

// ---- free-gate status: HARD gates = paid pixel AND no de-id AND routes-to-sales ----
for (const r of results) {
  r.empOver = r.employees > (Number(process.env.EMP_MAX) || 100000);
  if (r.hasDeid) r.status = 'drop_deid';
  else if (r.fetch !== 'ok') r.status = 'unreachable';
  else if (!r.hasPaidPixel) r.status = 'drop_no_pixel';
  else if (!r.routesToSales) r.status = 'drop_no_sales_route';
  else r.status = 'pass_free_gates'; // -> proceeds to step 5 (B2B) + step 6 (ad-lib)
}
writeFileSync(`${DIR}/${RUN}_signal.json`, JSON.stringify(results, null, 2));
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const cols = ['name', 'url', 'employees', 'state', 'industry', 'status', 'hasPaidPixel', 'paidVia', 'primaryPixels', 'hasDeid', 'deid', 'routesToSales', 'salesCta', 'hasForm', 'clickCall', 'fbHandle'];
writeFileSync(`${DIR}/${RUN}_ALL.csv`, [cols.join(',')].concat(results.map((r) => cols.map((c) => esc(Array.isArray(r[c]) ? r[c].join('|') : r[c])).join(','))).join('\n'));

const by = (s) => results.filter((r) => r.status === s).length;
console.error(`\n===== ${RUN}: FREE-GATE SIGNAL DONE (${((Date.now() - t0) / 1000).toFixed(0)}s) =====`);
console.error('total:', results.length);
for (const s of ['pass_free_gates', 'drop_no_pixel', 'drop_no_sales_route', 'drop_deid', 'unreachable']) console.error('  ', s + ':', by(s));
console.error('paid via html:', results.filter((r) => r.paidVia === 'html').length, '| via gtm container:', results.filter((r) => r.paidVia === 'gtm_container').length);
console.error('de-id tools found:', results.filter((r) => r.hasDeid).map((r) => r.deid.join('/')).join(', ') || 'none');
console.error(`-> ${by('pass_free_gates')} rows advance to step 5 (B2B classify) + step 6 (ad-lib confirm)`);
