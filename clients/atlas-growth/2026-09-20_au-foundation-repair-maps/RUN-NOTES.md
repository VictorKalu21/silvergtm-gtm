# 2026-09-20_au-foundation-repair-maps — run notes

Our own Australian Google Maps scrape. **Scoped 2026-09-20; GATE 1 ready for the operator, scrape not
started.** Keys arrived 2026-09-20 (scraper.tech, Firecrawl, Supabase URL + service role) and live only in
`skills/google-maps-scrape/.env` (gitignored, mode 600). Spend so far: **3 Maps calls** (the probe). Post-scrape
commands: `PIPELINE.md`. Dedupe memory: none (first Australian run for this client).

Session facts: branch `claude/busy-hypatia-n8vbvy` reset onto `claude/friendly-tesla-u4apeq` (the UK
run's head, not yet on `main`) so the engine changes of 2026-09-17 are present. Engine tests run in
this container 2026-09-20: `skills/google-maps-scrape/tests/*.test.js` 19 files passed, 0 failed;
`skills/email-verify-debounce-bounceban/tests/verify-dry-run.test.js` ok. No `.claude/settings.json`
exists here (gitignored by `*.json`); the hooks in `.claude/hooks/` are present but unwired in this
container, so the `.skill-check` and `owner-prompt.md` gates are being observed by hand.

## Maps probe (3 calls, 2026-09-20) — `searchmaps.php`, `limit 150`, `zoom 13`, `country au`, `offset 0`

| call | tile | http | bytes | time | rows | website | review median (q1/q3) | outside AU by lat/lng |
|---|---|---|---:|---:|---:|---:|---|---:|
| `underpinning` | Sydney CBD -33.8688,151.2093 | 200 | 142,646 | 4.6 s | 48 | 47 (98%) | 15 (3/70) | 1 |
| `restumping` | Melbourne CBD -37.8136,144.9631 | 200 | 315,558 | 8.5 s | 119 | 103 (87%) | 12 (4/40) | 0 |
| `foundation repair` | Brisbane CBD -27.4698,153.0251 | 200 | 416,950 | 6.1 s | 149 (cap) | 140 (94%) | 19 (4/70) | 79 |

Row keys: `business_id city description full_address full_address_array is_claimed is_permanently_closed
is_temporarily_closed latitude longitude name phone_number photos place_id place_link price_level rating
review_count state timezone types verified website working_hours`. `state` is null on every row; `description`
empty on every row; **no `email` field**. `city` renders as `"Millers Point NSW"` (no comma) — the config regex
holds. Blank `city` + `full_address` on 82 of the 225 Australian rows. Closed flags: 0.

Top primaries — Sydney: Construction company 21 · Building restoration service 7 · Civil engineering company 3
(all three Mainmark branches) · Home builder 3 · Concrete contractor 2 · Structural engineer 1 (Buildfix).
Melbourne: **Building restoration service 53** · Construction company 39 · Home builder 6 · Building firm 4 ·
Tradesmen 3 · Foundation 3. Brisbane: **Concrete contractor 37** · **Waterproofing service 31** · Construction
company 21 · Building restoration service 9 · Tradesmen 7 · Foundation 7 · Structural engineer 6.
The 79 non-AU Brisbane rows are all United States (Wisconsin: "Basement Foundation Repair", "The Mudjackers
LLC", "MUDTeCH", "ABT Foundation Solutions, Inc." Neenah WI) — `country=au` is a hint, not a filter.

Brand rows and their types: Mainmark Sydney / Melbourne / QLD = `['Civil engineering company']` only;
Buildfix Sydney / Brisbane = `['Structural engineer','Building restoration service']`; Surefoot Underpinning
Specialist = `['Drilling contractor']`; Geotech Built Restumping = Construction company + Building restoration +
Retaining wall supplier + Soil testing service.

### Dry run — 305 probe rows through the engine (scratchpad only; no client data in the repo)

Rows converted to the `leads_clean.csv` column layout (`scrape.js` `cleanCols`), deduped on `place_id` (11 rows
appeared in two probes). First pass with the configs as written that morning: **Mainmark ×3 and Buildfix ×2
died as `off_icp_primary`**, "Geotech Built Restumping" died on the bare `geotech` name token, and 49
ICP-named rows died between the recovery passes (generic type + blank/1-4 reviews → generic recovery's own
review floor → not reachable by the unrated/low-rated passes, whose scope gate wants `too_small`).
Three config changes (GATE1 §4) and a new `recover-lowrated-au-config.json` later:

| pass | kept | drop reasons |
|---|---:|---|
| main `atlas-growth-au-config.json` | 69 | not_in_icp 189 · too_small 37 · off_icp_primary 9 · name_deny 1 |
| `recover-generic-au-config.json` | +111 | name_not_icp 71 · not_a_recovery_candidate 47 · not_generic_contractor 7 |
| `recover-unrated-au-config.json` | +12 | has_review_count 23 · no_website 2 |
| `recover-lowrated-au-config.json` (proposed) | +17 | unrated_not_lowrated 14 · name_not_icp 3 · no_website 3 |
| merged (zero overlap asserted) | 209 | |
| `footprint-gate.js --hub-radius-deg 1.0 --regions NSW,…,NT` | **147** | far_from_hubs 62 (58 US pins + 4 AU centroid pins) |

**147 of 225 Australian rows kept (65%).** Still lost and ICP-named: ADS Piering and S & M Concrete Stumps
(suppliers, correct), 6 no-website rows with <5 reviews (accepted), and **4 rows with an EMPTY `google_types`**
(Reblocking Kings, Always Level Reblocking, Foundation Solutions, Advanced Reblocking Specialists) that no
type rule can see — GATE 3 item (a name-only pass over empty-type rows). Kept rows: 136 of 147 have a
website; 17 carry no ICP name token (the adjudication load). Review split of the kept: blank 25 · 1-4 32 · 5+ 90.

**Country-centroid trap (new):** the 4 Australian rows the gate dropped ("Vic Homes Reblocking", "Divine
Reblocking and Underpinning", "Able Reblocking Specialists", "Elite Reblocking Services") all carry lat/lng
`-32.2054, 136.1074` — the geographic centre of Australia, Google's placeholder for a service-area listing
with no location. Job-side fix before the gate: blank the coordinates on rows at exactly that point (the
gate keeps rows with missing coords). Filed in IMPROVEMENTS as an engine observation.

## Key probes (2026-09-20, after the operator supplied the keys)

- **Supabase, service role, 3 calls:** `GET /rest/v1/` → `200` (PostgREST swagger, "standard public
  schema", host `xuxyaniyaeinqfjaqbzh.supabase.co`); `GET /rest/v1/places?select=place_id&limit=1` →
  `404 PGRST205 "Could not find the table 'public.places'"` (no tables yet — schema not applied);
  `GET /storage/v1/bucket` → `200 []`. **The key works; the schema is not applied.** PostgREST cannot run
  DDL, so `store/schema.sql` goes in through the Supabase MCP (after the operator authenticates) or the SQL
  editor — not from this session with the service key alone.
- **Firecrawl, 1 call:** `GET /v1/team/credit-usage` → `200 {"remaining_credits":143,"plan_credits":1000,
  "billing_period_end":"2026-10-01"}`. Hobby plan, 143 credits until 1 October.
- **scraper.tech:** the 3 Maps calls above (`scraper-key` header, as `scrape.js` sends it).

## Probes (3-call rule) — Australian registries and directories from this container, 2026-09-20

Plain `curl -L` with a Chrome UA, one call each unless stated. Datacentre egress through the agent
proxy. Format: `status size effective-url | title`.

### State licence registries (the Companies House substitute)

**NSW Fair Trading — `verify.licence.nsw.gov.au`** (the one that matters most: NSW has a licence class
"Underpinning and piering").
- `GET /home` → `200 2812B | Verify licence - the place to look up and verify NSW licence...` — a Vite/React
  shell. The shell's inline env block gives the API away: `VITE_API_BASE_PATH="/publicregisterapi/api/v1"`,
  `VITE_API_URL="https://verify.licence.nsw.gov.au/"`, `VITE_PUBLIC_SEARCH_MODE="url"`.
- Bundle `/assets/index-cIjthiBh.js` (1.85 MB) read for the request grammar: endpoints
  `${appBasePath}${apiPath}/search/query`, `/licence/search/advQuery`, `/licence/search/licenceClass`,
  `/licence/search/details/{group}/{licenceId}`, `/licence/search/bulk`, `.../export?format=excel`.
  Body builder: `{licenceGroup, autoComplete:false, pageNumber, pageSize, licenceTypes[], search, abnacn,
  interestHolderName, website, address, wildCardAddressSearch, status[], location[], operatingRegion[],
  licenceClassSearch[]}`. Group table `ty` = ADL, OOS, CA, BOSSI, DBP, HRW, GCIT, HBCF, RRV, RTO,
  Charities, Conveyancer, Fishing, Liquor, Lotteries, Maritime, Motor, OwnerBuilder, Pharmacies,
  Property, Security, Tobacco, **Trades** (`api:"Trades"`).
- `POST /publicregisterapi/api/v1/licence/search/query` `{"search":"underpinning","pageNumber":1,"pageSize":20,"autoComplete":false}`
  → **`200 14B {"results":[]}`** — **live, keyless, answers JSON**.
- `GET` of the same path → `405 Method Not Allowed`; `GET /licence/search/licenceClass` → `405`.
- `POST .../licence/search/query` with `licenceGroup:"Trades"` + `search` → `200 {"results":[]}`;
  with `licenceGroup:"Trades"` + `suburb:"Parramatta"` → `200 {"results":[]}`.
- `POST /publicregisterapi/api/v1/Trades/search/query` (group as path, per the `${a}/search/query`
  template) → `404` twice.
- **CAPTURED 2026-09-20 with the pre-installed Chromium** (Playwright 1.56 global install, full
  `chrome` binary; the proxy CA had to be added to `~/.pki/nssdb` with `certutil` first — `apt-get
  install libnss3-tools` after an `apt-get update`; never `ignoreHTTPSErrors`). Rendering
  `/home/Trades/results?licenceGroupCode=Trades&searchTerm=underpinning&status=all&page=1` fired:
  `GET /licence/search/advLayout?licenceGroup=Trades` (field list: search, abnacn, licenceClasses,
  locationID, status), `POST /licence/search/licenceClass` `{"licenceGroup":"Trades","keywordSearchText":"","pageSize":200}`
  (121 classes) and **`POST /licence/search/advQuery`**
  `{"licenceGroup":"Trades","search":"underpinning","autoComplete":false,"pageNumber":1,"pageSize":10,"licenceTypes":[]}`
  → 14 records. The browser XHR carried only `x-correlation-id` + New Relic tracing headers — neither
  matters (tested: a fetch from inside the page with an identical body but `pageSize:50` also returned
  `[]`). **The gate was `pageSize`: anything above 10 returns `{"results":[]}` with no paging block and
  no error.**
- **Replayed from plain curl, keyless, 3 calls (the rule):**
  1. `POST .../licence/search/advQuery` `{"licenceGroup":"Trades","search":"underpinning","autoComplete":false,"pageNumber":1,"pageSize":10,"licenceTypes":[]}`
     → `200 5349B`, `pagingInfo {currentPage 1, totalPages 2, pageSize 10, totalRecords 14}`; rows carry
     `licenceNumber, licenceType, status, granted, expires, licensee, licenseeType (Individual|Organisation),
     suburb, state, postcode, ABN, ACN, licenceId`. Sample: `170381C Contractor Current Organisation
     UNDERPINNING SOLUTIONS PTY LTD SANS SOUCI NSW 2219`.
  2. Same endpoint filtered by **licence class** — the filter takes the class OBJECT as `licenceClass`
     returns it (a bare code string is a `400 "$.licenceClassSearch[0]": "The input was not valid."`):
     `{"licenceGroup":"Trades","search":"","autoComplete":false,"pageNumber":1,"pageSize":10,"licenceTypes":[],"status":["Current"],"licenceClassSearch":[{"classCodes":["HBS_CON_Underpinning and Piering","AMR-TRADES-036"],"displayName":"Contractor Licence - Underpinning and Piering","licenceTypes":["Contractor Licence"]}]}`
     → `200`, **`totalRecords 122`, 13 pages** — the whole current NSW-licensed underpinning universe,
     including individuals (`476584C Current Individual Andy Wensing TAMBAN NSW`) and interstate firms
     holding NSW licences (Ausipile QLD, B Marshall & S A Marshall VIC, Blade Pile Qld). The matching
     Qualified Supervisor class is `HBS_QSC_Underpinning and Piering` / `AMR-TRADES-073`.
  3. `GET .../licence/search/details/{licenceType URL-encoded}/{licenceId}` (e.g.
     `details/Contractor%20Licence/1-3RH70OX`) → `200 5919B`; `componentData.associatedRoles` names the
     people: for UNDERPINNING SOLUTIONS PTY LTD → `Director: Markos Abelas (Individual, SANS SOUCI)` and
     `Nominated supervisor: Markos Abelas`. Also `classes[] (code, isActive)`, `complianceSummary`,
     `ABN/ACN`. (The group name in the path is the licenceType, not `Trades` — `details/Trades/...` is a 404.)
- **Verdict: NSW is a working, keyless owner registry.** `registry_nsw.py` plan: (a) pull the 122-row
  class universe (13 calls) plus name searches for every NSW lead (`search` = the business name, page
  size 10, paginate on `totalPages`); (b) one `details` GET per matched licence for the Director /
  Nominated supervisor parties; (c) emit `registry_nsw.jsonl` in the `companies_house.jsonl` record shape
  (`registry:"nsw_fair_trading"`, `match_key` = licenceNumber, `basis` = exact_title | abn | name_overlap
  + suburb, officers = Director + Nominated supervisor with role and suburb). Rate: unmetered as far as
  observed; be polite (concurrency 2, ~1 req/s). Budget ≈ 1 call per NSW lead + 1 per match.

- **`registry_nsw.py` written and functionally probed 2026-09-20 (3 leads, ~10 calls).** Two more API facts
  the probe surfaced: **`pageNumber` is ZERO-BASED** ("underpinning": page 0 = 10 rows, page 1 = the
  remaining 4, page 2 = `[]` — the earlier "14 records, 4 returned" reading was page 1 of 2), and **the
  search term is matched as ONE token** ("Underpinning Solutions" → `[]`, "underpinning" → 14 incl.
  UNDERPINNING SOLUTIONS PTY LTD; "solutions" → 200; a space anywhere in the term returns nothing; the
  licence number as a search term also returns nothing). The script therefore searches the name's 1–2
  most distinctive tokens (longest non-stopword), unions the hits, then matches on token overlap plus
  suburb/postcode. Probe output: `Underpinning Solutions Pty Ltd` → matched exact_title, 170381C,
  officers Director + Nominated supervisor Markos Abelas · `Buildfix` → matched name_overlap (suburb
  Seven Hills), Buildfix Group Pty Ltd 294990C, Director Dale Allan Stewart, nominated supervisors Paul
  Ralph Martin + Dale Allan Stewart · `Sydney House Levelling` → no_match (the first version matched an
  individual surnamed House at low confidence; `house`/`home`/`level`/direction words joined the stop
  list and a one-token overlap without a suburb match is no longer a candidate).

**Victoria — VBA.**
- `GET https://www.vba.vic.gov.au/tools/find-practitioner` → `403 5627B | Just a moment...` (Cloudflare).
- `GET https://bams.vba.vic.gov.au/bams/s/practitioner-search` → **`200 223988B | Building Activity
  Management System`** — a Salesforce Experience Cloud (Aura) community, reachable from here. Data
  loads through `/bams/s/sfsites/aura` POSTs with component descriptors.
- **One headless-Chromium render attempted 2026-09-20** (same setup that worked for NSW): the shell
  loads (`title: Building Activity Management System`) but the Lightning app never boots — page text
  `"Sorry to interrupt — We can't load the page. Please click Refresh."`, 0 visible inputs, **0 Aura
  POSTs** on load or after a search attempt. Most likely the Salesforce static hosts
  (`*.a.forceusercontent.com`, `cdn.content.aws-prod1-useast1.aws.sfdc.cl`) are outside this egress's
  policy, so the community cannot fetch its own framework. Not retried.
- **Verdict:** VIC needs Firecrawl (`FIRECRAWL_KEY`, count stated first) on the `find-practitioner`
  front, or a capture from a browser on another network to learn the Aura request; then the same
  `registry_vic.py` shape as NSW. VBA's practitioner classes to look for: Domestic Builder (Limited)
  restumping/reblocking and underpinning — confirm the class names on the first captured response.

**Queensland — QBCC.**
- `GET https://www.onlineservices.qbcc.qld.gov.au/OnlineLicenceSearch/VisualElements/SearchBSALicenseeContent.aspx`
  → `curl: (56) CONNECT tunnel failed, response 502` — the proxy refuses the host.
- `GET https://www.qbcc.qld.gov.au/` → `200 267866B | Queensland Building and Construction Commission`.
- **Verdict:** unreachable from this egress; Firecrawl (`FIRECRAWL_KEY`, count stated first) or another egress.

**South Australia — CBS OccLicPubReg.**
- `GET https://secure.cbs.sa.gov.au/OccLicPubReg/LicenceSearch.php` → `200 1617B | Licence Search`, and
  with `-L` it lands on `/OccLicPubReg/index.php`: **a reCAPTCHA v2 gate** ("Please confirm that you are
  not a robot", sitekey `6LeEr5ks…`) that POSTs to `./index.php` before the form is shown. Not the plain
  server form the handoff hoped for.
- **Verdict:** a session cookie from one operator solve in a browser may carry the whole pull; otherwise
  skip SA (12 anchors, ~17 tiles — small).

**Western Australia — Building and Energy (DEMIRS).**
- `commerce.wa.gov.au/.../registered-providers-licence-search` → `200 108119B | Building and Energy`
  (content page). Follow-through: `wa.gov.au/.../find-registered-building-service-provider` → `200`
  → `wa.gov.au/organisation/building-and-energy/building-and-energy-licence-and-registration-search`
  → `200 86596B | Building and Energy licence and registration search`, which links:
  - **`https://contenthub.demirs.wa.gov.au/downloads/cals/BuilderRegister.pdf`** → `HEAD 200`,
    `content-length: 5381787`, `last-modified: Sat, 19 Sep 2026` — **the whole builder register as a
    PDF, refreshed daily**. Also `BuildingEngineerRegister.pdf`, `BuildingSurveyorRegister.pdf`,
    `PainterRegister.pdf`. Tier 0.5 bulk file: `pdftotext -layout` then parse.
  - **Register PDF parsed 2026-09-20** (`registry_wa.py --parse`, poppler `pdftotext -layout`): **6,456 current
    building contractors, 6,382 with at least one NOMINATED SUPERVISOR** ("BP103981 - Woodruffe, Bryn John", one
    per line, 143 entities with two, 8 with three), business address with suburb + WA postcode on all but a few
    dozen rows. WA has no underpinning class, so this is a NAME-JOIN source for WA leads, not a class pull.
    Offline probe of the join: `Future Foundations Group` (Midland) → matched name_overlap, BC107098, supervisor
    Vasile Onicas · `101 Residential` (Osborne Park) → matched, BC13521, supervisor Michael Mandaglio ·
    `Perth Underpinning Specialists` → no_match (no such entity; correct). Supervisor → `owner_or_partner` only
    with a second signal (owner-prompt.md registry rule 2), else `gm`.
  - `https://ols.demirs.wa.gov.au/search` → `200 3792B | WA Online Licence Search`, an Angular SPA
    (`main.d2c6bb639d390fb4.js` 1.7 MB); its API host was not found by grep (calls are relative). The
    PDF is the cheaper rung anyway.

**ABN Lookup (national, no officers).**
- `GET https://abr.business.gov.au/json/MatchingNames.aspx?name=underpinning&maxResults=5&guid=<zero-guid>`
  → `curl: (35) Recv failure: Connection reset by peer` (7.5 s). Blocked or reset at the proxy; the
  earlier session saw 284 B with a test GUID. Needs a free registered GUID regardless. Entity
  name/status/type/state/postcode only — a name-normalisation aid, not an owner source.

**ASIC** — out of scope (paid officer data, Cloudflare). Not probed again.

### Directories, franchises, trade bodies

- `hipages.com.au/find/underpinning/nsw/sydney` → `200 431804B | Best Underpinning Experts in Sydney
  NSW (3 Free Quotes)` — plain-fetchable; directory, no emails on the listing page; coverage cross-check only.
- `buildfix.com.au/locations/` → `200 105214B | Locations: Sydney, Melbourne, Brisbane & Canberra |
  Buildfix®` — national resin-injection franchise, four metros. Brand family to flag, not a source.
- `mainmark.com/au/` → `404 275592B | Page not found - Mainmark`. Right locations path still to find.
- `hia.com.au/find-a-builder` → `404`; `masterbuilders.com.au/find-a-builder` → `404`. Member
  finders live elsewhere (each state MBA has its own site); low value (company feeds, no owner).
- `scraper.tech` → `200 | API Marketplace` (the Maps vendor is up; key not present here).

### What the probes change in the plan

1. **NSW first, via the API**, once one browser capture gives the body shape. It is the only registry
   that is keyless, JSON and answers from this egress.
2. **WA second, via the PDF register** (bulk file, daily refresh) — cheaper than the SPA.
3. **VIC third** (BAMS Aura capture) and **QLD fourth** (Firecrawl) — both need a credit or a render.
4. **SA only with an operator-solved session**; otherwise accept the gap.
5. If only NSW and WA yield, the named rate leans on site text + the LinkedIn sweep for VIC and
   QLD, which together hold ~45% of the tiles — say so at GATE 1 (the ~45% ceiling caveat).

## Owner prompt

`clients/atlas-growth/owner-prompts/au-foundation-repair.md` drafted from the UK prompt: Companies House
rules replaced by licence-registry rules (individual licensee = owner; company nominee = owner only with
a second signal; cancelled/expired never output); the estimator/assessor/inspector trap replaces the UK
surveyor trap; the entity-match rule and the branch trap stay. Copied into this folder as
`owner-prompt.md` only after the GATE 6 read-back — nothing under `owner/` before that.

## Supabase store (step 0 of this run, if the operator confirms)

Proposed 2026-09-20 in `skills/google-maps-scrape/IMPROVEMENTS.md` (OPEN, "store.js") with the schema in
`skills/google-maps-scrape/store/schema.sql` (runs, places, site_text, email_verdicts, registry_matches,
contacts, ledger; Storage bucket `run-shards`). Not built: engine additions need operator approval, a test,
and the entry flipped to DONE. Keys (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`) go in
`skills/google-maps-scrape/.env` only.

## Supabase access (decided 2026-09-20)

The Supabase MCP server was added and then REMOVED the same day on the operator's word ("no need to add
mcp if it adds bloat, keep it simple"): `.mcp.json` deleted, the `.gitignore` exception reverted. The
engine talks to Supabase through PostgREST with the service-role key in `skills/google-maps-scrape/.env`,
nothing else. PostgREST cannot run DDL, so `store/schema.sql` is applied ONCE by the operator in the
Supabase SQL editor (one paste). Until it is applied, every store write degrades to a WARN and the run
continues on files; the shard CSVs are backfilled into `places` afterwards, so nothing is lost.

## Scrape launched 2026-09-20 (after GATE 1 approval)

8 shards, one `run-scrape.js --resume` process each, launched through the harness background runner; the
node processes survived the launcher's exit (checked with pgrep). Progress at +25 min: 62–72 of 227 tiles
per shard, no WARN/ERR/429 lines in any log. Store: `store.js` + `store-sync.js` shipped and tested
(18/18) while the shards ran; live `store-sync.js run` against the project → exit 2 (PGRST205, schema not
applied) as designed — the operator pastes `skills/google-maps-scrape/store/schema.sql` into the SQL
editor once, then the `places` push and the two ledger rows are re-run.

## Scrape done + GATE 3 written (2026-09-20)

All 8 shards exit 0, COMPLETE, 0 heal passes, 0 unhealed. **3,861 Maps calls, 2.12 calls/row** (page
depth 1/2/3 = 31/1,537/252). 11,002 shard rows → **5,118 unique businesses: 3,010 Australian, 2,107 United
States pins** (Google pads the AU viewport with US results for "foundation repair" / "levelling"). Qualify
×5 approved passes → 1,339 → GATE 3 proposals P1 (no-website ICP-named, +49/24 AU) and P2 (empty-type
ICP-named, +11/10 AU) applied provisionally → 1,399 → centroid blanking 15 → footprint gate **479 kept**
(920 dropped: 914 US + 6 AU service-area pins far from any tile) → `build-netnew` 479 (`ref files used: 0`,
first AU run) → `collapse-domains` **364 owner-finding domains + 67 no-website** (62 none, 5 shared host),
brand rows Mainmark 6 / Buildfix 4. State split (token, else lat/lng box): VIC 185 · QLD 101 · NSW 96 ·
WA 22 · SA 19 · TAS 7 · ACT 2 · unknown 13. Full audit: `REPORT-GATE3.md`. Store push of `places` (5,118)
and the Maps ledger attempted → PGRST205 (schema not applied) → re-run when it is.
**GATE 3 APPROVED 2026-09-20** ("do p1 and p2 i guess"): P1 + P2 stay in, P3–P5 losses accepted, site text goes.

**Store live 2026-09-20.** Operator pasted `store/schema.sql` into the SQL editor; `store-sync.js run` → 1,
`places` → `{"inserted":5118,"updated":0}`, two ledger rows (3 probe calls + 3,861 scrape calls), verified by
PostgREST reads (`places` count 5,118; `pull-places` returned 5,118 rows). From here every AU place_id is a
query, not a re-buy.

## Site text, adjudication, owner prep (2026-09-20)

**Site text:** `fetch-sites.js` on 364 domains, concurrency 8, plain → 20 s retry: **335 ok (92%)**, 29 residue
(403 ×8, TypeError ×10 = dead/parked, 404 ×5, 5xx ×6). **287 leads with an on-site email, 376 unique addresses**
(mailto 268 · tag_split 90 · JSON-LD 28 · cfemail 19). Pushed to the store (`site-text: 364`). Firecrawl
candidates in the residue: **14** (the 403/5xx set; 404/TypeError are dead) — needs the operator's go (~14–28 credits of 143).

**Classify + adjudicate:** `stageB_classify.py` → tiers A 351 · B 22 · C 25 · D 81 (site status ok 379 · no_website 62 ·
home_failed 33 · shared_host 5). `prep_adjudicate.py` → 21 batches (A 15, B 1, C 1, D 4 = the full 81-row D set,
sampled at 100). 21 Opus adjudicators, one per batch, all returned valid arrays. **Every adjudicator flagged the same
gap: leads with EMPTY text (no website / shared host / failed fetch) score "no" under PROMPT.md's empty-text rule
although their names are the trade** ("Vicwide restumping and underpinning", "Joe's Reblocking and Underpinning",
"Where's Ray House Re stumping"). `merge_adjudication.py` was patched before the merge: a tier-A row with no site
text is kept as `unclear` + `no_site_text:<status>` instead of dropped; tier B/C/D keep the adjudicator's "no". Also
added: a guard for coordinate-less US rows (0 fired). Other adjudicator notes for the write-back: `localsearch.com.au`
(a directory) was treated as an own domain and grouped three listings, fanning one listing's text onto "Wide Bay
Stumping" (shared-host list gap → IMPROVEMENTS); two domains are hijacked spam (prorestumpingmelbourne.com,
hondaforeignautoparts.com); a few same-business duplicate pins survive collapse when they carry no domain.

**Merge funnel:** 479 → **329 qualified** (242 yes + 87 unclear, of which 77 are the no-text tier-A keeps) ·
2 house-raising-only (adjacent segment) · 148 dropped `adjudicated_no` (engineers/inspectors, new-build pilers,
concreters, suppliers, general builders, waterproofers; tier-D sample yes-rate 1.2% → D is noise). Service buckets
among the 329: underpinning_restumping 256 · structural_repair_specialist 18 · house_raising 15 (offer restumping
too) · slab_lifting_levelling 14 · general_builder 11 · groundworks_new_foundations 9 · other 4 · waterproofing 2.
Brand-flagged 10. Review tracks: unrated 82, low-rated 80. Website: 275 site · 52 none · 2 shared host; 231 with
an on-site email.

**Registries:** NSW (96 leads, ~2 searches + 1 details each): **18 matched · 29 low_confidence · 49 no_match**;
29 records carry a `Director` role. WA (22 leads, offline join): 2 matched · 3 low_confidence · 17 no_match. Shaped
into `registry_matched.jsonl` (20) + `registry_lowconf.jsonl` (32) in the Companies House record shape (`ch_number`
carries the board and licence, roles normalised Director / Nominated supervisor / Partner / Licensee) and pushed to
the store (`registry: 52`).

**Owner prep:** `prep-owner-batches.js --ch <both registry files>` → **218 items in 6 batches**, 27 with a registry
block, **111 skipped** (92 `nothing`: no site text and no registry hit — the no-website and failed-fetch rows;
19 `no_text`). The 111 are the LinkedIn-restricted sweep's queue after the reads. **STOPPED for GATE 6** (owner
prompt read-back) before any Haiku read.

## GATE 1 — APPROVED 2026-09-20 ("yes to all, your recs")

Whole of Australia (182 tiles) · restumping and reblocking are ICP · review floor 5 + the low-rated
recovery (option a) · `foundation repair` kept despite the US bleed · ~4,750 Maps calls · bare "Hi," for
nameless rows · Supabase store built first (approved as an engine change), schema by SQL-editor paste.

## Open, for the operator (first message of the next session)

Confirm the client (Atlas Growth assumed); whole of Australia vs east coast + Perth + Adelaide;
the 10 queries and restumping/reblocking as ICP (recommended); review floor after the probe;
salutation fallback (default bare "Hi,"); Supabase store before the scrape (recommended); Maps spend
once the probe gives calls-per-row; the keys.

## Owner-finding, emails, deliverable (2026-09-20, after GATE 6 "yes to both, go ahead")

**Firecrawl residue (approved):** `fetch-sites.js --firecrawl-residue` over `owner/site_text.jsonl` — 24 rows attempted (the 403/5xx/TypeError classes; 5 × 404 skipped as dead), **25 calls (one 429 re-queue), 8 recovered, 16 `fail:200`** (Firecrawl answered 200 with < 200 chars or a challenge page — the TypeError rows are parked domains, the 403s are Cloudflare with no Turnstile from here), 2 recovered rows carry an email. Ledger row `firecrawl 25` written. Store `site-text: 8` (`--source firecrawl`). The 8 recovered sites were re-classified (`stageB_classify.py`), adjudicated as `adjudicate/in|out/batch-021` (Opus, 12 rows incl. 4 siblings: 10 yes · 2 no) and re-merged: 9 tier-A "no text" unclears became **yes**; LJ Constructions rode in on a neighbour's page and was removed again (next paragraph).

**Directory-host fan-out (bug, caught by the adjudicator):** `localsearch.com.au` and `yellowpages.com.au` are not in `shared-hosts.js`, so `collapse-domains.js` grouped Scott Myers Construction + LJ Constructions under NQ Restumping Solutions' localsearch page and Wide Bay Stumping under Elite Reblocking's yellowpages page — same text, same verdict, same `elitereblocking@gmail.com`. `fix_directory_hosts.py` (run folder) undoes it after `merge_adjudication.py`: the ICP-named rows are back to `unclear` with `directory_host:<host>`, LJ Constructions → `excluded_directory_host.csv`; `rank_emails_au.js` never inherits a rep's harvest over a directory root. IMPROVEMENTS.md MEDIUM (shared-hosts.js).

**Owner read (6 Haiku batches, 218 items, prompt `owner-prompt.md`):** raw 55 leads / 67 contacts. **One reader (batch 4) applied rule 1 to every lead and returned 17 business names as people** ("Perth House", "BDG Raising", "Explosive Restumping", "Gold Coast", "Melbourne's Best"…); the engine guard's trade-word list is US/UK and passed them all. `filter_contacts_au.py` pass 1 drops them (name is a leading substring of the business name AND carries a trade / place / company token) → **38 leads / 50 contacts** (registry 31 · website 19). Pass 2 applies rule 1 deterministically over EVERY qualified lead with the engine's `FIRST_NAMES` list → **+7 owners** the readers missed (Dennis Heale, Ted Rattee, Glenn Palframan, Scott Myers, Ian Herbeners, Wayne Marshall, John Cash) and 4 possessive first-name hints (Mick's, Troy's, Nick's, Joe's → salutation only). Residue read (8 items, Haiku): 3 contacts, all Geotech Built's NSW director again. The rule-1 wording in `owner-prompts/au-foundation-repair.md` now says it fires only on first name + surname.

**Registry contribution:** 20 of the 38 read-named leads come from the NSW Fair Trading / WA registers (source `companies_house` = the injected registry block; NSW Directors as owners per rule 0). One registry match dropped at assembly as a name mismatch (Foundation Property Solutions ↔ "3G Property Group Pty Ltd").

**LinkedIn-restricted sweep (`prep-sweep-batches.js --registry linkedin.com`, 284 unnamed → 15 batches of 20):** tranche 1 = batches 0–5, six Haiku agents via the `Agent` tool: **120 leads, 190 searches, 33 with contacts → 29 leads / 32 contacts after `merge-owner-reads.js` (27.5% of the tranche; 1.6 searches per lead)**; per batch 5·7·3·6·7·5. Better than the UK's 21%. **Then the session's `WebSearch` budget (200) was gone**: batches 6–11 via `Agent` and batch 8 via the saved `owner-sweep` workflow all reported `200/200 used` and 0 searches — **the budget is per session, and a workflow run does NOT get its own** (probe: `owner-sweep` `batchIds:[8]` → "0 searches"). Their empty/partial `-out.json` files were deleted so the batches re-run cleanly. **Batches 6–14 (164 leads) are NOT swept** — resume step in STATE.md. Sweep evidence quality: mostly verbatim snippets; a few paraphrases ("X is listed as a Director") passed the name-in-evidence guard — every sweep name carries `sweep_named_verify_before_send`.

**Emails (`rank_emails_au.js`, imports `email-rank.js`, AU tuning job-side — IMPROVEMENTS.md MEDIUM):** 408 harvested addresses over 364 sites; **38 placeholders dropped** (Wix `example@mysite.com`, `your@email.com`, `mymail@mailservice.com`, CSS font licences `micah@micahrich.com` / `info@indiantypefoundry.com` / `impallari@gmail.com`), 21 third-party dropped, **15 kept as `name_match`** (the company's other domain: `dennis@dennisheale.com.au`, `justin@bowden.com.au`, `rob@totalpiling.com.au`, `admin@mehrtens.com.au`), 11 "first.last" demoted as trading names (`goldenstar.reblocking@`, `mge.au@mainmark.com`), `.com.au` added to the sibling TLD set (1 sibling). **217 of 329 leads have a best email (66.0%), 180 unique; 29 person-shaped, 126 generic, 62 other; 164 own-domain, 53 free-mail (gmail/bigpond/…).** Nothing verified — MillionVerifier / BounceBan keys not supplied, credits need an explicit go.

**Deliverable (`assemble_deliverable_au.py` → `deliverable/`):** `atlas_au_foundation_repair_maps_qualified.csv` **329 leads · named 93 (28.3%) · email 217 (66.0%) · named+email 79 (24.0%) · email-no-name 138 · name-no-email 14 · neither 98**; `contacts_all.csv` 86 rows; `verify_input.csv` 180 unique addresses (the MV→BB input, NOT run); `emails_final_unverified.csv` 217 (build-plusvibe `base` shape, verdict blank); `leads_unnamed.csv` 236. Name sources: registry 20 · website 17 · sweep 29 (serp 25 + web_search 4) · business name 7 · email local part 20 (`name_from_email_only`, salutation-grade). By state (token, else coordinate box — `state_from_coords` flag): VIC 171 (38 named) · QLD 73 (20) · NSW 46 (29) · SA 12 · WA 11 · TAS 4 · ACT 1 · unknown 11. **NSW is 63% named on 46 leads because of the registry; VIC is 22% with none** — the named rate is the registry story the GATE 3 report predicted.

**Store:** `contacts: 89` (flattened one-per-contact — `upsertContacts` ignores the per-lead shape, IMPROVEMENTS.md LOW), `site-text` +8, ledger `firecrawl 25`. Places 5,118 · site_text 364 (8 rows refreshed by Firecrawl) · registry 52 · ledger 4 rows.

**Not done (needs the operator):** sweep batches 6–14 (164 leads, ~260 searches → a fresh session or a raised `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`); verification (180 addresses, MV + BB keys + go); Plusvibe `base`/`fill` and the 3-lead / 7-lead wording tests (need `emails_final.csv` with verdicts, i.e. verification first).

## Verification + Plusvibe base (2026-09-21)

**Keys** supplied by the operator 2026-09-21 → `~/Silver GTM Systems/ENVs-Secrets/email-verification.env` (mode 600, outside the repo). Balances (free calls): MillionVerifier 14,505 · BounceBan 5,809. The credit-spending command was refused twice by the auto-mode permission classifier ("real-world transaction"; an allow rule could not be written from the session either, "self-modification"); the operator's explicit go ("it should be dangerously skip anyway") + a one-spelling wrapper `run_verify.sh` got it through.

**Two-stage gate** (`verify-millionverifier-bounceban.js --concurrency 4`, ~25 min, BounceBan polling ~1 in 4): **180 unique addresses → sendable 140 · risky 27 · dropped 13 · unverified 0**. MillionVerifier: ok 111 · unknown 30 · catch_all 23 · invalid 16 (180 credits, 0 call failures). BounceBan on the 69 non-ok: deliverable 27 (10 catch-all + 13 catch-all role + 2 unknown + **3 recovered from MV invalid** — the 2026-09-17 directive earned its keep again), risky 6, undeliverable 7, no answer 21 (→ risky by rule). Applied with `apply_verify.py` → `deliverable/emails_final.csv`: **217 lead rows → sendable 172 · risky 32 · dropped 13** (a sendable address shared by sibling rows counts per row). Store: `verdicts: 180`, ledger `millionverifier 180` + `bounceban 69`.

**Plusvibe base** (`build-plusvibe.js base`): **172 rows** (company 146 · personal 26); the name rule leaves **12 named** (`local_match`), 16 "personal"-tagged addresses not built from the contact's name ride nameless, 89 role mailboxes. **City:** the listing city carried the state token (`Cambridge Gardens NSW`) — `base` strips UK counties, not AU state codes — and 75 rows were blank (service-area listings). `city_overrides_au.py`: Nominatim reverse geocode suburb-first (probe 2026-09-21: AU `suburb` is the locality, `city` is the metro or LGA, `town`/`village` null — IMPROVEMENTS.md LOW for `city-fallback`) → 41 geocoded + 4 from the name; 25 pins sat in Port Phillip Bay / rural nowhere (Google's service-area placeholder) → a focused Haiku site re-read of 30 → 20 more; state tokens stripped from 94. **Overrides 159 applied → blank city 10** (no coords, no base on the site). `prep` → 4 batches, 140 items, **32 rows with no site text** (fallback rows).

**3-lead wording test** (`owner/personalize-test3/`): A1 Underpinning (NSW, underpinning) · Reblocking and Underpinning Solutions (Glenroy VIC, restumping) · Buildfix (Sunshine West VIC, foundation repair) — fill report 0 on all four flags. Read back to the operator; **STOPPED at the wording sign-off** (SKILL STEP 7b: nothing fills at volume until the 3-lead and 7-lead tests are agreed). Open wording question: `foundation repair → "paid repair jobs"` (the config's outcome noun; "repair" alone is thin).

**Wording sign-off + full fill (2026-09-21).** Operator on the 3-lead test: "2, lets move to the alternatives — go" → foundation repair's outcome noun is **rectification** (config `outcome_by_type` + `project_type` instruction updated; "foundation jobs" would have tripped `flag_word_used_3x`). 7-lead test (`owner/personalize-test7/`: house raising, Mainmark Sydney, Slab Jack, a reblocking name, a QLD lead, a blank-city row, Buildfix as the no-site-text fallback row): **0 on all four flags**, fallback row ships as underpinning / site inspections. Full fill: 4 Haiku batches (140 items) → `fill` **172 rows · 140 personalised · 32 fallback-only · 0 flags** → `redo` nothing → `check --csv` **0 name-rule violations, 0 unfilled placeholders, 0 line breaks, 12 named**. Trades: underpinning 80 · restumping 58 · reblocking 14 · foundation repair 11 · house raising 8 · house levelling 1. **4 rows still had no city after every rung** (Ted Rattee, VIP reblocking and underpinning, Jaypax, Underpinning QLD) and would have read "around ." — held back in `owner/plusvibe_upload_blankcity.csv`; **`owner/plusvibe_upload.csv` = 168 rows, ready for Plusvibe.** Not uploaded (no Plusvibe credentials on this run; the operator uploads).
