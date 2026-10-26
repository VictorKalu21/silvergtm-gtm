# 2026-10-11_uk-home-extensions-maps — run notes

Client: **Atlas Growth** (confirmed by the operator 2026-10-11) · Vertical: UK residential home-extension contractors
(extensions · loft conversions · garage/basement conversions · design-and-build) · ICP: `../ICP-extensions-uk.md` ·
Config: `../atlas-growth-extensions-uk-config.json` + recoveries `../recover-{baretype,generic}-extensions-uk-config.json`
 · Runsheet: `../atlas-growth-extensions-uk-runsheet.csv` +
`../atlas-growth-extensions-uk-calibration-runsheet.csv` from `../gen-runsheet-extensions-uk.js` (177-tile UK grid imported from
`gen-runsheet-uk.js`) · Shards: `../shards-extensions-uk/shard-0..7.csv` · Owner prompt: `owner-prompt.md`
(= `../owner-prompts/uk-home-extensions.md`) · Classify prompt: `classify-prompt.md`. All data in this folder is gitignored.

## GATE 1 — read-back AGREED 2026-10-11 (operator: "client is atlas, default queries, conservatories out, waive dedupe")

| # | item | decided |
|---|---|---|
| 1 | **Client** | **Atlas Growth** |
| 2 | **Footprint** | whole UK, the validated 177-tile grid (ENG 130 · SCT 25 · WLS 13 · NIR 9; 13 London tiles), zoom 13, areas mode |
| 3 | **Queries** | **default 10** (`house extensions` · `home extensions` · `extension builders` · `loft conversions` · `garage conversions` · `single storey extension` · `double storey extension` · `design and build` · `home renovations` · `basement conversions`) → 1,770 rows |
| 4 | Lever L1 `--broad` | **OFF** (default queries) |
| 5 | Lever L2 conservatories | **OUT** — window installers / glaziers denied on primary; classify tags `conservatory_glazing_only` for a later ship if wanted |
| 6 | Lever L3 keyword-candidates track | OFF (not raised; the name recoveries are the keyword recovery) |
| 7 | Qualify | entity deny → primary deny → name deny → generic-type allow, **no review floor**, + two $0 recoveries (bare-type primary; trade/design primary with an extension/loft/build name) |
| 8 | Designers | EXCLUDED as companies and as people; design-and-build IN |
| 9 | Offer | "We help home extension builders book 10 qualified extension design consultations that turn into build projects every month using Facebook lead generation." (PROPOSED, not objected to) |
| 10 | Target role | MD / Director / Owner / Partner → GM / Ops / Construction Director → Marketing → Sales/Commercial Director |
| 11 | **Dedupe** | **WAIVED** by the operator (feeds not on this container); `pipeline.sh` runs `build-netnew.js` for the record and passes through on `ref files used: 0` |
| 12 | Calibration | **DONE** — below |
| — | **Review floor** | **ZERO** (operator 2026-10-11: "zero review floor") — floor rule removed from the main config and both recoveries; the unrated / low-rated passes deleted as dead code (they exist in commit 030ec1e if a floor ever returns) |
| — | **GO on the full sheet (~5,200 calls)** | **LAUNCHED 2026-10-11** — `bash run-shards.sh`, 8 shards, through the harness background runner |

## Scraper key (2026-10-11)

Operator supplied the key in chat; placed in `skills/google-maps-scrape/.env` (gitignored, `git check-ignore` confirmed) and
validated with ONE curl call through the proxy: `status:"ok"`, first hit *Adam Home Extensions & Building Construction*,
Manchester M20, 31 reviews. The engine's own Node `https` path then bought the calibration below, so the vendor host is
reachable from this container both ways. The earlier `Access denied` was the proxy-injected credential, not the endpoint.
**Rotate the key after the run — it was pasted in chat.**

## Calibration (3 rows, 2026-10-11) — pasted, not remembered

```
[run-scrape] 3 tiles | up to 3 heal passes | hard-fail on unhealable gaps
. cal-eng-london-centre-x0 (house extensions) total-unique=165      pages 3
. cal-eng-manchester-x3 (loft conversions)    total-unique=372      pages 4   (217 on the tile)
. cal-sct-glasgow-x7 (design and build)       total-unique=554      pages 3   (206 on the tile)
API calls: 10 (0 quadrant splits) | Unique businesses: 554 | KEPT (clean): 554 | COVERAGE COMPLETE, 0 heal passes
```

**3.33 calls per runsheet row on three dense city tiles** (the foundation run measured 2.61 across the whole grid, where most
town tiles page once or twice). Review data: 429 rated, 125 blank, 138 under 5; 462 of 554 carry a website.
Primary types on the 554: Construction Company 218 · Home builder 76 · Contractor 40 · Building firm 33 · Architect 25 ·
Architecture firm 20 · Architectural Designer 18 · **Web Designer 13** (dragged in by `design and build`) · Custom home
builder 11 · Interior designer 10 · Roofing Service 9 · Property Developer 6 · General Contractor 6.

### Price of the full sheet

| | rows | calls/row | calls |
|---|---|---|---|
| floor (foundation-run average, 2.61) | 1,770 | 2.61 | ≈ 4,600 |
| ceiling (every tile as dense as the calibration, 3.33) | 1,770 | 3.33 | ≈ 5,900 |
| **plan on** | 1,770 | ~2.9 | **≈ 5,200** |

Plus heal passes (foundation run: 284 failed events re-bought, ~6%) → budget **~5,500 calls** all-in. `--broad` would add
≈ 1,800 (not chosen).

## GATE 2 preview — the rule set over the 554 calibration rows (2026-10-11, `maps/calibration/dryrun2/`)

```
main:    KEEP 208 (38%)  drops {hard_off_icp_type 24, not_in_icp 73, too_small 157, off_icp_primary 91, name_deny 1}
recover-baretype +5 · recover-generic +20 · recover-unrated +40 · recover-baretype-unrated +8 · recover-generic-unrated +9
TOTAL qualified (default levers): 290 of 554 (52%)
lever L4 recover-lowrated would add 73 -> 363 (65%)
remaining drops: {too_small 117, off_icp_primary 67, not_in_icp 55, hard_off_icp_type 24, name_deny 1}
```

Fixes made from the first pass of this preview (all config, no engine change):
- **Web / graphic designers and hairdressers → hard entity deny.** `design and build` returns web-design agencies ("FIZZ designs &
  SEO", 100 reviews; "Maraid Design", 62) and `house extensions` a bedroom-furniture store; `hair extension` reached a
  *Hairdresser*-typed salon through the name only.
- **`remodeller`** (UK spelling, served by Google) joins the bare-type list; **`design+build` / `design + build` /
  `design&build`** join the name tokens ("Richmond Design+Build Ltd" was invisible); **`building consultant`**,
  **`property management company`** and **`roofing service`** join the name recovery's type net ("CK Design & Build Limited |
  Building consultant", 18 reviews, was lost to the primary deny).
- **Two UNRATED variants of the bare-type and name recoveries.** The OPEN engine limitation (IMPROVEMENTS 2026-09-20: a recovery
  sees only the MAIN drop reason) meant a blank-review bare-`Contractor` row ("Mils Development - Loft Conversions &
  Extensions", "Design & Build Scotland Ltd", "Excel Construction") was `not_in_icp`, never `too_small`, so neither the rated
  recovery (floor) nor the unrated pass (scope) could take it: +17 rows on the calibration.

What is left in the drops is correct: `not_in_icp` 55 = 1–3-review or no-website trade rows and a hairdresser-by-brand;
`off_icp_primary` 67 = architecture practices, engineers, interior designers, property developers with no build claim.

### Lever L4 — the review floor (operator decision)

Floor 5 removed **157 of 554 (28%)** on the calibration: 40 unrated-with-website (recovered), 23 unrated-no-website (out),
21 low-rated-no-website (out), and **73 rows with 1–4 reviews AND a live website** — names that read as the ICP
("London Loft Conversions" 1 · "DB Home Extensions" 3 · "S & W Design & Build" 4 · "RDK Design and Build Limited" 3 ·
"Aspire Loft Conversions" 1). This trade has many small or new firms; the foundation run's ghost filter costs more here.
`recover-lowrated-extensions-uk-config.json` takes exactly that band (≥ 1 review + website) and is wired as
`LOWRATED=1 bash pipeline.sh qualify`. **Default OFF until the operator says.** Either way the site-text classify is the
real gate, so the cost of "on" is fetches, not precision.

### Zero floor — the preview re-run (2026-10-11, `maps/calibration/dryrun3/`)

```
main (4 rules): KEEP 365 (66%)  drops {hard_off_icp_type 25, not_in_icp 72, off_icp_primary 91, name_deny 1}
recover-baretype +28 · recover-generic +43
TOTAL qualified: 436 of 554 (78%)   remaining drops {off_icp_primary 57, not_in_icp 35, hard_off_icp_type 25, name_deny 1}
qualified with a website 313 of 365 main rows; 63 main rows carry no review data at all
```

So the Maps stage keeps ~78% of a dense-tile universe; the site-text classify (STEP 5e) is the gate that decides the
list, as the ICP doc says. Expect the fetch volume to scale with that: on a ~25–40k universe, roughly 15–30k rows to
collapse and fetch.

## Pipeline (every step through the engine; commands relative to repo root)
1. Scrape: `bash <run>/run-shards.sh` (8 × `run-scrape.js` over `shards-extensions-uk/`, `RESUME=1` to resume; `CAL=1` = the
   calibration sheet, done) → `maps/shard-N/`. Launch through the harness's background runner.
2. Merge: `node <run>/merge-shards.js` → `maps/leads_clean.csv` + `coverage_summary.json` (must say ALL SHARDS COMPLETE).
3. Qualify: main config → two recoveries → `union-qualified.js` → `leads_qualified.csv` (+`track`),
   `excluded_maps.csv`. **GATE 2: drop-reason audit** on the full universe (counts + 20 samples per bucket).
4. Geo gate: `footprint-gate.js` (areas mode; US/IE bleed drops) → `leads_clean_qualified_infootprint.csv`.
5. Dedupe: waived; `build-netnew.js` runs for the record and passes through.
6. Collapse: `collapse-domains.js` → `leads_domains.csv` (spend) / `leads_nowebsite.csv` (STEP 5d) / `leads_annotated.csv` (brand flags).
7. Site text: `fetch-sites.js --concurrency 12` (emails + socials; PASS 2 free retry on; Firecrawl residue only on a key + go).
8. STEP 5e: `prep-classify.js` → Haiku per batch with `classify-prompt.md` → `apply-classify.js --fallback unclear` →
   extension_builder = **Qualified**; builder_unconfirmed + unclear = **Review**; the rest = **Exclude**.
9. Owner-finding (STEP 6): `companies-house.js` FIRST → `prep-owner-batches.js --ch` → `owner-read` workflow →
   `merge-owner-reads.js --trade-words "building,builders,build,construction,extensions,lofts,loft,conversions,design,developments,renovations"`
   → same-company QA → LinkedIn-restricted sweep (first tranche measured) → `combine-owner-contacts.js`.
10. Emails: on-site harvest + `email-waterfall`; verify MV → BB only on an explicit go.
11. Deliverable: assemble (to write, modelled on the pools run's `assemble.js`) → qualified / review / excluded CSVs + summary.
12. Write-back: `IMPROVEMENTS.md`, `STATE.md`, NEW source profile `skills/icp-source-planner/library/google-maps--uk-home-extensions.md`
    (+ `_index.md` line), seeded from the calibration, finished from the full run.

## Gates
- GATE 1 READ-BACK: agreed 2026-10-11 (table above). **GO on the full sheet: pending.**
- GATE 2 drop-reason audit after qualify. Coverage summary must be COMPLETE before anything downstream.
- STEP 6a owner prompt: `owner-prompt.md` in place (`.claude/hooks/guard.py` gate for `owner/`).
- Credits (DataForSEO SERP `--max-cost`, MillionVerifier, BounceBan, Firecrawl) never spent without an explicit go and a cap.

## Log
- 2026-10-11 — scaffold at GATE 1; 20-row synthetic dry-run 20/20; scraper key probe `Access denied` (proxy credential);
  TrustMark register probed keyless (Phase 2 candidate, ICP doc); FMB find-a-builder name search only.
- 2026-10-11 — operator read-back: atlas · default queries · conservatories out · dedupe waived; key supplied, placed in `.env`,
  validated (1 call). **Calibration 10 calls / 554 unique / 3.33 calls per row.** GATE 2 preview 290 of 554 (52%) after
  config fixes (web designers, hairdressers, `remodeller`, `design+build`, building consultant, unrated recovery variants);
  lever L4 built (73 rows on calibration). Full sheet priced ~5,200 calls (4,600–5,900). Awaiting go.
- 2026-10-11 — operator: **zero review floor**. Floor removed everywhere, unrated/low-rated passes deleted; preview 436 of 554 (78%).
  **FULL SCRAPE LAUNCHED** (8 shards, `run-shards.sh`, background). Next: `pipeline.sh` once `coverage_summary.json` says ALL SHARDS COMPLETE.
- 2026-10-11 — **SCRAPE DONE: 4,060 calls (2.29/row, under the 4,600 floor), 41,689 unique, 0 unhealed tiles, all 8 shards COMPLETE.** Per-query yield (rows summed over tiles): home renovations 31,763 · extension builders 27,886 · design and build 27,473 · loft conversions 25,301 · home extensions 16,167 · garage conversions 13,849 · house extensions 7,195 · basement conversions 6,358 · **single storey extension 263 · double storey extension 177 (thin; ~680 calls for ~440 rows — drop next time)**. Qualify: 25,480 (61%; main 21,151 + bare-type 2,612 + name 1,717) → geo 24,065 (1,400 far_from_hubs, 15 wrong_country) → dedupe waived + **568 blank-address UK recoveries** (`recover-blank-address.py`, the OPEN centroid issue) = 24,633 → dedupe waived → collapse **17,070 owner-finding rows + 6,593 no-website**. **GATE 2 audit in `GATE2.md`** — drops read correctly (not_in_icp = roofers, kitchen/bathroom renovators, contractor lodging, carpenters, decorators; off_icp_primary = architects, engineers, merchants, kitchen fitters). **STOPPED AT GATE 2** — next on the operator's nod: `bash pipeline.sh fetch` (17,070 sites, $0, hours) → `classify-prep`.
- 2026-10-26 — **fetch pass 1 (17,070 domains, 13,287 ok, 63% with an on-site email) was LOST job-side**: my merge of the
  transient re-fetch (`owner_retry/`, 850 rows → 230 ok) opened `owner/site_text.jsonl` for writing and then failed to encode
  one page's lone-surrogate character, so the file was truncated to zero before a byte was written. Not an engine bug — a
  job-side script mistake. Rule for every merge from now on: build the output in a temp file (`errors='surrogatepass'` or
  `ensure_ascii=True`) and rename over the original. Re-fetch of all 17,070 launched with `--max-old-space-size=8192` (which
  also lets the engine's own PASS 2 retry survive the end-of-run `JSON.stringify`, IMPROVEMENTS 2026-10-26). The classify
  batches (`classify/batch_*.jsonl`, 185 for tiers A+B, prepared from pass 1) are unaffected and keep running; tiers are
  re-derived after the re-fetch and any row that newly lands in A/B is read as an extra batch.
- 2026-10-26 — **STEP 5e classify, tiers A+B DONE: 185 batches (11,074 leads), every output validated against its input (0 bad files).**
  Verdicts: **extension_builder 8,026 (72% of A+B)** · builder_unconfirmed 1,283 · trade_only 825 · commercial_only 357 ·
  design_only 189 · not_builder 139 · new_build_only 134 · conservatory_glazing_only 83 · unclear 38. Tier A ran 80–95%
  extension_builder per batch; tier B (the last ~22 batches) ran 0–15% — the vocabulary tier is doing its job. Tier-D
  100-row false-negative sample: **0 extension_builder of 100** (trade_only 33 · builder_unconfirmed 28 · not_builder 15 ·
  unclear 11 · rest 13). `apply-classify.js --fallback unclear` → `leads_classified.csv` (17,070 rows: 8,026 Qualified now;
  5,945 `unclear`, of which 5,896 are the fallback for tier D-rest (632) + tier F (5,264) awaiting the re-fetch).
  Spot-check of 12 random extension_builder verdicts: every evidence quote is a genuine build phrase ("We build single and
  double-storey rear extensions", "loft conversion and extension specialist"). work_types on the 8,026: renovation 6,053 ·
  loft 4,524 · new build 3,203 · rear/side 2,437 · garage 2,053 · design-and-build 1,568 · double storey 1,028 · kitchen 617 ·
  orangery 549 · basement 541. Next (after the re-fetch lands): re-tier, read tier D-rest (632) + any row newly in A/B,
  re-apply; then Companies House (needs `COMPANIES_HOUSE_KEY`) → owner read.
- 2026-10-26 — **re-fetch DONE (17,070 domains, 13,526 ok, 10,997 with an on-site email) → re-tier A 9,970 / B 1,317 / D 745 / F 5,038 →
  916 rows still unread (D-rest 635 + newly-texted A 250 / B 31) → `classify2/` 16 batches, all 16 validated (every place_id, 0 bad files):
  extension_builder 216 (24%) · trade_only 270 · builder_unconfirmed 126 · unclear 128 · not_builder 72 · commercial_only 43 ·
  new_build_only 31 · conservatory_glazing_only 26 · design_only 12 — the tier-D remainder reads as the FN sample said (mostly trades).
  `classify/all_out/` = 185 A+B + 2 D-sample + 16 c2_ files; `apply-classify.js --fallback unclear` re-run → `leads_classified.csv`
  17,070 rows, 12,090 LLM verdicts: **extension_builder 8,242 (Qualified) · builder_unconfirmed 1,437 (Review) · unclear 5,157
  (Review; 4,980 = fallback = no site text, checked against `owner/site_text.jsonl`, 177 read-but-unclear) · excluded 2,234**
  (trade_only 1,118 · commercial_only 405 · not_builder 226 · design_only 204 · new_build_only 169 · conservatory_glazing_only 112).
  **STEP 5e COMPLETE.** Next: `assemble.js` (deliverable) → Companies House (BLOCKED: no `COMPANIES_HOUSE_KEY` in the skill `.env`) → owner read.
- 2026-10-26 — **DELIVERABLE ASSEMBLED** (`assemble.js`, self-test 9/9; `build-xlsx.py` → `deliverable/extension_builders.xlsx`, 6 tabs, gitignored):
  40,562 unique collected → Maps-stage excluded 16,209 → 24,353 reached the site gate → **Qualified 8,567** (A 937 · B 3,495 · C 4,135;
  main 7,678 · bare-type 591 · name 298) · Review 13,447 (no website 5,800 · no usable text 5,963 of which 1,482 are HTTP-200 header-only
  shells · builder_unconfirmed 1,502 · unclear 182) · site-text excluded 2,339 · in-run dupes 279. Fill on Qualified: phone 97.4% ·
  email 91.9% (on-site, unverified) · facebook 56% · postcode 74.5% · owner 0%. **2,174 Qualified rows have no address at all
  (service-area listings) → `backfill-city-nearest-metro.js` before any personalised send.** Two job-side rules found while assembling
  (both in the source profile): status `ok` with header-only text is tier F, not "no classify verdict"; sibling site text is reached via
  `rep_place_id`, `domain_siblings.json` is keyed rep → siblings. Source profile written:
  `skills/icp-source-planner/library/google-maps--uk-home-extensions.md` (+ `_index.md`).
  **BLOCKED on STEP 6: `companies-house.js` needs `COMPANIES_HOUSE_KEY` in `skills/google-maps-scrape/.env` (free, developer.company-information.service.gov.uk).**
  Also pending a go: Firecrawl/Playwright render residue (1,482 shells + 1,309 403s), DataForSEO website recovery for the 5,800 no-website rows, MV/BB verify.
