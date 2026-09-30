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

Step 3 result: name-to-domain found **222 of 317** freemail rows' sites (97 free resolver + 125 Haiku web-verify,
95 blank — no site exists or not verifiable); fetch → 181 with text → 4 fit batches: residential 117 ·
electrician_general 27 · not_installer 13 · heat_pump_led 3 · commercial_only 1 · unclear 61.
**Lists after step 3: `leads_icp.csv` 1,887** = residential 861 + residential-derived 408 + residential-n2d 117
(**1,386 residential-confirmed**) + 501 registry-only; 1,792 of the 1,887 carry a website. Secondary 615, excluded 199.
Domain cache grown at `clients/atlas-growth/domain_cache.csv` (gitignored) for the next list build.

## Firecrawl residue result (2026-09-30)
200 attempted (208 failed fetches minus dead 404s), **113 recovered**, 87 failed, 4 × 429 handled; ~200 credits.
`owner/site_text.jsonl` updated in place (ok 1,262 → 1,375). 132 formerly-`unclear` secondary rows now carry text
→ 3 fit batches (`classify/recovered/`), merged the same way as the derived/n2d rounds.

## Owner-finding on the 1,887 ICP leads (2026-09-30)
Companies House over all 2,704: **2,260 matched (84%), 2,246 with active directors** (exact_title 2,099 ·
postcode 133 · city_only 28 demoted). Site text merged from the three fetch dirs into `owner_all/site_text.jsonl`
(2,605 records; the Firecrawl residue writes the main file in place, so the merge is a copy).
`prep-owner-batches.js --ch` → 1,815 items / 46 batches (72 skipped: no evidence of any kind) → 46 Haiku reads →
`merge-owner-reads.js` (33 guardrail drops: 10 trade-word names, 7 role-word names, 5 single tokens, 4 no
evidence, 3 business names, 3 excluded titles, 1 unknown id) → `combine-owner-contacts.js`:
**1,572 of 1,887 named (83.3%), 1,571 owner-level, 2,721 contacts (Companies House 2,541 · website 180)**;
confidence high 1,392 · medium 178 · low 2. `owner/contacts_final.{jsonl,csv}`.
Emails (`build-email-candidates.js`: MCS register address = spine, on-site + reader addresses added, engine
`email-rank.js`): **1,869 of 1,887 leads with ≥1 address (99%), 2,382 candidates; 531 leads whose top address
is built from the named owner's name, 1,338 on a company mailbox.** Sources: register 1,828 · on-site 491 ·
reader 63. `owner/emails_candidates.csv`, verdict blank — **verification needs MILLIONVERIFIER_KEY +
BOUNCEBAN_KEY and an explicit go (~1,900 MV credits + BounceBan on the catch-alls).**

## Close-out (2026-09-30)
Firecrawl-recovered rows re-read: +78 residential → **`leads_icp.csv` 1,965** (residential-confirmed 1,464 = 861 +
408 derived + 117 n2d + 78 recovered; registry-only 501), secondary 531, excluded 205. Nations ENG 1,628 · SCT 159 ·
WLS 166 · NIR 12; segments battery+solar 1,588 · +heat pump 368 · battery-only 9.
Second owner round (`owner/read2`, 321 items = 78 new + 243 unnamed): 89 more named → **1,661 of 1,965 named
(84.5%), 1,660 owner-level, 2,875 contacts** (`combine-owner-contacts.js`, read then read2).
Emails rebuilt: **1,944 of 1,965 with ≥1 address, 2,467 candidates, 553 on the owner's own mailbox, 1,391 company.**
Deliverable bundle `atlas-growth_uk-battery-installers_deliverable_2026-09-30.tar.gz` (ICP, secondary, excluded,
contacts_final, emails_candidates_unverified, raw register) — data gitignored, sent to the operator.
Write-back: `skills/icp-source-planner/library/mcs-register--uk-battery-installers.md` (validated) and
`google-maps--uk-generator-installers.md` (failed) + `_index.md`; `IMPROVEMENTS.md` (scheme-less website skip,
blank-address geo drop recurrence); `STATE.md`.
**Open:** MV/BB verification (keys + go, ~1,950 credits); Plusvibe 3-lead / 7-lead tests on
`personalize-config-battery-uk.json`; the 501 registry-only rows are the operator's send/hold call; the 531
secondary rows (unclear / heat-pump-led / general electrician) are a second wave if wanted.

## Send / hold split + Plusvibe tests (2026-09-30, operator: "hold 501 registry rows, to send later / wording is good")
**Hold:** `split-send-hold.js` → **`leads_icp_send.csv` 1,464** (every residential-confirmed row) and
**`leads_icp_held_registry_only.csv` 501** (fit `no_website_registry_only`, to send later). Verification queues staged
separately so the held rows are never verified or uploaded by accident: `owner/verify/queue_send.csv` **1,453 rank-1
addresses (401 on the owner's own mailbox, 1,254 named leads; 11 send leads have no address)** and
`owner/verify/queue_held.csv` 491. Both are the exact `Email`-first input `verify-millionverifier-bounceban.js` takes.
**Register city clean (job-side, before `base`):** the fill repeats a known city verbatim and the register's city field
is the installer's own typing — `city-clean.js` on the send list: 129 ALL CAPS → title case, 38 comma-joined address
fragments → first town, 51 streets/estates + 47 counties/nations/"n/a" → blank (271 changed; held list 97). Blanks go
to the engine's `city-fallback`, but its `nominatim()` uses Node's global fetch, which ignores the container's
HTTPS_PROXY: probe curl 200 ×3 / Node fetch 429 ×3 (IMPROVEMENTS OPEN). Workaround `geocode-fixture.js` (curl via the
proxy, 1 / 1.2 s, resumable → `owner/geocode_fixture.json`) and `city-fallback --geocode-fixture` offline, with a
67-entry `owner/districts_uk.json` so an LGA ("Reigate and Banstead") is rejected like the seeded ones.
**3-lead test PASSED:** Underwood Electrical (solar and battery storage, Newcastle), Dwellow (heat pumps and solar,
Swindon, Adam Raw named on adam@ under the name rule), Always Off-Peak (home battery storage, Harpenden) — 0 flags,
`check` clean; it surfaced the ALL-CAPS city ("around NEWCASTLE"), fixed by the clean above.
**7-lead test RUN (`owner/personalize-test7/`):** all five trades + Heatable (brand family) + a blank-city lead
(GES Green Solar → Cardiff by geocode) + a registry-only lead on the fallbacks (Harlech Electrical, Kirkby). fill:
7 rows, 6 personalised, 1 fallback_only, 0 blank city, **0 flags, redo 0, `check` clean, 3 named**. Two readings for
the operator: "Noticed you do solar pv around Saffron Walden" (lower-case pv — "solar panels" would read better)
and "paid install jobs" for the bundle firms (My Green Power). Test emails are UNVERIFIED addresses marked
TEST-ONLY; nothing is uploaded.
**Blocked on:** MILLIONVERIFIER_KEY + BOUNCEBAN_KEY and an explicit go for `queue_send.csv` (~1,453 MV credits +
BounceBan on the catch-alls). Then: `finalize` → `owner/emails_final.csv` → `base --leads leads_icp_send_cityclean.csv
--city-overrides owner/city_overrides_send.json` → `prep` → one Haiku per batch → `fill` → `redo` → `check`.
Geocode result: send 89 of 98 blank cities resolved (47 town · 21 city · 17 village · 4 county; 14 district
rejections), **9 unresolved = all Greater London addresses, left blank so the reader takes the town from the site**;
held 45 of 45. ~12 answers are still a district/county ("Tandridge", "Wychavon", "North Kesteven", "Epping Forest",
"County Down", "Somerset") — hand-override in `owner/city_overrides_send.json` before the full fill.
