# How We Scrape Pages — consolidated methodology (input for the future `web-scrape-triage` skill)

Pulled from: google-maps-scrape skill, the Form D / portfolio / AI-Reserve pipelines, and this session (gtmecareers, gtme.jobs, Clay, Clutch, DesignRush). Core principle: **try the cheapest path first, escalate only when blocked, and know when to stop.**

## The escalation ladder (always go top-down)
**Tier 0 — Underlying data file / API (cheapest, best).** Does the page load its data from a JSON/CSV endpoint? Hit that directly.
- Find it: read the page's inline JS for `/api/...`, `__NEXT_DATA__`, a config object (board_id, app keys), or a static file.
- If not visible in source, **capture it with a headless-Chrome netlog**: `chrome --headless=new --log-net-log=net.json --dump-dom <url>`, then grep the netlog for the data request (this is how we found Clay's `assets.clayrun.dev/jobs.csv`).
- Wins so far: gtmecareers = Niceboard `/api/jobs?...`; gtme.jobs = Convex `POST /api/query {path:"jobs:list"}`; Clay = static `jobs.csv`. Once found, paginate the API — fastest, cleanest, complete.

**Tier 1 — Plain fetch the HTML (free).** Is the data server-rendered into the document? `curl -A "<real UA>"` then grep for the data.
- If yes, parse it (regex/DOM) — no browser, no cost. Wins: DesignRush (cards in HTML), Form D bulk datasets, company sites.
- Technique (`fetch-sites.js` pattern): plain Node fetch of homepage + a few L2 pages (about/team/careers) → strip to clean text (drop script/style, collapse ws) → char-cap → write incrementally (resume-safe). No browser.

**Tier 2 — Free-first search-driven discovery (cheap → $0).** Don't need a specific site — need to FIND pages? **Don't pay a SERP key (serper/scraper.tech) for this — free rungs cover it:** built-in **WebSearch** tool (no key, interactive) → **Jina search `https://s.jina.ai/?q=`** (free, keyless ~20 RPM; free key → 500 RPM — the scriptable free SERP for pipelines) → **Brave Search API** (free tier ~2k/mo, structured REST). Paid SERP only past those limits.
- Uses: find job posts mentioning a tool (`Clay "GTM Engineer" site:jobs.lever.co`), resolve a company's domain (`<name> <city>` → take the company's own site, not an aggregator), surface profile pages.

**Tier 3 — Rendered fetch / anti-bot unlocker (paid, last resort).** Site returns a Cloudflare/anti-bot challenge (403 "Just a moment", "Enable JavaScript")?
- **Firecrawl** (`POST api.firecrawl.dev/v1/scrape {url, formats:["markdown"]}`, `Authorization: Bearer fc-...`) — PROVEN to beat Clutch's Cloudflare. Returns clean markdown/html.
- Alternatives: ZenRows, ScraperAPI, ScrapingBee (residential proxies + JS render). Per-page cost.
- **Instant Data Scraper** (Chrome extension) — uses YOUR logged-in browser, so it sidesteps anti-bot for free, but it's manual (good for one-off pulls, not automation).
- Playwright/headless Chrome render — free but won't reliably beat Cloudflare at volume.

**STOP — when to quit.** Auth-gated behind a login (LinkedIn posts/engagers, Sales Nav) → NOT scrapeable by these tools; needs a cookie-session tool (PhantomBuster/TexAu) or manual. If a page keeps returning a challenge after Tier 3, or the data's low-value, switch sources. Don't burn hours/quota on a hard site when an easier source has the same data. (Form D lesson: domain-GUESSING fabricates wrong domains — always resolve via Google search, never guess.)

## Tool / key inventory (on this machine)
- **WebSearch** (built-in tool): SERP discovery + domain resolution, no key. The Tier-2 workhorse.
- **Free scriptable SERP** (no serper/scraper.tech key): **Jina `s.jina.ai`** (keyless ~20 RPM) + **Brave Search API** (free tier ~2k/mo). Use these for pipeline SERP before ever paying.
- **Cheap grounded models** (name→domain last-mile + page extraction, off Claude session): **Gemini 3.x Flash** (native Google Search grounding, 5k free grounded/mo), **DeepSeek V4** (~$0.14/M, native web search), **Kimi K2** (`$web_search` builtin).
- **Firecrawl**: key `fc-...` (provided per-session, not stored on disk) — rendered scrape + Cloudflare bypass. Roll after use. Live calls must run via **PowerShell** — the Bash sandbox has no network (DNS fails).
- **Companies House** (`COMPANIES_HOUSE_KEY`): UK company data.
- **Apollo** (Victor's login/API): firmographics + decision-maker contacts by domain — the contact layer after any directory scrape.
- **Headless Chrome**: installed at `C:\Program Files\Google\Chrome\Application\chrome.exe` — for netlog capture + rendering.

## Guardrails (every scrape)
- Real `User-Agent`; polite delay between requests; concurrency cap.
- **Resume-safe** incremental writes (never lose a long run to a timeout/kill — bug we hit: must resolve/destroy on size-cap or node hangs).
- **Dedup by domain** (not name); normalize.
- Char-cap page text before LLM steps; **filter cheap, enrich/LLM expensive** (only qualify rows that pass a cheap pre-filter — cost discipline).
- **Bulk fetch: triage the failures, don't blanket-render.** At scale ~10–15% of brochure sites fail Tier 1. Recover cheapest-first — a **longer-timeout retry pass** catches the slow-but-alive — then escalate ONLY the confirmed anti-bot (Cloudflare/403) subset to Firecrawl. Rendering every failure burns quota on dead/404 sites that no rung recovers. (Real breakdown on a 3,529-site run: ~14% failed = mostly timeouts/dead + 157 Cloudflare 403s + 30 404s; raw headless-Chrome recovered 0/3. See the failure→rung table in `SKILL.md`.)
- Two-tier LLM qualify: cheap model (Haiku) bulk + flag low-confidence → Sonnet adjudicates; validate against a gold set.
- ToS/legal: directory + LinkedIn scraping violate ToS — proceed knowingly.

## Worked examples
- **API/Tier-0:** gtmecareers (Niceboard), gtme.jobs (Convex), Clay (`jobs.csv` via netlog).
- **HTML/Tier-1:** DesignRush, Form D bulk, company-site text (`fetch-sites.js`).
- **SERP/Tier-2:** Clay-user job posts on ATS boards; Form D domain resolution.
- **Unlocker/Tier-3:** Clutch via Firecrawl.
- **Stop:** LinkedIn pain-posters/engagers (auth-gated → needs PhantomBuster, not these tools).

## Tier 0.5 — Public dataset / open-data / registry
A whole source class that sits ABOVE HTML scraping: gov/regulator/registry data published as documented APIs +
bulk files. Before scraping a page, ask "is this already a dataset?" Full grammars, discovery tells (data.json,
platform URL tells), the 4 platform backends (Socrata/CKAN/ArcGIS/Envirofacts), the registry inventory (SEC EDGAR
xbrl/frames, NERC, EPA, UK Companies House, GLEIF, OpenCorporates, OpenSanctions, Census=aggregates-only), and
registry gotchas (query-id→download, unsorted-over-pull, holding-co collapse) live in
`references/open-data-registries.md`. Validated firsthand on the Industrial Defender OT run (NERC+SDWIS+TRI → 34 ops).

## Tier-0 discovery upgrades (2025-2026)
- **Next.js embedded JSON**: `__NEXT_DATA__` script = Pages Router; `self.__next_f.push(...)` = App Router RSC "flight"
  data. Parse both with **njsparser** (PyPI, `get_next_data()`), or regex the flight chunks — beats HTML parsing when a
  Next.js site ships structured JSON inline.
- **GraphQL**: look for a `/graphql` endpoint; try an introspection query to dump the schema. If introspection is
  disabled, replay the queries the page fires (capture via netlog/devtools) and vary the variables to paginate.
- **Mobile-app APIs**: a site's mobile app often calls a cleaner, less-protected JSON API than the web — capture with
  mitmproxy/Proxyman. Worth it when the web API is anti-bot-guarded.
- **Free structured-discovery sources**: `sitemap.xml`/sitemap-index (every URL, often typed), `robots.txt` (points to
  sitemaps), RSS/Atom + `.json` feeds, and **Common Crawl** — free bulk page/domain index via the CDX server
  (`index.commoncrawl.org`, per-crawl `CC-MAIN-YYYY-WW-index`) or **cdx_toolkit** (PyPI; wildcard `*.domain.com`
  matchType=domain). Use Common Crawl to enumerate a site's URLs / find all subdomains without hitting the site.

## LLM / AI-extraction rung (a modifier on Tier 1/3, not a new tier)
When a page is heterogeneous / schema-varying (messy directories, one-off layouts) so deterministic selectors would be
bespoke per page, an LLM-extraction step earns its cost. **Decision rule: LLM-extract ONLY for irregular pages; NEVER
for uniform lists or when a hidden JSON API / Tier-0 embedded data exists** (Extract costs ~4-5× a plain scrape).
- **Jina Reader** — prepend `https://r.jina.ai/<url>` (search: `https://s.jina.ai/?q=`) → LLM-ready markdown. Free
  keyless at 20 RPM; free key → 500 RPM + 10M tokens. Cheapest "clean this page for me" rung.
- **Firecrawl** — `/scrape` (deterministic) ~1 credit/page ≈ **$0.60-0.83/1k**; `/extract` (LLM, schema'd) adds ~4
  credits/page. Also beats Cloudflare (managed unlocker). Tiers: Free 1k credits → Standard $83/100k → Scale $599/1M.
- **ScrapeGraphAI** — SmartScraper API: Scrape=1 credit, **Extract(LLM)=5 credits/call**; free 500 credits; open-source
  self-host option (own LLM key = only token cost).
- Cost ladder: Tier-0 (~$0) → Jina (free/cheap) → Firecrawl deterministic (~$0.60-0.83/1k) → LLM-extract (4-5× on top).

## Name→domain enrichment (a first-class last-mile step — recurs in EVERY run)
Registries/Maps/directories give a NAME; Apollo needs a DOMAIN. **The task is easy reasoning + one web lookup — do NOT default to Claude subagents (the most expensive rung). Default to a cheap grounded model.**
- **🆓 Clearbit Autocomplete (still free + keyless, 2026)**: `GET https://autocomplete.clearbit.com/v1/companies/suggest?query=<name>`
  → name + primary domain + logo. ~300ms delay. **Use ONLY for obvious brand names** — it's a fuzzy prefix/brand matcher, so it *silently returns the wrong popular company* for obscure/SPV/registry legal names (exactly why it missed on the Industrial Defender operators). Great for the easy ~50-60%; do not run it on the gnarly residual. (Full Clearbit name→domain API sunset Apr-2025 post-HubSpot; autocomplete survived.)
- **⭐ Cheap grounded model (the workhorse for the hard residual)**: one grounded call per company — *"Company '{legal name}' in {city, state} — return its official website domain, or blank if unsure"* — does the search AND the name→domain resolution in a single cheap call, **no SERP key, off Claude session.** All three now search natively:
  - **Gemini 3.x Flash** — native Google Search grounding, **5,000 free grounded queries/month** then ~$14/1k (Gemini 2.5 grounding was $35/1k w/ 1,500 RPD free). *Default* — registry-scale runs (dozens–hundreds) are effectively $0.
  - **DeepSeek V4** — ~$0.14/M input tokens, native web search (`web_search` server tool via the Anthropic-compatible endpoint). *Cheapest at volume.*
  - **Kimi K2 / K2.5** — built-in `$web_search` function (Moonshot API). Also viable.
  - Resolves the SPV/abbrev/holding-co name mismatch and **returns blank not a guess** — same quality as the Claude-subagent method at a fraction of the cost. **Feed the registry's city/state as a disambiguation hint** (biggest accuracy lever). Batch the pure-reasoning cases with structured output.
- **💲 Paid APIs** (per lookup): EnrichmentAPI ~$0.002-0.004 · Apify ~$0.019 · BuiltWith ~$0.05. Single-vendor hit 40-70%;
  **waterfall cascade ~90%+ at ~$0.36 blended/match** (10k-row example). Accuracy across providers benchmarks 68-96%. For very large runs beyond the grounded-model comfort zone.
- **🤖 Claude LLM-subagent fan-out** (parallel web-verify agents): ~**4,450 tokens/company** (firsthand, 97% fill on 34 rows — the Industrial Defender run — correctly resolves SPV/abbrev names). **Highest accuracy but the MOST EXPENSIVE rung — reserve for tiny, high-stakes batches ONLY. Do NOT fan out for thousands (tanks a Max/metered plan), and don't use it as the default now that cheap grounded models match it.**
- **Rule**: Clearbit-autocomplete free for obvious brands → **cheap grounded model (Gemini 3.x Flash default) on the hard residual** → paid waterfall above a few thousand → Claude subagents only for tiny high-stakes batches. Never domain-guess.

## Tier-3 anti-bot — 2026 reality (vendor-specific now)
Anti-bot is NOT one wall — match the tool to the vendor:
- **Cloudflare**: the decisive check is **automation-protocol fingerprinting** (HOW the browser is driven — the CDP
  `Runtime.enable` leak), not UA/fingerprint. So fingerprint-spoofers (Camoufox, patched Chromium) fail where a
  **control-plane-clean driver (nodriver, direct CDP, no Playwright)** passes. Or just use a managed unlocker (Firecrawl).
- **DataDome / Akamai / Kasada**: behavioral realism matters (mouse/scroll/timing) — nodriver alone gets blocked; here a
  stealth/behavioral tool or residential-proxy unlocker wins. (Cite the DIRECTION, not vendor success-rate numbers — those benchmarks are unstable.)
- **curl_cffi** — a cheap pre-render rung: impersonates a real browser's TLS/JA3 fingerprint from plain Python; clears
  TLS-fingerprint blocks without a browser. Try before paying for a rendered unlocker.
- Residential proxies beat datacenter on all of the above; a single-IP benchmark doesn't generalize.

## Legal posture (public vs auth-walled)
- **hiQ v LinkedIn**: scraping PUBLIC data isn't a CFAA "unauthorized access" violation — but hiQ ultimately LOST on
  breach-of-contract (violating ToS after being on notice). **Meta v Bright Data (2024)**: scraping public data while
  **logged OUT** didn't breach Meta's ToS (the ToS binds logged-in users). **Takeaway that gates the ladder**: public
  data, no login = defensible; the moment you log in / cross an auth wall, contract terms bind you → that's the STOP line.
  Registry/gov/open-data (this rung) is the safest ground. Not legal advice.

## Tier 0.7 — Web mirror / corpus (query the web at rest)
**Common Crawl as a query engine.** Columnar URL index = Apache Parquet, partitioned by crawl (`CC-MAIN-YYYY-WW`); fields incl. `url`, `url_host_registered_domain`, `url_host_tld`, `content_mime_type`, `fetch_status`, `warc_filename`, `warc_record_offset`, `warc_record_length`.
- DuckDB (free, local): `SELECT url, warc_filename, warc_record_offset o, warc_record_length l FROM read_parquet('s3://commoncrawl/cc-index/table/cc-main/warc/crawl=CC-MAIN-2026-.../subset=warc/*.parquet') WHERE url_host_registered_domain='example.com';`
- Athena: same SQL, **$5/TiB scanned** (~$1.50 a full-crawl scan; **<$0.01** filtered by partition/host).
- **Range-fetch one record** (no origin hit): `curl -r {o}-{o+l-1} https://data.commoncrawl.org/{warc_filename}` → gunzip → raw WARC record. Tool: `ccrawl-cli` (`columnar` subcommand).
- Reverse-technographic = filter index/WARC for a fingerprint; domain-enum = `SELECT DISTINCT url_host_registered_domain WHERE url_host_tld='de'`.
- Files: **WARC** (raw HTML) · **WET** (plaintext) · **WAT** (metadata+links). Corpus = a SAMPLE (popular/linked pages), monthly-ish → a seed engine; verify live after.

**HTTP Archive on BigQuery = free technographics.** The `httparchive.technologies` table was REMOVED Apr-2025 → use `crawl.pages` + UNNEST:
`SELECT page FROM httparchive.crawl.pages, UNNEST(technologies) t WHERE date='2026-06-01' AND client='mobile' AND t.technology='Shopify'` → every site running X. BigQuery **1TB/mo free**. Runs the HTTPArchive Wappalyzer fork (GPL-3.0). Free "who-uses-X"; lags BuiltWith slightly on freshness.

**Wayback Machine as a proxy.** Enumerate: `web.archive.org/cdx/search/cdx?url=example.com*&output=json&fl=original,timestamp,statuscode`. Availability: `archive.org/wayback/available?url=&timestamp=YYYYMMDD`. Fetch a snapshot: `web.archive.org/web/{timestamp}/{url}` (add `id_` after the timestamp for the raw, un-rewritten capture). Retrieves dead / soft-metered / walled pages — NOT hard paywalls.

## Client-side keys & headless CMS (Tier 0, public-by-design)
- **Algolia:** grep the bundle for `X-Algolia-Application-Id` + `X-Algolia-API-Key` (a **search-only** key = public by design). `POST https://{appId}-dsn.algolia.net/1/indexes/{index}/query` (headers `x-algolia-api-key`/`x-algolia-application-id`), body `{"params":"query=&hitsPerPage=1000&page=N"}` → whole index + facets. **STOP:** a leaked **admin** key (write/ACL) is NOT public-by-design — don't use it.
- **Typesense / Meilisearch / Elastic App Search:** same "search key in the page" pattern.
- **Headless CMS:** Sanity `GET https://{projectId}.apicdn.sanity.io/v{YYYY-MM-DD}/data/query/{dataset}?query={GROQ}` (public dataset = unauthenticated) → whole content tree in one GROQ query. Contentful (CDA + public delivery token), Prismic, Storyblok, Ghost Content API — same public-read-token shape.
- **Sourcemaps:** if `.map` ships (`//# sourceMappingURL=`, or try `{bundle}.js.map`), `unwebpack-sourcemap <url> -o out/` de-minifies the whole SPA → embedded keys + request-signing logic. **STOP:** a recovered key that unlocks non-public data = stop.
- **GraphQL:** POST introspection (`{__schema{types{name}}}`); if disabled, replay the page's own ops (APQ = send the `sha256Hash`), vary `variables` to paginate.
- **Non-REST channels:** some apps push data over WebSocket / gRPC-web / SSE, not REST — capture in devtools and replay.

## Platform open-endpoint catalog (Tier 0 by convention)
| Platform | Endpoint | Notes |
|---|---|---|
| Shopify | `/products.json?limit=250&page=N`, `/collections.json`, `/sitemap_products_1.xml` | public unless disabled; full catalog + variants + prices |
| WooCommerce | `/wp-json/wc/store/v1/products?per_page=100&page=N` (Store API) | **no auth**, read-only public |
| WordPress | `/wp-json/wp/v2/posts` `/users` `/media` `/pages` | open by default; `users` often lists authors |
| Discourse | append `.json` (`/latest.json`, `/c/{cat}.json`, `/t/{id}.json`) | whole forum as JSON |
| Ghost | Content API (public key in page) | posts/tags/authors |
| iOS App Store | `itunes.apple.com/lookup?id=` / `search?term=&entity=software`; reviews RSS `itunes.apple.com/{cc}/rss/customerreviews/id={id}/json` | free, no key; ratings, version, review text |
| Google Play | `google-play-scraper` (Node/Python) | ratings, reviews, **permissions**, update dates |
Detect the platform first (headers, `/wp-json`, `cdn.shopify.com`, generator meta) → then hit the endpoint.

## Footprint discovery (expand a seed → the org's surface)
- **Subdomains (CT logs):** `https://crt.sh/?q=%25.{domain}&output=json` → dedupe `name_value`. Free.
- **Email/marketing stack (DNS):** `https://dns.google/resolve?name={domain}&type=MX` → `google.com`=Workspace, `*.protection.outlook.com`=M365; `type=TXT` SPF/DKIM → ESP/marketing tools.
- **ASN → all IPs/domains:** `bgp.he.net/AS{n}`, Team Cymru whois.
- **Favicon clustering:** Shodan `http.favicon.hash:{mmh3}` finds every host sharing a favicon (same org/tech). Censys/Shodan free tiers for host/cert/service data.
- **STOP:** reading public certs/DNS/favicons = fine; probing private services = stop.

## Hard-format extraction
- **In-page structured data:** `extruct` (Python) parses JSON-LD + microdata + RDFa + OpenGraph in one call → the universal free structured layer. Try before bespoke selectors.
- **PDF tables:** `camelot` (lattice = ruled/bordered tables, stream = whitespace-aligned), `pdfplumber` (fine-grained), `tabula-py`. LLM-vision only for scanned/image PDFs where the text layer is gone.
- **Bulk files:** xlsx/xls → SheetJS (`xlsx`); zip → unzip+parse; parquet/big-csv → DuckDB; **shapefile/geojson** (gov geo) → DuckDB `spatial` extension.
- **LLM-vision (screenshot→structured):** last resort for canvas/DOM-hostile pages; pricey per page — only when deterministic parsing is impossible.
