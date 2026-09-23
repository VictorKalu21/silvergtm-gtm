---
name: shopify-not-on-amazon
description: Use when building a list of established US Shopify / DTC brands that are NOT officially selling on Amazon.com (no brand store, not sold by the brand or Amazon) - screening thousands of Shopify stores with free data (HTTP Archive or Tranco+DNS, the store's own /meta.json and /products.json, Amazon autocomplete) and verifying Amazon presence with a rendered Amazon search. Also use for the inverse ("Shopify brands already on Amazon"), for "physical-product Shopify brands in the US with 50k+ traffic", or to answer "how would you screen 5,000 Shopify brands for Amazon presence".
---

# Shopify brands NOT on Amazon

Build a verified list of **US-based, established, physical-product Shopify brands with no official Amazon.com presence**, with a real contact footprint. Deliverable columns: `Brand | Website | Category | Estimated Traffic/Sales | Amazon Presence Status | Email | Phone | LinkedIn | Decision Maker`.

**Core principle (same as every skill here): source free, gate free, pay (time or money) late.** Shopify stores expose their own truth for free (`/meta.json` = address country + product count; `/products.json` = physical vs digital, catalog age, POD/dropship fingerprints). Amazon exposes demand for free (autocomplete). Only the final verdict needs a rendered Amazon page, and only for the survivors.

## Pipeline (cheapest first, every step resume-safe)

| # | Step | What it decides | Cost | Script |
|---|------|-----------------|------|--------|
| 0 | Source | every Shopify storefront + a popularity rank | free | `httparchive.sql` (BigQuery, CrUX rank) **or** `seed-tranco-dns.mjs` (Tranco top-1M x DNS 23.227.38/24, no credentials) |
| 0b | Prep | dedupe by registrable domain, keep best rank | free | `prep-input.mjs` |
| 1-6 | Free gates | live Shopify (not password/offline/`.myshopify.com`) · **US** (`/meta.json` country) · **physical** (`requires_shipping` share) · not stale (catalog `updated_at`) · **not dropship/POD** (app fingerprints + catalog shares) · not already linking to Amazon on its own site · contact footprint (mailto/tel/LinkedIn/IG + `/pages/contact*` fallback) | free, 3-5 fetches/domain, ~10/s | `pipeline.mjs` |
| 7a | Amazon demand | Amazon autocomplete: 0 brand suggestions = nobody buys this brand on Amazon (strong prior); rich = demand exists (official OR resellers) | free, no bot wall, minutes | `amazon-autocomplete.mjs` |
| 8 | Brand + category | Haiku reads homepage text + product types: genuine consumer brand vs reseller/marketplace/agency/B2B; assigns category | cheap | `prep-classify.mjs` -> subagents -> `merge.mjs classify` |
| 7b | Amazon VERIFY | plain **mobile-UA fetches**: 2 searches + Amazon's brand filter -> up to 5 product pages (tablet UA) -> `brand_store` / `listings_official` / `listings_3p` (resellers only) / `listings_dormant` / `none`. Accumulates across passes, never downgrades. | free, ~20-40s/brand | `amazon-verify.mjs` (`amazon-verify-render.mjs` = browser fallback) |
| 8b | Lead review | second Haiku pass on the lead candidates only: final keep/drop + fixed category list + a one-line sales note | cheap | `merge.mjs final` picks up `{RUN}_lead_review_N_out.json` |
| 9a | Contacts | contact / policy / about / wholesale pages -> emails (own-domain, non-generic first), phones, LinkedIn, named people | free | `enrich-contacts.mjs` |
| 9b | Paid enrichment (optional) | DataForSEO: traffic estimate (run on the RAW list before the gates), Amazon branded search volume, Google store-page check | ~$0.01/call + $0.0001/item; SERP $0.002 | `dataforseo.mjs` |
| 9 | Deliverable | keeps x Amazon x review x contacts x DataForSEO x optional Apollo people export -> LEADS (25% cap on fashion/jewelry/alcohol/medical, sorted by Amazon demand) / excluded / needs-check | free | `merge.mjs final` |

```bash
export DIR=/path/to/workdir RUN=shopify_us
# 0  source: EITHER BigQuery (httparchive.sql -> export CSV)  OR  free Tranco x DNS:
curl -L -o top-1m.csv.zip https://tranco-list.eu/top-1m.csv.zip && unzip top-1m.csv.zip
FROM=1 TO=200000 CONC=800 node seed-tranco-dns.mjs top-1m.csv        # -> {RUN}_seed.csv
node prep-input.mjs {RUN}_seed.csv                                     # -> {RUN}_input.json
node pipeline.mjs                                                      # -> {RUN}_signal.json + _ALL.csv   (RETRY=1 re-fetches unreachable/blocked)
node amazon-autocomplete.mjs                                           # -> {RUN}_amazon_ac.json
#   optional, before the gates: DATAFORSEO_LOGIN=.. DATAFORSEO_PASSWORD=.. SOURCE=input node dataforseo.mjs traffic && MIN_TRAFFIC=20000 node prep-input.mjs --filter
node prep-classify.mjs                                                 # -> {RUN}_review_batch_N.json ; dispatch Haiku (below)
node merge.mjs classify                                                # -> {RUN}_keeps.json
node amazon-verify.mjs                                                 # -> {RUN}_amazon_verify.json  (CONC=2; when throttled: SEARCH_PASSES=1 BF_VARIANTS=1 MAX_DP=2)
#   RETRY=1 (redo blocked)  ONLY=a.com,b.com (redo those; put hand search terms in {RUN}_query_overrides.json first)
#   RESCORE=1 (no fetch: re-derive verdicts from the product pages already read, after any matcher change; never downgrades)
#   optional: node dataforseo.mjs amazon-volume                        # branded searches/mo on Amazon -> {RUN}_dfs_amazon.json
#   lead review: batch the none/3p/dormant keeps -> Haiku -> {RUN}_lead_review_N_out.json (prompt below)
node enrich-contacts.mjs                                               # -> {RUN}_contacts.json
CAP_SHARE=0.25 node merge.mjs final                                    # -> {RUN}_LEADS.csv (+ _full, _excluded_amazon, _needs_check, _over_category_cap)
N=100 DELIVERED=prior_batch.csv node select.mjs                        # -> {RUN}_SELECT.csv : denylist.json + already-delivered exclusion + ranking + 25% cap (N=0 = whole pool)
# or all of the above in one go (resume-safe; exits 3 while a Haiku batch is waiting for its _out.json):
DIR=~/clients/x RUN=us DATAFORSEO_LOGIN=.. DATAFORSEO_PASSWORD=.. ./run-all.sh top-1m.csv
```

Per-workdir hand files (never in the repo): `denylist.json` `{domain: reason}` grows with every run (retailers, foreign parents, licensed merch, verifier misses); `{RUN}_query_overrides.json` `{domain: "amazon search term"}` for sites whose title gave a bad name.

## How the Amazon check actually works (the part clients ask about)

1. **Own site (free, in the gates).** Any `amazon.com/stores/...` or product link, or a "Shop on Amazon" CTA on the homepage = they're on Amazon -> `drop_amazon_on_site`. Catches few, costs nothing.
2. **Autocomplete (free, bulk).** `completion.amazon.com/api/2017/suggestions?prefix=<brand>` has no bot wall. Suggestions containing the brand = Amazon shoppers search for it. `none` is the strongest cheap not-on-Amazon prior and orders the verify queue; it is never the verdict (resellers create demand too).
3. **Fetched search + product pages (the verdict).** A desktop UA gets a 503 wall; a **phone UA gets full search results** from a plain fetch; a **tablet UA gets the product page with the byline inline** (phone product pages load the byline lazily - 5 fetches, 0 bylines on BRUNT). Per brand: 2 searches (result sets differ per request; union them), Amazon's own brand filter `rh=p_89:<Brand>` with the name variants, then up to 5 product pages:
   - a listing is **attributed** to the brand only if its **byline** ("Visit the X Store" / "Brand: X") or **seller** carries the brand's distinctive words. A title-only match never counts ("Universal Standard Staples" sold by Amazon.com; "Fast Growing hybrid poplar cuttings").
   - a store byline is usually **one word shorter than the site name**: "Visit the Vornado Store" for Vornado Air, "HUDSON" for Hudson Jeans, "Tifosi" for Tifosi Optics, "CHITA" for chitaliving.com. The rule: the whole store name equals the brand's first distinctive word and the leftover word is a category noun (`CATEGORY` list in the verifier) or appears in the product title; or the domain root is the store name plus generic words. "Visit the Universal Store" still does NOT match Universal Standard, and "Hudson Baby" does not pass as Hudson. This one rule flipped 18 "none" verdicts to `brand_store` across two runs (Burton, Estes, Mrs. Meyer's, Vornado, Hudson, Arkon, Condor, Milton...).
   - `Visit the <Brand> Store` -> `brand_store`; seller = brand or Amazon.com -> `listings_official`; attributed but every seller is a third party -> **`listings_3p` (unauthorized resellers = no official presence, the best pitch)**; attributed but every listing "Currently unavailable" -> `listings_dormant`; nothing attributed -> `none`.
   - ANY official listing = official. A re-run (`REPASS=1`) never downgrades and keeps every listing ever found; two clean passes agreed on 19/20 of a recheck set.
   - throttle (HTTP 503 / "Sorry" / a <5 KB shell page) -> rotate header set, back off; Amazon throttles an exact (UA, Accept, Accept-Language) triple after a few hundred requests and the whole IP after a few thousand -> lighter mode `SEARCH_PASSES=1 BF_VARIANTS=1 MAX_DP=2`.
4. **Manual pass on the finalists** (the deliverable promises "verified"): every row carries the ASIN evidence and an Amazon search URL. Names flagged `Ambiguous name` get a human look.

Paid shortcut when volume matters: a Google SERP API query `site:amazon.com "Visit the <Brand> Store"` per brand (~$0.002 each) replaces step 3 for the bulk screen; keep the render for the finalists.

## Step 8b: lead review prompt (second Haiku pass, lead candidates only)

Rows `{domain, brand, rank, state, productCount, medianPrice, types, vendors, classifyCategory, amazon, amazonDemand, contacts, text}`:

> Final quality review for a client who wants real U.S. DTC brands (no dropshippers, retailers, marketplaces), physical products, established, mainly supplements/skincare/beauty/pets/home/garden/office/household/food. `isKeep` false ONLY for: reseller/multi-brand retailer, marketplace, dropship/POD, digital/services, alcohol/tobacco/vape/CBD, adult, weapons, clearly non-US, band/celebrity merch, not a real brand. **The `amazon` field is never a drop reason** (resellers-only and dormant are wanted). `category` from the fixed list; `note` = one sales line. JSON only.

Haiku still drops on "already has Amazon presence" and invents catalog-size rules; `merge.mjs final` therefore honors a review drop only when its reason matches the allowed list (see the run notes) - keep that guard.

## Step 8: the Haiku prompt (the only per-run config)

One `claude-haiku-4-5` subagent per `{RUN}_review_batch_N.json` (rows `{domain, brand, rank, state, productCount, medianPrice, types, vendors, flags, text}`), writing `{RUN}_review_batch_N_out.json`:

> For each row decide `isKeep`: KEEP = a genuine consumer **brand** selling its **own physical products** DTC (apparel, beauty, home, food/supplements, pets, outdoor, gear, jewelry, kids...). DROP = multi-brand retailer/reseller/marketplace, wholesale/B2B-only, services/digital/courses, agency/theme/app vendor, adult, tobacco/vape/CBD (Amazon-restricted anyway), obvious dropship/POD generic store (check `flags`), or not a real brand. Give `category` (short, e.g. "Home & Kitchen", "Skincare", "Men's Apparel") and a one-line `reason`. Return JSON only: `[{"domain":<exact input domain>,"isKeep":bool,"category":"...","reason":"..."}]`.

Verdicts merge **by domain** (`merge.mjs classify`), never by index; unmatched -> `{RUN}_unmatched.json` for a re-run.

## Traffic / sales column (honest version)

No free per-site visit count exists. Use the rank the source already gave you: **CrUX rank bucket** (HTTP Archive) or **Tranco rank**, banded in `merge.mjs final` (top-50k "very high", top-100k "high, 50k+/mo likely", top-250k "medium"). Extras in `_LEADS_full.csv` that proxy sales: product count, median price, `stack` (Shopify Plus / Klaviyo / Recharge = mature). Optional paid upgrade: a bulk traffic API (DataForSEO Labs, Similarweb) by domain for a visits number.

## Decision maker

`merge.mjs final` joins `{RUN}_people.csv` (an Apollo people export filtered to the lead domains; titles Founder/CEO/Owner > Ecommerce/Marketplace/Digital > Marketing/Growth) by domain. Without it, Email/Phone/LinkedIn come from the site footprint and Decision Maker stays blank for a manual LinkedIn pass.

## Gotchas (learned on the first two runs)

- **Shopify's own bot challenge** ("Verifying your connection", HTTP 429) locked a datacenter IP out of 83% of stores at CONC=25 and stayed sticky for the day; the next day at `CONC=4 DELAY=1000` ~half passed. Residential IP + CONC<=8 for the gates; `RETRY=1` re-fetches blocked rows.
- **Verify by accumulation, never by one sample.** Amazon's result set varies per request; a single search + single product page produced a 25% false-"not on Amazon" rate on the first 20 (BRUNT, Vincero, Matador, Alo, American Autowire were all official).
- **Run DataForSEO traffic BEFORE the gates** (`SOURCE=input`, ~$0.11 per 1,000 domains): cutting to 20k+/50k+ visits first saves most of the gate fetches.

- **`/meta.json` is the US gate**, not `Shopify.country` on the homepage (that's the visitor's localized market). Headless stores (Gymshark-style, Astro/Next front-ends) return HTML for `/meta.json` -> `headless` flag, country falls back to Shopify globals.
- **Bot walls on the plain fetch** (Vercel checkpoint, Cloudflare "Attention Required", 429) -> `blocked`, not `not_shopify`. Recover with a render pass or skip; Bombas/Ridge/Caraway all did this.
- **POD/dropship scoring must be catalog-SHARE based.** G Fuel sells Printful merch as a side line (5% of catalog) - a hard drop on "Printful present" loses real brands. Hard tells (apps, >=50% POD/AliExpress catalog) score 3; soft tells (inflated compare-at, mega catalog, long titles) score 1 each; drop at 3. Gymshark/Fashion Nova (sale pricing + 10k-25k SKUs) score 2 and pass.
- **Physical share, not first product.** Allbirds' first product is a `re:do` return-protection SKU (`requires_shipping:false`); judge on the share across 250 products.
- **Brand name for Amazon = `meta.json name`, cleaned**: strip trailing US/USA/Inc, then try full name -> minus last word ("HexClad Cookware" -> "hexclad", "Gymshark US" -> "gymshark").
- **Amazon throttles per IP** after a handful of renders; low-and-slow + back-off is not optional. From a datacenter IP expect 503s early; residential is fine.
- **Sponsored store links lie**; only the product-page byline proves a brand store.
- **Bad search term = bad verdict.** The term comes from `meta.json name` / the `<title>`; "top" (kirby.com), "new car" (vinylfrog.com), "urinary tract health supplements" (uqora.com) all searched the wrong thing. Every row that reaches the deliverable gets its search term eyeballed (`Amazon search term used` column); fix the bad ones in `{RUN}_query_overrides.json` and re-run `ONLY=` on them.
- **Tablet product pages use single-quoted attributes** (`id='productTitle'`, `id='sellerProfileTriggerId'`); a double-quote-only regex silently returns an empty title/seller.
- **After any matcher change run `RESCORE=1`** on every run directory: it re-judges the stored product pages in seconds and costs no Amazon requests.
- **`.myshopify.com` domains and password/offline stores** are not established brands - drop before spending anything.
- Data outputs (`*_LEADS*.csv`, `*_signal.json`) are PII/deliverables -> gitignored; keep them in the client workdir.
