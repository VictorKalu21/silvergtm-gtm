# GATE 3 — Atlas Growth **Australia** foundation repair: qualify audit, before any site text

Written 2026-09-20 after the scrape finished. Nothing past the footprint gate has run. Every number
below is from the run's own files (`coverage_summary.json`, `calls_summary.json`, `excluded_*.csv`,
`gate3-stats.js`). **Two proposals (P1, P2) are applied provisionally so their counts are real;
say the word and they come out. Site text does not start until this gate is approved.**

## 1. The scrape

| | |
|---|---|
| runsheet | 1,820 rows (182 tiles × 10 queries), 8 shards, all `COMPLETE`, 0 heal passes, 0 unhealed tiles |
| Maps calls | **3,861** (2.12 calls/row; page depth 1 → 31 rows, 2 → 1,537, 3 → 252) — under the 4,750 central estimate |
| shard rows | 11,002 → **5,118 unique businesses** (5,884 cross-shard duplicates: the ten queries overlap heavily) |
| zero-count tiles | 31 (regional queries with nothing to return); non-ok events 0 |

**The universe is far smaller than the 10,000–15,000 estimated, and 41% of it is American.** Of the
5,118 unique businesses, **3,010 are in Australia by coordinates and 2,107 are United States pins**
(Wisconsin, Michigan, Illinois, Minnesota — "Basement Repair Specialists Milwaukee", "The Mudjackers
LLC"). `country=au` is a hint; Google text-matches "foundation repair", "concrete leveling" and
"house levelling" globally and pads the Australian viewport with American results once the local
matches run out. The probe predicted this (53% US on the Brisbane tile). The footprint gate removed
every one of them at $0. The lesson for the profile: an Australian Maps universe for this trade is
~3,000 businesses, not 20,000 — the UK's 22,193 was damp-proofing volume this market does not have.

## 2. The funnel

| stage | rows | note |
|---|---:|---|
| universe (unique place_id) | 5,118 | 3,010 AU · 2,107 US · 1 no coords |
| main pass `atlas-growth-au-config.json` | 594 | drops: not_in_icp 3,746 · off_icp_primary 357 · too_small 280 · hard_off_icp_type 112 · name_deny 29 |
| + generic recovery (type net × ICP name) | +602 | name_not_icp 2,935 · not_generic_contractor 209 |
| + unrated recovery (blank reviews × website) | +83 | |
| + low-rated recovery (1–4 reviews × website × ICP name) — GATE 1 (a) | +60 | |
| **+ P1 no-website ICP-named (too_small × no website × ICP name)** | **+49** | 24 of them Australian (§3) |
| **+ P2 no-type ICP-named (not_in_icp × empty google_types × ICP name)** | **+11** | 10 Australian (§3) |
| merged qualified (zero overlap asserted) | 1,399 | 484 AU · 914 US · 1 no coords |
| centroid blanking (`blank_centroid.py`) | 15 rows | Google's no-location placeholder; coordinates cleared so the gate keeps them |
| **footprint gate** (hub 1.0°, `--regions` all eight) | **479 kept** | 920 dropped `far_from_hubs`: **914 US pins + 6 Australian** (§4) |
| cross-run dedupe (`build-netnew.js`) | 479 | `ref files used: 0` — first Australian run, expected |
| collapse (`collapse-domains.js`) | **364 owner-finding rows** + **67 no-website track** (62 none + 5 shared host) | 48 rows saved by domain dedupe; 35 multi-location domains |

Kept 479 by state (token in city/address, else the lat/lng box): **VIC 185 · QLD 101 · NSW 96 · WA 22 ·
SA 19 · TAS 7 · ACT 2 · unknown 13** (no token and no coordinates). 187 of the 479 carry no state token
at all (service-area listings) — `state_guess` from the coordinate box is added job-side before the
registry scripts route them.

Reviews among the 479: blank 111 · 1–4 99 · 5+ 269. Websites: 412 own site · 5 shared host · 62 none.
Brand families: Mainmark 6 · Buildfix 4. Top multi-location domains beyond those: resinject.com.au (4),
geotechbuilt.com.au (3), raiseandrelevel.com (3), tacticsreblockingandunderpinning.com.au (3) —
candidates for the brand list at write-back, not now.

## 3. What the rules dropped among Australian rows that look like the trade

Measured over the 3,010 Australian rows: after the five approved passes, the losses with an ICP token
in the name were:

| drop reason | AU rows lost | ICP-named | what they are | proposal |
|---|---:|---:|---|---|
| `too_small` | 57 | **25** | restumpers with **no website** and blank/1–4 reviews: Joe's Reblocking and Underpinning (Coburg), Solid Reblocking and Underpinning (Craigieburn), Tas Underpinning Pty Ltd, Lancaster Restumping Pty Ltd, Total Underpinning Ballarat, Country Side Underpinning (Wodonga), Darren's House Restumping and Levelling | **P1 — applied provisionally.** `recover-noweb-au-config.json`: too_small × no website × ICP name. +49 (24 in footprint; the rest were US pins the gate removed). They join the no-website track, where `prep-website-recovery.js` looks for a site; otherwise phone-only. One engineer rode in ("Structural Reporting Pty Ltd") and three duplicate pins of Lancaster Restumping — the adjudication and the site-text stage handle both. |
| `not_in_icp` | 2,107 | 41 | 9 with an **empty `google_types`** (Reblocking Kings, Always Level Reblocking, Foundation Solutions Birkdale, Quicklift Reblocking); the rest are concreters ("Small Concrete Slabs", "Penrith Concrete Driveways & Slabs") and homonyms ("Foundation Podiatry", "FOUNDATION ELECTRICAL", "Dry July Foundation") — correctly out | **P2 — applied provisionally.** `recover-notype-au-config.json`: not_in_icp × `google_types` empty × ICP name. +11 (10 in footprint, all restumping/raising names). |
| `off_icp_primary` | 285 | 9 | stump manufacturers and suppliers (LevelMaster, S & M Concrete Stumps, ADS Piering — correctly out); **3 real-looking losses**: DIB REBLOCKING (typed *Home improvement store*, 28 reviews, no website), Diamond Foundations (typed *Home inspector*, 42), Philip Butler House Reblockers (typed *Removalist*, 4) | **P3 — accept.** 3 rows; a rule for them would be a name allowlist, which is not a rule. Listed here so they can be hand-added at owner-finding if wanted. |
| `name_deny` | 26 | 6 | engineering practices (correct); "Perth Structural Wall Removals" (not the trade); **Meier House Raising & Removals** (Hemmant QLD, 11 reviews — a real house-raiser caught by the `removals` token) | **P4 — accept**, 1 row lost; `removals` stays denied (it removes 20 removalists). |
| `hard_off_icp_type` | 85 | 4 | charities and a car restorer named "Foundation" — correct | none |

Beyond the name test: 2,066 Australian rows dropped as `not_in_icp` carry no trade token and a
non-trade type (lawn care, HVAC, landscapers, equipment hire, waterproofers) — the queries' noise,
correctly refused.

## 4. The footprint gate

- 914 US pins dropped. The gate is the only thing between this list and a 65% American upload.
- **6 Australian rows dropped as far from every tile**: Townsville House Restumping and Cairns House
  Restumping (both pinned ~350 km inland of their names), Top Level Restumping (western NSW), Ladhams &
  Sons Underpinning (SA outback), JKC Building, Rebuild WA — service-area listings Google pinned in the
  wrong place, none with an address. **P5 — accept the 6**, or hand-add the two named restumpers.
- 15 rows sat on the country centroid and were kept by `blank_centroid.py` (12 before P1/P2, 15 after).

## 5. What this means for the rest of the run

- **Expect ~350–400 worked leads after adjudication**, not the 400–700 in the handoff. The trade is
  small on Maps: Victoria carries 39% of it, NSW and QLD ~20% each.
- **Named-rate arithmetic:** NSW 96 + WA 22 = 118 leads (25%) have a scriptable registry. VIC 185 (39%)
  and QLD 101 (21%) do not, from this network. The named rate will lean on site text + the LinkedIn
  sweep for 60% of the list — plan for the ~45% ceiling the handoff warned about unless Firecrawl
  (143 credits) is spent on the VBA front for the Victorian leads (~185 renders, over budget) or the
  operator supplies another egress for QBCC/VBA.
- **Site text next:** 364 domains to fetch (plain → retry → Firecrawl residue on go). The owner
  prompt read-back (GATE 6) comes with the site-text report.
- **Store:** `places` push (5,118 rows) and the Maps ledger row (3,861) were attempted and refused with
  `PGRST205` — the schema is not applied yet. They re-run the moment it is.

## 6. Decisions

1. **P1 (no-website ICP-named, +24 AU) and P2 (no-type ICP-named, +10 AU): keep them in** — recommended.
2. **P3/P4/P5: accept the 10 named losses** as listed, or say which to hand-add.
3. **Proceed to site text on the 364 domains** (free) and the no-website recovery on the 67.
