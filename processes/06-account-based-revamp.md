# 06 — Account-based revamp / expansion (when the trigger is invisible)

**Use when:** the offer is bought by businesses that *already have* the thing, and want it extended, segmented or replaced — a network revamp, adding access points, re-architecting, a hardware refresh. The buying trigger is an internal condition with **no external signal**.

**Companion to [05](05-new-premises-delta.md).** Process 05 handles the *new premises* trigger, which emits a signal (an address, a listing, a lease). This one handles everything 05 cannot see. Run 05 first: its baseline is this process's raw material.

**Origin:** Altivox (Lagos business network/WiFi installer). Their second sales angle — customers who already have connectivity and want it distributed, segmented or rebuilt. Mostly banks.

---

## Start here: the trigger is not detectable, and pretending otherwise wastes money

The operator's stated revamp triggers were: aging core equipment ("10 users feel like 100"), migrating from PSK to domain or captive-portal authentication when existing access points can't do it, data and encryption concerns, user segmentation, organisational restructuring, and a new executive arriving who needs setup.

**None of these leaves a trace in any business directory.** There is no field in Google Maps — or any scrapeable source — that correlates with router age or authentication architecture. Checked directly: neither `searchmaps.php` nor `place.php` exposes anything of the kind.

This matters because the instinct is to go looking for a data source. Don't. **The correct response to a latent-need segment is account-based selling, not trigger-based sourcing.** The operator's own brief says as much: *"Bigger corporations will usually identify that they need a change in their solutions."* If the buyer self-identifies, the job is to be credible and present when they look — not to detect them earlier.

## What you actually have: the baseline is the asset

Process 05 produces `leads_clean_union.csv` — a **complete account universe** for the footprint, rebuilt every cycle. For a delta job that file is just memory. For this process it is the entire deliverable.

1. **Aggregate by `brand_key`.** One row per operator, not per premises. Three Fidelity branches are one account conversation with three pieces of evidence.
2. **Segment by what they'd buy** (see the sub-service map below).
3. **Work it on a quarterly cycle,** not monthly. Nothing about a revamp need changes month to month.

## Weak Maps-native signals — real, but do not oversell them

`union-passes.js` emits `leads_changed.csv` with change flags computed across cycles. None of these is a revamp trigger. All of them mean "something changed at this organisation," which is a reason to call:

| Flag | Why it might matter |
|---|---|
| `relocated_*m` | They moved. Often the strongest one here — a move is a full rebuild. |
| `renamed` | Rebrand, merger or acquisition. Nigerian banking has a long history of these, and they force IT consolidation. |
| `category_changed` | The business repositioned. |
| `claim_flipped` | Someone new is paying attention to the listing — often a new marketing or IT hire. |
| `website_appeared` | Same. |

These are prompts for a human to look, not a scored list.

## Trigger overlays worth testing — none verified

Each of these is a *candidate*. **Apply the enumerability test before building anything:** can you list every instance in a defined period and geography, or can you only look one up once you already have a name? A source that fails that test cannot source.

- **Job postings for network / IT infrastructure roles at named accounts.** The strongest candidate. Headcount growth is the observable form of "10 users feel like 100," and a newly-hired Head of IT or CTO audits and replaces infrastructure early — the operator's own "new exec" trigger. Nigerian job boards publish openly, and [01](01-job-board-trigger-sourcing.md) already handles this shape. Note this is job *postings*, not people-search.
- **Executive appointment announcements** in the business press.
- **Regulator licensing lists** (new banks, PSBs, microfinance banks). Low frequency, high value, finite.

**CAC is out.** Nigeria's Corporate Affairs Commission publishes a *name-verification* lookup, not a queryable or bulk register — you can confirm a company you already know about, you cannot ask which companies registered in Lagos last month. It fails the enumerability test. (The UK pattern misleads here: `companies-house.js` works because Companies House ships a real API. That does not transfer.)

## Sub-service → segment map

"New users want everything; existing users usually want one of the above." So a revamp pitch must name the *one thing*, not the bundle.

| Sub-service | Segment | Hook |
|---|---|---|
| Internet setup | SMEs with little existing infra | Street-level knowledge of what actually works at that address |
| Provider selection | SMEs, hubs, hotels needing redundancy | You broker providers rather than being one — that is the differentiator |
| LAN distribution | Hotels, coworking, academies, multi-floor tenants | "Add more access points" is the most common ask |
| Server interconnection | Banks, fintech, law firms, audit, insurance, oil & gas | On-prem servers, often newly installed |
| LAN segmentation | Banks (regulatory), fintech, hotels (guest vs back-office), coworking (per-tenant), schools (staff vs student), clinics | This is what a PSK → captive-portal migration actually is |
| Network/WiFi redundancy | Banks, brokers, fintech, hotels, large academies | Uptime-sensitive |

## Reaching the buyer

The decision-maker is management — GMD, CEO, COO, CTO — not a facility or IT manager. Two consequences:

- **A walk-in does not work for enterprise.** It reaches a branch manager who cannot buy. Owner-finding *is* in scope here (it is not, for SME new-premises work where phone and walk-in are the channel). Bias terms should lead with GMD / Managing Director / CEO / COO / CTO / Head of IT Infrastructure.
- **"The entire management" buys**, so this is multi-threaded — named execs, not a generic inbox. IT manager remains useful as the *entry point* for a bank revamp conversation, just not as the buyer.

## Honest limits

- **There is no way to measure this process's hit rate up front.** Unlike 05, there is no noise floor to test, because there is no trigger to be wrong about. The only feedback is conversion.
- **It is slower and lower volume by construction**, and that is correct — it targets a finite, known universe rather than a stream.
- **The highest-leverage work is probably not sourcing at all.** Partner channel (fit-out contractors, interior designers, IT resellers — all on site before you are) and being findable at the moment of self-identification will likely beat any list this process produces. Worth saying plainly to the client before building it out.

## Worked example

None yet — this process is specified but unrun. First application will be Altivox, once [05](05-new-premises-delta.md) has produced a baseline union for the Lagos footprint.
