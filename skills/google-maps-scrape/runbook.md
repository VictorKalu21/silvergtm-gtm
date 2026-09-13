# scraper.tech — Google Maps scrape runbook

Reference for the `google-maps-scrape` skill. Confirmed working June 2026.

## Auth + key

- Key lives in `.env` beside this file: `SCRAPER_TECH_KEY=...`. `scrape.js` reads it; never paste the key into a prompt or commit it.
- Header on every call: `scraper-key: <KEY>`.
- Base: `https://api.scraper.tech/`

## Endpoints

| Endpoint | Use | Needed for list-building? |
|---|---|---|
| `searchmaps.php` | search a category over a viewport → array of businesses | **Yes — this is the whole job** |
| `place.php` | full detail for one `business_id` + `place_id` | No (search already returns our fields) |
| `reviews.php` | review text for one `business_id` | Only if doing review-mining later |
| `whatishere.php` | reverse-geocode a lat/lng | No |

### searchmaps.php

```
GET /searchmaps.php?query=<category>&limit=<n>&country=us&lang=en&lat=<lat>&lng=<lng>&offset=0&zoom=<z>
```

Returns `{ status:"ok", data:[ {...business} ] }`. Field map (one call gives everything we need):

| Field | Use |
|---|---|
| `place_id` (`ChIJ…`) | **dedup key** across overlapping categories/tiles |
| `business_id` (`0x…:0x…`) | key for `place.php` / `reviews.php` |
| `name` | — |
| `types[]` | category labels (multi). One practice can be Dentist + Orthodontist → why dedup is mandatory |
| `is_permanently_closed`, `is_temporarily_closed` | **active gate — free; never pay an enrichment tool for this** |
| `latitude`, `longitude` | geo-exclusivity (5-mile rule) map |
| `full_address` | postal code parsed via `geo.footprint.postal_regex` (default generic US-ZIP `\b\d{5}\b`; set `postal_group` for non-US captures like UK area letters) → matched against `geo.footprint.postal_allow` (exact or prefix). → footprint filter + area label |
| `city` | locality; US is "City, ST" (region parsed via `geo.region_from_city`), other countries vary |
| `website` | no website ⇒ DQ |
| `review_count`, `rating` | `{{review_count}}` personalisation + activity proxy |
| `is_claimed`, `verified` | soft quality signal (unclaimed ⇒ likely absentee/defunct) |
| `phone_number`, `working_hours` | personalisation / contact |
| `photos`, `price_level`, `timezone`, `description` | not used |

## The two behaviors that drive the geo strategy

1. **`offset` pagination is BROKEN.** `offset=20` and `offset=100` return `status:"failed"`. You cannot page deeper into one viewport. So each search is a single shot — set `limit` high (we use 150) and take the viewport.
2. **The geo lever is `lat/lng + zoom`, not city strings or offset.**
   - Wide zoom (12) over the whole metro returns only the prominent ~76–100 results and **silently drops the long tail** + bleeds outside the footprint (saw central-Phoenix ZIPs appear).
   - Tighter zoom (14) over a sub-area returns a fuller set for that smaller viewport.
   - **Completeness = tiling tighter zooms over sub-areas, then dedup on `place_id`.**

### Saturation handling (built into scrape.js)

- If one tile returns `>= 90` records, treat it as incomplete → split the viewport into 4 quadrants (`center ± 0.025°`) at `zoom+1` and re-query each. Dedup absorbs the overlap. (`SATURATION=90`, `MAX_DEPTH=1`, `QUAD_OFFSET=0.025`.)
- This replaces the dead `offset` pagination.

### Coverage-gap check

After a run, `run_log.json` lists `footprint_codes_with_no_results` (postal mode). A postal code in the allowlist that produced zero hits across all tiles = a tile-center coverage gap (not "no businesses there"). Fix by adding a run-sheet row centered on that area.

## Downstream pipeline (in scrape.js)

1. **Dedup** on `place_id` (merge `types[]` and ICP tags across the cells that hit it).
2. **Active gate:** drop `is_permanently_closed` / `is_temporarily_closed`.
3. **Footprint gate:** drop leads whose postal code isn't in `geo.footprint.postal_allow` (exact or prefix match); `areas` mode skips this (tiles define the footprint).
4. **Area label:** map postal code → label (`{{neighborhood}}`) via `geo.area_label`.
5. Output: `leads_clean.csv` (the in-footprint, open **universe**), `excluded.csv` (closed / out-of-footprint, with reason), `leads_raw.json` (archive), `run_log.json` (per-cell counts, splits, `footprint_codes_with_no_results`).

scrape.js no longer drops on website / chains / category / size — those are **`qualify_rules`**, applied next by `qualify-leads.js` (SKILL STEP 5b). What scraper.tech does NOT give at all (→ owner-finding STEP 6, the email waterfall STEP 6e): owner/decision-maker name, verified email, employee count, founding date.

## Owner-prompt gate (before anything under `owner/`)

The PreToolUse hook **blocks every read or write under `<run>/owner/`** until a per-vertical `<run>/owner-prompt.md` exists (SKILL STEP 6a). Build it per vertical from `owner-prompt.template.md` — reason the KEEP/EXCLUDE decision-maker roles for THIS trade (an electrician ≠ an owner; a hygienist ≠ a dentist-owner) and run the PER-VERTICAL CHECKLIST. If the hook denies a command with an owner-prompt message, that's the gate — write the prompt, don't bypass it.

## Cost note

One API call per tile. Baseline ICP ≈ (category terms × zones); saturated tiles add up to 4 sub-calls each. A full ICP-1 run lands in the low hundreds of calls.
