# shopify-not-on-amazon · improvements backlog

What two live runs (2026-09-22/23, ~3,600 stores, 127 delivered rows) showed still costs hand time or accuracy. Ordered by payoff.

## Accuracy

1. **Retailer detection before Haiku.** The classifier still passed multi-brand retailers (furniture, outdoor, pen, yarn, bridal, candy, costume, K-beauty). Cheap pre-signal from `/products.json`: vendor-diversity ratio (distinct vendors / products) and share of products whose vendor ≠ store name. `> 0.3` distinct-vendor share is almost always a retailer. Add as a gate flag and put it in the classify prompt.
2. **Parent-company country.** `/meta.json` country is the storefront entity, so UK/AU/IT/CA/DE brands with a US entity pass (Gymshark, White Fox, Alpinestars, Vessi, With Jéan, fizik). Signals: `.com.au`/`.co.uk` emails on contact pages, non-US phone formats, "Pty Ltd"/"GmbH"/"Ltd" in policies pages, Shopify `ships_to_countries` order. Add a `foreignParentHints` field in `enrich-contacts.mjs` and a review-prompt line.
3. **Licensed / celebrity / fan merch.** Reviewers catch most; a vendor list containing a licensor (Warner, Nintendo, Pokémon, Marvel, band names) or a store name matching a musician is a cheap pre-flag.
4. **Verifier misses on famous brands.** The single lighter pass cleared BulkSupplements, BrüMate, Berkley, Stride Rite, Taos, Yellow Box, First Alert, Koss, Kids2, Mrs. Meyer's. Root causes fixed (entity decoding, diacritics, category words, bad queries, phone-UA product pages, and on run three the store-byline-is-one-word-shorter rule: Vornado/Hudson/Tifosi/Arkon/Burton/Estes), but keep the rule: **every deliverable row gets the full-strength accumulated pass** (`SEARCH_PASSES=2 BF_VARIANTS=3 MAX_DP=5`), never the lighter one, and **`RESCORE=1` after every matcher change**. Still open: the search term itself. `brandOf` trusts the `<title>`; a hand `{RUN}_query_overrides.json` fixes it per run, the real fix is to build the term from `meta.json name` + the top `/products.json` vendor and to flag any term that is a generic word for review before the verify step.
5. ~~**Third Amazon signal via Google.**~~ **Calibrated and rejected (2026-09-23).** `dataforseo.mjs serp-store` on 60 brands with a confirmed Amazon store: byline form `site:amazon.com "Visit the <Brand> Store"` found 2/60; store-page form `site:amazon.com/stores "<brand>"` found 0/10 (its one hit on the not-on-Amazon set was a squatter store on the word "golo"). Google's index of amazon.com store pages is too thin for a screen. The Amazon fetch stays the verdict; the script is kept only for reference. Cost of the test: ~$0.10.
6. **Generic brand names on Amazon search volume.** "bills", "windsor", "parke" return the common word's volume. `dataforseo.mjs amazon-volume` should query brand + category word for single-word generic names automatically (the run did it by hand).

## Throughput

7. **Run the gates from a residential IP.** Shopify's "Verifying your connection" challenge blocked 83% at CONC=25 and ~25% at CONC=4/DELAY=1s from a datacenter IP; 417 of 3,586 never got through. A render fallback (Playwright) for `blocked` rows would recover the rest at ~5 s/store.
8. **DataForSEO traffic before the gates** (`SOURCE=input`, ~$0.11/1,000 domains) so the gates only fetch stores above the traffic bar.
9. **HTTP Archive instead of Tranco × DNS** for the census: adds Cloudflare/Vercel-fronted stores (Bombas, Ridge, Caraway) and gives a CrUX rank. Query is in `httparchive.sql`; needs BigQuery auth.
10. **Amazon throttling.** Header-set rotation + cooldown works for ~2-3k requests/day per IP; beyond that, spread across days or IPs. Never raise CONC above 3. Next rungs, in order: (a) **curl_cffi TLS-fingerprint impersonation** as a transport option (every Node header set shares one JA3; rotating Chrome/Safari/Firefox fingerprints multiplies the budget, no browser, no proxy); (b) **residential IP** (run the verify step from a home connection overnight); (c) a static residential/ISP proxy for one extra IP. Rendering services (Firecrawl/Spider Cloud) add nothing here: the pages already come back to a plain fetch.

## Deliverable

11. **Decision maker + direct email** still require Apollo. `enrich-contacts.mjs` finds a non-generic address on ~30% of brands and a named person on <5%. Wire an Apollo people-search call (domain + title filter) into `merge.mjs final` once an API key is available, then process 02 (email verification) on the result.
12. **Category mix control.** The buyer capped fashion/jewelry/alcohol/medical at 25%; at 50k+ traffic the not-on-Amazon population is ~45% apparel. `merge.mjs final` enforces the cap, but the honest fix is seeding deeper (rank 300k-1M) where preferred-category brands live.
13. **Sales estimate.** No defensible free number. Product count × median price × DataForSEO visits × an assumed conversion is a guess; leave it out unless the buyer asks, and say so.
14. ~~**Feed hand exclusions back.**~~ Done: `denylist.json` (`{domain: reason}`) is read by `select.mjs`; run three carried 129 entries. Keep ONE copy per client workdir and copy it into every run directory.
