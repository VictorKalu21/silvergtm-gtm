# 2026-09-20_au-foundation-repair-maps — run notes

Our own Australian Google Maps scrape. **Scoped 2026-09-20, not started**: no `SCRAPER_TECH_KEY` in
this container, so the 3-call Maps probe (`GATE1.md` §0) has not run and GATE 1 is a draft. Post-scrape
commands: `PIPELINE.md`. Dedupe memory: none (first Australian run for this client).

Session facts: branch `claude/busy-hypatia-n8vbvy` reset onto `claude/friendly-tesla-u4apeq` (the UK
run's head, not yet on `main`) so the engine changes of 2026-09-17 are present. Engine tests run in
this container 2026-09-20: `skills/google-maps-scrape/tests/*.test.js` 19 files passed, 0 failed;
`skills/email-verify-debounce-bounceban/tests/verify-dry-run.test.js` ok. No `.claude/settings.json`
exists here (gitignored by `*.json`); the hooks in `.claude/hooks/` are present but unwired in this
container, so the `.skill-check` and `owner-prompt.md` gates are being observed by hand.

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
- **Verdict:** Tier 0 hidden API confirmed live and keyless; the exact body/path that returns rows is
  not yet captured (five body shapes tried, all `200 []` or `404`). **Next step, before any
  `registry_nsw.py`:** one Playwright capture of a real search from the UI (Chromium is pre-installed:
  render `/home`, choose the contractors register, search "underpinning", read the XHR) — the
  `web-scrape-triage` Tier 0 netlog rung. Budget: one render.

**Victoria — VBA.**
- `GET https://www.vba.vic.gov.au/tools/find-practitioner` → `403 5627B | Just a moment...` (Cloudflare).
- `GET https://bams.vba.vic.gov.au/bams/s/practitioner-search` → **`200 223988B | Building Activity
  Management System`** — a Salesforce Experience Cloud (Aura) community, reachable from here. Data
  loads through `/bams/s/sfsites/aura` POSTs with component descriptors; needs the same one-render
  capture as NSW. Firecrawl is the fallback for the `find-practitioner` front.

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

## Open, for the operator (first message of the next session)

Confirm the client (Atlas Growth assumed); whole of Australia vs east coast + Perth + Adelaide;
the 10 queries and restumping/reblocking as ICP (recommended); review floor after the probe;
salutation fallback (default bare "Hi,"); Supabase store before the scrape (recommended); Maps spend
once the probe gives calls-per-row; the keys.
