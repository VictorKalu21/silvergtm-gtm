---
source: Google Maps (scraper.tech searchmaps.php)
vertical: US residential foundation repair / basement waterproofing contractors (home services)
verdict: validated
last_validated: 2026-09-12
access: Maps tiling via google-maps-scrape; owner names via BBB (SERP discovery, WA-08) + dealer-network team pages (plain fetch)
dispatch: google-maps-scrape
cost_tier: paid (Maps API per tile); owner registry free
---

# Google Maps × US residential foundation repair

**Verdict:** VALIDATED. Scrape + qualify + owner-finding run to completion (845/1,104 named, 76.5%). `last_validated: 2026-09-12`. Client first run: Atlas Growth (offer: Facebook lead-gen for inspection appointments).

## ICP
Residential foundation repair, piering, basement waterproofing, crawlspace, mudjacking/slab lifting contractors. Keep roll-ups and franchise branches (flag `brand_family`); drop commercial-only, general contractors, waterproofing product suppliers, engineers.

## Method / coverage
- `areas` mode, 10 states (TX KS MO OK LA MS CO GA AL AR) + 3 border metros, sharded 8 ways, `run-scrape.js --resume`.
- **1,410 tiles** → 1,624 domain representatives after qualify + geo + collapse → **1,104 ICP (68%)** after site-text fit classification → Clay spine 1,521 rows.
- Review floor **30** worked as the size lever (consumer-facing trade; reviews track size here).
- Site-text fit classification was needed: the Maps category pulls in suppliers, engineers, and commercial-only firms that name rules cannot separate.

## Owner-finding (the whole ballgame for this vertical)
- Own website names an owner on only **~16%** of sites. "Family-owned since 1987" is copy, not a contact.
- **BBB Business Profiles are the owner registry** (principal + title). Ranked #1 for `"<business>" <city> <ST> owner` across TX/CO/OK/MS; resolved 8/8 leads the site had failed on. Profile pages 403 to a plain fetch; the SERP snippet carries the name.
- **Branch mis-attribution:** BBB returns a real president for the WRONG branch of an exact-name multi-location company. Reject on city mismatch.
- **Dealer networks** (Basement Systems / Supportworks / Groundworks) publish a full roster on `about-us/meet-the-team.html`, at the bottom, past `fetch-sites.js`'s 2,800-char L2 cap. Corporate roll-up domains (groundworks.com, afsrepair.com, aquaguard.net, helitechonline.com, foundationrecoverysystems.com) 403 a plain fetch.
- Final method: Haiku model read of on-disk text (24.5% of leads with evidence) + Haiku web-search sweep with BBB as registry (70.7% of swept leads). **Combined 845/1,104 named (76.5%), 807 owner-level**, ~6.3M Haiku tokens, 0 vendor SERP spend.
- On-site emails: 298 found → 81 worth verifying after tiering (named-match / personal-shaped / free-mail / role-generic / template placeholder). Verification not yet run.

## Cost actuals
- Maps: 1,410 tile calls (+617 re-bought when a background run was killed before `run_log.json` was written; see google-maps-scrape IMPROVEMENTS).
- Two scraper.tech SERP plans bought; product returns title-only (`url` empty, `description` on ~25%). **Not fit for owner-finding.** Walk web-scrape-triage Tier 2 before buying.

## Gotchas
- Regex/keyword owner extraction banked 24 business names as people ("Royal Foundation", "Cascade Mudjacking"). Vertical logic must live in the owner-prompt, read by a model. (process-rules R2 recurrence.)
- `readRunsheet` quoting, `L2_CAP`, run_log-at-end, fetch-sites exception leak: all OPEN in google-maps-scrape IMPROVEMENTS.md.

## Runs
- 2026-09-11 — Atlas Growth — 1,104 ICP / 1,521 spine — scrape complete; 845 named (76.5%); 73 verified emails; enrichment waterfall + clay.csv pending.
