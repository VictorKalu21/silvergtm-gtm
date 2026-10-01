# GATE 1 — Atlas Growth **UK** foundation repair: read-back before any API call

Nothing here has spent anything. `SKILL` STEP 3 requires this read-back because a wrong coordinate or
a wrong category is cheap to fix now and expensive to fix after the scrape. **Approve before the
first call.**

---

## 1. Footprint — anchors by nation

| nation | anchors | densify | **tiles** |
|---|---:|---:|---:|
| England | 106 | 24 | **130** |
| Scotland | 22 | 3 | **25** |
| Wales | 13 | 0 | **13** |
| Northern Ireland | 9 | 0 | **9** |
| **total** | **150** | **27** | **177** |

The brief said "~130 anchors". This is 150. The extra 20 are the fill needed to hold the "no
populated area more than ~25 km from a tile" rule in the thin parts: Cornwall and north Devon,
Cumbria and the Solway, Northumberland and the Border, mid-Wales and Pembrokeshire, the Scottish
Borders, Galloway, the Angus coast, Moray, Lochaber and Caithness. Say the word and any of those come out.

**England (106 anchors)** — London · Birmingham · Wolverhampton · Coventry · Stoke-on-Trent ·
Telford · Shrewsbury · Hereford · Worcester · Gloucester · Cheltenham · Bristol · Bath ·
Weston-super-Mare · Taunton · Yeovil · Exeter · Torquay · Plymouth · Barnstaple · St Austell · Truro ·
Penzance · Weymouth · Bournemouth–Poole · Salisbury · Swindon · Southampton · Portsmouth ·
Basingstoke · Reading · Slough · Oxford · Aylesbury · High Wycombe · Milton Keynes · Northampton ·
Kettering–Corby · Bedford · Luton · Stevenage · Cambridge · Peterborough · King's Lynn · Norwich ·
Great Yarmouth · Lowestoft · Ipswich · Bury St Edmunds · Colchester · Chelmsford · Southend-on-Sea ·
Medway–Chatham · Maidstone · Canterbury · Dover · Ashford · Hastings · Eastbourne · Tunbridge Wells ·
Crawley · Brighton–Hove · Guildford · Leicester · Nottingham · Derby · Mansfield · Chesterfield ·
Lincoln · Grimsby · Scunthorpe · Kingston upon Hull · York · Scarborough · Leeds · Bradford ·
Huddersfield · Barnsley · Doncaster · Sheffield · Manchester · Rochdale · Bolton · Wigan ·
Warrington · Liverpool · Southport · Chester · Preston · Blackpool · Blackburn · Burnley · Lancaster ·
Kendal · Barrow-in-Furness · Workington · Carlisle · Middlesbrough · Hartlepool · Darlington ·
Durham · Sunderland · Newcastle upon Tyne · Hexham · Ashington–Morpeth · Berwick-upon-Tweed.

**Scotland (22)** — Glasgow · Edinburgh · Aberdeen · Dundee · Montrose–Arbroath · Perth · Stirling · Falkirk ·
Livingston · Dunfermline · Kirkcaldy · Greenock · Kilmarnock · Ayr · Stranraer · Dumfries ·
Galashiels (Borders) · Inverness · Elgin · Fort William · Oban · Wick (Caithness).

**Wales (13)** — Cardiff · Newport · Swansea · Bridgend · Merthyr Tydfil · Llanelli · Carmarthen ·
Haverfordwest · Aberystwyth · Newtown (Powys) · Wrexham · Rhyl–Colwyn Bay · Bangor (Gwynedd).

**Northern Ireland (9)** — Belfast · Lisburn · Craigavon · Newry · Ballymena · Coleraine ·
Londonderry · Omagh · Enniskillen.

### Densification (27 extra tiles)

| where | +tiles | tiles added |
|---|---:|---|
| **London** | **+12** (13 total) | Wood Green (N) · Streatham (S) · Stratford (E) · Ealing (W) · Croydon · Bromley · Romford · Enfield · Harrow · Kingston · Uxbridge · Watford |
| Birmingham | +3 | Solihull · Sutton Coldfield · Walsall |
| Manchester | +3 | Altrincham/Trafford · Bury · Ashton-under-Lyne |
| Leeds / Bradford | +2 | Leeds North (Moortown) · Keighley |
| Glasgow | +2 | Paisley · East Kilbride |
| Liverpool | +1 | Garston/South |
| Sheffield | +1 | Sheffield North |
| Bristol | +1 | Filton/North |
| Newcastle | +1 | Gateshead South |
| Edinburgh | +1 | Edinburgh West |

London is densified with **explicit borough tiles** rather than by letting the engine quadrant-split,
because a split lands wherever the maths puts it and the boroughs are where the subsidence market is.

Known accepted gaps: Scottish islands, far north-west Highlands, Welsh interior.

---

## 2. Volume and projected spend

- **177 tiles × 10 queries = 1,770 runsheet rows** (`atlas-growth-uk-runsheet.csv`).
- Shards: **8**, round-robin by row, **~222 rows each** (`shards/shard-0.csv … shard-7.csv`).

**Projected API calls.** Assumption stated: `scrape_tuning.paginate: true` with `max_pages 6`,
`limit 150`, so a row costs one call per page until the viewport is exhausted. The only published
measurement of the paginated engine is the Lagos pilot — **2.91 calls/row on dense urban tiles** —
and the older single-call US run measured a sparse-market floor around 1.3.

| scenario | assumption | calls |
|---|---|---:|
| low | every row behaves like a sparse tile (1.3 calls/row) | **~2,300** |
| **central** | the 42 dense tiles (London 13 + the 27 densify + the big cores) at 2.9, the other 135 at 1.3 | **~3,000** |
| high | every row behaves like a dense tile (2.9 calls/row) | **~5,100** |
| absolute ceiling | every row hits `max_pages` and never splits | 10,620 |

Quadrant splits are near-impossible under pagination (a split now needs `max_pages × limit` = 900
records in one viewport), so the split surcharge the US run carried is not in these numbers.
**Do not extrapolate from the first minutes of the run** — the US run measured 5.1 calls/tile over
its first 110 s (dense metros sort first) against a 2.2 final average, and over-projected spend ~2×.
Take the real number from `run_log.json` at ≥25% of the sheet.

---

## 3. The 10 queries

| # | query | icp_type | priority |
|---|---|---|---|
| 1 | `underpinning` | foundation | P1 |
| 2 | `subsidence repair` | foundation | P1 |
| 3 | `structural repair` | foundation | P1 |
| 4 | `foundation repair` | foundation | P1 |
| 5 | `damp proofing` | adjacent | P2 |
| 6 | `basement waterproofing` | adjacent | P2 |
| 7 | `structural waterproofing` | adjacent | P2 |
| 8 | `cellar tanking` | adjacent | P2 |
| 9 | `mini piling` | adjacent | P2 |
| 10 | `wall tie replacement` | adjacent | P2 |

**One change from the brief:** `underpinning contractor` → `underpinning`. "Contractor" is a US-idiom
suffix UK firms rarely carry in their name or Google category, and Maps text-matches the query, so
the suffix could only narrow the set. Trivial to revert.

P2 carries the volume here, not P1 — ~60% of the real UK universe self-labels as damp-proofing /
structural waterproofing, and those firms are **in scope** (tagged by `service_bucket` downstream).

---

## 4. Qualify rules — one line each (order matters; first failure is the drop_reason)

| # | rule | one line |
|---|---|---|
| 1 | `hard_off_icp_type` (deny, **any tag**) | Charities, colleges, schools, hospitals, places of worship, funeral homes, estate/letting agents, law and insurance offices, car bodyshops and dealers — the things our own queries drag in, and the only rule allowed to look at a secondary tag. |
| 2 | `off_icp_primary` (deny, **primary tag only**) | Engineers, chartered/quantity surveyors, inspectors, builders merchants, manufacturers, tool and plant hire, plumbers, drainage firms, removals, architects, kitchen/bathroom fitters — dropped only when that is their *primary* identity. |
| 3 | `name_deny` (name, exact substring) | NHS/charitable trusts, councils, named churches, accident/crash repair, the named merchants (Travis Perkins, Jewson, Wickes…), ready-mix and quarry, surveying practices, drain-only jargon, plumbing-and-heating, pest-only terms. No chain or franchise names. |
| 4 | `not_in_icp` (allow, **any tag**) | Must carry one of: foundation · waterproofing · damp · basement · cellar · tanking · structural · piling · underpinning · masonry · stonemason · building restoration · preservation · remedial · drainage. |
| 5 | `too_small` (review_count ≥ 5) | Ghost-listing filter only. |
| — | `recover-generic-uk-config.json` | Second $0 pass over `excluded_officp.csv`: takes back rows dropped as `not_in_icp` whose type is generic construction **and** whose NAME carries an ICP token. Cannot resurrect anything a deny removed. |

**Dry-run status: 26 of 26 fixture rows matched expectation** (`dryrun-results.md`), including the
segment-killer probes: a real brand primaried `Pest control service` survives; a church carrying
`Building restoration service` still drops; a builder typed only `Construction company` drops and
comes back through the recovery.

---

## 5. Brand families (flag, never drop)

Peter Cox · Rentokil Property Care · Timberwise · Kenwood Damp Proofing · Prokil · DampMaster ·
Preservation Treatments · Mainmark · Geobear / Uretek · Abbey Pynford · Protectahome ·
Wise Property Care · Sovereign Chemicals · Richardson & Starling · Brick-Tie · Twistfix ·
Safeguard Europe.

Four terms **lengthened** so they cannot label an independent: `abbey`→`abbey pynford`,
`sovereign`→`sovereign chemicals`, `safeguard`→`safeguard europe`, `kenwood`→`kenwood damp`.
Two **dropped: Helifix and Permagard** — both appear inside independents' Maps names as an
accreditation ("Helifix approved installer"), and a wrong brand label is worse than none. Verified on
the fixture: 4 brands flagged, 0 of 22 independents mislabelled.

## 6. Review floor

**5**, label `too_small`. Not 30 (the US number). A ghost-listing filter, not a size gate: this trade
in the UK is owner-operated firms with single-digit review counts, and the real ICP gate is the
downstream site-text adjudication. Re-checkable at $0 by re-running qualify at 0 over the excluded file.

---

## 7. The four deliberate calls, stated so they are visible

1. **No chain drop.** Roll-ups and franchises are kept and flagged (`brand_family` + `location_count`).
2. **No government deny.** None of these 10 queries carries distress/institutional intent; the UK
   institutional risk ("<X> Foundation", a council office) is already covered by the charity/college/
   hospital type deny and the council/NHS name terms.
3. **Generic construction types refused at the allow, recovered by NAME.** `Construction company` /
   `Contractor` / `Builder` / `Concrete contractor` are ~17% real ICP and ~83% noise; admitting them
   floods the list, so they come back only paired with an ICP name token.
4. **Pest control is not denied by type.** UK damp-and-timber firms are routinely primaried
   `Pest control service` (woodworm, dry rot) — Rentokil Property Care branches are exactly that.
   Pure pest firms fall out at the positive allow instead. (Plumbers and drainage firms *are* denied
   on primary, because they carry `Drainage service` tags the allow would otherwise readmit.)

*(And a fifth, minor: the single query-wording change in §3.)*

---

## 8. Sharding and the merge rule

- **8 shards**, round-robin by row, ~222 rows each, so every worker spans all four nations and both
  priorities. Run each through `run-scrape.js` (never `scrape.js`), gate on exit 0 / `coverage_report.json`
  = COMPLETE.
- **Merge:** concatenate the 8 `leads_clean.csv`, **dedupe on `place_id`**, and on a duplicate
  **union the `google_types` and `icp_type` tags, rejoined with `|`**. Round-robin sharding produces
  heavy cross-shard overlap by design; this is where it is removed. `|` is not cosmetic —
  `qualify-leads.js` hardcodes `|` as the `google_types` separator, and any other separator silently
  turns the primary-only deny into an any-match deny (IMPROVEMENTS, HIGH).
- Then, in order: `qualify-leads.js` → recovery pass → `footprint-gate.js` (STEP 5b-geo, mandatory in
  `areas` mode; expect real US-pin contamination) → `build-netnew.js` → `collapse-domains.js`.

---

**Approve?** The two questions worth an explicit yes/no: the **review floor of 5**, and the
**150 anchors vs the ~130 in the brief**.
