# Run report: Atlas Growth, US residential foundation repair (national, no review floor)

Run: `clients/atlas-growth/2026-11-15_us-foundation-repair-national/`. Full run 2026-11-15. This file holds
aggregates only; lead rows are gitignored under `full/`. Numbers are rebuilt by `node report-full.js` →
`full/report.json`.

## Funnel
| step | count |
|---|---|
| Runsheet | 586 anchors (50 states + DC) × 10 queries = 5,860 rows, 20 shards |
| Maps calls | **13,269** (projected 13,900). All 20 shards COMPLETE, 8 needed 1 heal pass |
| raw rows → unique `place_id` | 162,970 → **81,687** |
| category qualify (main) | 7,120 (drops: not_in_icp 62,428 · off_icp_type 11,983 · name_deny 156) |
| generic-contractor recovery (type + foundation name) | +4,059 (10 name_deny skipped) → 11,179 |
| geo gate `--keep-domestic` | 11,117 (62 non-US dropped) |
| collapse | **7,240 website domains** · 2,064 no-website rows (1,869 none, 195 shared host) · 1,813 branch rows fanned |
| site text | 6,423 / 7,240 from the site (89%) · 817 SERP snippets only (home fetch failed 717) |
| **fit read: `residential_foundation`** | **4,001 domains (55%) → 5,301 rows incl. branches** · 0 fallback |
| other verdicts | restoration/other 1,114 · unconfirmed 941 · flatwork 299 · unclear 292 · not contractor 281 · commercial-only 206 · new-construction 106 |

Fit read = 81 Haiku batches of 90. Every output is complete; `apply-classify --fallback unclassified` gave 0 fallback rows.

## Lead-gen / rank-and-rent (FLAGGED, never dropped)
| tier | rule | domains (all) | of the 4,001 fit |
|---|---|---|---|
| strong | `flag-leadgen.js`: shared phone across root domains, ≥40% shared 8-word shingles, or homoglyph text | 300 | 215 |
| soft | model `lead_gen` only | 320 | 295 |
| clean | neither | n/a | **3,491** |

- **Clusters:** 116. The largest is 17 Tennessee "<Town> Foundation Repair" sites. Next come 13- and 10-site networks.
- **Homoglyph copy (new signal):** 15 sites. They are Florida "<Town> Crawl Space Repair" and Wisconsin
  "<Town> Basement Waterproofing" networks, written with Cyrillic look-alike letters and given a separate tracking
  phone per town, so neither shared_phone nor shared_text could see them.
- **Soft tier precision:** about 80%. In a 20-row sample, ~16 were rank-and-rent. Some use invented brands that repeat
  city by city ("<Brandname> Foundation Repair" in Oakland, San Antonio and Cincinnati with identical copy). The other
  ~4 looked like real local firms. Known false positives:
  - a real contractor's per-city pages (an "X Foundation Repair of <Town>" family)
  - a dealer network's corporate dealer-finder

## Fit rate by review band (domains read, rows incl. branches)
| reviews | fit / read |
|---|---|
| 30+ | 2,001 / 3,258 (61%) |
| 5–29 | 2,008 / 3,268 (61%) |
| 1–4 | 782 / 1,507 (52%) |
| 0 | 510 / 1,020 (50%) |

With no floor, the fit list is **~2.6×** what the old 30-review floor would have kept (5,301 vs 2,001 rows).

## Fit rate by qualify path (domains)
- main (Google category): 2,521 / 4,839 (52%)
- generic-contractor recovery: 1,480 / 2,401 (62%)

The category path is the leakier one. "Waterproofing service" and bare "Foundation" categories let in roofers, landscapers,
plumbers and charities, which the fit read removes.

## Fit companies by state (company–state pairs; 4,284 for 4,001 domains)
TX 753 · FL 307 · NC 238 · OH 192 · NY 159 · CA 154 · IL 150 · PA 135 · TN 130 · NJ 129 · VA 122 · IN 106 · GA 105 ·
MI 105 · MA 104 · MO 98 · WI 98 · KS 88 · MN 80 · SC 75 · WA 74 · MD 72 · AL 71 · KY 70 · CO 63 · LA 63 · IA 58 · CT 52 ·
AR 51 · OK 48 · UT 39 · OR 30 · DE 25 · NE 23 · NH 21 · MS 20 · AZ 18 · DC 18 · ME 17 · ID 15 · NM 15 · ND 14 · SD 14 ·
RI 13 · WV 13 · MT 11 · WY 11 · AK 4 · HI 4 · NV 4 · VT 3 · unknown 2.

3,960 service-area rows have no street address; they take the state of the nearest runsheet anchor. Metros that
straddle a state line (Kansas City, DC, Philadelphia/NJ, Cincinnati/KY) can be split wrongly. Florida is inflated by
the doorway networks above. The Florida count is 307 including flags; check its clean count before quoting it.

## Brand / dealer networks among the fit
Basement Systems 42 · Ram Jack 11 · Groundworks 4 · Du-West 1 (domains; branch rows are fanned separately).

## Process notes
- **Readers reached for session tools:** 4 of 81 Haiku readers called tools they were told not to use (send_message ×2,
  list_sessions, list_events, a Docs guide). Every call was denied or read-only and nothing was sent. One reader also
  wrote its verdicts through a scratch `.py` (a hand-typed verdict list, not rules); it was deleted because it carried
  business names. Logged to IMPROVEMENTS.
- `classify-prompt.md` had stale paths (`classify/in/`, 60 per batch). Fixed during the run.
