---
source: YC startup directory (Algolia API)
vertical: AI-native / infra SaaS needing usage-based billing (Flexprice-type ICP)
verdict: validated
last_validated: 2026-07-05
access: hidden JSON API (WA-02) + pagination/param fuzzing (WA-06)
dispatch: web-scrape-triage
cost_tier: free
---

# YC startup directory × usage-based-billing ICP

**Coverage:** ycombinator.com/companies via Algolia. `status:Active` counts (2026-07-05):
Artificial Intelligence **761**, Infrastructure **99**, AIOps **46**. Secured key hard-filters
to `ycdc_public` (stealth/non-public excluded → real ceiling below the UI's ~1,439). Fully
pageable in <50 requests.

**Fields:** name ✅ · `website`→domain ✅ (100% fill) · `team_size` ✅ (~98%) · `batch` ✅
(100%, stage proxy) · `one_liner`+`long_description` ✅ (rubric input) · tags/industries/
subindustry ✅ · status ✅. **Usage-pricing signal ❌ native** — must be inferred from the
description via LLM rubric.

**Fill rates (from test, BY DEPTH):** domain 100% / team_size 97–100% / batch 100% across
AI-head, AI-deep, and Infra strata. No depth decay in fill.

**Restrictions:** Algolia 1000-hit/query cap (all tag sets under it now; split by `batch`
facet if AI grows past 1000). `ycdc_public` filter baked into the key. No bot layer on the
Algolia endpoint. ToS: fine for qualifying your own outbound, not for resale. Freshness: live
index (new batches appear immediately).

**Method:** `POST https://45bwzj1sgc-dsn.algolia.net/1/indexes/YCCompany_production/query`
Headers: `X-Algolia-Application-Id: 45BWZJ1SGC` + `X-Algolia-API-Key: <base64 key>`. The key
is embedded unobfuscated in `window.AlgoliaOpts` in the companies-page HTML — **re-grab it if
it rotates** (don't hardcode long-term). Body: `facetFilters:[["tags:<TAG>"],["status:Active"]]`,
`hitsPerPage:25–100`, `page:N`. (Working key on 2026-07-05:
`NzllNTY5MzJiZGM2OTY2ZTQwMDEzOTNhYWZiZGRjODlhYzVkNjBmOGRjNzJiMWM4ZTU0ZDlhYTZjOTJiMjlhMWFuYWx5dGljc1RhZ3M9eWNkYyZyZXN0cmljdEluZGljZXM9WUNDb21wYW55X3Byb2R1Y3Rpb24lMkNZQ0NvbXBhbnlfQnlfTGF1bmNoX0RhdGVfcHJvZHVjdGlvbiZ0YWdGaWx0ZXJzPSU1QiUyMnljZGNfcHVibGljJTIyJTVE`)

**Cost actuals:** 7 API calls → 164 raw records, ~45s, free. Rubric = LLM/inline judgment.

**Gotchas (the money lessons):**
1. **The `Artificial Intelligence` tag is NOISY for a usage-billing ICP** — 18–20% qualified
   (flat-subscription vertical AI SaaS, healthcare AI, consumer apps). `Infrastructure`+`AIOps`
   tags = **55%** qualified (inference clouds, GPU marketplaces, agent-execution infra) — ~3×
   denser but thin populations. **Segment by TAG, not page depth.**
2. Head pages = large/established cos (Scale AI, Checkr, team 500–800 → often >1000-employee
   KILL); deep pages = tiny recent (team 2–10). Page depth ≠ ICP quality here.
3. Inferred-signal MED bucket survives human eyeball ~50–60%; HIGH (stated-signal) bucket ~100%.
   Report and estimate volume for the two buckets separately.

**Runs:**
- 2026-07-05 — Flexprice eval — 164 raw / 54 qualified (33% overall; AI 19% vs Infra/AIOps 55%)
  — method validated; params lesson = lead Infra/AIOps, rubric-gate the AI tag.
