# Google Maps × US merchant-services / payment-processing ISO shops

**Verdict:** VALIDATED. `last_validated: 2026-07-11`. Client first run: db2b house.

## ICP
Small US merchant-services / ISO / payment-processing SHOPS (office-having, residual book = can pay).
NOT solo home agents (no Maps listing anyway), NOT big processors/banks (own SDR teams).

## Method / coverage
- scraper.tech Maps, `areas` mode, top-50 US metros (79 centers), zoom 12.
- 4 category queries: Merchant services, Credit card processing service, Payment processing service, POS system supplier.
- Yield: 6,223 raw → 3,504 unique → 2,555 qualified → **2,528 net-new**. 84% have website.
- This is a SMALL universe vs agencies (~2.5k vs 60k) — ISO shops are a far smaller population. Expect low thousands nationally.

## Qualify design (CRITICAL — vertical-specific)
- **NO google_types ALLOW-list.** MS/ISO shops are typed inconsistently by Google — "Business to business
  service", "Financial institution", "Financial consultant", "Loan agency", "Corporate office" — almost never
  "payment"/"merchant". An allow-list on those tokens dropped 68% of real ISOs (kept 5%). The category SEARCH
  is the universe definer here; qualify = DENY-ONLY.
- Deny: big processors/banks by NAME (Square/Stripe/PayPal/Fiserv/Global Payments/TSYS/Elavon/Worldpay/Chase/
  Heartland/Toast/Shift4/Clearent/Paysafe/Nuvei/Adyen/Authorize.net/Stax/Helcim/etc.) + junk google_types
  (bank/credit union/atm/real estate/insurance/law/notary/credit counseling/school/gov/car dealer/marketing agency).
- can-pay/small-shop precision (years>=3, real site, not-solo, residual-book signal) = Clay-stage, NOT Maps. NO review floor (B2B).

## Gotchas
- ~2-3% gov/association leakage survives deny-only ("Child Support Bureau", associations) — add "social services
  organization"/"association / organization"/"non-profit" to the deny, or let Clay classify drop them.
- Cross-vertical overlap with the agency run was tiny (22 place_ids) — MS shops ≠ agencies, as expected.

## Complement — Visa Global Registry (hidden API CRACKED, reusable)
The Visa Global Registry of Service Providers is an Angular SPA at visa.com/splisting/ — the `.do` paths and the
AWS/versatec "registry" PDFs are DUDS (2-page compressed attestations, not the list). The real data is a hidden JSON API:
- **`POST https://www.visa.com/splisting/api/searchGrsp`** (the GET returns only page 0; the app's `searchProvider()`
  method POSTs). Body: `{"searchText":"","regions":[],"validationType":[],"page":<1-indexed>,"size":100,"sort":""}`.
  Returns a Spring page: `{content:[...30-100 records], totalElements, totalPages, number}`. **1-INDEXED** (send page=2 → number:1).
  Standard `?page/?size` query params are IGNORED — must be in the POST body. `size` up to 100 honored.
- Global = 8,886 providers / 89 pages@100. Filter US client-side on `companyLocationCountry=="UNITED STATES OF AMERICA"`.
- Rich fields: companyName, **companyURL (domain)**, companyEmail, locationCity, companyLocationState, registeredSince,
  validationTypeList, assessorCompanyName, spId. ~54% have a domain (Apollo-ready); rest need domain resolution.
- Scraper: `visa-scrape.js` in the MS run folder. **SKEWS LARGER** (PCI+sponsor-bank required to register) = opposite
  of the small-shop ICP → coverage/expansion layer, NOT the core. US = 2,478; net-new vs Maps = 2,166; 312 overlap validated both.
- Dedupe Visa↔Maps by normalized-name + website-host (no place_id on Visa).
Individual 1099 agents live on LinkedIn/Apollo (people-layer), not Maps or the registry.

## Watch-out — "Merchant services" search pulls MCA/merchant-funding
The Maps "Merchant services" query also returns merchant-CASH-ADVANCE / lending shops (CFG Merchant Solutions,
Premium Merchant Funding — "merchant" in the name, but they do funding not payment processing). Different sub-vertical
+ MCA flagged avoid (deliverability/rep). Split payment-ISO vs MCA/funding at the Clay classify.
