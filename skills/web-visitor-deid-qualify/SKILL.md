---
name: web-visitor-deid-qualify
description: Use when building a cold-outbound prospect list for a website-visitor de-anonymization / de-ID / identity-resolution offer (e.g. Silver GTM) - qualifying companies that run paid ads, do NOT already run a de-id pixel (RB2B/Knock2/Leadfeeder/Warmly/6sense/etc.), have a sales motion, and are B2B in a chosen vertical. Optionally confirms which are advertising live via LinkedIn/Google/Meta ad libraries. Also use to re-run or add a vertical.
---

# Web Visitor De-ID Qualify

Qualify companies for a **website-visitor de-anonymization ("de-ID") offer**: the ideal prospect pays to drive traffic (runs ads), has a sales motion to act on identified accounts, and is **not yet** running a de-id pixel — so the offer is greenfield.

**Core principle: fetch once, gate free, pay late.** One homepage fetch yields all the hard gates for free. Cheap Haiku runs only on free-gate survivors; the slow/rendered ad-library confirmation runs only on B2B keeps, routed to the one channel each company actually advertises on.

## The gate = the live PIXEL (all HARD, cheapest-first)

| # | Gate | Requirement | Cost | Script |
|---|------|-------------|------|--------|
| 0 | Input | Apollo accounts-export → deduped, carries FB + LinkedIn URLs | free | `prep-input.mjs` |
| 1 | Fetch | homepage + GTM-container crack | free | `pipeline.mjs` |
| 2 | Ad pixel | strict `AW-`/`fbq`/LinkedIn Insight present (incl. via GTM) | free | `pipeline.mjs` |
| 3 | No de-id pixel | de-anon set **incl. Knock2** absent → greenfield | free | `pipeline.mjs` |
| 4 | Routes-to-sales | demo/talk-to-sales CTA **or** form **or** click-to-call | free | `pipeline.mjs` |
| 5 | B2B / vertical fit | Haiku reads pruned homepage text; keep/drop prompt **co-authored per run** | cheap | `prep-classify.mjs` → subagents → `merge.mjs classify` |

Output: `{RUN}_QUALIFIED.csv` = the qualified list. **The live pixel IS the ad-proof** — it's channel-specific and current. Do NOT hard-gate on an ad library (see below).

## Ad-library confirmation is a ROUTED enrichment tier, NOT a gate

Hard-won lesson: **ad channels are vertical-dependent, and ad-library access varies by channel.** B2B tech advertises on LinkedIn (~76%) and Google (~49%), rarely Meta (~34%, and even Meta-only cos confirm live only ~18%). Gating on any single library (esp. Meta) throws away real advertisers. So treat the library as an **optional "verified-live" tier + copy hook (ad counts)**, routed to the one channel each company's pixel indicates:

| Channel | Route | Method | Speed |
|---|---|---|---|
| LinkedIn pixel | `accountOwner=<vanity>` | `confirm-ads.py` — curl_cffi, **render-free** | ~7s/co, 429s on bursts → low-and-slow |
| Google pixel (no LI) | Transparency by domain | `confirm-google.py` — Scrapling render, count `/creative/CR` | ~40s/co |
| Meta only (no LI/Google) | `view_all_page_id` | `confirm_ads`→ `adlib_confirm.py` — Scrapling render | ~40s/co, lowest yield |

**Precision keys:** LinkedIn `accountOwner` needs the **LinkedIn URL vanity** (Apollo `Company Linkedin Url`), NOT the messy company name — domain-form/`Inc.`/acquired-renamed names all false-negative (Blameless→FireHydrant). Google keys off the **domain**. Meta needs the **Facebook Page ID** (resolve from the FB handle; keyword search matches anyone mentioning the brand → false positives). A live pixel ≠ live ad: Google-pixel cos confirmed live only ~63%, Meta far less — the render corrects pixel-trust.

## Run workflow

Set `RUN` (vertical slug) + `DIR` (workdir) for every command.

```bash
export DIR=/path/to/workdir RUN=hrtech
node prep-input.mjs apollo_hrtech.csv        # 0
node pipeline.mjs                            # 1-4 free gates -> {RUN}_signal.json
# --- recovery pass (recovers ~7% otherwise lost) ---
node recover-input.mjs                        # build recover set (or see Recovery below)
node prep-classify.mjs                       # 5: batch survivors' homepage text (~110/batch)
#   dispatch 1 Haiku subagent per {RUN}_review_batch_N.json (co-author keep/drop prompt)
node merge.mjs classify                      # -> {RUN}_keeps.json  (= QUALIFIED, pixel-gated)
# --- optional verified-live tier, routed ---
py -3.13 confirm-ads.py                       # LinkedIn (low-and-slow) + tags google/meta
py -3.13 confirm-google.py                    # Google-routed subset -> {RUN}_google_adlib.json
py -3.13 adlib_confirm.py                      # Meta-only subset (render) -> *_adlib.json
#   merge the three -> QUALIFIED.csv + VERIFIED_LIVE.csv (confirmed_live + ad_count)
```

## Step 5: co-author the keep/drop prompt (the ONLY per-vertical config)

Vertical logic lives entirely in the Haiku prompt, never in code. Before dispatching, define keep vs drop with the operator, then one `claude-haiku-4-5` subagent per `{RUN}_review_batch_N.json` reading `{name,url,industry,text}`:

> KEEP = a genuine B2B **[operator/product definition]**. DROP = software/agency/consultancy/marketplace/B2C/holding **selling to** the vertical. Return JSON only: `[{"name":<exact input name>,"isKeep":bool,"tag":"<subtype-or-reason>"}]`.

Batches ~110; verdicts merge **BY NAME** (`merge.mjs`) so a truncated batch can't misalign rows; unmatched → `{RUN}_unmatched.json` for a re-run.

## Recovery pass (do it — recovers ~7% of qualified)

A naive single-fetch silently loses two groups. Both recover free:
- **Unreachable retry:** re-fetch `unreachable` (skip `ENOTFOUND`/no-site = dead) with `TIMEOUT=35000` + `NODE_TLS_REJECT_UNAUTHORIZED=0` — recovers slow + cert-broken sites via `pipeline.mjs` on a recover input.
- **Cloudflare-hidden pixels:** `drop_no_pixel` rows whose HTML is a JS/challenge page hide their real pixel. `recover-challenges.py` (Scrapling `solve_cloudflare`) renders them so JS-fired pixels appear. Feed both recovered sets into a classify top-up.

## Setup / environment

- **Node** for `.mjs`; **Python 3.13** for the `.py`: `py -3.13 -m pip install "scrapling[fetchers]" curl_cffi` then `scrapling install`.
- Live network (fetch, curl_cffi, Scrapling) must run via **PowerShell** — the Bash sandbox has no network.
- Everything is resume-safe (per-name/re-run-from-input), so a laptop sleep/death loses nothing — just re-run.

## Common mistakes

- **Hard-gating on an ad library** — wrong channel per vertical; gate on the pixel, confirm as a routed tier.
- **LinkedIn by company name** — use the LinkedIn URL vanity or you false-negative acquired/domain-form names.
- **Bursting LinkedIn** — 429s hard; low-and-slow (~7s + backoff), never high concurrency.
- **Meta keyword search as a gate** — false-positives on brand mentions; use exact Page ID.
- **Trusting the pixel as "live"** — pixel = intent; the render confirms live (Google pixel-trust overcounted by ~35%).
- **Judging B2B off the Apollo description** — feed pruned homepage `text` to Haiku; marketing copy drowns keyword rules.
- **Skipping the recovery pass** — ~7% of qualifiers hide behind timeouts/cert errors/Cloudflare.
