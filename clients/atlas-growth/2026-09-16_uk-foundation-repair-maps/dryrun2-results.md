# UK qualify rules — fixture dry run #2, GATE 3 rule changes P1–P8

**What this is.** The operator approved all of REPORT2-GATE3 §7 on 2026-09-16 ("Apply all"). P1–P8
are config-only changes; this is the re-validation that they do what they claim and break nothing
that `dryrun-results.md` established. Same discipline as that run: deterministic, $0, no API call,
and **no expectation was relaxed to fit a rule**. P9 (engine `shared-hosts.js`) is not in scope here
and P10 (the re-buy) is a coverage change, reported in `REPORT2-GATE3.md` follow-up, not here.

The fixture grew from 26 rows to **41**: 14 new probe rows, one per change plus a control for each
change that could plausibly open a door it should not.

**Commands run** (engine unmodified, from `skills/google-maps-scrape/`):

```
node qualify-leads.js --in <run>/fixture.csv                     --config clients/atlas-growth/atlas-growth-uk-config.json         --out <run>/dryrun2
node qualify-leads.js --in <run>/dryrun2/excluded_officp.csv     --config clients/atlas-growth/recover-generic-uk-config.json      --out <run>/dryrun2/recover
node qualify-leads.js --in <run>/dryrun2/excluded_officp.csv     --config clients/atlas-growth/recover-unrated-uk-config.json      --out <run>/dryrun2/recover-unrated
node collapse-domains.js --in <run>/fixture.csv                  --config clients/atlas-growth/atlas-growth-uk-config.json         --out <run>/dryrun2/collapse
```

**Result: 41 of 41 rows matched expectation.** Every one of the original 26 kept the verdict
`dryrun-results.md` recorded — the P1–P8 changes are additive at the row level and caused no
regression.

```
QUALIFY -> dryrun2                 input 41 | KEEP 14 | DROP 27
  {"not_in_icp":9,"hard_off_icp_type":6,"off_icp_primary":7,"name_deny":2,"too_small":3}
RECOVER (generic) -> recover       input 27 | KEEP  5 | DROP 22
  {"name_not_icp":1,"not_a_recovery_candidate":18,"not_generic_contractor":3}
RECOVER (unrated) -> recover-unrated  input 27 | KEEP  1 | DROP 26
  {"not_an_unrated_candidate":24,"has_review_count":1,"no_website":1}
```

`<run>/dryrun2/` was deleted after the run, as the operator asked; this file is the record.

---

## The engine fact P7 rests on — probed, not remembered

CLAUDE.md: *a claim about a tool that decides a design is preceded by a probe and the probe output
is pasted.* The design question was "how does `qualify-leads.js` treat a BLANK `review_count` under
`>=`, and do `exists` / `not_exists` work on that column?". A 3-row probe CSV (blank / 0 / 5) was
run through the real engine four times, one operator per run:

```
$ cat probe.csv
place_id,name,google_types,website,review_count,drop_reason
P1,Blank Reviews Ltd,Waterproofing service,blankco.co.uk,,too_small
P2,Zero Reviews Ltd,Waterproofing service,zeroco.co.uk,0,too_small
P3,Five Reviews Ltd,Waterproofing service,fiveco.co.uk,5,too_small

===== {"field":"review_count","op":">=","value":5} =====
  KEEP: 1  (33%)   DROP: 2  (67%)   drop reasons: {"too_small":2}
  KEPT NAMES: Five Reviews Ltd
===== {"field":"review_count","op":"not_exists"} =====
  KEEP: 1  (33%)   DROP: 2  (67%)   drop reasons: {"has_reviews":2}
  KEPT NAMES: Blank Reviews Ltd
===== {"field":"review_count","op":"exists"} =====
  KEEP: 2  (67%)   DROP: 1  (33%)   drop reasons: {"no_reviews":1}
  KEPT NAMES: Zero Reviews Ltd Five Reviews Ltd
===== {"field":"review_count","op":"in","value":[""]} =====
  KEEP: 1  (33%)   DROP: 2  (67%)   drop reasons: {"not_blank":2}
  KEPT NAMES: Blank Reviews Ltd
```

Three facts, all confirmed:

1. **A blank fails `>= 5` exactly as a 0 does.** `qualify-leads.js:92` is
   `const a=num(raw); if(a==null) return false;` and `num('')` is `parseFloat('')` → `NaN` → `null`,
   so the comparison is never reached. The blank row and the 0 row were dropped together; only the
   5-review row survived. That is the P7 bug in one line — 417 of this run's 1,114 `too_small` rows
   have no review data at all and were judged as if they had zero.
2. **`not_exists` works on `review_count`.** It is a generic non-empty-trimmed-string test
   (`qualify-leads.js:85-86`) applied to any `leads_clean` column, and it kept *only* the blank row.
   That is the operator the unrated pass uses.
3. **`in [""]` behaves identically** and would also have worked. `not_exists` was chosen because it
   states the intent without depending on an empty string surviving a round-trip through the CSV
   writer.

## The rule-ORDER fact P7 rests on — read off the engine

The brief asked whether the unrated pass must re-apply rules 1–4 of the main config. **It must not,
and cannot need to.** `qualify-leads.js:107` is

```js
for(const rule of active){ if(!passes(r,rule)){ reason=rule.label||(rule.op+':'+rule.field); break; } }
```

— it breaks on the **first** failing rule and writes that rule's label as `drop_reason`. The review
floor is **rule 5, the last rule**, so a row carrying `drop_reason:"too_small"` is by construction a
row that already **passed** rules 1–4: the hard entity deny, the primary-type deny, the name deny and
the positive ICP allow. Re-applying them could only return the same verdict. So the unrated pass is
exactly three rules: `drop_reason in ["too_small"]` → `review_count not_exists` → `website exists`.

Fixture rows 026, 039 and 040 are the controls that prove the three rules are each load-bearing: a
rated ghost (2 reviews) is refused by rule 1, an unrated listing with no website by rule 2, and an
unrated **charity** never reaches either because rule 0 sees `hard_off_icp_type`, not `too_small`.

---

## Row-by-row — every row, expected vs actual

Verdict triple = **main pass / generic recovery / unrated recovery**. "blocked" = the pass's rule-0
scope gate refused the row as a candidate (`not_a_recovery_candidate` / `not_an_unrated_candidate`).

| # | Row (name · google_types · reviews) | What it probes | Change | Expected | Actual | ✓ |
|---|---|---|---|---|---|---|
| 1 | Pennine Damp Proofing Ltd · `Waterproofing service|Contractor` · 41 | the modal UK ICP firm | — | KEEP / - / - | **KEEP** / - / - | ✓ |
| 2 | Northern Underpinning Solutions Ltd · `Construction company|Foundation` · 27 | allow is google_types-ANY, not primary | — | KEEP / - / - | **KEEP** / - / - | ✓ |
| 3 | Peter Cox Preston · `Waterproofing service|Building restoration service` · 63 | roll-up row survives + brand flag | — | KEEP / - / - | **KEEP** / - / - | ✓ |
| 4 | Rentokil Property Care Glasgow · `Pest control service|Waterproofing service` · 88 | the pest-control segment-killer probe | — | KEEP / - / - | **KEEP** / - / - | ✓ |
| 5 | Ulster Damp & Timber Care Ltd · `Waterproofing service|Pest control service` · 22 | NI row + pest as a secondary tag | — | KEEP / - / - | **KEEP** / - / - | ✓ |
| 6 | Cumbria Damp & Structural Ltd · `Waterproofing service|Structural engineer` · 13 | deny asymmetry: engineer as a SECONDARY | — | KEEP / - / - | **KEEP** / - / - | ✓ |
| 7 | Mersey Masonry & Preservation Ltd · `Masonry contractor|Building materials supplier` · 21 | same, for the supplier deny | — | KEEP / - / - | **KEEP** / - / - | ✓ |
| 8 | Cavity Wall Tie Specialists Cardiff · `Masonry contractor|Building restoration service` · 7 | Wales + low-review real firm clears the floor | — | KEEP / - / - | **KEEP** / - / - | ✓ |
| 9 | Glasgow Cellar Tanking Co · `Waterproofing service` · 6 | floor boundary (6 >= 5) | — | KEEP / - / - | **KEEP** / - / - | ✓ |
| 10 | Timberwise Newcastle · `Waterproofing service|Pest control service` · 57 | brand flag | — | KEEP / - / - | **KEEP** / - / - | ✓ |
| 11 | Hallam Structural Repairs Ltd · `Construction company` · 18 | the generic-type pair | — | DROP:not_in_icp / RECOVERED / blocked | **DROP:not_in_icp** / RECOVERED / blocked | ✓ |
| 12 | Anchor Mini Piling Ltd · `Concrete contractor` · 11 | same, via the `piling` name token | — | DROP:not_in_icp / RECOVERED / blocked | **DROP:not_in_icp** / RECOVERED / blocked | ✓ |
| 13 | Dawson & Sons Building Contractors · `Construction company` · 30 | recovery PRECISION: generic type, no ICP name token | P8 — brand terms must not widen this | DROP:not_in_icp / drop:name_not_icp / blocked | **DROP:not_in_icp** / drop:name_not_icp / blocked | ✓ |
| 14 | The Hartley Foundation · `Non-profit organization|Charity` · 12 | charity answering "foundation repair" | — | DROP:hard_off_icp_type / blocked / blocked | **DROP:hard_off_icp_type** / blocked / blocked | ✓ |
| 15 | Foundation College Manchester · `College|Educational institution` · 9 | college answering "foundation" | — | DROP:hard_off_icp_type / blocked / blocked | **DROP:hard_off_icp_type** / blocked / blocked | ✓ |
| 16 | Foundation Estate Agents · `Real estate agency` · 34 | estate agent + the "Foundation" name trap | — | DROP:hard_off_icp_type / blocked / blocked | **DROP:hard_off_icp_type** / blocked / blocked | ✓ |
| 17 | St Cuthbert's Parish Church Restoration · `Church|Building restoration service` · 8 · no site | place of worship carrying an ICP secondary | — | DROP:hard_off_icp_type / blocked / blocked | **DROP:hard_off_icp_type** / blocked / blocked | ✓ |
| 18 | Structural Repairs Autobody Ltd · `Auto body shop|Car repair and maintenance service` · 52 | collision shop answering "structural repair" | — | DROP:hard_off_icp_type / blocked / blocked | **DROP:hard_off_icp_type** / blocked / blocked | ✓ |
| 19 | Wessex Builders Merchants Ltd · `Building materials supplier|Hardware store` · 44 | merchant | — | DROP:off_icp_primary / blocked / blocked | **DROP:off_icp_primary** / blocked / blocked | ✓ |
| 20 | Sovereign Chemicals Ltd · `Manufacturer|Building materials supplier` · 19 | a brand_families term must not rescue a supplier | **P8 control** | DROP:off_icp_primary / blocked / blocked | **DROP:off_icp_primary** / blocked / blocked | ✓ |
| 21 | Crawford Structural Engineers Ltd · `Structural engineer|Foundation` · 16 | engineer with an ICP secondary | — | DROP:off_icp_primary / blocked / blocked | **DROP:off_icp_primary** / blocked / blocked | ✓ |
| 22 | Structural Drainage Solutions Ltd · `Drainage service|Contractor` · 31 | the drain-firm judgement call | **P4 control** | DROP:off_icp_primary / blocked / blocked | **DROP:off_icp_primary** / blocked / blocked | ✓ |
| 23 | Ribble Plumbing & Heating Ltd · `Plumber|Drainage service` · 26 | plumber; deny must beat the allow | **P4 control** | DROP:off_icp_primary / blocked / blocked | **DROP:off_icp_primary** / blocked / blocked | ✓ |
| 24 | Cleankill Pest Control Ltd · `Pest control service` · 35 | pure pest firm dies at the ALLOW | — | DROP:not_in_icp / drop:not_generic_contractor / blocked | **DROP:not_in_icp** / drop:not_generic_contractor / blocked | ✓ |
| 25 | Midland Drain Jetting & Lining Ltd · `Contractor|Repair service` · 29 | name deny firing where the type denies are blind | — | DROP:name_deny / blocked / blocked | **DROP:name_deny** / blocked / blocked | ✓ |
| 26 | Premier Damp Proofing · `Waterproofing service` · 2 · no site | ghost listing (2 reviews) | **P7 control** — the 1-4 band must NOT be recovered | DROP:too_small / blocked / drop:has_review_count | **DROP:too_small** / blocked / drop:has_review_count | ✓ |
| 27 | Rentokil Property Care Reading · `Water damage restoration service|Waterproofing service` · 31 | **P1**: a Rentokil branch primaried `Water damage restoration service` | **P1** | KEEP / - / - | **KEEP** / - / - | ✓ |
| 28 | Piled Solutions Ltd · `Pile driving service` · 35 | **P2**: Google writes `Pile driving service`, the allow had only `piling` | **P2** | KEEP / - / - | **KEEP** / - / - | ✓ |
| 29 | Heightvale Ltd · `Building restoration service|Property management company` · 67 | **P3**: ICP primary + `Property management company` as a SECONDARY | **P3** | KEEP / - / - | **KEEP** / - / - | ✓ |
| 30 | Marchwood Property Management Ltd · `Property management company|Contractor` · 41 | a firm whose PRIMARY identity IS property management | **P3 control** | DROP:off_icp_primary / blocked / blocked | **DROP:off_icp_primary** / blocked / blocked | ✓ |
| 31 | Kent Handyman & Property Services · `Handyman|Drainage service` · 87 | **P4**: handyman whose only ICP signal was a `Drainage service` tag | **P4** | DROP:not_in_icp / drop:not_generic_contractor / blocked | **DROP:not_in_icp** / drop:not_generic_contractor / blocked | ✓ |
| 32 | Cheshire Plastering & Damp proofing Contractors · `Plasterer` · 71 | **P5**: UK damp firm primaried `Plasterer` | **P5** | DROP:not_in_icp / RECOVERED / blocked | **DROP:not_in_icp** / RECOVERED / blocked | ✓ |
| 33 | Damp Surveys Ltd · `Surveyor` · 133 | **P6**: damp-survey practice typed `Surveyor` | **P6** | DROP:not_in_icp / RECOVERED / blocked | **DROP:not_in_icp** / RECOVERED / blocked | ✓ |
| 34 | Allcott Associates LLP Sheffield · `Chartered surveyor|Building inspector` · 40 | a real `Chartered surveyor`-primaried practice | **P6 control** | DROP:off_icp_primary / blocked / blocked | **DROP:off_icp_primary** / blocked / blocked | ✓ |
| 35 | Hindle Chartered Surveyors · `Surveyor|Property Surveyor` · 22 | a chartered practice typed plain `Surveyor` (the type string the real universe actually uses) | **P6 control** | DROP:name_deny / blocked / blocked | **DROP:name_deny** / blocked / blocked | ✓ |
| 36 | Octopus Waterproofing Ltd · `Waterproofing service` · **blank** | **P7**: BLANK review_count + a live website | **P7** | DROP:too_small / blocked / RECOVERED-UNRATED | **DROP:too_small** / blocked / RECOVERED-UNRATED | ✓ |
| 37 | Protectahome Ltd · `Contractor|Surveyor` · 29 | **P8**: brand name, generic type, no ICP vocabulary | **P8** | DROP:not_in_icp / RECOVERED / blocked | **DROP:not_in_icp** / RECOVERED / blocked | ✓ |
| 38 | Rainbow Restoration · `Water damage restoration service` · 44 | **P1 precision**: flood restorer, no ICP name token AND no second ICP type | **P1 cost** | DROP:not_in_icp / drop:not_generic_contractor / blocked | **DROP:not_in_icp** / drop:not_generic_contractor / blocked | ✓ |
| 39 | Ghostpin Damp Proofing Services · `Waterproofing service` · **blank** · no site | **P7 precision**: unrated AND site-less | **P7 control** | DROP:too_small / blocked / drop:no_website | **DROP:too_small** / blocked / drop:no_website | ✓ |
| 40 | Northfield Community Foundation · `Non-profit organization|Charity` · **blank** | **P7 scope**: an unrated CHARITY must not ride the unrated pass in | **P7 control** | DROP:hard_off_icp_type / blocked / blocked | **DROP:hard_off_icp_type** / blocked / blocked | ✓ |
| 41 | Rainbow Restoration Leeds · `Water damage restoration service|Building restoration service|Cleaners|Fire damage restoration service|Plumber|Pressure washing service` · 14 | **P1 precision, as the data really is**: Rainbow Restoration carries `Building restoration service` as a secondary | **P1 cost** | KEEP / - / - | **KEEP** / - / - | ✓ |

**41 / 41 ✓.** Rows 1–26 are byte-identical in verdict to `dryrun-results.md`.

## Brand labelling re-checked over the 41 rows

```
node collapse-domains.js --in fixture.csv --config atlas-growth-uk-config.json --out dryrun2/collapse
  40 rows -> 36 owner-finding rows (1 saved by domain dedupe) | no-website track: 3
  brand_family: {"Peter Cox":1,"Rentokil Property Care":2,"Timberwise":1,"Sovereign Chemicals":1,"Protectahome":1}
```

Six labels across five families, and **zero of the 35 independents mislabelled** — the same check
the operator asked for on the lengthened brand terms, re-run after P8 put those terms into the
recovery's NAME gate. Note what did *not* happen: `Rainbow Restoration` (`rainbow-int.co.uk`) was
**not** brand-labelled, and `Protectahome Ltd` — recovered by P8 — now carries its label, which is
the whole point of the change. P8 adds the brand terms to a *recovery allow*, not to
`brand_families`, so the labelling list is untouched and cannot drift.

---

## What each change did, in rows

| # | change | fixture evidence | measured effect on the real run |
|---|---|---|---|
| **P1** | `water damage restoration service` removed from the rule-2 primary deny | row 027 KEEP (was `off_icp_primary`) | 516 rows in that bucket → **124** survive the name deny + the new rule-4 allow + the review floor. 59 carry an ICP/brand name token, 65 do not. |
| **P2** | `pile driving` added to the rule-4 allow | row 028 KEEP | 42 rows primaried `Pile driving service` were in `not_in_icp`; 28 UK at ≥5 reviews return. |
| **P3** | `property management company` moved rule 1 → rule 2 | row 029 KEEP, row 030 still `off_icp_primary` | 84 hits → 18 stay dropped on primary, 66 go on to the later rules, 19 of them carrying an ICP allow type. `hard_off_icp_type` 190 → ~124. |
| **P4** | `drainage` removed from the rule-4 allow | row 031 now DROPS; rows 022/023 unchanged | −40 kept rows, every one a maintenance/handyman generalist. |
| **P5** | `plasterer` added to the recovery type allow | row 032 RECOVERED | +39 UK rows with an ICP name token and ≥5 reviews. |
| **P6** | `surveyor` added to the recovery type allow | row 033 RECOVERED; rows 034/035 still dropped | 114 surveyor-typed rows with an ICP name token sit in `not_in_icp`; the name gate decides which return. |
| **P7** | new `recover-unrated-uk-config.json` | row 036 RECOVERED-UNRATED; 026/039/040 refused | 417 blank-review rows in `too_small`; 107 UK, ICP-named, with a live website. |
| **P8** | 17 brand families (22 term strings) added to the recovery name allow | row 037 RECOVERED; row 020 still blocked | ~78 brand-named rows stranded in `not_in_icp` whose type the recovery already accepted. |

### P5 — checked against the universe, not assumed

`plastering service` was **not** added, because it is not a Google type. Distinct type strings
containing "plaster" across all 21,898 rows of `leads_clean.csv`:

```
1335  Plasterer
```

That is the whole list. One term covers the population.

### P6 — what the 48 rows actually carry, and why the chartered door stays shut

The brief asked to verify which type strings the damp-survey population carries before making the
recovery admit "exactly that population". Distinct type strings containing "survey" in the universe:

```
618  Surveyor          39  Land surveyor       6  Marine surveyor
156  Property Surveyor  16  Quantity surveyor   3  Land surveying office
```

**`Chartered surveyor` does not exist as a Google type anywhere in this run — 0 rows.** So the main
config's rule-2 primary deny of `chartered surveyor` is inert *as a type deny* on this data; what
actually removes chartered practices is the **rule-3 NAME deny** (`chartered surveyor` /
`quantity surveyor`), which fired on **32 rows**. That deny is untouched by P6 and still stands.

The recovery allow term `surveyor` is a substring test, so it matches `Surveyor` **and**
`Property Surveyor` (which is how *Prokil Chingford* is typed) — the intended population. It cannot
reach a chartered or quantity practice, and the reason is **rule 0, not the type list**: such a row
is dropped by the main pass as `name_deny` or `off_icp_primary`, and rule 0 only admits
`not_in_icp`. Fixture rows 034 (typed `Chartered surveyor`, dropped `off_icp_primary`) and 035
(typed plain `Surveyor` but *named* "Chartered Surveyors", dropped `name_deny`) are both blocked
from both recovery passes. Row 035 is the one that matters, because it is the shape the real data
takes; row 034 is the shape the brief named, and it is kept in the fixture as a belt-and-braces
control.

Population, measured on `excluded_officp.csv`: 188 surveyor-typed rows carry an ICP name token —
114 `not_in_icp` (reachable by this change), 53 `off_icp_primary`, 19 `too_small`, 1 `hard_off_icp_type`,
1 `name_deny` (all four of those unreachable, by design).

### P1 — the precision cost, corrected against the real data

The brief asked what happens to `Rainbow Restoration`, typed `Water damage restoration service`
with no ICP name token, and whether it is acceptable. **The fixture answered it twice, because the
audit's one-line version of this row turned out not to be the shape the data takes.**

- **Row 038** — the row as the brief described it, bare `Water damage restoration service`:
  it **DROPS** `not_in_icp`. The rule-4 allow has no term that matches that type string
  ("damage" is not "damp"), so a pure flood-restoration firm falls out at the allow exactly as a
  pure pest-control firm does. P1 does not admit it at all.
- **Row 041** — the row as it really appears in `excluded_officp.csv`: **every real
  `Rainbow Restoration` listing also carries `Building restoration service`**, so it hits the allow
  and it **KEEPS**. Measured: 18 Rainbow/"Water Damage"-named rows in the bucket, 15 of which carry
  an allow term.

So the honest statement of P1's cost is row 041, not row 038. Of the 124 rows P1 admits, **65 carry
no ICP name token**, and they ride in almost entirely on a secondary `Building restoration service`
or `Waterproofing service` tag (*Weather Wise Solutions*, *Environ Property Services*, *Kenway Ltd*,
*LABS Building Services*, *Darryl C Price*, ~13 *Rainbow Restoration* branches, one listing named
literally *Water Damage*).

**Judgement: acceptable, and stated rather than hidden.** `building restoration service` was already
the weakest allow token in this run — the sole ICP signal on 474 of the 1,357 kept rows — and the
site-text adjudication (`adjudicate/PROMPT.md`) is where a flood-restoration franchise is designed to
fail. P1 adds ~13 branded restoration rows to a load that stage already carries, and buys back all
five Richardson & Starling branches, both Rentokil Property Care branches and ~50 more ICP-named
firms. It would be wrong to claim the cost is zero; it is small, it is concentrated in one
recognisable franchise, and it is visible to the next stage.

## Nothing had to be bent — and the one thing that could not be expressed

Every expectation held as written. One thing genuinely **cannot** be expressed in this engine and is
worked around rather than wished away:

- **`review_count >= 5 OR (review_count blank AND website exists)` is not writable as one rule.**
  `qualify-leads.js` ANDs its rules and has no `or` operator, and adding one would be an engine
  change (forbidden for job tuning). It is expressed instead as a **second pass** whose three rules
  are all ANDed — `recover-unrated-uk-config.json` — merged on `place_id` like the generic recovery.
  The cost of that workaround is that the unrated rows arrive in a separate file and must be appended
  (PIPELINE STEP 3b), not that any row gets the wrong verdict.
- **The unrated rows carry no track marker, and one cannot be added downstream.** PIPELINE STEP 3's
  append snippet writes every appended row through the **main** file's header — that is how it strips
  the trailing `drop_reason` column — so a `track=unrated` column would be discarded on append, and
  widening the main header would change the spine that `footprint-gate.js`, `dedupe-ref.js` and
  `collapse-domains.js` all read. No marker is needed: the pass admits **only** rows whose
  `review_count` is empty, and the first merged list contained none, so in the merged file
  **`review_count == ''` is exactly the unrated track**. That is recorded in the config's
  `_r_track_marker` and in PIPELINE STEP 3b.
