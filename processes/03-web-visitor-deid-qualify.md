# 03 · Web-Visitor De-ID Qualify — greenfield prospects for a de-anonymization offer

**Outcome:** a CSV of companies qualified for a website-visitor de-anonymization ("de-ID") offer — each one **runs paid ads**, does **not** already run a de-id pixel (greenfield), has a **sales motion** to act on identified accounts, is **B2B in your chosen vertical**, and is **confirmed actively advertising on the Meta Ad Library**.

**Why this shape:** the offer only lands if the prospect (a) pays to drive traffic worth de-anonymizing, (b) has somewhere to route identified accounts, and (c) isn't already solved. Each is a hard gate. The moat is the *ordering* — one free homepage fetch produces three of the gates, so every paid/slow step sees a population already cut ~8x.

**When to run:** building or refreshing the cold-outbound list for a de-ID / de-anon / identity-resolution offer (e.g. Silver GTM). Also to add a new vertical to that list.

**Skill:** `web-visitor-deid-qualify` (currently in `~/.claude/skills/`; scripts referenced below live in its `scripts/`). Not yet copied into this repo — will be committed here once the pilot hardens it.

---

## Inputs

- An **Apollo accounts-export CSV** for the vertical (firmographic net: name, website, employees, state, industry, a short description). One export per vertical.
- **Node** (for the `.mjs` steps) and **Python 3.13** with Scrapling for the Meta step: `py -3.13 -m pip install "scrapling[fetchers]"` then `scrapling install`.
- Live network (homepage fetch + Scrapling renders) must run via **PowerShell** on this machine — the Bash sandbox has no network.

## The gate (all HARD, cheapest-first)

| # | Gate | Requirement | Cost |
|---|------|-------------|------|
| 1 | Ad pixel | strict `AW-`/`fbq`/LinkedIn Insight present (incl. fired via GTM) | free |
| 2 | No de-id pixel | de-anon set incl. **Knock2**, RB2B, Leadfeeder, Warmly, Vector, Koala, Snitcher, Lead Forensics, 6sense, Demandbase, ZoomInfo WebSights… absent | free |
| 3 | Routes-to-sales | demo/talk-to-sales CTA **or** form **or** click-to-call | free |
| 4 | B2B / vertical fit | Haiku reads pruned homepage text; keep/drop prompt **co-authored per run** | cheap |
| 5 | Ad-lib confirm | **active** ads on Meta Ad Library, by exact Page ID | slow, free |

## Pipeline

```
Apollo CSV
  → prep-input.mjs        dedupe by domain → {RUN}_input.json
  → pipeline.mjs          ONE fetch/site → ad-pixel + no-de-id + routes-to-sales + GTM-container
                          crack; saves pruned homepage text + facebook.com handle
                          → {RUN}_signal.json  (status=pass_free_gates for survivors)
  → prep-classify.mjs     batch survivors' HOMEPAGE TEXT (~80/batch) → {RUN}_review_batch_*.json
  → [parallel Haiku]      one claude-haiku-4-5 subagent per batch, co-authored keep/drop prompt
                          → {RUN}_review_batch_*_out.json = [{name,isKeep,tag}]
  → merge.mjs classify    match verdicts BY NAME → {RUN}_keeps.json (B2B keeps)
  → adlib_confirm.py      resolve domain→FB Page-ID → Meta Ad Library active count>0
                          (Scrapling StealthyFetcher; resume-safe; CONC=3) → {RUN}_adlib.json
  → merge.mjs final       keeps × ad-lib → {RUN}_QUALIFIED.csv
```

### Commands

```
export DIR=/path/to/workdir RUN=<vertical-slug>
node prep-input.mjs apollo_<vertical>.csv     # 0
node pipeline.mjs                             # 1-3 (free gates), ~4/s
node prep-classify.mjs                        # 4 prep
#   dispatch one Haiku subagent per {RUN}_review_batch_{n}.json  (see keep/drop prompt below)
node merge.mjs classify                       # 4 merge -> keeps
py -3.13 adlib_confirm.py                      # 5 (Meta), ~40s/co, only touches B2B keeps
node merge.mjs final                          # -> {RUN}_QUALIFIED.csv
```

## Step 4 — co-author the keep/drop prompt (the ONLY per-vertical config)

Vertical logic lives entirely in the Haiku prompt, never in code. Before dispatching, define keep vs drop with the operator, then per batch of `{name,url,industry,text}`:

> KEEP = a genuine B2B **[operator definition for this vertical]**. DROP = software/agency/consultancy/marketplace/B2C **selling to** the vertical. Return JSON only: `[{"name":<exact input name>,"isKeep":true|false,"tag":"<subtype-or-drop-reason>"}]`.

Batches ~80; verdicts merge by name so a truncated batch can't misalign rows (unmatched → `{RUN}_unmatched.json` for a re-run).

## Step 5 — why Page-ID, not keyword

Meta Ad Library keyword search returns every advertiser whose ad *text* mentions the brand (validated: `q=notion` returned Perplexity, Otter, Claude…). So resolve domain → Facebook **Page ID**, then query `view_all_page_id` with `active_status=active`; count>0 = confirmed running ads (garbage Page-ID returns empty → proves it filters). Meta 403s plain fetch and curl_cffi — only Scrapling `StealthyFetcher` clears the WAF, so this is the slow step; it runs only on B2B keeps.

## Traffic / MQL band (for copy)

No **free** per-company traffic estimate is defensible (Tranco = rank not volume; CrUX = presence not counts; ad-count = spend proxy). Until DataForSEO is on, size the copy promise as a **% claim**, not a band: *"a de-anon layer typically surfaces ~20–30% of your anonymous company traffic as sales-ready accounts."* Traffic-agnostic, reader self-applies. A `traffic-band.mjs` step (volume → 10–30k / 30–50k / 50–100k / 100–250k / 250k+ bands) drops in cleanly once DataForSEO is available.

## Gotchas

- **Judge B2B off homepage text, not the Apollo description.** Keyword rules "work" on the compact description but drown in marketing copy (a freight-*tech* SaaS reads like a freight operator). Haiku on pruned homepage text.
- **Never keyword-search the ad library as the gate** — false-positives on brand mentions. Page-ID only.
- **Merge verdicts by name, never by index** — big Haiku batches truncate and silently misalign.
- **Bare `googleadservices`/GTM ≠ runs ads** — require a real `AW-<id>`; a GTM Conversion Linker alone isn't proof.
- **Run classify before the Meta step** — renders are ~40s each; only pay for B2B keeps.
- Background scrape jobs die silently if the laptop sleeps — `adlib_confirm.py` is resume-safe per-name, so just re-run.

## Worked example — HR-tech smoke test (2026-09-04)

3-domain plumbing test that validated the full chain end-to-end:

| Stage | Result |
|-------|--------|
| Input | 3 domains (Notion, Rippling, example.com) |
| Free gates | 1 pass_free_gates, 2 drop_no_pixel |
| — Rippling | pixels `meta`+`linkedin` found **via GTM-container crack**, routes-to-sales ✓, fbHandle `ripplingapp` |
| B2B classify | 1 keep (`hr_payroll_platform`) |
| Meta ad-lib | Page-ID `1355356101187429` resolved from FB page → **~730 active ads** → confirmed |
| **QUALIFIED** | **1** (Rippling) |

First real run: pilot on a new-vertical Apollo export, co-authoring the step-4 prompt.
