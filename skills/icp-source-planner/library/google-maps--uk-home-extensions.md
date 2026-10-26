---
source: Google Maps (scraper.tech `searchmaps.php`), UK — our own tiled scrape on the validated 177-tile UK grid
vertical: UK residential home-extension contractors — extension builders, loft / garage / basement conversion specialists, design-and-build firms (conservatories OUT)
verdict: validated
last_validated: 2026-10-26
access: Maps via scraper.tech (paid, keyed, pagination on); site text via fetch-sites.js (plain fetch + PASS 2 retry); verdicts via Haiku-per-batch site-text classify (keyword tiers A/B read, D sampled, F = no text); owner names via Companies House (free key) + owner read — NOT YET RUN
dispatch: google-maps-scrape (full pipeline, STEP 2 onward; icp-source-planner front door)
cost_tier: workaround (Maps calls are paid; every downstream rung so far was free)
---

# Google Maps × UK home-extension builders

**Verdict:** VALIDATED through STEP 5e (site-text classify) on our own scrape. Client: Atlas Growth
(2026-10-11 `2026-10-11_uk-home-extensions-maps`, ICP `ICP-extensions-uk.md`). Owner-finding and
emails are the next stages; the deliverable at this point is a flagged Qualified / Review / Excluded
list with site-text evidence (`assemble.js` + `build-xlsx.py` in the run folder).

**Coverage:** the whole UK on the foundation-repair grid — **177 tiles** (150 town anchors + 27
densification), zoom 13, `geo.footprint.mode:"areas"`, `region_default:"UK"`. **Universe 41,689 unique
businesses** from 4,060 calls (1,770 runsheet rows = 177 tiles × 10 queries, **2.29 calls/row**, 0
unhealed tiles) → **8,567 Qualified** (site states it builds extensions / loft, garage or basement
conversions / design-and-build for homeowners) + 13,447 Review + 18,548 Excluded. By nation (nearest
tile): England 7,690 · Scotland 411 · Wales 260 · Northern Ireland 76 · 130 with no coordinates.

**Fields:** name / address / phone / website / google_types / review_count / rating / claimed /
lat-lng → **can**. Owner name, email, headcount → **can't** from Maps; on-site email harvest gives
**91.9% of Qualified rows an address** (unverified, mostly role addresses). `zip` is empty; the
postcode is parsed from `full_address` (**74.5% of Qualified**); **2,174 Qualified rows (25%) have NO
address at all** — service-area listings — so `town` is blank and a city backfill
(`backfill-city-nearest-metro.js`) is needed before any personalised send.

**Fill rates (this run, BY DEPTH):** head (Maps) phone 97%, website 100% on the spend rows ·
mid (site text) **14,191 of 17,070 spend domains fetched `ok` (83%)**, of which **1,482 are
header-only shells** (HTTP 200, no body: JS-rendered or cookie-walled) → **~70% usable text**;
residue 403 1,309 · TypeError (TLS/DNS) 1,147 · 404 444 · 503 428 · AbortError 127 · deep (owner
name) not yet run.

**Restrictions:** pagination load-bearing as on the foundation run; **two of the ten queries are
dead weight** — `single storey extension` 263 rows and `double storey extension` 177 rows over 177
tiles each (~680 calls for ~440 rows, almost all duplicates of `house extensions`). Drop them: 8
queries, ~3,400 calls, same universe. `country=gb` is a hint; the footprint gate removed 1,400
`far_from_hubs` + 15 `wrong_country`. **768 listings have no address and sit on the country centroid**
(the OPEN footprint-gate issue): 568 with a UK phone were taken back job-side
(`recover-blank-address.py`, lat/lng blanked), 200 with a foreign or missing phone stayed out.
`fetch-sites.js` on a 17k pass ran out of heap at the end-of-run report (IMPROVEMENTS 2026-10-26
OPEN; run with `--max-old-space-size=8192`).

**Method (the exact working recipe):**
- **10 queries**, volume by rows summed over tiles: `home renovations` 31,763 · `extension builders`
  27,886 · `design and build` 27,473 · `loft conversions` 25,301 · `home extensions` 16,167 · `garage
  conversions` 13,849 · `house extensions` 7,195 · `basement conversions` 6,358 · `single storey
  extension` 263 · `double storey extension` 177. `design and build` drags in web / graphic / marketing
  designers (hard-deny those types); `extension` drags in hair and lash extensions (hard-deny
  Hairdresser / beauty types AND the name tokens).
- **Zero review floor (operator).** The calibration showed floor 5 removing 28% of a dense-tile
  universe, 73 of 554 being 1–4-review firms with live websites whose names read as the ICP. The
  site-text classify is the gate instead; ghost pins land in Review, never Qualified.
- **Qualify: denies first, then an any-tag allow of the generic construction types** (`construction
  company`, `general contractor`, `home builder`, `custom home builder`, `building firm`, `building
  company`, `garage builder`), **then two $0 recoveries**: bare-type (`primary_type in [contractor,
  builder, remodeler, remodeller, building firm]`, no name test) and name-claims-it (trade/design
  primaries + a name token: extension / loft / conversions / design-and-build spellings / build /
  construction / renovation / refurbish). Qualified by track: **main 7,678 · bare-type 591 · name 298**
  — the recoveries are worth 10% of the final list.
- **The funnel, actual:** 41,689 → qualify 25,480 (61%: main 21,151 + bare-type 2,612 + name 1,717)
  → footprint 24,065 + 568 blank-address recoveries = 24,633 → dedupe waived → collapse 17,070 spend
  rows (969 domain siblings folded) + 6,593 no-website (733 shared-host, 5,860 none) → site text →
  keyword tiers A 9,970 / B 1,317 / D 745 / F 5,038 → **Haiku classify 12,090 verdicts
  (A+B in full, D-sample 100, D-rest 635, 916 re-read after the re-fetch)** → extension_builder
  8,242 (68% of verdicts) · builder_unconfirmed 1,437 · unclear 177 · trade_only 1,118 ·
  commercial_only 405 · not_builder 226 · design_only 204 · new_build_only 169 ·
  conservatory_glazing_only 112 → assemble (sibling fan-out + in-run phone/name+street collapse 279)
  → **8,567 Qualified** (priority A 937 · B 3,495 · C 4,135).
- **Keyword tiers are a pre-filter, and tier D is the check:** tier A ran 80–95% extension_builder
  per batch, tier B 0–15%, the tier-D 100-row false-negative sample **0 of 100**, and the D-rest 635
  read afterwards came back 24% extension_builder only because 250 newly-fetched tier-A rows were
  in the same pass — the D rows themselves read as trades. The pattern holds for the third UK vertical.
- **Classify rubric that worked:** `extension_builder` requires a quoted build phrase ("we build
  single and double storey extensions"); "design and build" means the company builds (the trade's own
  phrase); loft / garage / basement specialists count; a Google category alone never qualifies.
  work_types named on Qualified sites: renovation/refurb 6,432 · loft 4,834 · new build 3,398 ·
  rear/side 2,608 · garage 2,222 · design-and-build 1,678 · double storey 1,081 · kitchen 656 ·
  orangery 586 · basement 582.

**Cost actuals:** 4,060 scraper.tech Maps calls; site fetch $0 (~3 h at concurrency 12, twice —
pass 1 was lost to a job-side merge write, rule now in the run notes); classify ~200 Haiku subagent
batches of 60 ($0 to the client, session tokens only). Per 1k Qualified rows: ~475 Maps calls.

**Gotchas:**
- A merge script that opens the destination jsonl for writing before encoding its payload truncates
  the file on the first lone surrogate — build in a temp file (`errors='surrogatepass'` or
  `ensure_ascii=True`) and `os.replace`.
- Status `ok` with header-only text is NOT text: the tiering already treats it as F; `assemble.js`
  must too, or 1,482 rows read as "no classify verdict".
- The sibling → representative map lives in `leads_annotated.csv` (`rep_place_id`); use it to fan site
  text and verdicts to branch rows (`domain_siblings.json` is keyed rep → siblings, not the reverse).
- Phones: ~2.6% of Qualified rows carry a truncated (9-digit) or foreign (+91) number from Maps; they
  are kept raw with no E.164.

**Runs:** 2026-10-11/26 — Atlas Growth — 41,689 universe → 8,567 Qualified (+ 13,447 Review) —
validated through classify; owner-finding (Companies House key needed) and emails next.
