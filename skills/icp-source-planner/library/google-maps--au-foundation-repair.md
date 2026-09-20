---
source: Google Maps via scraper.tech (own scrape, areas mode, country=au) + NSW Fair Trading / WA Building and Energy registers + on-site harvest + LinkedIn-restricted web sweep
vertical: Australian residential foundation repair — underpinning, restumping / reblocking, relevelling, slab lifting, resin injection, house raising (adjacent)
verdict: validated
last_validated: 2026-09-20
access: scraper.tech key (Maps); registries keyless (NSW JSON, WA PDF); Firecrawl key for the residue; no enrichment vendor
dispatch: google-maps-scrape (front door icp-source-planner); au-state-licence-boards--foundation-repair-owners for the names
cost_tier: paid-per-call (3,861 Maps calls + 25 Firecrawl credits for the whole country)
---

# Google Maps × Australian foundation repair (Atlas Growth, 2026-09-20 run)

**The universe is ~3,000 Australian businesses, not 10–15k, and 41% of what Maps returns is American.** 182 tiles
(138 anchors + 44 densify, all eight states) × 10 queries = 1,820 rows, 3,861 calls (2.1 per row, page depth 2 for
85% of rows) → 11,002 shard rows → **5,118 unique place_ids → 3,010 in Australia, 2,107 US pins** ("Basement Repair
Specialists Milwaukee", "The Mudjackers LLC"): Google text-matches *foundation repair* / *concrete leveling* / *house
levelling* globally and pads the AU viewport once local matches run out. The footprint gate (hub 1.0°, all eight
state regions, coordinate-less rows kept, the country-centroid placeholder blanked first) removed every one at $0;
without it the upload is 65% American. Victoria carries 39% of the trade (restumping/reblocking is a Melbourne
word), NSW and QLD ~20% each, WA/SA/TAS the rest.

## Qualify (what the rules did, measured)

Five approved passes over the 3,010 AU rows: main config (types allow + name allow + review ≥ 5) 594 → generic
recovery (type net × ICP name, **no review floor**) +602 → unrated (blank reviews × website) +83 → low-rated 1–4
reviews × website × ICP name +60 → **P1 no-website ICP-named +49 → P2 empty-google_types ICP-named +11** → 1,399
merged → footprint 479 → collapse **364 owner-finding domains + 67 no-website**. Losses accepted: 3 real firms typed
*Home improvement store* / *Home inspector* / *Removalist*; one house-raiser killed by the `removals` deny token; 6
service-area pins 350 km from their names. Waterproofing is the bathroom trade here — NOT an adjacent tier (the UK's
damp/waterproofing volume does not exist). Engine-typed brands matter: Mainmark is typed *Civil engineering company*
and Buildfix *Structural engineer*, so those two types must NOT be in the primary-type deny list.

## Site text → adjudication

364 domains: plain + 20 s retry **335 ok (92%)**; Firecrawl residue 24 attempted / **8 recovered** (the 403 class is
Cloudflare without Turnstile from this egress; TypeError = parked). 21 Opus batches (~2,500 chars, services page
first) over tiers A–C + a seeded 100 of D (D yes-rate 1.2% → dropped) → **329 worked leads: 261 yes · 68 unclear
(tier-A names with no fetchable text are KEPT as unclear, never scored "no" on empty text)**. Buckets: underpinning/
restumping 256 · structural repair 18 · house raising 16 · slab lifting 14 · general builder 11 · groundworks 9.
**Trap:** `localsearch.com.au` / `yellowpages.com.au` are not shared hosts in the engine yet — three firms inherited a
neighbour's listing text, verdict and email until `fix_directory_hosts.py` (IMPROVEMENTS.md).

## Owner names — the registry story

| rung | leads named | note |
|---|---:|---|
| NSW Fair Trading + WA register (injected as the registry block, Haiku read) | 20 | NSW Director = owner outright; 63% of NSW leads named vs 22% VIC (no registry from this egress) |
| own site text (Haiku read, 6 batches) | 17 | a reader over-applied "the business name is the person" — 17 business names dropped job-side |
| business name = person, deterministic (`FIRST_NAMES` + surname) | 7 | Dennis Heale, Glenn Palframan, Scott Myers … the readers had missed them |
| LinkedIn-restricted web sweep, tranche 1 | 29 | **27.5% of 120 unnamed, 1.6 searches/lead**, better than the UK's 21%; session budget of 200 searches ended it after 6 batches (a workflow run does not get its own) |
| email local part (salutation-grade) | 20 | `adam@qldhouserestumping.com.au` → Adam; flagged `name_from_email_only` |
| **total** | **93 of 329 (28.3%)** | 164 unnamed leads still unswept — resume in STATE.md |

Plan an AU named rate around **the state registries**: NSW and WA are scriptable and free; VIC (VBA) and QLD (QBCC)
are the two biggest markets and are walled from a datacentre egress — solve those two (Firecrawl with actions,
another egress, or an operator-run browser session) and the national named rate roughly doubles.

## Emails

On-site harvest only (no Maps email column): 408 addresses over 364 sites, **9% placeholders** (Wix `example@mysite.com`,
CSS font-licence addresses) that the engine's BAD list does not know; AU ISP free-mail (bigpond, optusnet, iinet,
westnet) must count as free or one-man restumpers lose their only address; `.com.au` must be in the sibling-TLD set;
the company's *other* domain (`dennis@dennisheale.com.au` on `dennishealerestumping.com.au`) is recoverable by a
name-token match. Result **217 of 329 leads (66%) with a best address, 180 unique; 29 person-shaped, 126 generic;
53 free-mail**. Unverified (no MV/BB keys on this run).

## Costs, this run

Maps 3,861 calls · Firecrawl 25 credits · 12 Haiku reads/sweeps + 22 Opus adjudication batches · 0 enrichment ·
0 verification. Everything is in the Supabase store (places 5,118, site_text 364, registry 52, contacts 89) — the
next AU run for any trade starts from a query, not a re-buy.
