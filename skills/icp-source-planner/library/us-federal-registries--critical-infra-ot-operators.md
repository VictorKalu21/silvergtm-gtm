---
source: US federal registries (NERC + EPA SDWIS + EPA TRI)
vertical: critical-infrastructure / OT-ICS operators (electric, water, industrial/mfg)
verdict: validated
last_validated: 2026-07-12
access: bulk file download (NERC xlsx) + open-data JSON APIs (EPA Envirofacts /efservice, ECHO qid→download)
dispatch: web-scrape-triage (but really: direct API/file — see METHOD; no HTML scraping needed)
cost_tier: free
---

# US Federal Registries × Critical-Infra / OT Operators

The reusable recipe for the "hard-to-list OT buyer" ICP (Industrial Defender-style, and any
OT-security / ICS / critical-infra vendor). **Core move:** an OT operator hides in 6sense/ZoomInfo
under its marketing category ("specialty chemicals", "electric services"), NOT under "has exploitable
control systems." A public federal registry where *membership itself proves an OT environment* surfaces
them by operational reality. One registry per sector; identical downstream (dedupe → domain-enrich →
rubric-score). First run: Industrial Defender ~30-account sample (18 Hot / 16 Warm across 3 sectors).

## The 3 registries (membership = the OT signal)

| Sector | Registry | Membership gate = OT proof | Account grain | Size proxy field |
|---|---|---|---|---|
| Electric | **NERC Compliance Registry** | can't register without owning/operating bulk-electric-system assets | the registered entity | function flags (BA/RC/TO=bigger, CIP-critical) |
| Water | **EPA SDWIS `WATER_SYSTEM`** | can't be a community water system without SCADA treatment/distribution | the water system | `population_served_count` |
| Mfg | **EPA TRI `tri_facility`** | can't report releases without running an industrial process | `parent_co_name` (roll sites up) | facility count per parent |

**Coverage / volume (validated 2026-07-12):** NERC = 2,424 active entities (6 regions). SDWIS = ~1,000–4,000
community water systems PER STATE (filter to pop≥100k → the recognizable municipal utilities). TRI = 734
parent companies with ≥3 facilities across just 8 industrial states (national far larger). Plenty for any volume.

## Method (exact, working)

**Electric — NERC (bulk xlsx download + parse):**
- URL: `https://www.nerc.com/pa/comp/Registration%20and%20Certification%20DL/NERC_Compliance_Registry_Matrix_Excel.xlsx`
  (mirror: `.../globalassets/programs/registration/compliance-registry-files/nerc_compliance_registry_matrix_excel.xlsx`)
- Sheet `NCR Matrix (Functions Only)`; header is on **row 4** (index 3); data rows start row 5, filter `NCR ID` starts "NCR".
- Cols: `NCR ID`, `Entity Name`, `Regional Compliance Enforcement Authority` (region), then function flags:
  `BA, DP, GO Category 1/2, GOP Category 1/2, RC, TO, TOP, TP, DPUF`… (non-empty cell = has that function).
- Parse with node `xlsx` lib (`npm i xlsx`; box had no xlsx/openpyxl preinstalled — install it).
- Stratify by function: RC/BA = ISO/RTO grid ops (top CIP) · TO = transmission owners · GOP = generation · DP = distribution/muni-coop.

**Water — EPA Envirofacts SDWIS (`/efservice` REST, JSON, no key):**
- `https://data.epa.gov/efservice/WATER_SYSTEM/PWS_TYPE_CODE/CWS/STATE_CODE/<ST>/PWS_ACTIVITY_CODE/A/rows/0:4000/JSON`
- Table not sorted → pull the slice and sort client-side by `population_served_count` desc; take top N; keep pop≥100k.
- Fields: `pws_name`, `population_served_count`, `city_name`, `state_code`, `owner_type_code`, `org_name`.

**Mfg — EPA Envirofacts TRI (`/efservice` REST, JSON, no key):**
- `https://data.epa.gov/efservice/tri_facility/state_abbr/<ST>/fac_closed_ind/0/rows/0:2000/JSON`
- Aggregate by `parent_co_name` (uppercase-strip key to dedupe); rank by facility count; drop NA/UNKNOWN/holding-co/gov.
- Fields: `facility_name`, `parent_co_name`, `city_name`, `state_abbr`, `naics`.

**ECHO note:** `echodata.epa.gov/echo/..._rest_services.get_facilities` / `get_systems` return a **QueryID (qid)** + counts,
NOT rows. Fetch rows via `get_download?qid=<qid>&output=CSV`. But the SDW download CSV lacks population — so prefer the
Envirofacts `/efservice` tables above (they carry `population_served_count`). ECHO was probed and set aside.

## Fill rates / cost actuals (Industrial Defender run)
- **Domain enrichment (name→domain): 34/35 = 97%** via 4 parallel general-purpose subagents (web-verify, strict JSON,
  ~8-11 co's each, ~40s/batch). Only miss = a PE-owned IPP (Lightstone) with no corporate website. Subagents correctly
  resolved SPV/abbrev names (Grand Ridge Energy III→Invenergy, "MDWASA - MAIN SYSTEM"→Miami-Dade WASD, Power City Partners→Alliance Energy).
- Registry pulls: NERC xlsx <1s; each Envirofacts state query ~2-5s; all sourcing well under budget.

## Gotchas
- **Holding-co / SPV / gov collapse needed.** TRI top rows include US Dept. of Defense + Berkshire Hathaway (holding) +
  GENERAL MOTORS CORP vs LLC dupes. NERC has plant-SPV LLCs (Grand Ridge Energy III) and "…as agent for…" multi-entity
  names. Clean: strip suffixes/"as agent for"/division; dedupe by normalized name; drop gov/holding; resolve SPV→parent at enrichment.
- **Municipal water resolves to a big city `.gov`** (nyc.gov, houstontx.gov, chicago.gov, phila.gov, miamidade.gov) — accurate
  but a coarse Apollo target (the water dept is buried in a huge org). Dedicated-domain utilities (saws.org, ladwp.com, scwa.com,
  jea.com, ebmud.com) are cleaner. Flag the `.gov` ones for the people-layer step.
- **Size proxy differs per registry** (function flag / population / facility count) — that's the ONLY thing that varies; rubric must read the right field per sector.
- Envirofacts tables are unsorted; you MUST over-pull + sort client-side to catch the big operators.

## Rubric that worked (OT-fit, precision)
5=Hot: ISO/RTO grid ops + major IOUs (RC/BA, CIP high) · oil&gas/chemical majors (DCS+SIS) · water pop≥1M.
4=Warm: transmission owners · generation IPPs · distribution/G&T coops · discrete/process mfg (multi-plant) · water 100k–1M.
Kill: vendors/consultants/resellers, holding cos, gov agencies, no operational assets.

## Runs
- 2026-07-12 — Industrial Defender (Silver GTM ABM sample) — 34 accounts (11 electric / 11 water / 12 mfg), 18 Hot / 16 Warm, 97% domain fill → `gtme_analysis/industrial_defender_sample.csv`. Scratch/scripts in `gtme_analysis/id_sample/`.
