---
source: remediational.com (Water Damage / Mold / Fire Restoration directory, 506 US metros)
vertical: US property-restoration contractors (water, mold, fire/smoke, sewage, biohazard, asbestos, lead, storm, odor, contents, hoarding) — home-services SMB ICP
verdict: validated
last_validated: 2026-10-11
access: static data file (Tier 0, `/data/places.json`) + server-rendered listing pages (Tier 1, JSON-LD LocalBusiness)
dispatch: web-scrape-triage
cost_tier: free
---

# remediational.com × US restoration contractors

**Coverage:** 29,837 businesses across 506 metros, 3,437 cities, 51 states (incl. DC). The directory is itself built from Google Business Profiles (every listing carries a `google.com/maps?cid=` link), so treat it as a pre-tagged Maps extract for the restoration vertical, not an independent universe. Mix is wide: SERVPRO/ServiceMaster/Paul Davis franchises, independent restorers, mold/asbestos testers, home inspectors, public adjusters, roofers. Filter on `services` tags and review counts before use.
**Fields:** name ✓ · metro/city/state/zip ✓ · lat/lng ✓ · services (12-tag bitmask) ✓ · Google rating ✓ · review count ✓ · 24/7 flag ✓ · street address ✓ (listing page) · phone ✓ (listing page) · website ✓ (listing page, `sameAs`) · Google Maps CID ✓ (listing page) · % five-star ✓ · self-description ✓ (listing page, "In Their Own Words") · email ✗ · owner name ✗ (go through `google-maps-scrape` STEP 6 / `email-waterfall`).
**Fill rates (full run 2026-10-11):** all 29,837 listing pages fetched (100% HTTP 200, 1,650 s at concurrency 6): phone 29,588 (99.2%) · website 25,111 (84.2%; 23,135 own-domain, 1,976 franchise/aggregator domains) · street address ~100% · Google Maps CID 29,831 (99.98%) · profile description ~85% · 17,694 unique website domains (1,460 shared by 2+ rows, i.e. franchise brand sites and multi-location operators). Review bands: 0 reviews 4,195 · 1–4 5,323 · 5–19 6,628 · 20–49 4,963 · 50–99 3,466 · 100+ 5,262. No depth effect: the directory is flat, every row is one listing page.
**Restrictions:** Static Netlify site, no anti-bot, no rate-limit headers seen at 6 concurrent (~18 pages/s). `robots.txt` is `Allow: /`. Freshness unknown; ratings/reviews are a snapshot. No email anywhere on the site.
**Method:**
1. `GET https://remediational.com/data/places.json` (4.1 MB) → `{tags:[12], names:[12], rows:[[name, path, city, state, lat, lng, tag_bitmask, rating, reviews, is_24_7, zip], …]}`. Bit *i* of `tag_bitmask` = `tags[i]`. This alone is the whole universe with geography + services + reviews — one call.
2. For phone / website / street / CID: fetch `https://remediational.com{path}` per row and parse the `<script type="application/ld+json">` block with `"@type":"LocalBusiness"` (`telephone`, `sameAs[0]` = website, `address.*`). CID is in the `google.com/maps?cid=` href. `(\d+)% five star` in body text.
3. `sitemap_index.xml` → `sitemap-listings*.xml` enumerates the same 29,837 paths if `places.json` ever moves. City pages (`/<metro>/<city>/`) also carry phone + tags + rating per card (`li.rmd-row`) if only phone is needed (13k pages instead of 30k).
**Cost actuals:** $0. Tier 0 file: 1 call. Listing enrichment: 29,837 fetches × ~21 KB at concurrency 6 ≈ 27 min.
**Gotchas:** `sitemap.xml` 404s — the index is `sitemap_index.xml`. Franchise websites (`servpro.com/locations/...`, `pauldavis.com/...`) are brand domains, not the operator's — tag them `franchise/aggregator` and resolve the operator separately or send via phone. Many `testing`-only rows are home inspectors, not restorers. Don't domain-guess the 404s I probed by hand — only sitemap/places.json paths are real.
**Runs:** 2026-10-11 — (no client; triage request) — 29,837 rows Tier 0 + full listing enrichment — imported into `clients/atlas-growth/2026-10-11_us-restoration-remediational/` (ICP-restoration-us.md): qualify (name deny + any remediation tag, no floor) 29,837 → 25,005 · collapse 13,842 domain representatives + 6,982 franchise/multi-location siblings + 4,181 no-website · site text + residential classify + owner-finding in progress.
