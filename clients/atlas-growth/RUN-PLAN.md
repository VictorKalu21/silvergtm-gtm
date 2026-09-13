# Atlas Growth — Foundation Repair, 10-state Google Maps build → Clay feed

**Executor:** Claude Code (Opus) in a fresh session, working in this repo on a branch off `main`.
**Approver:** Victor (gtm@audacityinvestments.com). **Engine:** `skills/google-maps-scrape/` (read `SKILL.md` + `IMPROVEMENTS.md` OPEN items *before* Phase 0 — the OPEN items are the known landmines).
**Written:** 2026-09-11, from a scoping session whose decisions are recorded here. Do not re-open a LOCKED decision; do stop at every GATE.

---

## 0. How to run this plan

Two kinds of checkpoint. Treat them differently:

| Kind | What Opus does | What happens next |
|---|---|---|
| **GATE** | Stops. Posts the checkpoint's report in chat, using `AskUserQuestion` where a choice is listed. **Does nothing further until Victor answers.** | Victor answers → Opus proceeds (or tunes and re-reports). |
| **REPORT** | Posts the report and **continues** unless a stated stop-condition is true or Victor interrupts. | — |

Standing rules for the executor (these are the engine's rules, restated so they are not skipped):
- Never edit an engine script to tune this job. Everything job-specific goes in `clients/atlas-growth/atlas-growth-config.json`. An engine change is a bug fix, needs Victor's explicit approval, and gets an `IMPROVEMENTS.md` entry.
- Always scrape through `run-scrape.js`, never `scrape.js` directly. Gate every downstream step on exit 0 / `coverage_report.json` = COMPLETE.
- **Never commit** `.env`, any `leads*.csv`, `clay.csv`, `*.jsonl`, `leads_raw.json`, or anything with a `place_id` column. `.gitignore` already blocks them; do not add exceptions beyond the two that exist (`*-config.json`, `*-runsheet.csv` under `clients/`).
- This container is **ephemeral**. Every deliverable CSV must be handed to Victor (`SendUserFile`) before the session ends — see Phase 5. Lose the CSVs and Atlas Growth's run-2 dedupe is permanently broken.
- Don't pipe a long-running script through `head` (SIGPIPE kills it mid-run). Use `| tail` or run in background and read the log.
- Update `clients/atlas-growth/STATE.md` at every GATE and at the end.

---

## 1. Locked decisions (do not re-litigate)

| Decision | Value | Why / source |
|---|---|---|
| Client | **Atlas Growth** — brand new, no prior runs | `build-netnew.js` reporting `ref files used: 0` is valid **this run only**. |
| Vertical | Foundation repair | Brief. |
| Footprint | 10 states — TX, KS, MO, OK, LA, MS, CO, GA, AL, AR — **plus 3 border metros**: Memphis TN, Chattanooga TN, Jacksonville FL | Brief said "cities" but listed states. Victor chose metro-anchored coverage + border metros that serve the footprint from outside it. |
| Coverage depth | Top ~105 metros (108 anchors incl. border) — **not** exhaustive state tiling | Victor's choice. Exhaustive tiling is tens of thousands of tiles. |
| Query matrix | P1: foundation repair · foundation contractor · foundation repair company. P2: basement waterproofing · crawl space repair · crawl space encapsulation · concrete leveling · mudjacking · house leveling · structural repair | Brief. `slabjacking` folded into `mudjacking`. 10 terms. |
| Roll-ups / franchises | **Keep everything, flag the brand** | Victor's choice. Flag = `brand_family` (config) + `location_count` (free, from `collapse-domains.js`). No chain drop. |
| Offer | *"We help foundation repair companies book 10 qualified foundation inspection appointments that turn into repair projects every month using Facebook lead generation."* | Victor. Drives target role and the owner-prompt. |
| Target role | **PROPOSED, needs sign-off at GATE 1** — see §3.4 | Victor said "we have to define it". |
| Pipeline scope | Full: scrape → qualify → geo → dedupe → collapse → owner-finding → `clay.csv` | Victor's choice. |
| SERP vendor | **ON HOLD.** `search-owner.js` is dead (scraper.tech discontinued SERP; see IMPROVEMENTS). Victor is evaluating Firecrawl / Exa / others. **v1 owner-finding = `site_text` only.** `build-clay-csv.js` tolerates a missing `serp_text.jsonl` (verified). | Do not pick a vendor. Do not build a serper backend. |
| Review floor | `review_count >= 10` | Residential foundation repair is consumer-facing → review volume tracks size (engine rule: floors are for consumer ICPs only). Tunable at GATE 3. |
| Geo gate | Two-pass (§4.3) with `--keep-domestic --regions` | Verified against `footprint-gate.js:118-141`. SKILL warns against combining those flags for a *different* intent; here the combination is deliberate and Victor signed off. |
| scraper.tech key | Validated 2026-09-11: `status: ok`, 150 records on Houston "foundation repair", ~4.2 s/call, 117/150 with website, 86/150 with ≥10 reviews | Key is the hex segment of the MCP URL Victor supplied. Lives in `.env` only. |
| Client folder | `clients/atlas-growth/` in this repo for config, runsheet generator, ICP doc, owner-prompt library, STATE.md. **CSV outputs never in git.** Supabase dedupe-ledger decision deferred to run 2. | Container has no persistent disk. |

---

## 2. Expected numbers (estimates — hold Opus to the call count, not the funnel)

| Stage | Estimate |
|---|---|
| Tile centers (108 anchors + up-front densification, §3.2) | ~150–185 |
| `searchmaps` calls incl. saturation quadrant-splits | **~3,000–3,700** |
| Sequential runtime at 4 s/call | ~4 h (23 h in a slow-API window — hence sharding, §4.1) |
| Sharded ×8 | ~30–60 min |
| Deduped `place_id` universe | ~14–20k |
| After qualify | ~9–13k (no chain drop) |
| After 10-state geo gate | ~8.5–12k |
| No-website + shared-host recovery track | ~2–3.5k of that |
| Owner-finding rows after domain collapse | materially fewer than the with-website count — `collapse_report.json` says exactly |

---

## 3. Phase 0–1: Preflight + config (no spend)

### 3.1 Preflight — **REPORT 0**
1. `git checkout -b <run-branch> origin/main` (after the engine PR is merged; if not merged, branch from `claude/lucid-shannon-dvbctz`).
2. Read `skills/google-maps-scrape/SKILL.md` end-to-end and every OPEN item in `IMPROVEMENTS.md`.
3. Ask Victor to paste the scraper.tech key; write `skills/google-maps-scrape/.env` with `SCRAPER_TECH_KEY=<key>`. Confirm `git check-ignore skills/google-maps-scrape/.env` exits 0.
4. Verify the key **without spending a search**: the MCP endpoint `https://mcp.scraper.tech/<key>` answers `tools/list` for free (there is no quota endpoint — `/usage`, `/balance` etc. 404). If MCP is awkward, one `searchmaps.php` call is acceptable.
5. Scaffold:
   ```
   clients/atlas-growth/
     atlas-growth-config.json      (committed — gitignore exception exists)
     gen-runsheet.js               (committed)
     atlas-growth-runsheet.csv     (committed — exception exists)
     ICP.md                        (committed)
     STATE.md                      (committed)
     owner-prompts/                (committed; empty until Phase 4)
     2026-MM-DD_foundation-repair/ (run folder; contents gitignored)
   ```
6. Run the engine's test suite once: `for t in skills/google-maps-scrape/tests/*.test.js; do node $t | tail -1; done` — all four must print `ALL PASS`.

Report: key live (y/n), tests green, scaffold done. Continue.

### 3.2 Runsheet — `gen-runsheet.js` → `atlas-growth-runsheet.csv`
Columns: `cell_id,icp_type,query,lat,lng,zoom,priority`. One row per **query × tile**. Zoom 13. P1 for the three primary terms, P2 for the seven adjacent. `icp_type` = `foundation` for P1 terms, `adjacent` for P2 (used by the per-ICP allow rule in §3.3). **Western longitudes are negative** — a positive value silently scrapes the wrong hemisphere and returns plausible garbage.

Anchors (108). Opus fills lat/lng from a reliable source and states the count back at GATE 1.

| State | Anchors |
|---|---|
| TX (20) | Houston · Dallas · Fort Worth · San Antonio · Austin · El Paso · Corpus Christi · Lubbock · Amarillo · McAllen · Waco · Killeen–Temple · Beaumont · Midland–Odessa · Tyler · Abilene · Wichita Falls · Laredo · Brownsville–Harlingen · College Station |
| GA (12) | Atlanta · Augusta · Columbus · Savannah · Macon · Athens · Albany · Warner Robins · Valdosta · Gainesville · Rome · Dalton |
| AL (11) | Birmingham · Montgomery · Mobile · Huntsville · Tuscaloosa · Auburn–Opelika · Dothan · Decatur · Florence–Muscle Shoals · Anniston · Gadsden |
| MS (10) | Jackson · Gulfport–Biloxi · Hattiesburg · Tupelo · Meridian · Southaven (DeSoto Co.) · Starkville · Columbus · Greenville · Vicksburg |
| CO (10) | Denver · Colorado Springs · Fort Collins · Boulder · Pueblo · Greeley · Grand Junction · Loveland · Longmont · Castle Rock |
| MO (9) | St. Louis · Kansas City · Springfield · Columbia · Joplin · Jefferson City · St. Joseph · Cape Girardeau · Branson |
| LA (9) | New Orleans · Baton Rouge · Shreveport · Lafayette · Lake Charles · Monroe · Alexandria · Houma · Northshore (Slidell–Covington) |
| AR (9) | Little Rock · NW Arkansas (Fayetteville–Springdale–Rogers) · Fort Smith · Jonesboro · Conway · Hot Springs · Pine Bluff · Texarkana · Russellville |
| OK (8) | Oklahoma City · Tulsa · Lawton · Stillwater · Enid · Muskogee · Ardmore · Bartlesville |
| KS (7) | Wichita · Overland Park (Johnson Co. / KC-KS) · Topeka · Lawrence · Manhattan · Salina · Hutchinson |
| Border (3) | Memphis TN · Chattanooga TN · Jacksonville FL |

Up-front densification (extra zoom-13 tiles offset ~0.12° from the anchor, covering the suburbs; `scrape.js` auto-quadrant-splits anything that still saturates, so this list is deliberately light): Houston +5 · Dallas +3 · Fort Worth +2 · Atlanta +5 · Denver +3 (cover Aurora, Lakewood, Littleton) · San Antonio +2 · Austin +2 · St. Louis +2 · Kansas City +2 · Oklahoma City +2 (Norman, Edmond) · Tulsa +1 (Broken Arrow) · New Orleans +1 · Birmingham +1 · Memphis +1 · Jacksonville +1. ≈ +33 tiles.

Sharding for Phase 2: `gen-runsheet.js` also writes `shards/shard-0.csv … shard-7.csv`, **round-robin by row** so every shard spans all metros and both priorities.

### 3.3 Config — `atlas-growth-config.json`
```jsonc
{
  "geo": {
    "country": "us",
    "footprint": { "mode": "areas" },
    "region_from_city": ",\\s*([A-Z]{2})\\b",
    "region_default": "US"
  },
  "categories": {
    "foundation": ["foundation repair", "foundation contractor", "foundation repair company"],
    "adjacent":   ["basement waterproofing", "crawl space repair", "crawl space encapsulation",
                   "concrete leveling", "mudjacking", "house leveling", "structural repair"]
  },
  "qualify_rules": [
    // ORDER MATTERS: first failing rule = drop_reason. Denies first so the drop reasons are honest.
    // 1. Must-drop entity types (PRIMARY google_type — the engine's deny default).
    { "field": "google_types", "op": "deny", "label": "off_icp_type", "value": [
        "auto body shop", "car repair", "truck repair", "auto repair shop",
        "home improvement store", "building materials supplier", "concrete product supplier",
        "ready mix concrete supplier", "hardware store", "tool rental service",
        "structural engineer", "engineering consultant", "civil engineer", "home inspector", "real estate inspector",
        "water damage restoration service", "fire damage restoration service", "mold remediation service",
        "mover", "moving company", "moving and storage service",
        "pest control service", "plumber",
        "non-profit organization", "charity", "community center", "religious organization" ] },
    // 2. Must-drop by NAME (exact, always fires — catches the vertical's three traps + secondary-type leakage).
    { "field": "name", "op": "not_contains_any", "label": "name_deny", "value": [
        "collision", "auto body", "body shop", "frame & alignment", "frame and alignment",
        "community foundation", "foundation inc", "scholarship", "ministries",
        "home depot", "lowe's", "lowes", "ready mix", "ready-mix", "redi-mix",
        "servpro", "paul davis", "911 restoration", "rainbow restoration",
        "terminix", "orkin", "movers", "moving" ] },
    // 3. Positive allow on google_types-ANY (never primary_type — Google mis-primaries real firms).
    //    NOTE: bare "concrete contractor" is deliberately ABSENT — most are flatwork, and allowing it
    //    floods the list (the 24%-contamination failure mode). It is recovered in §4.2 step 2 only when
    //    the NAME also says foundation/leveling.
    { "field": "google_types", "op": "allow", "label": "not_in_icp", "value": [
        "foundation", "waterproofing", "basement", "crawl space", "concrete leveling",
        "mudjacking", "structural", "piling", "pier", "underpinning", "helical", "drainage" ] },
    // 4. Size floor — consumer-facing ICP, so a review floor is legitimate here. Tunable at GATE 3.
    { "field": "review_count", "op": ">=", "value": 10, "label": "too_small" }
    // NO "website exists" rule. collapse-domains.js (STEP 5c-dom) classifies website site/shared_host/none
    // and routes no-website rows to the recovery track AFTER geo gate + dedupe, so every row sees the
    // category/name denies first (fixes SKILL 5d gotcha (b) structurally). Deliberate deviation from the
    // schema example in SKILL STEP 3.
  ],
  "brand_families": {
    // DRAFT — Opus verifies each entry against the current web before GATE 1 (ownership changes).
    "Groundworks":      ["groundworks", "alpha foundations", "foundation recovery systems"],
    "Olshan":           ["olshan"],
    "Ram Jack":         ["ram jack", "ramjack"],
    "Perma-Pier":       ["perma-pier", "permapier", "perma pier"],
    "Basement Systems": ["basement systems", "supportworks"],
    "Du-West":          ["du-west", "duwest"],
    "Abry Brothers":    ["abry"]
  },
  "owner_query": { "bias_terms": ["owner", "president", "general manager", "marketing"], "use_linkedin": false }
}
```
Gov deny is **not** included: no distress/institutional intent in these queries (the SKILL's standing gov deny is for "IRS help"-style verticals). State this at GATE 1 so it is a visible decision.

### 3.4 ICP doc — `ICP.md` (target role, PROPOSED)
Write `ICP.md` with: the offer verbatim; footprint; categories; qualify rules in plain language; and this target-role section for sign-off:

**KEEP (can say yes to a Facebook lead-gen retainer):** Owner · Co-Owner · President · CEO · Founder · Partner · **General Manager** (bare — a P&L holder at an independent) · **Marketing Manager / Director of Marketing / VP Marketing** (the buyer or champion for exactly this offer at a mid-size firm) · Operations Manager *only* at ≤2-location firms where they are the de-facto GM.
**EXCLUDE (cannot authorize; the small model will mistake them for the buyer):** **Estimator** and **Inspector** — highest-risk false positives because the offer literally sells "inspection appointments" · Foreman · Crew lead · Installer · Foundation repair technician · Field supervisor · Project manager · Sales consultant / Design specialist (the in-home closer) · Structural engineer · Office manager / Receptionist / Dispatcher / CSR · Bookkeeper · HR · any "<Department> Manager" other than General/Marketing · any "Director of <X>" other than Marketing.
**Roll-up branches:** collapse-domains resolves them to corporate leadership (one lookup per domain). A branch GM at a PE roll-up cannot authorize a vendor; corporate marketing can. These rows carry `brand_family` / `location_count` so the operator can work or skip them as a segment.

### GATE 1 — Read-back before any spend (SKILL STEP 3 mandates this)
Post, in one message:
1. Footprint: the 108 anchors by state, densification tiles, **total tile count**, **total query×tile rows**, **projected calls** (rows + estimated splits).
2. The 10 query terms and their `icp_type`.
3. The qualify rules in plain language, incl. the three deliberate calls: no `concrete contractor` allow (recovered by name in §4.2), no gov deny, no website rule.
4. The verified `brand_families` list.
5. Target role — KEEP/EXCLUDE as in §3.4. Ask: *approve / edit*.
6. Review floor 10 — ask: *approve / change*.
Use `AskUserQuestion` for 5 and 6. **Do not spend one API call until Victor says go.** Update `STATE.md`.

---

## 4. Phase 2–3: Scrape, qualify, geo, dedupe, collapse

### 4.1 Scrape — sharded (IMPROVEMENTS: `scrape.js` is sequential and buffers to memory)
Run folder: `clients/atlas-growth/<YYYY-MM-DD>_foundation-repair/`. Launch **8 concurrent workers**, each in the background with its own log:
```
for i in 0 1 2 3 4 5 6 7; do
  node skills/google-maps-scrape/run-scrape.js \
    --runsheet clients/atlas-growth/shards/shard-$i.csv \
    --config   clients/atlas-growth/atlas-growth-config.json \
    --out      clients/atlas-growth/<run>/shard-$i --max-retries 3 --stall 30 \
    > clients/atlas-growth/<run>/shard-$i.log 2>&1 &
done; wait
```
Then merge: a one-off `merge-shards.js` **in the run folder** (not the engine): concat the 8 `leads_clean.csv`, dedupe on `place_id` (union the `google_types` / `icp_type` tags across hits), write `<run>/leads_clean.csv`; concat `excluded.csv`; write `<run>/coverage_summary.json` = per-shard `coverage_report.json` status. Round-robin sharding produces ~40% cross-shard overlap — expected, removed here.

**Stop-condition:** any shard's `run-scrape.js` exited 1 (INCOMPLETE). Re-run only that shard (it self-heals the failed tiles); do not proceed with a hole.

### REPORT 2 — Calibration
Post: calls made vs projected · unique `place_id`s · per-shard COMPLETE status · `quadrant_splits` count · `empty_but_ok_centers` (list any that look suspicious — a metro anchor returning 0 for "foundation repair" is a wrong coordinate, not an empty market) · 5 spot-checked rows (name, types, city, reviews). Continue unless a shard is INCOMPLETE or a metro is suspiciously empty.

### 4.2 Qualify (two passes — no engine change)
1. `node skills/google-maps-scrape/qualify-leads.js --in <run>/leads_clean.csv --config clients/atlas-growth/atlas-growth-config.json --out <run>` → `leads_clean_qualified.csv` + `excluded_officp.csv`.
2. **Concrete-contractor recovery** (the pairing the rule engine can't express in one rule): write `<run>/recover-concrete-config.json` with two rules — `google_types allow ["concrete contractor"]` and `name contains_any ["foundation", "leveling", "levelling", "lifting", "mudjack", "slabjack", "slab jack", "pier", "piering", "underpinning", "stabiliz", "raising", "void fill", "polyjack", "poly jack"]` — and run `qualify-leads.js --in <run>/excluded_officp.csv --config <run>/recover-concrete-config.json --out <run>/recover`. Append `recover/leads_clean_qualified.csv` to `<run>/leads_clean_qualified.csv` (dedupe on `place_id`; they can't overlap but assert it). Record how many came back.
   *Evidence this matters:* on the Houston key test, 79 of 150 records for "foundation repair" were typed `Concrete contractor`, and "Two Brothers Foundation Repair" (291 reviews) was `Concrete contractor / Foundation / Home inspector`. The allow-any on `foundation` keeps that one; the recovery pass keeps the ones typed *only* `Concrete contractor` whose name says foundation.

### 4.3 Geo gate — two passes (10 states + 3 border metros without admitting all of TN/FL)
```
# pass 1: keep the 12 states, hub gate OFF (foundation SABs sit far from anchors in KS/MS)
node skills/google-maps-scrape/footprint-gate.js --in <run>/leads_clean_qualified.csv \
  --runsheet clients/atlas-growth/atlas-growth-runsheet.csv --config clients/atlas-growth/atlas-growth-config.json \
  --out <run> --keep-domestic --regions "TX,KS,MO,OK,LA,MS,CO,GA,AL,AR,TN,FL"
# pass 2: TN/FL rows only, hub gate ON at 1.0° against ONLY the 3 border-metro tiles
#   -> split TN|FL rows out of leads_clean_qualified_infootprint.csv into <run>/tnfl.csv
#   -> write <run>/border-runsheet.csv containing only the Memphis / Chattanooga / Jacksonville rows
node skills/google-maps-scrape/footprint-gate.js --in <run>/tnfl.csv --runsheet <run>/border-runsheet.csv \
  --config clients/atlas-growth/atlas-growth-config.json --out <run>/border --hub-radius-deg 1.0
#   -> final = (pass-1 output minus TN/FL rows) + border/leads_clean_qualified_infootprint.csv
```
Rows whose state token can't be parsed are **kept** by the gate (`st === ''` → no drop). Count them; if > 2% run `backfill-city.js` first.

### 4.4 Cross-run dedupe
`node skills/google-maps-scrape/build-netnew.js --new <run>/leads_clean_qualified_infootprint.csv --client clients/atlas-growth --out <run>/leads_netnew.csv`. Expect `ref files used: 0 | prior place_ids: 0` — **valid only because Atlas Growth is brand new.** Write that sentence into `STATE.md` so run 2 knows it must not see 0.

### 4.5 Collapse domains + route shared hosts (SKILL STEP 5c-dom)
`node skills/google-maps-scrape/collapse-domains.js --in <run>/leads_netnew.csv --out <run> --config clients/atlas-growth/atlas-growth-config.json`
→ `leads_domains.csv` (the spend) · `leads_nowebsite.csv` (recovery) · `leads_annotated.csv` (all rows + flags) · `domain_siblings.json` · `collapse_report.json`.

### GATE 3 — Drop-reason audit + rule tuning
Post, in one message:
1. Funnel: universe → qualified (+ concrete recovery count) → in-footprint (pass 1 drops, pass 2 drops by state) → net-new → with-website reps / no-website+shared-host.
2. `drop_reason` counts from `excluded_officp.csv`, and **10 sampled rows per reason** (name · primary type · all types · reviews · city). This is where the three traps show up or don't: flatwork under `not_in_icp`, charities/collision shops under the denies, real firms wrongly under `too_small`.
3. Per-state counts of the final list (a state with a tiny count is a runsheet gap, not a small market).
4. `collapse_report.json`: `spend_rows_saved`, `multi_location_domains`, `brand_family` counts; and the top 15 `root_domain`s by `location_count` with their `brand_family` — unlabeled multi-location domains are missing brand entries.
5. `AskUserQuestion`: review floor keep 10 / lower to 5 / raise; any rule to add or loosen; any brand to add.
**Wait.** If rules change: edit the config, re-run §4.2–4.5 (deterministic, $0), re-post the funnel, then proceed.

---

## 5. Phase 4: Owner-finding (v1 = `site_text` only)

### 5.1 fetch-sites on the representatives
`node skills/google-maps-scrape/fetch-sites.js --in <run>/leads_domains.csv --out <run>/owner --concurrency 12`
**If `leads_domains.csv` > ~8,000 rows** (IMPROVEMENTS: connection-rate saturation collapses capture on big host counts): write `<run>/batch-fetch.js` — split into ~3,000-row batches, run each with `--out <run>/owner/batch-N` at concurrency 12, **sleep 75 s between batches**, then concat the `site_text.jsonl`s. Report capture rate (rows with non-empty pages / rows). Below ~65% on a rested network → stop and report; do not push concurrency up.
Shared-host rows never reach this step (routed at §4.5); `fetch-sites` warns if any slipped through.

### 5.2 SERP — skipped by decision
No `search-owner.js`, no serper. `serp_text.jsonl` will not exist; `build-clay-csv.js` handles that (rows become `SITE_ONLY` / `NONE`). Leave the pluggable-backend seam (`owner_query.serp_backend`) as an open item in `IMPROVEMENTS.md`; do not build it in this run.

### 5.3 No-website recovery track
`search-owner.js` is dead, so the SKILL's auto-run for the recovery track cannot execute. v1: hand `leads_nowebsite.csv` to Victor for his website-finder (his step per SKILL 5d). Recovered domains come back later via `fetch-sites.js` on that subset and are merged. State clearly at GATE 5 that this track ships as a list, not enriched.

### GATE 5 — Owner prompt (build-clay refuses without it)
1. `clients/atlas-growth/owner-prompts/foundation-repair.md` does not exist yet → build it **once** from `skills/google-maps-scrape/owner-prompt.template.md` using the approved §3.4 roles and the offer. Fill every `<< >>` slot for *this* trade; write the `## DECISIONS` block in plain language (why estimator/inspector are out, why GM and marketing are in, how roll-up branches are treated); 2–3 few-shots using real foundation-repair role nouns (one KEEP, one EXCLUDE, one `[]`). Add the instruction: *evaluate EXCLUDE before KEEP; a department qualifier ("VP of Operations", "Sales Manager") is an EXCLUDE.*
2. Run the template's PER-VERTICAL CHECKLIST; every box true.
3. Save to **both** `owner-prompts/foundation-repair.md` (library, committed) and `<run>/owner-prompt.md` (gate location).
4. Post the `## DECISIONS` block and the KEEP/EXCLUDE lists. **Wait for approval.**

---

## 6. Phase 5: Clay feed, hand-off, close-out

### 6.1 Build
`node skills/google-maps-scrape/build-clay-csv.js --leads <run>/leads_annotated.csv --dir <run>/owner --out <run>/clay.csv --siblings <run>/domain_siblings.json`
Spine = every row; siblings read their representative's text (`fanned_from`); five columns appended at the end: `root_domain, location_count, brand_family, fanned_from, evidence_tier`.
**Risk:** at ~10k rows with 8 KB cells `build-clay-csv.js` `readFileSync`s `site_text.jsonl` and can OOM / hit Node's string cap (IMPROVEMENTS OPEN). If it does: that is an engine bug fix (a streaming reader) → **stop, ask Victor for approval**, implement with a test, add the `IMPROVEMENTS.md` DONE entry, continue. Do not silently split the input to dodge it.

### 6.2 Hand-off package (before the session ends — the container is reclaimed)
`SendUserFile` these, with a one-line caption each:
- `clay.csv` — the deliverable
- `leads_annotated.csv` — the full list with flags (this is also the run-2 dedupe memory)
- `leads_nowebsite.csv` — recovery track for the website-finder
- `excluded_officp.csv`, `excluded_geo.csv` — audit trail
- `collapse_report.json`, `coverage_summary.json`, `run_log` summaries
Then commit (config, runsheet, generator, ICP.md, owner-prompt library, STATE.md, IMPROVEMENTS.md, SKILL.md if a fact was learned) and push; open a PR only if Victor asks.

### 6.3 Clay instructions to include in the final report (the pipeline does not come back from Clay)
1. Upload `clay.csv`. **Filter `evidence_tier != NONE`** before running anything paid — `NONE` rows have no text and can only return nothing; `build-clay` prints the count.
2. One nano Claygent column = the approved `owner-prompt.md`, mapping `{{site_text}}` (+ `{{serp_text}}`, empty this run). Output = one deduped `contacts` array.
3. A formula column after it: **`result_tier`** — `1_EMAIL_FOUND` / `2_NAME_ONLY_NO_EMAIL` / `3_EMPTY` — from the contacts array + email waterfall. (Deliberately distinct from `evidence_tier`, which is pre-Clay.)
4. Optional deterministic guard: a formula column that flags a returned title matching the EXCLUDE list (estimator|inspector|foreman|technician|…) so a wrong owner never ships. The lists live in `owner-prompt.md`; copy them, don't retype.
5. Email waterfall on name + domain; employee count; founding date. `fanned_from` rows share contacts with their representative — dedupe by email before sending.

### GATE 6 — Final report
Post: the funnel end-to-end with real numbers · `evidence_tier` distribution · capture rate · what shipped where · what is NOT done (SERP rung, recovery-track enrichment) and the open items carried in `IMPROVEMENTS.md` · `STATE.md` updated. Run hygiene per SKILL STEP 4: keep `leads_clean*.csv`, `clay.csv`, `excluded*.csv`, `coverage_summary.json`, `owner/`, `owner-prompt.md`, config, runsheet; sweep shards/logs/`leads_raw.json` to `_archive/<date>/`.

---

## 7. Open items this run does not resolve (carry, don't solve)
- **SERP backend seam** (`owner_query.serp_backend`) — build when Victor picks a vendor. Until then, `search-owner.js` is dead and the no-website recovery track ships unenriched.
- **Dedupe ledger for run 2** — `leads_annotated.csv` handed to Victor *is* the memory. Decide Supabase (a `place_id, host, run_slug` table + a `build-netnew.js --ref-supabase` flag) before run 2; not now.
- **`fetch-sites` batch mode** and **`build-clay` streaming** are still OPEN engine items; this run uses the documented workarounds in the run folder.
- **Chain flag limit:** `location_count` sees only in-footprint branches; `brand_families` is a hand list. Neither is national franchise truth.
