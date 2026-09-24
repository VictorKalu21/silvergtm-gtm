// STEP 7b · Amazon presence VERIFY with plain fetches. Amazon serves a 503 bot wall to a desktop UA but
// returns full search + product pages to a MOBILE Safari UA (found on the first run), so no browser is
// needed. Two fetches per brand: mobile search -> first brand-matching ASIN -> mobile product page.
//   Three candidate sources (plain search, Amazon's brand filter rh=p_89:<Brand>, up to 3 product pages); ANY official listing = official.
//   brand_store        = product byline "Visit the <Brand> Store" / a /stores/ link with the brand's name -> Brand-Registered, official
//   listings_official  = brand-matching product sold by the brand itself or by Amazon (1P)
//   listings_3p        = brand-matching products exist but sold by third parties only -> UNAUTHORIZED RESELLERS, no official presence (the pitch)
//   listings_dormant   = brand-attributed listings exist but every one is 'Currently unavailable' (no seller at all) -> no active presence
//   none               = no brand-matching result on the first page -> not on Amazon
//   blocked            = throttle/captcha page after retries; RETRY=1 next run
// Resume-safe; low concurrency + jitter by design.
//
//   RUN=<run> DIR=<dir> node amazon-verify.mjs      # reads {RUN}_keeps.json (or signal survivors) -> {RUN}_amazon_verify.json
//   env: LIMIT  CONC (2)  RETRY (1 = redo blocked)  REPASS (1 = redo all, never downgrades)  MAX_DP (5 product pages)  DEEP (0 = search only)
//        ONLY=a.com,b.com (re-check just those)  RESCORE=1 (no fetch: upgrade-only re-derive from already-read product pages)  RESCORE=2 (full recompute, may downgrade)
//        AW=0 (use the regular /s and /dp pages instead of the legacy mobile /gp/aw/ ones, which are not IP-throttled)
//        SPIDER_API_KEY=.. (route fetches through Spider Cloud's proxy pool; only needed if the aw endpoints get walled too)
//        SEARCH_PASSES (2)  BF_VARIANTS (3)  -> lighter mode when Amazon is throttling: SEARCH_PASSES=1 BF_VARIANTS=1 MAX_DP=2 CONC=2
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { brandOf, brandVariants, tok, GENERIC_WORDS } from './amazon-autocomplete.mjs';
const DIR = process.env.DIR || '.', RUN = process.env.RUN || 'run', CONC = Number(process.env.CONC || 2), DEEP = process.env.DEEP !== '0';
const OUT = `${DIR}/${RUN}_amazon_verify.json`;
const rd = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8').replace(/^﻿/, ''));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (a, b) => a + Math.random() * (b - a);
// Amazon throttles an exact (UA, Accept, Accept-Language) combination after a few hundred requests, not the IP:
// rotate realistic MOBILE header sets per attempt and the throttle never engages.
const IOS = ['15_6', '16_2', '16_6', '17_0', '17_2', '17_4', '17_5', '17_6', '18_0', '18_1', '18_2', '18_3'];
const UAS = [
  ...IOS.map((v) => `Mozilla/5.0 (iPhone; CPU iPhone OS ${v} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${v.replace('_', '.')} Mobile/15E148 Safari/604.1`),
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.108 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; SM-S928U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'];
// PRODUCT pages: phone UAs get a variant whose byline ("Visit the X Store" / "Brand: X") loads lazily and is NOT in the HTML;
// tablet UAs get the full page. Search pages are fine on phone UAs. (Found on BRUNT: 5 phone fetches, 0 bylines; iPad: byline present.)
const TABLET_UAS = [
  ...IOS.map((v) => `Mozilla/5.0 (iPad; CPU OS ${v} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${v.replace('_', '.')} Mobile/15E148 Safari/604.1`),
  'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'];
// Amazon throttles a header set (not the IP) after a few hundred requests: a burnt UA answers with a ~1 KB shell page.
// Adaptive pool: a UA that returns a shell/503 goes on cooldown and is skipped while others still work.
const COOL = new Map(); const COOLDOWN_MS = Number(process.env.UA_COOLDOWN_MS || 15 * 60 * 1000);
const pickUA = (pool) => { const ok = pool.filter((u) => !(COOL.get(u) > Date.now())); return (ok.length ? ok : pool)[Math.floor(Math.random() * (ok.length ? ok : pool).length)]; };
const ACCEPTS = ['text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', '*/*', 'text/html,application/xhtml+xml,*/*;q=0.8', 'text/html'];
const LANGS = ['en-US,en;q=0.9', 'en-US', 'en-US,en;q=0.8', 'en'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const BLOCK = /Sorry! Something went wrong|Enter the characters you see below|Type the characters|api-services-support@amazon\.com|Robot Check/i;
// HTML entity decoding matters for brand names: Amazon renders BrüMate as "Br&uuml;Mate", and a byline that fails to decode never matches
const ENT = { amp: '&', quot: '"', apos: "'", nbsp: ' ', reg: '®', trade: '™', copy: '©', hellip: '…', ndash: '-', mdash: '-', lsquo: "'", rsquo: "'", ldquo: '"', rdquo: '"', uuml: 'ü', ouml: 'ö', auml: 'ä', Uuml: 'Ü', Ouml: 'Ö', Auml: 'Ä', eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', aring: 'å', iacute: 'í', igrave: 'ì', icirc: 'î', iuml: 'ï', oacute: 'ó', ograve: 'ò', ocirc: 'ô', otilde: 'õ', oslash: 'ø', uacute: 'ú', ugrave: 'ù', ucirc: 'û', ntilde: 'ñ', ccedil: 'ç', szlig: 'ß', Eacute: 'É', Ntilde: 'Ñ', Ccedil: 'Ç' };
const decode = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&([a-zA-Z]+);/g, (m, n) => ENT[n] ?? m);
const strip = (s) => decode(s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// Optional transport: SPIDER_API_KEY=... routes every fetch through Spider Cloud's residential proxy pool (measured 2026-09-23):
//   search pages: request "smart" with no UA override -> full mobile results (59 ASINs), ~$0.003/page; "http" + phone UA -> a 2 KB shell
//   product pages: request "http" + iPad user_agent + residential -> full page with byline, ~$0.005/page
//   the `headers` field is NOT honoured for the UA (Amazon answered its desktop 503 wall); use `user_agent`.
// ~10 pages per brand -> ~$0.04/brand. Same block detection applies to what comes back.
const SPIDER = process.env.SPIDER_API_KEY || '', SPIDER_PROXY = process.env.SPIDER_PROXY || 'residential';
// Amazon's LEGACY MOBILE endpoints (/gp/aw/s search, /gp/aw/d/ASIN product) return the same listings, byline (tablet UA) and seller,
// gzip ~200-300 KB, and were NOT throttled from an IP on which /s and /dp were already serving the 503 wall (measured 2026-09-23).
// Default on; AW=0 falls back to the regular pages. The deliverable's search URL stays the regular /s?k= link.
const AW = process.env.AW !== '0';
const searchUrl = (params) => `https://www.amazon.com/${AW ? 'gp/aw/s' : 's'}?${params}`;
const productUrl = (asin) => `https://www.amazon.com/${AW ? 'gp/aw/d/' : 'dp/'}${asin}`;
async function spiderFetch(url, ua, tablet) {
  const body = tablet ? { url, request: 'http', return_format: 'raw', proxy_enabled: true, proxy: SPIDER_PROXY, limit: 1, user_agent: ua }
                      : { url, request: 'smart', return_format: 'raw', proxy_enabled: true, proxy: SPIDER_PROXY, limit: 1 };
  const r = await fetch('https://api.spider.cloud/scrape', { method: 'POST', headers: { Authorization: `Bearer ${SPIDER}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
  const j = await r.json().catch(() => null);
  const page = Array.isArray(j) ? j[0] : (j?.data?.[0] || j);
  SPIDER_COST += Number(page?.costs?.total_cost || 0);
  return { status: page?.status || r.status, text: async () => (typeof page?.content === 'string' ? page.content : '') };
}
let SPIDER_COST = 0;
async function get(url, tablet = false) {
  for (let a = 0; a < 6; a++) {
    const ua = pickUA(tablet ? TABLET_UAS : UAS);
    try {
      const headers = { 'User-Agent': ua, 'Accept-Language': pick(LANGS), 'Accept': pick(ACCEPTS) };
      const r = SPIDER ? await spiderFetch(url, ua, tablet) : await fetch(url, { headers, signal: AbortSignal.timeout(25000), redirect: 'follow' });
      const html = await r.text();
      if (r.status === 503 || r.status === 429 || BLOCK.test(html.slice(0, 5000)) || html.length < 5000) { COOL.set(ua, Date.now() + COOLDOWN_MS); await sleep(jitter(1000, 3000)); continue; }   // burnt header set -> cooldown, try another
      return { status: r.status, html };
    } catch (e) { await sleep(jitter(3000, 6000)); }
  }
  return { status: 0, html: '', blocked: true };
}

let src = existsSync(`${DIR}/${RUN}_keeps.json`) ? rd(`${RUN}_keeps.json`) : rd(`${RUN}_signal.json`).filter((r) => r.status === 'pass_free_gates');
const ac = existsSync(`${DIR}/${RUN}_amazon_ac.json`) ? rd(`${RUN}_amazon_ac.json`) : {};
const order = { high: 0, low: 1, none: 2 };   // brands shoppers already search for on Amazon first (that's the buyer's real filter)
src.sort((a, b) => (order[ac[a.domain]?.demand] ?? 3) - (order[ac[b.domain]?.demand] ?? 3) || (a.rank || 9e9) - (b.rank || 9e9));
const done = existsSync(OUT) ? rd(`${RUN}_amazon_verify.json`) : {};
// Optional pre-filter from `dataforseo.mjs serp-store` (Google: site:amazon.com "Visit the <Brand> Store", ~$0.002/brand): a hit whose
// store URL or title carries the brand's distinctive word is a Brand Registry store -> brand_store, no Amazon fetch needed (~1/3 fewer).
const serp = existsSync(`${DIR}/${RUN}_dfs_serp.json`) ? rd(`${RUN}_dfs_serp.json`) : {};
// Hand query overrides {domain: "search term"} for sites whose <title> gave a bad name ("top" for kirby.com, "new car" for vinylfrog.com):
// {RUN}_query_overrides.json; re-run those with ONLY=<domains> REPASS=1
const QOVR = existsSync(`${DIR}/${RUN}_query_overrides.json`) ? rd(`${RUN}_query_overrides.json`) : {};
let todo = src.filter((r) => !done[r.domain] || (process.env.RETRY === '1' && done[r.domain].amazon_status === 'blocked') || process.env.REPASS === '1');   // REPASS=1 re-checks everything, accumulating evidence
if (process.env.ONLY) { const only = new Set(process.env.ONLY.split(',').map((x) => x.trim()).filter(Boolean)); todo = src.filter((r) => only.has(r.domain)); }   // ONLY=a.com,b.com re-checks just those (accumulates like REPASS)
if (process.env.LIMIT) todo = todo.slice(0, Number(process.env.LIMIT));
console.error(`${RUN}: ${src.length} brands, ${Object.keys(done).length} done, ${todo.length} to verify (mobile fetch, CONC=${CONC})`);

// Brand matching. "Wyze Labs" must match "WYZE Cam v4", "Stanley 1913" must match "STANLEY Quencher", but "American Autowire"
// must not match every "American ..." title: drop generic words, then require every distinctive word (or the whole token).
const GENERIC = GENERIC_WORDS;
const matcher = (q) => {
  const t = tok(q); const words = q.toLowerCase().split(/[\s&'’.-]+/).map(tok).filter(Boolean);
  // only the first TWO distinctive words are required: "Harney & Sons Fine Teas" must match the byline "Harney & Sons"
  const key = words.filter((w) => !GENERIC.has(w) && w.length >= 3).slice(0, 2); const need = key.length ? key : words.slice(0, 2);
  const lc = (text) => ' ' + (text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';   // word-boundary aware: "electric" must NOT match "lectric"
  const has = (x, w) => x.includes(' ' + w + ' ') || x.includes(' ' + w);                        // whole word, or word-prefix ("lectric" in "lectricxp")
  return (text) => { const x = lc(text); return tok(text).includes(t) && has(lc(text), need[0]) || need.every((w) => has(x, w)); };
};
// words that never make a store/seller name a different entity: corporate suffixes, the shared generic list, category nouns
const SUFFIX = new Set('inc llc co corp ltd llp company store brand brands official usa us the and of by com net org labs group international shop direct retail online sales'.split(' '));
const wordsAll = (x) => (x || '').toLowerCase().split(/[\s&'’.,\/-]+/).map(tok).filter(Boolean);   // keep 1-letter tokens: "V-Force" is not "Force"
// true when NAME carries no distinctive word that the brand name Q lacks ("Force Factor" vs "force usa": 'factor' -> false; "Vincero Collective" vs "vincero": ok)
const stem = (w) => w.replace(/(ies|es|s|y)$/, '');   // nurseries == nursery
const noExtraWords = (name, q) => { const qw = new Set(wordsAll(q)); return wordsAll(name).every((w) => qw.has(w) || SUFFIX.has(w) || GENERIC.has(w) || CATEGORY.has(w) || [...qw].some((x) => stem(x) === stem(w) || (x.length >= 6 && w.startsWith(x) && w.length - x.length <= 2))); };   // 'marina' is not 'marin'; 'nurseries' == 'nursery' via stem
const sellerIsBrand = (seller, q) => { if (!seller) return false; const m = matcher(q); const first = tok(q.split(/\s+/)[0]);
  const key0 = wordsAll(q).filter((w) => w.length >= 3 && !GENERIC.has(w))[0] || '';
  const sw = wordsAll(seller).filter((w) => !SUFFIX.has(w) && !GENERIC.has(w) && !CATEGORY.has(w));   // "CEP Sportswear" -> ["cep"], "RBX" -> ["rbx"]
  return noExtraWords(seller, q) && (m(seller) || (first.length >= 5 && !GENERIC.has(first) && tok(seller).includes(first)) || (key0.length >= 3 && sw.length === 1 && sw[0] === key0)); };
// category nouns a site name carries but an Amazon store name drops ("Vornado Air" -> "Visit the Vornado Store"); local to the byline rule so
// search matching still needs both words ("Hudson Baby" listings never become "Hudson Jeans" candidates)
const CATEGORY = new Set('jeans air optics mounts industries gaming chair chairs archery uniforms performance running cycles cycling elite originals company companies direct factory living outdoor outdoors vacuum vacuums dress dresses steak steaks bags collection sportswear activewear swimwear outerwear apparel footwear shoes therapeutics probiotics sound tech eyewear cases skincare cosmetics fishing water organics mattress'.split(' '));
// byline brand must carry the brand's distinctive words ("Brand: Alo" ok for "alo yoga"; "Visit the Universal Store" NOT ok for "universal standard")
// domain root without the storefront noise: shopmoment.com -> moment, thepauselife.com -> pauselife, randolphusa.com -> randolph
const domainRoot = (domain) => { let r = (domain || '').toLowerCase().replace(/\.[a-z.]+$/, '').replace(/[^a-z0-9]/g, '');
  for (const re of [/^(shop|the|get|my|go|buy|try|hello|drink|eat|wear)(?=.{4})/, /(shop|store|usa|us|official|inc|co|online|direct|brand|brands|company|home|hq)$/]) { const r2 = r.replace(re, ''); if (r2.length >= 4) r = r2; }
  return r; };
const bylineIsBrand = (byline, q, title = '', domain = '') => { let raw = byline.replace(/^Visit the /i, '').replace(/ Store$/i, '').replace(/^Brand:\s*/i, '');
  const byPart = raw.match(/^(.{4,}?)\s+by\s+.+$/i); if (byPart) raw = byPart[1];   // "Alegria by PG Lite" -> "Alegria" (licensor/parent suffix)
  const b = tok(raw); const t = tok(q);
  const words = (x) => x.toLowerCase().split(/[\s&'’.,-]+/).map(tok).filter((w) => w.length >= 3 && !GENERIC.has(w));
  const key = words(q).slice(0, 2);
  // exact forms: whole byline == whole brand name, or == the brand's distinctive words joined ("Harney & Sons" for "Harney & Sons Fine Teas", "Alo" for "Alo Yoga")
  const rawRoot = (domain || '').toLowerCase().replace(/\.[a-z.]+$/, '').replace(/[^a-z0-9]/g, '');   // RAW root: forceusa.com must not become "force"
  const root = domainRoot(domain), single = key.length === 1;   // one distinctive word = inherently ambiguous ("marin", "matador", "joy")
  // the domain root IS the brand word when what is left after it is a category/generic word: aloyoga -> alo, maccosmetics -> mac,
  // pennfishing -> penn, taosfootwear -> taos, cutsclothing -> cuts; NOT marinbikes -> "marina", NOT withclarity -> "clarity"
  const leftover = single && root.startsWith(key[0]) ? root.slice(key[0].length) : null;
  const genericLeft = (x) => x === '' || GENERIC.has(x) || CATEGORY.has(x) || SUFFIX.has(x) || GENERIC.has(stem(x)) || CATEGORY.has(stem(x)) || (x.endsWith('s') && (GENERIC.has(x.slice(0, -1)) || CATEGORY.has(x.slice(0, -1))));
  const rootIsWord = single && (root === key[0] || rawRoot === key[0] || (leftover !== null && (genericLeft(leftover) || genericLeft(key[0].slice(-1) + leftover))));   // svsound -> svs + (s)ound
  const shortAmbiguous = single && t === key[0] && key[0].length < 5 && !rootIsWord;   // "joy" for a domain whose leftover is not a category word
  const tNoConn = tok(q.replace(/\b(and|n)\b|[&+]/gi, ' ')), bNoConn = tok(raw.replace(/\b(and|n)\b|[&+]/gi, ' '));   // "tuftandpaw" == "TuftPaw", "Sugarboo & Co" == "sugarboo and co"
  const exact = (b === t && !shortAmbiguous) || (bNoConn === tNoConn && bNoConn.length >= 5) || (key.length > 1 && b === key.join('')) || (single && b === key[0] && (key[0].length >= 5 || rootIsWord));
  // byline == the brand's first distinctive word, and the product title carries the second ("Visit the WARN Store" + "WARN ... winch")
  const firstPlusTitle = key.length === 2 && b === key[0] && key[0].length >= 4 && tok(title).includes(key[1]);
  // a store byline is usually one word shorter than the site name: whole store name == first distinctive brand word, leftover word is a category noun or in the title
  const storeSubset = /^Visit the /i.test(byline) && key.length > 0 && key[0].length >= 4 && b === key[0] && key.slice(1).every((w) => CATEGORY.has(w) || tok(title).includes(w));   // whole store name == the word ("Hudson Baby" must not pass as "Hudson")
  // domain root == the store name plus generic words only ("CHITA" for chitaliving.com, "Vornado" for vornado.com; NOT "Universal" for universalstandard.com)
  // the domain rules apply to "Visit the X Store" and "Brand: X" alike (both are Amazon's own identity of the listing)
  const domainPrefix = b.length >= 5 && !GENERIC.has(b) && root.startsWith(b) && (root.length === b.length || GENERIC.has(root.slice(b.length)) || CATEGORY.has(root.slice(b.length)));
  // store name starts with the whole domain root ("Darn Tough Vermont" for darntough.com, "Thinx for All" for thinx.com; NOT "Pura Vida Moringa" for puravidabracelets.com, NOT "Force Factor" for forceusa.com)
  // (rawRoot is hoisted above)
  const storePrefix = rawRoot.length >= 5 && !GENERIC.has(rawRoot) && (b.startsWith(rawRoot) || (rawRoot.length >= 6 && b.includes(rawRoot)));   // "Jordan's Skinny Mixes" for skinnymixes.com, "Poo-Pourri" for pourri.com
  // loose forms only when the byline carries NO distinctive word the brand lacks ("Force Factor" is not "Force", "Berkley Jensen" is not "Berkley")
  const looseOk = !single || rootIsWord;   // single-word brands get the loose rules only when the domain root IS that word (kirby.com); marinbikes.com never matches "Marina"
  const loose = (looseOk && noExtraWords(raw, q) && (b.includes(t) || matcher(q)(raw) || firstPlusTitle || storeSubset)) || domainPrefix || storePrefix;   // the domain rules survive a bad search term ("top" for kirby.com)
  return b.length >= 3 && (exact || loose); };
function parseSearch(html, t) {
  // mobile results: several data-asin divs per product; group the text by ASIN in page order
  const byAsin = new Map(); const parts = html.split(/(?=<div[^>]*data-asin="B0[A-Z0-9]{8}")/);
  for (const p of parts) { const m = p.match(/^<div[^>]*data-asin="(B0[A-Z0-9]{8})"/); if (!m) continue; byAsin.set(m[1], (byAsin.get(m[1]) || '') + ' ' + strip(p.slice(0, 20000))); }
  const items = [...byAsin].map(([asin, text]) => ({ asin, text: text.slice(0, 300), sponsored: /\bSponsored\b/.test(text), match: t(text) }));
  const stores = [...html.matchAll(/<a[^>]+href="([^"]*\/stores\/[^"]*)"[^>]*>([\s\S]{0,600}?)<\/a>/g)].map((m) => ({ href: m[1], text: strip(m[2] + ' ' + ((m[2].match(/alt="([^"]*)"/) || [])[1] || '')) }));
  return { items, stores, noResults: /No results for|did not match any products/i.test(html) };
}
function parseProduct(html) {
  const bylineDiv = (html.match(/bylineInfo_feature_div[\s\S]{0,6000}/) || [''])[0];
  const byline = strip((bylineDiv.match(/(Visit the [^<"]{1,80}Store)/) || html.match(/(Visit the [^<"]{1,80}Store)/) || [])[1] || (bylineDiv.match(/Brand:\s*([^<]{1,60})/) || [])[1] && ('Brand: ' + (bylineDiv.match(/Brand:\s*([^<]{1,60})/) || [])[1]) || (html.match(/po-brand[\s\S]{0,600}?<span class="a-size-base po-break-word">([^<]{1,60})/) || [])[1] && ('Brand: ' + (html.match(/po-brand[\s\S]{0,600}?<span class="a-size-base po-break-word">([^<]{1,60})/) || [])[1]) || '');
  const bylineClean = byline.replace(/["']\s*\/?>.*$/, '').trim();
  const bylineHref = (html.match(/id="(?:visitStoreMobileUrl|bylineInfo)"[^>]*href="([^"]*\/stores\/[^"]*)"/) || html.match(/href="([^"]*\/stores\/[^"]*)"[^>]*>\s*(?:<[^>]*>\s*)*Visit the /) || [])[1] || null;
  // seller: phone variant (odf-mobile-merchant-info) | tablet/desktop variant (sellerProfileTriggerId link text, single-quoted attrs) | prose
  const m1 = (re) => (html.match(re) || [])[1] || '';
  let seller = strip(m1(/odf-mobile-merchant-info-anchor-text"[^>]*>([\s\S]{0,200}?)<div/) || m1(/id=['"]sellerProfileTriggerId['"][^>]*>([^<]{1,80})/) || m1(/desktop-merchant-info[\s\S]{0,1500}?offer-display-feature-text-message[^>]*>([^<]{1,80})/) || m1(/Ships from and sold by ([^<.]{1,80})\./) || m1(/Sold by ([^<.]{1,80}) and ships from/) || '');
  if (/learn more about the seller/i.test(seller)) seller = '';
  const shipsFrom = strip(m1(/odf-mobile-fulfiller-info-anchor-text"[^>]*>([\s\S]{0,200}?)<div/) || m1(/desktop-fulfiller-info[\s\S]{0,1500}?offer-display-feature-text-message[^>]*>([^<]{1,80})/) || '');
  // id="title" is a wrapper div with only whitespace inside: use productTitle, then the <title> tag minus Amazon's suffix
  const title = strip((html.match(/id=['"]productTitle['"][^>]*>([^<]{1,300})/) || [])[1] || ((html.match(/<title>([^<]{1,200})/) || [])[1] || '').replace(/^\s*Amazon\.com\s*:\s*/i, '').replace(/\s+(at Amazon|- Amazon\.com|: Amazon\.com|\| Amazon).*$/i, ''));
  const unavailable = !seller && /Currently unavailable\.?(?:\s|<[^>]+>|&[a-z]+;)*We don(?:'|&#39;|&#x27;|’)t know when or if/i.test(html);   // brand listing exists but nobody sells it right now
  return { byline: bylineClean, bylineHref, seller, shipsFrom, title, unavailable };
}
const AMAZON_1P = /^amazon(\.com)?$|^zappos|^shopbop|an amazon company|^woot\b/i;   // Amazon and its owned retailers = first-party
const SEV = { brand_store: 5, listings_official: 4, listings_3p: 3, listings_dormant: 2, listings_unverified: 1, none: 0, blocked: -1 };
async function verify(r, prior) {
  const brand = brandOf(r); let q = QOVR[r.domain] || ac[r.domain]?.query || brandVariants(brand)[0] || brand.toLowerCase();
  const generic = (x) => (x || '').split(/\s+/).map(tok).filter(Boolean).every((w) => GENERIC.has(w) || w.length < 3);
  const root = r.domain.replace(/\.[a-z.]+$/, '').replace(/[^a-z0-9]/gi, '').toLowerCase(), joined = tok(q);
  const tagline = !QOVR[r.domain] && q.split(/\s+/).length >= 3 && !joined.includes(root) && !root.includes(joined);   // "natural, clean skincare" (farmacybeauty.com), "100% grass-fed beef jerky" (chomps.com)
  if (generic(q) || tagline) q = r.domain.replace(/\.[a-z.]+$/, '').replace(/[-_]/g, ' ');   // "kids" -> "striderite"
  const t = matcher(q);
  const g = serp[r.domain];
  if (g && g.google_store_found && (g.store_url || g.store_title)) {
    const key = q.toLowerCase().split(/[\s&'’.-]+/).map(tok).filter((w) => w.length >= 3 && !GENERIC.has(w));
    const hay = tok(decodeURIComponent(g.store_url || '') + ' ' + (g.store_title || ''));
    if (key.length && key.every((w) => hay.includes(w)) || t(g.store_title || '')) return finish({ domain: r.domain, brand, query: q, checkedAt: new Date().toISOString().slice(0, 10), amazonSearchUrl: `https://www.amazon.com/s?k=${encodeURIComponent(q)}`, passes: (prior?.passes || 0) + 1, amazon_status: 'brand_store', storeHref: g.store_url, via: 'google_serp', byline: g.store_title }, prior);
  }
  const v = { domain: r.domain, brand, query: q, checkedAt: new Date().toISOString().slice(0, 10), amazonSearchUrl: `https://www.amazon.com/s?k=${encodeURIComponent(q)}`, passes: (prior?.passes || 0) + 1 };
  // A. plain search, TWICE (Amazon varies the result set per request/header set; the union is far more stable than one sample)
  const cands = []; const seen = new Set(); let blocked = 0, storeHref = null, total = 0, noResults = false;
  const addItems = (items) => { for (const it of items) if (it.match && !seen.has(it.asin)) { seen.add(it.asin); cands.push(it); } };
  for (let pass = 0; pass < Number(process.env.SEARCH_PASSES || 2); pass++) {
    const s = await get(searchUrl(`k=${encodeURIComponent(q)}`)); if (s.blocked || !s.html) { blocked++; continue; }
    const d = parseSearch(s.html, t); total += d.items.length; noResults = noResults || d.noResults;
    const slug = (h) => decodeURIComponent((h.match(/\/stores\/([^\/?"]+)/) || [])[1] || '').replace(/[-_+]/g, ' ');
    const store = d.stores.find((x) => t(x.text) && (bylineIsBrand(`Visit the ${slug(x.href)} Store`, q, '', r.domain) || bylineIsBrand(`Visit the ${x.text.slice(0, 80)} Store`, q, '', r.domain)));   // "CLEAN SKIN CLUB" tile on a Farmacy search must not count
    if (store && !storeHref) storeHref = (store.href.match(/https:\/\/www\.amazon\.com\/stores\/[^?"]+/) || [store.href.replace(/\?.*$/, '')])[0];
    addItems(d.items.filter((x) => !x.sponsored)); addItems(d.items);
    if (pass === 0) await sleep(jitter(1500, 3000));
  }
  if (blocked === 2) return prior && prior.amazon_status !== 'blocked' ? { ...prior, repassBlockedAt: v.checkedAt } : { ...v, amazon_status: 'blocked' };   // a blocked re-pass keeps the earlier verdict
  Object.assign(v, { resultCount: total, brandMatches: cands.length, storeHref, evidence: cands.slice(0, 5).map((m) => ({ asin: m.asin, text: m.text.slice(0, 90) })) });
  if (storeHref) return finish({ ...v, amazon_status: 'brand_store' }, prior);
  if (!total && !noResults) return prior && prior.amazon_status !== 'blocked' ? { ...prior, repassBlockedAt: v.checkedAt } : { ...v, amazon_status: 'blocked' };
  // B. Amazon's own brand filter (rh=p_89:<Brand>) with EVERY usable name variant as a second candidate source
  const usable = (name) => { const w = name.toLowerCase().split(/\s+/).map(tok).filter(Boolean); return w.length > 1 || (w[0] && w[0].length >= 5 && !GENERIC.has(w[0])); };
  for (const name of [...new Set([q, brand, ...brandVariants(brand)])].filter(usable).slice(0, Number(process.env.BF_VARIANTS || 3))) {
    await sleep(jitter(800, 1800));
    const bf = await get(searchUrl(`k=${encodeURIComponent(name)}&rh=p_89%3A${encodeURIComponent(name)}`));
    if (bf.blocked || !bf.html) continue;
    const bd = parseSearch(bf.html, t); if (bd.noResults) continue;
    v.catalogBrand = v.catalogBrand || name; addItems(bd.items);
  }
  // prior runs' listings come first so a re-run re-reads what it already found
  const priorAsins = (prior?.asinsChecked || []).filter((x) => x.attributed).map((x) => ({ asin: x.asin, text: x.title || '', match: true }));
  const queue = [...priorAsins, ...cands.filter((c) => !priorAsins.some((p) => p.asin === c.asin))];
  if (!queue.length) return finish({ ...v, amazon_status: 'none' }, prior);
  if (!DEEP) return finish({ ...v, amazon_status: 'listings_unverified' }, prior);
  // C. deep-check up to MAX_DP listings; a listing counts as the brand's only when the BYLINE or SELLER carries the brand
  //    (title-only matches: "Universal Standard Staples" sold by Amazon.com, "Fast Growing hybrid poplar cuttings"). ANY official = official.
  const MAX_DP = Number(process.env.MAX_DP || 5); const checked = []; let sawBrandListing = false;
  for (const c of queue.slice(0, MAX_DP)) {
    await sleep(jitter(1000, 2500));
    let p = await get(productUrl(c.asin), true); if (p.blocked || !p.html) continue;
    let pp = parseProduct(p.html);
    if (!pp.byline && !pp.unavailable) { await sleep(jitter(800, 1500)); const p2 = await get(productUrl(c.asin), true); if (p2.html) { const pp2 = parseProduct(p2.html); if (pp2.byline || pp2.seller) pp = pp2; } }   // byline missing = lazy variant, one retry
    const isBrandListing = (pp.byline && bylineIsBrand(pp.byline, q, pp.title, r.domain)) || sellerIsBrand(pp.seller, q);
    const rec = { asin: c.asin, title: pp.title.slice(0, 80), byline: pp.byline.slice(0, 60), seller: pp.seller.slice(0, 40), shipsFrom: pp.shipsFrom.slice(0, 30), unavailable: pp.unavailable, attributed: isBrandListing }; checked.push(rec);
    if (!isBrandListing) continue; sawBrandListing = true;
    if (/^Visit the /i.test(pp.byline) && bylineIsBrand(pp.byline, q, pp.title, r.domain)) return finish({ ...v, asinsChecked: checked, amazon_status: 'brand_store', storeHref: pp.bylineHref ? 'https://www.amazon.com' + pp.bylineHref.replace(/^https?:\/\/www\.amazon\.com/, '').replace(/\?.*$/, '') : `https://www.amazon.com/dp/${c.asin}`, sampleAsin: c.asin, byline: pp.byline, seller: pp.seller }, prior);   // evidence link = the store page, else the listing that carries the byline (never a stale tile from a prior pass)
    if (sellerIsBrand(pp.seller, q) || AMAZON_1P.test(pp.seller.trim())) return finish({ ...v, asinsChecked: checked, amazon_status: 'listings_official', sampleAsin: c.asin, byline: pp.byline, seller: pp.seller }, prior);
  }
  const last = checked.find((x) => x.attributed && x.seller) || checked.find((x) => x.attributed) || checked[0] || {};
  Object.assign(v, { asinsChecked: checked, sampleAsin: last.asin, byline: last.byline, seller: last.seller, productTitle: last.title });
  let st;
  if (!checked.length) st = 'listings_unverified';
  else if (!sawBrandListing) { st = 'none'; v.note = 'search hits did not carry the brand in byline or seller'; }
  else if (last.seller) st = 'listings_3p';
  else if (checked.filter((x) => x.attributed).every((x) => x.unavailable)) st = 'listings_dormant';   // brand-attributed listings exist but every one is "Currently unavailable"
  else st = 'listings_unverified';
  return finish({ ...v, amazon_status: st }, prior);
}
// a re-run NEVER downgrades: keep the most severe verdict seen across passes, and keep every attributed listing ever found
function finish(v, prior) {
  if (!prior || prior.amazon_status === 'blocked') return v;
  const merged = new Map([...(prior.asinsChecked || []), ...(v.asinsChecked || [])].map((x) => [x.asin, x]));
  v.asinsChecked = [...merged.values()];
  if ((SEV[prior.amazon_status] ?? 0) > (SEV[v.amazon_status] ?? 0)) { v.demoted = v.amazon_status; v.amazon_status = prior.amazon_status; v.storeHref = v.storeHref || prior.storeHref; v.sampleAsin = prior.sampleAsin || v.sampleAsin; v.byline = prior.byline || v.byline; v.seller = prior.seller || v.seller; }
  return v;
}
// RESCORE=1: no Amazon fetch. Re-derive every status from the product pages already read (asinsChecked) with the CURRENT matching rules,
// so a matcher fix ("Visit the Vornado Store" for "Vornado Air") upgrades old verdicts without another crawl. Never downgrades.
if (process.env.RESCORE === '1' || process.env.RESCORE === '2') {
  let changed = 0;
  const FULL = process.env.RESCORE === '2';   // 2 = recompute from scratch (a stricter rule may DOWNGRADE); 1 = upgrade only
  for (const r of src) {
    const v = done[r.domain]; if (!v) continue;
    const q = QOVR[r.domain] || v.query || tok(brandOf(r)); if (QOVR[r.domain]) v.query = QOVR[r.domain];   // a corrected term re-judges the stored pages
    if (!v.asinsChecked?.length) {   // verdict came from a search-page store tile: re-test the tile's slug, flag for ONLY= re-check when it fails
      if (FULL && v.amazon_status === 'brand_store' && v.storeHref && !v.via) { const slug = decodeURIComponent((v.storeHref.match(/\/stores\/([^\/?"]+)/) || [])[1] || '').replace(/[-_+]/g, ' '); if (slug && !/^page$/i.test(slug) && !bylineIsBrand(`Visit the ${slug} Store`, q, '', r.domain)) console.error(`  RECHECK ${r.domain}: store tile "${slug}" does not carry the brand (q="${q}") -> add to ONLY=`); }
      continue; }
    let st = FULL ? null : v.amazon_status, sample = null, any = false;
    if (FULL && !v.storeHref && v.storeTileRejected) { v.storeHref = v.storeTileRejected; delete v.storeTileRejected; }
    if (FULL && v.storeHref) { const slug = decodeURIComponent((v.storeHref.match(/\/stores\/([^\/?"]+)/) || [])[1] || '').replace(/[-_+]/g, ' '); const kw = q.toLowerCase().split(/[\s&'’.,+-]+/).map(tok).filter((w) => w.length >= 3 && !GENERIC.has(w));
      const trustText = kw.length >= 2 || (kw.length === 1 && kw[0].length >= 5);   // a slug-less tile was text-matched at crawl time; trust it only for a distinctive term ("first alert", not "drum")
      if (v.via || (/^page$/i.test(slug) && trustText) || (!/^page$/i.test(slug) && bylineIsBrand(`Visit the ${slug} Store`, q, '', r.domain))) st = 'brand_store'; }
    for (const a of v.asinsChecked) {
      a.byline = decode(a.byline || '').replace(/["']\s*\/?>.*$/, '').trim(); a.seller = decode(a.seller || '');
      const attributed = !!((a.byline && bylineIsBrand(a.byline, q, a.title || '', r.domain)) || sellerIsBrand(a.seller || '', q));
      if (!FULL && attributed === !!a.attributed) continue; a.attributed = attributed; if (!attributed) continue; any = true;
      const s2 = /^Visit the /i.test(a.byline) && bylineIsBrand(a.byline, q, a.title || '', r.domain) ? 'brand_store' : (sellerIsBrand(a.seller || '', q) || AMAZON_1P.test((a.seller || '').trim())) ? 'listings_official' : a.seller ? 'listings_3p' : a.unavailable ? 'listings_dormant' : 'listings_unverified';
      if ((SEV[s2] ?? 0) > (SEV[st] ?? -9)) { st = s2; sample = a; }
    }
    if (FULL && !any && st !== 'brand_store') { st = v.amazon_status === 'blocked' ? 'blocked' : 'none'; sample = v.asinsChecked[0]; }   // a trusted store tile stands on its own
    if (st && st !== v.amazon_status) { changed++; console.error(`  rescore ${r.domain}: ${v.amazon_status} -> ${st} (q="${q}" | ${sample?.byline || ''} | ${sample?.seller || ''})`); Object.assign(v, { rescoredFrom: v.amazon_status, amazon_status: st, sampleAsin: sample?.asin, byline: sample?.byline || '', seller: sample?.seller || '', rescoredAt: new Date().toISOString().slice(0, 10) }); if (st === 'brand_store') delete v.note; else v.note = 'search hits did not carry the brand in byline or seller'; if (st !== 'brand_store' && !v.via && v.storeHref) { v.storeTileRejected = v.storeHref; v.storeHref = null; } if (st === 'brand_store' && !v.storeHref && v.storeTileRejected) { v.storeHref = v.storeTileRejected; delete v.storeTileRejected; } }
  }
  writeFileSync(OUT, JSON.stringify(done, null, 1));
  const by = {}; for (const v of Object.values(done)) by[v.amazon_status] = (by[v.amazon_status] || 0) + 1;
  console.error(`===== ${RUN}: RESCORE DONE ===== ${changed} changed`, JSON.stringify(by)); process.exit(0);
}
let i = 0, n = 0;
async function worker() {
  while (i < todo.length) {
    const r = todo[i++]; let v;
    try { v = await verify(r, done[r.domain]); } catch (e) { v = { domain: r.domain, brand: brandOf(r), amazon_status: 'blocked', error: String(e.message).slice(0, 80) }; }
    done[r.domain] = v; n++;
    console.error(`  ${n}/${todo.length} ${r.domain} -> ${v.amazon_status}${v.storeHref ? ' ' + v.storeHref : ''}${v.seller ? ' | sold by ' + v.seller.slice(0, 40) : ''}`);
    if (n % 10 === 0) writeFileSync(OUT, JSON.stringify(done, null, 1));
    await sleep(jitter(1500, 3500));
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
writeFileSync(OUT, JSON.stringify(done, null, 1));
const by = {}; for (const v of Object.values(done)) by[v.amazon_status] = (by[v.amazon_status] || 0) + 1;
console.error(`===== ${RUN}: AMAZON VERIFY DONE =====`, JSON.stringify(by), SPIDER ? `spider cost $${SPIDER_COST.toFixed(2)}` : '');
