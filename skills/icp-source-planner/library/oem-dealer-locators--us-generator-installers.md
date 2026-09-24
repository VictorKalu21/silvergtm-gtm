---
source: OEM generator dealer locators (Briggs & Stratton, Generac, Kohler/Rehlko, Champion, Cummins)
vertical: US residential home-standby generator installers/dealers
verdict: validated
last_validated: 2026-09-24
access: hidden JSON APIs (WA-02); Briggs + Champion whole-network in 1 call; Generac + Kohler ZIP grid; Cummins via Wayback raw captures (Tier 0.7) — live host Cloudflare-walled
dispatch: web-scrape-triage (extraction) → google-maps-scrape pipeline from STEP 5b (qualify, owner-finding, Plusvibe)
cost_tier: free
---

# OEM dealer locators × US residential generator installers

**Why it matters:** OEM dealer membership proves "installs generators" (process-rules R3, registry-as-attribute-proxy).
Brands barely overlap (Houston: 14 of 238 unique phones under 2+ brands) — additive, dedupe on domain + phone.
Rows are NAME/phone/website only — they still go through the `google-maps-scrape` back half for fit, owner and Plusvibe.

**Full pull, 2026-09-24 (Atlas Growth) — measured:**

| Source | US rows (after dropping distributors) | Own domain | Calls | Method |
|---|---|---|---|---|
| Generac (home cat=1) | **13,171** | 70% (website 54%, email 97%) | 4,966 | ZIP grid; split when EITHER bucket hits 50 (see below) |
| Briggs & Stratton | 2,444 | 84% | 1 | radius 2000 from US centroid |
| Cummins | 2,415 (2,760 raw − 344 distributor rows − dupes; ~770 are RV service centres) | 0% | ~25 Wayback fetches | Wayback `id_` captures of `locatoradmin.cummins.com/locator-interface/home-generators-rlc-2023?page=0..18`, 200 cards/page, 88% from the 2025-05-24 crawl |
| Kohler/Rehlko | 1,626 | 0% (microsite only) | 5,573 | ZIP grid at 20 mi + re-query every found dealer's own ZIP |
| Champion | 476 | 0% | 1 | Locally.com, diag 6000 |

Cross-brand merge (domain+ZIP3 / phone / name+ZIP union): 20,132 rows → **17,795 companies**, 1,374 on ≥2 brands.

**Corrections from the full pull (live beats library):**
- **Generac's cap is 50 tier-badged dealers + 50 "Aligned Contractors", not 100.** A query returning 62 rows can still be truncated (r25 dropped 11 of 37 dealers within 10 mi). Split a query whenever either bucket reaches 50: the naive "100 = saturated" rule gave 11,870; the corrected rule 13,171; a 6-ZIP spot-check at 10 mi then missed 0 (was 24 of 70). Extra `pageSize/limit/page/skip` params are ignored; state/empty-ZIP/country calls return 0; radius 3000 still caps.
- **Kohler returns dealers whose SERVICE TERRITORY covers the ZIP, not a radius** (`distMiles` 10 vs 199 → same 31; ZIP 10001 → 0; Montana → dealers 213–299 mi away). Residual after the grid: 6 new dealers in 300 random unqueried ZIPs (~0.35%). The subscription key is read from the page JS at runtime by `pull/kohler.js`, not stored.
- **Cummins:** every live locator host (`locatoradmin`, `locator`, `cfselocator`, `dealer`, `power`) returns a Cloudflare 403 challenge; Turnstile's host is blocked from the cloud egress, so Scrapling cannot solve it. Wayback holds the full unfiltered paged listing — the Tier-0.7 rung got the whole network at $0. Cards carry no website/email. Page-7 capture is a 403 (≤200 rows possibly missing). Common Crawl index connections reset through the proxy.
- **Merge trap:** ~100 Generac dealers list `facebook.com` as their website; key merges on the engine's `shared-hosts.js` list + ISP mail domains excluded, or unrelated dealers chain into one group.

Per-source detail follows (from the 2026-09-24 deep-dive).

---

## Briggs & Stratton Energy × US generator installers

**Coverage:** **2,466 US** dealers (2,981 total incl. CA 395, MX 96) — measured with one 2,000 mi radius call (counted, not stored). Houston 50 mi = 92, Tampa 50 mi = 33, Hartford 50 mi = 48.
**Fields:** dealerName ✅ · address/city/state/zip ✅ · lat/lng ✅ · phone ✅ · **email ✅ (~97%)** · **website ✅ (~79% own site; +15% via non-freemail email domain → ~94% domain)** · tier ✅ via `productLines[].productSegement` (AUTHORIZED DEALER / AUTHORIZED INSTALLER / PLATINUM DEALER / PLATINUM PRO DEALER / ELITE IQ INSTALLER / DISTRIBUTOR) · res/commercial ✅ `consumerIndicator` / `commercialIndustrialIndicator` / `commercialTurfIndicator` (all sample rows consumer=Y, C&I=N) · sales/service booleans ✅ · dealerId + legacy dealer page URL ✅.
**Restrictions:** No radius cap, no result cap observed (2,981 rows / 2.7 MB in 12 s). HubSpot CMS serverless function (`/_hcms/api/`) — plain curl works, no anti-bot seen. Be polite: one call is the whole dataset.
**Method:**
```
POST https://energy.briggsandstratton.com/_hcms/api/dealer-locator
content-type: application/json
{"siteName":"Energy Solutions","brandName":"Energy Solutions; Home Generator Systems","latitude":39.5,"longitude":-98.35,"radius":2000,"metricFlag":false}
```
**Recommended grid:** none — 1 call from US centroid at radius 2000 (or 4 regional calls at 1000 if a cap appears). Filter `country=='US'`.
**Cost actuals:** $0; 1 request.
**Gotchas:** Many "AUTHORIZED DEALER" rows are small-engine/outdoor-power shops (e.g. "Community Motors"), not generator installers — filter on segment (INSTALLER / PLATINUM / ELITE IQ) or qualify by website text. `zip` is ZIP+4 without dash. Website lacks scheme.
**Runs:** 2026-09-24 — Atlas Growth deep-dive — 173 rows (Houston/Tampa/Hartford 50 mi) — proof only.

---

## Generac × US generator installers

**Coverage:** The largest residential standby dealer network in the US. Est. 6,000–9,000 US residential dealers (Generac publicly claims ~9k NA dealers; not verified by full pull). Houston 25 mi = 100 (capped), Houston 10 mi = 51, Hartford 25 mi = 62, rural E. Montana 100 mi = 3. Industrial locator (category 3) is territory-based: Houston returned 2 industrial distributors at radius 3000 — tiny list (~100–200 US), document only.
**Fields (home, category 1):** company name ✅ · address/city/state/zip ✅ · lat/lng ✅ · phone ✅ (100/100) · **email ✅ (99/100)** · **website ✅ (69/100; 1 was a `*.generacdealers.com` microsite)** · dealer tier ✅ `dealerStatus` + `dealerClass` + badge image (Select / Elite / Elite Plus / Premier / PowerPro Elite / PowerPro Elite Plus / Prestige; ~51% blank = base "aligned contractor") · services ✅ (Sales / Service / Financing / EV Chargers) · rating ✅ · Generac dealer # (`user2`) ✅ · residential vs commercial: implied by endpoint `category` (1 = home standby, 3 = industrial; 2 = unknown small set, 3 rows Houston).
**Domain fill (Houston sample):** own website 68% · +15% recoverable from non-freemail email domain · 16% none → **~83% domain** before enrichment.
**Restrictions:** Hard cap **100 results per query**, no pagination param observed; results ordered by tier then distance (not pure distance), so a capped query silently drops lower-tier/farther dealers. Imperva/Incapsula script on page but the API accepted plain curl POSTs (5 calls, no challenge). No rate limit hit; stay ~1 req/2 s.
**Method:**
```
POST https://www.generac.com/DealerLocatorApi/GetDealers
content-type: application/json ; referer: https://www.generac.com/home-standby-generators/home-dealer-locator/
{"category":"1","countryCode":"USA","postalCode":"77002","radius":25,"siteID":1,"dealerServices":[]}
```
`centroidLatitude/centroidLongitude` optional (postalCode alone works). Industrial: same endpoint, `"category":"3","radius":3000,"testMode":false`. Response `{resultCount, dealers:[…]}`.
**Recommended grid (full US, residential):** adaptive quadtree on ZIP centroids — seed ~650 points at 50 mi radius (~75 mi spacing), and any query returning 100 re-split into ZIPs at 25 mi, then 10 mi. Expected ~1,500–2,500 calls; dedupe on `id`. ~1–1.5 h at 2 s/call.
**Cost actuals:** $0; ~250 KB/response.
**Gotchas:** 100-cap is silent (`resultCount` = 100 exactly = saturated). Ordering is tier-weighted, so saturation hides base-tier dealers first. `webSite` often upper-case without scheme; some are generacdealers.com microsites (use email domain instead). `stateProvince` has trailing space. `email` is sometimes an accounting/owner inbox — fine for domain, check before outreach.
**Runs:** 2026-09-24 — Atlas Growth deep-dive — 100 rows (Houston 25 mi) — proof only.

---

## Kohler (Rehlko) × US generator installers

**Coverage:** Est. 1,500–2,500 US dealers (not verified). Server returns a fixed nearest/assigned set per ZIP regardless of radius: Houston 31, Tampa 16 (one 625 mi away — territory-assigned "providedPostalCodes" dealers), Hartford 15.
**Fields:** name ✅ · street/city/state/zip ✅ · lat/lng ✅ · phone ✅ · **tier ✅ `accountSupType` (Titanium / Platinum / Gold / Silver / "Sales and Service")** · `productLine` ("Residential/Commercial") + `productSubCategory` ("Home Generators (up to 60kW)" and/or "Light Commercial (80–150kW)") + `generatorCertification` ✅ = the residential/commercial flag · servicesOffered, financingPrograms, utility programs (`externalCampaignParticipations`, e.g. CenterPoint) ✅ · SAP/Salesforce IDs ✅ · **website ❌** — only `micrositeUrl` (`*.kohlergeneratordealer.com`, 23/56) · **email ❌** — `emailLead` is the Rehlko territory rep, not the dealer.
**Domain fill:** 0% native → needs name+city→domain enrichment (grounded model) for 100%.
**Restrictions:** Main site behind Akamai (headless Chromium got 403 "Access Denied"; curl got 200). API: `maxItemPerPage` must be < 50, `distMiles` must be < 200 (validated server-side but otherwise ignored). No rate limit hit on 6 calls.
**Method:**
```
GET https://web-api.rehlko.com/geojson/energy/dealers?address=<zip5>&brand=energy&distMiles=100&maxItemPerPage=49&page=1
ocp-apim-subscription-key: <NEXT_PUBLIC_DEALER_LOCATOR_SUBSCRIPTION_KEY>   (NEXT_PUBLIC_DEALER_LOCATOR_SUBSCRIPTION_KEY, shipped in page JS)
Authorization: Bearer            (empty worked; site normally gets a guest token from POST https://web-api.rehlko.com/oauth/token?scope=guest)
```
Response `{info:[…], page, totalPages, totalRecords}`; paginate `page` until `totalPages`.
**Recommended grid:** radius is ignored, so grid by ZIP: ~900 ZIP3 representative ZIP5s, then top up in dense metros (top 100 CBSAs, 3–5 ZIPs each) until new-ID yield < 2%. ~1,200–1,500 calls; dedupe on `id`/`sfId`.
**Cost actuals:** $0 API; + domain enrichment on 100% of rows.
**Gotchas:** Key is public-by-design (NEXT_PUBLIC_) but may rotate — re-grep `/_next/static/chunks/*.js` for `DEALER_LOCATOR_SUBSCRIPTION_KEY`. Don't use `emailLead` as dealer email. Microsite URLs are Kohler-hosted, not the dealer's domain.
**Runs:** 2026-09-24 — Atlas Growth deep-dive — 56 rows (Houston p1 25, Tampa 16, Hartford 15) — proof only.

---

## Champion (HSB) × US generator installers

**Coverage:** **~476 US** (706 total incl. 229 CA) from one continent-wide call (counted, not stored); may be the full HSB network. Houston 200 mi diag = 38, Tampa = 22, Hartford = 61.
**Fields:** name ✅ · address/city/state/zip ✅ · lat/lng ✅ · phone ✅ · Champion dealer ID (`vendor_id`) ✅ · services ✅ (Installation / Service / Sales) · tier ⚠️ only `disclaimer` = "Authorized Dealer" (no tier levels seen) · **website ❌** (`dealer_rule_web_address` is a Champion quote-form link, not dealer site) · **email ❌** · res/commercial: implicit (HSB-only locator).
**Domain fill:** 0% native → 100% needs name+city→domain enrichment.
**Restrictions:** Cloudflare JS-detection script on locally.com but the XHR endpoint accepted plain curl (4 calls). Markers are not capped at small numbers (706 in one call).
**Method:**
```
GET https://champion-power-equipment-hsb.locally.com/stores/conversion_data?has_data=true&company_id=327355&dealers_company_id=327355&inline=1&map_center_lat=<lat>&map_center_lng=<lng>&map_distance_diag=<miles>&sort_by=proximity&no_variants=0&only_store_id=false&uses_alt_coords=false&q=false
```
(Found via `lcly_config_0` on https://www.championpowerequipment.com/dealer-locator/ → company_id 327355.)
**Recommended grid:** 1 call at US centroid, `map_distance_diag=6000`; verify with 4 regional calls that the count doesn't grow (possible hidden cap).
**Cost actuals:** $0; 1–5 requests.
**Gotchas:** Many are general electricians (e.g. "Ozzy's Electrical Works") — good ICP fit for installers. Generic Locally pattern — any brand using Locally can be pulled the same way by swapping subdomain/company_id.
**Runs:** 2026-09-24 — Atlas Growth deep-dive — 121 rows (Houston/Tampa/Hartford) — proof only.

---

## Cummins × US generator installers

**Coverage:** Unknown (not pulled). Cummins RLC network is smaller than Generac/Kohler; est. 1,000–2,000 US (unverified).
**Fields (from one default page load, Cummins-owned branches only):** name ✅ · location type ✅ · phone ✅ · address ✅ · distance ✅ · website ⚠️ (29/200 cards, all cummins.com for branches — dealer cards unknown) · email ❌ · tier ❌ seen. Form has `service_level` / `market_application` filters (AJAX-populated) that may carry dealer tier.
**Restrictions:** `www.cummins.com` and `locatoradmin.cummins.com` both return Cloudflare "Just a moment" (403) to curl and Playwright. One raw `chrome --headless=new --dump-dom` (no CDP) passed once; after a Playwright/CDP attempt the IP escalated to interactive Turnstile, and the session's egress policy denies `*.challenges.cloudflare.com`, so no further passes. Did not route around.
**Method (grammar confirmed, results not retrieved):** locator is an iframe (found via Wayback, WA-07):
```
GET https://locatoradmin.cummins.com/locator-interface/home-generators-rlc-2023?products=Power%20Generation&market_application=&service_level=&country=United%20States&postal_code=<zip>&distance=<5|25|50|100|Nearest>
```
Server-rendered: parse `.com_locator_entry` cards + `drupal-settings-json.mapData` (id, lat/lng, name). Default load returns 200 cards.
**Recommended next step:** Firecrawl scrape of the GET URL (3 test ZIPs, ~$0.01) or Scrapling StealthyFetcher; if it works, grid = distance=100 over ~350 points (check whether 200-card cap applies).
**Gotchas:** Don't drive with Playwright/CDP — it trips the challenge. Wayback has the iframe (2026-01) but snapshot is geo'd to crawler IP (Frankfurt) — not useful for US rows.
**Runs:** 2026-09-24 — Atlas Growth deep-dive — 0 rows — blocked.
