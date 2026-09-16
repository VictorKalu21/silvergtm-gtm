# Atlas Growth — ICP addendum: **UK** foundation repair / structural + damp remediation

A UK addendum to `clients/atlas-growth/ICP.md`. Everything in the parent doc still holds unless
contradicted here. The offer is unchanged.

> We help foundation repair companies book 10 qualified foundation inspection appointments that turn
> into repair projects every month using Facebook lead generation.

## What this trade actually is in the UK

"Foundation repair" is an American label. It barely exists here, and a UK list built on that phrase
alone would be a rounding error. From the validated source profile
(`skills/icp-source-planner/library/google-maps--uk-foundation-repair.md`, 2026-09-16), the real
universe self-labels as:

| self-label | share of the UK ICP |
|---|---|
| damp-proofing / structural waterproofing | ~60% |
| general builders with a structural-repairs line | ~17% |
| underpinning & piling | ~8% |
| structural repair specialists | ~8% |

**Damp-proofing and structural-waterproofing firms are IN scope** (operator ruling). They are the
majority of the market, they sell the same remedial survey-led job to the same homeowner, and they
get tagged downstream by `service_bucket`, not filtered out at the Maps stage.

## Footprint

The **whole UK — England, Scotland, Wales and Northern Ireland** — metro-anchored, not exhaustively
tiled. **150 town anchors + 27 densification tiles = 177 tiles**, zoom 13, single pass.

| nation | anchors | densify | tiles |
|---|---|---|---|
| England | 106 | 24 | 130 |
| Scotland | 22 | 3 | 25 |
| Wales | 13 | 0 | 13 |
| Northern Ireland | 9 | 0 | 9 |

Coverage aim: every town above ~60–70k plus the regional centres, so that no populated area sits
more than ~25 km from a tile. Known, accepted gaps: the Scottish islands, the far north-west
Highlands and the Welsh interior — no anchor set fixes those without spending on empty viewports;
Wick, Fort William, Oban, Montrose, Aberystwyth and Newtown are the compromise tiles that bound them.

Config: `geo.footprint.mode: "areas"`, `geo.country: "gb"`, `geo.region_from_city: null`,
`geo.region_default: "UK"`. Null region because the UK has no state token to parse out of `city` —
so `footprint-gate.js` runs its hub-distance and foreign-country checks and never a region check.
`region_default: "UK"` is load-bearing: it deletes `united kingdom / uk / england / scotland / wales`
from the gate's foreign-country blocklist. Republic-of-Ireland pins still drop on `ireland`, which is
what we want; Northern Irish addresses are never affected.

**The bleed to expect.** The 2026-09-16 export showed **US service-area pins arriving in a UK pull**
carrying UK region tags. `country=gb` is a hint, not a filter (measured elsewhere: a `country=ng`
scrape came back ~10% US). The footprint gate is doing primary work here, not cleanup — never ship
this list without it.

## The 10 queries

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

P2 is where the volume is, not P1 — the inverse of the US run, and a direct consequence of the
60% damp-proofing share above. `foundation repair` is kept despite being a weak UK label: one query
is cheap and it is the phrase the client's existing creative is built on.

**One wording change from the brief:** `underpinning contractor` → **`underpinning`**. "Contractor"
is a US-idiom suffix that UK firms rarely carry in their trading name or Google category, and Maps
text-matches the query, so the suffix could only narrow the result set. Easy to revert.

## Qualification, in plain language

The Maps stage here is deliberately **volume-safe, not precise**. It never drops a plausible trade
firm; the real ICP judgement is the downstream site-text adjudication (`adjudicate/PROMPT.md`), which
reads what the business actually says it does. Rules run in order and the first failure is the
recorded `drop_reason` — denies first, then the positive allow, then the floor.

**Changed 2026-09-16 by operator decision at GATE 3 ("Apply all", proposals P1–P8 of
`REPORT2-GATE3.md`).** The rule list below is the post-GATE-3 state; every change is marked, and all
of them were re-validated on a 41-row fixture (`dryrun2-results.md`, 41/41 matched).

1. **Hard entity deny (any tag).** Charities and non-profits, colleges and universities, schools,
   hospitals and hospices, places of worship, funeral homes and cemeteries, estate and letting
   agents, law and insurance offices, car bodyshops and dealers. These are the things our own
   queries drag in: "foundation repair" surfaces charitable Foundations and Foundation Colleges;
   "structural repair" surfaces accident-repair bodyshops. This is the only rule allowed to look at
   a *secondary* Google tag, because none of these can ever be one on a real contractor.
   **P3 (2026-09-16): `property management company` left this rule** and moved to rule 2. It failed
   the rule's own test — of its 84 hits only 18 were primary, 66 were a secondary tag and 19 of those
   carried an ICP allow type, so it was deleting real firms (Heightvale Ltd, 67 reviews; Henderson
   Wood, 72; Master Builder Services, 56) exactly the way a bare `atm` deleted 71 bank branches on
   the sharp-shannon run.
2. **Primary-identity deny.** Structural and civil engineers, chartered and quantity surveyors,
   building inspectors, builders merchants and product manufacturers, tool and plant hire,
   plumbers, drainage firms, removals, architects and kitchen/bathroom fitters — dropped **only
   when that is their primary Google category**. A real damp firm carrying "Structural engineer" or
   "Building materials supplier" as a second tag survives untouched.
   **P1 (2026-09-16): `water damage restoration service` was REMOVED from this deny.** It was the
   pest-control mistake one line lower down the same list — the UK damp trade self-labels this way
   and Google primaries it accordingly, so the rule was deleting 516 rows including all five
   Richardson & Starling branches and both Rentokil Property Care branches, two of the brand families
   the operator said to keep and flag. `fire damage restoration service` still stands. **P3: gained
   `property management company`** (primary-only), which keeps the 18 true property managers dropped
   and returns the 66 that merely carry the tag.
3. **Name deny.** The exact-match fallback for what the type denies cannot see: NHS and charitable
   trusts, councils, churches and mosques by name, accident/crash repair, the named builders
   merchants (Travis Perkins, Jewson, Wickes, Screwfix…), ready-mix and quarry, chartered/quantity
   surveyor practices, unambiguous drain-only jargon, plumbing-and-heating, and pest-only terms
   (exterminator, wasp nest, vermin).
4. **Positive allow (any tag).** A row must carry at least one of: foundation · waterproofing ·
   damp · basement · cellar · tanking · structural · piling · **pile driving** · underpinning ·
   masonry · stonemason · building restoration · preservation · remedial.
   **P2 (2026-09-16): `pile driving` added** — Google's category is "Pile driving service", which
   does not contain "piling", so 42 piling firms were dying here on a pure type-stem gap.
   **P4: `drainage` removed** — 40 kept rows were handyman generalists whose only ICP signal was a
   secondary drainage tag, and drainage-PRIMARY firms are already denied by rule 2, so the term only
   ever admitted noise.
5. **Review floor 5**, labelled `too_small`. **P7 (2026-09-16):** a blank `review_count` fails this
   floor exactly as a 0 does, which was deleting unrated listings by accident; they are now taken
   back by a second recovery pass (see the deliberate calls below).

### The deliberate calls

- **Review floor 5 is a ghost-listing filter, not a size gate.** The US run sits at 30. That number
  is wrong here: this trade in the UK is 3-to-10-person owner-operated damp and underpinning firms
  with single-digit review counts, and the validated 2026-09-16 UK list was mostly under 30. Five
  removes unclaimed, zero-activity duplicate pins and nothing else. It is also cheap to revisit —
  re-running qualify at 0 over `excluded_officp.csv` costs nothing.
- **Generic construction types are refused here and recovered by name.** `Construction company`,
  `Contractor`, `Builder`, `Concrete contractor` are ~17% real ICP and ~83% everything else, so
  admitting them floods the list. `recover-generic-uk-config.json` takes them back when the **name**
  carries an ICP token (damp, underpin, subsidence, structural, waterproof, tanking, piling,
  preservation, remedial, foundation, basement, cellar, wall tie, crack…). That pass only reverses
  the `not_in_icp` drop — it can never resurrect something a deny removed. **2026-09-16 it gained
  three things:** the types `plasterer` (P5 — UK damp-proofing is very often primaried Plasterer,
  and re-plastering is the second half of a damp job) and `surveyor` (P6, below), and **the 17 brand
  family names as name tokens** (P8 — Protectahome, Prokil, Timberwise and the rest were stranded in
  `not_in_icp` because a brand name carries no ICP vocabulary, which contradicted the standing
  keep-and-flag directive).
- **Damp-survey practices are IN — operator decision, 2026-09-16 (P6).** Until GATE 3 a firm whose
  Google type was `Surveyor` was dropped at the allow. That was deliberate, not a bug: GATE 1 §4 left
  bare `surveyor` out of the deny and expected these to die at the allow, on the reasoning that a
  surveying practice is a referral source rather than a buyer. The GATE 3 audit showed the bucket
  contains real trading damp firms — **Damp Surveys Ltd** (133 reviews), **Independent Damp & Mould
  Surveys** (36), **Dampworks** (34), **Kenwood Damp London** (a named brand family), **Damp &
  Timberguard** — and the operator decided to take them. `surveyor` is therefore a **recovery type**,
  not a main-pass allow: a surveyor-typed row comes back **only** when its NAME already carries an
  ICP token, so a general practice with no damp vocabulary still never qualifies. Chartered and
  quantity surveying practices remain OUT and are unaffected: they are removed by the rule-3 NAME
  deny and the rule-2 primary deny, which give a `drop_reason` the recovery's scope gate refuses.
  (Checked against the universe: `Chartered surveyor` is not a Google type on any of the 21,898
  rows — the name deny is what actually removes those practices, and it fired on 32.)
- **Unrated listings are a track, not junk (P7, 2026-09-16).** A blank `review_count` fails
  `>= 5` exactly as a 0 does, so every listing with no review data died as `too_small` — 417 rows,
  107 of them UK, ICP-named and carrying a live website (*Specialist Structural Waterproofing Ltd*,
  *Octopus Waterproofing Ltd*, *GO5 LTD*, *National Waterproofing Group*). These are new or
  unreviewed listings, not ghosts. `recover-unrated-uk-config.json` takes back exactly the rows that
  are unrated AND have a website; the 1–4 band stays dropped, because that band **is** the ghost
  filter and the audit confirmed it is working. In the merged list the unrated track is identifiable
  by `review_count == ''`.
- **No chain drop, ever.** Roll-ups and franchises are kept and flagged (`brand_family` +
  `location_count`). Operator directive, carried over from the US run.
- **No government deny.** The engine's standing gov deny is for distress/institutional-intent
  verticals ("IRS tax help"). None of these 10 queries carries that intent. The UK institutional
  risk that *does* exist — a charity or NHS trust named "<X> Foundation", a council office answering
  "structural repair" — is already covered by rule 1's charity/college/hospital deny and rule 3's
  council/NHS name terms. Recorded as a visible decision, not an omission.
- **Pest control is not denied by type.** UK damp-and-timber firms are routinely primaried
  `Pest control service` (woodworm, dry rot) — Rentokil Property Care branches are exactly that.
  Denying it would delete a real segment. Pure pest firms fall out at the allow instead.
- **No `website exists` rule.** `collapse-domains.js` classifies website as site / shared_host /
  none after the geo gate, and the no-website rows are a recovery track (STEP 5d), not junk — a
  large share of real UK owner-operated damp firms have no site of their own.

## Brand families (flag, never drop)

Peter Cox · Rentokil Property Care · Timberwise · Kenwood Damp Proofing · Prokil · DampMaster ·
Preservation Treatments · Mainmark · Geobear / Uretek · Abbey Pynford · Protectahome ·
Wise Property Care · Sovereign Chemicals · Richardson & Starling · Brick-Tie · Twistfix ·
Safeguard Europe.

Matching is a lowercase substring test against `<name> <root_domain>`, so four terms were
**lengthened** to stop them labelling independents: `abbey` → `abbey pynford`, `sovereign` →
`sovereign chemicals`, `safeguard` → `safeguard europe`, `kenwood` → `kenwood damp`. Two were
**dropped entirely — Helifix and Permagard**: both are manufacturers whose names appear inside
independents' Maps names as an accreditation ("Helifix approved installer", "Permagard approved
contractor"), so the substring test would relabel dozens of independents as the brand. Per the US
config's own standing note, a wrong brand label is worse than none. `brick tie` (spaced) and
`woodrot` are excluded for the same reason; only the company spellings are matched.

## Target role — the UK title mapping

The offer and the buyer are unchanged; only the titles differ. Source:
`clients/atlas-growth/owner-prompts/foundation-repair-roles.md`, which already carries UK notes.

### KEEP — can say yes to a Facebook lead-gen retainer

| UK title | maps to the US bucket | why |
|---|---|---|
| **Managing Director (MD)** | Owner / President | The UK equivalent of the President/CEO. At an owner-operated firm the MD *is* the marketing budget. |
| **Director · Company Director** | Owner / Partner | The Companies House title. A named director of a 5-person damp firm is the buyer. |
| **Owner · Proprietor · Sole Trader · Founder** | Owner | Straight across. Sole traders are common in this trade and the business name is often the person's name. |
| **Partner** | Partner | Straight across. |
| **General Manager · Operations Director** | GM | A P&L holder at an independent or a small branch network. Deliberately kept. |
| **Marketing Manager · Marketing Director · Head of Marketing** | Marketing | The buyer, or the champion who takes it to the MD, at a mid-size firm. |
| **Sales Director · Commercial Director · Business Development Manager** | Sales manager | UK-specific: at this size these are board-level revenue owners, not the in-home closer the US doc excludes. Keep, but rank below MD/Director. |

### EXCLUDE — cannot authorise, and will be mistaken for the buyer

Estimator · **Surveyor · Damp Surveyor · Building Surveyor · Quantity Surveyor** · Inspector ·
Structural Engineer (unless also a director) · **Site Manager** · **Contracts Manager** ·
Project Manager · Production Manager · Contracts Supervisor · Foreman · Site Foreman · Technician ·
Damp Technician · Installer · Operative · Labourer · Apprentice · Scheduler · Dispatcher ·
Office Manager · Receptionist · Bookkeeper · Accounts · HR · Health & Safety Manager ·
any "<Department> Manager" other than General or Marketing · any "Director of <X>" other than
Marketing, Sales, Commercial or Operations.

**Three decisions made here, since the roles doc is ambiguous on them:**

- **Surveyor and quantity surveyor: EXCLUDE.** Unambiguous in the roles doc ("Also excluded here as
  non-decision-makers: surveyor, quantity surveyor, site manager, structural engineer (unless also a
  director)"). This is the UK twin of the US `Estimator` trap: the offer sells *inspection
  appointments*, and in a UK damp firm the person who performs the inspection is titled **surveyor**.
  It is the single highest-risk false positive on this list.
  **This is a PERSON-level rule and P6 does not touch it (2026-09-16).** The operator's GATE 3
  decision admits damp-survey *practices* as target COMPANIES; it says nothing about who to contact
  inside one. At *Damp Surveys Ltd* the target is still the **Managing Director or a named
  Director**, and the surveyor who does the inspections is still excluded. The two rules are about
  different things — which firms get worked, and who gets named — and they stay independent.
- **Site manager: EXCLUDE.** Same line of the roles doc. Runs the job, holds no marketing budget.
- **Contracts manager: EXCLUDE as a target; keep only as a last-resort reachable contact**, the tier
  the roles doc reserves for `office_manager`. The roles doc lists "contracts manager" under its UK
  `gm` bucket, but that bucket was written for dealer/branch networks where a branch GM controls
  local lead spend. In a UK damp/underpinning firm a contracts manager schedules and runs jobs —
  and the parent ICP's own rule ("a department qualifier is an exclusion") points the same way.
  A contracts manager is never output in preference to a director.

**The two rules that make this work are unchanged:** evaluate EXCLUDE before KEEP, and a department
qualifier demotes a title.

## Owner-finding note specific to the UK

Do not start with the website. Measured on the 2026-09-16 UK run: own-site text names someone on
only ~4% of UK ICP sites (16% in the US). **Companies House is the registry** — directors named for
64% of the list at $0 via `companies-house.js`, plus a looser exact-title pass on the residue, then a
LinkedIn-restricted search sweep (+30% of what is left). Combined: 79% named. Reject any
low-confidence Companies House match whose registered title shares no distinctive token with the
business name — that check caught four wrong owners on the last run.

`site_l2_keywords` in the config adds the UK contact-page paths (`contact`, `contact-us`,
`get-in-touch`, `enquiries`, `enquiry`, `request-a-survey`, `free-survey`) because the operator wants
on-site emails harvested: the mailbox on a UK trade site lives on the contact page, not the about
page. Last run that harvest added an email for 211 companies that had none.
