# Atlas Growth — campaign / pipeline state

**Client:** Atlas Growth · **Vertical:** residential foundation repair · **Opened:** 2026-09-11

## Status

| | |
|---|---|
| Current run | `2026-09-11_foundation-repair` — scrape COMPLETE, qualified, owner-finding partial, **no `clay.csv` built yet** |
| Runs shipped | none |
| Live campaigns | none |

## Where the 2026-09-11 run stands (2026-09-12)

| Stage | State | Numbers |
|---|---|---|
| Scrape | complete, 8/8 shards, 0 unhealed tiles | 1,410 tiles |
| Qualify + geo + dedupe + collapse | complete | 1,624 representatives → **1,104 ICP** (site-text fit, 68%) |
| Clay feed spine | built | 1,521 rows |
| Owner prompt (STEP 6a) | built late, saved to `owner-prompts/foundation-repair.md` | — |
| Owner-finding | partial: rosters + SERP harvest + WebSearch sweep 72/856 + site-text recovery | 357/1,104 leads with a named decision-maker (32%) |
| Email prep | 298 on-site emails tiered → 81 worth verifying; **not verified** (no keys in container) | `owner/verify_input.csv` |
| Enrichment waterfall | not built; QuickEnrich / TryKitt keys not provided | — |
| `clay.csv` | **not built** | — |

The owner contacts produced locally were extracted by regex parsers, not by a model reading
`owner-prompt.md`. Treat them as a draft to re-read, not a deliverable. See
`skills/google-maps-scrape/IMPROVEMENTS.md`, "Session review — Atlas Growth".

## Dedupe memory — READ THIS BEFORE RUN 2

This is a **brand-new client**, so `build-netnew.js` reporting `ref files used: 0 | prior place_ids: 0`
was **valid for the 2026-09-11 run and for that run only.**

**From run 2 onward, `ref files used: 0` means the history is MISSING — stop, do not enrich.**
Re-contacting leads already sitting in a live campaign burns the relationship and the sending domain.

The dedupe memory for this client is `leads_annotated.csv` from each shipped run. This repo cannot
hold it (CSV outputs are gitignored, and run containers are ephemeral), so it lives wherever the
operator filed the hand-off. **Before run 2: either restore that file into `clients/atlas-growth/`,
or stand up the durable ledger** (a `place_id, website_host, run_slug` table + a
`build-netnew.js --ref-*` flag) — decided but not built.

## Client directives (standing)

- **Keep roll-ups and franchises, flag the brand.** Do not add a chain drop.
- **Footprint is HQ address**, with Memphis / Chattanooga / Jacksonville admitted as border metros. Keep all US spillover; drop only non-US.
- **Review floor 30.** Residential-focused only. Olympic Restoration counts as ICP.
- **No Anthropic API spend** — session usage only.
- **Do not spend verification or enrichment credits without an explicit go.**
- **SERP vendor:** two scraper.tech SERP plans were bought this run; the product returns titles only (empty `url`/`description`) and is not fit for owner-finding. `search-owner.js` has no working backend. Do not wire another vendor without sign-off; walk `web-scrape-triage` Tier 2 first.

## Open items carried

- Finish the WebSearch sweep (784 of 856 leads remain) or dispatch it to a cheaper reader.
- Re-read all owner text with `owner-prompt.md` (model, not regex) before anything ships.
- Verify the 81 addresses via `email-verify-debounce-bounceban` on the operator's machine.
- 7 owner pages that 403 (corporate roll-ups) need a Tier-3 fetch off-container.
- Build `clay.csv` and the hand-off package; sweep shards/logs to `_archive/`.

## Deliverables ledger

| Date | Run | Rows shipped | Where |
|---|---|---|---|
| — | — | — | — |
