# Atlas Growth — ICP: residential in-ground swimming-pool builders (US)

> Opened 2026-10-11. Status: **STEP 1 answered in part (client, qualify, depth); offer + target role PROPOSED, needs sign-off at the read-back gate.** Brief: the operator's GPT-drafted prospect-list prompt (largest possible list of legitimate US builders of new residential in-ground pools; prioritise $30k+ projects; flag Qualified / Review / Exclude with evidence; exclude service-only, retail-only, above-ground retail, commercial-only).

## The offer (PROPOSED — same family as foundation repair and generators, reworded for the trade)

> We help swimming pool builders book 10 qualified in-home pool design consultations that turn into
> construction projects every month using Facebook lead generation.

A performance lead-generation retainer for **residential** in-home appointments. The buyer is
whoever controls **marketing spend and lead flow**. Average job value (web-checked 2026-10-11, not
measured on our data): in-ground fiberglass $45k–$85k installed, gunite/shotcrete $60k–$150k+,
vinyl-liner $35k–$65k — every genuine in-ground builder clears the brief's $30k bar; the bar is
really "builds new in-ground pools" vs "services/sells".

## Footprint

**US, nationwide, warm states first (operator 2026-10-11).** Phase 1 = the 18 warm states
FL TX AZ CA GA NV NC SC TN AL LA MS OK AR NM HI UT VA (362 anchors); phase 2 = the other 32 states
+ DC (224 anchors) with the same generator (`gen-runsheet-pools.js --states all`). `areas` mode,
`--keep-domestic` at the geo gate (the whole country is the footprint; only foreign pins drop).

## Business types

Companies that **design, build and install new residential in-ground swimming pools**: custom
gunite/shotcrete/concrete builders, fiberglass pool installers (incl. manufacturer-dealer branches
that install), vinyl-liner builders, and pool construction companies that sell complete projects —
including those that also offer service, repair, remodel or retail, as long as new construction is a
genuine advertised service.

Google native category: **Swimming pool contractor** (the only one; siblings `Swimming pool supply
store`, `Swimming pool repair service`, `Pool cleaning service`, `Hot tub store` are kept through
qualify and judged at the site-text gate because fiberglass dealers and builder-service hybrids
carry them). Keyword rows: swimming pool builder · inground pool installation · fiberglass pool
installation · gunite pool construction · custom pool builder · pool construction company.

## Qualification, in plain language

**Maps stage (lenient, operator 2026-10-11):** open, US, any pool/spa Google type OR a pool-claiming
name on a generic contractor/landscaper type; **no review floor, no website requirement**. Dropped
at this stage only: the billiards homonym, places to swim (public/hotel/apartment/club pools, swim
schools, water parks), big-box and pool-retail chains (Leslie's, Pinch A Penny, Home Depot …),
civic bodies.

**Site-text stage (STEP 5e, `classify-prompt.md`) — the verdict the brief asks for:**

| verdict | brief bucket | gate |
|---|---|---|
| `inground_builder` — site states new in-ground residential pool construction/installation | **Qualified** | KEEP |
| `builder_unconfirmed` — pool company, construction plausible but not stated (remodel/renovation-led, thin services page) | **Review** | hold |
| `unclear` — no usable site text (blocked, dead, no website) | **Review** | hold; recovery track |
| `service_only` — cleaning / maintenance / repair / leak detection, no new builds | Exclude | drop |
| `retail_only` — supply store, chemicals, equipment, above-ground / hot-tub retail without in-ground installation | Exclude | drop |
| `commercial_only` — commercial / municipal / HOA / waterpark construction, no homeowner offer | Exclude | drop |
| `not_pool` — wrong business, aggregator / lead-gen site, manufacturer with no local installation | Exclude | drop |

Each verdict carries `pool_types` (fiberglass · gunite_concrete · vinyl_liner · other · unknown), a
verbatim `evidence` quote and a one-line `services` summary — the brief's evidence / pool-type /
description fields. A Maps category alone never makes a row Qualified (brief §5).

**Roll-ups and franchises are KEPT and flagged** (`brand_family` + `location_count`): Blue Haven,
Anthony & Sylvan, Premier Pools & Spas, Presidential, Shasta, California Pools, Paddock, Cody Pools,
Riverbend Sandler, Platinum Pools, manufacturer-dealer networks (Leisure Pools, Latham, Thursday
Pools, Imagine Pools), and the service franchises (ASP, Pool Troopers, Pool Scouts, Poolwerx) so a
franchise that builds is kept and one that only services is dropped by its site text, not its name.

## Target role — WHO we are trying to reach (PROPOSED — same buyer as foundation repair)

- **KEEP:** Owner · Co-Owner · President · CEO · Founder · Partner · bare General Manager ·
  Marketing Manager / Director / VP · Operations Manager only at ≤2-location firms.
- **EXCLUDE (trade-specific false positives):** Pool Designer / Design Consultant / Sales Consultant
  (the in-home closer who runs the design consultation being sold) · Estimator · Construction
  Manager · Project Manager · Superintendent · Foreman · Crew lead · Gunite / plaster / tile / coping
  crews · Excavator operator · Pool Technician / Service Tech / Route Tech / Pool Cleaner ·
  Scheduler · Permit Coordinator · Warranty Manager · Office Manager (secondary fallback only) ·
  Dispatcher · CSR · Bookkeeper · Controller · HR.
- Evaluate EXCLUDE before KEEP; a department qualifier is an exclusion (`Construction Manager`,
  `Director of Design` drop; bare `President` keeps).

Owner prompt: `owner-prompts/us-pool-builders.md` (copied into the run folder as `owner-prompt.md`).

## Deliverable fields (brief §4, mapped to where each comes from)

company name · website · Google Maps URL (`place_link`) · phone · email (on-site harvest,
`fetch-sites.js` raw-HTML rungs) · full address · city · state · ZIP · rating · review count ·
business category (primary `google_types`) · all Google types · services summary · build evidence
(verbatim quote + source page) · pool type(s) · Facebook URL (`socials.facebook` from
`fetch-sites.js`) · verdict Qualified/Review/Exclude + reason · discovery query (`icp_type`) ·
discovery state (shard run) · `brand_family` / `location_count` · `place_id`. Unknown stays blank.

## Open decisions (answer at the read-back gate)

1. Offer line and target role above — sign off or change.
2. Query set: `core` (category + 3 keyword rows, 1,448 rows ≈ 3.3k calls) or `full` (category + 6 keyword rows, 2,534 rows ≈ 5.8k calls) for the warm states.
3. Cross-run dedupe: prior Atlas shipped feeds are not on this container (data is gitignored). Waive as on the last three runs, or supply the tarball.
4. Owner-finding SERP backend: DataForSEO is reachable but has no credential here and no engine backend exists on any branch — scope credits + approve the engine change, or run the free rungs only (in-session read + BBB registry + WebSearch sweep).
