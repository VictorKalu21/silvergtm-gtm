# Atlas Growth — campaign / pipeline state

**Client:** Atlas Growth · **Vertical:** residential foundation repair · **Opened:** 2026-09-11

## Status

| | |
|---|---|
| Current run | `2026-09-11_foundation-repair` — **pre-scrape, awaiting GATE 1 approval** |
| Runs shipped | none |
| Live campaigns | none |

## Dedupe memory — READ THIS BEFORE RUN 2

This is a **brand-new client**, so `build-netnew.js` reporting `ref files used: 0 | prior place_ids: 0`
is **valid for the 2026-09-11 run and for that run only.**

**From run 2 onward, `ref files used: 0` means the history is MISSING — stop, do not enrich.**
Re-contacting leads already sitting in a live campaign burns the relationship and the sending domain.

The dedupe memory for this client is `leads_annotated.csv` from each shipped run. This repo cannot
hold it (CSV outputs are gitignored, and run containers are ephemeral), so it lives wherever the
operator filed the hand-off. **Before run 2: either restore that file into `clients/atlas-growth/`,
or stand up the durable ledger** (a `place_id, website_host, run_slug` table + a
`build-netnew.js --ref-*` flag) — decided but not built.

## Client directives (standing)

- **Keep roll-ups and franchises, flag the brand.** Do not add a chain drop.
- **Footprint is HQ address**, with Memphis / Chattanooga / Jacksonville admitted as border metros.
- **SERP vendor on hold.** Victor is evaluating Firecrawl / Exa / others; `search-owner.js` is dead
  (scraper.tech discontinued its SERP product). Owner-finding v1 is website text only. Do not wire a
  vendor without his sign-off.

## Deliverables ledger

| Date | Run | Rows shipped | Where |
|---|---|---|---|
| — | — | — | — |
