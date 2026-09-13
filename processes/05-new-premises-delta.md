# 05 — New-premises delta (monthly Google Maps re-scrape)

**Use when:** you sell something every business buys *once, on arrival at a new address* — connectivity, ISP/WiFi install, office fit-out, access control, furniture, cleaning contracts. The trigger is "this business just appeared at this address," and you want it monthly, repeatably, for a fixed geographic footprint.

**Origin:** Altivox (business network + WiFi installer, Lagos) — all offices in Victoria Island, Ikoyi, the Lekki corridor and Ajah, re-scraped monthly, month-over-month `place_id` delta as the outbound list.

**Relationship to other processes:** this is a *cadence wrapper* around the `google-maps-scrape` skill. That skill builds one list; this process turns repeated runs of it into a trigger feed. Read the skill first — every step here assumes its STEP 1–5c.

---

## The idea, and the thing that breaks it

A business that just moved in has no incumbent supplier *at that address*. That is close to an ideal wedge. The obvious mechanism — scrape monthly, dedupe on `place_id`, treat what's new as newly-arrived — is correct in principle.

It fails in practice for one reason: **`searchmaps.php` is not deterministic.** The same query, same viewport, same parameters, run minutes apart, returns a materially different set. Anything the earlier run missed reappears later as a brand-new `place_id`, indistinguishable from a real new office.

Measured on one viewport (Victoria Island core, `Law firm`, zoom 14), 2026-09-13:

| Instrument | Result |
|---|---|
| Two full paginated passes, minutes apart | run1 = 314 unique, run2 = 308 unique, **union = 354** |
| `place_id`s present in run2 but not run1 | **40 (12.7% of baseline)** |
| Single pass vs 5-pass union | single pass captures **86.2%** |
| **Single-pass miss rate** | **~13.8%** |

Zero offices opened in Lagos during those minutes. **Every one of those 40 "new" places was noise.** Run naively, a monthly delta over a ~10,000-place baseline would surface well over a thousand fake "new offices" a month — against a real signal that is plausibly in the low hundreds. The list would be majority garbage, and you would be opening with "welcome to the neighbourhood" to firms that have been on Adeola Odeku for fifteen years.

**So the delta is only trustworthy if the baseline is stable. Stabilising the baseline is the whole process.**

## Two API facts this process depends on

Both were measured on 2026-09-13 and both contradict `runbook.md` as written in June 2026. Re-verify before trusting them.

1. **`offset` pagination WORKS.** `runbook.md` states `offset` returns `status:"failed"` and that completeness must come from tiling alone. That is no longer true: `offset=20/40/100/…` all return `status:"ok"` with **zero id overlap** between pages, exhausting naturally (empty array) at the end of the result set.
2. **The "~100 results per viewport" cap is a per-CALL cap, not a per-viewport cap.** Paginating one viewport for a single category yielded **348 unique businesses** — 3.5x the supposed ceiling. `limit=150` also works and combines with `offset`, so a full crawl of that viewport costs ~4 calls, not 17.

Consequence: **`scrape.js` does not paginate at all** — one call per tile, then quadrant-splitting on saturation. It is leaving the long tail on the floor on every dense tile, and paying for quadrant splits (which also bleed outside the footprint) to recover a fraction of what one extra `offset` call would return cleanly. See `IMPROVEMENTS.md`.

## The protocol

### Step 1 — Build the footprint and rules once
Per `google-maps-scrape` STEP 1–3: lock the footprint, map the ICP to Google's native categories, author `<client>-config.json` and a generated run sheet. This is done **once** and then frozen — **the footprint, the category list, and the run sheet must not change between months.** A category added in month 3 dumps its entire back-catalogue into that month's delta as fake "new."

> If you must extend coverage later, run the new categories as a **separate baseline-building run** and exclude them from the delta for two cycles.

### Step 2 — Qualify rules: do NOT use a review floor
Inverted from the usual instinct, for two independent reasons:
- Standing rule: review floors are for consumer ICPs. B2B offices rarely collect Google reviews.
- **It would invert this job.** A genuinely new office has 0–3 reviews *by definition*. Low `review_count` is the positive signal here.

Also dry-run every `qualify_rules` block against a fixture CSV before spending (see `IMPROVEMENTS.md` — `deny` is a substring match and short stems silently delete whole ICPs).

### Step 3 — Each month: run N=3 passes and UNION them
This is the core of the process. A single pass is ~86% complete; the union converges fast:

| pass | this pass | union | newly added |
|---|---|---|---|
| 1 | 295 | 295 | 295 |
| 2 | 294 | 340 | **+45 (13.2%)** |
| 3 | 297 | 343 | **+3 (0.9%)** |
| 4 | 302 | 344 | +1 (0.3%) |
| 5 | 312 | 348 | +4 (1.1%) |

**Three passes is the knee.** Pass 2 is mandatory (recovers ~13%); pass 3 confirms convergence; passes 4–5 buy ~1% and are not worth the spend. Run the same run sheet three times into three output dirs and union on `place_id` before anything downstream.

Target: **residual miss ~1–2%**, down from ~14%. That is a 10x cut in the false-new rate and it is what makes the delta usable.

### Step 4 — Gate on coverage, then qualify, then geo-gate
Unchanged from the skill: `run-scrape.js` must exit 0 on every pass, then `qualify-leads.js`, then `footprint-gate.js` (REQUIRED — the only geo gate in `areas` mode).

### Step 5 — Diff against the rolling baseline, with a confirmation rule
`build-netnew.js` against every prior month gives the candidate delta. Then apply:

> **A place counts as NEW only if it is absent from all prior months AND present in ≥2 of this month's 3 passes.**

A place that appears in only one of three passes is far more likely to be a flickering long-tail result than a new business. This is a free second filter on top of the union and it costs nothing to compute.

### Step 6 — Rank the delta before it goes out
Not a filter, a sort. Real new offices skew toward: `review_count` 0–3, `is_claimed` false or recently true, sparse `working_hours`, no website. Established firms that merely leaked through the baseline skew the other way. **Sort the delta by `review_count` ascending** and work the top.

Track `first_seen_run` on every place from month 1 so the delta is auditable later.

## Honest limits

- **This is a trailing signal.** Google Maps listings typically appear weeks-to-months *after* a business moves in, often after the connectivity decision is made. It finds "recently *listed*", not "moving in". It still converts in Lagos (plenty of offices run on MiFi or consumer broadband for months), but do not sell it internally as a move-in alert.
- **`place_id` churn** creates irreducible false positives — re-created, merged or re-claimed listings get new ids. Low volume, non-zero, not removable by any amount of passes.
- **No historical backtest is possible from Maps.** Neither `searchmaps.php` nor `place.php` exposes any listing-creation, opening or establishment date (confirmed 2026-09-13 — full field list checked on both). `reviews.php` is not a usable proxy: most B2B offices have zero reviews, and review dates lag listing creation anyway. **You cannot reconstruct last year's delta.** A retrospective backtest would need an external register that is *enumerable* by filing date and address — and for Nigeria there isn't one. CAC publishes a name-verification lookup, not a queryable or bulk register: you can confirm a company you already know about, you cannot ask which companies registered in Lagos last month. (This is where the UK pattern misleads — `companies-house.js` works because Companies House ships a real API. That does not transfer.) **So there is no retrospective validation available at all, and the 7-day zero-signal test below is not a nice-to-have — it is the only way to get an error rate before shipping.**
- **Leading alternatives**, if the trailing lag hurts. Each needs a source that can be *enumerated* monthly, not just looked up — that is the filter that rules out CAC, and it should be applied before building against any of these. **None below are verified for accessibility; confirm with someone who knows the local sources before committing effort.** Commercial property portals (diff office listings month over month — a listing that disappears is plausibly a letting, though withdrawals add noise); fit-out and interior contractors' project posts (very leading — they are on site before the tenant); job ads naming a new office location (the `processes/01-job-board-trigger-sourcing.md` machinery already handles this shape); new commercial building completions (low volume and trackable by hand, and the highest-value case for a network installer — one new tower is many arriving tenants and a possible building-wide contract).

## How to validate it before trusting a month

You cannot backtest historically, but you **can** measure the mechanism's error rate directly, today:

1. **Noise floor (minutes).** Run one viewport's crawl twice back-to-back and diff. Every id in the diff is a false positive. This is the number in the table above — re-run it on your own footprint, it is ~10 API calls.
2. **Convergence (minutes).** Repeat passes until the union stops growing. That sets N for Step 3 — do not assume 3 transfers to a different footprint or category mix.
3. **Protocol validation (7 days).** With the 3-pass union protocol running, execute a full cycle, wait a week, execute another. Essentially no real offices open in 7 days, so whatever survives the Step 5 confirmation rule is residual noise. If that is small, the monthly delta is trustworthy. **Do this before month 1 ships to anyone.**

## Worked example — Altivox, Lagos (2026-09-13, calibration run)

Footprint: 17 tiles at zoom 14 across Victoria Island, Eko Atlantic, Oniru, Ikoyi, Banana Island, Parkview, Lekki Phase 1, Ikate, Osapa, Agungi, chevron, VGC, Ajah, Sangotedo. 92 Google categories in three tiers (P1 40 / P2 46 / P3 6) = 1,564 base calls before pagination.

Calibration on a single viewport (VI core, `Law firm`, zoom 14):
- `offset` pagination confirmed working — contradicts `runbook.md`; 4 calls at `limit=150` exhaust the viewport.
- **348 unique law firms in that one viewport** vs the ~100 the runbook calls a hard cap.
- Single-pass miss rate **13.8%**; two-run false-new rate **12.7%**.
- Union converged at **3 passes** (+0.9% on pass 3).

Decisions taken: no review floor (would invert the job); 3-pass union per month; ≥2-of-3 confirmation rule; footprint and category list frozen after month 1; `quad_offset` cut to 0.010 because the 0.025 default is wider than Victoria Island.

Status: config and run sheet built and rule-tested against a fixture; full scrape not yet executed.
