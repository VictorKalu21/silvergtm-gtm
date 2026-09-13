# 05 — New-premises delta (monthly Google Maps re-scrape)

> **Scope note.** The trigger is a business at a **new location** — not specifically a new *office*. Two distinct events hide under that phrase and the mechanism sees only one of them cleanly:
> - **New branch / additional site** — the original stays open, a new premises appears. **New `place_id`**, so the monthly delta catches it. This is the common case and it spans every category.
> - **Relocation / moving office** — one address replaces another. Google keeps the **same `place_id`** and edits the address, so the delta is structurally blind to it. Caught instead by the relocation detector in Step 5.

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

### Step 4 — Gate on coverage, then union, then qualify, then geo-gate

```
# 3 passes into separate dirs (shard by tile via run-batch.js on a real footprint)
node run-scrape.js --runsheet <sheet>.csv --config <client>-config.json --out <run>/pass-1
node run-scrape.js --runsheet <sheet>.csv --config <client>-config.json --out <run>/pass-2
node run-scrape.js --runsheet <sheet>.csv --config <client>-config.json --out <run>/pass-3

node union-passes.js --pass <run>/pass-1 --pass <run>/pass-2 --pass <run>/pass-3 \
                     --out <run> --cycle 2026-09 \
                     --prior <prev-cycle>/leads_clean_union.csv

node qualify-leads.js  --in <run>/leads_delta_confirmed.csv --config <client>-config.json --out <run>
node footprint-gate.js --in <run>/leads_clean_qualified.csv --runsheet <sheet>.csv \
                       --config <client>-config.json --out <run> --hub-radius-deg 0.05
```

Every pass must exit 0. `union-passes.js` **refuses** a pass dir whose `coverage_report.json` is not `COMPLETE` — `run-scrape.js` writes `leads_clean.csv` *before* its exit-1 decision, so an INCOMPLETE pass still leaves rows on disk and `run-batch.js`'s row-count skip-guard would mark it `done` on a resumed cycle. Unioning that hole manufactures next cycle's fake-new.

### Step 5 — The delta, the deferral queue, and relocations

`union-passes.js` emits four files:

| File | What it is |
|---|---|
| `leads_clean_union.csv` | **The canonical memory.** Pre-qualify, every place including single-hit ones. Feed it forward as next cycle's `--prior`. |
| `leads_delta_confirmed.csv` | New places confirmed this cycle — the outbound list. |
| `leads_delta_pending.csv` | New places seen in only **one** of three passes. **Deferred, not dropped.** |
| `leads_changed.csv` | Relocations, renames, category changes, claim flips. |

> **A place is CONFIRMED when it is absent from every prior cycle AND seen in ≥2 of this cycle's passes** (or reaches 2 cumulative hits across adjacent cycles).

**Why pending exists.** A genuinely new place that flickers into only one pass would otherwise be excluded from the delta *and* absorbed into the baseline — never surfaced at all. And the flicker-prone population (low prominence, no reviews, unclaimed) is precisely the new-premises profile, so the loss would concentrate on the target. Pending places promote the next cycle they reappear.

**Why the memory must be the union file, not the delta.** `build-netnew.js` discovers prior refs matching only `/^clay.*\.csv$|_netnew\.csv$/i`, which makes the *shipped feed* the memory — so anything filtered out of it is also forgotten and returns as fake-new. It also dedupes on **website host**, which deletes every new branch of a multi-site operator (all branches share one domain). `union-passes.js` replaces it for this job and dedupes on `place_id` only. `build-netnew.js` is unchanged for other clients.

### Step 6 — Rank the delta before it goes out

Not a filter, a sort — and **it differs by segment**:

- **Consumer / hospitality / retail rows:** real new premises skew to `review_count` 0–3, unclaimed, sparse hours, no website. Sort ascending by `review_count` and work the top.
- **B2B office rows: this sort barely discriminates.** 48–60% of the Lagos B2B baseline has **zero** reviews and 21% is zero-and-unclaimed, so a fifteen-year-old firm looks identical to a new one. Use `first_seen_cycle`, `pass_hits` and the change flags instead.
- **Building-level rows** (`co_tenant_count` high, `floors_hint` set): here review counts *are* meaningful — buildings accumulate reviews where SMEs do not.

Also read `leads_changed.csv`: a `relocated_*m` flag is a firm that just moved, which for many ICPs is a stronger trigger than a brand-new listing.

## Honest limits

- **This is a trailing signal.** Google Maps listings typically appear weeks-to-months *after* a business moves in, often after the connectivity decision is made. It finds "recently *listed*", not "moving in". It still converts in Lagos (plenty of offices run on MiFi or consumer broadband for months), but do not sell it internally as a move-in alert.
- **`place_id` churn** creates irreducible false positives — re-created, merged or re-claimed listings get new ids. Low volume, non-zero, not removable by any amount of passes.
- **No historical backtest is possible from Maps.** Neither `searchmaps.php` nor `place.php` exposes any listing-creation, opening or establishment date (confirmed 2026-09-13 — full field list checked on both). `reviews.php` is not a usable proxy **for B2B** — most offices have zero reviews and review dates lag listing creation. It may be usable for consumer segments, where reviews accumulate within weeks, as a second noise filter (an oldest-review date >6 months on a "new" place marks it a baseline leak). Untested; treat as a candidate, not a method. **You cannot reconstruct last year's delta.** A retrospective backtest would need an external register that is *enumerable* by filing date and address — and for Nigeria there isn't one. CAC publishes a name-verification lookup, not a queryable or bulk register: you can confirm a company you already know about, you cannot ask which companies registered in Lagos last month. (This is where the UK pattern misleads — `companies-house.js` works because Companies House ships a real API. That does not transfer.) **So there is no retrospective validation available at all, and the 7-day zero-signal test below is not a nice-to-have — it is the only way to get an error rate before shipping.**
- **Leading alternatives**, if the trailing lag hurts. Each needs a source that can be *enumerated* monthly, not just looked up — that is the filter that rules out CAC, and it should be applied before building against any of these. **None below are verified for accessibility; confirm with someone who knows the local sources before committing effort.** Commercial property portals (diff office listings month over month — a listing that disappears is plausibly a letting, though withdrawals add noise); fit-out and interior contractors' project posts (very leading — they are on site before the tenant); job ads naming a new office location (the `processes/01-job-board-trigger-sourcing.md` machinery already handles this shape); new commercial building completions (low volume and trackable by hand, and the highest-value case for a network installer — one new tower is many arriving tenants and a possible building-wide contract).

## How to validate it before trusting a month

You cannot backtest historically, but you **can** measure the mechanism's error rate directly, today:

0. **Positive control — do this first, it costs nothing.** Take the client's last 20–30 actual sales. For each: is it on Maps, when did its first review appear, was the listing claimed, and how long after opening did they buy? This measures Maps lag against *purchase timing for the real buyer population*, which is the assumption the whole process rests on. Every category exclusion is a hypothesis until this runs — on the Altivox job, two review rounds confidently excluded segments that one question to the operator ("have you sold to a bank?") reversed.
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
