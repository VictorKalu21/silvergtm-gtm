# Tier 0.5 — Public dataset / open-data / registry (the source class before you scrape a page)

Before scraping any page, ask: **is this data already a public dataset or registry?** Governments,
regulators, and standards bodies publish entity/company/facility/filing data as documented APIs and
bulk files — clean, structured, no rendering, no anti-bot fight. This is the cheapest rung that exists
for regulated/critical-infra/funded/facility ICPs. **The moat move for hard-to-list buyers:** a company
hides in ZoomInfo/6sense under its marketing category, but a registry surfaces it by *operational
reality* (owns bulk-electric assets / runs a water system / reports chemical releases / filed with the SEC).

**Validated firsthand (Industrial Defender OT run, 2026-07-12):** NERC registry + EPA SDWIS + EPA TRI →
34 in-scope operators; see icp-source-planner library profile `us-federal-registries--critical-infra-ot-operators.md`.

## DISCOVERY — which API/dataset backs a portal?
1. **Agency `/data.json`** — US federal agencies publish a DCAT-US / Project-Open-Data catalog at
   `https://<agency>.gov/data.json`; each dataset's `distribution[]` array carries `downloadURL` (direct
   file) and `accessURL` (query/API). Aggregated + searchable at **catalog.data.gov**. Parse both URLs
   (in DCAT-US v3 `downloadURL` is optional, `accessURL` recommended). Coverage is imperfect — a discovery
   entry point, not a guaranteed index.
2. **Platform URL tells** (recognize the backend, then use its generic grammar below):
   | Tell in the URL / page | Platform |
   |---|---|
   | `/resource/{4x4}.json`, `/api/v3/views/`, `X-Socrata` headers | **Socrata** |
   | `/api/3/action/` | **CKAN** |
   | `/rest/services/`, `/FeatureServer`, `/MapServer` | **ArcGIS/Esri** |
   | `/efservice/` | **EPA Envirofacts** |
   | `data.sec.gov`, `efts.sec.gov` | **SEC EDGAR** |
   | Accela Citizen Access `.../aca/` or `/CitizenAccess/` | permit portal (often UI-only — see gotchas) |

## THE 4 PLATFORM GRAMMARS (back most gov portals)

### Socrata (data.gov + many US city/state portals)
- Query: `https://{host}/resource/{4x4}.json?$where=<SoQL>&$select=<cols>&$limit=50000&$offset=N`
  (`{4x4}` = the 8-char dataset id like `ydr8-5enu`; default `$limit` 1,000 — always set it + page with `$offset`).
- Full dump: `https://{host}/resource/{4x4}.csv` or `/api/views/{4x4}/rows.csv?accessType=DOWNLOAD`.
- SoQL is SQL-like: `$where`, `$select`, `$order`, `$group`, `$q` (full-text). SODA3 path `/api/v3/views/{4x4}/query.json`.
- **App token** now expected (`$$app_token=` or `X-App-Token` header) — free; unauthenticated still works but throttled.

### CKAN (data.gov.uk, data.europa.eu, many others)
- Discover datasets: `https://{host}/api/3/action/package_search?q=<solr>&rows=1000&start=N` (q default `*:*`; `fq` filter, `sort`, `facet`).
- Query rows in a dataset's datastore: `.../api/3/action/datastore_search?resource_id=<id>&limit=…&offset=…`
  or SQL: `.../api/3/action/datastore_search_sql?sql=SELECT...`. No key on public portals.

### ArcGIS / Esri REST (facilities, parcels, geospatial — the "where is every X" workhorse)
- `https://{root}/{service}/FeatureServer/{layerId}/query?where=1%3D1&outFields=*&f=json&resultOffset=N&resultRecordCount=M`
- `where=` is SQL-92 (`where=STATE='TX' AND POP>50000`); `f=json|geojson`; paginate with `resultOffset` +
  `resultRecordCount` (capped at layer `maxRecordCount`). **Watch `exceededTransferLimit:true`** → keep paging.
- Discover layers: hit the service root with `?f=json`; `/FeatureServer?f=json` lists layers + maxRecordCount.

### Agency REST — EPA Envirofacts pattern (firsthand)
- `https://data.epa.gov/efservice/{TABLE}/{COLUMN}/{VALUE}/rows/0:{N}/JSON` — chain `/COLUMN/VALUE/` filters;
  swap `/JSON` for `/CSV`. Tables unsorted → **over-pull + sort client-side** (see gotchas). No key.
- EPA ECHO (`echodata.epa.gov/echo/..._rest_services.get_facilities`) returns a **QueryID, not rows** →
  fetch rows via `get_download?qid=<qid>&output=CSV` (the query-ID→download two-step).

## REGISTRY / FILING SOURCES (free unless flagged)

| Source | Access | Gives | Notes |
|---|---|---|---|
| **SEC EDGAR** | `data.sec.gov/submissions/CIK{10-digit-zero-padded}.json` (firmographics+filings); `data.sec.gov/api/xbrl/companyfacts/CIK{10}.json` (per-co financials); **`data.sec.gov/api/xbrl/frames/us-gaap/{tag}/USD/CY2023.json`** = one row PER company across ALL filers (the cross-company universe pull); nightly bulk `submissions.zip` ~1.55GB + `companyfacts.zip` ~1.39GB | US public-company universe + financials | Keyless. **Required `User-Agent` header** (403 without). ~10 req/s fair-access. |
| **NERC** | xlsx bulk download (`nerc.com/.../NERC_Compliance_Registry_Matrix_Excel.xlsx`) | US/Canada bulk-electric operators + functions | Header on row 4; parse with `xlsx` lib |
| **EPA SDWIS / TRI / ECHO** | Envirofacts `/efservice/WATER_SYSTEM/…`, `/tri_facility/…`; ECHO qid→download | water utilities (pop served), industrial facilities (parent co), regulated facilities | firsthand; see icp-source-planner profile |
| **UK Companies House** | REST `api.company-information.service.gov.uk/company/{number}` (HTTP Basic, key as username + blank pw: `curl -u KEY:`); **free bulk** "Free Company Data Product" ZIP-of-CSV (~473MB, all live cos) | UK company universe | Free key via free account |
| **GLEIF LEI** | free bulk Golden Copy CSV/XML/JSON 3×/day; **Level-2 RR-CDF = "who owns whom"** (direct+ultimate parents) | global entity IDs + corporate parentage | CC0. **Fixes the holding-co/SPV→parent problem** when a registry gives subsidiaries |
| **OpenCorporates** | `api.opencorporates.com/v0.4/companies/{jurisdiction}/{number}` | global company registry | **GATED**: key required; free tier open-data/share-alike only, 200/mo·50/day → NOT free-first for commercial |
| **OpenSanctions** | `api.opensanctions.org/match/default` (POST entity → ranked matches) | sanctions/PEP screening | **Free non-commercial ONLY** (CC-BY-NC); business use needs paid license → compliance/enrichment tier |
| **US Census CBP / BDS** | `api.census.gov` (free key) | **AGGREGATES ONLY** by geo+NAICS (Title 13 forbids company rows) | firmographic *benchmark* — never a lead-row source |

## GOTCHAS (registry-specific)
- **Unsorted table → over-pull + client-sort.** Envirofacts/Socrata don't sort by size; to get the *largest*
  operators, pull a wide slice and sort client-side (we pulled 4k water rows/state, sorted by population).
- **Query-ID→download two-step** (EPA ECHO): the query call returns a qid + counts, not rows.
- **Pagination caps**: Socrata `$limit` default 1,000; ArcGIS `maxRecordCount`; always page explicitly.
- **Holding-co / SPV / gov collapse**: registries list legal entities (SPV LLCs, "…as agent for…", GM Corp vs LLC,
  DoD). Dedupe by normalized name; drop gov/holding; resolve SPV→parent at enrichment (GLEIF L2 helps).
- **Bulk file > API at volume**: if you need the whole universe, grab the nightly/periodic bulk ZIP/CSV, don't page the API.

## WHEN A GOV SOURCE IS NOT WORTH IT
- Portal is **UI-only** with no `/data.json`, no platform tell, and no bulk file (many Accela permit portals,
  some state Secretary-of-State searches) → treat as a normal page (Tier 1/3) or switch source.
- Data is **aggregate-only** (Census CBP/BDS) → benchmark, not leads.
- Source is **gated/licensed** for commercial use (OpenCorporates paid, OpenSanctions commercial) → not free-first.

## STILL-OPEN (not yet validated — research if a run needs them)
State Secretary-of-State registry APIs / bulk (mostly UI-only; a few offer bulk — check per state), professional-
license boards, Accela permit-portal APIs, SEC full-text search (`efts.sec.gov/LATEST/search-index?q=`) +
`company_tickers.json` ticker→CIK map. Flagged, not confirmed.
