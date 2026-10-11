# 2026-10-11_uk-home-extensions-maps — run notes

Client: **Atlas Growth (ASSUMED — the brief named no client; confirm at GATE 1)** · Vertical: UK residential
home-extension contractors (extensions · loft conversions · garage/basement conversions · design-and-build) ·
ICP: `../ICP-extensions-uk.md` · Config: `../atlas-growth-extensions-uk-config.json` (+ `../recover-baretype-…`,
`../recover-generic-…`, `../recover-unrated-extensions-uk-config.json`) · Runsheet: `../atlas-growth-extensions-uk-runsheet.csv`
+ `../atlas-growth-extensions-uk-calibration-runsheet.csv` from `../gen-runsheet-extensions-uk.js` (177-tile UK grid
imported from `gen-runsheet-uk.js`) · Shards: `../shards-extensions-uk/shard-0..7.csv` · Owner prompt: `owner-prompt.md`
(= `../owner-prompts/uk-home-extensions.md`) · Classify prompt: `classify-prompt.md`. All data in this folder is gitignored.

## GATE 1 — STEP 1 + STEP 3 read-back (PENDING, 2026-10-11)

Nothing paid has run. Before the first API call the operator confirms or changes each line:

| # | item | proposed |
|---|---|---|
| 1 | **Client** | Atlas Growth (assumed from the vertical's shape; every artifact sits under `clients/atlas-growth/`) |
| 2 | **Footprint** | whole UK, the validated 177-tile grid (ENG 130 · SCT 25 · WLS 13 · NIR 9; 13 London tiles), zoom 13, areas mode |
| 3 | **Queries** | 10: `house extensions` · `home extensions` · `extension builders` · `loft conversions` · `garage conversions` · `single storey extension` · `double storey extension` · `design and build` (P1) · `home renovations` · `basement conversions` (P2) → **1,770 rows, ≈ 4,600 calls** at the foundation run's 2.61 calls/row |
| 4 | **Lever L1 — `--broad`** | add `builders` + `building contractors` (P3): +354 rows, ≈ +1,800 calls, returns every builder in every town. **OFF** by default |
| 5 | **Lever L2 — conservatories / orangeries** | OUT by default (window installers denied on primary; classify tags `conservatory_glazing_only` for a later ship). Say "in" and the primary deny loses `window installation service` / `glazier` |
| 6 | **Lever L3 — keyword-candidates track** | OFF: no `kw:` routing of every `not_in_icp` row to classify (every query is a keyword here; the name recoveries are the keyword recovery). Say "on" and `union-qualified.js` grows the pools-run `keyword_candidates.csv` branch |
| 7 | **Qualify** | volume-safe: entity deny (+ hair/lash "extensions") → primary deny (architects/designers, kitchen & bathroom fitters, glazing, engineers, surveyors, merchants, hire, plumbers, electricians …) → name deny (+ national housebuilders) → allow on the generic construction types → **review floor 5**; three $0 recoveries (bare `Contractor`/`Builder` primary · trade/design primary with an extension/loft/build NAME · unrated + website). No website rule, no chain drop |
| 8 | **Designers** | EXCLUDED as companies (design-only) and as people (the designer who does the free design visit) — the pools decision applied; design-and-build firms are IN |
| 9 | **Offer** | "We help home extension builders book 10 qualified extension design consultations that turn into build projects every month using Facebook lead generation." (PROPOSED) |
| 10 | **Target role** | MD / Director / Owner / Partner → GM / Ops / Construction Director → Marketing → Sales/Commercial Director; EXCLUDE architect, designer, surveyor, QS, estimator, site/contracts/project manager, the trades |
| 11 | **Dedupe universe** | 2026-09-16 UK foundation runs + 2026-09-30 UK generator/battery runs — **feeds not on this container** (`ref files used: 0` expected): supply or waive |
| 12 | **Calibration first** | `CAL=1 bash run-shards.sh` (3 rows: London/Manchester/Glasgow, ≈ 8–18 calls) → read page depth + type mix → re-price → then the 8 shards |

**Blocker for STEP 4 (measured 2026-10-11, 4 calls):** `GET api.scraper.tech/searchmaps.php` through this container's proxy
returns `{"error":"Access denied"}` (HTTP 200) with no key and with a dummy `scraper-key` alike — the proxy-injected
ScraperTech credential does not authorise the Maps endpoint, and `skills/google-maps-scrape/.env` is not in the clone
(gitignored). The run needs a working `SCRAPER_TECH_KEY` placed in that `.env` (the pools run on this date validated one
that way) before `run-shards.sh` can buy a tile. `scrape.js` reads the key itself and talks to `api.scraper.tech` over
Node `https` directly (no proxy env needed for the vendor host once the key is present).

## Dry-run of the rule set (2026-10-11, 20-row synthetic fixture, scratchpad — pasted, not remembered)

```
QUALIFY main: rules 5 active · input 20 · KEEP 3 · DROP 17
  drop reasons: {"not_in_icp":5,"off_icp_primary":7,"name_deny":2,"hard_off_icp_type":1,"too_small":2}
recover-baretype: KEEP 2  {"not_bare_generic_primary":3,"not_a_recovery_candidate":12}
recover-generic:  KEEP 5  {"not_a_recovery_candidate":5,"name_not_icp":5,"too_small":1,"not_generic_trade":1}
recover-unrated:  KEEP 1  {"not_an_unrated_candidate":15,"has_review_count":1}

Hart Design & Build Ltd              Construction company|General contractor -> MAIN
J Smith Building Services            Contractor                              -> REC:baretype
Leeds Loft Conversions               Roofing contractor|Contractor           -> REC:generic
Extension Architecture               Architect|Architectural designer        -> REC:generic   (name claims it; classify decides design_only)
Barratt Homes - Oak Park             Home builder                            -> DROP name_deny
Glamour Hair Extensions              Hair salon|Hair extensions supplier     -> DROP hard_off_icp_type
Kent Kitchen Extensions Ltd          Kitchen remodeler|Construction company  -> REC:generic
Bright Kitchens Showroom             Kitchen remodeler                       -> DROP off_icp_primary
Premier Conservatories & Windows     Window installation service             -> DROP off_icp_primary   (lever L2)
Build Team                           Construction company|Architect          -> MAIN (brand-flagged downstream)
New Loft Co                          Carpenter                               -> DROP not_in_icp -> generic recovery too_small (3 reviews)
Acme Building Contractors            Construction company (unrated)          -> REC:unrated
Acme Property Maintenance            Property maintenance                    -> DROP not_in_icp   (no extension word in the name)
Travis Perkins                       Building materials supplier             -> DROP off_icp_primary
Riverside Building Services          Contractor|Plumber                      -> REC:baretype
Oak Garage Conversions               Garage builder                          -> MAIN
Smith & Sons Plumbing and Heating    Plumber|Contractor                      -> DROP off_icp_primary
Northern Extensions Ltd              General contractor (2 reviews)          -> DROP too_small   (floor cost, re-admittable at 0)
Studio Lane Architects               Architect                               -> DROP off_icp_primary
Leeds City Council Building Control  Local government office|Building insp.  -> DROP name_deny
```

Dedupe-on-recovery, the `track` column and the `union-qualified.js` bookkeeping run on the same fixture end to end.
The two floor drops (`New Loft Co` 3 reviews, `Northern Extensions Ltd` 2) are the floor working as designed; they are the
rows a `review_count >= 0` re-run over `excluded_officp.csv` would return.

## Pipeline (every step through the engine; commands relative to repo root)
1. Scrape: `CAL=1 bash <run>/run-shards.sh` (calibration) → `bash <run>/run-shards.sh` (8 × `run-scrape.js` over
   `shards-extensions-uk/`, `RESUME=1` to resume) → `maps/shard-N/`.
2. Merge: `node <run>/merge-shards.js` → `maps/leads_clean.csv` + `coverage_summary.json` (must say ALL SHARDS COMPLETE).
3. Qualify: `qualify-leads.js --config ../atlas-growth-extensions-uk-config.json` → `leads_clean_qualified.csv`; then the
   three recoveries over `excluded_officp.csv`; `union-qualified.js` → `leads_qualified.csv` (+`track`), `excluded_maps.csv`.
   **GATE 2: drop-reason audit** — counts per reason + 20 samples each from `not_in_icp` and `off_icp_primary`.
4. Geo gate: `footprint-gate.js` (areas mode; US/IE bleed drops) → `leads_clean_qualified_infootprint.csv`.
5. Dedupe: `build-netnew.js --client clients/atlas-growth` — stop on `ref files used: 0` (supply or waive).
6. Collapse: `collapse-domains.js` → `leads_domains.csv` (spend) / `leads_nowebsite.csv` (STEP 5d) / `leads_annotated.csv` (brand flags).
7. Site text: `fetch-sites.js --concurrency 12` (emails + socials captured; PASS 2 free retry on; Firecrawl residue only on a key + go).
8. STEP 5e: `prep-classify.js` → Haiku per batch with `classify-prompt.md` → `apply-classify.js --fallback unclear` →
   extension_builder = **Qualified**; builder_unconfirmed + unclear = **Review**; the rest = **Exclude**.
9. Owner-finding (STEP 6): `companies-house.js` FIRST (UK registry rung) → `prep-owner-batches.js --ch` → `owner-read`
   workflow → `merge-owner-reads.js --trade-words "building,builders,build,construction,extensions,lofts,loft,conversions,design,developments,renovations"`
   → same-company QA → LinkedIn-restricted sweep (`--registry linkedin.com`, first tranche measured) → `combine-owner-contacts.js`.
10. Emails: on-site harvest (contact pages in `site_l2_keywords`) + `email-waterfall`; verify MV → BB only on an explicit go.
11. Deliverable: assemble (to write, modelled on the pools run's `assemble.js`) → qualified / review / excluded CSVs + summary.
12. Write-back: `IMPROVEMENTS.md` for bugs, `STATE.md`, and a NEW source profile
    `skills/icp-source-planner/library/google-maps--uk-home-extensions.md` (+ `_index.md` line) — seeded from the calibration
    numbers, finished from the full run.

## Gates
- GATE 1 READ-BACK (this file, table above) → operator go before the first API call.
- GATE 2 drop-reason audit after qualify. Coverage summary must be COMPLETE before anything downstream.
- STEP 6a owner prompt: `owner-prompt.md` is in place (`.claude/hooks/guard.py` gate for `owner/`).
- Credits (DataForSEO SERP `--max-cost`, MillionVerifier, BounceBan, Firecrawl) never spent without an explicit go and a cap.

## Log
- 2026-10-11 — scaffold built at the GATE 1 read-back: ICP doc, config + 3 recoveries, runsheet generator (1,770 rows /
  2,124 with `--broad`, 3-row calibration), owner prompt (library + run copy), classify prompt, shard launcher, merge /
  union / pipeline scripts (syntax-checked), 20-row dry-run of the rules (above). Scraper key probe: **Access denied** from
  this container (4 calls). TrustMark register probed keyless (3 calls: trades list, name search, active count 14,160) —
  recorded in the ICP doc's sources table as a Phase 2 candidate, not a spine. FMB find-a-builder: name search only.
