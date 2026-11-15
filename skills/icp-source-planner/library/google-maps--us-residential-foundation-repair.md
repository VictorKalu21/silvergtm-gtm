---
source: Google Maps (scraper.tech searchmaps.php)
vertical: US residential foundation repair / basement waterproofing contractors (home services)
verdict: validated
last_validated: 2026-11-15
access: Maps tiling via google-maps-scrape; owner names via BBB (SERP discovery, WA-08) + dealer-network team pages (plain fetch)
dispatch: google-maps-scrape
cost_tier: paid (Maps API per tile); owner registry free
---

# Google Maps × US residential foundation repair

**Verdict:** VALIDATED. Scrape + qualify + owner-finding run to completion (845/1,104 named, 76.5%). `last_validated: 2026-11-15`. Client first run: Atlas Growth (offer: Facebook lead-gen for inspection appointments).

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
- 2026-09-11 — Atlas Growth — 1,104 ICP / 1,521 spine — 845 named (76.5%); emails: 236 leads with a verified sendable address (21%), 172 personal (16%), via on-site + QuickEnrich + LA/AR licence boards + seeded pattern; closed out 2026-09-13.

## National run, no review floor (2026-11-15, Atlas Growth)
- **Coverage:** 586 anchors (all 50 states + DC) × 10 queries (3 foundation + 7 adjacent: waterproofing, crawl space ×2, concrete leveling, mudjacking, house leveling, structural repair) at zoom 13, 20 shards. **13,269 calls (2.26 per row)** → 81,687 unique → 11,117 qualified in-US → 7,240 website domains.
- **Fit read:** **4,001 residential-foundation domains** (55%), 5,301 rows incl. branches. That is ~3.6× the 2026-09-11 10-state, floor-30 run (1,104). Removing the floor accounts for ~2.6× of it.
- **Floor:** reviews barely predict fit here. The fit rate is 61% at 30+ and 5–29, and 50–52% under 5. A floor buys precision only in the 0–4 band.
- **Rank-and-rent is the cost of no floor.** On the fit set: strong lead-gen flags (shared phone / shared copy / homoglyph copy) 215, soft (model-only, ~80% precise) 295.
  - The networks cluster in TX, TN, FL and the Midwest basement belt.
  - Some use **Cyrillic look-alike letters** and a tracking number per town to evade duplicate joins.
  - Some invent a brand per city.
  - Flag them, don't drop: a real contractor's per-city pages look the same.
- **Category leak:** "Waterproofing service" and bare "Foundation" categories bring in roofers, landscapers, plumbers, HVAC and charities. The main path fit is 52% against 62% on the generic-contractor + foundation-name recovery path. The fit read is the gate, not the category.
- **Service-area listings:** 36% of rows have no street address (coordinates only). Take state from coordinates.
- **State mix (fit companies):** TX 753 · FL 307 · NC 238 · OH 192 · NY 159 · CA 154 · IL 150 · PA 135. The West outside CA/WA is thin.
