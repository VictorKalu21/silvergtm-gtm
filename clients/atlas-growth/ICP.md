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

---

## Site-text fit classification (STEP 5e) — the rubric

Maps data cannot tell residential from commercial, or a genuine specialist from a general remodeler.
That judgement is made from the business's own site text, in-session (no API), via
`prep-classify.js` → verdicts → `apply-classify.js` → a `business_type` qualify rule.

| verdict | meaning | gate |
|---|---|---|
| `residential_foundation` | residential foundation / crawl-space / waterproofing / concrete-leveling work is a real service, not an afterthought | **KEEP** |
| `commercial_only` | genuine specialist, but commercial & industrial only — no homeowner offer to make | drop |
| `general_contractor` | lists foundations among many unrelated trades; no foundation specialism | drop |
| `not_foundation` | wrong business entirely (roofing, flatwork concrete, lead-gen aggregator) | drop |
| `unclear` | site unreadable or too thin to judge | drop — **EXCEPT** when `brand_family` is set |

### Standing rules (apply to every batch, so verdicts stay consistent)

1. **A restoration-led company counts as `residential_foundation` if it genuinely does crawl space
   repair, basement waterproofing, or foundation work for homeowners** — even when disaster
   restoration, mold or radon is the headline service. *Operator ruling 2026-09-11, on Olympic
   Restoration Systems (crawl space repair + basement waterproofing + mold/radon/fire).* The adjacent
   categories in the brief exist precisely to catch firms that self-label differently.
   The limit: pure water-extraction and remediation outfits with **no** structural or crawl-space
   offering are still `not_foundation` (AdvantaClean, Water Extraction Experts, Dry Effect).
2. **Never drop `unclear` when `brand_family` is set.** Six of the first 60 had no readable site, and
   two were Olshan and Ram Jack — companies we already know are in-ICP. Blocking a scraper must not
   cost a known lead.
3. **A site that is a lead-generation aggregator is `not_foundation`**, whatever the business name
   says. *Guatex Foundation & Structural Solutions* serves a "pick your trade: roofing / electrician
   / HVAC" call-routing page. Nothing in the Maps data catches this — only the site text does.
4. **Concrete *construction* is not foundation repair.** A driveway-and-flatwork company carrying an
   incidental `Foundation` google_type is `not_foundation` (*RL Concrete*).
5. Judge the **whole** service list, not the business name. Names are the least reliable signal here:
   "Foundation Chevrolet Service" and "Foundation Building Materials" both carry the word.

### Measured, batch_000 (60 rows, 2026-09-11)

83% `residential_foundation` overall · 93% among rows that had site text · 4 `not_foundation` ·
6 `unclear` (every one of them a site that returned no text).
