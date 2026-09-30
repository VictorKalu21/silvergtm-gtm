# 2026-09-30_uk-battery-installers-mcs — run notes

Operator (2026-09-30, after the Maps generator run returned 32 residential installers): **"do this"** on
`ICP-generators-uk.md` **option A — MCS battery-certified installers as the spine**, offer reworded to home
battery / backup-power survey appointments. Source: the MCS "Find an Installer" register, keyless hidden JSON
API (web-scrape-triage Tier 1). Registry membership proves the attribute (icp-source-planner rule R3).

## Probe (3-call rule, 2026-09-30, output pasted)
```
GET https://mcscertified.com/find-an-installer/            -> 200, 534 KB; var mcsAjax = {"nonce":"b9226288a0"}
GET /wp-admin/admin-ajax.php?action=filter_installers&nonce=b9226288a0&form_type=installers&technology[]=technology_battery&page=1
   -> 200, 207 KB, {"success":true,"data":{"data":[12 rows],"pagination":{"total_pages":233,"current_page":1,"total_count":2794}}}
   same with nonce c3f2922acb -> identical 200 (either page nonce works)
row fields: installer_id, lat, lng, name, email, telephone, website, address_line_1..3, county, postcode,
   certification_number, certification_body, technology_* (0/1 × 13), region_* (0/1 × 12)
page 1: email 12/12 · website 11/12 · postcode 12/12
smoke (2 pages): 24 installers, email 24/24, website 16/24, battery+solar 24/24, battery+heat pump 7/24
```
Puller: `pull-mcs.js` (resumable, 600 ms between calls, 4 retries) → `mcs_raw.jsonl` + `mcs_leads.csv` in the
engine lead shape (`place_id = mcs:<installer_id>`, `google_types = MCS battery installer|MCS <tech>…`, plus
`email`, `certification_*`, `technologies`, `tech_*` flags, `regions_served`). Full pull launched 2026-09-30.

## Average job value (asked by the operator, web-checked 2026-09-30)
UK home battery storage, fully installed, 2026: **most homes £3,500–£8,500**; a 5 kWh unit £3,000–£5,500, a
10 kWh unit £4,000–£8,000+; 0% VAT on qualifying residential installs until 31 March 2027. Paired with a new
solar PV array the combined project runs roughly £10,000–£15,000. Sources: heatable.co.uk, bookabuilderuk.com,
homeenergyquotes.co.uk, ecoimprovements.co.uk, renewablesexcellence.co.uk (all 2026 price guides).

## Plan after the pull
1. Qualify ($0): drop national energy suppliers / roll-ups by name (Octopus, British Gas, EDF, E.ON, OVO,
   Scottish Power, SSE) and flag `brand_family`; no review floor (registry proves the trade); tag `segment`
   battery-only · battery+solar · battery+heat pump from the `tech_*` flags.
2. Dedupe against the Maps generator run (place_id differs, so key on website host + phone) so a firm in
   both lists is contacted once.
3. `collapse-domains.js` → site text (`fetch-sites.js`) → STEP 5e fit (domestic vs commercial-only) →
   Companies House (key on file) → owner read with a UK battery-installer prompt → emails (MCS email is the
   spine; on-site harvest adds owner-shaped addresses) → MillionVerifier/BounceBan (keys + go needed) →
   Plusvibe with a UK battery/backup-power personalize config.

## Back half, 2026-09-30 (after the pull)
- Qualify (`atlas-growth-battery-uk-config.json`, name deny only): 2,794 → **2,785** (−9: Leeds City Council Building
  Services, British Gas Social Housing / New Heating, E.ON Energy Installation Services ×2, Octopus Energy Services,
  Good Energy ×2, So Energy). Brand flags (never drops): Sunsave, Project Solar UK, OVO Solar, Heatable.
- Cross-run dedupe vs the generator Maps run (`dedupe-vs-maps.js`, registrable host + normalised phone; first
  version wrongly treated every `.co.uk` as a shared host and keyed only 335 sites — fixed): **−81 → 2,704 net-new.**
- Collapse: **1,470 with website + 1,231 email-only** (the register supplies the address, so these are usable rows).
- Site text: first run wrote 298 of 1,470 because the register stores scheme-less websites and `fetch-sites.js`
  silently skips them (IMPROVEMENTS OPEN 2026-09-30, MEDIUM); puller now prefixes `http://`. Second run: **1,262 ok,
  1,116 with >200 chars, 1,021 with an on-site email**; 208 failed (104 × 403, 53 TLS, 19 × 503, 15 timeouts).
- STEP 5e fit (`classify-prompt.md`, 25 batches, stronger model straight away after the generator run's Haiku
  problems; 0 invented ids, 0 missing): **residential_battery 861 · commercial_only 88 · heat_pump_led 84 ·
  electrician_general 60 · not_installer 18 · unclear 359 (343 no text)**. Audit: 73 commercial_only rows carry a
  "home" word — nav-menu "Home", samples genuinely commercial (dairy engineering, social-housing retrofit, large-scale
  solar); 13 residential rows lack a home word (kept, medium confidence).
- Lists: **`leads_icp.csv` 2,092** = 861 residential + 1,231 registry-only (fit `no_website_registry_only`; the
  operator decides whether these send — the register proves battery certification, the site could not be read);
  segments battery+solar 1,705 · +heat pump 378 · battery-only 9. `leads_icp_secondary.csv` 503 (unclear 359 +
  heat-pump-led 84 + general electrician 60). `excluded_fit.csv` 106.
- Companies House running over all 2,704 (no resume flag; if it outlives its window the remainder runs on a
  filtered lead file). Owner read + emails follow on `leads_icp.csv`.

## Text recovery for rows without site text (operator: "use web scrape triage and firecrawl", Firecrawl key 2026-09-30)
Probe: `GET /v1/team/queue-status` → 200 `maxConcurrency 2`; one `/v1/scrape` → 200, 7.9 KB markdown, 1 credit.
1. **Firecrawl residue** (`fetch-sites.js --firecrawl-residue`, plan-aware, 10 rpm) over the 208 failed fetches —
   running; recovered rows are written back into `owner/site_text.jsonl` in place.
2. **Email-domain rung ($0, `derive-sites-from-email.js`)** for the 1,231 registry-only rows: 914 carry a company
   email domain → website derived → `fetch-sites.js` → `owner_derived/site_text.jsonl`: **716 ok, 602 with >200
   chars**. 16 fit batches (stronger model): residential 408 · commercial_only 62 · not_installer 17 ·
   heat_pump_led 26 · electrician_general 56 · unclear 345. Merged: residential rows keep the derived website
   and become `residential_battery_derived`; commercial / not-installer → excluded; heat-pump-led / electrician
   → secondary; unclear stay `no_website_registry_only`.
3. **name-to-domain** for the 317 freemail rows: job-local `n2d/resolve-uk.mjs` (Tier 0.5, free) resolved **97**;
   220 residue on 9 Haiku web-verify batches (running). Resolved domains then go through fetch → fit.
**Lists after step 2: `leads_icp.csv` 1,931** (residential 861 + residential-derived 408 + registry-only 662),
secondary 585, excluded 185.
