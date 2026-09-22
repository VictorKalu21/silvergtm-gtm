# 05 · Shopify brands NOT on Amazon — established US DTC brands with no official Amazon.com presence

**Outcome:** a verified CSV of **US-based, established, physical-product Shopify brands that do not officially sell on Amazon.com** (no brand store, not sold by the brand or by Amazon), each with a real contact footprint. Columns: `Brand | Website | Category | Estimated Traffic/Sales | Amazon Presence Status | Email | Phone | LinkedIn | Decision Maker`.

**Why this shape:** the buyer of this list (an Amazon agency / aggregator / marketplace-management shop) wants brands that are big enough to matter and have *not* been sold the Amazon channel yet. Every gate is derivable from data the store itself publishes for free; only the final Amazon verdict needs a rendered page, and only for survivors. "Unauthorized resellers only" is a *better* lead than "nothing on Amazon" — the brand is already losing margin there — so the process keeps that distinction.

**When to run:** a client asks for "Shopify brands not on Amazon", "DTC brands without an Amazon presence", the inverse ("Shopify brands already on Amazon"), or any "physical-product Shopify brands in the US with real traffic" list. Also the answer to *"how would you screen 5,000+ Shopify brands for Amazon presence without Googling them one by one"* (see the pitch section).

**Skill:** `skills/shopify-not-on-amazon/` (SKILL.md + `scripts/`).

---

## Inputs

- **Source list (pick one, both free):**
  - **HTTP Archive on BigQuery** (`httparchive.sql`): every Shopify root page in the latest crawl with its **CrUX rank bucket** (needs a Google login; 1 TB/month free scan). Fullest coverage, includes headless/Cloudflare-fronted stores.
  - **Tranco top-1M × DNS** (`seed-tranco-dns.mjs`): every domain in the rank range that resolves to Shopify's `23.227.38.0/24`. Zero credentials, ~2 min per 100k domains. Misses stores fronted by Cloudflare/Vercel (~10-20%).
- **Node 22** (`fetch`, ESM). **Playwright + Chromium** for the Amazon verify only (`npm i playwright && npx playwright install chromium`).
- Optional: an **Apollo people export** filtered to the lead domains (`{RUN}_people.csv`) for the Decision Maker column.

## The gates (cheapest first, all from the store's own endpoints)

| # | Gate | Evidence | Cost |
|---|------|----------|------|
| 1 | Live Shopify storefront | `/meta.json` returns `myshopify_domain`; not password/offline; not a `.myshopify.com` domain | free |
| 2 | **US-based** | `meta.json.country == "US"` (the store's registered address — NOT the homepage's localized `Shopify.country`) | free |
| 3 | **Physical products** | share of `/products.json` products with a variant `requires_shipping:true` ≥ 50% | free |
| 4 | Active | newest `updated_at` in the catalog < 365 days | free |
| 5 | **Not dropship / POD** | app fingerprints (DSers, Zendrop, CJ, Spocket, Printful, Printify…) + catalog shares (AliExpress/Printful image CDNs, POD vendors) + soft tells (inflated compare-at, 3k+ SKU single-vendor catalogs, SEO-length titles). Score ≥ 3 drops. | free |
| 6 | Not already on Amazon by its own admission | `amazon.com/stores/…`, product links, "Shop on Amazon" CTA on the homepage | free |
| 7 | Contact footprint | mailto/tel/LinkedIn/Instagram from the homepage, then `/pages/contact-us`, `/pages/contact`, `/pages/wholesale` | free |
| 8 | Genuine consumer brand + category | Haiku on pruned homepage text + product types/vendors + gate flags | cheap |
| 9 | **Amazon presence** | autocomplete demand (free, bulk) → rendered search + product byline/seller (free, slow) | free / time |

## The Amazon check (three layers)

1. **Own site** — a store/product link or "Shop on Amazon" CTA on the brand's site = on Amazon. Cheap, catches few.
2. **Amazon autocomplete** (`completion.amazon.com/api/2017/suggestions`, no bot wall) — count suggestions containing the brand. **Zero = nobody searches this brand on Amazon** = strongest free not-on-Amazon prior. Rich = demand exists, could be official or resellers. Orders the verify queue; never the verdict.
3. **Rendered Amazon search** (Playwright, 1 tab, 4-9 s between pages) — reads the real answer:
   - a store link whose visible text carries the brand, or a product byline `Visit the <Brand> Store` → **brand store (official)** → exclude
   - first brand-matching ASIN sold by the brand or `Amazon.com` → **official listings** → exclude
   - brand in Amazon's catalog but every seller is a third party → **unauthorized resellers only** → LEAD (best angle)
   - no brand refinement, no brand-matching titles → **none** → LEAD
   - throttle page (HTTP 503 "Sorry! Something went wrong") → back off ×3, `RETRY=1` next run

Sponsored-brand store links on the results page can belong to a *competitor* bidding on the brand's name — only the link text or the product-page byline counts. Names ≤ 4 chars / dictionary words are flagged `Ambiguous name` for the manual pass.

**Paid shortcut** (when you'd rather not babysit a browser for 500+ brands): one Google SERP-API query per brand, `site:amazon.com "Visit the <Brand> Store"` (~$0.002/query → ~$10 per 5,000). Same logic, no throttling. Keep the render for the finalists.

## Run

```bash
export DIR=/path/to/workdir RUN=shopify_us
FROM=1 TO=200000 CONC=800 node seed-tranco-dns.mjs top-1m.csv   # or: run httparchive.sql in BigQuery, export CSV
node prep-input.mjs {RUN}_seed.csv
node pipeline.mjs                    # gates 1-7  (RETRY=1 re-fetches unreachable/blocked)
node amazon-autocomplete.mjs         # layer 2
node prep-classify.mjs               # gate 8 batches -> Haiku subagents (prompt in SKILL.md)
node merge.mjs classify
LIMIT=300 node amazon-verify.mjs     # layer 3, on the keeps, not-on-Amazon priors first
node merge.mjs final                 # {RUN}_LEADS.csv + _full + _excluded_amazon + _needs_check
```

## The pitch paragraph ("how would you screen 5,000+ Shopify brands")

> I don't Google brands. I start from a technographic census (HTTP Archive's crawl on BigQuery, or Tranco × DNS — every domain on Shopify's IP range) that already carries a popularity rank, so the traffic floor is applied before I touch a single site. Each store then answers the hard questions itself, for free: `/meta.json` gives its registered country and catalog size, `/products.json` says whether products physically ship, when the catalog was last touched, and whether the images come from AliExpress or Printful. That takes 5,000 stores to a few hundred real US physical-product brands in under an hour with no paid tools. For Amazon presence I use Amazon's own autocomplete API (no bot wall) to measure whether shoppers search the brand on Amazon, then a rendered Amazon search per surviving brand reads the store link, the byline and the "Sold by" field — which separates official presence from unauthorized resellers, a distinction a Google search won't give you. Contacts come from the store's contact/wholesale pages and an Apollo pull on the final domains; the top 50-100 get a manual look at the Amazon evidence before delivery.

## Gotchas

- `Shopify.country` on the homepage is the **visitor's** market, not the store's — use `/meta.json`.
- Headless storefronts (Gymshark, Bombas) fail `/meta.json`; Cloudflare/Vercel walls block the plain fetch → `blocked`, recover with a render pass or accept the loss (Bombas, Ridge, Caraway on the first run).
- Never hard-drop on "Printful present": G Fuel's merch line is 5% of its catalog. Score by **catalog share**.
- `requires_shipping` on the **first** product lies (Allbirds' first SKU is a return-protection add-on); use the share.
- Amazon throttles a datacenter IP after ~5 renders; residential is fine. Back-off is built in; don't raise concurrency.
- Sponsored store links ≠ the brand's store. Byline or nothing.
- No free per-site visit count exists; the deliverable says **rank band** honestly (top-100k ≈ 50k+/mo likely) and carries product count / median price / stack as sales proxies.

## Worked example — first run (2026-09-22, sandbox, Tranco top-120k seed)

_Filled in below from the live run._
