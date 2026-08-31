# Platform partner registries × implementation consultancies (US/CA SMB)

**Vertical/ICP:** software/implementation consulting firms (Salesforce/HubSpot/NetSuite partners, custom-dev shops), owner-led, 15–75 HC. Client: Minerva (outsourced finance). `last_validated: 2026-07-14`

## Salesforce AppExchange — VALIDATED, Tier-0 ★
- **Method:** `POST https://findpartners.salesforce.com/webruntime/api/apex/execute?language=en-US&asGuest=true&htmlEncode=false` body `{"namespace":"","classname":"@udd/01p3m00000EBlzK","method":"getPartners","isContinuation":false,"params":{"selectedFiltersFromJS":{...}},"cacheable":false}`. Guest LWR Experience site — no auth, no Cloudflare, no key.
- **GOTCHAS:** `offset` is IGNORED (always top-N by score); `limitSize` caps ~1000. **Shard by `countries` filter** with FORMAL names (`"United States of America"`, `"Canada"`); multiple countries in one array = AND (returns near-nothing). US=875 + CA=114 → full universe in 2 calls.
- **Fields:** Name, Headquarters__c (free-text, parse state client-side), Number_of_Credentials__c (certs = SIZE PROXY, not headcount — Accenture 22,621; SMB band ≈ 5–300), projects, rating, reviews, listing URL, description. NO real headcount (→ Apollo).
- **DOMAIN (Tier-1, validated 2026-07-14, 567/588 @ 97%):** getPartners gives no domain, but the listing detail page does — plain curl `GET appexchange.salesforce.com/appxConsultingListingDetail?listingId=<id>` (server HTML, no JS/auth) → website in `<a data-event="listing-publisher-website" href="...">`. Extract listingId from AppExchange_Listing_URL__c.
- Discovery path that found it: chrome netlog (`--log-net-log`) on appexchange.salesforce.com/consulting → findpartners.salesforce.com → CDP capture of an in-page filter click revealed the `selectedFiltersFromJS` param shape (blind param guessing all failed).
- `getFilterOptions` (GET, same gateway) = 116 facet ids; countries/states/practiceSize are NOT in it (client-side enums; practiceSize = small/medium/large, server-side encoding unresolved — filter client-side on certs instead).

## Clutch (any category) — export path, NOT script path
- Cloudflare is INTERMITTENT: curl+browser-headers works some sessions (1-in-5 to 1-in-8 retries), hard-blocks others; headless Chrome/CDP always challenged. Server HTML only carries ~30 above-fold cards/page (rest lazy-load).
- **Winning method: user's Instant Data Scraper export** (logged-in browser clears CF, scrolls full pages). Pre-filter in the URL (`agency_size=10 - 49&agency_size=50 - 249`, `/us/` path) → export is 100% in-band.
- **Parse gotchas:** website redirect (`r.clutch.co/redirect?...&u=<real url>`) DRIFTS across `provider__cta-link href N` columns per row → scan every cell; **only sponsors carry it** (~1%) — domain is downstream work. Highlights (emp band/location/min-project/hourly) detect by regex pattern, not column position.
- TAM measured (US, in-band 10–249): `it-services` 9,965 (≈MSP/IT-support — WRONG slice for consulting ICP), `developers` 5,345 (right slice: custom-software consultancies), `it-services/salesforce` 729.

## HubSpot ecosystem.hubspot.com/marketplace/solutions — CRACKED Tier-0 end-to-end ★
Two-tier raw API, no browser/cookies (validated 2026-07-14: 6,665 partners → 1,429 US/CA @ 100% domain).
1. **LIST — `PersonalizationPublicRpc/search`** `POST app.hubspot.com/api/chirp-frontend-external/v1/gateway/com.hubspot.marketplace.personalization.rpc.PersonalizationPublicRpc/search`. TWO non-obvious keys: (a) header **`x-hs-fingerprint`** (grab from any real page request — a browser "copy as cURL"; stable enough for a full run), (b) body uses **`filterGroups`, NOT `queryType`**: `{"filter":{"filterGroups":[{"filtersByField":{"PRODUCT_TYPE":[{"values":["SOLUTIONS_PARTNER_PROFILE"],"clause":"OR","negation":false,"__typename":"com.hubspot.marketplace.search.models.filters.StringFilterQuery"}]},"clause":"AND","negation":false}],"clause":"AND","negation":false},"length":60,"offset":N,"language":"en"}`. queryType/plain-filter returns the APP marketplace (2,330 apps) — the trap that burned an hour. Paginate offset 0→7,409 by 60 → `slug`+`companyName`.
2. **DETAIL — `MarketplaceListingDetailsRpc/getListingDetailsV2?portalId=53`** body `{"slug","language":"en"}`, raw no-auth → `companyUrl` (DOMAIN ~100%), `remoteLocations[].remoteLocation` (city/state/country → US/CA gate), `companySizeSpecialty` (= CLIENT size served, NOT partner headcount → size stays Apollo), industryChoice.
- **Cards have NO href** (JS-nav) and **slugs are opaque** (SmartBug≠`smartbug`; name-derivation ~0% on tagline-polluted names) → slug list ONLY from the search API, never DOM/IDS. Headless never hydrates the grid — get fingerprint+payload from the user's real browser, don't CDP-capture headless.
- Directory = 7,409 partners global (~19% US/CA). `companyName` is often a tagline → first-token cleanup for the real name.

## NetSuite via Partnerbase — BLOCKED cheap-path
- Partnerbase is powered by `api.tracedata.ai/v1/companies/{slug}/partnerships?page=&limit=50` — **401, X-API-Key required, key NOT in page/bundle**. ~1,040 NetSuite partners listed. Deprioritized (small slice); revisit via Oracle's own directory or ERP Research mirror if needed.

## Cross-cutting lessons
- Certs/credentials = usable size proxy for partner registries; real headcount gate belongs in Apollo.
- MSPs ≠ consulting ICP when the proof is utilization/realization (recurring-contract P&L) — sub-type by *business model*, not "IT" label.
- Clearbit autocomplete ≈ 29% domain fill on SMB consultancies — plan Clay/Apollo waterfall, not free enrichment, above a few hundred rows.
