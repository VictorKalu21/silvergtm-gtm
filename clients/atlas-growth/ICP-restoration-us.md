# Atlas Growth — ICP: US residential water / mold / fire restoration contractors

> Opened 2026-10-11 from the `ICP-damp-mould.md` scoping (US side: mold remediation + water damage
> restoration). Status: **STEP 1 answered 2026-10-11 by the operator — client atlas-growth, ALL 506
> metros, review floor 0.** Offer + target role below AGREED 2026-10-11 (operator: "offer and role approved, keep
> franchises, run owner finding"); franchise branches KEPT and flagged; testing-only rows stay out. Source: `remediational.com` directory
> (library profile `remediational-directory--us-restoration-contractors.md`), $0, 29,837 rows.

## The offer (AGREED 2026-10-11 — reworded from `ICP.md` for the trade)

> We help restoration companies book 10 qualified mold and water damage inspection appointments that
> turn into remediation projects every month using Facebook lead generation.

A performance lead-generation retainer for **residential** in-home inspection appointments (the
"first visit" in `ICP-damp-mould.md`: a mold / moisture inspection). The buyer is whoever controls
**marketing spend and lead flow**. Job value (web-checked in the scoping doc, not measured here):
$1.5k–$6k mold remediation; $3k–$15k water damage / waterproofing; fire jobs larger and
insurance-led.

## Footprint

**US, nationwide — all 506 metros in the directory, 51 states incl. DC (operator 2026-10-11).**
No tiles: the source is a directory import, so the engine's hub-distance geo gate does not apply;
every row carries a US state and ZIP from the source.

## Business types

Companies that **perform** water damage restoration, mold remediation, fire/smoke restoration,
sewage/biohazard cleanup or storm damage repair for **homeowners** — independents and franchise
branches alike. Directory service tags (12): water · mold · testing · fire · sewage · biohazard ·
hoarding · asbestos · lead · storm · odor · contents.

## Qualification, in plain language

**Directory stage (lenient, operator 2026-10-11 — review floor 0, no website rule):** keep every
row carrying at least one *remediation* tag (water, mold, fire, sewage, biohazard, storm, hoarding,
odor, contents). Dropped here only: rows tagged **testing / asbestos / lead only** (home inspectors,
assessment-only licensees, abatement-only firms — `not_in_icp`, re-admittable at $0) and names that
are never a buyer (home inspection, public adjusters, engineering practices, laboratories,
consultancies, training, suppliers, civic bodies, insurers, realty).

**Site-text stage (STEP 5e, `classify-prompt.md`) — the residential verdict the operator asked for:**

| verdict | bucket | gate |
|---|---|---|
| `residential_restoration` — site states it restores / remediates **homes** (homeowners, residential, houses, basements, "your home") for water, mold, fire, sewage or storm damage | **Qualified** | KEEP |
| `restoration_unconfirmed` — a restoration/remediation firm whose text never says who it serves, or a thin page | **Review** | hold |
| `unclear` — no usable site text (blocked, dead, no website) | **Review** | hold; recovery track |
| `commercial_only` — commercial / industrial / institutional / insurance-carrier work only, no homeowner offer | Exclude | drop |
| `inspection_only` — mold inspection / testing / assessment / home inspection with no remediation service | Exclude | drop |
| `cleaning_only` — carpet, upholstery, janitorial, duct cleaning with no restoration service stated | Exclude | drop |
| `adjacent_trade` — roofing, plumbing, general contractor, remodeler, painter whose text never claims restoration / remediation work | Exclude | drop |
| `not_restoration` — public adjuster, lab, supplier, engineer, consultant, franchisor HQ, aggregator / lead-gen site | Exclude | drop |

Each verdict carries `services_offered` (from the text), `insurance_work` (mentions insurance
claims / adjusters / direct billing), a verbatim `evidence` quote and a one-line `services` summary.

**Roll-ups and franchises are KEPT and flagged** (`brand_family` + `location_count`), the standing
Atlas directive: SERVPRO, ServiceMaster, Paul Davis, PuroClean, 911 Restoration, Rainbow, BELFOR,
ATI, BluSky, DryMedic, Restoration 1, AdvantaClean, 1-800 Water Damage, Steamatic, First Onsite,
Stanley Steemer, Chem-Dry, United Water Restoration, Rytech, All Dry, Bio-One, Aftermath, COIT,
Duraclean, Roto-Rooter, Mold Busters. A branch site is classified on the brand site (fanned from
the domain representative); the brand flag is where the operator decides to work or skip them.

## Target role — WHO we are trying to reach (AGREED 2026-10-11 — same buyer as foundation repair)

- **KEEP:** Owner · Co-Owner · President · CEO · Founder · Partner · Principal · bare General
  Manager · Marketing Manager / Director / VP of Marketing · Operations Manager only at ≤2-location
  firms · franchise Owner/Operator of a branch.
- **EXCLUDE (trade-specific false positives):** **Marketing Representative / Marketing Rep / Business
  Development Rep / Account Manager** (in restoration this is the route-sales person who visits
  plumbers, adjusters and property managers — they consume leads, they do not buy them) ·
  Estimator · Project Manager · Mitigation Manager · Reconstruction Manager · Production Manager ·
  Crew Chief · Lead Technician · Water / Mold / Fire Technician · IICRC-certified tech lines ·
  Contents Manager · Office Manager (secondary fallback only) · Dispatcher · CSR · Bookkeeper ·
  Controller · HR · Safety Manager · Insurance adjusters quoted on the site.
- Evaluate EXCLUDE before KEEP; a department qualifier is an exclusion (`Mitigation Manager`,
  `Director of Operations` at a multi-branch firm drop; bare `President` keeps).

Owner prompt: `owner-prompts/us-restoration-contractors.md` (copied into the run folder as `owner-prompt.md`).

## Deliverable fields

company name · website · Google Maps URL (`place_link`, from the directory's CID) · phone · email
(on-site harvest) · street · city · state · ZIP · rating · review count · % five-star · services
(directory tags + site text) · residential verdict + evidence · insurance_work · `brand_family` /
`location_count` · owner name + title + evidence · discovery metro · `place_id` (`cid:<Google CID>`).

## Open decisions (answer at the read-back gate)

1. ~~Offer line and target role~~ — AGREED 2026-10-11.
2. ~~Franchise branches~~ — KEEP + flag (operator 2026-10-11).
3. Testing/asbestos/lead-only rows (2,631) — stay out (not raised at the read-back; re-admittable at $0).
4. Cross-run dedupe — prior shipped feeds are not on this container (same as the pool run); waive or supply.
5. Owner-finding SERP backend — DataForSEO credentials are in the skill `.env` only if the operator placed them this session; otherwise read + BBB rung only.
