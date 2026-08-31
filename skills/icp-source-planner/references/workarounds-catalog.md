# Workarounds Catalog

Named, reusable techniques for getting data out of sources that don't hand it over.
Source Profiles cite these BY ID (e.g. "access: WA-03 + WA-04"). Grows every run —
append new techniques with the next WA-number using the entry template at the bottom.

Legality/ethics line: public data, no auth-wall bypassing, no credential abuse,
respect explicit blocks that survive the triage ladder. ToS-gray is noted per entry.

---

## WA-01 — URL grammar reverse-engineering
**What:** Infer the site's URL pattern for listing pages (category/geo/page params)
and enumerate it directly instead of navigating.
**When:** Directories and listing sites with visible pagination or filters.
**How:** Load 2–3 filtered pages manually, diff the URLs, extract the grammar
(`/agency/<cat>/<cc>?page=N`), probe boundaries (404 vs empty page), then enumerate.
**Risks:** Grammar changes silently; aliasing (uk=gb); some segments look filtered
but aren't — spot-check content matches the filter.
**Proven:** DesignRush `/agency/<cat>/<cc>?page=N` → 7,043 agencies (2026-06).

## WA-02 — Hidden JSON API discovery
**What:** Find the JSON endpoint the page itself calls and hit it directly.
**When:** Any JS-rendered listing; infinite scroll; "loading…" spinners.
**How:** DevTools Network tab (XHR/Fetch) while paging; copy the request; strip to
minimal params; check for page/offset params and per-request row caps.
**Risks:** Auth tokens in headers (short-lived); row caps lower than UI suggests;
ToS-gray on some sites.
**Proven:** Niceboard job-board API → 276 jobs, gtmecareers (2026-06).

## WA-03 — Boolean / SERP dorking
**What:** Use a search engine as the index: `site:` + role/tool/vertical patterns.
**When:** Data spread across many subdomains you can't enumerate (ATS boards,
profile pages); when the site's own search is weak.
**How:** Build query grammar (`"Clay" "<role>" site:boards.greenhouse.io`), run via
scraper.tech Search key, harvest result URLs, then fetch each.
**Risks:** SERP dedupes aggressively (~300-400 results max per query — vary
queries); snippet data is lossy, always fetch the underlying page.
**Proven:** clay-jobs-serp.js → 101 companies via `Clay <role> site:<ats>` (2026-06).

## WA-04 — Sitemap & robots mining
**What:** Read robots.txt → sitemap.xml → enumerate every profile/listing URL the
site publishes about itself.
**When:** First 5 minutes on ANY new source — it's free reconnaissance.
**How:** Fetch `/robots.txt`, follow Sitemap: lines, expand sitemap indexes,
filter URL patterns for the record type you want.
**Risks:** Sitemaps can be stale or partial; huge sites shard sitemaps (follow the
index); absence of a sitemap tells you nothing.

## WA-05 — Embedded structured-data harvest (JSON-LD / __NEXT_DATA__)
**What:** Parse the structured blobs already inside the HTML instead of scraping
the DOM: schema.org JSON-LD, `__NEXT_DATA__`, Nuxt/Apollo state objects.
**When:** Any modern site — check BEFORE writing DOM selectors.
**How:** Fetch page HTML, regex for `<script type="application/ld+json">` or
`__NEXT_DATA__`, JSON-parse, walk the object. Often contains MORE fields than the
visible page.
**Proven:** DesignRush ratings/reviews from page JSON-LD ItemList (2026-06).

## WA-06 — Parameter fuzzing
**What:** Widen a working request: increment IDs, try other country codes, extend
page ranges, add per-page params.
**When:** After WA-01/WA-02 gives you one working request shape.
**How:** Change one variable at a time; detect the "empty but 200" response shape
first so you know when you've run off the end; back off on 429s.
**Risks:** Easy to trip rate limits — go slow; sequential IDs may leak records the
UI doesn't show (ToS-gray; note it in the profile).

## WA-07 — Cached & archive pulls
**What:** Read a blocked/changed page via Wayback Machine or search-engine cache.
**When:** Hard anti-bot on individual pages; recently-removed listings; historical
snapshots (e.g. pricing changes).
**How:** `web.archive.org/web/<url>`; Wayback CDX API for enumerating archived URLs
of a domain (itself a discovery trick).
**Risks:** Staleness — always mark archive-sourced fields with capture date.
**Proven:** community.clay.com full run — live origin Cloudflare-walled, Wayback served
281/291 posts incl. recovering pre-hydration "empty shell" snapshots via alternate
timestamps (2026-08).

## WA-08 — SERP-driven discovery
**What:** Use search results as the DISCOVERY layer when a site has no enumerable
index at all, then fetch pages directly.
**When:** No sitemap, no URL grammar, no API — but pages are indexed.
**How:** `site:domain.com <record-type keyword>` via scraper.tech Search; collect
URLs; dedupe; fetch. Combine with WA-03 grammar variation to beat SERP caps.

## WA-09 — Outbound-link anchoring
**What:** Extract a company's REAL domain from a directory's tracked outbound link
instead of guessing from the name.
**When:** Any directory that links to members' sites (usually with utm params).
**How:** On the profile page, anchor on the SPECIFIC element that carries the
outbound link (e.g. the H1's website-link), not just any external href — sidebars
carry OTHER companies' links.
**Proven:** DesignRush H1 `gtm-agency-website-link` → 98% domain coverage; grabbing
any external link pulled featured-agency domains instead (2026-06).

## WA-10 — Lightweight endpoint variants
**What:** Fetch the print/AMP/mobile/RSS variant of a page — often server-rendered
with weaker anti-bot even when the main page is hardened.
**When:** Main page needs rendering/unlocker but you suspect a lighter variant.
**How:** Try `?print=1`, `/amp`, `m.` subdomain, `/feed`, `.json` suffixes
(Shopify: `/products.json`).
**Risks:** Variant may omit fields; verify field parity on 3 samples first.

## WA-11 — Vendor-CDN fingerprint census
**What:** When Wappalyzer/BuiltWith have NO entry for a SaaS, find its dedicated
tag/CDN domain in the vendor's own install docs (CSP-allowlist sections, GTM guides,
"add this snippet" pages), then scan HTTP Archive's requests table for pages loading
it — a free technographic census of the vendor's paying customers, domain-first.
**When:** Any "companies that use tool X" ICP where the tool has ANY on-site feature
(visitor ID, forms, chat, widgets) — even if the tool is "known" to be backend-only,
check for a newer embedded product first.
**How:** vendor docs → fingerprint domain → `SELECT DISTINCT NET.REG_DOMAIN(page)
FROM httparchive.crawl.requests WHERE date='<crawl>' AND client='mobile' AND url
LIKE '%<cdn-domain>%'` (dry-run first; ~500GiB per crawl scan fits the 1TiB free
tier). Monthly re-run = install/churn diff feed.
**Risks:** Only sees the feature-using customer subset (floor, not census) and
CrUX-ranked origins; dataset schema moves (all.* → crawl.*).
**Proven:** claydar.com → 1,200 Clay customers, 90% end-user, $0 (2026-08).

## WA-12 — Sender-seat engagement import (HeyReach reactor pull)
**What:** Use a LinkedIn-automation seat's native "import post reactors" UI feature
as the extraction engine, then pull the list via the tool's API — $0 engagement
scraping with employer field attached (~97% parse), no Apify.
**When:** Tool-user / audience ICPs where a vendor's or creator's posts concentrate
the target persona; user has HeyReach (or similar) with a connected sender.
**How:** SERP-dork candidate posts (WA-03; reaction counts are server-visible on
logged-out post fetches — verify before importing), user pastes URL into HeyReach
"Add leads → LinkedIn Post (Reactors)" (ONE LIST PER POST — export has no source-post
field), name lists `CR-<author>-<id6>`, keep a harvested-posts ledger + per-author
end-user-% scoreboard, export via API and classify from headlines.
**Risks:** Reactors only (commenters need a paid actor); 10k/post cap; consumes the
sender seat's LinkedIn action budget — pace imports; audience composition varies
wildly by author type (measure small before scaling — see observations 2026-08-02).
**Proven:** Clay run — 1,069 reactors → 334 net-new end-user companies (2026-08).

---

## Entry template (append new techniques with the next WA-number)

## WA-NN — <name>
**What:** <one line>
**When:** <trigger conditions>
**How:** <concrete steps>
**Risks:** <failure modes, ToS-gray notes>
**Proven:** <run + date, once used in anger>
