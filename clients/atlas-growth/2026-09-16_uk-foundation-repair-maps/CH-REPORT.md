# Companies House pass — 2026-09-16 UK foundation-repair MAPS run

Steps 1–2 of `ch_pipeline.md`, run over the **860** leads of the combined ICP + damp-only input.
Free public API only (600 req / 5 min, 429-aware). **No paid credits, no scraper.tech calls.**
Outputs are gitignored (`clients/**/owner/`): `owner/companies_house.jsonl`,
`owner/companies_house_lowconf.jsonl`. `ch_second_pass.py` was **not** run — it is a post-read step.

## 1. Input — `ch_input.csv`

Built by `build_ch_input.py` (this folder): union of `leads_qualified.csv` and
`leads_damp_only.csv`, one row per `place_id`, with a `segment` column and the columns the engine
reads (`place_id, name, full_address, city`) plus `zip, website, root_domain` for the downstream join.

| | rows |
|---|---|
| `leads_qualified.csv` | 686 |
| `leads_damp_only.csv` | 174 |
| overlapping `place_id` dropped | **0** |
| **`ch_input.csv`** | **860** (qualified 686 / damp_only 174) |

**Postcode coverage — the matcher's disambiguator.** `companies-house.js` takes the *last* UK
postcode in `full_address` and falls back to `city`.

| | n | % |
|---|---|---|
| postcode present in `full_address` | 651 | **75.7%** |
| no postcode | 209 | 24.3% |
| of those, also no usable `city` | 207 | 24.1% |

Better than the export run's 30% missing, but the 209 are **not** partial addresses — their
`full_address` is entirely **empty** (service-area listings: *"Prime Piling | Covering Essex and
London"*, *"Piling Contractor London"*). They have no `city` either, so for 207 leads the engine had
**no geographic disambiguator at all** and could only accept a name overlap ≥ 0.9. The `zip` column
is present in both source CSVs but is **empty on all 860 rows**, so it adds nothing.

Measured effect: **54.2%** matched where a postcode existed vs **37.8%** where it did not.

## 2. Engine pass — `node companies-house.js --leads ch_input.csv --out owner --concurrency 4`

```
CH lookup -> clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/owner/companies_house.jsonl
  leads: 860 | company matched: 432 | with active director(s): 431
```

| outcome | n | % of 860 |
|---|---|---|
| matched (active company accepted) | 432 | **50.2%** |
| of which with ≥1 active director | 431 | 50.1% |
| `low_confidence` (candidate found, not asserted) | 345 | 40.1% |
| `no_name_match` | 83 | 9.7% |
| matched but 0 active directors | 1 | 0.1% |

789 officers pulled, 1.83 per matched company. 27 leads have a director whose surname appears in
the business name (`likely_principal`).

### By segment

| segment | n | matched | with ≥1 active director |
|---|---|---|---|
| qualified | 686 | 360 (**52.5%**) | 359 (52.3%) |
| damp_only | 174 | 72 (**41.4%**) | 72 (41.4%) |

The damp-only segment matches 11 points worse — it is the segment with more sole traders and more
address-less listings.

### Match basis (the important one)

| the match was confirmed by | n |
|---|---|
| postcode in the registered-office snippet | 154 |
| **city only (no postcode match)** | **119** |
| name overlap ≥ 0.9 alone | 159 |

**50.2% is well under the export run's 64%.** The gap is the 207 address-less leads plus a stricter
input; it is not an engine regression.

## 3. Low-confidence second look — `python3 ch_lowconf_officers.py`

```
records in companies_house.jsonl: 860 | low-confidence candidates: 190 | officers pulled for: 190
```

Of the 345 `low_confidence` records, **190** met the script's gate (candidate active, overlap ≥ 0.6)
and had their officers pulled → `owner/companies_house_lowconf.jsonl`. **189** carry ≥1 active
director. **These are candidates, not accepted matches** — `owner-prompt.md` Companies House rule 3
is applied by the reader.

As a preview of how many will survive that rule, **69 of the 190** have a CH title sharing a
distinctive (non-generic) token with the business name; the other ~121 are the *"Crown Preservation →
ABOVEWATER DAMP PROOFING"* shape the rule exists to reject.

**Director names now on the table for 620 of 860 leads (72.1%)** — 431 authoritative engine matches
plus 189 candidate-only leads awaiting the reader's judgement.

## 4. QA — 25 random matched leads

Seed 20260916 over the 432 matched records.

| # | business name | CH company title | number | first director | verdict |
|---|---|---|---|---|---|
| 1 | Expertreat Ltd | EXPERTREAT LIMITED | 02000158 | ANDREW, Foreman | ok |
| 2 | London Elite Trades Ltd | LONDON ELITE TRADES LTD | 10994476 | DACONESCU, Valentin-Danut | ok |
| 3 | ADCL Humphries & Sons … | A D C L HUMPHRIES & SONS STONEMASONS LIMITED | 10675817 | HUMPHRIES, Daniel | ok |
| 4 | Gates Brothers Damp Proofing | GATES BROTHERS DAMP PROOFING LTD | 12016602 | GATES, Michael | ok |
| 5 | Harding Homes Preservation LTD | HARDING HOMES BUILDING & PRESERVATION LTD | 15857086 | HARDING, Dre-Stewert | ok |
| 6 | CS Damp proofing Ltd | CS DAMP PROOFING LTD | 14465361 | BRIGHT, Corin | ok (exact) |
| 7 | Westbuild Piling | WESTBUILD PILING LIMITED | 10647726 | WESTERMAN, Mark | ok |
| 8 | South West Wall Ties | SOUTH WEST WALL TIES LTD | 16361293 | GALT, Gavin James | ok |
| 9 | Ace Damp Proofing | ACE DAMP PROOFING LIMITED | 13352763 | HOWES, Paul Anthony | ok |
| 10 | Curedamp Ltd | CUREDAMP LIMITED | 10051371 | CHAPMAN, Stefan David | ok |
| 11 | Damp - Mould - Leak Detection LTD | DAMP - MOULD - LEAK DETECTION LTD | 16310132 | HANSON, Calvin | ok (exact) |
| 12 | SPL (Stabilised Pavements Ltd.) | STABILISED PAVEMENTS LIMITED | 03241163 | HOWE, Gerald Thaddius Robins | ok |
| 13 | SANDAROV LTD | SANDAROV LTD | 07046368 | SANDAROV, Anton Zahariev | ok |
| 14 | **Rentokil Property Care - Belfast** | **BELFAST PROPERTY DEVELOPMENTS LTD** | NI719509 | MCGEEHAN, Tanya | **WRONG** |
| 15 | Space Excavation LTD - Basement Excavation | SPACE EXCAVATION LTD | 09220214 | BLASZCZYK, Grzegorz | ok |
| 16 | Lancaster Damp Proofing Ltd | LANCASTER DAMP PROOFING LIMITED | 10551953 | CORLESS, Christopher | ok |
| 17 | Dampguard & Plastering | DAMPGUARD & PLASTERING LIMITED | 06308629 | BUTMARO, Carl | ok |
| 18 | Prestige Damp Proofing Solutions | PRESTIGE DAMP PROOFING SOLUTIONS LTD | 11767567 | HICKEY, Patrick | ok |
| 19 | THE DAMP & ROT COMPANY | THE DAMP & ROT COMPANY LIMITED | 07925104 | HUTCHINSON, Paula | ok (exact) |
| 20 | Piling Specialists LTD | PILING SPECIALISTS LTD | 12466469 | AHMETCENAJ, Luca | ok (exact) |
| 21 | Dovedale Dampcure Services Ltd | DOVEDALE DAMPCURE SERVICES LTD | 08828980 | NEYLON-WITHAM, Julian Mostyn | ok |
| 22 | Cook Group Ltd | COOK GROUP LIMITED | 01181520 | COOK, David Owen | ok |
| 23 | Shield Damp Proofing Ltd | SHIELD DAMP PROOFING LIMITED | 08764902 | WALKER, Steven Andrew | ok |
| 24 | **Phillips Building & Property Maintenance** | **ALM BUILDING SERVICES & PROPERTY MAINTENANCE LTD** | 16764895 | FILIP, Lorenzo-Alin | **WRONG** |
| 25 | Timberwise (UK) Ltd | TIMBERWISE (UK) LIMITED | 03230356 | EDWARDS, George William | ok |

**Verdict: 2 of 25 (8%) are wrong matches.**

- **Rentokil Property Care - Belfast → BELFAST PROPERTY DEVELOPMENTS LTD (NI719509).** A national
  brand's branch matched to an unrelated Belfast property developer on the town name alone.
- **Phillips Building & Property Maintenance → ALM BUILDING SERVICES & PROPERTY MAINTENANCE LTD
  (16764895).** Shares only the generic trade words; *Phillips* appears nowhere in the CH title.

Both were accepted on the **city-only** path with no postcode confirmation.

### Fleet-wide wrong-match scan

Every matched row was scanned for the same defect: neither name contains the other after
normalisation, **and** the CH title shares no distinctive (non-generic, non-place) token with the
business name.

**29 of 432 flagged (6.7%).** Three are false alarms — punctuation/spacing variants confirmed by
postcode (*Tri Court → TRICOURT*, *Garratt's → GARRATTS*, *GJones → G JONES*), which are the other
face of the `IMPROVEMENTS.md` tokenisation bug. That leaves **~26 genuine wrong matches, ~6.0% of
all matched leads.** Named examples beyond the two above:

- PERLINI Damp Proofing → **ABOVEWATER DAMP PROOFING LTD.** *(the exact export-run failure, again)*
- Damp Proofing Direct Ltd → **ABOVEWATER DAMP PROOFING LTD.**
- Chorlton Damp Proofing → ADVANCED DAMP PROOFING LTD
- MULTI DAMP PROOFING SYSTEMS → ADVANCED DAMP PROOFING LTD
- Knights Damp Proofing and Plastering → ACL DAMP PROOFING & PLASTERING LTD
- Atkins Wallcare Damp Proofing Derby → ACL DAMP PROOFING & PLASTERING LTD
- Advanced Damp Ltd → ABSL DAMP LIMITED
- Advantage Plastering & Damp Proofing → HERITAGE PLASTERING & DAMP PROOFING LIMITED
- Catlin Rising Damp & Timber Treatment → ABBEY DAMP PROOFING & TIMBER PRESERVATIONS LTD
- ADP Damp Proofing & Soundproofing → ACE DAMP PROOFING & PLASTERING LTD
- Amvale Damp Proofing Doncaster → ALL DRY DAMP PROOFING LIMITED
- KML Plastering Solutions → ALL PLASTERING SOLUTIONS LIMITED
- Bolton Piling Ltd → APPLETON PILING LIMITED
- Aqua Damp Proofing Swansea → REES BROS (DAMP PROOFING) SWANSEA LIMITED
- Platinum Preservation NI Dampproofing Belfast → BELFAST TARMAC AND PAVING NI LTD
- BEC Basement Excavation Construction → CRANBROOK BASEMENT DESIGN & CONSTRUCTION LIMITED
- Norbi Basement Conversion London → LONDON BASEMENT AND STRUCTURES LIMITED
- Independent Damp & Mould Surveys | London → ALPHA DAMP & MOULD GROUP LTD
- BNS Groundwork London → GROUNDWORK EAST LONDON
- Universal Basement Waterproofing Ltd → BASEMENT WATERPROOFING SPECIALISTS LIMITED *(the one postcode-path miss)*

One more, caught by eye rather than by the scan (both names are all-generic so the token test cannot
see it): **P&E Basement Excavation Builders → HG P&E AGGREGATOR NOMINEES LIMITED (14530692)** — a
nominee holding company, not a builder. The scan therefore under-counts slightly; ~6% is a floor.

**Where the wrong matches come from — one path, not the engine as a whole:**

| basis | matched | flagged wrong | error rate |
|---|---|---|---|
| postcode | 154 | 4 (3 of them false alarms) | **~0.6%** |
| name overlap ≥ 0.9 | 159 | 0 | **0%** |
| **city only** | **119** | **25** | **~21%** |

The postcode and exact-name paths are clean. **The `cityMatch` acceptance carries a ~21% wrong-owner
rate** — a UK town name is not a disambiguator when every firm in the vertical is named
`<word> Damp Proofing`. These names are marked `matched` (authoritative) in the JSONL, so the reader
will *not* apply rule 3 to them the way it does to `low_confidence` candidates.

**Recommendation (not applied — engine changes need operator approval + a test):** demote a
`cityMatch`-only acceptance to `low_confidence` unless the name overlap is high, so it goes to the
reader for judgement instead of being asserted. That is a new `IMPROVEMENTS.md` entry, distinct from
the open 2026-09-16 tokenisation entry.

### Sole-trader-looking businesses with no match

**15** unmatched leads carry a personal name — no UK limited company to find, so Companies House
will never name them and they belong to the site-read / LinkedIn-sweep tracks. The trading name is
usually itself the owner's name, which the reader can take directly.

| business | engine outcome | shape |
|---|---|---|
| Vincent Damp Proofing & Control | low_confidence | forename-led |
| Michael Hurdus Plastering & Dampproofing. | low_confidence | forename-led |
| Peter Cross Preservation | low_confidence | forename-led |
| David Gregory Plastering Contractors | low_confidence | forename-led |
| Steve Fryer Plastering & Damp Proofing | low_confidence | forename-led |
| Andrew Wright Plastering/damp proofing | low_confidence | forename-led |
| David Wood Damp & Timber Treatments | low_confidence | forename-led |
| Jonathan Booth Conservation | no_name_match | forename-led |
| Carl Jackson Plastering Rendering & Damp Proofing | no_name_match | forename-led |
| Andy Charlton Plastering and Damp | no_name_match | forename-led |
| George Hardie & Son (Joiners) Ltd | no_name_match | forename-led |
| John's Brickwork Essex Builders & Loft Conversions | low_confidence | possessive |
| Davidson's DPR | no_name_match | possessive |
| Oldbury's | low_confidence | possessive |
| Pj's Plastering and Dampproofing Services | low_confidence | possessive |

## 5. Headline

| | |
|---|---|
| leads in | **860** (686 qualified + 174 damp_only) |
| matched to an active UK company | **432 (50.2%)** |
| **carrying ≥1 active director (authoritative)** | **431 (50.1%)** |
| low-confidence candidates with directors fetched for the reader | 189 |
| **leads with a director name on the table, either way** | **620 (72.1%)** |
| estimated wrong matches inside the 432 | ~26 (~6.0%), 25 of them on the city-only path |

## Next

Steps 3–4 of `ch_pipeline.md` (`prep-owner-batches.js` → `inject_ch_directors.py`), then the Haiku
reads. `ch_second_pass.py` runs **after** the read, per the pipeline's ordering correction.
