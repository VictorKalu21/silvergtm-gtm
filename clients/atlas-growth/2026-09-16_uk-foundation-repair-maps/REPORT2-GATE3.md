# REPORT 2 (calibration) + GATE 3 audit — Atlas Growth UK foundation repair

Run: `clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/` · scrape **COMPLETE** (8/8 shards,
0 unhealed) · everything below is deterministic and $0 — no API call was made in this pass.

Pipeline executed exactly as `PIPELINE.md` STEPS 0–7. Nothing in §7 has been applied: the rule
changes are **PROPOSALS for the operator**.

---

## 1. Coverage and call calibration (PIPELINE STEP 1)

```
merged 49691 shard rows -> 21898 unique place_ids (27793 cross-shard dupes removed)
shards: 0=COMPLETE(6774) 1=COMPLETE(5167) 2=COMPLETE(7101) 3=COMPLETE(5722)
        4=COMPLETE(6818) 5=COMPLETE(5889) 6=COMPLETE(6595) 7=COMPLETE(5625)
runsheet tiles: 1770 | heal passes: 20 | unhealed tiles: 0
calls: 4541 over 2053 events = 2.566 calls/runsheet row | page depth {"1":82,"2":1475,"3":475,"4":21}
zero-count tiles: 82 | non-ok events: 283 {"failed":283}
```

| measure | value | read |
|---|---:|---|
| runsheet rows commissioned | 1,770 | 177 tiles × 10 queries — matches GATE 1 §2 |
| run_log.json files rolled up | 28 | top-level + every `resume-0/` and `heal-N/` |
| total events | 2,053 | 1,770 ok + 283 failed-then-healed (2053 − 283 = 1770 exactly) |
| **total calls (pages)** | **4,541** | |
| **calls per runsheet row** | **2.566** | GATE 1 central projection was ~3,000 calls; actual 4,541. Well above the ~1.5 "pagination under-collected" alarm and below the 2.91 Lagos dense-tile figure. Pagination worked. |
| page-depth histogram | 1:82 · 2:1475 · 3:475 · 4:21 | **No spike at `max_pages` 6** — the page guard was never hit, so no viewport was left unexhausted. The 82 one-page events are the 82 zero-count events. |
| quadrant splits | 0 | as GATE 1 predicted under pagination |
| non-ok statuses | 283, all `failed` | every one re-bought and healed (20 heal passes); `coverage_report.json` = COMPLETE for all 8 |
| zero-count events | 82 | 46 `failed`+0 (healed), **36 `ok`+0** — see §2 |
| rows in → unique | 49,691 → 21,898 | 27,793 cross-shard dupes removed (55.9%) — expected from round-robin sharding |
| rows without place_id | 0 | |
| `excluded.csv` | **not written** | no shard produced one — 0 scrape-stage (closed / out-of-footprint) exclusions. The merge log line was reworded to say so instead of printing "0 rows", which read as if a file existed. |

**Separator rule (IMPROVEMENTS HIGH) — verified.** Parsed column-wise, not by raw grep:
`google_types` rows containing `;` = **0**; `icp_type` rows containing `;` = **0**. The whole file
holds exactly 2 semicolons, both inside quoted free text (a business name
`Drone survey; pitched and flat roofs`, and one address). Tag-count histogram on `google_types`:
1 tag 8,902 · 2 5,614 · 3 1,681 · 4+ 5,678 · **empty 23**. The primary-only `deny` is therefore
reading a real primary type, not the whole string.

---

## 2. Calibration — `empty_but_ok_centers` (PIPELINE STEP 1 / SKILL STEP 5)

The 8 coverage reports list **19 entries (18 unique centres)**; `52.61,1.73` appears in both shard-0
and shard-6. Walking every `run_log.json` instead of the reports gives the fuller picture: **36
`(tile, query)` pairs came back `status:ok` with `count 0`, across 31 distinct tile centres.**

**Every one of the 36 sits at 0.00 km from a commissioned runsheet tile centre.** There is **no
wrong coordinate anywhere in this run.**

But they are not empty markets either. Each zero is a *single query* at a tile that returned
hundreds of records for the other nine:

| cell_id | centre | zero query | national avg for that query | that tile's total across the other 9 queries | verdict |
|---|---|---|---:|---:|---|
| eng-guildford | 51.24,-0.57 | damp proofing | 147.5 | 684 | **suspicious** |
| eng-great-yarmouth | 52.61,1.73 | damp proofing | 147.5 | 611 | **suspicious** |
| sct-stranraer | 54.90,-5.03 | damp proofing | 147.5 | 843 | **suspicious** |
| eng-cheltenham | 51.90,-2.08 | structural repair | 140.5 | 607 | **suspicious** |
| eng-chesterfield | 53.23,-1.42 | structural repair | 140.5 | 670 | **suspicious** |
| eng-huddersfield | 53.65,-1.78 | structural repair | 140.5 | 732 | **suspicious** |
| eng-southport | 53.65,-3.01 | structural repair | 140.5 | 535 | **suspicious** |
| eng-stevenage | 51.90,-0.20 | structural repair | 140.5 | 675 | **suspicious** |
| eng-london-kingston | 51.41,-0.30 | basement waterproofing | 129.2 | 1020 | **suspicious** |
| eng-london-west-ealing | 51.51,-0.30 | basement waterproofing | 129.2 | 896 | **suspicious** |
| eng-plymouth | 50.38,-4.14 | basement waterproofing | 129.2 | 368 | **suspicious** |
| eng-reading | 51.45,-0.98 | basement waterproofing | 129.2 | 576 | **suspicious** |
| eng-tunbridge-wells | 51.13,0.26 | basement waterproofing | 129.2 | 553 | **suspicious** |
| sct-kirkcaldy | 56.11,-3.16 | basement waterproofing | 129.2 | 521 | **suspicious** |
| wls-swansea | 51.62,-3.94 | foundation repair | 119.6 | 563 | **suspicious** |
| eng-liverpool | 53.41,-2.99 | mini piling | 73.7 | 867 | **suspicious** |
| eng-liverpool-south-garston | 53.35,-2.88 | mini piling | 73.7 | 471 | **suspicious** |
| eng-luton | 51.88,-0.42 | mini piling | 73.7 | 1009 | **suspicious** |
| eng-penzance | 50.12,-5.54 | mini piling | 73.7 | 602 | marginal (thin market) |
| eng-stevenage | 51.90,-0.20 | mini piling | 73.7 | 675 | **suspicious** |
| wls-swansea | 51.62,-3.94 | mini piling | 73.7 | 563 | **suspicious** |
| eng-great-yarmouth | 52.61,1.73 | structural waterproofing | 61.1 | 611 | marginal |
| eng-grimsby | 53.57,-0.08 | structural waterproofing | 61.1 | 806 | marginal |
| eng-kettering-corby | 52.39,-0.73 | structural waterproofing | 61.1 | 878 | marginal |
| sct-falkirk | 56.00,-3.78 | structural waterproofing | 61.1 | 657 | marginal |
| eng-grimsby | 53.57,-0.08 | underpinning | 20.4 | 806 | plausibly thin |
| eng-mansfield | 53.15,-1.20 | underpinning | 20.4 | 420 | plausibly thin |
| eng-bham-solihull | 52.41,-1.78 | wall tie replacement | 15.2 | 604 | plausibly thin |
| eng-gloucester | 51.86,-2.24 | wall tie replacement | 15.2 | 640 | plausibly thin |
| eng-london-watford | 51.66,-0.39 | cellar tanking | 14.5 | 1018 | plausibly thin |
| eng-maidstone | 51.27,0.53 | cellar tanking | 14.5 | 717 | plausibly thin |
| eng-barrow-in-furness | 54.11,-3.23 | subsidence repair | 5.4 | 792 | genuinely thin |
| eng-kingston-upon-hull | 53.75,-0.34 | subsidence repair | 5.4 | 763 | genuinely thin |
| eng-london-kingston | 51.41,-0.30 | subsidence repair | 5.4 | 1020 | genuinely thin |
| eng-london-romford | 51.58,0.18 | subsidence repair | 5.4 | 1165 | genuinely thin |
| eng-oxford | 51.75,-1.26 | subsidence repair | 5.4 | 816 | genuinely thin |

**National per-query totals** (ok events only, 177 tiles each):

| query | total raw records | avg/tile | zero tiles |
|---|---:|---:|---:|
| damp proofing | 26,112 | 147.5 | 3 |
| structural repair | 24,862 | 140.5 | 5 |
| basement waterproofing | 22,868 | 129.2 | 6 |
| foundation repair | 21,176 | 119.6 | 1 |
| mini piling | 13,052 | 73.7 | 6 |
| structural waterproofing | 10,806 | 61.1 | 4 |
| underpinning | 3,605 | 20.4 | 2 |
| wall tie replacement | 2,682 | 15.2 | 2 |
| cellar tanking | 2,564 | 14.5 | 2 |
| subsidence repair | 956 | 5.4 | 5 |

**Judgement.** 5 zeros (`subsidence repair`, a query averaging 5.4 records/tile nationally) are
genuinely thin. 6 more (`underpinning`, `wall tie replacement`, `cellar tanking`) are plausible.
**The other ~21 are transient API empties, not market facts** — "damp proofing returns 0 at
Guildford" cannot be true at a tile where `structural repair` returned 288 and `foundation repair`
166, and the same firms must appear under both. `run-scrape.js` heals only `status != ok`, so an
`ok` + count 0 is exactly the silent hole class the wrapper exists to prevent, one layer down at the
`(tile, query)` grain rather than the tile grain. See proposal P10.

### Spot-check — 5 rows from `leads_clean.csv`

| # | name · google_types · city · reviews · website |
|---|---|
| 3 | Ecoden Constructions · `Structural engineer\|Architectural Designer` · London · 23 · ecodenconstructions.co.uk |
| 1777 | AOM Building Contractors Ltd · `General Contractor\|Bricklayer\|Carpenter\|Construction Company` · Southampton · 14 · aombuild.com |
| 5011 | Marylebone Interiors London Ltd · `Architecture firm\|Handyperson` · London · 3 · maryleboneinteriors.co.uk |
| 9042 | Rogers Ready Mix · `Concrete contractor\|Cement supplier\|Ready-Mix Concrete Supplier` · Marion, IA, United States · 19 · rogersconcrete.net |
| 17333 | Ags Building & Civil Engineering Ltd · `Contractor` · Ballymena BT43 · (blank) · (no website) |

Row 9042 is the areas-mode bleed in one line, row 17333 is the blank-review-count population.

### First read of areas-mode bleed (universe, 21,898 rows)

| test | rows |
|---|---:|
| no UK postcode pattern in `full_address` | 8,076 |
| phone not `0…`/`+44…` (incl. 615 blank) | 3,570 |
| **neither a UK postcode nor a UK phone** | **3,126 (14.3%)** |
| explicit foreign last-address token | United States 2,149 · France 89 · Spain 20 · Ireland 13 · Canada 6 · Isle of Man 1 |
| US ZIP pattern `, XX 99999` | 2,149 |
| blank `full_address` (mostly UK service-area pins) | 5,782 |

So ~10% of the universe is hard foreign contamination (2,278 rows with a named foreign country),
plus ~850 address-less rows that are unresolvable at this stage. The footprint gate is doing real
work here, exactly as SKILL STEP 5b-geo predicts for `areas` mode.

---

## 3. The funnel

| stage | in | out | dropped |
|---|---:|---:|---:|
| **Universe** — merged, deduped on `place_id` | 49,691 shard rows | **21,898** | 27,793 cross-shard dupes |
| **Qualify** (5 rules, `atlas-growth-uk-config.json`) | 21,898 | **1,938** (8.9%) | 19,960 |
| **Recovery** (`recover-generic-uk-config.json`, 4 rules, over `excluded_officp.csv`) | 19,960 | **+332** | 19,628 |
| qualified + recovered (place_id overlap 0, asserted) | — | **2,270** | — |
| **Footprint gate** (177 hubs, `--hub-radius-deg 0.75`, no `--regions`) | 2,270 | **1,494** | 776 |
| **Cross-run dedupe** vs the 175-row export deliverable | 1,494 | **1,357 net-new** | 137 |
| **Collapse domains** | 1,357 | **1,166 spend rows** + **115 no-website** | 76 spend rows saved |

Qualify drop reasons: `not_in_icp` 15,865 · `off_icp_primary` 2,495 · `too_small` 1,114 ·
`name_deny` 296 · `hard_off_icp_type` 190.
Recovery drop reasons: `name_not_icp` 11,436 · `not_a_recovery_candidate` 4,095 (= exactly the
19,960 − 15,865 rows dropped for a reason other than `not_in_icp`, so rule 0 fired correctly) ·
`not_generic_contractor` 3,522 · `too_small` 575.

Footprint gate: `far_from_hubs` 775, `wrong_country` 1 (PJ Piling Contracts Ltd, Co. Monaghan,
Ireland). `foreign_countries: {ireland: 1}`.

Dedupe (`ref rows: 175` ✓, the required STOP check passed): 137 dropped = **83 id + 54 host + 0
phone**. Id matches include City Waterproofing LTD, London Waterproofing Solutions Ltd, Cedarcare
Ltd; host matches include Peter Cox (×3), Prokil London – Kensington, Dampco (UK) Ltd. Ref keys
built: 175 ids / 173 hosts (1 shared-host website correctly ignored) / 175 phones.

`build-netnew.js --client` was run once into a scratch path purely to record its line, as PIPELINE
§5 predicts — it is a **no-op** here and must not be used:

```
ref files used: 0 | prior place_ids: 0 | new: 1357
dropped: 0 (place_id) + 0 (website host) | NET-NEW kept: 1357
```

Collapse: `website_class` site 1,242 · shared_host 23 · none 92; root_domains 1,166;
multi_location_domains 16; fanned_siblings 76; **spend_rows_saved 76**.

---

## 4. Footprint-gate residual check

Grepping the KEPT file and `excluded_geo.csv` for the signals PIPELINE §4 names:

| signal | kept | excluded_geo |
|---|---:|---:|
| France | 0 | 14 |
| Belgium | 0 | 0 |
| Ireland | 3 (all false positives, below) | 3 |
| Isle of Man | 0 | 0 |
| Jersey | 0 | 0 |
| Guernsey | 0 | 0 |
| United States | 0 | 567 |
| US ZIP `, [A-Z]{2} \d{5}` | 0 | 567 |

**No kept row is foreign.** The 3 "Ireland" hits in the kept file are all Northern Irish or a
domain false-match: *Platinum Preservation NI Dampproofing Belfast and NorthernIreland.* (Belfast
BT17), *ProDrive Piling | Northern Ireland |* (Omagh BT78, `prodrive-ireland.co.uk`), and a
Buckinghamshire landscaper. The feared Calais residual did not materialise — the 14 France rows all
sit in `excluded_geo.csv` (Bordeaux, Joué-lès-Tours etc., caught by `far_from_hubs`, not by the
country rule).

Independent check on the kept list: **3 of 1,357 rows** have neither a UK postcode nor a UK phone —
*Gary Marshall Developments*, *RD Finishers NW*, *DK Damp Works* — and all three are UK by
lat/lng and `.co.uk` domain, simply with no address and no phone captured. **Residual foreign bleed
after the gate: zero.** 0.75° was the right radius.

---

## 5. GATE 3 — drop-reason audit, read critically

### `not_in_icp` — 15,865 (recovery took back 332; 15,533 remain dropped)

Primary-type histogram of the bucket: Construction Company 6,867 · Contractor 1,098 · Plasterer 770 ·
Roofing Service 732 · Home builder 689 · General Contractor 645 · Concrete contractor 641 ·
**Beauty supply store 470** · Building firm 257 · Surveyor 232 · Bathroom Renovator 209 ·
Property maintenance 187 · Paving contractor 139 · … · Pile driving service 42 · Pest control 56.

**Mostly correct.** This is the deliberate GATE 1 §7.3 call: generic construction is ~83% noise, and
the bucket is dominated by general builders, roofers and (via the fuzzy Maps match) 470 beauty
supply stores. The recovery pass recovers the real ones by NAME and its survivors read cleanly —
*Underpin & Makegood*, *Underpinning London Ltd*, *Basement Structures Limited*, *SX Basement
Construction London*, *P&E Basement Excavation Builders*.

**But real firms are being lost.** 145 rows in this bucket carry an ICP name token AND ≥5 reviews
AND a UK address:

- **`Pile driving service` — 42 rows in the bucket (82 carrying the tag anywhere; 81 UK, 28 with ≥5
  reviews), 39 never recovered.** The allow list has `piling`, but Google's type string is
  *"Pile driving service"*, which does not contain it. Lost: **Piled Solutions Ltd** (Surbiton, 35),
  **G Banks Ltd** (Sheffield, 17), **Secure Piling Solutions Ltd** (Huddersfield, 12),
  **FirmBase Piling Ltd** (Darwen, 11), **Piling Team** (Manchester, 8), **118 Foundations**
  (Rochdale, 6). This is a pure type-stem gap — see P2.
- **`Plasterer` — 39 UK rows with an ICP name token and ≥5 reviews.** UK damp-proofing is very often
  primaried Plasterer. Lost: **Cheshire Plastering & Damp proofing Contractors** (Crewe, 71),
  **M.L Plastering & Damp Proofing Nottingham** (88), **L.R.Roper Plasterer & Damp Proofing** (44),
  **Dampguard & Plastering** (Telford, 25), **Wheatley Plastering and Damp Solutions LTD**
  (Sheerness, 25). See P5.
- **`Surveyor` — 48 UK rows with an ICP name token.** **Damp Surveys Ltd** (London, 133),
  **Independent Damp & Mould Surveys** (London, 36), **Dampworks** (Orpington, 34),
  **Kenwood Damp London** (Watford, 18 — a *named brand family*), **Damp & Timberguard** (9). GATE 1
  §4 deliberately left bare `surveyor` out of the deny and expected these to die at the allow. That
  is what happened, so this is **working as designed** — but it is an operator call, not a bug (P6).
- **78 brand-family-named rows sit in this bucket**: **Protectahome Ltd** ×6 (typed
  `Contractor|Surveyor`), **Prokil Chingford**, **Prokil Exeter** (`Property maintenance`),
  **Timberwise UK Ltd** (Cheltenham, `Property maintenance`), **Kenwood Damp London**. The recovery
  config's type allow *does* include `contractor` and `property maintenance`, but its NAME gate has
  no brand tokens, so "Protectahome" fails it. See P8.

### `off_icp_primary` — 2,495

Primary histogram: Structural engineer 1,152 · **Water damage restoration service 516** · Plumber
184 · Engineering consultant 134 · Building materials supplier 118 · Civil Engineering 107 ·
Civil engineering company 49 · Drainage service 49 · Building inspector 44 · Manufacturer 28 ·
Architect 21.

- **Engineers/surveyors/merchants/plumbers: correct.** 1,389 UK engineer-primaried rows dropped —
  that is GATE 1 §4 rule 2's stated call (referral sources, not buyers).
- **Drainage-primaried: correct, and the samples confirm the dryrun row-22 judgement.** The 41 UK
  drainage-primary drops are *Limehouse Drains*, *Spot On Drain Cleaning Services* (Hull, 335),
  *Northwest Drainage 24/7 Ltd* (Bolton, 430), *Birmingham Drain Services Ltd* (133),
  *Clubb Cannon Drainage Ltd*, *Drainsmart Ltd*. No damp/underpinning firm is in there.
- **`water damage restoration service` is the biggest real-ICP loss in the run.** 516 rows, 435 UK,
  339 UK with an ICP name token, **162 of those with ≥5 reviews.** This is the *exact* mistake GATE 1
  §7.4 caught for `pest control service`, made one row lower down the same list. The UK trade
  self-labels this way. Lost by name:
  **Richardson & Starling** — 5 branches (Glasgow 192, Livingston 59, Carlisle 53, Dundee 42,
  Aberdeen 41) — **a named brand family**; **Rentokil Property Care** (Reading, Chester) — also a
  named brand family; **Prestige Damp Proofing Solutions** (Watford, 60); **Prestige Preservation
  Ltd** (Kidderminster, 50); **Pass & Co preservation services** (Birmingham, 48); **Protective
  Preservations Damp Proofing Specialists** (Croydon, 44); **Advanced Damp Ltd** (Birmingham, 14);
  **Kings Preservation Building Services** (9); **M K Selbie Damp Proofing** (7);
  **DampMaster** South East London and Leeds/Wakefield. See P1.

### `too_small` — 1,114 (floor 5)

Distribution: **blank review_count 417** · 1 → 235 · 2 → 182 · 3 → 150 · 4 → 130.

**The 1–4 band is a correct ghost-listing filter** — the samples are duplicate/inactive pins
(*Pioneer drives and patios* 2, *R J Stone Specialist* 2, *B&M Masonry and Repair* 4). The floor of
5 is doing exactly what GATE 1 §6 said it would.

**The blank band is a different population and is being lost by accident.** A blank `review_count`
fails `>= 5` identically to a zero, so every unrated listing that reached rule 5 died. **107 of them
are UK, ICP-named and have a live website**: *Specialist Structural Waterproofing Ltd*
(Southend-on-Sea), *Octopus Waterproofing Ltd* (London), *London Damp Proofing & Timber Treatment*,
*Structural Waterproofing Services* (Wembley), *GO5 LTD – Waterproofing, Damp & Timber Consultants*,
*National Waterproofing Group* (Coventry), *Damp Proofing Staffordshire*, *Gunite Waterproofing*,
*Rhino Damp Proofing*. These read as real firms with a new or unreviewed listing, not ghosts. See P7.

### `name_deny` — 296: **clean, no action**

Terms that fired: wickes 98 · screwfix 49 · accident repair 32 · chartered surveyor 31 · plant hire
16 · toolstation 12 · bodyshop/body shop 12 · plumbing & heating 10 · ready mix 5 · … Only 7 rows
also carry an ICP allow type, and every one of those is still a correct drop on inspection
(*Huws Gray Gaerwen* typed `Foundation` is a builders merchant; *Christy Plumbing & Heating*;
*Bowden Consulting Engineers*; *Drainage Welling Blocked Drains*). The multi-word discipline from the
sharp-shannon lesson held — no substring ate a real firm.

### `hard_off_icp_type` — 190: **one term is misfiring**

Terms that fired: **property management company 84** · charity 44 · estate agent 16 · car dealer 9 ·
tyre shop 8 · truck repair 6 · recruiter 5 · hospital 4 · real estate agency 3 · university 3 ·
insurance agency 3 · letting agency 3 · law firm 2 · church 2 · car wash 2 · dental clinic, funeral
home, cemetery 1 each.

Everything except `property management company` is correct and is the rule doing its job
(*Bristol NHS Foundation Trust*, *The National Brain Appeal*, *Bangor repair centre nw ltd*).

**`property management company` fails the scope:"any" test that GATE 1 §4 set for this rule**
("terms that can NEVER appear on a real foundation/damp contractor"). Of its 84 hits, only **18 are
primary**; **66 are a secondary tag**, and **19 of those carry an ICP allow type**. This is the
sharp-shannon `atm`/bank-branch bug in this run. Real firms lost: **Heightvale Ltd** (Bolton, 67
reviews, primaried `Building restoration service`), **Henderson Wood** (London, 72, carries
`Building restoration service`), **W & W Building And Planned Maintenance Ltd** (Stalybridge, 36),
**Mould & Damp Inspections and Repair specialists** (8), **Set In Stone Traditional Build – North
Devon**, **Master Builder Services** (Gosport, 56). See P3.

### Is junk surviving? — 20 kept rows sampled evenly

| # | name · primary type · types · reviews · city · domain |
|---|---|
| 0 | L&V Underpinning Services · Construction Company · `…\|Civil engineering company\|Excavating contractor` · 12 · London · lvunderpinning.co.uk |
| 67 | Damp services Clapham · Waterproofing service · `…\|Roofing Service` · 8 · London · trustatrader.com |
| 134 | Preservation Treatments Ltd · Waterproofing service · `…\|Construction Company` · 17 · Camberley · preservationtreatments.co.uk |
| 201 | DW Damp proofing & preservations · Building restoration service · 14 · dwdampproofing.co.uk |
| 268 | JDP CONSTRUCTION LTD · Construction Company · `…\|Building restoration service\|Concrete` · 15 · Hornchurch |
| 335 | Bensleys · Waterproofing service · `…\|Contractor\|General Contractor\|Plasterer` · 29 · Brighton |
| 402 | JMCD Developments Ltd · Construction Company · `…\|Building restoration service` · 16 · Halifax |
| 469 | Commercial plastering ne Ltd · Plasterer · `…\|Waterproofing…` · 21 · Hartlepool · (no site) |
| 536 | Damp Stop · Surveyor · `…\|Building restoration service\|Contractor` · 9 · Haverfordwest |
| 603 | HQ Solutions Group · Building firm · `…\|Building restoration service` · 14 · Wilmslow |
| 670 | Southpoint · Building restoration service · 22 · Worthing · (no site) |
| 737 | RJ Coatings & General Maintenance · Building restoration service · 18 · Bristol |
| 804 | White Rose Repointing Ltd · Property maintenance · `…\|Blast cleaning\|Graffiti removal` · 27 · Wakefield · replit.app |
| 871 | George Hardie & Son (Joiners) Ltd · Repair service · `…\|Building restoration service\|Joiner` · 17 · Edinburgh |
| 938 | Fallen Oak Frames · Wood frame supplier · `…\|Building restoration service\|Carpenter` · 6 · Hook |
| 1005 | Tomyc Constructions · Construction Company · `…\|Bathroom Renovator\|Building restoration` · 13 |
| 1072 | Astley Bridge Building Services ltd · Construction Company · `…\|Building restoration service` · 85 · Bolton |
| 1139 | Dixon Piling · Contractor · `Contractor` · 17 · Colchester · dixonpiling.co.uk |
| 1206 | Aqua-Dri Damp & Condensation · Property maintenance · 117 · Norwich · aqua-dri.co.uk |
| 1273 | Master Damp – Plasterers/Damp Proofing Darlington · Plasterer · 6 · Darlington · masterdamp.co.uk |

**No hard junk survives.** Zero kept rows carry a charity / college / church / bodyshop / hospital /
estate-agency / pharmacy / beauty-supply tag. Review floor held (min 5, median 16). Drainage-primary
in the kept list: **0**, as designed.

Two soft-junk populations are visible and worth naming:

1. **`building restoration service` is the single weakest allow token.** It is the sole ICP signal on
   474 of the 1,357 kept rows, and it is the tag Google gives half of Britain's general builders
   (*Claystone Builders Ltd*, *Hastings Builders Company Ltd*, *D.G.M Building and Carpentry Ltd*,
   *Woburn Building Services Ltd*). These are not wrong to keep — GATE 1 deliberately shipped a
   volume-safe Maps stage and put the real ICP gate in the downstream site-text adjudication — but
   the adjudication load is concentrated here, and roughly a third of the list will fail it.
2. **40 kept rows whose ONLY allow match is `drainage`** are general property-maintenance and
   handyman firms riding in on a secondary drainage tag: *Garcinstal Multiservices LTD*,
   *Virtue – PPM LTD* (87), *STOKE FIX Building And Property Maintenance Services*,
   *We Fix We Build Kent Ltd*, *Pro Property ltd* (295). See P4.

### The pest-control carve-out: it never fired

GATE 1 §7.4's segment-killer decision (do **not** deny `pest control service` on primary) cost
nothing and protected nothing in this run. **Zero of the 56 pest-primaried rows in the universe
carry an ICP allow type**, so all 56 died at the allow exactly as the dryrun predicted, and **0
pest-primaried rows reached the kept list** (21 kept rows carry a pest tag as a secondary). The
Rentokil Property Care branches this rule was written to protect turned up primaried
**Water damage restoration service**, not Pest control service — so the deny that actually deletes
that segment is the one in §5/P1, not the one GATE 1 removed. The carve-out is still correct; it was
just aimed one line too high.

---

## 6. Final list: nations, brands, domains

### Per-nation (postcode area parsed from `full_address`; no nation column exists)

| nation | rows | share | tiles commissioned | tile share |
|---|---:|---:|---:|---:|
| ENG | 949 | 69.9% | 130 | 73.4% |
| **UNKNOWN (no postcode in address)** | **283** | **20.9%** | — | — |
| SCT | 65 | 4.8% | 25 | 14.1% |
| WLS | 42 | 3.1% | 13 | 7.3% |
| NIR | 18 | 1.3% | 9 | 5.1% |

Top 20 postcode areas: S 31 · BS 31 · SW 30 · B 25 · NE 24 · SE 23 · E 22 · M 22 · BN 22 · EH 22 ·
CF 20 · BT 18 · RG 17 · TN 16 · LS 16 · W 15 · CR 15 · G 15 · KT 15 · N 14.
Cross-border areas (CA, CH, HR, LL, NP, SY, TD) assigned by majority — counts are ±a few rows.

**Read.** The 283 UNKNOWN are **282 rows with a blank `full_address`** (service-area pins), not a
geography problem — they carry UK phone numbers and UK lat/lng (*Piling Contractor London*,
*North West Piling Ltd*, *Shield Waterproofing and Preservation Limited*). Excluding them, the
with-postcode split is ENG 88.4% / SCT 6.1% / WLS 3.9% / NIR 1.7% against UK population shares of
roughly 84 / 8 / 5 / 3. **SCT, WLS and NIR all sit below both their tile share and their population
share.** PIPELINE §7 says to check coverage before blaming the rules — and coverage is clean here
(all 8 shards COMPLETE, 0 unhealed, and the 3 non-England zero-count tiles are Stranraer, Falkirk
and Kirkcaldy on single queries). So this reads as genuine market thinness plus the 0.75° radius
correctly excluding the islands, **not** a coverage hole. **NIR at 18 rows is nonetheless the
thinnest result in the run and is worth an explicit operator look** before the client is told what
Northern Ireland is worth.

### `brand_family` — a flag, never a drop

| brand | rows |
|---|---:|
| Timberwise | 30 |
| Rentokil Property Care | 23 |
| Preservation Treatments | 1 |
| **branded total** | **54 / 1,357 (4.0%)** — independents 1,303 |

14 of the 17 configured brand families produced **zero** labelled rows in the final list. That is
mostly because their rows were dropped upstream, not because they are absent: Richardson & Starling
(5 branches), Rentokil Property Care (2 more), DampMaster (2) sit in `off_icp_primary`, and
Protectahome (6), Prokil (2), Timberwise UK Ltd (1), Kenwood Damp London (1) sit in `not_in_icp` —
**78 + 31 = 109 brand-named rows are in the drop files.** P1 and P8 recover most of them. The
lengthened terms behaved: no independent was mislabelled.

### Top 15 root domains by `location_count`

| locations | root domain | brand_family |
|---:|---|---|
| 30 | timberwise.co.uk | Timberwise |
| 23 | rentokil.co.uk | Rentokil Property Care |
| 9 | facebook.com | *(shared host → no-website track, correct)* |
| 6 | dampproofingsolutions.co.uk | **— unlabeled —** |
| 4 | advanceddamp.co.uk | **— unlabeled —** |
| 4 | sitelift.site | **— unlabeled, and NOT one company —** |
| 4 | allcottassociates.co.uk | **— unlabeled —** |
| 3 | checkatrade.com | *(shared host, correct)* |
| 3 | wixsite.com | *(shared host, correct)* |
| 3 | basementsumpandpump.co.uk | **— unlabeled —** |
| 2 | newtonwaterproofing.co.uk | **— unlabeled —** |
| 2 | crownstonegroup.co.uk | — |
| 2 | watertight-homes.co.uk | **— unlabeled —** |
| 2 | propertyanddamp.co.uk | — |
| 2 | qesexteriorsltd.co.uk | — |

21 multi-location domains; 1,166 distinct root domains; 92 rows sit on a multi-location domain.

**Unlabeled multi-location domains that look like a chain we are missing** (operator call, these are
flags not drops):

- **`dampproofingsolutions.co.uk` — 6 branches**: Damp Proofing Solutions Dudley / Wolverhampton /
  Birmingham & Coventry / … A regional multi-branch damp operator, the largest unlabeled group.
- **`advanceddamp.co.uk` — 4 branches**: Advanced Damp Ltd London / Tring / High Wycombe /
  Canterbury. Note their Birmingham branch is *also* sitting in the `off_icp_primary` drop file.
- **`allcottassociates.co.uk` — 4 branches**: Allcott Associates LLP Sheffield / Birmingham /
  Reading / Oxford. This reads as a multi-office **chartered building surveying practice**, i.e. the
  referral-source category GATE 1 rule 2 deliberately drops — it survived because Google did not
  primary it `Chartered surveyor`. Worth an explicit keep/drop decision, not a brand label.
- **`basementsumpandpump.co.uk` — 3**, **`newtonwaterproofing.co.uk` — 2** (Tonbridge + Leeds; a
  waterproofing *system house*, closer to Safeguard/Permagard than to a contractor —
  `brand_families` already drops Helifix and Permagard for exactly this reason),
  **`watertight-homes.co.uk` — 2** (Wakefield + Leeds), **`damp-stop.co.uk` — 2** (Durham +
  Northallerton), **`oldburys.com` — 2** (Exeter + Exmouth), **`fortifyconstruction.co.uk` — 2**.
- **`sitelift.site` — 4 rows that are FOUR DIFFERENT COMPANIES**: Sundridge Homes and Gardens
  (Bromley), No Fuss Plastering, Rhodes to Improvement, Fixzen Services. This is a website-builder
  platform, not a chain — see P9, it is a real defect, not a labelling gap.

---

## 7. Proposed rule changes — **PROPOSALS ONLY, NOTHING APPLIED**

Ordered by size of effect. Every number below was measured against this run's actual drop files.

| # | change | where | expected effect |
|---|---|---|---|
| **P1** | **Remove `water damage restoration service` from the `off_icp_primary` deny (rule 2).** Same reasoning GATE 1 §7.4 used to remove `pest control service`: the UK trade self-labels this way, and a pure flood-restoration firm falls out at the rule-4 allow instead. | `atlas-growth-uk-config.json` rule 2 | **+124 rows** survive rules 1/3/4/5 (91 UK, 52 with an ICP name token). Recovers **5 Richardson & Starling branches**, **Rentokil Property Care** ×2, Prestige Preservation, Pass & Co, Protective Preservations, Advanced Damp Ltd, DampMaster ×2. **Precision cost: 39 UK rows** without an ICP name token, mostly plausible (*Barrier Property Care*, *LABS Building Services*, *Darryl C Price*); the clear misses are *Rainbow Restoration* and a listing literally called *"Water Damage"*. Strongly net-positive. |
| **P2** | **Add `pile driving` to the rule-4 allow list.** Pure type-stem gap: the allow has `piling`, Google writes `Pile driving service`. | rule 4 `not_in_icp` allow | **+28 UK rows** at ≥5 reviews (81 UK rows carry the tag). *Piled Solutions*, *Secure Piling Solutions*, *FirmBase Piling*, *G Banks*, *118 Foundations*, *Piling Team*. Precision cost ≈ 0 — the type is unambiguous ICP. |
| **P3** | **Move `property management company` out of rule 1 (`scope:"any"`) into rule 2 (primary-only).** It fails GATE 1's own scope:any test. | rules 1 + 2 | 84 hits → 18 stay dropped on primary; 66 go on to the later rules, **19 of which carry an ICP allow type**. Recovers *Heightvale Ltd* (67), *Henderson Wood* (72), *W & W Building And Planned Maintenance* (36), *Master Builder Services* (56). Also shrinks `hard_off_icp_type` from 190 to ~124, which makes that bucket honest again. |
| **P4** | **Remove `drainage` from the rule-4 allow list.** | rule 4 | **−40 kept rows** (precision win). Every one is a property-maintenance/handyman generalist whose only ICP signal is a secondary `Drainage service` tag. No strong-ICP firm loses its ticket: only 5 further rows pair drainage with `building restoration`, and every damp/underpinning firm in the kept list carries damp/waterproofing/structural/masonry as well. |
| **P5** | **Add `plasterer` to the RECOVERY config's `not_generic_contractor` type allow.** The recovery's ICP-name gate supplies the precision. | `recover-generic-uk-config.json` | **+39 UK rows** with an ICP name token and ≥5 reviews: *Cheshire Plastering & Damp proofing Contractors* (71), *M.L Plastering & Damp Proofing Nottingham* (88), *L.R.Roper Plasterer & Damp Proofing* (44), *Dampguard & Plastering* (25). |
| **P6** | **Decide explicitly on damp-survey practices.** 48 UK rows named *Damp …Surveys/Surveyors* are dropped at the allow, which is what GATE 1 §4 intended — but the bucket includes *Damp Surveys Ltd* (133 reviews) and *Kenwood Damp London* (a named brand). Adding `surveyor` to the recovery type allow would take them back. | operator call | +48 UK rows if taken. Recommendation: **leave as-is** unless Atlas Growth wants inspection/referral firms; the current behaviour is deliberate, not a bug. |
| **P7** | **Stop treating a BLANK `review_count` as 0 in rule 5.** Either change rule 5 to `review_count >= 5 OR (review_count is blank AND website exists)`, or route blanks to a separate unrated track. | rule 5 (engine may need an `or` — see note) | **+107 rows**: UK, ICP-named, with a live website, currently dropped as `too_small` with no review data at all — *Specialist Structural Waterproofing Ltd*, *Octopus Waterproofing Ltd*, *London Damp Proofing & Timber Treatment*, *GO5 LTD*, *National Waterproofing Group*. The 697 rows scoring 1–4 stay dropped: that band **is** the ghost filter and it is working. |
| **P8** | **Add the 17 `brand_families` terms as name tokens in the recovery config's `name_not_icp` list.** | `recover-generic-uk-config.json` | Recovers ~20–30 branded rows now stranded in `not_in_icp` whose generic type the recovery already accepts but whose brand name carries no ICP token: **Protectahome Ltd** ×6, **Prokil Chingford / Exeter**, **Timberwise UK Ltd**. Zero precision risk — these are the brands the operator explicitly said to keep and flag. |
| **P9** | **ENGINE (needs operator approval + a test + an `IMPROVEMENTS.md` entry — not applied here): add site-builder platform hosts to `skills/google-maps-scrape/shared-hosts.js`.** | engine | `sitelift.site` is currently classed `site`, so `collapse-domains.js` merges **4 unrelated firms** into one domain and picks one representative — *Sundridge Homes and Gardens*, *No Fuss Plastering* and *Fixzen Services* would be fanned **Rhodes to Improvement's** site text at the owner read, i.e. three wrong owner names shipped. Also present at `location_count 1` and latent: `localo.site`, `netlify.app`, `lovable.app`, `replit.app`, `brand.site`. |
| **P10** | **COVERAGE, costs money (~36–90 calls): re-buy the 36 `(tile, query)` rows that returned `ok` with count 0.** | a 36-row runsheet through `run-scrape.js` | `run-scrape.js` heals only `status != ok`, so an `ok`+0 is invisible to the coverage report. ~21 of the 36 are high-volume queries at dense tiles (damp proofing at Guildford, structural repair at Huddersfield, basement waterproofing at Kingston and Ealing, mini piling at Liverpool). The cross-query overlap in this run is large, so the unique-lead yield is probably modest — but it is the only unmeasured hole left, and it is cheap. Separately worth an `IMPROVEMENTS.md` note: **`run-scrape.js` should flag `ok`+count-0 rows at tiles whose other queries returned data.** |

**Combined effect if P1–P5, P7, P8 are taken** (before geo-gate and dedupe, which would trim ~10%):
roughly **+325 / −40 rows on a 1,357-row list**, i.e. a net-new list around **1,600**, with the
brand table going from 3 labelled families to ~7 and Richardson & Starling appearing for the first
time.

---

## 8. Files produced by this pass

`leads_clean.csv` (21,898) · `coverage_summary.json` · `calls_summary.json` ·
`leads_clean_qualified.csv` (2,270, incl. 332 recovered) · `excluded_officp.csv` (19,960) ·
`recover/` · `leads_clean_qualified_infootprint.csv` (1,494) · `excluded_geo.csv` (776) ·
`footprint_gate_report.json` · `leads_netnew.csv` (1,357) · `dedupe_report.json` ·
`leads_annotated.csv` (1,357) · `leads_domains.csv` (1,166 — the spend file) ·
`leads_nowebsite.csv` (115) · `domain_siblings.json` · `collapse_report.json`.

All of the above are gitignored client data. Only this report and the one-line `merge-shards.js`
logging fix are committed.

**Next gate:** `leads_domains.csv` → SKILL STEP 6 owner-finding (`owner-prompt.md` exists), and
`leads_nowebsite.csv` → STEP 5d recovery. Do not start either until the §7 proposals are decided —
P1 alone moves 124 rows, and re-running qualify after owner-finding would mean paying twice.
