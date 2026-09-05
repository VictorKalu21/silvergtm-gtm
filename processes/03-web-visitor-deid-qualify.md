# 03 · Web-Visitor De-ID Qualify — greenfield prospects for a de-anonymization offer

**Outcome:** a CSV of companies qualified for a website-visitor de-anonymization ("de-ID") offer — each **runs paid ads** (live pixel), does **not** already run a de-id pixel (greenfield), has a **sales motion**, and is **B2B in a chosen vertical**. Optionally, a second "verified-live" CSV of the subset **confirmed advertising right now** (with per-company ad counts for copy).

**Why this shape:** the offer only lands if the prospect pays to drive traffic worth de-anonymizing, has somewhere to route identified accounts, and isn't already solved. Each is a hard gate off ONE free homepage fetch. The moat is the ordering — every paid/rendered step sees a population already cut ~8x by a free one.

**When to run:** building or refreshing the cold-outbound list for a de-ID / de-anon / identity-resolution offer (e.g. Silver GTM). Also to add a new vertical.

**Skill:** `skills/web-visitor-deid-qualify/` (SKILL.md + `scripts/`). Committed to this repo.

---

## Inputs

- An **Apollo accounts-export CSV** for the vertical (name, website, employees, state, industry, short description, **Company Linkedin Url**, **Facebook Url** — the last two power the confirm step).
- **Node** for `.mjs`; **Python 3.13** for `.py`: `py -3.13 -m pip install "scrapling[fetchers]" curl_cffi` then `scrapling install`.
- Live network must run via **PowerShell** (Bash sandbox has no network). Everything is resume-safe.

## The gate = the live PIXEL (all HARD, cheapest-first)

| # | Gate | Requirement | Cost |
|---|------|-------------|------|
| 1 | Ad pixel | strict `AW-`/`fbq`/LinkedIn Insight present (incl. via GTM crack) | free |
| 2 | No de-id pixel | de-anon set incl. **Knock2**, RB2B, Leadfeeder, Warmly, 6sense, ZoomInfo, Vector, Koala… absent | free |
| 3 | Routes-to-sales | demo/talk-to-sales CTA **or** form **or** click-to-call | free |
| 4 | B2B / vertical fit | Haiku reads pruned homepage text; keep/drop prompt **co-authored per run** | cheap |

**The live pixel IS the ad-proof** — channel-specific and current. Do NOT hard-gate on an ad library.

## Ad-library confirmation = routed "verified-live" TIER, not a gate

Ad channels are vertical-dependent and library access varies. Gate on the pixel; confirm live-advertising as a routed enrichment (one channel per company, by its pixel):

| Channel | Method | Notes |
|---|---|---|
| LinkedIn | `confirm-ads.py` — curl_cffi `accountOwner=<vanity>`, **render-free** | key off the **LinkedIn URL vanity**, not the messy name; low-and-slow (~7s + backoff), 429s on bursts |
| Google (no LI) | `confirm-google.py` — Scrapling render of Transparency by **domain**, count `/creative/CR` | curl_cffi only gets the SPA shell; render populates the DOM |
| Meta only | `adlib_confirm.py` — Scrapling render by **Page ID** | keyword search false-positives; lowest yield for B2B tech |

Then merge the three → `QUALIFIED.csv` (all keeps) + `VERIFIED_LIVE.csv` (confirmed_live + ad_count).

## Recovery pass (do it — ~7% of qualifiers hide here)

- **Unreachable retry:** `recover-input.mjs` → `pipeline.mjs` with `TIMEOUT=35000 NODE_TLS_REJECT_UNAUTHORIZED=0` (recovers slow + cert-broken; skips dead `ENOTFOUND`).
- **Cloudflare-hidden pixels:** `recover-challenges.py` (Scrapling `solve_cloudflare`) renders `drop_no_pixel` rows that were JS/challenge pages so JS-fired pixels appear.
- Feed both recovered sets into a classify top-up (`merge.mjs classify`, name-matched).

## Gotchas

- **Don't hard-gate on any ad library** — wrong channel per vertical; gate on the pixel.
- **LinkedIn by company name = false negatives** (domain-form / `Inc.` / acquired→renamed, e.g. Blameless→FireHydrant); use the LinkedIn URL vanity.
- **Never burst LinkedIn** — 429s hard; low-and-slow only.
- **Meta keyword search ≠ gate** — use exact Page ID.
- **Pixel ≠ live** — Google pixel-trust overcounted ~35% vs the real render.
- **Judge B2B off homepage text, not the Apollo description** — marketing copy drowns keyword rules.
- **Merge verdicts by name, never index** — big Haiku batches truncate and silently misalign.
- **Traffic/MQL band:** no defensible free per-company traffic estimate; use a **% claim** in copy ("~20–30% of your anonymous company traffic → sales-ready accounts") until DataForSEO.

## Worked example — B2B SaaS/CyberSec/Fintech, 21–50, US (2026-09-04/05)

Apollo export (10k cap → 9,325 domain-deduped):

| Stage | Count |
|-------|-------|
| Deduped input | 9,325 |
| Pass free gates | 2,265 |
| + Recovery (52 retry + 49 Cloudflare-unhidden) | +101 |
| Already running a de-id tool (excluded, incl. Knock2) | ~580 |
| B2B classify keeps (**QUALIFIED**) | **1,439** (887 SaaS / 302 fintech / 250 cyber) |
| **VERIFIED-LIVE** (routed ad-lib) | **594** — LinkedIn 348/912 · Google 211/334 · Meta 35/193 |

Channel mix of keeps: LinkedIn 63% · Google 51% · Meta 41%. Median live ad count = 8. Laptop died mid-run; resume-safe checkpoints meant **zero data loss** (audit: 0 missing verdicts across all 1,439).
