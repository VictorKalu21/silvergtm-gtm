---
name: google-maps-scrape
description: Build an accurate, deduped local-business list from Google Maps (scraper.tech) for ANY country, then QUALIFY it down to an ICP with a config-driven rule set (size/reviews/category/claimed/chains), and optionally (Phase 2) find each business's owner/decision-maker from its website + Google search. For cold-outbound / lead-sourcing jobs scoped to a geographic footprint + ICP. Use when asked to scrape Google Maps, build OR qualify/filter a local lead list per business type/area, apply size or quality filters to a scraped list, source businesses for a campaign, or find owner names for scraped businesses. ALWAYS resolve geography + qualification rules with the user before building the run matrix.
---

# Google Maps scrape + qualify (scraper.tech)

Turn an ICP + a geographic footprint into a clean, deduped, footprint-filtered, **rule-qualified** business list ready for enrichment (Clay). The hard part is **completeness per category**, **getting the geography right**, and **qualifying the universe down to the ICP** — so geography + qualification rules are settled with the user first, before any matrix is built.

**Engine vs config.** The scripts are a fixed engine; everything client/vertical/geo-specific lives in `<client>-config.json` (a `geo` block, `qualify_rules`, `owner_query`). Never edit a script to tune a job — change the config. Works for any country and any ICP.

**Client workspace.** All client work lives under ONE agency client root — (`C:\Users\victo\db2b\<client>\` on the original author's machine — on ANY machine, confirm the client root with the operator ONCE, then reuse it for every job). A client folder holds: `<client>-config.json` + runsheets (and their `gen-*.js` generators), the client's ICP doc, dated run folders (STEP 4), `owner-prompts/`, `_archive/`, and **`STATE.md`** — the client's current campaign/pipeline state (update it whenever a run ships; see Self-improvement protocol). The skill folder holds ONLY the engine — nothing client-specific is ever written here.

## Core principle

Google Maps search is viewport-bound: one search = one `lat/lng + zoom`, capped at ~100 prominent results, and `offset` pagination is broken on this API. **Completeness comes from tiling tighter zooms across the footprint and deduping on `place_id`, not from one big search.** See `runbook.md` for the full API mechanics.

The scrape builds the *universe + geo + activity signals*. Owner name, email, employee count, and founding date are NOT on Google Maps — those are Clay's job downstream.

## STEP 1 — Resolve the geography FIRST (do not build the matrix yet)

Use `AskUserQuestion` to lock these before anything else. The geography decisions change every query coordinate, so they come first:

0. **Which client is this for? (ALWAYS ASK FIRST.)** Every run lives under that client's folder (`<client>/`) and MUST be deduped against ALL of the client's prior sub-scrapes before enrichment (STEP 5c). The client identity is the **dedupe scope** — dedupe is per-client, never global and never skipped. Never run a sub-scrape without knowing the client.
1. **Footprint — which cities/areas?** Get the explicit list.
2. **Fuzzy edges — for any large area named as "relevant parts of X," which sub-areas count?** Offer tight (core only) vs wide. Resolve the footprint explicitly into one of: a **postal-code allowlist** (`geo.footprint.mode:"postal"` — US ZIP exact-match, or UK/intl postal-area prefixes via `postal_match:"prefix"` + a `postal_regex`/`postal_group`), or **named areas** (`mode:"areas"` — the run-sheet tiles define the footprint, no postal filter). Also lock `geo.country`.
3. **ICP business types** — the list of categories to target.
4. **Exhaustiveness vs speed** — primary categories only, or include overlap/secondary categories too? How aggressively to densify dense areas.
5. **Qualification rules** — the `qualify_rules` for this ICP: website required? exclude corporate/chains (brand blocklist)? **minimum reviews / size floor** (the key size lever — e.g. `review_count >= 15` to drop sole traders)? minimum rating? claimed-only? category allow/deny? Each becomes one declarative rule (STEP 5b). Deeper size signals (employee count) are `enrich_rules`, applied after Clay.
   **Review floors are for CONSUMER-facing ICPs only** (restaurants, med-spas, home services, local retail — where review volume genuinely tracks size). Business clients almost never leave Google reviews, so for B2B / professional-services ICPs (accountants, tax firms, commercial security, FM) a review floor drops the MAJORITY of real firms — a solid 15-person CPA firm routinely sits at 3–4 reviews. Gate "established/real" for B2B at the Clay stage instead: `years_in_business >= 3` + not-solo-operator + real website. Gate on the ICP's **buyer**, not the industry label (residential locksmith = reviewed; commercial security = not).
   **Government deny:** if the queries can surface public institutions (distress/institutional intent — "IRS tax help", "tax debt relief", civic categories), ALWAYS include a gov deny: name `not_contains_any` [internal revenue service, department of revenue, assessor, treasurer, collector of revenue, comptroller, city of, county of, municipal, clerk of court, social security] + a `google_types` deny for government/police offices.
6. **Downstream use** — which fields matter for the campaign's personalisation variables (so we confirm they're captured).
7. **The offer — one line on what's being sold to these businesses.** This is what makes a role a decision-maker, so it's required input to the STEP 6a prompt generator (e.g. "a healthcare sponsorship" keeps the office manager; "a wholesale parts supply deal" keeps the parts manager that another offer would exclude).
8. **Target role — WHO at the business are we trying to reach?** The decision-maker for the offer (e.g. owner/partner OR office manager for a healthcare sponsorship; owner/dealer-principal, GM, marketing mgr, sales mgr for high-ticket retail). This drives the owner-finding KEEP/EXCLUDE buckets, so it must be settled here and **written into the client's ICP doc** — never left implicit. A non-technical operator can't infer it later.

Only once geography + categories + DQ rules + offer + target role are confirmed, proceed.

## STEP 0 — Inventory the operator's skills before improvising anything

This skill covers scrape → qualify → owner-finding → Clay feed. It does **not** cover everything a
run touches, and the operator keeps sibling skills that do. **Before writing any script for a
capability this skill lacks, `ls skills/` and read every skill whose description overlaps.** Known
overlaps — reach for these, do not rebuild them:

| need | skill | do not |
|---|---|---|
| a page 403s / Cloudflare / "blocked"; choosing a fetch method; finding a hidden JSON API; a free or paid SERP | `web-scrape-triage` | pay for a SERP key, write a nav-stripper, or declare a page unfetchable before walking its ladder |
| verifying emails before any send | `email-verify-debounce-bounceban` (runner in `scripts/`) | design a verification waterfall or ask for a key it already has a home for |
| resolving a business name to its real domain | `name-to-domain` | domain-guess |
| deciding where a vertical's leads even live | `icp-source-planner`, `directory-lead-sourcing` | assume Maps is the only source |

Why this step exists: on the Atlas Growth run (IMPROVEMENTS.md, "Session review") two SERP plans
were bought, a nav-pruner and an email waterfall were written from scratch, and 7 pages were written
off as unreachable — every one of which a sibling skill already covered. "I did not know it existed"
is a process failure; the skills are one directory listing away.

## STEP 2 — Map ICP types to Google's native categories

Query Google's taxonomy, not the ICP label. One ICP type → one or more Google category terms (e.g. Dental → `Dentist`, `Cosmetic dentist`, `Pediatric dentist`; Veterinary → `Veterinarian`, `Animal hospital`). Dedup on `place_id` later absorbs the heavy overlap between terms.

## STEP 3 — Build the config + run sheet

- **`<client>-config.json`** — three blocks: **`geo`** (country + footprint + region), **`qualify_rules`** (the ICP filter — STEP 5b), **`owner_query`** (STEP 6 cascade). Schema:
  ```jsonc
  { "geo": { "country":"gb",
             "footprint": { "mode":"postal", "postal_allow":["M","SW","B"], "postal_match":"prefix",
                            "postal_regex":"([A-Z]{1,2}\\d[A-Z\\d]?)\\s*\\d[A-Z]{2}", "postal_group":1 },
             "region_from_city": null, "region_default":"UK", "area_label": { "M":"Manchester" } },
    "categories": { "field_service":["Electrician","Roofing contractor"] },
    "qualify_rules": [ {"field":"website","op":"exists"},
                       {"field":"name","op":"not_contains_any","value":["<chains>"],"label":"chain"},
                       {"field":"google_types","op":"allow","per_icp":true,"value":{"field_service":["electric","roof"]}},
                       {"field":"google_types","op":"deny","value":["supply store"]},
                       {"field":"review_count","op":">=","value":15,"label":"too_small"} ],
    "enrich_rules": [ {"field":"employee_count","op":">=","value":5,"stage":"enrichment"} ],
    "brand_families": { "Groundworks":["groundworks","alpha foundations"] },
    "owner_query": { "bias_terms":["owner","managing director"], "use_linkedin":true } }
  ```
  `brand_families` (optional) is the STEP 5c-dom brand flag: label → lowercase substrings matched against `<name> <root_domain>`. `geo.footprint.mode` is `postal` (US ZIP `postal_match:"exact"`, or UK/intl `"prefix"` with a `postal_regex`/`postal_group` capturing the area code) or `areas` (no postal filter — tiles define the footprint). `geo.region_from_city` is a regex pulling a region/state token from each lead's `city` (US `",\\s*([A-Z]{2})\\b"`; `null` for regionless geos like the UK, with `region_default` as fallback) — used by the STEP 6 cascade. The config is **engine-neutral**: scripts read it; nothing client/country-specific is hardcoded.
- **run sheet CSV** (`cell_id,icp_type,query,lat,lng,zoom,priority`): one row per `category × tile center`. Place a tile center on each named sub-area at `zoom 13`; mark primary categories `P1`, secondary `P2`. Generate it programmatically to avoid typos. `scrape.js` auto-splits any tile that saturates, so you do not need a fine grid up front.
- **Read-back before spending:** the config and run sheet are authored by reasoning, not a generator (geo tiling + fuzzy-category mapping can't be templated). Before running STEP 4, state back to the operator the **footprint (ZIP count + cities), the categories, and the tile count** so a wrong city/area is caught before any API call is spent. The two mistakes this guards against are then also self-corrected downstream — coverage gaps by STEP 5's gap loop, bad category mapping by STEP 5b's qualify gate.

## STEP 4 — Run

**One DATED folder per scrape.** Every scrape run gets its own folder inside the client folder, named **`<client>/YYYY-MM-DD_<vertical>/`** (e.g. `solvex/2026-06-25_uk-electrical/`, `db2b/living-north-phoenix/2026-06-26_icp1b-healthcare/`). Route ALL of that run's outputs there — never write job artifacts back into the skill folder. This keeps each run's leads, qualified list, owner run, and owner-prompt together, dated, and auditable. Two sibling folders are reserved per client (not scrape runs): **`<client>/owner-prompts/`** (the per-vertical prompt library — see STEP 6a) and **`<client>/_archive/`** (dead/superseded runs — see "Run hygiene" below).

**Run hygiene — keep the working view clean (do this at the end of every run):**
- Keepers stay in the dated run folder: `leads_clean*.csv`, `clay.csv`, `excluded.csv`, `coverage_report.json`, `run_log.json`, `owner/`, `owner-prompt.md`, the runsheet, the config.
- **Sweep dead/intermediate artifacts** to `<client>/_archive/<date>/` (or a `…_intermediate/` subfolder there): empty/already-merged `heal-*` dirs, `gap*` workspaces, `*_merged*.csv` partials, `*_raw.json` blobs (regenerable by re-scrape), abandoned attempts, pilots.
- **Superseded prior runs** (an older list now replaced) → move the whole folder to `<client>/_archive/<date>/`. Archive, don't hard-delete — these are client deliverables and the cost of a wrong delete outweighs the disk. (A canceled run is dead the moment it's abandoned — archive it then, don't let it accumulate.)

**Multi-job batches (several countries/verticals in one go): drive them with `run-batch.js`, never an inline shell loop** — `node run-batch.js --batch <batch.json>` where batch.json = `[{id, runsheet, config, out}, …]`. It persists the job list + a machine-readable `_batch_state.json` (survives a closed terminal — resume by re-running the same command), re-queues any job that exits non-zero OR produces 0 rows (an API outage must not silently zero a country), and skip-guards jobs whose `leads_clean.csv` already has rows. Exit 0 = every job has data.

**ALWAYS run via the self-healing wrapper `run-scrape.js`, not `scrape.js` directly:**
```
node run-scrape.js --runsheet <client>-runsheet.csv --config <client>-config.json --out <client>/<subscrape-slug> [--max-retries 3] [--stall 30]
```
Key is read from `.env` (`SCRAPER_TECH_KEY`). Outputs: `leads_clean.csv` (healed + deduped), `excluded.csv`, `leads_raw.json`, `run_log.json`, **`coverage_report.json`**.

**Why the wrapper is mandatory (do not skip it):** `scrape.js` SWALLOWS API failures — on a network drop it resolves a tile with empty data and a `status` flag (`error`/`timeout`/`failed`/`parse_error`) instead of throwing, then finishes with a normal RUN SUMMARY. In `areas` mode there is NO coverage alarm, so a dropped connection becomes a silent hole that ships looking complete. This is not hypothetical: it cost a 2-day SolveX recovery (75% UK coverage lost + all of Northern Ireland missed even by careful manual healing, because intermittent single-tile failures don't look like a frozen counter). `run-scrape.js` fixes this WITHOUT editing `scrape.js`: it runs the scrape, audits `run_log.per_cell[].status`, and AUTO-REFILLS every tile that never reached `status:'ok'` — looping up to `--max-retries`. It also prints a live STALL warning when `total-unique` freezes mid-run. **Exit 0 = `coverage_report.json` says COMPLETE (every tile ok); exit 1 = INCOMPLETE (lists the unhealed tiles) — when it exits 1, DO NOT run qualify/Phase 2 on the list; re-run when the connection is stable.** Gate downstream steps on exit 0.

## STEP 5 — Calibrate

Read `run_log.json`. **Do this automatically — do not ask a non-technical operator to judge coverage; close the gaps yourself, then report.**
- **`coverage_report.json` (from `run-scrape.js`) is the source of truth for tile-level completeness in BOTH modes** — it's what closes the `areas`-mode gap that `footprint_codes_with_no_results` leaves as `n/a`. If the wrapper exited 0 (COMPLETE), tile coverage is already healed; just sanity-check `empty_but_ok_centers` (genuinely business-free vs. suspicious). If it exited 1 (INCOMPLETE), it could not heal the listed tiles — fix the connection and re-run; do not proceed.
- **`footprint_codes_with_no_results`** = postal-code coverage gaps (postal mode only; `areas` mode reports `n/a` — rely on `coverage_report.json` there). **Loop:** for each gap code add a run-sheet row centered on its centroid (zoom 14), re-run those rows into the set, re-read the gap list, and repeat until it's empty or only genuinely business-free codes remain. Only then proceed.
- **`quadrant_splits`** confirms dense tiles auto-densified. If a split tile still returns near `limit`, lower zoom further for that cell.
- Sanity-check kept vs excluded counts and spot-check 5–10 rows.

## STEP 5b — Qualify by rules (REQUIRED before owner-finding / Clay)

The scrape only gates on footprint+open, so `leads_clean.csv` is the **universe**, not the ICP. Two reasons it's off-ICP: Google category search is **fuzzy** ("Car dealer" returns repair shops, parts, U-Haul; "Roofing contractor" returns one-van sole traders), and category alone doesn't capture **size/quality**. Qualify the universe down with the config's `qualify_rules` before spending any owner-finding/Clay credits.

```
node qualify-leads.js --in <out>/leads_clean.csv --config <client>-config.json --out <out>
```
Each rule is `{field, op, value, …}` ANDed over the captured fields (`google_types, website, review_count, rating, is_claimed, name, …`); the **first failing rule** drops the lead with an auditable `drop_reason`. Operators: numeric `>= <= > < == !=`, `exists`/`not_exists`, `in`/`not_in`, `contains_any`/`not_contains_any`, and category `allow`/`deny` on `google_types` (`allow` supports `per_icp`; `deny` matches the primary type). This is where ICP precision lives:
- **size floor** (the sole-trader lever): `{"field":"review_count","op":">=","value":15}`.
- **chains**: `{"field":"name","op":"not_contains_any","value":[…]}`.
- **category allow/deny**, **website-required**, **claimed-only**, **rating floor** — one rule each.
- **Author allow-lists against `google_types` (matches ANY tag), never `primary_type`.** Google mis-primaries real ICP firms (`Consultant | Certified public accountant` fails a primary-only allow); switching to `google_types`-any recovered hundreds of real firms per vertical at $0. Know the asymmetry: `deny` matches the PRIMARY type by default (opt in per-rule with `"scope":"any"` for unambiguous must-drop entities — gov/police/directories hiding behind a generic primary). A secondary-type deny does NOT fire by default, so also put must-drop offenders in a NAME deny (exact, always fires).

Rules tagged `stage:"enrichment"` (or referencing a non-Maps field like `employee_count`) are skipped here — they're `enrich_rules`, applied AFTER Clay. Deterministic, $0, no re-scrape. Outputs `leads_clean_qualified.csv` (the real list) + `excluded_officp.csv` (with `drop_reason`, so the drops are auditable). Spot-check the drop reasons; tune rules with the client.

## STEP 5b-geo — Footprint gate (areas mode, REQUIRED before dedupe)

`qualify_rules` gate on type/reviews, **not geography** — and in `areas` mode `searchmaps.php` expands its radius to fill ~100 results while service-area pins ignore tile bounds, so the qualified list bleeds in businesses from non-targeted, excluded, or even **cross-border** metros (a `country=us` run once returned London UK; a 47-metro US run that excluded TX+NY came back 27–41% out-of-footprint). Nothing else catches this. So after qualify and **before** cross-run dedupe, gate on geography:
```
node footprint-gate.js --in <out>/leads_clean_qualified.csv --runsheet <client>-runsheet.csv --config <client>-config.json --out <out> [--hub-radius-deg 1.0] [--regions "TX,NY"]
```
Drops any lead (a) farther than `--hub-radius-deg` (default 1.0° ≈ 111km) from EVERY tile center in the run sheet — SKIPPED under `--keep-domestic` (client wants all in-country volume; only foreign pins drop — do NOT combine with `--regions`, whose filter still runs and would drop in-country leads) or `geo.sparse_geo: true` (large sparse countries where legit leads sit far from the few named hubs), (b) whose LAST address token IS a recognized foreign-country name (inverted blocklist — robust to geos whose addresses end in the city with no country token; the old "≠ target" logic falsely nuked those), and (c) — only when `geo.region_from_city` + `--regions` are supplied — whose state/region token isn't in the allow set. Outputs `leads_clean_qualified_infootprint.csv` (the geo-clean list) + `excluded_geo.csv` (auditable `drop_reason`) + `footprint_gate_report.json`. 1.0° cleanly keeps target-metro cores + suburbs and drops neighbouring metros/countries (tested: kept LA core, dropped LA-at-1.05°/Chicago/NYC/Windsor ON/London UK). Runs in BOTH modes; it is the ONLY geo gate for `areas` mode. **All downstream steps run on `leads_clean_qualified_infootprint.csv`.**

## STEP 5c — Cross-run dedupe vs the client's prior runs (MANDATORY, per client)

**A new sub-scrape ALWAYS overlaps the client's earlier runs.** The same business is tagged under many `google_types`, so even a "new categories only" run re-pulls businesses already captured (LNP's healthcare-1b was **35% dupes** of the already-LIVE ICP-1 list). Re-contacting a lead that's in another campaign burns the relationship and the sending domain. So before any owner-finding/Clay, dedupe on `place_id` against EVERY prior run of THIS client (STEP 1.0):
```
node build-netnew.js --new <out>/leads_clean_qualified_infootprint.csv --client <client-dir> --out <out>/leads_netnew.csv
```
(input is the geo-gated file from STEP 5b-geo, not the raw qualified list)
`--client` auto-discovers every prior `*.csv` with a `place_id` column under the client folder (skipping this run's own folder + `_archive`), and drops any `place_id` already seen. Key = `place_id` (stable across runs); website host is a secondary key. **The client folder's prior CSVs ARE the dedupe memory.** When `build-netnew.js` runs, it prints `ref files used: N | prior place_ids: M | new: …` — if this client has been run before but N = 0 (fresh machine, moved folder, wrong root), **STOP — do not proceed to owner-finding/Clay.** A missing history means re-contacting leads already sitting in live campaigns. Recover the client folder from whoever ran it last; only treat `ref files used: 0` as valid for a genuinely brand-new client. **No-website leads are KEPT** (they can't have been captured-with-a-website before — they feed the no-website recovery track: user runs a website-finder while `search-owner.js` finds the decision-maker; a domain + a contact = a recovered net-new email lead). **`leads_netnew.csv` is the deduped list; STEP 5c-dom splits it into the owner-finding spend file and the recovery track before anything is paid for.** Dedupe is per-CLIENT — never global, never skipped.

## STEP 5c-dom — Collapse domains + route shared hosts (REQUIRED, before any owner-finding spend)

Every branch of one brand shares one website, and every site-keyed source returns the same answer for all of them — so N branches = N paid lookups for 1 result (measured elsewhere: 109 locations on one domain → 43 distinct answers, 66 paid twice). And a lead whose "website" is `facebook.com/…`, `sites.google.com/…`, `*.wixsite.com`, `g.page/…` (see **`shared-hosts.js`** — the ONE shared-host list; grow it there) has no site of its own: nothing to fetch, and grouping by that domain would make 400 Facebook-only firms one company.
```
node collapse-domains.js --in <out>/leads_netnew.csv --out <out> [--config <client>-config.json]
```
It classifies every row's website (`site` / `shared_host` / `none`), groups `site` rows by ROOT domain (subdomains collapse: `houston.groundworks.com` = `groundworks.com`; `co.uk`-style suffixes handled), picks one representative per domain (most reviews), and writes:
- **`leads_domains.csv`** — representatives only → the ONLY file fed to `fetch-sites.js` / `search-owner.js`. This is the spend.
- **`leads_nowebsite.csv`** — `none` + `shared_host` rows → the STEP 5d recovery track.
- **`leads_annotated.csv`** — ALL rows + `website_class, root_domain, location_count, is_multi_location, brand_family, rep_place_id` → the `--leads` spine for `build-clay-csv.js`, so every branch still ships as its own row. Row count never changes; only the spend collapses.
- **`domain_siblings.json`** — sibling → representative map; `build-clay-csv.js --siblings` fans the representative's text out to its siblings (`fanned_from` column records provenance).
- `collapse_report.json` — `spend_rows_saved` = paid lookups this step removed.

`location_count` / `is_multi_location` is a **free chain signal** (honest limit: it sees multi-branch presence WITHIN the scraped footprint, not national franchise status — a brand in one of your cities is not flagged). `brand_family` labels rows from the client's `brand_families` config. Together they are the "keep everything, flag the brand" flag — a name blocklist is no longer the only lever. **Design choice, stated:** collapsing a PE roll-up drops the per-branch SERP by design. The corporate site names corporate leadership, who are the same across all branches and the only people who can authorize a vendor anyway; a branch GM at a roll-up cannot. Independents (1 domain = 1 `place_id`) are untouched.

## STEP 5d — No-website recovery (REQUIRED, auto — ships WITH the main track)

No-website leads are NOT dead — they're a recovery track worth ~15–40% of net-new volume, and a standing agency rule. Left implicit it gets silently skipped, so run it automatically, same "do it then report" posture as 5c:
1. The recovery input is **`<out>/leads_nowebsite.csv` from STEP 5c-dom** — every row with an empty `website` **OR a shared-host website** (`facebook.com/…`, `*.wixsite.com`, `g.page/…` — `website_class` says which). A Facebook-only contractor used to pass the `website exists` rule and ride the with-website track, where `fetch-sites` got nothing from it; it belongs here, where the website-finder runs. Already deduped (5c ran first) — no second `build-netnew` pass.
2. **Auto-run** `node search-owner.js --leads <out>/leads_nowebsite.csv --config <client>-config.json --out <out>/owner_nowebsite` (finds the decision-maker via SERP without needing a domain). **Tell the operator to run their website-finder in parallel** — that's their step.
3. When domains come back, `node fetch-sites.js` on the recovered domains → merge into the Clay feed.

The with-website and recovery tracks ship **together** — recovery is MANDATORY/auto, not optional. **Two gotchas:** (a) if the client narrows scope mid-run (e.g. "drop insurance"), filter BOTH tracks, not just the primary; (b) no-website leads were extracted at the website rule so they NEVER saw the chain/deny qualify rules — **re-run the chain/deny qualify on the MERGED final list before `build-clay-csv`**, or a blocklisted chain (e.g. Wells Fargo Advisors) rides in through the recovery track.

## STEP 6 — Phase 2: Owner-finding (optional, before Clay)

Instead of paying Clay credits to identify owners, run the scripted owner-finder — it gets the owner name + verbatim proof for ~$0 (Haiku on pre-scraped text). **84% hit rate on the LNP ICP-1 pilot, 0 fabrications.** Full guide in **`owner-finding.md`**.

### STEP 6a — Build the decision-maker prompt for THIS sub-scrape (REQUIRED — gated)

**A sub-scrape's `clay.csv` is NOT shippable until `<client>/<subscrape-slug>/owner-prompt.md` exists and passes the per-vertical checklist.** The prompt is built **per vertical, every time** — it is never a static or copied file. `build-clay-csv.js` enforces this: it **refuses to build** (`exit 1`) if `owner-prompt.md` is missing next to the output `clay.csv` (escape hatch: `--no-prompt-ok`, only for a deliberate prompt-less build).

**Why per-vertical (not boilerplate):** the EXCLUDE/support roles are where verticals genuinely differ and where the small model goes wrong — it will output a `roofer`/`electrician`/`hygienist`/`salesperson` as the "owner" if the prompt isn't reasoned for the actual trade. A wrong owner is worse than no owner.

**BUILD ONCE PER VERTICAL, THEN REUSE — do not rebuild.** Each client keeps a prompt library at **`<client>/owner-prompts/<vertical>.md`** (the offer is client-specific, so prompts are keyed by client). Before building anything:
- **If `<client>/owner-prompts/<vertical>.md` already exists → REUSE it.** Copy it into the run folder as `owner-prompt.md` (`cp <client>/owner-prompts/<vertical>.md <client>/<run>/owner-prompt.md`). Do NOT rebuild it. (Only revisit a library prompt if the offer/target-role for this client actually changed.)
- **If it does not exist → build it once** (steps below), save it to BOTH `<client>/owner-prompts/<vertical>.md` (the library) AND the run folder as `owner-prompt.md`.

1. Read `owner-prompt.template.md` (the fixed scaffold) + the job's confirmed STEP 1 inputs: **ICP business types, target role, offer, footprint**.
2. **One shape, every country** (template's "ONE SHAPE"): a SINGLE Clay nano column that reads ALL available sources in one pass → one deduped `contacts` array. Map `{{site_text}}` + `{{serp_text}}` always, plus `{{ch_directors}}` (AUTHORITATIVE) when `companies_house.jsonl` exists for the job. No 2-column variant.
3. Fill every `<< >>` slot by reasoning about THIS vertical — the KEEP roles (who can say yes to the offer), the EXCLUDE roles (support/field/sales staff for these specific business types, by their real role nouns), the fallback role, the `role_bucket` enum, and 2–3 vertical-specific few-shots. Do NOT copy the healthcare/auto/roofing defaults.
4. The filled prompt MUST open with the `## DECISIONS` block stating, in plain language, **why** each role was kept or excluded — so a non-technical operator can audit the targeting.
5. Run the template's **PER-VERTICAL CHECKLIST** — every box true before this prompt is considered done.
6. Save it to **`<client>/<subscrape-slug>/owner-prompt.md`** (the job folder, never the skill folder) — alongside where `clay.csv` will be written, so the gate finds it.

Flow (this skill builds the Clay feed, then **the pipeline ends — Clay is the last mile, we don't come back**):

1. `node fetch-sites.js --in <out>/leads_domains.csv --out <out>/owner --concurrency 12` → `site_text.jsonl` (homepage + L2 pages incl. "Our Staff / Meet the Team"). Input is the STEP 5c-dom representatives file — one fetch per root domain; shared-host rows are skipped with a warning if one slips in.
2. `node search-owner.js --leads <out>/leads_domains.csv --config <client>-config.json --out <out>/owner --concurrency 6 [--resume]` → `serp_text.jsonl`. Runs the **SERP cascade** per lead: BIASED (`<biz> <area> <ST> ("owner" OR "general manager" OR ...)`) → **`site:linkedin.com <biz> <area> <ST>`** (strongest source) → BROAD (email/phone fallback, only if both empty). `<ST>` is a region token resolved per-lead via `geo.region_from_city` (US state from `city`; empty for regionless geos like the UK, `geo.region_default` as fallback). Retry on transients; resumable; emits all three texts + the **full lead identity** (name, address, ZIP, neighborhood, phone, website) for entity-matching. Key `SCRAPER_TECH_SEARCH_KEY`.
3. `node build-clay-csv.js --leads <out>/leads_annotated.csv --dir <out>/owner --out <out>/clay.csv --siblings <out>/domain_siblings.json` → one upload-ready CSV: full lead identity + `site_text` + `serp_text` (LinkedIn-first), every cell under Clay's 8KB cap. Spine = ALL rows (`leads_annotated.csv`); `--siblings` gives each fanned branch its representative's text. Five columns are **appended at the end** (never reordered — the Clay table maps by name/position): `root_domain, location_count, brand_family, fanned_from, evidence_tier`. **`evidence_tier`** is `SITE+SERP` / `SITE_ONLY` / `SERP_ONLY` / `CH_ONLY` / `NONE` — computed locally, before Clay.
4. **In Clay (final step, no return):** upload `clay.csv`; **filter `evidence_tier != NONE` before running anything paid** — a `NONE` row has no text for the column to read and can only return nothing; `build-clay` prints the count. Then create ONE nano Claygent column pasting this job's `owner-prompt.md` and mapping ALL source columns into it (`{{site_text}}` + `{{serp_text}}`, plus `{{ch_directors}}` when present); it reads all sources in one pass and emits ONE deduped `contacts` JSON array → contacts table → email waterfall (name + domain), employee count, founding date. The `## DECISIONS` block at the top of the prompt is what makes the entity-match + KEEP/EXCLUDE logic auditable. Done — there is no `owners_final.csv` produced locally.

Named-principal yield is vertical-dependent: healthcare ≈84%; used-car/high-ticket retail ≈44% even with the cascade (dealers don't publish owners; reviews name salespeople, excluded). The rest fall back to on-site generic email + GMaps phone.

## STEP 7 — Hand off to enrichment

The deliverable handed to Clay is **`<out>/clay.csv`**. The scrape settled active/in-footprint/has-website/not-a-chain/review_count; owner-finding bundled the website + SERP text and the entity-match identity. Clay runs the one prompt column (all sources in one pass → one deduped contacts array) and does the email waterfall / employee-count / founding-date last mile. The pipeline does not come back from Clay.

## Honesty notes

- The active gate (`is_permanently_closed`/`is_temporarily_closed`) is free here — don't pay an enrichment tool to recheck "is it open."
- Tile centers are starting points; the coverage-gap report is the source of truth for whether the footprint is fully covered. Don't claim a complete list until gaps are zero.
- Corporate exclusion by name blocklist is the cheap ~80%; the final DSO/independent call is Clay + the human builder.
- **Fan-out subagent prompts** (classify batches, AI-competitor WebSearch fan-outs) MUST include: *"Do the searches/work YOURSELF. Do NOT spawn, launch, or delegate to other agents. You personally write the output file."* — ~10% of fan-out agents otherwise delegate and return prose instead of the file, leaving silent gaps. And any script that reads agent-authored JSON must strip a possible UTF-8 BOM before `JSON.parse` (agents on Windows emit it inconsistently).

## Self-improvement protocol (run at the END of every run)

The engine only gets better if each run writes back what it broke or taught — if you don't record the lesson, the next run repeats the mistake. Three separated stores; the discipline is **grow data, not logic**:

- **Engine bugs / gotchas / backlog → `IMPROVEMENTS.md`** (next to this file). Append in its existing format: severity, status (OPEN/DONE + date), the run that found it, problem, fix. **Read it BEFORE any big run** — the OPEN items are the known landmines (and note when an open item bites again; recurrence raises its priority).
- **Method lessons → this SKILL.md, gated.** Plain FACTS (an API behavior, a field name, a flag that exists) can be edited in from a single run — they're data. Changes to METHOD (steps, thresholds, defaults) need to recur across ≥2 runs OR get explicit operator sign-off first — one run must not rewrite the pipeline. And never edit engine scripts to tune a job; that's what configs are for. Engine-script changes are for BUG FIXES only (never job-tuning), require explicit operator approval, and get their `IMPROVEMENTS.md` item flipped to DONE with the date when merged.
- **Client-specific state → `<client>/STATE.md`** (what shipped, what's pending, client directives, campaign IDs) — never into the skill folder. Update it whenever a run ships a deliverable.
