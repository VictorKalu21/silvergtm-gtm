---
source: US municipal/county open building-permit data (Socrata SODA, ArcGIS FeatureServer, CKAN datastore, Carto SQL) + state license rosters (TX TDLR, FL DBPR, LA LSLBC)
vertical: electrical contractors who install residential standby generators (Atlas Growth: FB lead gen booking residential in-home appointments)
verdict: partial
last_validated: 2026-09-24
access: Tier 0.5 open-data APIs (SODA $where LIKE, ArcGIS /query where LIKE, CKAN datastore_search_sql, Carto SQL). All free, keyless, no anti-bot. The roster join (TDLR/DBPR) adds license # and phone.
dispatch: web-scrape-triage (direct API; no HTML scraping)
cost_tier: free
---

# US Open Permit Data × Residential Standby-Generator Electricians

**Core move:** a permit with "generator / Generac / transfer switch" in its description and a named contractor is direct proof that the contractor installs generators. Where the permit class says single-family/residential, it is direct proof of the exact ICP (residential generator installer). Paid lists can't tell a generator dealer from a general electrician. Permits can.

**Coverage (probed 2026-09-24, window 2024-09-24 → 2026-09-24):** 28 jurisdictions probed. 22 returned generator permits. 17 carry a contractor name.
13,167 generator permits in total (7,769 residential / 3,950 commercial / rest unclassified). **2,271 distinct contractor names**, of which **1,098 appeared on residential permits.** This is an upper bound: it includes plumbers (gas lines), GCs, expediters, and person-vs-company duplicates. Realistically about 1,500 electrical firms, about 900 of them residential.
- Tier-A (residential flag, contractor name, real volume): **Austin TX** (131 residential generator electricians), **New Orleans** (287 residential names, but persons), **Baton Rouge** (134, dedicated `Generator Permit (R)` type), **Cape Coral FL** (122), **Seattle** (51 residential), **Collin County TX CAD** (78, builder often blank).
- Tier-B (name present, commercial-skewed or small): NYC DOB NOW Electrical (68 res / 175 com, firm + license #), Boston (applicant person only), Philadelphia, Cambridge, Worcester, Mesa, Marin, Miami-Dade (Esri demo copy), Orlando, Detroit, Chicago, San Antonio (undercount).
- Volume-only (NO contractor field): Los Angeles (1,006), Baltimore County (738, 651 res), Montgomery County MD (439, 376 res), Charlotte/Meck, Fort Worth, NJ statewide.
- Zero / unusable: Cincinnati (generic descriptions), Las Vegas and Louisville (coded work types), Raleigh (trade permits not in the fresh layer), Fort Lauderdale (stale since 2025-02).
- Not found on any open API: Houston (residential XLS only, stale 2026-05), Dallas (last FY23-24), Jacksonville, Tampa (SF permits have no contractor), Atlanta, Nashville, Denver (2019), Phoenix (2023), Fairfax, Connecticut, Hillsborough, Palm Beach, Harris County. Most of the Gulf/Southeast generator belt uses Accela/EnerGov/Tyler portals with no bulk API, so it would need per-portal scraping.

**Fields:**
| Field | Status |
|---|---|
| Company name | can (Austin, Seattle, Baton Rouge, Cape Coral, Detroit, Orlando, NYC, Philadelphia, Mesa, Marin). In NOLA, Boston and Worcester it is the licensed person (the qualifier), not the firm |
| License # | partial: NYC `license_number`, Mesa, Marin (CSLB), Miami-Dade `CONTRNUM`, Fort Lauderdale. Otherwise get it from the state-roster join |
| Phone | partial: Austin, Orlando, Mesa, Fort Lauderdale; TX via TDLR join |
| Email | rare: Mesa, Raleigh only |
| Address | partial: Austin, Baton Rouge, NYC, Philadelphia, Detroit, Orlando, Marin |
| Residential vs commercial | can in most (see split below) |
| Install volume per contractor | can: count permits per contractor, which gives a free "generator-focused shop" ranking |

**Residential/commercial split method, per source:** Austin `permit_class_mapped`. Seattle `permitclass` ("Single Family/Duplex"; do NOT use `permitclassmapped`, because "Non-Residential" matches /residential/). NYC `building_use_type` ("A One Family"…). NOLA `landuse`. Baton Rouge `permittype` suffix (R)/(C). Cape Coral `Friendly_Name` "Trade Permits - Residential". Philadelphia `commercialorresidential`. Worcester `Occupancy_Type` / `Permit_For`. LA `permit_sub_type`. Baltimore County `DESCRIPTION_TYPE` ("RESIDENTIAL ELECTRICAL").
Gulf and Sunbelt sources are residential-heavy (NOLA 84%, Baton Rouge 87%, Cape Coral 95%, Austin 75%). Northeast/urban sources are commercial-heavy (NYC 75% com, Boston 96%, Philadelphia 87%, Cambridge 90%). **For a residential ICP, Gulf/Sunbelt permits are the goldmine; big-city Northeast feeds mostly surface commercial/multifamily electricians.**

**Fill rates (contractor name present on generator rows):** Austin 99.7%, NYC 100%, Baton Rouge 100%, Cape Coral 99%, NOLA 90%, Collin 92%, Detroit 92%, Seattle 64%, Mesa 70%. LA / Baltimore County / Montgomery MD / Charlotte / Fort Worth are 0% (no field).

**Restrictions:** SODA has no key; throttled without an app token (fine at this scale), pages of 5k via `$offset`. ArcGIS `maxRecordCount` is 1000–2000: paginate `resultOffset` while `exceededTransferLimit`. CKAN `datastore_search_sql` is fine. The data is public and published for reuse. Freshness is daily for most (Austin, Seattle, NYC, NOLA, BR, Cape Coral).

**Method (exact):**
- Keyword clause over each free-text field: `upper(f) like '%GENERATOR%' OR '%GENSET%' OR '%GENERAC%' OR '%TRANSFER SWITCH%'`. Skip bare `ATS` (it matches SEATS/FLATS). Bare `STANDBY` is noisy.
- Socrata: `https://<domain>/resource/<id>.json?$where=<date> > '2024-09-24' AND (<kw>)&$limit=5000&$offset=N&$order=:id`
  - Austin `datahub.austintexas.gov/3syk-w9eu` (description, issue_date, contractor_company_name/phone/address, contractor_trade, permittype EP=electrical)
  - Seattle `cos-data.seattle.gov/c4tj-daue` (Electrical Permits; contractorcompanyname)
  - NYC `data.cityofnewyork.us/dm9a-ab7w` (DOB NOW Electrical; job_description, firm_name, license_number, firm_address)
  - NOLA `data.nola.gov/rcm3-fn58` (description, contractors, landuse)
  - Baton Rouge `data.brla.gov/7fq7-8j7r` (`permittype='Generator Permit (R)'` needs no keyword at all)
  - Chicago `data.cityofchicago.org/ydr8-5enu` (contact_1..15_type = 'CONTRACTOR-ELECTRICAL' → contact_N_name)
  - Cambridge `hvtc-3ab9` (`generators>0`, licensee); Mesa `citydata.mesaaz.gov/dzpk-hxfb`; Marin `mkbn-caye`; Collin CAD `data.texas.gov/82ee-gbj5`; Orlando `ryhf-m453`
  - Volume only: LA `ysqd-apz7`, Montgomery MD `qxie-8qnp`
- ArcGIS `/query?where=...&outFields=*&f=json&resultOffset=N`:
  - Cape Coral `capeims.capecoral.gov/.../OpenData/MapServer/1`
  - Detroit `services2.arcgis.com/qvkbeam7Wirps6zC/.../bseed_trades_permits/FeatureServer/0` (has `Generator Permit` type)
  - Worcester `services1.arcgis.com/j8dqo2DJE7mVUBU1/.../Electrical_Permits/FeatureServer/0`
  - Baltimore County `bcgisdata.baltimorecountymd.gov/.../ActiveDevelopment/MapServer/5`
- Carto: `phl.carto.com/api/v2/sql?q=select ... from permits where permitissuedate>='2024-09-24' and (...)`.
- CKAN: Boston `datastore_search_sql` on resource `6ddcd912-32a0-43df-9908-63574f8c7e77`; San Antonio resources `c22b1ef2…` + `c21106f9…` (quote the column names: `"PROJECT NAME"`).
- Discovery: `api.us.socrata.com/api/catalog/v1?q=electrical%20permits&only=datasets` and `hub.arcgis.com/api/search/v1/collections/dataset/items?q=building%20permits`.
- Enrichment join to the state roster (normalize: uppercase, strip punctuation and LLC/INC/CO/CORP):
  - TX: `data.texas.gov/resource/7358-krk7.json?license_type=Electrical Contractor` (14,019 ECs; license #, phone, address). 146/180 (81%) of Austin generator electricians matched exactly.
  - FL: `www2.myfloridalicense.com/sto/file_download/extracts/lic08el.csv` (20,043 ELC licensees; qualifier, DBA, address, license #; no phone/email).
  - LA: LSLBC `arlspublic.lslbc.louisiana.gov`, Commercial License classification **ELECTRICAL = id 3980** (list via `/Public/_AccountClassDefInputBox/23`). Residential (25) and Home Improvement (27) have no electrical subclass. NOLA permits name the qualifying person, so join on qualifier name → firm.
  - AR: `aclb.arkansas.gov` returns a Cloudflare 403 from this box, so its classifications could not be verified here. Note that AR electrical contractors are licensed by the Board of Electrical Examiners (Dept. of Labor & Licensing), not ACLB, so an ACLB roster may under-cover electricians.

**Cost actuals:** $0. 28 probes + pulls took about 10 min wall time. Each city pull is 1–60 s.

**Gotchas:**
- **Contractor ≠ company everywhere.** NOLA, Boston and Worcester name a PERSON (master electrician, expediter). NOLA's top names (Craig Allen Page → Optimize Solutions) need a qualifier→firm join via the LSLBC/LA electrical roster.
- **Name variants** (Baton Rouge "OPTIMIZE SOLUTIONS, LLC - Craig Page" vs "OPTIMIZE SOLUTIONS, LLC"): strip " - person" before dedupe.
- **Trade leakage:** Austin's hits are ~50% plumbers (gas line for generator) plus GCs. Filter to the electrical permit type (Austin `permittype='EP'`) when the ICP is electricians. Plumbers who pull generator gas permits are also generator dealers, so they may still be in-ICP for Atlas.
- **LA** hits are dominated by temporary/film generators, and LA has no contractor field anyway.
- **San Antonio** files residential generators under "Solar - Photovoltaic Permit" and PROJECT NAME is often the homeowner, so keyword search undercounts heavily.
- Many "open data" permit layers are building-only, and trade (electrical) permits are omitted: Raleigh, Charlotte, Fort Worth, Cincinnati.
- Big generator markets (Houston, Dallas, Tampa, Jacksonville, Atlanta, Charlotte trades, Fairfax, CT) have no usable API. They need Accela/EnerGov citizen-portal scraping (Tier 0 hidden JSON) or a paid aggregator.
- The Miami-Dade layer found is an Esri demo copy ("Test", stops 2025-12). The official MD feed needs a separate hunt.
- Paid aggregators: **Shovels.ai** ($599–999/mo; permit tags include `electrical`/`solar`/`battery` but no generator tag in the docs, so it needs description search). BuildZoom, ConstructConnect and Construction Monitor are paid. None were bought.

**Recommendation:** use permits as a **high-precision seed + scoring signal, not the nationwide universe**. Pull the ~6 Tier-A Gulf/Sunbelt feeds (about 700–900 residential generator installers with install counts) as the "proven installer" tier. Build national breadth from state electrical-contractor rosters (TX TDLR, FL DBPR, LA LSLBC-Electrical, AR) plus the Generac/Kohler dealer locators. Use permit counts to rank.

**Runs:** 2026-09-24 — Atlas Growth (Phase 2 deep-dive) — 13,167 generator permits / 2,271 raw distinct contractor names (1,098 residential) across 22 jurisdictions — partial (strong in the Gulf/Sunbelt, no national coverage).
