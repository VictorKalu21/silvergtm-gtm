---
source: AWS Partner Solutions Finder · Microsoft/Azure partner directory · Google Cloud Partner Finder
vertical: cloud/AI consultancies + MSPs as CHANNEL PARTNERS (US/CA, mid-size, AI-validated, resale/managed-service motion)
verdict: partial — AWS + Microsoft validated Tier-0 (probed, not pulled at volume); Google RPC found, paging unresolved
last_validated: 2026-10-07
access: hidden JSON API (WA-02) + param fuzzing (WA-06); Google needed one headless network capture
dispatch: web-scrape-triage (Tier 0)
cost_tier: free
---

# Cloud partner directories × MSP / consultancy channel partners

**Client context:** AI Reserve (AI-spend reduction; stealth). Model companies OpsGuru (AWS Premier, Carbon60) and In Balance IT (Chicago VAR/MSP). Scope doc: `scoping/ai-reserve-channel-partners.md`.

**Coverage:** every vendor-validated partner per cloud. AWS US "Use Case : AI" = 474, CA = 81; AWS MSP program US = 169; FinOps use case US = 78. Microsoft ≈ 26k US / 6k CA partners (mostly M365/Dynamics resellers — ICP is the thin Azure Expert MSP / Data & AI slice). Google: unknown total (default RPC returns 29 featured).

## AWS Partner Solutions Finder — Tier-0 ★
- Config leaks the API: `partners.amazonaws.com/config.js` → `psfApis.searchResultsApi = https://api.finder.partners.aws.a2z.com/search` (+ `typeahead.api…/typeahead`, `solutions.api…/solutions|practices`).
- **Method:** `GET /search?facets=<F>&location=<Country>&locale=en&size=30&from=N`. Facet strings are the refiner labels verbatim: `Use Case : AI`, `Use Case : AI : Generative AI Consulting Services`, `Use Case : Cloud Operations : Cloud Financial Management`, `Program : AWS Managed Service Provider`, `Program : AWS Well-Architected Partner Program`, `Industry : Financial Services`. **`|` joins facets as AND**; a repeated `facets=` param keeps only the last. `location=United States|Canada` restricts by HQ (`country=`/`locations=` ignored). **`size` cap = 30** (40 → error). `from` pages to `message.total`. `keyword=` on /search is IGNORED (returns default list) — name lookup goes via `/typeahead?keyword=&locale=en&size=5&type=partner` (returns the display name, not an id); fetch by `?id=<_id>` returns `results: null` — get records from a facet slice instead.
- **Fields (`_source`):** name, literal_name, **website, domain[]**, office_address[] (HQ flagged by `location_type`), current_program_status (Premier/Advanced/Select/Registered), partner_path.path_detail (tier per path), **aws_certifications_count** (size proxy), customer_launches_count, competency_membership[], program_membership[] (MSP, Solution Provider, Commercial Reseller, Training, Well-Architected), service_membership[], professional_service_types[], target_client_base[], use_case_expertise[], technology_expertise[], industry[], refiners[], brief_description, reference counts. `numberofemployees` = 0 everywhere → useless.
- **Fill on 60-row AI probe:** website 100%, address 100%, launches>0 100%. Sort order is tier-desc (Premier first) — stratify by FACET and by tier, not depth (R1).
- Refiner vocab seen: `Use Case`, `Product`, `Industry`, `Program`, `US Federal Socio-Economic Status`. No `Location` refiner — geo is the `location` param / office_address.
- Model check: OpsGuru = `0010L00001tAiyUQAS`, Premier, 141 certs, 349 launches, AI Services + DevOps + Migration + Data competencies, MSP + Solution Provider + Commercial Reseller programs, HQ British Columbia. In Balance IT: NOT listed.

## Microsoft / Azure partner directory — Tier-0 (shard required)
- The AppSource page is an iframe; the real app is `main.prod.marketplacepartnerdirectory.azure.com` (bundle `/assets/index-*.js` holds the filter key map).
- **Method:** `GET https://main.prod.marketplacepartnerdirectory.azure.com/api/partners?filter=<urlencoded "k=v;k=v">`; detail `GET /api/partners/{id}` (`partnerDetails`, `allLocations`). No auth, no fingerprint.
- Working keys: `sort=0`, `pageSize` (≤20), `pageOffset` (= PAGE INDEX, 0-based), `onlyThisCountry=true;country=US`, `locationNotRequired=true` (national) or `lat=..;lng=..;radius=<mi>;locationNotRequired=false` (geo shard — `lng` not `long`/`longitude`), `products=Azure`, `solutions=ArtificialIntelligence|MachineLearning|DevOps|…` (facet list in response `facets`), `serviceType=ManagedServices|ConsultingAndProfessional|…`, `designations=AzureDataAICompetency|AzureInfraCompetency|AzureDigiAppCompetency|SecurityCompetency|ModernCompetency|BAGCompetency`, `azuremsp=true` (Azure Expert MSP), `freetext=<name>`. Also in bundle: `orgSize`, `industries`, `asp` (advanced specialization), `supportServices`, `trainingDesignations`, `diverseOwn`.
- **GOTCHAS:** `estimatedTotalMatchingPartners` is the COUNTRY universe, not the filtered count (26,120 US / 6,142 CA / 10,383 GB) — estimate a slice by binary-searching the last non-empty page. **Hard ceiling ~1,981 rows per query** (page 99 returns 1 row, page ≥100 empty); every national Azure slice hits it → shard by metro `lat;lng;radius` or lead with the small elite slices. `matchingPartners.totalCount` = items on the page. **No website field** anywhere (list or detail) → name→domain via R4 (Clearbit → grounded model); `linkedInOrganizationProfile` 95% fill is the identity anchor. `seatCountRange` is 0/0. Country filter is hard (40/40 CA rows were CA).

## Google Cloud Partner Finder — RPC found, paging TODO
- Boq app, no inline data, sitemap has no partner URLs. Headless capture (Playwright on `/opt/pw-browsers` chromium; `require('/opt/node22/lib/node_modules/playwright')`) on `cloud.google.com/find-a-partner/` revealed `POST /find-a-partner/_/PartnerFinder/data/batchexecute?rpcids=EkbYOc` with `f.req=[[["EkbYOc","[null,[],[null,\"en-US\"]]",null,"generic"]]]`; typeahead rpc `iu5oHd` with `["<text>"]`. **Replays with plain curl, no cookies.**
- Response frame: `)]}'` + length-prefixed chunks; parse the `[["wrb.fr","EkbYOc","<json string>"…` chunk and `json.loads` the inner string → `payload[0]` = partner rows: `[profile/<id>, hub/legal-entity/<id>, name, tagline, html description, [[null,[null,"<CC>"]]…] countries, …, tier records [tier/<id>, entity, level ints, [y,m,d]…], slug]`.
- Default call = 29 featured partners (Devoteam, SADA, …). Appending `null,30` / `null,null,2` changes nothing; a string in slot 4 → 400. **Next step:** one more capture while scrolling / applying a region filter to learn the filter+cursor payload. Blind-fuzzing six-letter rpcids does not work (13 tried, all 400).

## Cross-cutting lessons
- Vendor directories solve the "doesn't say AI on their website" problem: competency / designation = vendor-validated capability (R3 registry-as-attribute pattern applied to a commercial registry).
- Directories catch the OpsGuru shape (Premier, programs, certs) and MISS the In Balance IT shape (unlisted mid-market VAR). Pair with a non-vendor list (CRN MSP 500 / SP 500, Clutch it-services) for that layer.
- Cert count is the only free size signal across clouds; >~2,000 certs = GSI (kill), 20–600 = sweet spot.
- Program flags (MSP + Solution Provider/Reseller) are the white-label-readiness signal — more predictive for a channel ICP than any "AI" tag.

**Runs:** 2026-10-07 — AI Reserve — probe only (AWS 60+81 rows, MS ~200 rows, GCP 29) — scoped, awaiting go-ahead.
