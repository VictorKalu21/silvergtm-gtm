---
name: web-scrape-triage
description: >
  Get data out of any website or public dataset using a cheapest-path-first triage ladder — public dataset/registry API → the page's own hidden JSON API → server-rendered HTML → SERP discovery → rendered/anti-bot unlocker — and knowing when a source isn't worth it. Use this WHENEVER the user wants to scrape a site, extract data from a webpage, build a list from a directory/job board/marketplace, pull companies/entities/facilities/filings from a government registry, open-data portal (data.gov/Socrata/CKAN/ArcGIS), SEC EDGAR, or a public dataset, says a site is "blocked" or returns a Cloudflare "Just a moment" / 403 / captcha, asks "how do I get the data from X", wants to find the hidden API a page loads its data from, needs domains/firmographics/leads off the web, or is choosing a scraping tool or method. Reach for this before suggesting a paid scraping tool.
---

# Web Scrape Triage

The goal of every scrape is the same: the data is *always* in the response somewhere — your only job is to grab it at the cheapest rung that works, and to recognize the rare cases where no rung is worth it. Always go top-down; only escalate when the current rung is actually blocked.

## The ladder

### Tier 0 — The underlying data file / API (cheapest, cleanest, do this first)
Most "dynamic" pages load their data from a JSON or CSV endpoint, then render it. Hit that endpoint directly and you skip all the HTML parsing — and you can paginate the raw data.
- **Find it in the page source:** grep the inline JS for `/api/`, `__NEXT_DATA__`, `self.__next_f` (Next.js RSC), a config object (board ids, app keys), Convex (`convex.cloud`), Niceboard, or a static `.json`/`.csv` URL.
- **If it's not in source, capture it with a headless-Chrome netlog** — render the page and read every request it fired:
  `chrome --headless=new --disable-gpu --log-net-log=net.json --dump-dom <url>` then grep `net.json` for the data request. (This is how Clay's `assets.clayrun.dev/jobs.csv` was found — nothing in the HTML, one line in the netlog.)
- Once found, replicate the request (method, params, headers) and paginate. Fastest and most complete path that exists.
- **Next.js sites:** `__NEXT_DATA__` script = Pages Router; `self.__next_f.push(...)` = App Router RSC flight data — both carry structured JSON inline (parse with njsparser or regex). **Common Crawl** (CDX index / cdx_toolkit, wildcard `*.domain.com`) enumerates a site's URLs/subdomains free without hitting it. See `references/methods.md`.
- **The key/token is usually in the page.** Many "locked" APIs just need a value the client already holds: **Algolia/Typesense/Meilisearch** ship a public search key + app-id → `/1/indexes/*/queries`, whole index + facets. **Headless CMS** (Sanity `{projectId}.api.sanity.io/…/data/query` GROQ; Contentful/Prismic/Storyblok) ship a public read token → the whole content tree. **Sourcemaps:** exposed `.map` files → `unwebpack-sourcemap` de-minifies the bundle to recover keys + signing logic. **GraphQL:** introspection; if off, replay the page's persisted-query (APQ) hashes + vary variables. See `references/methods.md`.
- **Known-open platform endpoints** (no discovery needed): Shopify `/products.json` · WooCommerce `/wp-json/wc/store/v1/products` · WordPress `/wp-json/wp/v2/` · Discourse `<url>.json` · app stores: iTunes `itunes.apple.com/lookup?id=` + reviews RSS, Google Play via `google-play-scraper`. Full catalog → `references/methods.md`.

### Tier 0.5 — Public dataset / open-data / registry (before you scrape a page, check if the data is already a dataset)
Governments, regulators, and standards bodies publish entity/company/facility/filing data as **documented APIs + bulk files** — clean, structured, no rendering, no anti-bot. For regulated / critical-infra / funded / facility / public-company ICPs this is the cheapest rung that exists, and it surfaces hard-to-list buyers by *operational reality* (the moat move).
- **Discover the backend:** check `https://<agency>.gov/data.json` (DCAT catalog; `distribution[]` has direct download/access URLs) + **catalog.data.gov**; or recognize the platform from URL tells — `/resource/{4x4}.json`→Socrata, `/api/3/action/`→CKAN, `/FeatureServer`→ArcGIS, `/efservice/`→EPA, `data.sec.gov`→SEC EDGAR.
- **The universe pulls:** SEC EDGAR `data.sec.gov/api/xbrl/frames/...` (one row per public company) · NERC/EPA registries · UK Companies House (free REST + bulk CSV) · GLEIF LEI (free bulk + who-owns-whom parentage to resolve SPV→parent).
- **Gotchas:** query-ID→download two-step (EPA ECHO); unsorted tables → over-pull + client-sort; `$limit`/`maxRecordCount` pagination caps; SEC needs a `User-Agent`. **Not free-first:** OpenCorporates (gated), OpenSanctions (non-commercial only), Census (aggregates only, never lead rows).
- **Full grammars + registry inventory:** `references/open-data-registries.md`.

### Tier 0.7 — Web mirror / corpus (has someone already crawled this for you?)
The web is already mirrored in a few free corpora — for bulk work, or a page that's dead/walled/anti-bot, you may never touch the origin.
- **Common Crawl as a query engine** — the columnar **Parquet** index (fields `url_host_registered_domain`, `content_mime_type`, `fetch_status`, `warc_filename/offset/length`) is SQL-queryable with **DuckDB (free, local)** or **Athena (~$5/TiB → ~$1.50 full scan, <$0.01 filtered)**; then byte-range-fetch one WARC record from `data.commoncrawl.org` — you read from Amazon's mirror, no origin hit, no rate limit, no anti-bot. Reverse-technographic + domain-enum. Tool: `ccrawl-cli`.
- **HTTP Archive on BigQuery = free technographics** — `UNNEST(technologies)` from `httparchive.crawl.pages` (⚠️ old `technologies` table removed Apr-2025); 1TB/mo free. Precomputed Wappalyzer over millions of sites = free BuiltWith for "who uses X."
- **Wayback as a proxy** — CDX API (`web.archive.org/cdx/search/cdx?url=&output=json`) enumerates a domain; `/web/{ts}/{url}` pulls snapshots of dead/soft-metered/walled pages (not hard paywalls).
- Full recipes → `references/methods.md`.

### Tier 1 — Plain fetch the HTML (free)
If the data is server-rendered into the document, a plain `curl -A "<real browser UA>"` gets it — no browser, no cost.
- Confirm: fetch once, grep for the data (a known value, a `data-*` attribute, an `application/ld+json` block).
- Parse with regex or by splitting on a per-record marker. Structured data often hides in a single `<script type="application/ld+json">` ItemList at the page bottom — parse that and match records to cards by id/slug.
- For body text (company sites, etc.): fetch homepage + a few second-level pages, strip `<script>/<style>`, collapse whitespace, char-cap, write incrementally. **Prune to the real content before you char-cap or feed an LLM** — score each block on *text-density + link-density + nav/footer pattern-match* and drop blocks below ~0.5 or under ~50 words (crawl4ai's `PruningContentFilter` / `fit_markdown`; replicable with a plain density heuristic). Feeding pruned body instead of raw-stripped HTML cuts tokens and noise on every qualify step.
- **Structured data is often already in the page** — parse JSON-LD / microdata / RDFa / OpenGraph with **`extruct`** (one call, all four) before writing bespoke selectors. The universal free structured layer.

### Tier 2 — Free-first search-driven discovery (cheap → $0)
When you don't have one site to hit but need to *find* pages (companies hiring with tool X, an entity's real domain, profile pages). **Never pay a SERP key (serper / scraper.tech) for this — the free rungs cover it:**
- **Built-in WebSearch tool** — title/description/url results, no API key. First choice, interactive.
- **Jina search `https://s.jina.ai/?q=<query>`** — free, keyless (~20 RPM; free key → 500 RPM), LLM-ready results. The scriptable free SERP for *pipelines* (when you need it in code, not just interactively).
- **Brave Search API** — free tier (~2k queries/mo), a real structured REST endpoint when you need higher-volume SERP without a paid scraper.
- Reach for a paid SERP (serper/scraper.tech) ONLY after blowing past those free tiers at real volume — most jobs never do.
- Patterns: `<tool> "<role>" site:jobs.lever.co`; resolve a domain via `<name> <city>` → take the company's own site, not an aggregator (linkedin/crunchbase/etc.). **Never domain-guess** — guessing fabricates confident-but-wrong domains; search ranks the real entity.
- **Footprint expansion** (one seed → an org's whole surface): `crt.sh?q=%25.domain&output=json` (subdomains via CT logs) · MX/SPF/DKIM via `dns.google/resolve` (email + marketing stack) · ASN enum (`bgp.he.net`) · **Shodan favicon hash** (`http.favicon.hash`) to cluster same-org sites · Censys/Shodan free tiers.

### Tier 3 — Rendered fetch / anti-bot unlocker (paid, last resort)
Only when the site returns an anti-bot challenge (Cloudflare "Just a moment", "Enable JavaScript", 403, captcha) that Tiers 0–1 can't get past. **Match the tool to the vendor (2026):**
- **Firecrawl** — `POST api.firecrawl.dev/v1/scrape {url, formats:["markdown"]}`, `Authorization: Bearer fc-...`. Renders JS + clears Cloudflare; clean markdown. (Proven against Clutch.) The managed default. ~$0.60-0.83/1k pages; `/extract` (LLM) adds ~4×.
- **Cloudflare** specifically: the decisive check is *automation-protocol* fingerprinting (CDP `Runtime.enable` leak), so a **control-plane-clean driver (nodriver, direct CDP)** beats fingerprint-spoofers (Camoufox/patched Chromium). **DataDome/Akamai/Kasada** need behavioral realism instead — different tool.
- **curl_cffi** — cheap pre-render rung: impersonates a real TLS/JA3 fingerprint from plain Python; clears TLS-fingerprint blocks with no browser. Try before paying.
- **crawl4ai (self-hosted, free)** — Playwright renderer with clean markdown + built-in CSS/LLM extraction; a solid free rung for **JS/SPA shells** (proper `networkidle` wait — strictly better than raw `chrome --dump-dom`). Its `undetected` mode (playwright-stealth + CDP patches) is worth one free attempt before Firecrawl, **but it's fingerprint-spoofer tier** (patched Chromium leaks CDP `Runtime.enable`, and ships no residential proxies) — it does *not* reliably beat Cloudflare Turnstile, so keep Firecrawl for the confirmed 403 subset.
- Alternatives: ZenRows, ScraperAPI, ScrapingBee, Bright Data Web Unlocker (residential proxies beat datacenter). Per-page cost — reserve for pages that need it.
- **Instant Data Scraper** (Chrome extension) uses the user's own logged-in browser, clears anti-bot free — manual, one-off only.
- **LLM-extraction modifier:** for heterogeneous/schema-varying pages, an LLM-extract step (Jina Reader `r.jina.ai` free/cheap; Firecrawl `/extract`; ScrapeGraphAI) beats bespoke per-page selectors. **Never LLM-extract uniform lists or when Tier-0 data exists** (~4-5× cost).
  - **For a large batch of same-template pages, don't per-page-LLM *or* hand-write selectors — LLM-author the selectors *once*, then extract free forever:** feed the LLM one sample page → it returns a CSS/XPath schema → run pure-DOM extraction on the rest at $0, deterministic (crawl4ai `JsonCssExtractionStrategy.generate_schema()`, or replicate with any LLM + parser). Two robustness moves: (a) re-run the generated selectors on the sample and reject a schema that extracts nothing (`validate=True`); (b) generate from **2–3 sample pages** so it emits *stable* selectors (`a[href*='/m/']`) not position-fragile ones (`tr:nth-child(6)`) — the fix for "selectors broke on page 40." See `references/methods.md`.

### STOP — when no rung is worth it
- **The STOP line is access-control, not difficulty.** *Obfuscation ≠ authorization.* A public-by-design search key, a headless-CMS read token, an exposed sourcemap, or a page sitting in a public mirror are all fair game even when they *look* locked. But a key that unlocks **non-public** data (a leaked *admin* key, a Firebase instance with private records, anything behind a real login) = **STOP**. If reaching the data means defeating a control the owner built for *you*, stop.
- **Auth-walled data** (LinkedIn posts/engagers/Sales-Nav via the Voyager API, private dashboards) needs the user's own session via a cookie tool (PhantomBuster/TexAu) or manual export — say so plainly instead of burning effort. (LinkedIn's *public* surfaces — Ad Library, `/jobs/view/{id}` — are scrapeable; only the authenticated Voyager surfaces are STOP.)
- If a page keeps challenging after Tier 3, or the data is low-value, switch to an easier source that has the same data. Cheapness of an alternate source beats heroics on a hard one.

## Recon checklist (how to pick the rung fast)
0. Is the data a **public dataset / registry** (gov, regulator, filings, facilities, company universe)? Check `data.json`/catalog.data.gov + platform tells → **Tier 0.5** (skip page-scraping entirely).
0b. Bulk job, or the page is dead / walled / anti-bot? Check a **web mirror** (Common Crawl index, Wayback) → **Tier 0.7** (read from the mirror, skip the origin).
1. `curl` the page → is the target value already in the HTML? → **Tier 1**.
2. Not in HTML? Grep source for an API/`__NEXT_DATA__`/`__next_f`/static file; if hidden, netlog-capture it → **Tier 0**.
3. No single site, need discovery? → **Tier 2 (SERP)** — or Common Crawl for bulk URL/subdomain enumeration.
4. Anti-bot 403/challenge? → **Tier 3** (Firecrawl / vendor-matched unlocker; curl_cffi for TLS blocks).
5. Login wall? → **STOP**, use a session tool or different source.

## When Tier 1 *fails* — read the error, then pick the rung
The recon checklist picks a rung up front; this is for when you already fetched and it failed. **Branch on the failure signal — don't blindly escalate everything to a paid unlocker** (most of a bulk run's failures are dead sites or slow sites, not anti-bot):

| Failure signal | What it means | Do |
|---|---|---|
| `AbortError` / timeout | slow-but-alive | **retry with a longer timeout** (e.g. 20s vs 8s) — cheapest recovery, no new tool |
| connection reset / `ENOTFOUND` / DNS fail | site is dead/parked | **STOP** — no rung recovers it |
| `403` / "Just a moment…" / "Enable JavaScript" / captcha | Cloudflare / WAF | **Tier 3 Firecrawl** — headless Chrome will NOT pass this |
| `404` | page is gone | **STOP** (or find the right URL via Tier 2) |
| `200` but empty / thin body | JS-only shell (SPA) | **Tier 0** inline `__NEXT_DATA__`/JSON first; else render (Puppeteer w/ network-idle, or Firecrawl) |

Proven on a 3,529-site bulk fetch: ~14% failed → 202 timeouts (many dead), 157× 403 (mostly Cloudflare → only Firecrawl got through), 30× 404 (dead). Raw `chrome --headless --dump-dom` recovered **0 of 3** representative failures (dead-site error, Cloudflare challenge, and a 44-char SPA shell). The cheap win is the longer-timeout retry; reserve Firecrawl for the confirmed anti-bot subset.

## Tools / keys commonly available on this machine
- **WebSearch** (built-in tool) — SERP discovery + domain resolution, no key. The Tier-2 workhorse. Free scriptable SERP for pipelines (no serper/scraper.tech key): **Jina `s.jina.ai`** (keyless) + **Brave Search API** (free tier).
- **Cheap grounded models** (name→domain last-mile + page extraction, off Claude session): **Gemini 3.x Flash** (native Google Search grounding, 5k free grounded/mo), **DeepSeek V4** (~$0.14/M, native web search), **Kimi K2** (`$web_search` builtin). Use these instead of Claude subagents for name→domain.
- **Firecrawl** — anti-bot rendered scrape (Cloudflare) + JS render. `POST api.firecrawl.dev/v1/scrape`, `Authorization: Bearer fc-...`. Key is provided per-session (not stored on disk); roll it after use. NOTE: live network calls must run via PowerShell — the Bash sandbox has no network (DNS fails).
- **Headless Chrome** — `C:\Program Files\Google\Chrome\Application\chrome.exe`. Best use is **netlog capture (Tier 0)**. As a *content* renderer it's weaker than it looks: raw `--headless --dump-dom --virtual-time-budget` fires at load and often returns an empty SPA shell (tested: 44 chars on a real JS site), and it will NOT beat Cloudflare. For JS content you actually need **Puppeteer with `waitUntil: 'networkidle0'`** (+ scroll for lazy-loaded content); for anything anti-bot, skip Chrome and go straight to Firecrawl.
- **Apollo** — firmographics + contacts by domain (the people-layer after a scrape).

## Guardrails
- Real `User-Agent`; polite delay; small concurrency. Follow 3xx redirects.
- **Resume-safe incremental writes** — never lose a long run to a timeout/kill. (Known trap: on a size-cap `req.destroy()`, you MUST resolve the promise or node hangs and exits 0 silently.)
- **Dedup by domain**, not name.
- **Filter cheap, enrich/LLM expensive** — only run the costly qualification step on rows that pass a cheap pre-filter.
- LLM qualification: cheap model bulk + flag low-confidence → strong model adjudicates; validate against a gold set. **Pre-prune before the model** when the question is "does this page do X" — BM25-rank the page's blocks against the query and keep only the top-scoring ones (no LLM), then adjudicate the survivors; cheaper than sending the whole page.
- **Name→domain enrichment** (the last mile — registries/Maps/directories give a name, Apollo needs a domain). **Default to a cheap grounded model, NOT Claude subagents:** one grounded call per company resolves name→domain with no SERP key and no Claude-session cost — **Gemini 3.x Flash** (5,000 free grounded queries/mo, then ~$14/1k) is the default; **DeepSeek V4** (~$0.14/M tokens, native web search) or **Kimi K2 `$web_search`** are the volume-cheap alternatives (all three now search natively). Order: **Clearbit Autocomplete free for obvious brand names → cheap grounded model on the hard residual (obscure / SPV / registry legal names, where Clearbit silently returns the wrong company) → paid waterfall only above a few thousand.** Reserve Claude LLM-subagent fan-out (~4,450 tokens/co) for tiny high-stakes batches ONLY — it's the most expensive rung, not the default. Never domain-guess. See `references/methods.md`.
- ToS/legal: **public data scraped logged-OUT is defensible** (hiQ, Meta v Bright Data); the moment you cross a login/auth wall, contract terms bind → that's the STOP line. Directory/LinkedIn scraping violates ToS — proceed knowingly.

See `references/open-data-registries.md` for the Tier-0.5 gov/open-data/registry grammars + inventory, and `references/methods.md` for the full ladder inventory + worked examples (Niceboard/Convex/Clay APIs, DesignRush HTML, SERP job-finding, Clutch via Firecrawl, Tier-0 upgrades, LLM-extraction pricing, name→domain costs, anti-bot 2026, LinkedIn = stop).
