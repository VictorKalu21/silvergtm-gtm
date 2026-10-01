# UK qualify rules — fixture dry run (deterministic, $0, no API)

**What this is.** `skills/google-maps-scrape/IMPROVEMENTS.md` (sharp-shannon, 2026-09-13) records two
silent config bugs that only a fixture catches: a short `deny` substring that eats a whole ICP
(`spa` → "Coworking space"), and `scope:"any"` deleting real targets through a secondary tag
(a bare `atm` deleted 71 real bank branches). Both land in `excluded_officp.csv` under a
plausible-looking `drop_reason` and nothing warns. So the rule set is run against a hand-built
fixture **before** the scrape, not after.

**Commands run** (engine from a private worktree of `origin/claude/bold-fermat-9bpt6j`):

```
node qualify-leads.js --in fixture.csv --config atlas-growth-uk-config.json --out dryrun
node qualify-leads.js --in dryrun/excluded_officp.csv --config recover-generic-uk-config.json --out dryrun/recover
node collapse-domains.js --in fixture.csv --out dryrun/collapse --config atlas-growth-uk-config.json
```

**Result: 26 of 26 rows matched expectation on the first machine run.** No expectation was
relaxed to fit a rule. Two rules *were* rewritten while walking the fixture by hand, before that
run — both recorded at the bottom.

```
QUALIFY -> dryrun      input 26 | KEEP 10 | DROP 16
  {"not_in_icp":4,"hard_off_icp_type":5,"off_icp_primary":5,"name_deny":1,"too_small":1}
RECOVER -> dryrun/recover  input 16 | KEEP 2 | DROP 14
  {"not_a_recovery_candidate":12,"name_not_icp":1,"not_generic_contractor":1}
```

## Row-by-row

| # | Row (name · google_types · reviews) | What it probes | Expected | Actual (main) | Actual (recover) |
|---|---|---|---|---|---|
| 1 | Pennine Damp Proofing Ltd · `Waterproofing service\|Contractor` · 41 | the modal UK ICP firm | KEEP | **KEEP** | — |
| 2 | Northern Underpinning Solutions Ltd · `Construction company\|Foundation` · 27 | allow is `google_types`-ANY, not primary | KEEP | **KEEP** | — |
| 3 | Peter Cox Preston · `Waterproofing service\|Building restoration service` · 63 | roll-up row survives (no chain drop) + brand flag | KEEP, brand `Peter Cox` | **KEEP** | brand flagged ✓ |
| 4 | Rentokil Property Care Glasgow · `Pest control service\|Waterproofing service` · 88 | **the segment-killer probe.** A real brand PRIMARIED as pest control | KEEP, brand `Rentokil Property Care` | **KEEP** | brand flagged ✓ |
| 5 | Ulster Damp & Timber Care Ltd (Belfast) · `Waterproofing service\|Pest control service` · 22 | NI row + pest as a secondary tag | KEEP | **KEEP** | — |
| 6 | Cumbria Damp & Structural Ltd · `Waterproofing service\|Structural engineer` · 13 | deny asymmetry: engineer as a SECONDARY must not drop a real firm | KEEP | **KEEP** | — |
| 7 | Mersey Masonry & Preservation Ltd · `Masonry contractor\|Building materials supplier` · 21 | same, for the supplier deny | KEEP | **KEEP** | — |
| 8 | Cavity Wall Tie Specialists Cardiff · `Masonry contractor\|Building restoration service` · 7 | Wales + low-review real firm clears the floor | KEEP | **KEEP** | — |
| 9 | Glasgow Cellar Tanking Co · `Waterproofing service` · 6 | floor boundary (6 ≥ 5) | KEEP | **KEEP** | — |
| 10 | Timberwise Newcastle · `Waterproofing service\|Pest control service` · 57 | brand flag | KEEP, brand `Timberwise` | **KEEP** | brand flagged ✓ |
| 11 | Hallam Structural Repairs Ltd · `Construction company` · 18 | **the generic-type pair.** General builder with a structural-repairs line | main DROP `not_in_icp` → RECOVER KEEP | **DROP:not_in_icp** | **RECOVERED** |
| 12 | Anchor Mini Piling Ltd · `Concrete contractor` · 11 | same, via the `piling` name token | main DROP `not_in_icp` → RECOVER KEEP | **DROP:not_in_icp** | **RECOVERED** |
| 13 | Dawson & Sons Building Contractors · `Construction company` · 30 | recovery PRECISION: generic type, no ICP name token | DROP both passes | **DROP:not_in_icp** | drop:`name_not_icp` |
| 14 | The Hartley Foundation · `Non-profit organization\|Charity` · 12 | charity answering "foundation repair" | DROP `hard_off_icp_type` | **DROP:hard_off_icp_type** | blocked |
| 15 | Foundation College Manchester · `College\|Educational institution` · 9 | college answering "foundation" | DROP `hard_off_icp_type` | **DROP:hard_off_icp_type** | blocked |
| 16 | Foundation Estate Agents · `Real estate agency` · 34 | estate agent + the "Foundation" name trap | DROP `hard_off_icp_type` | **DROP:hard_off_icp_type** | blocked |
| 17 | St Cuthbert's Parish Church Restoration · `Church\|Building restoration service` · 8 | place of worship carrying an **ICP secondary tag** — must still drop | DROP `hard_off_icp_type` | **DROP:hard_off_icp_type** | blocked |
| 18 | Structural Repairs Autobody Ltd · `Auto body shop\|Car repair and maintenance service` · 52 | collision shop answering "structural repair" | DROP `hard_off_icp_type` | **DROP:hard_off_icp_type** | blocked |
| 19 | Wessex Builders Merchants Ltd · `Building materials supplier\|Hardware store` · 44 | merchant | DROP `off_icp_primary` | **DROP:off_icp_primary** | blocked |
| 20 | Sovereign Chemicals Ltd · `Manufacturer\|Building materials supplier` · 19 | a **brand_families term must not rescue a supplier** (brand is a flag, not a rule) | DROP `off_icp_primary` | **DROP:off_icp_primary** | blocked |
| 21 | Crawford Structural Engineers Ltd · `Structural engineer\|Foundation` · 16 | engineer with an ICP secondary — referral source, not a buyer | DROP `off_icp_primary` | **DROP:off_icp_primary** | blocked |
| 22 | Structural Drainage Solutions Ltd · `Drainage service\|Contractor` · 31 | the drain-firm judgement call (below) | DROP `off_icp_primary`, and NOT recovered | **DROP:off_icp_primary** | blocked |
| 23 | Ribble Plumbing & Heating Ltd · `Plumber\|Drainage service` · 26 | plumber; deny must beat the `drainage` allow (order matters) | DROP `off_icp_primary` | **DROP:off_icp_primary** | blocked |
| 24 | Cleankill Pest Control Ltd · `Pest control service` · 35 | pure pest firm dies at the ALLOW, since no type deny covers pest | DROP `not_in_icp` | **DROP:not_in_icp** | drop:`not_generic_contractor` |
| 25 | Midland Drain Jetting & Lining Ltd · `Contractor\|Repair service` · 29 | name deny firing where the type denies are blind | DROP `name_deny` | **DROP:name_deny** | blocked |
| 26 | Premier Damp Proofing · `Waterproofing service` · 2 | ghost listing | DROP `too_small` | **DROP:too_small** | blocked |

"blocked" = recovery rule 0 (`drop_reason in ["not_in_icp"]`) refused it as a recovery candidate.

`collapse-domains.js` over the same 26 rows flagged exactly 4 brands — Peter Cox, Rentokil Property
Care, Timberwise, Sovereign Chemicals — and **zero** of the 22 independents. That is the check the
operator asked for on the brand terms: no lengthened term false-matched.

## The drain-firm decision (row 22), stated explicitly

`Structural Drainage Solutions Ltd` is **dropped**, and the mechanism matters more than the verdict.
It is not dropped by name: `drain`/`drainage` are NOT name-deny terms, because real damp and
structural firms carry them ("… Damp & Drainage", "… Structural & Drainage"). It is dropped because
its **primary** google_type is `Drainage service`. So the rule reads: *a firm whose primary identity
Google records as drainage is a drainage firm*; a firm that merely carries a drainage tag is not
touched, and is admitted by the allow. Only unambiguous drain-only jargon is name-denied
(`drain jetting`, `drain lining`, `blocked drains`, `cctv drain`, `drain survey`, `drain clearance`).
If Google had primaried this firm `Contractor`, it would have survived to the site-text adjudication —
which is the intended volume-safe behaviour, and where `adjudicate/PROMPT.md` already names
"a drain-lining 'structural repair'" as a **no**.

## The two rules changed while building the fixture (before the first run)

1. **`pest control service` removed from the type deny entirely.** It was originally a primary-type
   deny, copied from the US config. Walking row 4 exposed it as the Lagos bank-branch bug in
   reverse: UK damp-and-timber firms are routinely primaried `Pest control service` (woodworm, dry
   rot), and **Rentokil Property Care branches are exactly that** — the rule would have deleted a
   whole real segment, brand and all. A pure pest-control firm (row 24) is removed for free by the
   positive allow instead, because it carries no ICP type. `plumber` and `drainage service` were
   *kept* as primary denies for the opposite reason: they carry `Drainage service` tags that the
   allow would otherwise readmit, and no damp/underpinning firm is ever primaried `Plumber`.
2. **Recovery rule 0 added: `drop_reason in ["not_in_icp"]`.** Without it the recovery's generic
   type net readmitted row 22 (`Drainage service | Contractor`, name contains "structural") through
   the door the main pass had just shown it out of — and would do the same for any bodyshop or
   charity that carries a secondary `Contractor` tag. The recovery's job is to reverse *one* drop
   reason (the deliberate refusal of generic construction types), not to re-litigate the denies.
   Caveat recorded in the config: pointed at a file with no `drop_reason` column, qualify-leads.js
   skips the rule with a stderr WARN and the pass degrades to type+name.

Also dropped during authoring, for the same substring reason: bare `college`/`academy` from the name
deny (would eat "College Road Builders", "Academy Damp Proofing" — colleges are caught by type
instead), and bare `surveyor` from the type deny ("damp and timber surveyors" is a real UK trading
style; a pure surveying practice dies at the allow anyway).
