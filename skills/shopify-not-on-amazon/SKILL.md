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
| 7b | Amazon VERIFY | rendered Amazon search (+1 product page): `brand_store` / `listings_official` / `listings_3p` (resellers only) / `none` | free, slow (~10s/brand, 1 tab) | `amazon-verify.mjs` |
| 9 | Deliverable | keeps x Amazon x optional Apollo people export -> LEADS / excluded / needs-check | free | `merge.mjs final` |

```bash
export DIR=/path/to/workdir RUN=shopify_us
# 0  source: EITHER BigQuery (httparchive.sql -> export CSV)  OR  free Tranco x DNS:
curl -L -o top-1m.csv.zip https://tranco-list.eu/top-1m.csv.zip && unzip top-1m.csv.zip
FROM=1 TO=200000 CONC=800 node seed-tranco-dns.mjs top-1m.csv        # -> {RUN}_seed.csv
node prep-input.mjs {RUN}_seed.csv                                     # -> {RUN}_input.json
node pipeline.mjs                                                      # -> {RUN}_signal.json + _ALL.csv   (RETRY=1 re-fetches unreachable/blocked)
node amazon-autocomplete.mjs                                           # -> {RUN}_amazon_ac.json
node prep-classify.mjs                                                 # -> {RUN}_review_batch_N.json ; dispatch Haiku (below)
node merge.mjs classify                                                # -> {RUN}_keeps.json
LIMIT=300 node amazon-verify.mjs                                       # -> {RUN}_amazon_verify.json (needs: npm i playwright && npx playwright install chromium)
node merge.mjs final                                                   # -> {RUN}_LEADS.csv (+ _full, _excluded_amazon, _needs_check)
```

## How the Amazon check actually works (the part clients ask about)

1. **Own site (free, in the gates).** Any `amazon.com/stores/...` or product link, or a "Shop on Amazon" CTA on the homepage = they're on Amazon -> `drop_amazon_on_site`. Catches few, costs nothing.
2. **Autocomplete (free, bulk).** `completion.amazon.com/api/2017/suggestions?prefix=<brand>` has no bot wall. Suggestions containing the brand = Amazon shoppers search for it. `none` is the strongest cheap not-on-Amazon prior and orders the verify queue; it is never the verdict (resellers create demand too).
3. **Rendered search (the verdict).** Plain fetches get a 503 wall, so Playwright drives one Chromium tab to `amazon.com/s?k=<brand>`:
   - store link whose **visible/alt text** carries the brand -> `brand_store` (Brand Registry = official). Sponsored-brand store links can belong to a competitor bidding on the brand name, so the link's query string is never trusted.
   - else open the first brand-matching ASIN and read the byline + "Sold by": `Visit the <Brand> Store` -> `brand_store`; seller = brand or Amazon.com -> `listings_official`; anyone else -> **`listings_3p` = unauthorized resellers only = no official presence and the best pitch angle**.
   - no brand refinement and no brand-matching titles -> `none`.
   - Amazon's throttle page ("Sorry! Something went wrong", HTTP 503) -> `blocked`, exponential back-off, 3 attempts, `RETRY=1` next run.
4. **Manual pass on the finalists** (the deliverable promises "verified"): open the store/ASIN evidence in `{RUN}_LEADS_full.csv`; names flagged `Ambiguous name` (<=4 chars / dictionary words) get a human look.

Paid shortcut when volume matters: a Google SERP API query `site:amazon.com "Visit the <Brand> Store"` per brand (~$0.002 each) replaces step 3 for the bulk screen; keep the render for the finalists.

## Step 8: the Haiku prompt (the only per-run config)

One `claude-haiku-4-5` subagent per `{RUN}_review_batch_N.json` (rows `{domain, brand, rank, state, productCount, medianPrice, types, vendors, flags, text}`), writing `{RUN}_review_batch_N_out.json`:

> For each row decide `isKeep`: KEEP = a genuine consumer **brand** selling its **own physical products** DTC (apparel, beauty, home, food/supplements, pets, outdoor, gear, jewelry, kids...). DROP = multi-brand retailer/reseller/marketplace, wholesale/B2B-only, services/digital/courses, agency/theme/app vendor, adult, tobacco/vape/CBD (Amazon-restricted anyway), obvious dropship/POD generic store (check `flags`), or not a real brand. Give `category` (short, e.g. "Home & Kitchen", "Skincare", "Men's Apparel") and a one-line `reason`. Return JSON only: `[{"domain":<exact input domain>,"isKeep":bool,"category":"...","reason":"..."}]`.

Verdicts merge **by domain** (`merge.mjs classify`), never by index; unmatched -> `{RUN}_unmatched.json` for a re-run.

## Traffic / sales column (honest version)

No free per-site visit count exists. Use the rank the source already gave you: **CrUX rank bucket** (HTTP Archive) or **Tranco rank**, banded in `merge.mjs final` (top-50k "very high", top-100k "high, 50k+/mo likely", top-250k "medium"). Extras in `_LEADS_full.csv` that proxy sales: product count, median price, `stack` (Shopify Plus / Klaviyo / Recharge = mature). Optional paid upgrade: a bulk traffic API (DataForSEO Labs, Similarweb) by domain for a visits number.

## Decision maker

`merge.mjs final` joins `{RUN}_people.csv` (an Apollo people export filtered to the lead domains; titles Founder/CEO/Owner > Ecommerce/Marketplace/Digital > Marketing/Growth) by domain. Without it, Email/Phone/LinkedIn come from the site footprint and Decision Maker stays blank for a manual LinkedIn pass.

## Gotchas (learned on the first run)

- **`/meta.json` is the US gate**, not `Shopify.country` on the homepage (that's the visitor's localized market). Headless stores (Gymshark-style, Astro/Next front-ends) return HTML for `/meta.json` -> `headless` flag, country falls back to Shopify globals.
- **Bot walls on the plain fetch** (Vercel checkpoint, Cloudflare "Attention Required", 429) -> `blocked`, not `not_shopify`. Recover with a render pass or skip; Bombas/Ridge/Caraway all did this.
- **POD/dropship scoring must be catalog-SHARE based.** G Fuel sells Printful merch as a side line (5% of catalog) - a hard drop on "Printful present" loses real brands. Hard tells (apps, >=50% POD/AliExpress catalog) score 3; soft tells (inflated compare-at, mega catalog, long titles) score 1 each; drop at 3. Gymshark/Fashion Nova (sale pricing + 10k-25k SKUs) score 2 and pass.
- **Physical share, not first product.** Allbirds' first product is a `re:do` return-protection SKU (`requires_shipping:false`); judge on the share across 250 products.
- **Brand name for Amazon = `meta.json name`, cleaned**: strip trailing US/USA/Inc, then try full name -> minus last word ("HexClad Cookware" -> "hexclad", "Gymshark US" -> "gymshark").
- **Amazon throttles per IP** after a handful of renders; low-and-slow + back-off is not optional. From a datacenter IP expect 503s early; residential is fine.
- **Sponsored store links lie**; only the product-page byline proves a brand store.
- **`.myshopify.com` domains and password/offline stores** are not established brands - drop before spending anything.
- Data outputs (`*_LEADS*.csv`, `*_signal.json`) are PII/deliverables -> gitignored; keep them in the client workdir.
