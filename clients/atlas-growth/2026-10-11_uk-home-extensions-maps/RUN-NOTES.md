# 2026-10-11_uk-home-extensions-maps — run notes

Client: **Atlas Growth** (confirmed by the operator 2026-10-11) · Vertical: UK residential home-extension contractors
(extensions · loft conversions · garage/basement conversions · design-and-build) · ICP: `../ICP-extensions-uk.md` ·
Config: `../atlas-growth-extensions-uk-config.json` + recoveries `../recover-{baretype,generic,unrated,baretype-unrated,generic-unrated}-extensions-uk-config.json`
(+ `../recover-lowrated-extensions-uk-config.json`, lever L4) · Runsheet: `../atlas-growth-extensions-uk-runsheet.csv` +
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
| 7 | Qualify | as built (entity deny → primary deny → name deny → generic-type allow → floor 5) + five $0 recoveries |
| 8 | Designers | EXCLUDED as companies and as people; design-and-build IN |
| 9 | Offer | "We help home extension builders book 10 qualified extension design consultations that turn into build projects every month using Facebook lead generation." (PROPOSED, not objected to) |
| 10 | Target role | MD / Director / Owner / Partner → GM / Ops / Construction Director → Marketing → Sales/Commercial Director |
| 11 | **Dedupe** | **WAIVED** by the operator (feeds not on this container); `pipeline.sh` runs `build-netnew.js` for the record and passes through on `ref files used: 0` |
| 12 | Calibration | **DONE** — below |
| — | **Lever L4 low-rated floor** | **OPEN QUESTION** (surfaced by the calibration, numbers below) |
| — | **GO on the full sheet (~5,200 calls)** | **PENDING** |

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

## Pipeline (every step through the engine; commands relative to repo root)
1. Scrape: `bash <run>/run-shards.sh` (8 × `run-scrape.js` over `shards-extensions-uk/`, `RESUME=1` to resume; `CAL=1` = the
   calibration sheet, done) → `maps/shard-N/`. Launch through the harness's background runner.
2. Merge: `node <run>/merge-shards.js` → `maps/leads_clean.csv` + `coverage_summary.json` (must say ALL SHARDS COMPLETE).
3. Qualify: main config → five recoveries (+ L4 when `LOWRATED=1`) → `union-qualified.js` → `leads_qualified.csv` (+`track`),
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
