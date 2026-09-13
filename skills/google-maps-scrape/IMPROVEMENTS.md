# google-maps-scrape — improvement backlog

Technical backlog for the skill's engine. Not operator-facing (see HANDOFF.md for that).

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
