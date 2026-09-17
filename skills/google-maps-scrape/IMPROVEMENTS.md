# google-maps-scrape — improvement backlog

Technical backlog for the skill's engine. Not operator-facing (see HANDOFF.md for that).

## MEDIUM (owner-finding, three scripts disagree on what "named" means): a read record with `contacts` but no `primary_name` is invisible to the deliverable AND excluded from the sweep

**Status:** OPEN (no engine change made — worked around job-side with `build_have.py` in the run folder) · found 2026-09-17 (Atlas Growth, 2026-09-16 UK MAPS run), MEDIUM impact: **silent lead loss at the last step**, on exactly the leads a reader half-answered.
**Problem.** Three engine scripts test "is this lead named" three different ways.
- `merge-owner-reads.js` writes a record whenever the reader returned anything, and promotes `primary_name` only when a contact qualifies as the primary. A reader that mistakes a page heading or a postal address for a person therefore produces `contacts: [ ... ]` with `primary_name: ""` — the guardrails working as intended.
- `prep-sweep-batches.js` excludes a lead from the sweep when `Array.isArray(d.contacts) && d.contacts.length` — it sees the junk contact and treats the lead as DONE.
- `combine-owner-contacts.js` counts a lead as named only when `d.primary_name` is truthy — it sees the blank primary and treats the lead as UNNAMED.

So the lead is dropped from the deliverable AND never swept: the one state in which nothing further is ever attempted. 8 of this run's 598 site-text read records were in it, all `role_bucket: other` / `is_likely_owner: false` — `"West Yorkshire"` (title `"WF12 7QE"`), `"Home About Damptec"`, `"Southeast Preservation"`, `"Timber Decay"`. `read_report.json` does not show it either: its `leads_with_contacts` (380) is the `primary_name` count, while the file holds 388 records with contacts, and no counter names the 8.
**Fix (later, engine, with a test and an operator go).** One shared predicate for "named", used by all three: `contacts.length > 0 && primary_name`. Then (a) `merge-owner-reads.js` counts these records in `read_report.json` (a `contacts_no_primary` field — they are a reader-quality signal worth watching, not an error), and (b) `prep-sweep-batches.js` queues them. Cheapest correct version is to make the merge drop a contacts array from which nothing could be promoted, so the record is simply "not named" everywhere — but that throws away the evidence of what the reader did, so the counter is the better half of the fix.
**Until then:** build the sweep's `--have` file from the `primary_name` test, not straight from `contacts_read*.jsonl`. `clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/build_have.py` is the 40-line job-side version.

## DONE 2026-09-11 (owner-finding spend): domain dedupe + ONE shared-host list + shared-host routing to the recovery track

**Status:** DONE 2026-09-11 — shipped `collapse-domains.js` + `shared-hosts.js`; wired as SKILL **STEP 5c-dom**; `build-clay-csv.js --siblings` fans text to sibling branches; `fetch-sites.js` skips shared hosts; `prep-website-recovery.js` also honors the shared list (additive to its `DIR` regex). TDD'd in `tests/collapse-domains.test.js` (26 checks) + `tests/build-clay-evidence.test.js`. · found 2026-09-11 (Atlas Growth foundation-repair scoping, reviewing an external enrichment pipeline), HIGH impact on any run that keeps multi-location brands.
**Problem.** (a) Owner-finding spent once per `place_id`: every branch of one brand shares one website, so N branches = N paid lookups for 1 answer (external measurement: 109 locations on one domain → 43 distinct answers, 66 paid twice). `build-netnew.js` dedupes by host only ACROSS runs, never within one. (b) No shared-host concept anywhere in the with-website track: a lead whose `website` is `facebook.com/…` / `sites.google.com/…` / `*.wixsite.com` / `g.page/…` passed the `website exists` qualify rule, rode the with-website track, and `fetch-sites` fetched nothing from it — while the no-website recovery track (where the website-finder runs) never saw it. The directory denylist that did exist (`DIR` in `prep-website-recovery.js`) served only the SERP-text path. (c) The "keep roll-ups, flag the brand" ask had no mechanism: `qualify-leads.js` is drop-only (`label` names the `drop_reason`).
**Fix.** `shared-hosts.js` = one data list (social, Google short links, site builders, directories) + `hostOf / rootDomain / isSharedHost / classifyWebsite`; three consumers. `collapse-domains.js` classifies every row (`site`/`shared_host`/`none`), groups `site` rows by ROOT domain (subdomains collapse; `co.uk`-style suffixes kept), picks the most-reviewed branch as representative, and emits `leads_domains.csv` (spend), `leads_nowebsite.csv` (recovery; empty OR shared host), `leads_annotated.csv` (all rows + `website_class, root_domain, location_count, is_multi_location, brand_family, rep_place_id`), `domain_siblings.json`, `collapse_report.json` (`spend_rows_saved`). `brand_family` comes from a new optional config block `brand_families` (label → name/domain substrings). Shared hosts are NEVER grouped (400 Facebook-only firms are not one company). Row count in `clay.csv` is unchanged — only spend collapses.
**Known limit (by design, stated in SKILL).** Collapsing a PE roll-up loses the per-branch SERP; corporate leadership is what the shared site names and is the same across branches. `location_count` only sees multi-branch presence within the scraped footprint.

## DONE 2026-09-11 (build-clay): `evidence_tier` + `fanned_from` columns — spend the Clay column only where there is something to read

**Status:** DONE 2026-09-11 — five columns appended at the END of `clay.csv` (`root_domain, location_count, brand_family, fanned_from, evidence_tier`); existing 18 kept in order (Clay maps by name/position — guarded by `tests/build-clay-evidence.test.js`). Summary prints tier counts and a NONE warning. · found 2026-09-11, MEDIUM impact (Clay credits).
**Problem.** `clay.csv` gave no per-row signal of what evidence it carried, so the paid nano column ran on every row — including rows with empty `site_text` AND empty `serp_text`, which can only return nothing. And the pipeline never comes back from Clay, so "what did we actually get" was not answerable from the artifact. A `result_tier` (email found / name only / empty) is only knowable AFTER Clay; a local pre-Clay tier is what we can compute.
**Fix.** `evidence_tier` ∈ `SITE+SERP | SITE_ONLY | SERP_ONLY | CH_ONLY | NONE`, computed locally; `fanned_from` = representative `place_id` when the row's text came via domain fan-out (blank otherwise) — two orthogonal facts, two columns. Operator filters `evidence_tier != NONE` in Clay before running anything paid. The post-Clay `result_tier` is a Clay formula column, named differently so the two are never conflated.

## FACT (cost planning): `searchmaps.php` saturates at `limit` in SPARSE markets too — and per-tile call cost varies ~2x by geography

**Status:** RECORDED 2026-09-11 (Atlas Growth foundation repair, 10-state US).
**Measured.** A zoom-13 tile on **Salina, Kansas** — a genuinely thin market — returned **150 records (= `limit`), saturated**, exactly like Houston. Cause is the documented radius expansion: the endpoint widens until it fills ~100+ results, so a thin market is backfilled with pins from the nearest metros rather than returning a short list. Confirmed in the same run that latency does NOT degrade under 8 concurrent workers (4.4s/call at 8-way vs 4.2s single) — per-tile wall time is call COUNT, not throttling.
**Do not extrapolate call cost from the first minutes of a run.** On this run the first 110s (all dense TX metros, which sort first in the runsheet) measured **5.1 calls/tile**; by 450 tiles the run average had fallen to **~2.2 calls/tile**. An estimate taken early over-projected total spend by ~2x and triggered an unnecessary operator escalation. Measure at >=25% of the runsheet, or take the number from `run_log.json` after the fact.
**Consequence — densification tiles are largely redundant.** A core tile expands its own radius and `scrape.js` already quadrant-splits on saturation, so hand-added suburb tiles buy mostly duplicate `place_id`s. This run added 33 suburb tiles to 108 anchors (~23% of tiles). Prefer one tile per metro and add suburb tiles only where a coverage gap is actually observed.
**Not a bug.** Dedupe absorbs the redundancy and the footprint gate removes the bleed; this is a spend/runtime fact only.

## DONE 2026-09-11 (engine, client-neutrality bug): `apply-classify.js` hardcoded ONE CLIENT'S vertical as the no-verdict fallback

**Status:** DONE 2026-09-11 — added `--fallback <label>`, defaulting to the original string so every existing run behaves identically; a fallback row still gets `business_type_confidence='fallback'`, and the script now prints a loud WARN naming the count and the batch dir. TDD'd in `tests/apply-classify.test.js` (7 checks, incl. a backward-compatibility check and a BOM-prefixed batch). · found 2026-09-11 (Atlas Growth foundation repair), MEDIUM-HIGH impact — **silent lead loss, not a visibly wrong label.**
**Problem.** `apply-classify.js:20` was `const v = bt.get(pid) || 'commercial security company'` — the Link Helpers vertical baked into a shared engine script. Any lead the classifier returned no verdict for (batch never written, batch failed to parse, `place_id` skipped) was silently stamped with that string. This violates the engine's own stated principle that everything client/vertical-specific lives in config. It is worse than a wrong label: on a different vertical the fallback value fails the `business_type` fit gate, so the row is **dropped**, and a spot-check of the kept list never reveals it. The pre-existing BOM bug is the proof it fires in practice — one run lost 48/60 batches to an unstripped BOM, and every one of those leads took this fallback.
**Fix.** `--fallback` (pass it explicitly on every new vertical; Atlas Growth uses `unclear`, so unclassified rows land in the same auditable bucket as unreadable-site rows). The `confidence='fallback'` marker is the only downstream tell, so it is now documented in the usage block and asserted in the test.

## HIGH (engine fragility): `qualify-leads.js` hardcodes `|` as the `google_types` separator — any other separator silently turns a PRIMARY-only `deny` into an ANY-match deny

**Status:** OPEN (no engine change made — caller was at fault this time) · found 2026-09-11 (Atlas Growth), HIGH impact when it bites: it silently drops real ICP firms.
**Problem.** `scrape.js:196` writes `google_types` joined with `'|'`. `qualify-leads.js` derives the primary type as `google_types.split('|')[0]` (in `passes()` for the `deny` op, and again in `getField()` for the `primary_type` field). If a caller rewrites the column with any other separator, `split('|')[0]` returns the WHOLE string, so a deny term matching ANY secondary type now fires — the exact asymmetry SKILL STEP 5b warns about, arrived at by accident and in the opposite direction from the documented default. There is no validation and no warning.
**How it bit.** A run-folder merge script (cross-shard `place_id` dedupe) unioned types and rejoined them with `'; '` for the 3,725 of 15,276 rows that appeared in more than one shard — leaving a file with MIXED separators. Those rows lost 215 legitimate leads: e.g. `Crawl Space Ninja of Alpharetta` (157 reviews, primary `Waterproofing service`, which the allow-list explicitly permits) was dropped `off_icp_type` because `water damage restoration service` appeared later in its type string. Same for `Crawlspace Medic of Columbia` (399 reviews) and `Complete Basement Systems` (58). Fixed caller-side by rejoining with `'|'`; re-qualify then recovered all 215 at $0.
**Fix (later, engine).** Either split on `/\s*[|;]\s*/` everywhere types are parsed, or have `qualify-leads.js` hard-warn when `google_types` contains `;` but no `|` (a near-certain sign the column was rewritten). A one-line separator constant shared by `scrape.js` and `qualify-leads.js` would be better still. Until then: **any script that rewrites `google_types` MUST rejoin with `'|'`.**

## CRITICAL (search-owner.js DEAD): scraper.tech discontinued its Google-search product — SERP cascade broken

**Status:** OPEN (workaround shipped: serper.dev backend) · found 2026-07-20 (LH septic owner-finding), HIGH impact — breaks owner-finding for EVERY vertical.
**Problem.** `search-owner.js` calls `google-search.scraper.tech/google-search`, which now returns a bare `{"status":"fail","results":[]}` for ANY key + ANY query (even a trivial "pizza"), including a freshly-reset key. Proved it's NOT the key/credits/params: the SAME key returns `status:ok` on scraper.tech's **maps** (`api.scraper.tech/searchmaps.php`) and **twitter** (`api.scraper.tech/search.php`) products, and the failing request is byte-identical to scraper.tech's own playground curl. scraper.tech's product list no longer includes a Google-search/SERP API — **it was discontinued.** So `search-owner.js` (and the STEP 6 SERP cascade) is dead until re-pointed.
**Workaround (proven, shipped in the LH septic run folder).** `serper-owner.js` — a serper.dev backend: `POST google.serper.dev/search`, header `X-API-KEY`, body `{q,gl:"us",num:10}` → `organic[]`. Runs the biased owner-title query ONLY (1 serper credit/lead; the biased rung is what carried 6/9 in the trade-vertical validation — LinkedIn rung dropped for trades: weak + doubles cost). Emits the SAME `serp_text.jsonl` shape as `search-owner.js` (biased_text filled) so `build-clay-csv.js`/`merge-serp.js` consume it unchanged. Has `--key` override (chain multiple keys/accounts) and treats a missing `organic` key as failed (not no_results) so credit-exhaustion re-queues correctly on `--resume`. serper cost ≈ $1/1,000 (2,500 free/account).
**Fix (later).** Fold a serper (or pluggable SERP) backend into `search-owner.js` proper — e.g. `owner_query.serp_backend: "serper"` + `SERPER_KEY` in .env — so the engine isn't hardwired to a dead endpoint. Keep the scraper.tech path only if/when they restore the product. Note the trade-vertical lesson while there: LinkedIn is a weak rung for owner-operators; order BBB→/about→Facebook→reviews for residential trades, LinkedIn-first only for B2B.

## DONE 2026-09-13: offset pagination shipped (gated) — first live run confirms the engine was truncating 99% of dense tiles

**Status:** DONE 2026-09-13 (`scrape_tuning.paginate`, default off; `paginate.js` + `tests/paginate.test.js`) · found 2026-09-13 (Altivox Lagos), HIGH impact.

**Live pilot result (P1 x 4 Victoria Island tiles, 160 runsheet rows, `paginate: true`):**
- 466 API calls, **avg 2.91 calls/row**, page-depth histogram `{1:2, 2:34, 3:100, 4:24}`.
- **158 of 160 rows (99%) needed more than one page.** Every one of those was a tile the old single-call engine truncated. This is the clearest measure yet of the historical under-collection.
- 11,286 unique businesses, 24.2 unique/call. Coverage COMPLETE after 1 heal pass.

**Why the June-2026 "offset is broken" note was wrong, and how it fooled someone.** One tile ("Attorney" @ vi-eko-atlantic) returned `status:"failed"` on a deep offset. The roll-up marked the tile not-ok, `run-scrape.js` healed it, and the retry returned 348 records across 4 pages. So deep-offset `failed` is **intermittent, not structural** — exactly what you would see if you probed `offset=20` once, got `failed`, and concluded pagination was dead. Any future "endpoint X is broken" note should be re-probed before being designed around.

**Roll-up events validated in anger:** that single failed tile is precisely the case that would have scored `ok` under per-call events (its page 0 succeeded), been skipped by `failedTiles`, and shipped as a silent hole.

## MEDIUM (areas mode): `country=ng` returns ~10% US businesses — the footprint gate is load-bearing, not a safety net

**Status:** OPEN (mitigated by footprint-gate.js) · found 2026-09-13 (Altivox Lagos), MEDIUM impact.

**Problem.** A `country=ng` scrape of Victoria Island returned **1,105 US businesses** out of 11,012 qualified (~10%) — Waukegan IL, Troy MI, Northbrook IL, Grand Rapids MI, Chicago, Minneapolis, Green Bay. Generic office queries ("Executive Suites", "Office space rental agency", "Virtual office rental service") are the worst offenders: brand-heavy US chains (Regus, Opus Virtual Offices) outrank local results even with `country=ng` and Lagos coordinates. The `country` parameter is a hint, not a filter.

These are caught today, but as `far_from_hubs`, not `wrong_country` — `footprint-gate.js` tests hub distance first and the first failing check wins, so the reason label understates how much of the drop is foreign contamination. Not a bug; worth knowing when reading `excluded_geo.csv`.

**Implication.** In `areas` mode the footprint gate is doing primary work, not cleanup. Never ship an `areas`-mode list that has not been through it, and always read the drop count as a contamination signal.

**Radius calibration does NOT transfer between runsheets.** Measured on the 4-tile VI pilot: 1.0deg keeps 9,505 / drops 1,505; 0.10deg keeps 7,394; 0.05deg keeps 6,854; 0.03deg keeps 5,838. But at 0.05deg the pilot also drops 178 legitimate **Lekki** businesses — correctly, since no pilot tile is within 5.5km of Lekki. On the full 17-tile sheet those same leads are in-footprint. **Tune `--hub-radius-deg` against the runsheet you will actually ship, never a subset.**

## CRITICAL (engine + runbook): `offset` pagination WORKS now — scrape.js doesn't use it and leaves the long tail on the floor

**Status:** DONE 2026-09-13 — shipped gated behind `scrape_tuning.paginate` (paginate.js, tests/paginate.test.js); see the pilot results logged above. · found 2026-09-13 (Altivox Lagos offices), **HIGH impact — silent under-collection on every dense tile, in every run to date.**

**Problem.** `runbook.md` has stated since June 2026 that `offset` pagination is broken (`status:"failed"`) and that completeness must therefore come from tiling + quadrant splits alone. **Re-tested against a live key on 2026-09-13: that is no longer true.** On VI core / `Law firm` / zoom 14 / `country=ng`:
- `offset=0/20/40/100` all return `status:"ok"` with **zero place_id overlap** between pages; paging exhausts cleanly with an empty array.
- `limit=150` works and combines with `offset` — a full viewport crawl is ~4 calls.
- **One viewport, one category, paginated = 348 unique** vs the ~100 the runbook calls a hard cap. The ~100 ceiling is per-CALL, not per-viewport.

`scrape.js::fetchTile` issues ONE call per tile and then quadrant-splits on saturation. So on every dense tile it (a) misses most of the long tail and (b) spends 4 extra calls on splits that drift outside the footprint (see the QUAD_OFFSET item) to recover a fraction of what one more `offset` call would return cleanly. Every list this engine has produced for a dense footprint is under-collected by an unknown margin.

**Related finding — non-determinism.** The same query+viewport+params minutes apart returns different sets: two fully-paginated passes = 314 / 308 unique, **union 354**; a single pass captures only **86.2%** of a 5-pass union (single-pass miss ~13.8%). Union converges at **3 passes** (pass2 +13.2%, pass3 +0.9%, pass4 +0.3%). This is fatal to any month-over-month delta job unless passes are unioned — written up as `processes/05-new-premises-delta.md`.

**Fix.** Add an `offset` loop to `fetchTile`: page at `limit=150` until an empty array or a `max_pages` guard, THEN fall back to quadrant-split only if the viewport is still saturated at exhaustion. Gate it behind `scrape_tuning.paginate: true` so existing runs are reproducible. Engine change = needs operator approval per the skill's self-improvement protocol; NOT done in this run. Until then, dense-footprint jobs should treat any single-pass list as ~86% complete.

## LOW (reporting): `run_log.json` counts are PASS-0 ONLY and understate `leads_clean.csv` after any heal

**Status:** OPEN (documentation, not a bug) · found 2026-09-13 (Altivox Lagos pilot), LOW impact — but it looks exactly like a data-loss bug and costs time to chase.

**Problem.** The Altivox pilot's `run_log.json` reported `unique_businesses: 11286` while `leads_clean.csv` held **11,438 distinct place_ids**. Nothing is wrong: `run-scrape.js` merges each heal pass into the top-level `leads_clean.csv` via `mergeLeads` (`:133`) but re-reads and keeps **pass 0's** `run_log.json` (`:139`). One tile ("Attorney") failed on a deep offset, healed, and its 348-record refill contributed 152 places pass 0 never saw.

So whenever `coverage_report.heal_passes > 0`, `run_log.unique_businesses` / `kept` are a LOWER BOUND on the final file. `coverage_report.json` is the run-level truth; `run_log.json` describes pass 0 only.

**Fix options** (neither done): have `run-scrape.js` write a `run_summary.json` with post-merge totals, or add `final_unique` to `coverage_report.json`. Until then, count rows in `leads_clean.csv` rather than trusting `run_log` after a heal.

## HIGH (method, non-Western geos): local business-name idiom must be verified locally — Google's type tag is not a translator

**Status:** OPEN (process rule) · found 2026-09-13 (Altivox Lagos), HIGH impact — two segment-level errors in one config, neither visible without local knowledge.

**Problem.** Two category calls in the Lagos job were wrong because a term means something different in Nigeria than the model assumed, and Google's `types` field did not disambiguate either one:

1. **"Business center"** was treated as flexible office space and put in the top tier. In Nigeria it is a **photocopy / typing / cybercafe shop**: 319 pilot rows at 6% website and 68% zero reviews — `Goddey Business Centre`, `Bitoks Business Centre & Cybercafe`, `Xerox Business Center`. Caught only by profiling the query's output.
2. **"POS shop"** was read as a point-of-sale hardware retailer and kept. In Nigeria a POS shop is an **agent-banking kiosk** (cash-in/cash-out, transfers, bill payments) — tiny, ubiquitous, never a network buyer. Google tagged `POS Shop Ltd` as `Computer hardware manufacturer`, and that mis-tag was taken at face value. Caught only by the operator.

**Rules.**
- For any non-Western geography, **profile a query's actual output before trusting the category label** — website rate, review distribution and a dozen real names take a minute and would have caught both.
- **Never infer what a business is from Google's `types`.** The tag is frequently wrong and is not a translation of local usage. Prefer the name pattern plus the operator's knowledge.
- **Ask the operator to sanity-check the category list** before freezing a run sheet. Both errors were obvious to someone who works the market.

**Related substring trap, third instance.** The fix for POS agents cannot use a bare `pos` term: it would delete `Nigeria Deposit Insurance Corporation`, `Compos Mentis Legal Practitioners` and `Positive Cashflow Consulting` (10 such rows in the pilot). Nor is `' pos '` sufficient — it cannot match a name that STARTS with POS, which is exactly how `POS Shop Ltd` survived the first rewrite. Use compound terms (`pos shop`, `pos agent`, `pos centre`, `bank pos`). That is now three separate segment-eating substring bugs in one config; `deny`/`not_contains_any` terms should be treated as hostile by default.

## HIGH (qualify engine gotcha): `scope:"any"` on a fuzzy deny list deletes real targets via their SECONDARY tags

**Status:** OPEN (documented; no code change — the engine already warns) · found 2026-09-13 (Altivox Lagos), HIGH impact — silent, and it deleted the client's highest-value segment.

**Problem.** `deny` defaults to matching the PRIMARY google_type; `scope:"any"` opts into matching ANY tag. `qualify-leads.js:72-73` warns that "scope:any can also drop a real firm carrying an incidental off-ICP secondary tag, so opt in [only] for unambiguous must-drop entities." The Altivox config applied `scope:"any"` to a 45-term fuzzy list anyway.

Measured on the pilot (11,438 rows): **71 real bank branches deleted** — `Zenith Bank`, `Guaranty Trust Bank PLC`, `Standard Chartered Bank Nigeria`, `Fidelity Bank Plc - Corporate Branch`, `Polaris Bank Limited` — every one because Google tags a branch `Bank|ATM` and the deny list contained a bare `atm`. Simultaneously **77 POS agents were KEPT** (`Enterprise Bank POS Munchies Fastfoods`, primary type `Bank`) because the name rule's `pos agent` term does not match `Bank POS <merchant>`. The rule deleted the branches and retained the card terminals — exactly inverted, and banks were the single highest-value segment in the brief.

Also collateral: coworking spaces carrying a `Cafe`/`Pharmacy` secondary, and `Corporate office|Apartment building` towers.

**Fix (process).** Split every deny into two rules: `scope:"any"` reserved for terms that can never appear on a real target (`bus stop`, `bus station`, `taxi stand`, `parking lot`, `parking garage`, `cemetery`), everything else primary-only. Filter entity kinds that share a type with a target — ATMs, POS agents — **by name**, not by type. After the fix: 542 bank primaries kept, POS agents down from 77 to 1.

**Author's note.** This is the same class as the substring gotcha above and it landed in the same config. Both are invisible without a dry-run: the lead just appears in `excluded_officp.csv` under a plausible `drop_reason`. **Always dry-run a new rule set against a fixture that includes a known-good instance of the most valuable segment** — for Altivox that fixture row is a `Bank|ATM` branch, and it now exists.

## HIGH (qualify engine gotcha): `deny` is a SUBSTRING match — short terms silently delete whole ICPs

**Status:** OPEN (documented; no code change) · found 2026-09-13 (Altivox Lagos offices), HIGH impact — silent false-drops, no warning.

**Problem.** `qualify-leads.js` `deny`/`contains_any` match by substring, so a short deny term collides with legitimate category names. On the Altivox config two collisions were caught only because the config was dry-run against a fixture first:
- `"spa"` matches **"Coworking space"** and **"Office space rental agency"** — would have deleted the single highest-intent P1 segment (coworking/serviced offices) from a list built for a WiFi installer.
- `"market"` matches **"Marketing agency"** — would have silently deleted the entire marketing/media ICP.
- `"park"` matches "business park"; `"bar"` matches "barber" (intended) but is one keystroke from collateral.
Nothing warns: the lead just lands in `excluded_officp.csv` under a plausible-looking `drop_reason`, and the operator sees a smaller list, not a bug.

**Fix (process, until the engine changes).** ALWAYS dry-run a new `qualify_rules` block against a hand-built fixture CSV carrying the real `leads_clean` header + 10-15 rows that deliberately probe the deny terms, BEFORE the scrape. Cost: $0 and two minutes. Prefer multi-word deny terms (`"day spa"`, `"flea market"`, `"parking lot"`) over bare stems. Engine-side option for later: support `"match":"word"` on deny/contains_any to anchor on token boundaries.

## MEDIUM (engine): `QUAD_OFFSET` is FIXED across split depths and its default is US-metro-scaled

**Status:** DONE 2026-09-13 — `quadCenters()` now scales the offset by depth; applied unconditionally (no-op at MAX_DEPTH=1). · found 2026-09-13 (Altivox Lagos offices), MEDIUM impact.

**Problem.** In `scrape.js::fetchTile`, the quadrant split uses `const o = QUAD_OFFSET` at EVERY depth — it does not halve as it recurses. So with `max_depth: 2` the depth-2 sub-tiles land `2 x QUAD_OFFSET` from the original center, spreading OUTWARD instead of subdividing. With the 0.025 default (~2.8km) that is ~5.5km of drift. On compact/island footprints this is actively wrong: Victoria Island is only ~3km across, so a saturated VI tile splits into the lagoon and across into Ikoyi — wasted calls plus footprint bleed that `footprint-gate.js` then has to clean up.

**Fix.** Per-job workaround in config (Altivox uses `quad_offset: 0.010` for island-scale tiles) — no script edit. Engine-side later: scale the offset by depth (`o = QUAD_OFFSET / 2**depth`) so a split actually subdivides the parent viewport, which is what the "quadrant split" name implies.

## MEDIUM (fetch-sites): large runs (10k+ distinct hosts) saturate the home network → capture collapses; needs batch-with-pauses

**Status:** OPEN (workaround proven) · found 2026-07-10 (db2b house, 48k US agency sites), MEDIUM impact.
**Problem.** `fetch-sites.js` at a fixed `--concurrency` works great at the usual 2-5k scale but **collapses on a
48k-site run**: capture started at 87% (first ~600) and snowballed down to **22%** deep into the run, dominated by
`AbortError`. Diagnosed it was NOT the sites (a rested-network 300-sample hit 74% with a normal failure mix) and
NOT DNS (an `UV_THREADPOOL_SIZE=64` A/B made it *worse* — but that test was confounded by running 2nd on a more-
saturated network, which was itself the tell). Root cause = **cumulative connection-rate saturation**: opening
connections to tens of thousands of DISTINCT hosts fills the home router's NAT connection table / trips ISP
connection-rate throttling; it recovers with rest and degrades under sustained load. A `--concurrency 50` burst
made it far worse (60% fail) and poisoned the network for the following conc-20 run. `TIME_WAIT` was low (20), so
it's NOT local ephemeral-port exhaustion — it's upstream (router/ISP).
**Workaround that held ~75-85% across all 48k:** process in **batches (~3k) at moderate concurrency (12) with a
~75s drain pause between batches** so NAT/conn state expires (`batch-fetch.js` driver in the run folder: resumable,
per-batch out dirs, merge at end). Capture still drifted (86%→~75% over ~17 batches — pauses don't FULLY drain over
hours), so add a final **AbortError-only retry pass on a rested connection** (recovered only ~5% here — the
survivors of the in-run 20s retry are mostly genuinely dead/slow, so don't over-invest).
**Fix (later).** Bake an **adaptive/batched mode into fetch-sites** for large inputs: auto-detect row count > ~8k →
switch to batch-with-pause, OR expose `--batch-size` + `--batch-pause`, OR add adaptive concurrency that backs off
when the rolling AbortError rate climbs (the real signal). Also: `build-clay-csv.js` `readFileSync`s
`site_text.jsonl` and **OOMs / hits the 512MB string cap** on a run this size — make it stream (readline) like
`build-clay-stream.js` (written in the house run folder as the stopgap). And note fetch-sites' merged jsonl can
exceed Node's max string length — any reader must stream, not `readFileSync`.

## MEDIUM (engine perf/robustness): scrape.js is fully SEQUENTIAL + buffers to memory → slow-API windows are catastrophic

**Status:** OPEN (workaround proven) · found 2026-07-09 (db2b house, US marketing agencies), MEDIUM impact.
**Problem.** `scrape.js` runs tiles one-at-a-time (`for` loop + recursive `await fetchTile`), no concurrency,
and holds all leads in memory — writing `leads_clean.csv` only at the very end. On a normal-latency day this is
fine. But scraper.tech Maps hit a **~23s/call slow window** one evening; a 632-tile run (top-50 metros × 8
categories, ~1,700–2,200 effective calls after splits) projected to **~11 hours**, and because nothing is written
until the end, killing the stuck process **loses everything** (a 4-hour run produced zero on-disk output).
Latency later recovered to ~4s/call, confirming it was upstream, not us.
**Workaround that worked (no engine edit).** Split the runsheet into N shards (round-robin so each spans all
metros/categories), run **N concurrent `run-scrape.js` workers**, each with its own `--out` dir → each persists
its own `leads_clean.csv` (resumable, isolated failure). Then merge = concat + place_id dedupe. 8 workers gave
~8× speedup (~90 min) with no rate-limiting observed. Round-robin sharding → ~40% cross-shard place_id overlap
(same firm via different category queries), removed at merge.
**Fix (later).** (a) Add optional concurrency to scrape.js (a small worker pool over the tile list, e.g.
`--concurrency 8`), OR (b) ship a `shard-parallel` mode in `run-scrape.js`/`run-batch.js` that does the split +
concurrent-workers + merge automatically. (c) Incrementally flush `leads_clean.csv` (or a checkpoint) during the
run so a kill doesn't lose everything. Belt-and-suspenders: a per-tile call is already 30s-timeout-guarded, so the
risk is slowness/loss, not a true hang.


## CRITICAL: `areas` mode has NO footprint gate — scrape bleeds far/out-of-footprint (even non-US) businesses

**Status:** DONE 2026-07-05 — implemented as `footprint-gate.js` (post-qualify geo gate: nearest-hub distance drop at `--hub-radius-deg` default 1.0°, wrong-country drop vs `geo.region_default`, optional region/state allow via `--regions`) and wired into SKILL.md as **STEP 5b-geo** (runs between qualify and dedupe; downstream consumes `leads_clean_qualified_infootprint.csv`). RESIDUAL (still open): the scrape-time radius-discard (cap searchmaps radius / drop pins >Xkm from tile center inside `scrape.js`) was deferred to avoid editing `scrape.js` during a live batch — the post-scrape gate already fully removes the bleed; add the scrape-time tightening as belt-and-suspenders later. · found 2026-06-29 (LH security run), HIGH impact. In `areas` mode the footprint is supposed to be "defined by the tiles," but `searchmaps.php` with broad/sparse queries (e.g. "Security service") **expands its search radius to fill ~100 results**, and service-area-business pins ignore tile bounds — so the scrape pulled in businesses from **non-targeted and even excluded metros**: on a 47-metro US run that explicitly excluded TX & NY, the post-classify list was **27–41% out-of-footprint** — 258 TX + 198 NY leads, plus Chicago/LA/SF/Atlanta/Nashville/Charlotte, Washington DC, Boston, **Windsor Ontario, and London UK** (a `country=us` scrape returned UK businesses). Nothing downstream caught it because qualify gates on type/reviews, not geography, and the only geo step (`footprint_codes_with_no_results`) is postal-mode-only.

**Fix:** add a **post-scrape footprint gate** that runs in BOTH modes. For `areas` mode, gate each lead by **nearest-hub distance** (the run already has the tile-center hub coords) — drop leads beyond ~1.0° (≈110km) of every target center (1.0° cleanly kept target-metro cores+suburbs and dropped LA-at-1.05°/Chicago/NYC in testing). Belt-and-suspenders: also drop non-US (`full_address` country ≠ target) and any lead whose `city` state ∉ footprint states. This should be a standard step between qualify and dedupe, not a per-run manual cleanup (this run did it by hand via `_finalize_footprint.js`/`_clean_recovery.js` — 1,474 leads cut from 3,534 → 2,060). **Also worth tightening the scrape itself:** cap the searchmaps radius / detect when results land >Xkm from the tile center and discard them at scrape time.

## CRITICAL follow-up: footprint-gate.js `wrong_country` + hub-radius OVER-DROP when addresses have no country token (end in city)

**Status:** DONE 2026-07-08 — folded into footprint-gate.js: inverted foreign-country blocklist (COUNTRY set + alias groups, target removed), geo.sparse_geo hub-gate skip; TDD'd in tests/footprint-gate.test.js. · found 2026-07-05 (Campus51 anglophone-Africa, 19 countries), **HIGH impact — silently destroys legit leads**.

**Problem.** The footprint-gate shipped 2026-07-05 assumes two things that are false for many non-US countries on scraper.tech: (1) `addrCountry()` takes the **last comma token of `full_address` as the country** — but scraper.tech addresses in BW/GH/UG/etc. **end in the CITY** ("…Hillcrest International School, Makoba, **Gaborone**"), no country token at all. So the `wrong_country` check (`last token ≠ region_default`) fires on nearly every legit lead ("gaborone" ≠ "botswana"). (2) `far_from_hubs` at 1.0° over-drops **large sparse countries** where real schools sit >111km from the handful of named city hubs. Combined result on Botswana: **496 qualified → 5 kept** (328 false `wrong_country` + 163 `far_from_hubs`). Across the 19-country run this gate would have nuked ~everything. The *real* contamination was precise and visible: pins whose last token IS an explicit foreign country — **108 "United States"** (bad geocodes) + **38 "South Africa"** (border bleed).

**Fix.** Invert the country logic: instead of "drop when last token ≠ target," **drop ONLY when the last token IS a recognized FOREIGN country name** (maintain a world-country/alias set minus the target). This is robust to city-ending addresses (a city token isn't in the country set → kept) and still removes US/border bleed surgically (bw 496→346, dropping exactly 108 US + 38 SA + a few EU). And make the hub-radius gate **opt-in / widen its default for sparse geos** (or skip it when a country's tile hubs are few relative to area) — don't drop in-country remote schools. Reference impl = `_geofilter.js` in `campus51/2026-07-05_africa-anglophone/` (input = qualified list + target country name; drop-if-foreign-last-token; keeps all else). Add a `geo.address_has_country: false` config hint or auto-detect (if <X% of last tokens match ANY country name, the country field isn't present → use foreign-blocklist mode, skip region_default matching).

## Multi-country batch runner: inline bash loop is fragile (orphans on terminal close; no auto-retry of outage-failed countries)

**Status:** DONE 2026-07-08 — shipped run-batch.js (persisted batch.json job list, _batch_state.json machine state, exit-code+row-count re-queue with backoff, idempotent skip-guard); TDD'd in tests/run-batch.test.js. · found 2026-07-05 (Campus51 anglophone-Africa 19-country run), MEDIUM impact.

**Problem.** The 19-country run was driven by an **inline bash `for cc in …` loop** typed into the terminal (not a saved script), each iteration calling `run-scrape.js` and appending to `_batch_status.log`. Two failure modes hit: (1) **Terminal closed mid-run** — on Windows the loop + its `node` children kept running ORPHANED (survivable, but invisible; recovery required reconstructing the country list from the live process's `CommandLine` via `Get-CimInstance`, and `TaskStop` on a backgrounded bash task did NOT kill its orphaned node children — had to kill by PID). (2) **API outage mid-batch (~5 min)** — `run-scrape.js` correctly hard-failed those tiles (exit 1, 0 rows) BUT the batch loop **marched on and marked 9 countries "done" with zero data**; nothing re-queued them. They only got recovered by a hand-built scoped second driver.

**Fix.** Ship a `run-batch.js` multi-country driver in the skill: (a) reads a countries × config list from a file (persisted, not inline — survives a closed terminal and is resumable); (b) after each country, **check exit code AND row count — re-queue any country that exited ≠0 or produced 0 rows**, with a backoff, up to N retries (an outage should not silently zero a country); (c) skip-guard countries that already have a non-empty `leads_clean.csv` (idempotent resume); (d) write a machine-readable status (not just a log) so a crashed run can be resumed by reading state, not by process-archaeology.

## fetch-sites: PASS-2 free retry still leaves ~37% AbortError on slow-hosting regions (Africa/SA)

**Status:** OPEN (accepted for now — Clay re-fetches from the URL during enrichment). · found 2026-07-05 (Campus51 anglophone-Africa), LOW-MEDIUM impact.

**Problem.** Even with the 2026-07-05 PASS-2 free retry (`--retry-timeout` 20s), fetch-sites on 2,857 African school sites came back **1,735 site_text OK / 1,049 home_failed (~37%)**, dominated by `AbortError` — matching the SA-pilot note that African/SA hosting is genuinely slow (not anti-bot). 20s isn't enough for a chunk of these hosts, and many are truly dead.

**Fix (low priority).** Optionally expose a per-run `--retry-timeout` bump (e.g. 30–40s) for known-slow geos, or a `geo.slow_hosting: true` config hint that raises PASS-2 timeout. Don't over-invest: for a Clay-terminated pipeline the enrichment tool re-fetches from the known URL anyway, so on-site `site_text` is a bonus, not a blocker — a high AbortError rate on slow-geo runs is expected, not a defect. Just don't report it as data loss.

## DONE 2026-07-05: build-clay-csv byte-cap confirmed fixed (multibyte cells)

The SA-pilot bug (cap by CHARS not bytes → multibyte names tip a cell >8192B past Clay's 8KB limit) is resolved: this run's `build-clay-csv.js` reported `max site_text 8000B … hard-capped < 8000B` and built **19,424 rows** with multibyte African/Arabic school names, zero over-cap cells. Cap is now byte-based. No action.

## No-website recovery is a standing rule but lives only in a parenthetical → gets silently skipped

**Status:** DONE 2026-07-05 — promoted to SKILL.md **STEP 5d** (auto-run, ships WITH the main track; includes the merged chain/deny re-qualify before build-clay and the "narrow BOTH tracks on mid-run scope cuts" gotcha). · found 2026-07-03 (LNP professional-services run), MEDIUM-HIGH impact (~15–40% of net-new volume per run).

**Problem.** The no-website recovery track — extract the leads with no `website` from `leads_clean.csv`, keep them through cross-run dedupe, run `search-owner.js` (SERP) to find the decision-maker while the operator runs their website-finder in parallel, then `fetch-sites.js` on recovered domains → net-new email leads — is a STANDING RULE (`feedback_no_website_recovery`). But the skill only mentions it **parenthetically inside STEP 5c's dedupe note** (line ~104: "…they feed the no-website recovery track…"). There is no numbered step, no command, and no "do this automatically" instruction. Result on the LNP prof-services run: it was **skipped** — only the with-website track (1,865) was delivered and the 344 no-website leads sat idle as an "optional afterthought" until the user caught it. A concept without an actionable step reads as skippable.

**Fix.** Promote it to an explicit STANDARD step (e.g. STEP 5d, right after cross-run dedupe), same "do this automatically, then report" posture as STEP 5 calibration and STEP 5c dedupe:
1. `no_website_leads.csv` = rows of `leads_clean.csv` with empty `website`; run `build-netnew.js` on it (place_id dedupe keeps no-website leads) → `no_website_leads_netnew.csv`.
2. **Auto-run** `search-owner.js` on that file (finds the decision-maker via SERP without needing a domain); **tell the operator to run their website-finder in parallel** (their step).
3. When domains come back, `fetch-sites.js` on the recovered domains → merge into the clay feed.
The with-website and recovery tracks should always ship **together**; recovery is MANDATORY/auto like 5c, not optional. Also: whenever a client narrows scope mid-run (e.g. "drop insurance"), filter BOTH tracks, not just the primary one. And re-run the chain/deny qualify on the MERGED final list before `build-clay-csv`: no-website leads are extracted at the website rule (rule 1) so they NEVER saw the chain/deny rules — a wirehouse/chain (e.g. Wells Fargo Advisors) will otherwise ride into the deliverable through the recovery track even when it's already in the blocklist.

## DONE 2026-06-29: agent-written JSON has an inconsistent UTF-8 BOM — readers must strip it

Subagents that `Write` a JSON file on Windows **sometimes prefix a UTF-8 BOM (`﻿` / `﻿`)** and sometimes don't (inconsistent across agents in the same fan-out). `JSON.parse` throws "Unexpected token '﻿'", which silently sent 48/60 classify batches to the generic fallback before it was caught. Fix applied: `apply-classify.js` + `apply-website-recovery.js` now `.replace(/^﻿/,'').trim()` before parse. **Any future script that reads agent-authored JSON must do the same.**

## prep-website-recovery.js: email-domain inference needs a name-match guard

**Status:** DONE 2026-07-05 — `emailDomain()` now takes the business name and only accepts an inferred domain when a distinctive (len≥4, non-industry-stopword) name token overlaps the host stem (`nameMatchesDomain`); else returns '' so the lead falls to the LLM batch. `DIR` denylist extended with `wheree.com`, `localsearch`, ISP/webmail (`sbcglobal/comcast/att/aol/verizon`), and state-gov `\.[a-z]{2}\.us$`. `node --check` passed. · noted 2026-06-29 (LH security run). The deterministic **email-domain inference** (`emailDomain()` grabs the first non-free business email in the SERP/site blob and treats its domain as the website) had a **~50% error rate** on the LH run — it pulled emails belonging to a *different* company mentioned in the SERP (e.g. `Gateway Alarm → sbcglobal.net`, `Esteem Patrol → finestprotectionsecurity.com`, `Atosc → deltakilosecurity.com`, `International Protective → eessinc.com`). **Fix:** only accept an email-domain whose host stem shares a distinctive (non-industry-word) token with the business name — same entity-match bar the LLM uses — else send the lead to the LLM batch instead of trusting the email. Also extend the candidate `DIR` denylist to cover directory builders the run missed: `wheree.com`, `*.localsearch*`, ISP/webmail (`sbcglobal/comcast/att/aol/verizon.net`), and state-gov `.XX.us`. (Worked around this run via a one-off `_clean_recovery.js` null pass — 19 bad recoveries removed.)


## fetch-sites.js: add a rendered/anti-bot fallback rung (triage-ladder escalation)

**Status:** DONE 2026-07-05 — `fetch-sites.js` now runs PASS 2 (free longer-timeout retry, default ON, `--retry-timeout` 20000ms) over only the transient failures (`isTransient`: AbortError/timeout/ECONNRESET/EAI_AGAIN/429/5xx; 403/404/thin-200 excluded) and PASS 3 (opt-in `--firecrawl`, `FIRECRAWL_KEY` from .env, warns+skips if absent) over residual failures → `POST api.firecrawl.dev/v1/scrape`, merged into the same `site_text.jsonl` record shape. Raw headless Chrome intentionally NOT added (tested useless). Backward compatible (default = old behavior + free retry). `node --check` passed. · noted 2026-06-29 during the Link Helpers security run.

**Problem.** `fetch-sites.js` is **rung 1 only** of the `web-scrape-triage` ladder — plain Node `fetch()` of server-rendered HTML, 8s timeout, no browser. On the LH security run that meant **~14% home-fetch failures** (496/3,529): Cloudflare/anti-bot challenges, 403s, slow sites, and JS-only SPAs (some of which return a 200 with a near-empty shell, so they pass as "OK" but yield thin text). Thin/failed site text weakens the downstream `business_type` classify (have to fall back to SERP snippets) and any on-site owner/email extraction.

**Fix (per `web-scrape-triage`).** Add a **config-flagged escalation** that re-processes *only* the failures (and optionally the suspiciously-thin "OK" sites, e.g. <400 chars of body text). fetch-sites' job is *content of a known URL*, so the correct rungs are:
1. **Tier 1** — plain HTML fetch (current default).
2. **Tier 0 (conditional)** — if Tier 1 returns a JS-empty shell, first check inline `__NEXT_DATA__`/JSON in the source and extract content from it (cheap, no render). Tier 0's main home is list/directory scraping, not brochure sites, so this only fires for the JS-app subset.
3. **Tier 3a — headless Chrome render** (free, local: `C:\Program Files\Google\Chrome\Application\chrome.exe`) — for JS-only SPAs.
4. **Tier 3b — Firecrawl** (paid, per-session key) — for Cloudflare / 403 / captcha that Chrome can't beat.
5. **STOP** → fall back to the lead's `serp_text` snippet (current behavior).

Branch on the failure type: JS-empty-200 shell → Tier 0 then Chrome; anti-bot 403/challenge → Firecrawl. Keep it opt-in (`--render-fallback` or a config key) so default cost is unchanged. Bounded cost = only the ~14% that failed.

**TESTED 2026-06-29 on the LH 496 failures — raw headless Chrome is NOT worth it; Firecrawl is the real rung.** `chrome --headless=new --dump-dom --virtual-time-budget=12000` recovered **0 of 3** representative failures:
- AbortError site (`mgsecurityservices.com`) → "connection was reset" = **genuinely dead**, unrecoverable by anything.
- 403 site (`mwg.aaa.com`) → "Just a moment… security verification" = **Cloudflare**, which Chrome cannot pass (as the skill warns).
- thin-JS site (`yellowstonesecurityinc.com`) → render returned **44 chars** (worse than the plain fetch) — raw `--dump-dom` didn't surface the SPA content (would need Puppeteer + network-idle waits + scroll to even try).
LH-496 failure mix: 202 AbortError (many are dead/connection-reset, not just slow), **157× 403 (mostly Cloudflare)**, 61 TypeError, 30× 404 (dead), 130 thin-JS "OK". So the realistic rung priority is:
1. **Cheap free retry (build first):** re-fetch `AbortError`/`5xx`/`429` with a longer timeout (e.g. 20s vs 8s). Recovers *slow-but-alive* sites, zero dependency. Won't help dead sites or Cloudflare.
2. **Firecrawl (the actual unlocker):** the only thing that gets the ~157 Cloudflare 403s + thin-JS. Needs a per-session key (not on disk); gate behind `--firecrawl`. This is where the real recovery is.
3. **Raw headless Chrome: DROP as a rung** — proven weak here and can't beat Cloudflare (the dominant failure). Only revisit as a Puppeteer-based renderer if a future vertical is JS-heavy *without* anti-bot, which is rare.
4. **404 / connection-reset:** accept as dead; no rung recovers them.

**NOT in this path: SERP/Tier-2.** SERP is a *discovery* rung (find a URL/domain/facts), not a way to extract a known page's content — do not re-add it here. SERP discovery lives correctly in `search-owner.js`, a separate step with a separate goal.

**Why it was NOT needed on the LH run (don't block on this):**
- Website *recovery* is unaffected — it runs only on *no-website* leads and uses `serp_text`; the 496 failures all had a Maps website, so they're outside the recovery pool.
- *Classify* falls back to each lead's `serp_text` snippet (which usually states the trade), so failed-site leads still get a `business_type`.
- *Clay* re-checks `has_website` itself, so a local fetch failure doesn't DQ anyone.

**When to prioritize.** If a future vertical depends heavily on reading on-site content (e.g. classify precision is critical and SERP snippets are too thin), or the home-fail rate on a run is materially higher than ~15%. Decision signal already exists: `prep-classify.js` reports the `from site` vs `from serp` split — if the SERP share is large, wire the rendered rung in for that subset before classifying.

**Related:** `web-scrape-triage` skill (the ladder). `search-owner.js` is our **Tier-2 / SERP-discovery** step — a separate job (find owner/domain/facts), which is why failed-site leads remain classifiable and no-website domains stay recoverable. Tier 0 (hit the data API directly) is the rung for list/directory sources and is used by the Maps scrape (`searchmaps.php`) + the `directory-lead-sourcing` skill — not by fetch-sites.

---

# Batch found 2026-07-03→05 (Link Helpers CPA + Tax-Resolution + size-gate-swap runs)

## CRITICAL (qualify engine): noise-type `deny` matches PRIMARY google_type only, but allow can match ANY → generic-junk leaks in

**Status:** DONE 2026-07-05 (opt-in) — added `scope:"any"` to the deny op (`qualify-leads.js`): default stays PRIMARY-only (backward compatible, verified byte-identical output), opt in per-rule for unambiguous must-drop entities (gov/police/directory) that hide behind a generic primary. NOT defaulted to any-match because it's two-sided (would drop real firms with an incidental off-ICP secondary tag). The tax-res leak was fixed config-side (tighter allow) which is the safer lever. · found 2026-07-05 (LH tax-res), HIGH impact (24% list contamination). `qualify-leads.js` `deny` op checks only the lead's **primary** google_type, while the positive allow-list (once fixed, see below) checks **any** google_type. That asymmetry is how **~2,169 generic law firms (24% of a shipped tax-res list)** got through: a firm typed `Attorney | Bankruptcy attorney | Criminal` has primary `Attorney` → the `bankruptcy attorney`/`criminal` deny terms never fired (they're secondary), and the old broad `attorney` allow matched → kept. Patent attorneys, a County DA's office, a Bar Association, and a process server all rode in this way. **Fix:** make `deny` match **any** google_type (add an `any`/`primary` scope flag; default to `any` for safety), OR at minimum document loudly that deny is primary-only so config authors don't assume a secondary-type deny works. Until fixed, a positive allow-list on `google_types`-any is doing the real filtering, not the deny.

## CRITICAL (qualification DESIGN): do NOT use a review-count floor as a size gate for B2B / professional-services ICPs

**Status:** DONE 2026-07-08 — baked into SKILL.md STEP 1 item 5 (consumer-only review floors, B2B Clay-stage establishment gate, buyer-not-label). · found 2026-07-03 (LH CPA/tax-res/security), HIGH impact. A `review_count >= N` floor is a **bad size/quality proxy for any B2B ICP** — accountants, tax firms, tax attorneys, and *commercial* security firms serve businesses, and business clients almost never leave Google reviews. A solid 15-person CPA firm routinely sits at 3–4 reviews. On LH the review floor was dropping **~26k CPA + ~11k tax-res + ~8k security** leads — the majority of each universe — most of which were real small firms, not junk. **Guidance to bake into SKILL STEP 1 (qualification):** for B2B/professional-services verticals, gate "established/real" on **`years_in_business ≥ 3` + not-`solo_operator` + real website (3+ pages, modern)** — all Clay-stage signals that read the actual business — NOT on review count or a hard employee floor. Reserve review floors for consumer-facing/local-retail ICPs (restaurants, med-spas, home services) where review volume genuinely tracks size. Note the trap: the same industry can be both (residential locksmith = reviewed; commercial security = not) — gate on the **ICP's buyer**, not the industry label.

## HIGH (qualify engine): positive allow-list should match `google_types` (ANY), not just `primary_type`

**Status:** DONE 2026-07-08 — baked into SKILL.md STEP 5b (allow = google_types-any, deny asymmetry + scope:"any" + name-deny fallback). · found 2026-07-05 (LH), MEDIUM-HIGH impact. The `contains_any` allow-list rule was authored against `primary_type`, so real ICP firms **mis-primaried by Google** get dropped: `Consultant | Certified public accountant`, `Appraiser | CPA`, `Consultant | Tax attorney | Tax preparation`, `Auditor | Accountant` all fail a `primary_type` allow even though they're clearly in-ICP. Switching the allow to `field: google_types` (op `contains_any`, matches any tag) recovered a few hundred real firms per vertical **with no Clay cost**. **Fix:** default allow-lists to `google_types`-any; pair with the deny-any fix above so junk that carries an incidental ICP tag (a City government office also tagged `Bookkeeping`) still gets caught by the deny that now runs first. (Workaround applied in LH configs by hand.)

## HIGH (engine bug): `fetch-sites.js` silently defaults to `--limit 50`

**Status:** DONE 2026-07-05 — default changed to `Number(arg('limit','Infinity'))` (processes ALL leads unless `--limit` is explicitly passed). `node --check` OK. · found 2026-07-03 (LH CPA), MEDIUM-HIGH impact (silent under-processing). `const LIMIT = parseInt(arg('limit','50'),10)` — with no `--limit`, fetch-sites processes only the **first 50** website-having leads and exits with a normal "DONE: 50 leads" summary. On a 4,559-lead run it looked complete but did 50. Nothing flags it. **Fix:** default `--limit` to Infinity (process all), or hard-warn when `leads > limit` and limit was defaulted. Every LH run had to pass `--limit 100000` as a manual guard.

## HIGH (engine bug): `build-clay-csv.js` warns "cell OVER 8192" but does NOT cap → breaks Clay upload

**Status:** DONE 2026-07-05 — `build-clay-csv.js` now hard-caps every text cell to `CELL_CAP=8000B` (UTF-8-safe `capBytes()`) before write; summary line reports the cap instead of an OVER warning. Removes the manual post-cap pass (incl. from the LH resume checklist). `node --check` OK. · found 2026-07-02 (LH), MEDIUM-HIGH impact. build-clay prints `max site_text 9529B (limit 8192) OVER` but ships the oversized cell as-is. Clay's per-cell cap is 8KB, so those rows fail/truncate on upload. Every LH run needed a manual post-pass to byte-cap `site_text`/`serp_text` to ~8000B at a UTF-8 char boundary. **Fix:** build-clay should auto-cap any cell >8000B (UTF-8-safe truncation) instead of only warning.

## MEDIUM (engine): `build-netnew.js` OOMs on a large client folder

**Status:** DONE 2026-07-05 — added `refKeys()`, a single-pass parser that captures ONLY place_id + website per ref row (never the 8KB text cells); ref loop uses it instead of full `load()`. Verified: runs clean on the full LH client folder (9 refs, 30,863 prior place_ids) where it previously OOM'd; `node --check` OK. `--new` still uses full load (one file, needs all cols to write output). · found 2026-07-05 (LH), MEDIUM impact. After several big runs the client folder held multi-MB clay files (19k/9k rows w/ site_text+serp_text). `build-netnew.js` loading every `*.csv` with a place_id column into memory crashed with a V8 OOM stack. **Fix:** stream the ref files / only read the `place_id` column (not full rows w/ 8KB text cells) when building the seen-set. Workaround: hand-rolled a lightweight place_id-only dedupe.

## MEDIUM (engine config): footprint gate needs a "keep out-of-footprint US, drop only non-US" mode

**Status:** DONE 2026-07-08 — `--keep-domestic` flag skips the hub gate, drops foreign-country pins only. · found 2026-07-03 (LH), MEDIUM impact. The new `footprint-gate.js` (STEP 5b-geo) does a strict nearest-hub ≤1.0° drop. But a client may **want** the out-of-footprint US spillover (the 47-metro anchor is just where the scrape is centered, not a hard filter) and only want **non-US** removed. On LH the user chose exactly this. Also: when out-of-footprint US leads are KEPT, the **competitor lookup** must anchor them to a *genuinely-near* metro — the base hub list mapped a Seattle firm to Spokane competitors; fix was an expanded hub set (47 anchor + ~28 excluded metros). **Fix:** add a `geo.footprint.mode: "us-any"` (or `--keep-domestic`) that drops only wrong-country, keeps all in-country; and document that competitor-hub lists must cover kept out-of-footprint metros.

## MEDIUM (verticals with distress/institutional intent): add a government-office deny

**Status:** DONE 2026-07-08 — baked into SKILL.md STEP 1 item 5 (standing gov deny for distress/institutional-intent configs). · found 2026-07-03 (LH tax-res), MEDIUM impact. Distress-intent queries ("IRS tax help", "tax debt relief") surface **actual government entities** — IRS Taxpayer Assistance Centers, state Departments of Revenue, County Assessors/Treasurers, Collectors of Revenue. The security config already had gov-office denies; the tax-res config didn't and shipped ~59 gov offices before a name-deny caught them. **Fix:** any config whose queries can return public institutions should carry a gov deny (name `not_contains_any` + google_types deny): `internal revenue service`, `department of revenue`, `assessor`, `treasurer`, `collector of revenue`, `comptroller`, `city of`, `county of`, `municipal`, `clerk of court`, `social security`. (Compounds with the deny-primary-only bug — put the worst offenders in a NAME deny, which is exact.)

## LOW (operator/prompt): WebSearch subagents spawn their own sub-agents unless told not to

**Status:** DONE 2026-07-08 — baked into SKILL.md Honesty notes (mandatory do-it-yourself clause + BOM-strip rule). · found 2026-07-02 (LH AI-competitor fan-out), LOW impact. When fanning out WebSearch agents for the AI-competitor surface, ~10% of them **delegated to their own nested sub-agents** and returned prose instead of writing the output file (leaving gaps). **Fix:** every fan-out WebSearch prompt must include: *"Do the web searches YOURSELF with your WebSearch tool. Do NOT spawn, launch, or delegate to other agents. You personally write the output file."* Also worth adding to the classify/AI-competitor prompt templates.

## LOW (operator): don't pipe long-running scripts through `head`

**Status:** WONTFIX/note · found 2026-07-03. Piping `competitor-maps.js | head -N` SIGPIPE-kills the node process mid-run (it writes progress every 10 combos; head closing the pipe kills it after ~20). Resumable state saved it, but the reflex is bad. Use `| tail` or run in background and Read the output file.

---

## 2026-09-12 — run-scrape.js `--resume` (SHIPPED, approved)

An interrupted run (scraper.tech tariff exhausted mid-flight) had to re-scrape the WHOLE runsheet
to continue, re-billing tiles already paid for. `--resume` reads every `run_log.json` under `--out`
(top-level + `heal-` + `resume-` subdirs), unions the tiles that reached `status:'ok'`, and scrapes
only the remainder into a fresh `resume-N` dir. Default behaviour unchanged without the flag.
Verified against the real interrupted Atlas run: 590 skipped / 820 scraped, exactly the known state.
Covered by `tests/run-scrape-resume.test.js` (8 checks).

Note the final coverage report now unions `per_cell` across ALL logs — reading only
`<out>/run_log.json` on a resumed run would report on the FIRST pass's tiles alone.

## 2026-09-12 — `readRunsheet` does not honour `writeRunsheet` quoting (OPEN, not fixed)

`writeRunsheet` correctly quotes a field containing a comma; `readRunsheet` splits on `,` with no
quote handling. A query CONTAINING a comma therefore round-trips corrupted — and the heal loop and
`--resume` both write a runsheet and read it back, so a comma-bearing query would silently heal the
WRONG query. Not hit by Atlas (all 10 queries comma-free); found by the resume test, which now
asserts only the comma-free round-trip and carries a comment pointing here. Fix is a real CSV parse
in `readRunsheet` (`scrape.js` and `search-owner.js` already have one worth reusing) — needs
approval, same class as the `google_types` separator bug below.

## 2026-09-12 — `L2_CAP` truncates the roster off dealer-network team pages (OPEN, not fixed)

`fetch-sites.js` caps each L2 page at 2,800 chars. Basement Systems / Supportworks dealer sites put
a site-wide service menu at the top of `about-us/meet-the-team.html` and the actual roster at the
BOTTOM, so the cap keeps the menu and drops every name. 20 such pages read by hand showed only 4
rosters; re-fetching the same URLs uncapped (median 7.3k chars) showed a roster on 33/33. Candidate
fixes: a larger cap for owner-priority paths, or a tail-biased slice for pages whose URL matches the
owner/team pattern. Worked around job-locally in the Atlas run
(`clients/atlas-growth/2026-09-11_foundation-repair/fetch-owner-pages2.js`).

## 2026-09-12 — scrape.js writes run_log.json only at the END, so a killed run loses its tiles (OPEN)

Six of eight shards were killed mid-run (launch mistake, below). Because `scrape.js` persists
`run_log.json` only when it finishes, every tile those workers had already scraped was unrecorded,
so `--resume` correctly re-bought them: ~617 tiles of API spend thrown away. `--resume` works, but
its granularity is only as good as how often the log is written. Candidate fix: append per-cell
status incrementally (or checkpoint every N tiles) so a kill costs minutes, not hours. Until then,
a long scrape should be treated as all-or-nothing per shard.

## 2026-09-12 — NOTE: launch long jobs through the harness, never `nohup ... &` in a tool call

Twice in one session a `nohup <job> &` inside a Bash tool call was killed when the call returned and
its parent shell went away — first an 85-page fetcher (stopped at 5), then 6 of 8 scrape shards
(cost: the 617 tiles above). The harness's own background mode (`run_in_background: true`) keeps the
process alive across calls and reports its exit; use it for anything that outlives one call. The
giveaway is a job whose output file stops growing while its "launched" line looks fine.

## 2026-09-12 — worker-pool fetchers can exit silently with promises pending (NOTE)

A job-local pool fetcher exited code 0 mid-run with ~80 leads unprocessed and no error. Cause: the
only thing left holding the event loop was an `.unref()`'d deadline timer, so node considered the
loop empty and exited while workers were still awaiting. Symptom to recognise: exit 0, no final
log line, partial output. Rule of thumb for these small fetchers — never `.unref()` the deadline,
and prefer a sequential `for await` loop unless concurrency is genuinely needed; 85 pages
sequentially cost ~3 minutes, which was cheaper than debugging the pool.

---

# Session review — Atlas Growth foundation-repair run (2026-09-11/12)

Logged for review. The engine bugs are above; this section is about **process failures that cost
money and accuracy**, and the measurements that came out of them.

## P1 — The operator's OTHER SKILLS were never checked before improvising (ROOT CAUSE)

Three skills already in the repo covered work that got hand-rolled instead:

**`web-scrape-triage`** — its Tier 2 says, verbatim, *"Never pay a SERP key (serper / scraper.tech)
for this — the free rungs cover it"*, and lists: the built-in WebSearch tool, Jina `s.jina.ai`, and
Brave's free tier (~2k/mo). Two scraper.tech SERP plans were bought and exhausted instead.

**Reviewer correction (Fable, 2026-09-12):** the first draft of this entry claimed Jina was "free,
keyless and scriptable" and that "the whole sweep could have run in Node with no key" — *asserted
without testing*, which is the exact failure this section is logging. Tested: `s.jina.ai` now returns
`401 AuthenticationRequiredError` — **it requires an API key**, so the triage skill's "keyless" claim
is stale (corrected there). A free key may still make it the cheapest scriptable rung, but that has
to be *tested per vertical*: WebSearch's value here was its **synthesis reading BBB profile pages
that 403 a plain fetch**, and whether Jina's raw results carry the principal's name is unknown. The
defensible lesson is narrower: a scriptable SERP (Jina with a key, Brave, or a $1/1K paid key) beats
grinding turns — but confirm it returns the *field you need* on 3 leads before designing around it.

Its Tier 3 covers the 403s that were written off as unreachable (BBB profile pages, **7** of 118
owner/team pages — the other 16 failures were transient `ECONNRESET`, not anti-bot — and the
Groundworks-network domain set): `curl_cffi` TLS/JA3 impersonation, `Scrapling` with
`solve_cloudflare=True`, `crawl4ai`. None were attempted, **and on review they cannot run in this
remote container**: `curl_cffi impersonate="chrome"` resets on `example.com` too, because it bypasses
the system CA and the session sits behind a TLS-intercepting proxy. Tier-3 rungs are an
operator's-own-machine step. The failure was not skipping them here; it was not *recording* the 7
true 403s as a queue for that step.

Its Tier 1 prescribes pruning page content by **text-density + link-density scoring** before
char-capping or feeding a model (crawl4ai `PruningContentFilter`). A bespoke "strip the shared
nav by diffing a site's pages against each other" fix was written from scratch for exactly this
problem — after first shipping a scoring heuristic that threw away "Darren Crotchett President".

**`email-verify-debounce-bounceban`** — documents the two-stage MillionVerifier -> BounceBan gate
as a non-negotiable pre-campaign step, with the runner already committed at
`scripts/verify-millionverifier-bounceban.js`. The session designed an email waterfall from
scratch and asked the operator for an API key it already had a documented home for
(`$HOME/Silver GTM Systems/ENVs-Secrets/email-verification.env`).

**Rule going forward:** before improvising any capability, list the available skills and read the
ones whose description overlaps. "I did not know it existed" is a process failure, not an excuse —
the skills were one `ls` away.

## P2 — Owner extraction used regex where the skill prescribes a prompt + model read

SKILL.md STEP 6a says: fill `owner-prompt.template.md` into a job-specific `owner-prompt.md`, then
let a model read `site_text`/`serp_text` with the honesty guardrails (evidence quote must contain
the name; entity-match on full identity; never guess). **That prompt was never generated** for this
run. Instead three regex extractors were written (`extract-serp-contacts.js`,
`extract-roster-contacts.js`, plus an ad-hoc site-text sweep).

Measured cost of that choice:
- **24 business names were banked as people** — `'Basement Waterproofing'`, `'Royal Foundation'`,
  `'Cascade Mudjacking'`, `'Repair Robert'` — and had to be purged. In a first-line-personalised
  campaign those send "Hi Basement,".
- The roster parser produced **wrong names twice**, each needing a fix: branch rosters interleave a
  location ("Paul Phillips **Nashville** General Manager" -> captured "Phillips Nashville", losing
  the first name), and "&" joins titles as well as couples ("President & Owner" vs "Melanie & John
  Chaney") so a name run swallowed the next person on the roster.
- The site-text sweep produced a **~35% artifact rate** ("Party Labor", "Meet Our", "Regardless Of",
  "Owner-Led Estimates"), so all 85 candidates had to be read by hand anyway. The regex bought
  nothing over the prep -> read -> apply pattern the skill already defines.

The guardrail that would have caught every one of these is already written in the template: *the
evidence quote must contain the person's name, or drop them.*

## P3 — What the run actually established (keep these)

- **BBB is the owner registry for home-services trades.** Already written into `owner-finding.md`.
  `allowed_domains:["bbb.org"]` on a web search converted dead leads into named owners (a lead that
  the whole SERP harvest failed on returned "Robert Michael Trotter, Owner / Angela May, CEO").
- **Branch mis-attribution is the dominant failure mode on multi-location companies** and is worse
  than same-name bleed because the company name matches *exactly* — only the city differs. Observed:
  JES Virginia Beach returning the Manassas and Salem presidents; U.S. Waterproofing Schaumburg
  returning the Valparaiso owner; Crawlspace Medic Charlotte returning the Morrisville owner (the
  Charlotte owner, Jon Dando, was on their own website all along). Any owner-finding pass over a
  franchise/branch vertical must check city per contact, not just company name.
- **Web search results are non-deterministic.** The same domain-scoped query returned two named
  officers on one run and nothing on another. A single miss is not evidence of absence — record
  misses for one retry rather than writing the lead off.
- **Parallel WebSearch works**: 10 calls in one message all execute. An earlier claim in this run
  that it serialises one-per-turn was asserted without testing and was false.
- **BBB's own surface**: `www.bbb.org/api/search` returns clean JSON (name, address, phone,
  categories, service areas) but **contains no people**; the principal is only on the profile page,
  which 403s a plain fetch. That is precisely the Tier-3 case `web-scrape-triage` exists for.

## P4 — Email verification: tier before you spend

298 on-site emails were found across 273 ICP leads. Verifying all of them would have wasted most of
the credits, because verification proves deliverability, not reachability:

| bucket | n | action |
|---|---|---|
| personal-shaped on own/alternate domain (8 of these match a decision-maker we already named) | 57 | verify |
| personal on free-mail | 20 | verify |
| alternate-domain, hand-adjudicated | 4 | verify |
| role/generic (`info@`, `office@`, `estimates@`) | 133 | **skip** — valid but reaches a receptionist |
| business-name mailbox (`kennedyfoundationrepair@gmail.com`) | 61 | **skip** — company inbox in personal shape |
| template placeholder (`mymail@mailservice.com` on 3 unrelated firms) | 7 | **skip** |
| unclear | 14 | eyeball |

**81 worth verifying, not 298 — 217 credits saved.** (Reviewer note: the first draft of this table
listed the 8 name-matches as a separate row *and* inside the 57, summing to 300. Fixed.) Two classifier traps found while tiering:
a business name concatenated into the local part looks personal, and an "alternate domain" is not a
mismatch (`lsanderson@sqccolorado.com` IS Sanderson Quality Construction; `...ofga.com` IS
`...ofgeorgia.com`). Both were initially mis-filtered and had to be corrected.

## P5 — Smaller operational notes

- **PII slipped past `.gitignore` on file extension.** `verify_emails.txt` (81 live addresses) and
  `*.bak` copies of contact files matched none of the `*.csv`/`*.json`/`*.jsonl` data rules. Fixed
  by ignoring `clients/**/owner/` wholesale. Ignore data DIRECTORIES, not extensions.
- **`pgrep -f <pattern>` in a wait loop matches the loop's own command string**, so
  `until ! pgrep -f 'run-scrape.js'; do sleep 15; done` never terminates — it sees itself. Two such
  waiters span for hours. Use a marker file or exclude `$$`.
- **Do not extrapolate API cost from the first minutes of a run** (logged earlier in this file, hit
  again): the 7,000-call projection from dense TX metros came in at ~2.2 calls/tile overall.

## P6 — Added on review (Fable): unlogged engine bugs and environment facts

- **`fetch-sites.js` leaks JavaScript exceptions into its status field.** Across the two site fetches
  13 leads carry `home_failed:TypeError` and 1 carries `home_failed:AbortError`. A `TypeError` is a bug
  in the fetcher, not a property of the site, and it currently reads as if the site failed. OPEN:
  catch and log the stack, and status the lead as `fetch_error` so it is retried rather than written
  off.
- **`search-owner.js` degrades silently when the SERP vendor omits `url`/`description`.** `bundle()`
  interpolates `${x.url||''}` and `${(x.description||'').trim()}`, so a title-only response (which is
  what scraper.tech's google-search endpoint returns — `url` always empty, `description` on 2–3 of
  9) produces thin text with no warning. Downstream entity-matching then has nothing to corroborate a
  city against, which is how the branch mis-attributions became possible. OPEN: warn once per run when
  >80% of results have empty `url`; the operator should know the vendor is not delivering the field
  the guardrails depend on.
- **BBB profiles carry an `out of business` flag** (EverDry Acworth GA was returned with one) and the
  scraper.tech Maps payload carries closed-business flags too (per the triage skill's README). Neither
  is currently gated on. A contact at a closed business is a wasted send. OPEN: surface the flag as a
  column and exclude by default.
- **Dealer-network founders appear as "Owner" of many dealers.** Larry Janesky is listed as Owner of
  Connecticut Basement Systems, Basement Systems of Indiana *and* Mid-State Basement Systems because
  he founded the network. Correct data, wrong prospect — three "owners" that are one person who is not
  the local buyer. The `brand_family` flag exists for exactly this; the contact layer should inherit it
  and demote a network founder below the local GM.
- **This remote container cannot run TLS-impersonating fetchers** (curl_cffi, Scrapling stealth):
  they bypass the system CA and the session's HTTPS proxy resets the connection. Tier-3 work must be
  handed to the operator's machine, so a run should *emit* the confirmed-403 queue as a file rather
  than treat those pages as dead.

## Decision on the root cause (Fable): STEP 0 added to SKILL.md

The P1 failure is not fixable by a note in a log that a future session may not read before it starts
improvising. It is fixable by a step the skill itself forces. Added **STEP 0 — Inventory the
operator's skills** to `SKILL.md`, naming the known overlaps explicitly. A workflow that makes
skill-calling mandatory (the operator's stated plan) is the stronger fix; STEP 0 is the one that
exists today.


## P7 — Full-session review (Fable, 2026-09-12, from the transcript, not the log)

Measured on the session transcript (27 h wall clock, 501 assistant messages, 578 tool calls).

**What the numbers say**

| measure | value |
|---|---|
| tool calls | 433 Bash · 103 WebSearch · 20 Read (all overflow files, 0 repo files) · 0 Write · 0 Edit · 0 WebFetch |
| `Skill` invocations | 3 (`claude-api`, rejected by operator; `brainstorming`; `workflow-authoring`) — none of the repo's own skills, which are not registered as skills |
| reads of `SKILL.md` | 1 full read at 09:27 on day 1; next consult 12:06 on day 2 (26 h later, after the operator's complaint) |
| first `ls skills/` | day 2, 11:59, after "The skill should have everything" |
| first read of `web-scrape-triage` | day 2, 12:04, after two custom page-fetchers were already written |
| new scripts written | 30 (24 job-local in the run folder, 5 engine incl. 3 tests, 1 scratch); 5 were immediate rewrites of the previous one |
| explicit self-corrections | 14, one an admitted untested claim ("WebSearch serialises one per turn") that shaped ~5 h of one-call-per-turn work |
| WebSearch shape | 1 per message until the retraction at 09:20 day 2; then 8 messages of 10 |
| background hygiene | 1 failed shard launch; 6 shards killed by `nohup &` inside a tool call (617 tiles re-bought); 2 `until … pgrep` waiters alive ~6 h until TaskStop |
| turn ended mid-task | once, at 61/856 after "push to completion"; operator returned 2 h later with "whats up" |
| `owner-prompt.md` (STEP 6a, gated) | generated at 12:07 day 2, after the regex extraction, after the complaint |
| `STATE.md` | still read "pre-scrape, awaiting GATE 1" at review time; never updated |
| planner library profile for the vertical | none until this review |

**The shape of the failure, in one sentence:** the procedure was read once, then the run was driven from memory of it, and every capability gap was filled by writing a script instead of by looking for the skill that already covered it.

**Root causes, ranked by what fixing them buys**

1. **The skills are files, not skills.** `skills/*` is not under `.claude/skills/`, the repo has no `CLAUDE.md`, and `ListSkills` returns none of them. Nothing tells a fresh session they exist. STEP 0 is text inside a file the session did not re-read. → register them (symlink or move under `.claude/skills/`), add a root `CLAUDE.md` naming them, and put the mandate where the harness guarantees it is seen.
2. **No gate stops a script from being written.** 24 job-local scripts, none reviewed against a skill first. → a `PreToolUse` hook on `Bash` that denies `cat > clients/**/*.js <<` and `Write` of `*.js` under `clients/` unless a `<run>/.skill-check` marker exists, with the deny reason pointing at STEP 0. Cheap, deterministic, no model judgement.
3. **The gated artifacts were not gated in practice.** `build-clay-csv.js` refuses without `owner-prompt.md`, but the run never reached `build-clay`, so the gate never fired; owner extraction happened upstream of it. → move the check to the first owner-finding command (`fetch-sites.js` refuses to write `owner/` without `owner-prompt.md` beside it), and make `STATE.md` staleness a Stop-hook warning.
4. **Untested claims were stated as tested.** Parallel WebSearch, Jina keyless, Tier-3 "would have worked", the 7,000-call spend alarm. → SKILL.md Honesty note: any claim about tool behaviour that decides a design must be preceded by the 3-call probe, and the probe's output pasted.
5. **RUN-PLAN.md existed and was not followed after GATE 3.** Gates 5 and 6 (owner prompt before any owner work; STATE.md at close) were written down on day 1 and skipped on day 2. A plan in a file has the same problem as a skill in a file.

**Overlaps with sibling skills that the P1 table did not name**

- `icp-source-planner` is the declared front door for any client deliverable and dispatches to this skill; skipping it meant no `library/` profile was written and its promoted rule **R2 ("use the LLM rubric, not regex")** was never loaded. This run is R2's second occurrence.
- `web-visitor-deid-qualify` already has the exact shape owner-finding needed: "vertical logic lives entirely in the Haiku prompt, never in code", batches of ~110, merge by name, a recovery pass. Its "Common mistakes" list is the model for this skill's README §10.
- `name-to-domain` is the batch → Haiku-subagent-per-batch → merge-by-key pattern, with a reference prompt and a cache. The 856-lead WebSearch sweep should have been dispatched in that shape, not read in the main context. It is also STEP 5d's website-finder.
- `web-scrape-triage` already answered "cheapest websearch tool" (Tier 2 free rungs; cheap grounded models; "never pay a SERP key for this") before two SERP plans were bought. Its `references/methods.md` names `directory-lead-sourcing`'s `clay-jobs-serp.js` as using the same dead scraper.tech Search key: that script is stale too.
- `campaign-review` has the same three-store write-back and the same n=1 / n≥2 promotion gate. The protocol is consistent across skills; the failure is that no skill's protocol ran at the end of this run.

**Shipped in this review:** README.md (from a table of contents); owner-finding.md parallel-search correction; STATE.md brought current; planner library profile + index line + observations entry; this section.

## DONE 2026-09-12 (process, repo-wide): skills registered + hooks enforce STEP 0 and STEP 6a

- `.claude/skills/<name>` → symlink to `skills/<name>` for all 10 skills (`email-verify-debounce-bounceban/skill.md` renamed to `SKILL.md`). They now appear in the harness skill list; before this they were only files.
- Root `CLAUDE.md`: the skill table, the three enforced rules, the probe rule, engine-change and PII rules.
- `.claude/hooks/session-start.sh`: prints the skill inventory into context at session start.
- `.claude/hooks/guard.py` (PreToolUse on Bash|Write|Edit): denies creating or running `*.js|*.sh|*.py` inside `clients/<client>/YYYY-MM-DD_*/` without `<run>/.skill-check`; denies any command or write touching `<run>/owner/` or `owner_new/` without `<run>/owner-prompt.md`. Fails open on internal error. Pipe-tested on 8 cases.
- `.claude/hooks/stop-state-check.py` (Stop): blocks a stop once when a client `STATE.md` is more than 4 h older than the newest file in one of its run folders. `stop_hook_active` prevents a loop.
- Caveat: hooks written mid-session are picked up by the settings watcher only if `.claude/` had a settings file at session start; a fresh session or `/hooks` reloads them.

## DONE 2026-09-12 (engine): owner-prompt gate moved to the first owner-finding command

`fetch-sites.js` now refuses to write without `owner-prompt.md` in `--out`, its parent, or grandparent (batch sub-dirs allowed); `--no-prompt-ok` bypasses. `build-clay-csv.js` keeps its gate. SKILL STEP 6a now says: build the prompt at STEP 3 time. Test: `tests/fetch-sites-gate.test.js`.

## DONE 2026-09-12 (engine): `prep-owner-batches.js` + `merge-owner-reads.js` + `owner-read-subagent.md` (SKILL STEP 6 flow 2b)

The in-session read path the Atlas run should have used instead of regex: deterministic Node assembles per-lead evidence (site text with people pages ranked first, dedicated owner page, SERP snippets, earlier web-search evidence; caps per source; BOM-safe; `--only-missing` to top up), one Haiku subagent per batch applies `owner-prompt.md`, merge enforces the template's fixed guardrails as checks (evidence contains the name, bucket in enum, no role word in a name, dedupe) and reports every drop. Test: `tests/prep-owner-batches.test.js` (12 checks).

## OPEN: `directory-lead-sourcing/scripts/clay-jobs-serp.js` uses the dead scraper.tech Search key

Same discontinued product as `search-owner.js`. Not this skill's file; flagged for the owner of that skill.

## NOTE: `email-verify-debounce-bounceban` runners are not in the repo

Its SKILL.md points at `C:/Users/victo/gtm-processes/scripts/verify-*.js` on the operator's machine. The skill folder holds the procedure only. Verification therefore always runs off-container.

## DONE 2026-09-12 (hook bug, found live): `guard.py` resolved relative `clients/…` paths against the hook's cwd

The Bash tool's cwd persists between calls and is often deep inside the repo, so a relative run path did not resolve and the owner gate denied a legitimate `ls` (it blocked the reviewer's own command). Fixed: resolve against `$CLAUDE_PROJECT_DIR`, else the hook file's repo root; absolute prefixes first. Re-tested from `/tmp`. Two facts learned: the hook went live mid-session without a restart, and the hook scans the WHOLE command text, so a test payload that spells out a run-folder script path inside a heredoc trips it too (build test strings from a variable).

## NOTE 2026-09-12 (workflow scale): the harness caps a workflow at min(16, CPUs−2) concurrent agents

This container has 4 CPUs → 2 agents at a time. A 23-batch Haiku read at ~9 min per 40-lead batch is ~100 min wall clock, not 10. Plan batch counts against the CPU count of the machine the run is on, or run two independent workflows side by side (each gets its own cap).

## FACT 2026-09-12 (cost, measured): the Haiku web-search sweep (flow 2c) on 203 no-evidence leads

11 batches of 20, Haiku, at most 2 WebSearch calls per lead. The 8 batches whose agents loaded WebSearch: 160 leads,
203 searches (1.3 per lead), **116 named (72%)**. Whole tranche: 716k subagent tokens, 276 tool calls, 12.7 min wall
clock at 2 concurrent agents → **~4.4k Haiku tokens and ~1.3 searches per lead, ~6k tokens per NAMED lead.** Three
batches returned nothing because the agent never loaded the deferred WebSearch tool (fixed: the prompt now says
`ToolSearch select:WebSearch` first). Compare: the in-session sweep on the session model was ~1,100 tokens of
*main-context* reading per lead plus the operator's turns; this runs off the main context entirely.

## FACT 2026-09-12 (verification, measured): 81 tiered addresses through MillionVerifier → BounceBan

MV: 55 ok · 19 catch_all · 6 unknown · 1 invalid (7 role, 19 free-mail). BounceBan on the 25 catch_all/unknown: 18
deliverable (recovered) · 3 risky · 1 undeliverable · 3 empty responses on the first pass (re-run individually).
**Net: 73 sendable / 7 risky / 1 dropped = 90% sendable.** MV charged 56 credits for 80 calls; BounceBan 1 per call.
Runner now lives in `skills/email-verify-debounce-bounceban/scripts/`.

## FACT 2026-09-12 (harness limit, measured): a workflow run gets 200 WebSearch calls in total

Sweep tranche 2 (16 batches of 20) spent the budget on batches 0–8 (199 searches); batches 9–15 returned empty
batches, some with a text explanation instead of a file, none with an error. Rule: size a sweep workflow at ≤6
batches of 20 and launch several runs; the saved `owner-sweep` workflow takes `args.batchIds` for that. Second
lesson from the same hour: the saved workflow counted from 0 when given `batches: 4`, which would have overwritten
finished batches 0–3; it was stopped in time. Explicit ids, always.

## FACT 2026-09-12 (harness limit, refined): the 200-WebSearch budget is SHARED by workflows running at the same time

Three sweep runs launched together (5 + 5 + 4 batches) used 65 + 70 + 70 searches and then every remaining agent got
0; a run launched after the others finished got a fresh 200. So: **one sweep run at a time, ≤6 batches of 20 each,
launch the next when the previous reports.** A starved batch shows as "0 searches, 0 with contacts" or as prose
about CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION instead of a file; re-run those ids.

## FACT 2026-09-12 (yield, measured): the on-disk model read (flow 2b) on 901 foundation-repair leads

23 batches of 40, Haiku, 2.12M subagent tokens, 62 min at 2 concurrent (~2.4k tokens per lead). **221 of 901 named
(24.5%)**, 331 contacts, 223 owner-level. By source of the kept contact: website 102 · web-search evidence 108 ·
SERP snippet 63 · dedicated owner page 58. Guardrail drops: 24 single-token names (Haiku returns a first name alone
when that is all the page says; the template forbids it), 2 role-word names, 1 trade-word name, 1 evidence
mismatch, 1 EXCLUDE title. Two batches wrote unescaped quotes inside an evidence string (invalid JSON, repaired by
hand); the sweep prompt now says to use single quotes inside evidence.

Read this against the sweep: on the same trade the web search names ~70% of the leads it touches at ~4.4k tokens
per lead, the on-disk read ~25% at ~2.4k. For home-services the registry tier is the primary source and the site
read is the cheap first pass, exactly as `owner-finding.md` says. The regex pass this replaced had banked 242
"named" leads, 24 of which were business names.

## RESULT 2026-09-12 (Atlas Growth, foundation repair): owner-finding done the skill's way, end to end

| step | leads | named | cost |
|---|---|---|---|
| model read of on-disk text (2b), 23 batches | 901 | 221 (24.5%) | 2.1M Haiku tokens, 62 min |
| web-search sweep (2c), 5 tranches, 64 batches | 883 | 624 (70.7%) | 4.1M Haiku tokens, ~1,150 searches |
| **combined** | **1,104** | **845 (76.5%)**, 807 owner-level | ~6.3M Haiku tokens, 0 session-model reading |

Against the regex pass it replaced: 242 "named" (24 were business names; of 188 leads both name, 127 agree).
Guardrail drops across all merges: 30 single-token names, 9 evidence mismatches, 5 role-word names, 2 trade-word
names, 2 EXCLUDE titles. Three batch files needed a hand repair for an unescaped quote inside an evidence string.
Verification: 81 → 73 sendable (90%). The 796 named leads without an email are the enrichment waterfall's input.

## AUDIT 2026-09-12 (precision, measured): the "owner column" run locally on Atlas Growth

**Read (flow 2b), grounding check, deterministic:** 317 of 331 kept contacts have their evidence quote verbatim in the
lead's own source text; the other 14 are roster-page contacts whose quote spans line breaks. 329 of 331 names occur in
the source. Grounding ≈ 99%. Possible misses: of 187 unnamed leads that had site text, 4 name a founder/owner in plain
"<Name>, founder" form that Haiku did not return (recall loss on site text ≈ 2%).

**Sweep (flow 2c), independent re-search of a random sample of 30 named leads (session model, fresh WebSearch):**

| outcome | n |
|---|---|
| confirmed, full name and role | 25 |
| consistent, partial (first name or diminutive only in results: Dylan; "Darek S."; Cole Gardner as 3rd-gen lead) | 3 |
| not confirmable from search (AlphaLift managing member; Reliable Foundations "Matthew Smith", results name a co-owner Vincent Castillo instead) | 2 |
| contradicted | 0 |

Hard-confirmed precision ≥ 83%, consistent ≥ 93%, 0 of 30 wrong. A transcript-based check was attempted first and is
NOT usable: large WebSearch results go to overflow files, so "name not in transcript" proves nothing.

**Entity match:** 642 of 845 primary evidence quotes contain a distinctive token of the business name; the 203 without
are mostly website quotes of the form "Owner: Pat Kirby" where the business is implicit. Multi-location brands: 32 of
41 named, at the branch level.

**Against the Clay column as a method:** identical prompt, identical guardrails, run on Haiku off the main context;
2b+2c together named 76.5% (Clay pilots on this skill: healthcare 84%, used-car 44%). Difference from Clay: the sweep
tier is built in, and every drop is counted rather than silently absent.

## APPROVED 2026-09-13 (method): owner-finding rung order, cheapest-first, no Clay, email waterfall as STEP 6e

Operator decisions on 2026-09-12/13, in discussion: no Clay anywhere; option 1 for owners (cheap read + registry
sweep + double-check on every shaky row, no session-model rung); the email waterfall is part of owner-finding.
Written into SKILL.md STEP 6/7, owner-finding.md and README on 2026-09-13. The entry below is the proposal as it stood.

## (was) PROPOSED 2026-09-12: owner-finding rung order, cheapest-first, Clay optional

Proposal put to the operator after the Atlas Growth run; written into SKILL.md prematurely and reverted the same
hour. Not method until the operator signs off. The proposal: (1) aggregate on-disk evidence; (2) one Haiku read,
yield-gated after three batches; (3) registry-restricted sweep on still-unnamed leads, one run of ≤6 batches at a
time; (4) second opinion on medium/low-confidence rows; (5) session-model search for the head and gap-fill only;
(6) Tier-3 fetch for brand-flagged 403s only; (7) no paid vendor SERP. Hand-off would become
`contacts_final` + verified emails, with `build-clay-csv.js` optional. Measured basis in the RESULT and AUDIT
entries above. Open questions for the operator: whether Clay stays the reader for any vertical; whether the yield
gate belongs in code (`prep-owner-batches.js` filter) or stays a judgement call.

## DONE 2026-09-13 (bug → engine): wrong name on the wrong address in the Plusvibe upload — `build-plusvibe.js`

The inline build of `plusvibe_base.csv` attached the lead's primary owner name to any address at the company (Jim
Briley on `nathan@`, Nathan Simpson on `steve@`, "Signature" as a first name). A second rule trusted the waterfall's
"personal" tag, which let Tyler Nelson ride on `frontdesk@`. Fix: the name rule lives in one engine script,
recomputable from the row alone (local part built from that person's name, nicknames/initials included; role
mailboxes always nameless), with a `name_basis` column, `check` for any CSV, and `fill` refusing to write a
violating file. Test: `tests/build-plusvibe.test.js` (20 checks, the four real cases as fixtures). Measured on Atlas
Growth: 159 named rows under the loose rule → 126 under the strict local-part rule → 142 with nicknames and initials;
the 17 that stay nameless are other people's addresses (`erica@` for Daniel McCoy), role mailboxes tagged personal,
and free-mail company inboxes (`okfoundations@gmail.com`) whose owner is named on the site but not in the address.
Operator approved the rule 2026-09-13 ("yup lets do it").

## DONE 2026-09-13 (docs): Clay removed as a step everywhere

Operator, 2026-09-13: "the pipeline still reads that clay is a step here." The README pipeline table had a step 6
"Build the Clay feed", SKILL.md STEP 5b/6/6a and the flow's rungs 3-4 described the Clay column, and the owner-prompt
template, employee-count template, runbook, HANDOFF and owner-finding.md all called the reader "a Clay nano column".
Rewritten: the pipeline is scrape → qualify → owner-finding (Haiku per batch) → email waterfall → sequencer upload
(STEP 7b, `build-plusvibe.js`); the owner-prompt gate is the PreToolUse hook, not `build-clay-csv.js`. That script
and `owner-prompts.md` stay as legacy, labelled so. The word now appears only in negations and in history.

## MEDIUM (companies-house.js): exact-title matches with punctuation/"&" differences fall to low_confidence

**Status:** OPEN (job-side workaround in `clients/atlas-growth/2026-09-16_uk-foundation-repair/ch_second_pass.py`) ·
found 2026-09-16 (Atlas Growth UK foundation repair, 180 leads), MEDIUM impact — costs ~10% of the registry's names.

Problem: `nameOverlap` tokenises on words, so "Welba Construction Ltd." vs "WELBA CONSTRUCTION LTD" scores below the
match threshold when the lead has no postcode to disambiguate, and "Master Waterproofing and Renovations Limited" vs
"MASTER WATERPROOFING & RENOVATIONS LIMITED" scores 0.75 (`&` vs `and`). 83 of 180 leads came back `low_confidence`;
a second pass accepting (a) normalised-title equality (strip ltd/limited/llp/plc/the, `&`→and, punctuation) or
(b) title-contains-all-core-tokens AND registered-office outward postcode or town = lead's, recovered 17 with active
directors and no wrong matches on review. Fix: add rule (a) as an accept before the overlap score, and normalise `&`.
Also worth a `--town` fallback when `lead_postcode` is empty (this export had no postcode on 30% of rows).

## DONE 2026-09-16 (engine bug): `shared-hosts.js` didn't know site-builder platforms — `collapse-domains.js` merged UNRELATED firms into one root domain

**Status:** DONE 2026-09-16 — 14 site-builder / deploy platforms added to `SHARED_HOSTS` (suffix-matched, so every
business subdomain on them counts): `sitelift.site, localo.site, brand.site, square.site, netlify.app, vercel.app,
lovable.app, replit.app, pages.dev, framer.website, framer.app, glitch.me, weeblysite.com, jimdofree.com`
(`blogspot.com, wixsite.com, godaddysites.com, weebly.com, wordpress.com, strikingly.com, mystrikingly.com,
jimdosite.com, webflow.io, github.io, carrd.co, yolasite.com` were already there). Operator-approved 2026-09-16.
TDD'd in `tests/collapse-domains.test.js` (now 38 checks; 13 of them fail against the pre-fix list) — the new
fixture is four unrelated firms on `*.sitelift.site` ×3 + `*.netlify.app`, checks
`builder-platform leads classed shared_host`, `builder-platform leads NOT grouped (each its own rep, count 1)`,
`builder-platform leads have no root_domain group + no siblings`, `builder-platform leads never reach the spend
file`, plus `bare .site TLD is NOT shared` / `bare .app TLD is NOT shared` and
`real co.uk site + its subdomain still collapse together`. · found 2026-09-16 (Atlas Growth UK foundation-repair
Maps run, GATE 3 P9), **HIGH impact — it ships WRONG OWNER NAMES, silently.**

**Problem.** `sitelift.site` was classed `site`, so `collapse-domains.js` grouped **4 unrelated UK trades** —
*Sundridge Homes and Gardens*, *No Fuss Plastering*, *Fixzen Services*, *Rhodes to Improvement* — under one
`root_domain`, elected one representative, and would have fanned that one firm's site text **and its owner** to the
other three at build time: three wrong names on three wrong companies, with nothing downstream to catch it. The
same defect was latent at `location_count 1` in that run on `localo.site`, `netlify.app`, `lovable.app`,
`replit.app` and `brand.site` — invisible until two firms happen to land on the same platform. A business whose
only web presence is a subdomain on a builder platform has no site of its own; the platform domain is not a brand.

**Fix.** Data-only change in the one shared list, matched by suffix (`h === s || h.endsWith('.' + s)`), so
`a.sitelift.site` and `b.sitelift.site` are both `shared_host`: never grouped, never fetched by `fetch-sites.js`,
routed to `leads_nowebsite.csv` for the STEP 5d recovery track. **Never add a bare TLD** (`.site`, `.app`) — real
businesses own those; only the platform's registrable domain goes in the list.

## LOW-MEDIUM (coverage blind spot): `run-scrape.js` heals only `status != ok`, so an `ok` result with 0 rows is invisible

**Status:** OPEN (not implemented) · found 2026-09-16 (Atlas Growth UK foundation repair), LOW-MEDIUM impact —
unmeasured under-collection, cheap to close.

**Problem.** The heal loop re-buys a `(tile, query)` event only when its `status != ok`. A tile-query that returns
`status: ok` with **count 0** while the same tile's other queries return hundreds of rows is not a real zero — it is
an empty page the endpoint handed back — and nothing in the coverage report flags it. **36 such pairs on the UK
run**, e.g. `damp proofing` = 0 at Guildford while `structural repair` at the same centre = 288; also basement
waterproofing at Kingston and Ealing, mini piling at Liverpool. ~21 of the 36 are high-volume queries at dense
tiles.

**Candidate fix.** After pass 0, flag `ok`+0 events at centres whose other queries returned > N rows, and re-buy
them once (same runsheet, same heal machinery). Surface the count in the coverage summary either way so the hole is
visible even when the re-buy is declined. Cost is ~36–90 calls on a run of this size.

## NOTE 2026-09-17 (write-back index, Atlas Growth 2026-09-16 UK foundation-repair MAPS run)

Entries for this run that are **already logged above and are not repeated below** — cross-reference them, do not re-file:
the `MEDIUM (owner-finding, three scripts disagree on what "named" means)` entry (top of file); `DONE 2026-09-16 (engine bug):
shared-hosts.js didn't know site-builder platforms`; `LOW-MEDIUM (coverage blind spot): run-scrape.js heals only status != ok`;
and `MEDIUM (companies-house.js): exact-title matches with punctuation/"&" differences fall to low_confidence`. The six entries
below are new; each names how it relates to those where they touch.

## HIGH (fetch-sites.js, email coverage): the email regex runs on STRIPPED text and the L2 keywords never reach the contact page — four classes of address are invisible and the page they live on is never fetched

**Status:** DONE 2026-09-17 — engine change made: `fetch-sites.js` now extracts emails from the RAW body (mailto / JSON-LD / data-cfemail / tag-split-entity rungs, unioned with the old text regex, provenance in a new `emails_by_source` field) and the four contact keywords are in the default `L2_DEFAULT`, test: tests/fetch-sites-emails.test.js (ported from `clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/harvest_emails_deep.py`) · found 2026-09-17 (Atlas Growth, 2026-09-16 UK MAPS run, 676 root domains), **HIGH impact — it is the difference between a third and a half of the list being contactable.**

**Problem.** `fetch-sites.js` extracts emails with a plain regex run over the output of `htmlToText()`. That function deletes `<script>` blocks and every tag, i.e. every attribute, *before* the regex sees the page. Four whole classes of address are therefore unreachable by construction, and a fifth never gets fetched at all:

| miss | why |
|---|---|
| `mailto:` href | an attribute; the `<a>` is gone before the regex runs |
| JSON-LD `"email"` | lives in `<script type="application/ld+json">`, which `htmlToText` strips |
| Cloudflare `data-cfemail` | XOR-encoded hex attribute; the visible text is only `[email protected]` |
| `<span>@</span>` splits, `&#64;`, `[at]`, zero-width chars | broken before the regex ever sees an `@` |
| the contact page | the default `site_l2_keywords` list is owner-finding shaped (about / team / meet / …). `contact`, `contact-us`, `get-in-touch`, `enquir` are **not** in it — and a UK trade site puts its mailbox on the contact page, not the about page |

Probed on three live list sites before anything was built (`HARVEST-REPORT.md`, 3-call rule): `khbpiling.co.uk` (mailto), `piledsolutions.co.uk` (cfemail), `southwestunderpinning.co.uk` (JSON-LD). Three sites, three different rungs, and **the engine's rung returned nothing on all three.**

**Measured gain, one list.** 784 leads with a non-shared-host website → 676 unique root domains fetched (one fetch per root domain; branches read their representative), 1,523 page requests, 2.45 pages per reachable domain.

| | |
|---|---|
| addresses kept | 494 over 422 domains |
| **new to the run** (the engine's output did not contain them) | **137** — mailto 49 · tag_split 19 · cfemail **48 (100% of that rung)** · jsonld 19 · raw_html 2 |
| domains that gained an address the engine never had | 119 |
| leads that gained a sendable address | **+103** (+74 ICP, +29 damp-only) |
| ICP segment coverage | 240/686 (**35.0%**) → 314/686 (**45.8%**) |
| damp-only segment coverage | 116/174 (66.7%) → 145/174 (**83.3%**) |
| both segments | 356/860 (41.4%) → 459/860 (**53.4%**) at harvest time (**468/860, 54.4%** in the final deliverable after the re-rank below) |
| person-shaped addresses | 8 → 14 at harvest time · own-domain 257 → 330 |

Every single Cloudflare-obfuscated address was new — that rung is pure gain by construction, because the engine can only ever see the placeholder.

**Fix (engine, with a test and an operator go).** Two data/shape changes, no new dependency and no new fetch budget:
1. An `emailsIn(rawHtml)` that runs **before** `htmlToText`, over the raw response body: `mailto:` hrefs, JSON-LD `"email"`, `data-cfemail` (XOR decode), and a tag-split/entity normaliser (`&#64;`, `[at]`, `<span>@</span>`, zero-width) — then union with today's text regex and keep the existing junk / other-domain / third-party rejects. Provenance per address (`mailto | jsonld | cfemail | tag_split | raw_html | text`) so a bad rung can be switched off by evidence.
2. Add `contact`, `contact-us`, `get-in-touch`, `enquir` to the **default** `site_l2_keywords`. The UK config already carries them job-side (ICP-uk.md), which is why the L2 half of the gain was available at all; the defaults should not need a per-client override to find a contact page.

Test fixture: one page per rung plus a negative (an `info@` inside a CDN URL, and a `[email protected]` with no `data-cfemail`, neither of which may be kept). One extraction defect already found and fixed in the job-side version, worth carrying into the test: a `tag_split` match over an inline JS blob swallowed a `>` escape body and produced `u003eenquiries@…`.

**Cost note:** no extra fetch — the rungs read the body already downloaded; only the contact-page L2 adds requests (~1.5 pages per domain here, free).

## MEDIUM-HIGH (companies-house.js): the **city-only** acceptance path is ~21% wrong, and it is asserted as `matched`, so the reader never judges it

**Status:** OPEN — **job-side in `clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/demote_city_only_ch.py`; the engine change needs operator approval + a test** (not made) · found 2026-09-17 (Atlas Growth, 2026-09-16 UK MAPS run, 860 leads), MEDIUM-HIGH impact — **it ships WRONG OWNER NAMES and marks them authoritative.**

**Problem.** `companies-house.js` accepts a candidate on any of three bases and records all three identically as `matched`. Measured against a hand audit of every accepted row (`CH-REPORT.md` §4, 432 accepted):

| acceptance basis | matched | flagged wrong | error rate |
|---|---:|---:|---:|
| postcode in the registered-office snippet | 154 | 4 (3 of them false alarms) | **~0.6%** |
| name overlap ≥ 0.9 | 159 | 0 | **0%** |
| **city / town name only** | **119** | **25** | **~21%** |

A UK town is not a disambiguator in a vertical where every second firm is called `<word> Damp Proofing`: *Rentokil Property Care – Belfast* → BELFAST PROPERTY DEVELOPMENTS LTD, *Phillips Building & Property Maintenance* → ALM BUILDING SERVICES & PROPERTY MAINTENANCE LTD, *PERLINI Damp Proofing* → ABOVEWATER DAMP PROOFING LTD (the same failure the export run already caught), *Bolton Piling* → APPLETON PILING LIMITED, *BNS Groundwork London* → GROUNDWORK EAST LONDON. A 25-row random QA put the fleet-wide wrong rate at 2/25 (8%); the fleet scan put it at ~26 of 432 (~6.0%), **25 of them on this one path**. The scan under-counts — an all-generic pair it cannot see (*P&E Basement Excavation Builders* → HG P&E AGGREGATOR NOMINEES LIMITED, a nominee holding company) was caught by eye.

The damage is not the match, it is the label: `owner-prompt.md` Companies House rule 3 (reject a match whose registered title shares no distinctive token with the business name) is applied by the reader **only to `low_confidence` candidates**. A `matched` record is handed to the reader as authoritative, so the one path that needs judgement is the one path that never gets it.

**Fix (engine, needs operator approval + a test — not applied).** Demote a `cityMatch`-only acceptance to `confidence: low_confidence` with a `demoted_reason: city_only`, unless the name overlap also clears the high bar. It is a labelling change, not a drop: the candidate still reaches the reader, who applies rule 3 to it. Test: three fixtures — postcode-confirmed (stays `matched`), overlap ≥ 0.9 with a city hit (stays `matched` — that combined path measured 0% wrong on 36 rows and must not be demoted with the rest), town-name-only (demotes). Job-side precedent to port: `demote_city_only_ch.py` demoted 83 of 432 on exactly that two-part test, and `inject_ch_directors.py` renders the demoted block with the literal the prompt keys on.

**Related but distinct:** the OPEN 2026-09-16 entry *"exact-title matches with punctuation/'&' differences fall to low_confidence"* is the opposite error — real matches wrongly demoted. Fixing that one (normalised-title equality as an accept) also shrinks this one, because a lead that can be accepted on a normalised title never reaches the city-only path. Downstream of both, the same-company QA on this run's combined names moved the headline from 599 to **586 of 860** — the 13 removed were branch-to-national-parent and wrong-company CH matches.

## MEDIUM (stageC / own-domain ranking): the own-domain test is exact-or-subdomain, so an obvious SIBLING domain reads as third-party and the lead ends with no email at all

**Status:** OPEN in the engine — **job-side fix in `clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/rerank_emails.py` (FIX (b), `ownness()` returning `'' | exact | subdomain | sibling`); engine port pending** — that is the implementation to port, not a substitute for it · found 2026-09-17 (Atlas Growth, 2026-09-16 UK MAPS run), MEDIUM impact — small count, but it is a *total* loss on the affected lead.

**Problem.** The own-domain test compares the address's domain to the lead's `root_domain` by exact match or subdomain. A hyphen variant or a `.com`/`.co.uk` twin — both routine on UK trade sites, where the Maps website and the mailbox domain are registered separately — is classified `other_domain` and dropped, and on a lead whose *only* address is that sibling the row ends with nothing:

    khbpiling.co.uk        -> info@khb-piling.co.uk
    dc-edney.co.uk         -> enquiries@dcedney.co.uk
    telforddampproofing.com-> info@telforddampproofing.co.uk
    tflower.uk             -> info@tflower.co.uk
    renlon.co.uk           -> survey@renlon.com

**10 leads** on this run, all of them otherwise contactable.

**Fix (engine, with a test).** Normalise before comparing: lowercase, strip hyphens, and treat the same second-level label as own-domain across `.co.uk` / `.com` / `.uk` (the public-suffix-aware `rootDomain` in `shared-hosts.js` already knows how to take a `co.uk`-style suffix off). Keep it to a sibling test — it must not become a substring test, or `damp.co.uk` starts owning `dampex.com`. Test fixture: the five pairs above as accepts, plus `dampproofing.co.uk` vs `dampproofingltd.co.uk` as a reject.

## MEDIUM (stageC / person-shape scoring): "any separated local part is `first.last`" is too loose in one direction and too tight in the other — a free-mail trade name outranks the company's own inbox, and `jim@owndomain` loses to `info@`

**Status:** OPEN in the engine — **job-side fix in `clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/rerank_emails.py` (FIX (a)); engine port pending** · found 2026-09-17 (Atlas Growth, 2026-09-16 UK MAPS run), MEDIUM impact — it picks the wrong single best address on leads that HAVE the right one.

**Problem.** The ranking is `score = kind*10 + ownness` with `person > generic > other`, and `name_from_local` calls a local part person-shaped whenever it is dotted/separated. Two failure modes, both live on this run:
- **Too loose.** A company's own trade name in a free mailbox scores `person` and beats an own-domain inbox: *BullNose Brickwork* `albion.groundworkers@gmail.com` beat `bullnosebrickwork@gmail.com`; *Russell Preservation* `russell.pres@btconnect.com` beat `info@russellpreservation.co.uk` (`HARVEST-REPORT.md` §"6 rows whose EXISTING email was replaced").
- **Too tight.** A separator is required, so a first-name-only mailbox on the company's own domain scores `other` and loses to `info@`: `jim@falconstructural.co.uk`, `garry@atkinswallcare.co.uk`, `jean@maljon.co.uk`, `paul@…`. Those are the best owner-outreach addresses on the list, and the deep harvest surfaced them only for them to be ranked away.

**Fix (engine, with a test).** Two narrow rules, no new scoring dimension: (a) a separated local is person-shaped only when the SECOND token is not a trade/company word and neither token is a generic mailbox word; (b) a single-token local that is a common first name is person-shaped. Test fixture: the four accepts (`jim@`, `garry@`, `jean@`, `paul@`) and the two rejects (`albion.groundworkers@`, `russell.pres@` against an own-domain generic), plus one unchanged `first.last@owndomain` so the normal case is pinned. Final person-shaped count on this run after the job-side re-rank: **39 of 860**.

## MEDIUM (prep-owner-batches.js ordering): a lead with no page text is dropped **before** Companies House directors are injected, so a registry-only lead is never read

**Status:** OPEN (worked around job-side with `prep_chonly_batches.py` / `prep_pass2_batches.py` in this run folder) · found 2026-09-17 (Atlas Growth, 2026-09-16 UK MAPS run), MEDIUM impact — **silent lead loss on exactly the leads the registry could answer.**

**Problem.** `prep-owner-batches.js` skips a lead with no evidence text at all (`owner/read/skipped_none.json`) and the registry block is injected into the batches *afterwards*, by a separate step. The two orderings disagree about what counts as evidence: for a UK run, Companies House **is** the evidence, and it is the only evidence the address-less service-area listings will ever have. On this run **262 of 860 leads were skipped for having no text — and 192 of them carried active CH officers** (86 authoritative, 78 `low_confidence` candidates, 28 demoted `city_only`). Those 192 were not judged by anything: not by a reader, and not by the prompt's rule 3. They needed a second, hand-built pass (`prep_chonly_batches.py`, 5 batches) plus a third after the registry's second pass (`prep_pass2_batches.py`, 2 batches of 47) to reach a reader at all — and the pass-2 batches alone named 46 leads that would otherwise have gone to a paid-ish web sweep or nowhere.

The 28 demoted `city_only` records inside that set are the sharp edge: an unjudged town-name-only match (see the city-only entry above) on a lead nothing else can check.

**Fix (engine, with a test and an operator go).** Make the skip test "no evidence of ANY kind" rather than "no page text": either inject `ch_directors` before the skip decision, or give `prep-owner-batches.js` a `--ch <companies_house.jsonl>` input it counts as evidence. Either way `skipped_none.json` should record *why* a lead was skipped, so "no text" and "nothing at all" stop being the same number. Test: a fixture lead with empty `site_text` and one active officer must land in a batch, not in `skipped_none`.

**Related:** distinct from the top-of-file `MEDIUM (owner-finding, three scripts disagree on what "named" means)` entry — that one loses leads the reader half-answered; this one loses leads the reader never saw.

## FACT / ENVIRONMENT (site-text recovery ceiling): Cloudflare's **Turnstile widget host is not allowed out of this egress**, so a challenge that needs it can never be solved from here — however long it is given

**Status:** RECORDED 2026-09-17 (Atlas Growth, 2026-09-16 UK MAPS run). Not a bug; a boundary to design against, and the reason not to buy more time on the Tier-3 rung. This is the **environment half** of the OPEN `fetch-sites.js: add a rendered/anti-bot fallback rung (triage-ladder escalation)` entry above — it does not replace it.

**Measured.** `fetch-sites.js` over 1,469 spend rows: **1,206 ok / 263 home-fetch failures**, free retry recovered 22. Failure classes: 403 ×163 · TypeError (DNS/TLS) ×41 · 503 ×22 · 404 ×16 · 500 ×7 · AbortError ×6 · the rest single figures. 153 further leads returned `ok` under 300 characters.

Branching per `web-scrape-triage`:
- **Thin shells got no rung, correctly.** Probed with a full Scrapling render and `network_idle=True`: obsbasements.co.uk / geobond.co.uk / shieldpreservation.co.uk came back at **205 / 63 / 211 characters**. They are near-empty pages, not JS shells a renderer can fill.
- **403 / challenge subset → one Scrapling `StealthyFetcher` attempt each** (0.4.15, `solve_cloudflare=True`, one `StealthySession` per worker so the clearance cookie is reused across that lead's pages): 196 candidates by review count, **126 attempted inside the ~90 min cap, 40 recovered.** `site_text.jsonl` 1,206 → **1,245 ok**; on-site emails 773 → 781; and in the downstream classifier the 40 recovered sites moved **51 rows into tier A**. The rung paid for itself.
- **The ceiling is the egress policy, not the sites.** 39 of the 86 failed attempts returned `502 upstream request failed`, and the proxy's own status endpoint names the cause: `connect_rejected … "gateway answered 502 to CONNECT", host brunhild.challenges.cloudflare.com:443`. The Turnstile widget host is not reachable, so the challenge cannot complete no matter the timeout. Reported, not routed around.
- **TLS/JA3 impersonation clears none of it** (3-call probe, `HARVEST-REPORT.md`): groundworksconstructionlondon.co.uk 403 → 403, groundworkcompanies.co.uk 403 → 403, minipilingsystems.co.uk 202/169 B → 202/169 B. Same result `RUN-NOTES.md` got on petercox / timberwise.
- **Wayback has no mirror rung right now** — re-probed 2026-09-16: `cdx/search/cdx` returns the "Internet Archive: Temporarily Offline" page and `archive.org/wayback/available` returns 429.

**Consequence for planning.** **Residue with no site text: 224 of 1,469 spend rows (15.2%)** — 70 challenge-class leads the deadline cut, 87 attempted and still blocked, 128 thin shells, 67 dead. Site text is **~85% fetchable** for this vertical from a datacentre egress and that number will not move without a residential IP or a hosted unlocker (Firecrawl: no key this run). Budget the residue into the plan instead of paying for a fourth attempt: these leads are not dropped, they go to adjudication on name + Google types with an empty `text`, which the prompt already maps to `unclear`.

## MEDIUM (build-plusvibe.js `fill`): the `OUTCOME` consistency table hardcodes ONE VERTICAL'S business types, so `flag_outcome_off_trade` is silently inert on every other vertical

**Status:** OPEN (found while writing `clients/atlas-growth/personalize-config-uk.json`; no engine change made) · found 2026-09-17 (Atlas Growth, 2026-09-16 UK MAPS run, STEP 7b), MEDIUM impact — **a silently disabled guardrail, which is worse than an absent one.**

**Problem.** `fill` computes four flags. Three are config-independent (`flag_visit_repeats_trade`, `flag_word_used_3x`, `flag_free_in_visit`). The fourth reads a table baked into the script:

    const OUTCOME = { 'foundation repair': ['repair'], 'basement waterproofing': ['waterproofing'],
      'crawl space repair': [...], 'concrete leveling': [...], 'house leveling': [...], 'slab repair': [...] };
    if (OUTCOME[filled.business_type] && !OUTCOME[filled.business_type].includes(filled.project_type)) …

Those are the US foundation-repair run's `business_type` values. Any other vertical — or the same vertical in another country — produces a `business_type` the table does not hold, the `&&` short-circuits, and the flag **can never fire**. It does not warn, and `fill_report.json` prints `flag_outcome_off_trade: []`, which reads as "checked, clean" rather than "not checked". This is the same client-neutrality defect as the DONE 2026-09-11 `apply-classify.js` fallback: one client's vertical hardcoded into a shared engine script.

It bites now: the UK config's seven trades (`damp proofing`, `structural waterproofing`, `basement waterproofing`, `underpinning`, `structural repairs`, `mini piling`, `subsidence repair`) share exactly one key with the table (`basement waterproofing`), so the flag covers a fraction of one trade and nothing else. The bug it exists to catch is a real one on the US run — batch 4 gave 26 foundation-repair shops "waterproofing".

**Fix (engine, with a test and an operator go).** Read the table from the config instead of the script: an optional `outcome_by_type` block (`business_type -> [allowed project_type, …]`) with the existing US table as the default when the key is absent, **and a loud WARN naming the count of rows whose `business_type` is not in the table** so an unchecked run can never look like a clean one. Config-shaped, not logic-shaped — the same "grow data, not logic" move as `brand_families`. Test: a UK-shaped config where `mini piling -> tanking` must flag, and a config with no block at all where today's US behaviour is unchanged.

**Until then:** the UK config carries the gap in its own `_r.engine_note_outcome_flag` note, and the 7-lead operator test (`_test_plan`) reads `project_type` against `business_type` by eye on every trade in the sample. Exercised 2026-09-17 on the full UK fill (391 rows): the by-eye read of `project_type` against `business_type` found 0 off-trade rows, because the config's per-trade table forces the pairing; the engine flag still cannot fire for these types.

## LOW (build-plusvibe.js `fill`): `clean()` passes an embedded newline through into a placeholder value

**Status:** OPEN (job-side patch in the batch output; no engine change) · found 2026-09-17 (Atlas Growth, 2026-09-16 UK MAPS run, STEP 7b), LOW impact — one row in 391, but it ships a broken subject-line-style value into a sent email.

**Problem.** A Haiku batch returned `city: "Hastings \nProud To Be A Respected"` (the Maps `city` field for that lead carried a tagline after a newline, and the reader copied it as the "known city"). `clean()` trims ends and quote marks and rejects `cannot|unknown|n/a`, but not an interior newline or carriage return, so `fill` wrote it into the upload and `check --csv` (name rule + unfilled placeholders) has no rule for it. Observed after the fill, by a `\n`-in-value scan.

**Fix (engine, with a test).** In `clean()`, collapse `[\r\n\t]+` to a single space before the length check, and have `check --csv` fail on any placeholder column that still contains a line break. Test: a batch value with a newline must come out single-line, and a CSV with a line break inside `city` must fail `check`.

**Until then:** scan the finished upload for `\n` inside `city` / `business_type` / `inspection_type` / `project_type` and patch the batch `*-out.json` value, then re-run `fill`. That is what this run did.

## MEDIUM (build-plusvibe.js `fill` / personalise reader): a blank `city` is a broken email, and the reader returns blank even where the site names its base — a job-side overrides file is the only fix today

**Status:** OPEN (job-side `owner/city_overrides.json` on both the US and the UK run) · found 2026-09-17 (Atlas Growth, 2026-09-16 UK MAPS run, STEP 7b), MEDIUM impact — **41 of 391 rows (10.5%)** rendered `Noticed you do damp proofing around .` before the fix.

**Problem.** Service-area Maps listings carry no address, so `base` writes an empty `city`. The personalisation prompt then asks the reader for the town from the site "ONLY if the known city is blank" — but the reader returned `""` for all 31 such leads that had site text, including ones whose text says `From our Beckenham base` or carries a footer postcode. Ten more had no site text at all. `fill` counts `blank_city` and the SKILL says to clear it job-side; nothing in the engine does it.

**What worked, job-side (measured).** (1) A focused re-read of the same site text with a prompt that asks ONLY for the base town and names the postcode-area letters as confirmation: **20 of 31** (footer / registered-office postcode 11, 'based in' phrase 6, headline town 3). (2) A keyless Nominatim reverse geocode at zoom 14 on the Maps lat/lon for the rest (3-call probe pasted in RUN-NOTES: Stockport / Fylde / Rotherham, <1 s each, 1 call/s): the `town` field is a town; the `city` field is often a **district** (Fylde, Mole Valley, Cherwell, Harborough, Kirklees…) and must be rejected; `village` is right but reads oddly in 'around X'. (3) For franchise / area listings the area in the business name ('Damp Detectives South West' → 'the South West'), else the county. 41/41 cleared, 0 left out.

**Fix (engine, with a test and an operator go).** Two small pieces. `base --city-overrides <json>` (place_id → city) applied before the fill, so the override file is a first-class input instead of a hand patch of `plusvibe_base.csv`. And a `city-fallback` sub-command that runs the three rungs above in order (site re-read batch prep → Nominatim with a district reject-list → county / name area) and writes that file, reporting per-rung counts. The reader prompt in `personalize-subagent.md` should also say what a base looks like (footer postcode line, 'based in', 'from our X base') — the general "read the city from the website" line loses to the service-area lists that dominate these sites.

## MEDIUM (fetch-sites.js `--firecrawl` PASS 3): hardcoded 4 workers, no 429 back-off, and no residue-only mode — the rung cannot be used as shipped on a Firecrawl Hobby plan

**Status:** OPEN (job-side runner `clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/firecrawl_residue.js`; no engine change) · found 2026-09-17 (Atlas Growth, 2026-09-16 UK MAPS run, 204-site residue), MEDIUM impact — the paid rung exists in the engine but a real run of it fails three ways.

**Problem.** Measured on the first Firecrawl key this repo has had:
1. **Concurrency.** PASS 3 runs `Math.min(4, residIdx.length)` workers. `GET /v1/team/queue-status` on this plan returns `maxConcurrency: 2`; the third and fourth requests wait and then die with `408 … timed out while waiting for a concurrency slot` (2 of the first 4 probes).
2. **Rate limit.** The plan allows **10 requests/min**. A 2-worker loop at ~7 s per site is fine, but the moment sites fail fast the loop runs ahead and every call returns `429 Rate limit exceeded. Consumed (req/min): 11` — 188 of 197 residue rows burned in under two minutes on the first attempt (no credits charged, but the queue is consumed and nothing is retried).
3. **No residue-only mode.** PASS 3 only runs inside a full `fetch-sites.js` invocation, i.e. after re-fetching every site in `--in`. There is no way to point it at an existing `site_text.jsonl` and try only the `home_failed:*` rows — which is the only way anyone will ever use a paid rung.

**Fix (engine, with a test and an operator go).** (a) Read `maxConcurrency` from `queue-status` at start and cap the workers at it (default 2 when the call fails). (b) Space request starts at `60/limit` seconds and on a 429 sleep for the `Retry-After` header (else 60 s) and re-queue the row; count 429s separately from failures. (c) Add `--firecrawl-residue <site_text.jsonl>`: read the file, attempt only `status != ok` rows (skipping `404/400/402/307`, which are dead by definition), write recovered rows back in place with `source: 'firecrawl'`, resumable. (d) A recovered page whose markdown is a challenge page (`Just a moment`, `Enable JavaScript and cookies`) or under ~200 chars is NOT `ok` — the job-side runner had to add that check. Test: a fake Firecrawl endpoint that returns 429 once then 200, asserting the row is retried and the worker count honours the cap.

**Yield note for planning:** on this run's residue the alive-behind-403 sites had already been recovered by the free Scrapling rung (40); what Firecrawl was left with was mostly parked domains and dead hosts. Order the residue DNS/TLS/5xx/timeout first and 403 last, and expect the 403 class to be mostly dead once Scrapling has had its pass.
