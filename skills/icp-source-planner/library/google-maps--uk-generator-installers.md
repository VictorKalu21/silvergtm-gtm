---
source: Google Maps (scraper.tech) — generator-intent queries
vertical: UK residential standby / backup generator installers (Atlas Growth option B)
verdict: failed
last_validated: 2026-09-30
access: scraper.tech searchmaps (paid, key)
dispatch: google-maps-scrape
cost_tier: paid
---

# Google Maps × UK residential generator installers

**Coverage:** the market barely exists. 177-tile UK grid × 5 generator-intent queries (generator installation ·
standby generator installer · backup generator · generator engineer · generator shop), 885 rows, **1,789 calls →
7,022 unique → 2,420 qualified → 1,301 in footprint** (1,021 US listings bled in — Maps widens the radius on sparse
UK queries) → site-text fit: **32 residential installers**, 60 commercial-only generator firms, 32 hire-only, 38
retail, 707 not-generator (electricians with no generator service).
**Fields:** the usual Maps set; no email column.
**Fill rates (BY DEPTH):** calls/row 2.02; page depth 1/2/3 = 24/821/41.
**Restrictions:** a single-query zero on a tile can be a transient empty response marked `ok` (London-centre returned
0 in calibration and 51 on the full run) — pair every calibration tile with a second query.
**Method:** `clients/atlas-growth/gen-runsheet-generators-uk.js` + `atlas-growth-generators-uk-config.json`
(space-anchored `" hire"` name term, hire/merchant/utility primary denies, floor 5).
**Cost actuals:** 1,798 Maps calls for 32 ICP leads (~56 calls per lead). Owner read on the 32: 21 named (Companies House).
**Gotchas:** UK "generator" on Maps = hire yards, commercial diesel suppliers and US bleed. Floor 5 dropped 127
generator-named firms at 1–4 reviews (B2B trade, few reviews). The deep review (`ICP-generators-uk.md`, 2026-09-28)
predicted this and recommended the MCS battery register instead; the classify-on-calibration step that would have
shown the ~3% residential rate before the full spend was skipped — run it next time.
**Runs:** 2026-09-30 — Atlas Growth — 885 rows / 1,789 calls → 32 ICP (+60 commercial-only held) — superseded by the MCS register run.
