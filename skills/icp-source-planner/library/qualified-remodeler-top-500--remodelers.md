---
source: Qualified Remodeler TOP 500 (qualifiedremodeler.com) — hidden wp admin-ajax JSON
vertical: US residential remodelers / design-build / home-improvement firms (size-proven tier; home additions, kitchens & baths, replacement, restoration)
verdict: validated (probe)
last_validated: 2026-10-11
access: Tier 0 hidden JSON — GET https://www.qualifiedremodeler.com/wp-admin/admin-ajax.php?action=top_500_<YYYY>__data (keyless, browser UA, no anti-bot)
dispatch: web-scrape-triage (Tier 0; one call per year)
cost_tier: free
---

# Qualified Remodeler TOP 500 × US remodelers

**What it is:** the magazine's annual ranked list of the 500 largest US remodeling firms by remodeling
revenue. The list page renders a DataTables grid from a keyless admin-ajax endpoint. Year pages linked
for **2020–2026**.

**Probe 2026-10-11 (pasted in the session):** `action=top_500_2025__data` → HTTP 200, 325 KB,
`{"data":[…500 rows…]}`. `action=top_500_2024__data` → 200, 500 rows. 2024∩2025 = 233 companies →
**767 distinct firms across two years**; a six-year union should land ~1,200–1,500.

**Fields (all filled on 2025):** `rank` · `company` · `website` (500/500) · `location` ("City, State",
47 states) · `leadership` (named principal, 500/500) · `year_found` · `remodeling_revenue` · `revenue_jobs`
(job count) · `gross_revenue` · `remodeling_segment_focus` · `no_of_employees` · `revenue_marketing` ·
`association_memberships` (mostly blank) · `top_business_challenge_in` · `top_opportunity_in` · `firm_id` ·
`url_link` (per-firm profile page, `?y=<year>`).

**Segment focus, 2025:** Replacement | Home Improvement 242 · Design-Build 106 · Full-Service 89 ·
Kitchen & Bath Design Remodeling 35 · Insurance Restoration 25 · not disclosed 3. For a home-addition ICP
the Design-Build + Full-Service rows (~195/yr) are the target; Replacement and Restoration are off-ICP.

**Fit:** a size-proven, leader-named, website-complete seed at $0 — the head of the market, not the
universe (the universe is Maps). Rows ranked ~300–500 are $3–10M firms, exactly the mid-size independent
the Atlas offer sells to. `leadership` is a free head start for the owner read (verify title on-site).

**Restrictions:** none observed; one GET per year. Treat `leadership` as a person name (PII) — keep
outputs gitignored. Rank is self-reported revenue.

**Gotchas:** `website` is scheme-less (`www.x.com`); `location` is "City, State-name" (full state name,
not code); `revenue_*` are formatted strings with `$` and commas. The HTML page itself holds only the
table header — fetching it tells you nothing; go straight to the endpoint.

**Runs:** 2026-10-11 — Atlas Growth home additions — probed only (Phase 1); not yet merged.
