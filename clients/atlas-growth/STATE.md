# Atlas Growth — campaign / pipeline state

**Client:** Atlas Growth · **Vertical:** residential foundation repair · **Opened:** 2026-09-11

## Status

| | |
|---|---|
| Current run | `2026-09-11_foundation-repair` — scrape COMPLETE, qualified, owner-finding partial, **no `clay.csv` built yet** |
| Runs shipped | none |
| Live campaigns | none |

## Where the 2026-09-11 run stands (2026-09-12, end of session)

| Stage | State | Numbers |
|---|---|---|
| Scrape | complete, 8/8 shards, 0 unhealed tiles | 1,410 tiles |
| Qualify + geo + dedupe + collapse | complete | 1,624 representatives → **1,104 ICP** (68%) |
| Clay feed spine | built | 1,521 rows |
| Owner prompt (STEP 6a) | built, in `owner-prompts/foundation-repair.md` and the run folder | — |
| Owner-finding, model read of on-disk text (flow 2b) | complete, 23 Haiku batches | 221 named of 901 with evidence |
| Owner-finding, web-search sweep (flow 2c) | complete, 5 tranches, 64 Haiku batches | 624 named of the 883 swept |
| **Named decision-maker, combined** | `owner/contacts_final.{jsonl,csv}` | **845 of 1,104 (76.5%)**, 807 owner-level, 1,034 contacts |
| Unnamed | `owner/leads_unnamed.csv` | 259 (phone + generic mailbox only) |
| Email verification | complete via MillionVerifier → BounceBan | 81 tiered addresses → **73 sendable**, 7 risky, 1 dropped; 49 of the sendable belong to a named lead |
| Email waterfall, FULL RUN (go given 2026-09-13) | **running**: QuickEnrich → seeded pattern (no blind guessing) → MillionVerifier + BounceBan on all 785 named contacts (679 owners + 106 colleagues, 681 domains); results land in `owner/waterfall_full/`. Then merge into `owner/emails_final.csv` | — |
| Email waterfall, 100-contact test | **100-contact test complete; AI Ark parked** (retry returned 400 on every search and re-hit the trial quota after ~40 requests, 99 credits left): QuickEnrich 18 + pattern 15 = **33 sendable of 100** with BounceBan on; TryKitt free tier 0/58 (needs funding). Company mailboxes 69/82 sendable. LA/AR licence boards 9/11 sendable. All in `owner/emails_final.csv` | QuickEnrich: 21 real emails / 100, 12 sendable after MillionVerifier, 7 catch-all kept as risky (BounceBan off by operator decision), 8 empty records free. 21 QE + 22 MV credits spent. 796 named leads still need an email |
| `clay.csv` | **not built** | — |

Precision audit (30 random sweep-named leads re-searched independently): 25 confirmed, 3 consistent on partial name, 2 unconfirmable, 0 wrong. Read grounding 99% (evidence verbatim in source). Every contact carries a verbatim evidence quote and passed the merge guardrails (evidence contains the name, role in the
enum, no role or trade word in a name, full name, EXCLUDE title dropped). The earlier regex-extracted contact files
(`contacts_all.*`, `roster_contacts`, `serp_contacts`, `sweep.jsonl`, `site_recovered.jsonl`) are superseded; do not ship them.

Spend this session: ~6.3M Haiku subagent tokens (read 2.1M, sweeps 4.1M), 56 MillionVerifier credits, 28 BounceBan credits.

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
- **Do not spend verification or enrichment credits without an explicit go.** (Go 2026-09-12: 100-contact test. Go 2026-09-13: full run on all named contacts, QuickEnrich + seeded pattern + MV + BB. **No blind pattern guessing** — operator had quality problems with it.)
- **No Clay.** Not as the owner reader, not as the email waterfall, not as a hand-off (operator, 2026-09-12).
- **SERP vendor:** two scraper.tech SERP plans were bought this run; the product returns titles only (empty `url`/`description`) and is not fit for owner-finding. `search-owner.js` has no working backend. Do not wire another vendor without sign-off; walk `web-scrape-triage` Tier 2 first.

## Open items carried

- **Finish the full waterfall run** and rebuild `emails_final.csv` (currently 183 sendable addresses on 172 leads before the full run). Paid finders (TryKitt paid bot, Hunter, Findymail) are the next rungs when budget allows: 50-contact probe each, fed only the misses. AI Ark parked (trial quota + 400s). BounceBan is ON for the full run.
- Owner-finding rung order is PROPOSED, not approved (see google-maps-scrape IMPROVEMENTS); the operator chose option 1 (cheap read + cheap sweep + double-check on shaky rows, no session-model rung) in discussion, not yet written into the skill.
- Build `clay.csv` (`build-clay-csv.js`) once the operator decides whether Clay still runs the owner column or takes `contacts_final` as-is.
- 7 corporate roll-up owner pages that 403 need a Tier-3 fetch off-container (low value: brand-flagged).
- Hand-off package + sweep shards/logs to `_archive/` at close-out.

## Deliverables ledger

| Date | Run | Rows shipped | Where |
|---|---|---|---|
| — | — | — | — |
