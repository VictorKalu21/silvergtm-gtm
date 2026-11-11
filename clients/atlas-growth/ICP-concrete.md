# Atlas Growth — ICP: residential concrete contractors (US)

> Opened 2026-11-11. Status: **PROBE approved by the operator 2026-11-11 ("go")** — 100 sendable contacts to test
> whether the vertical is saturated with lead-gen pitches (measured by reply content), before any full build.
> Entered through `icp-source-planner` sample mode (one gate). Run: `2026-11-11_us-concrete-contractors-yp/`.

## Why this vertical

Operator's ground truth: US generator installers say on calls that many agencies already contact them. A
same-day screen of 18 home-service niches (Yellow Pages samples in 6 metros, own-website Meta-pixel rate,
specialist-agency count, pay-per-lead marketplace coverage) put concrete in the low-advertising group:
8.0% of own-site concrete contractors carry a Meta pixel (n=125) vs 14.9% generators (n=101) and 18.3%
roofing (n=126); 1–2 specialist agencies found; Modernize sells concrete lifting only. Samples are small
(±5 pts). The probe's reply content is the real test.

## The offer (operator-approved wording 2026-11-11)

> We help concrete contractors book qualified in-home driveway and patio estimates using Facebook lead generation.

No "10 in 30 days" promise. Footers carry no links (operator 2026-11-11, after DBL bounces citing a URL in the body).

## Who qualifies

**In:** contractors that pour **residential** flatwork — driveways, patios, walkways, pool decks, stamped /
decorative concrete — and say so on their own website.
**Out:** commercial-only site-work firms, ready-mix suppliers, concrete pumping / cutting / coring,
foundation-only and lifting/levelling-only companies, equipment and supply stores, national franchises.
**Contact:** the owner where the site names one, otherwise the company mailbox.

## Source

Yellow Pages (`google-maps-scrape/yp-search.js`, free, keyless). Operator-chosen 2026-11-11; the scraper.tech
Maps key returned empty bodies the same day. Measured on 354 concrete listings (6 metros): name/phone 100%,
city/state/zip 97%, website listed 98% but **only 64% own-site** (34% are YP-hosted `*.localsearch.com`
mini-pages — dropped), no owner, no email, no reviews. Listings per metro 233–384.
Strata: the general `Concrete Contractors` category vs the narrower `Stamped & Decorative Concrete`,
`Driveway Contractors`, `Patio Builders` categories (process rule R1).

## Spend rules for this run (operator 2026-11-11)

- Owner search: **DataForSEO or Keenable only**. No other paid owner source.
- MillionVerifier / BounceBan: **not spent until the operator is shown the count and says go.**
- Dedupe against earlier Atlas runs by root domain + phone (free).
