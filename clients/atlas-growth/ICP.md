# Atlas Growth — ICP: residential foundation repair contractors

## The offer (verbatim — this is what makes a role a decision-maker)

> We help foundation repair companies book 10 qualified foundation inspection appointments that turn
> into repair projects every month using Facebook lead generation.

A performance lead-generation retainer. The buyer is whoever controls **marketing spend and lead
flow** — not whoever runs the crews, and not whoever performs the inspection being sold.

## Footprint

10 states: **TX · KS · MO · OK · LA · MS · CO · GA · AL · AR** — 105 metro anchors.
Plus 3 **border metros** that work the footprint from outside it: **Memphis TN · Chattanooga TN ·
Jacksonville FL** (kept only within ~1.0° of those three tiles; all other TN/FL pins drop).

## Business types

Primary intent: foundation repair · foundation contractor · foundation repair company.
Adjacent self-labeling (same businesses, different category words): basement waterproofing · crawl
space repair · crawl space encapsulation · concrete leveling · mudjacking · house leveling ·
structural repair.

Matched post-scrape against the Google Business Profile categories that actually carry this trade:
**Foundation · Waterproofing service · Basement waterproofing service** — and *conditionally*
**Concrete contractor**, which is the trap: most concrete contractors do driveways and flatwork, so
it is admitted only when the business name also claims foundation/leveling work.

## Qualification, in plain language

**Kept:** businesses whose Google categories place them in foundation / waterproofing / crawl space /
concrete-leveling / piering / drainage work, open, inside the footprint, with **50+ reviews**.
Generic "Contractor" or "Concrete contractor" listings are recovered when the name says foundation.

**Dropped, and why:** collision shops (they answer "structural repair" — in the auto trade that
means frame work) · charitable foundations (they answer "foundation") · restoration and pest
franchises (they answer the waterproofing and crawl-space queries) · suppliers, ready-mix plants and
big-box stores · structural engineers and home inspectors (referral sources, not buyers of this
offer) · movers (they answer "house leveling") · plumbers · sub-50-review one-truck operators.

**Roll-ups and franchises are KEPT and flagged**, not dropped — client directive. Each row carries
`brand_family` (Groundworks and its regional operating brands, Olshan, Ram Jack, Anchorpoint,
Perma-Pier, Du-West, Abry Brothers) and `location_count` (how many branches share the domain inside
this footprint). Work them or skip them as a segment.

## Target role — WHO we are trying to reach

> **Status: PROPOSED at GATE 1. Written here so it is never left implicit** (SKILL STEP 1 item 8 —
> a non-technical operator cannot infer it later).

### KEEP — can say yes to a lead-gen retainer

| Role | Why they can authorize |
|---|---|
| Owner · Co-Owner · Proprietor | At an independent, the owner *is* the marketing budget. |
| President · CEO · Founder · Partner | Same, at a larger independent. |
| **General Manager** (bare) | A P&L holder at an independent. Deliberately kept — the obvious industry title filters reject every "Manager" and lose exactly this person. |
| **Marketing Manager · Director of Marketing · VP Marketing** | At a mid-size firm this is the buyer for a Facebook lead-gen program, or the champion who brings it to the owner. Deliberately kept for the same reason. |
| Operations Manager — **only** at ≤2-location firms | There they are the de-facto GM. At a larger firm they run crews, not spend. |

### EXCLUDE — cannot authorize, and will be mistaken for the buyer

| Role | Why it is out |
|---|---|
| **Estimator · Inspector** | **The highest-risk false positives in this vertical.** The offer literally sells "inspection appointments", so the word *inspection* is all over the source text. These are field roles paid to perform the visit, not buy the leads. |
| Foreman · Crew lead · Installer · Foundation repair technician · Field supervisor | The trade's own field staff. |
| Project Manager · Production Manager · Service Manager | Deliver work already sold. |
| Sales Consultant · Design Specialist · Sales Manager | In this trade these titles belong to the in-home closer who runs the appointment. They consume the leads; they do not buy them. |
| Structural Engineer | A referral partner, and often a separate firm entirely. |
| Office Manager · Receptionist · Dispatcher · CSR · Scheduler | Book the calendar, hold no budget. |
| Bookkeeper · Controller · HR | No marketing authority. |
| Any `<Department> Manager` other than General or Marketing | A department qualifier demotes the title. |
| Any `Director of <X>` other than Marketing | Same. |

### The two rules that make this work

1. **Evaluate EXCLUDE before KEEP.** Otherwise "Partner Intelligence Manager" reads as a Partner,
   "VP of Operations" reads as a VP, and "Assistant to the Owner" reads as the Owner.
2. **A department qualifier is an exclusion.** `President` keeps; `VP of Construction` drops.
   `General Manager` keeps; `Sales Manager` drops. The bare title is the signal.

### Roll-up branches

`collapse-domains.js` resolves every branch sharing a domain to one representative, so what comes
back is **corporate leadership, not the branch GM** — by design. A branch manager at a PE roll-up
cannot authorize a marketing vendor; corporate marketing can, and they are the same people across
all branches. Those rows carry `fanned_from` so the shared contact is visible, and must be deduped
by email before sending.

## Downstream

`clay.csv` carries the identity fields for entity-matching plus `site_text`; personalisation variables
available are `review_count`, `rating`, `city`, `neighborhood`, `brand_family`, `location_count`.
Owner-finding v1 is **website text only** — no SERP vendor is wired (see STATE.md).
