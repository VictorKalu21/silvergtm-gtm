# Test report — Atlas Growth, US residential foundation repair (national, no review floor)

Run: `clients/atlas-growth/2026-11-15_us-foundation-repair-national/` · test date 2026-11-15 · aggregates only
(lead rows are gitignored under `test/`).

## Design
- 12 metros × the 10 queries = 120 runsheet rows (`atlas-growth-foundation-us-test-runsheet.csv`), 6 shards.
- Strata: basement belt (Columbus, Pittsburgh, Detroit, Buffalo, Minneapolis), Southeast (Tampa, Charlotte,
  Nashville), West (Phoenix, Sacramento, Seattle), control (Dallas, inside the 2026-09-11 footprint).
- Config `atlas-growth-foundation-us-config.json` = the 2026-09-11 rules minus the review floor; generic-contractor
  recovery `recover-generic-foundation-us-config.json`; fit read `classify-prompt.md` (Haiku per 90-lead batch).

## Funnel
| step | count |
|---|---|
| Maps calls (coverage COMPLETE, 0 unhealed) | 284 (2.37 per row) + ~15 lost on the killed single-process attempt |
| raw rows → unique `place_id` | 7,792 → 5,946 |
| category qualify (main) | 970 (drops: not_in_icp 4,151 · off_icp_type 818 · name_deny 7) |
| generic-contractor recovery (type + foundation name) | +515 |
| geo gate `--keep-domestic` | 1,485 → 1,468 (17 non-US) |
| collapse | 1,070 website domains · 186 no-website (169 none, 17 shared host) · 212 branch rows fanned |
| site text | 951 / 1,070 ok (89%); fails: 57 TypeError, 40 × 403, 14 × 404 |
| **fit read: `residential_foundation`** | **673 domains (63%) → 830 rows incl. branches** |
| other verdicts | unconfirmed 123 · restoration/other 115 · unclear 51 · not contractor 44 · flatwork 28 · commercial-only 27 · new-construction 9 |

## By review band (website rows incl. branches)
| reviews | rows | fit yes | rate |
|---|---|---|---|
| 30+ | 584 | 408 | 70% |
| 5–29 | 415 | 259 | 62% |
| 1–4 | 182 | 112 | 62% |
| 0 | 101 | 51 | 50% |

No floor ≈ **doubles** the ICP (830 vs 408 at the old floor of 30). Recovery path and main path both pass 65%.

## By metro (all rows incl. no-website; nearest test hub within 1°)
Dallas 219 yes · Charlotte 57 · Minneapolis 49 · Columbus 48 · Detroit 46 · Seattle 41 · Nashville 38 ·
Pittsburgh 28 · Tampa 27 · Buffalo 18 · Phoenix 12 · Sacramento 5 · spill (NYC/NJ/VA/DC etc.) 242.
Dallas is ~5× any non-clay-belt metro; the West is thin.

## Eyeball (random 25)
- Random fit-yes: 10/10 real residential foundation / waterproofing / leveling firms.
- **Risk — lead-gen "rank-and-rent" listings in the < 5-review band**: generic geo names, 0–1 reviews, SEO
  template copy (e.g. "foundation crack repair <town> homeowners trust"). The fit read cannot tell a lead-gen site
  from a contractor because the copy is identical. Not yet sized; candidates for a cheap check (shared phone /
  template footprint across domains) before owner-finding spend.
- Unconfirmed = thin sites with foundation names; restoration/other correctly catches HVAC, brownstone masonry,
  crawl-space insulation-only.

## Per-query yield
Not measurable: records do not carry the query that found them (IMPROVEMENTS 2026-11-15). Raw rows per query:
foundation contractor 2,794 · foundation repair 1,704 · structural repair 1,670 · foundation repair company 1,546 ·
crawl space repair 1,541 · concrete leveling 1,431 · basement waterproofing 1,170 · crawl space encapsulation 889 ·
house leveling 410 · mudjacking 185.

## Full-run projection (low confidence)
- 5,860 rows × 2.37 ≈ **13,900 Maps calls**.
- ICP: **~6,000–9,000 companies** nationwide (no floor), dominated by the clay belt + Northeast/Midwest basement metros.
- Wall time: ~2 min per row per process; a background command is capped at 2 h and `run_log.json` is written only
  at the end, so the run goes in waves of ≤ 50-row shards.
- Fit read cost on the test: ~2.2M Haiku tokens for 1,070 domains → ~20–25M for the national set.
