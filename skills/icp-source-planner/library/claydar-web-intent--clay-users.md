---
source: HTTP Archive claydar.com fingerprint (Clay Web Intent snippet)
vertical: companies using Clay (clay.com) — tool-user technographic
verdict: validated
last_validated: 2026-08-02
access: BigQuery public-dataset scan (Tier 0.7) + WA-11 (vendor-CDN fingerprint)
dispatch: web-scrape-triage
cost_tier: free
---

# claydar.com / HTTP Archive × Clay users

**Coverage:** Every site loading Clay's Web Intent tracking snippet (served from `static.|cdn.|api.claydar.com`) = a currently-PAYING Clay customer, identified by DOMAIN (no name→domain step exists — the domain IS the record). July 2026 crawl → **1,200 domains** vs Bloomberry's 1,312 (~9% gap; HTTP Archive crawls CrUX-ranked origins only). This is a floor, not a census: Clay claims 16k+ customers; only the Web-Intent-using subset (marketing-mature skew) is visible.
**Fields:** domain (native), CrUX rank (size proxy), example_page. Segment/what/country need a homepage-classify pass.
**Fill (2026-08 run):** 1,083/1,200 end-user (90%) after classification; 21 clay-agencies, 16 data-tool vendors, 2 junk (watch wildcard hosts like vercel.app), 78 homepage-fetch-fails held out unclassified. clay.com itself appears (runs its own snippet).
**Restrictions:** monthly crawl cadence; scan ≈569 GiB (fits 1 TiB free tier — dry-run first; desktop client union would double it past budget).
**Method:** `SELECT DISTINCT NET.REG_DOMAIN(page) AS domain FROM httparchive.crawl.requests WHERE date='<crawl-1st>' AND client='mobile' AND url LIKE '%claydar.com%'` (+ rank from same table). NOTE: legacy `httparchive.all.*` is RETIRED — use `httparchive.crawl.*`. bq CLI authenticated on this machine (project `concise-ranger-487621-f4`). Fingerprint domain found in Clay's own docs (Web Intent CSP allowlist section) — see WA-11.
**Cost actuals:** $0; one query + 3 classification shards (~400 domains each).
**Gotchas:** piping SQL via stdin on Windows injects UTF-8 BOM + mangles backticks — pass single-line SQL as a positional arg to `bq`. Fetch-fail rate ~10% on the long tail.
**Recurring feed:** month-over-month diff of the same query = new-install (fresh-adopter timing signal) + removal (churn/renewal risk) — exactly the data Bloomberry sells gated.
**Runs:** 2026-08-02 — Silver GTM — 1,200 domains → 1,083 end-user — PASS (test: 100% alive, 88% end-user, 0% agency).
