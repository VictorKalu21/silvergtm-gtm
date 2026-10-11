---
source: Google Maps via scraper.tech (own scrape, areas mode, country=us, offset pagination on) + on-site harvest + DataForSEO SERP (standard/batch mode) for owners and emails
vertical: US residential in-ground swimming-pool builders — gunite/shotcrete, fiberglass, vinyl-liner; builders that also service/retail count when new construction is stated on the site
verdict: validated (warm states, phase 1); phase 2 = the remaining 32 states + DC
last_validated: 2026-10-11
access: scraper.tech key (Maps); DataForSEO login (owner/email SERP, capped per run); no enrichment vendor; no verification spend yet
dispatch: google-maps-scrape (front door icp-source-planner); run folder clients/atlas-growth/2026-10-11_us-pool-builders
cost_tier: paid-per-call (6,418 Maps calls for 18 warm states; DataForSEO ≈ $0.005 per Qualified lead for the owner rung in standard mode)
---

# Google Maps × US in-ground pool builders (Atlas Growth, 2026-10-11 run)

> Interim numbers: wave 2 of the site-text classification (the residue re-fetch) was still running when this was
> written; the Qualified count moves up once it lands. Everything else below is measured.

**The Maps universe for "pool" in the 18 warm states is ~45k listings, of which roughly one in twelve is a
confirmed new-construction builder.** 362 warm-state anchors (GeoNames-derived: P1 25 km around ≥25k-pop places,
P2 35 km around ≥50k, min 4 per state, rural fill) × 7 queries (`Swimming pool contractor` as the P1 native
category + six `kw:pool` keyword rows: builders, in-ground installation, construction companies, custom,
fiberglass, concrete/gunite) = **2,534 runsheet rows → 6,418 calls (2.5 per row, pagination max 6 pages, 150
limit, saturation 90) → 129,959 shard rows → 44,769 unique place_ids**. Eight round-robin shards of the self-healing
wrapper, zero unhealed cells.

## Qualify (what the rules did, measured)

Lenient by design (operator's call: no review floor, no website rule — the site text decides). Primary-type deny
list (cleaning, repair, supply store, hot-tub store, landscaper … as PRIMARY only) + name deny + allow on ANY
google_type in {swimming pool, pool cleaning, pool contractor, pool repair, pool supply, hot tub, spa}: **25,202
kept + 1,419 recovered** by the generic-contractor recovery config (generic contractor / concrete / deck-patio /
home-builder type AND a pool/aquatic/gunite/shotcrete/fiberglass name) = 26,621 → footprint gate (keep-domestic)
−127 foreign pins → **26,494**. Keyword rows contributed 15,679 further candidates typed as something else;
**only the adjacent outdoor-construction trades were kept (8,354: general contractor, concrete, masonry,
landscaper, deck/patio, excavation, home builder)** — the other 7,320 (restaurants, hotels, apartment complexes
with a pool) were dropped as `kw_offtrade_type` without a fetch. Those adjacent-trade rows classify at 5–10%
in-ground builder (batches 131–181 ran 40–55 `not_pool` per 60) — worth the fetch, not worth a SERP rung.

**Brand families matter here more than in any trade so far:** Blue Haven, Anthony & Sylvan, Premier, Presidential,
Shasta, California Pools, Paddock, Cody, Riverbend Sandler, Platinum, Morehead, Pulliam, Aquamarine, Blue World, the
Leisure / Latham / Thursday / Imagine dealer networks; service franchises ASP, Pool Troopers, Pool Scouts, Poolwerx;
retail chains Leslie's and Pinch A Penny. Collapse: **34,848 qualified rows → 22,823 representative domains + 8,035
no-website / shared-host rows**; 1,899 branch rows were classified on their brand site (fanned sibling text) and the
retail chains fell out cleanly as `retail_only` (three whole batches of 60 were 53–59 retail).

**10,741 qualified rows have no street address** (service-area listings — pool builders work out of a truck). The
deliverable places them by nearest tile (`location_source=nearest_tile`); do not geo-gate on address presence.

## Site text → classification

22,823 domains: the engine's 4-shard `fetch-sites.js` run lost two shards to a silent pool exit and two to a
CPU-bound stall on one page (IMPROVEMENTS.md, HIGH, OPEN) — **14,187 ok after the first merge + one watchdog-chunked
re-fetch; residue 8,044 re-fetched in 200-row chunks under `timeout` (25-row chunks where the pathological pages
cluster)**. Wave 1 (10,891 representatives with text, Haiku per 60-lead batch, construction phrase quoted
verbatim or it is not a builder): **inground_builder 3,368 (31%) · builder_unconfirmed 1,165 · service_only 1,883 ·
retail_only 334 · commercial_only 90 · not_pool 3,037 · unclear 1,014**. Wave 1b (1,899 fanned branches):
inground 577 · retail 471. Pool type is readable from the text for most builders (gunite/concrete dominates TX/AZ/
CA, fiberglass the Southeast and the Latham/Thursday networks, vinyl-liner the Northeast).

Interim deliverable (before wave 2): **3,571 Qualified · 22,867 Review (mostly rows awaiting text) · 15,522
Excluded (9,916 at the Maps stage)**; Qualified by state leads CA 605, TX 604, FL 508, AZ 218, GA 169, TN 145,
VA 123, NC 116.

## Owners and emails — DataForSEO, scoped

scraper.tech's SERP product is dead; `search-owner.js --backend dataforseo --mode standard` is the rung now.
Probe on 100 Qualified leads (425 queries, biased + LinkedIn + email rungs): **$1.035, 100/100 leads returned
owner-bearing snippets, 23/100 gained a strict (own-domain/social) email candidate; 70/100 already had an on-site
email**. Measured prices: live/advanced and live/regular both bill **$0.006 per query** (the pricing page says
$0.002); standard (batch) **$0.0018–0.0024**, ~60–90 s post-to-result. Empties were vendor `Internal SE Server
Error` / `No Search Results` (billed, transient — the script retries once / re-posts once). The vendor ignores the
`site:` operator, so email attribution must be strict (own host, own social page, or own domain in the snippet) and
the loose matches are kept in a separate column. Plan: owner rung on every Qualified lead (~$0.005/lead), email
rung only on Qualified leads with no on-site email; `--max-cost` is per batch post, so it can overshoot by one
100-query post. Credits are never spent without an explicit cap from the operator.

## Costs, this run

Maps 6,418 calls (18 warm states) · ~214 Haiku classify batches (~175k tokens, ~4.5 min each, 20 in parallel) ·
DataForSEO $1.04 probe · 0 enrichment · 0 verification. Phase 2 (other 32 states + DC) = `gen-runsheet-pools.js
--states all` on the same config; expect roughly half the warm-state volume.
