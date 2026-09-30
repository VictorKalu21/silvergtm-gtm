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
