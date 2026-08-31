---
source: Clay-user detection dead ends (Apollo keyword / G2 / Credly / tech-DBs)
vertical: companies using Clay (clay.com)
verdict: failed
last_validated: 2026-08-02
access: n/a
dispatch: n/a
cost_tier: n/a
---

# Dead ends × Clay users (recorded so nobody re-tries them)

- **Apollo person-level free-text keyword search DOES NOT EXIST** (verified in Apollo KB 2026-08: the "Industry & keywords" filter is COMPANY-level; person search = title/name only). Self-reported-skill discovery requires Sales Nav's keyword field (searches whole profile incl. past roles — can't scope to current).
- **G2/Capterra/TrustRadius:** ~200-300 Clay reviews but reviewer company names structurally anonymized (title + size band + industry only); G2/TrustRadius hard-blocked (403). Dead for list-building; fine for VOC.
- **Credly certifications:** only ~1,000 ever issued (Clay's own numbers; paused Mar 2026, badges expire +1yr); badge UUIDs random, no public earner directory, sparse Google indexing → 100-300 identifiable holders → 30-120 companies max, job-seeker/agency-skewed. Confirmation layer only.
- **Wappalyzer/BuiltWith have no Clay entry — but the "undetectable" conclusion was WRONG:** Clay's Web Intent snippet loads from dedicated CDN `claydar.com`, fully detectable via HTTP Archive (see `claydar-web-intent--clay-users.md`). Lesson generalized as WA-11: tech-DB absence ≠ no footprint; read the vendor's install docs/CSP allowlists.
- **TheirStack** "8,532 companies using Clay" = the job-postings method (paid) — useful only as a universe-size benchmark.
- **HubSpot marketplace** (12k installs) & LinkedIn follower counts: scale signals, zero identity.
