# Atlas Growth — ICP: residential home addition contractors (US)

> Opened 2026-10-11. Status: **PROPOSED — Phase 1 gate (icp-source-planner).** Client assumed Atlas Growth
> (every prior residential home-services vertical in this repo is theirs: foundation repair, generators, pools);
> confirm at the gate. Brief in the operator's words: "scrape residential home addition contractors in the US".

## The offer (PROPOSED — same family as foundation repair / generators / pools, reworded for the trade)

> We help home addition contractors book 10 qualified in-home design consultations that turn into
> addition projects every month using Facebook lead generation.

A performance lead-generation retainer for **residential** in-home appointments. The buyer is whoever
controls **marketing spend and lead flow**. Job values (web-checked 2026-10-11, not measured on our data):
a room addition runs roughly $80k–$200k+, a second-storey addition $150k–$400k+, a garage conversion or
ADU $60k–$250k. Every genuine addition builder clears a high-ticket bar; the real gate is "builds
additions for homeowners" vs "handyman / replacement / new-construction-only / commercial".

## Footprint

**US, nationwide, warm states first (PROPOSED — the pools precedent).** Phase 1 = the 18 warm states
FL TX AZ CA GA NV NC SC TN AL LA MS OK AR NM HI UT VA (362 anchors from `gen-runsheet-pools.js`'s
GeoNames-derived anchor table); phase 2 = the other 32 states + DC (224 anchors). `areas` mode,
`--keep-domestic` at the geo gate. Open decision 1 below.

## Business types

Companies that **design and build additions to existing single-family homes**: room / bump-out
additions, second-storey additions, garage additions and conversions, in-law suites / ADUs attached or
detached, sunroom and four-season-room builders that do the structural work, and design-build
remodelers whose services page lists additions as a real offer. A firm that also does kitchens, baths,
whole-home remodels or custom homes still counts when additions are a genuine advertised service.

Google native categories (from `google-maps-scrape/references/google-maps-categories.md`, 2026-10-07 list;
there is **no "Home addition contractor" category** — the trade hides under generic labels):
**Remodeler** (P1) · **General contractor** (P1, very large and noisy) · Construction company · Custom
home builder · Home builder · Sunroom contractor · Contractor (P2). Siblings `Kitchen remodeler` /
`Bathroom remodeler` are kept through qualify and judged at the site-text gate (many are design-build
firms that also build additions). Keyword rows: home addition contractor · room addition contractor ·
second story addition · home additions · design build remodeling · garage conversion · ADU builder.

## Qualification, in plain language

**Maps stage (PROPOSED lenient, as pools):** open, US, any of the categories above OR an addition /
remodel-claiming name on another type; no review floor, no website rule. Dropped at this stage only:
replacement-only trades by type (roofing, siding, window, gutter, flooring, painting, fence, paving,
landscaping, HVAC, plumbing, electrical), handyman services, property management, real-estate, big-box
and franchise retail, civic bodies, and the "contractor" homonyms (asphalt, utility, telecom).

**Site-text stage (STEP 5e) — the verdict the deliverable carries:**

| verdict | bucket | gate |
|---|---|---|
| `addition_builder` — site states that THIS company builds home additions / second storeys / garage conversions / ADUs for homeowners | **Qualified** | KEEP |
| `remodeler_unconfirmed` — residential remodeler or design-build firm, additions plausible but not stated (kitchen/bath/whole-home led, thin services page) | **Review** | hold |
| `unclear` — no usable site text | **Review** | recovery track |
| `replacement_only` — windows / roofing / siding / gutters / bath-wrap, no structural work | Exclude | drop |
| `new_construction_only` — custom or production home builder with no remodel / addition offer | Exclude | drop |
| `commercial_only` — commercial / multifamily / tenant-improvement GC, no homeowner offer | Exclude | drop |
| `handyman_or_trade` — handyman, single-trade sub (framing, drywall, concrete), no additions | Exclude | drop |
| `not_contractor` — aggregator / lead-gen / franchise HQ / supplier / designer-architect-only | Exclude | drop |

Each verdict carries `addition_types` (room · second_storey · garage_adu · sunroom · other · unknown), a
verbatim `evidence` quote and a one-line `services` summary. A Maps category alone never makes a row
Qualified.

**Roll-ups and franchises are KEPT and flagged** (`brand_family` + `location_count`): Case Design/
Remodeling, DreamMaker Bath & Kitchen, Re-Bath, HomeWorks, Mr. Handyman (service — drops on text),
Power Home Remodeling (replacement — drops on text), Great Day Improvements / Patio Enclosures, Four
Seasons Sunrooms dealers, Champion, Alure, Harrell Remodeling; the site text decides, never the name.

## Target role — WHO we are trying to reach (PROPOSED — same buyer as the sibling verticals)

- **KEEP:** Owner · Co-Owner · President · CEO · Founder · Partner · bare General Manager ·
  Marketing Manager / Director / VP · Operations Manager only at ≤2-location firms.
- **EXCLUDE (trade-specific false positives):** Design Consultant / Designer / Architect / Sales
  Consultant (the in-home closer who runs the consultation being sold) · Estimator · Project Manager ·
  Production Manager · Superintendent · Site Supervisor · Foreman · Lead Carpenter · Crew · Office
  Manager (secondary fallback only) · Scheduler · Permit Coordinator · Bookkeeper · Controller · HR.
- Evaluate EXCLUDE before KEEP; a department qualifier is an exclusion (`Director of Design`,
  `Production Manager` drop; bare `President` keeps).

Owner prompt: to be built from `owner-prompts/us-pool-builders.md` at STEP 6a (same scaffold).

## Required output fields (ICP contract)

| Field | Priority | Source |
|---|---|---|
| company name | must | Maps / QR / permits |
| domain | must | Maps website → `name-to-domain` for the rest (R4) |
| city · state · ZIP · full address | must | Maps / registries |
| phone | must | Maps / QR / permits |
| verdict + evidence quote + addition types | must | site-text gate |
| decision-maker name + title | must | owner read → BBB rung → sweep; QR `leadership` field is a free head start |
| email (verified) | must | on-site harvest → waterfall → MV/BB on an explicit go |
| rating · review count · Google types · Maps URL | nice | Maps |
| revenue · jobs · employees · segment | nice | QR Top 500 only |
| permit count (last 24 months) | nice | open permit feeds (proof-of-work rank) |
| brand_family / location_count | nice | config |

**Dedupe universe:** Atlas prior runs (foundation repair US, generators, pools). A different trade, so
overlap should be near zero; cross-run dedupe was WAIVED on the last two runs (prior shipped feeds not on
this container). Open decision 5.

## Open decisions (answer at the Phase 1 gate)

1. **Client** — Atlas Growth assumed. Confirm, or name the client.
2. **Footprint** — nationwide warm-states-first (pools precedent), or a named state list.
3. **Strictness** — lenient Maps stage + site-text verdict (pools), or a review floor (foundation repair used 30–50).
4. **Scope edges** — are kitchen/bath-only remodelers and ADU-only builders in or out? Sunroom-only firms?
5. **Dedupe** — waive again, or supply the prior shipped feeds.
6. **Sources** — which of the ranked candidates in `2026-10-11_us-home-additions/source-candidates.md` to deep-dive (recommendation there).
7. **Offer line + target role** — sign off the PROPOSED wording above.
