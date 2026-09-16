# Atlas Growth — campaign / pipeline state

**Client:** Atlas Growth · **Vertical:** residential foundation repair · **Opened:** 2026-09-11

## Status

| | |
|---|---|
| Current run | `2026-09-16_uk-foundation-repair-maps` — scrape COMPLETE (22,193 universe, 4,620 calls). GATE 3 rules applied; funnel v2 1,770 net-new. Adjudication DONE (45 Opus batches): **686 ICP** (421 yes + 265 unclear) + **174 damp-only segment** + 910 excluded (tier D 0/100 yes → dropped). On-site emails: 240 of 686 (no Maps email field on a live pull). UK owner prompt built (`owner-prompts/uk-foundation-repair.md`) — **at GATE 6**; Companies House pass + contact-page email harvest running; Haiku reads await prompt approval |
| Previous run (export) | `2026-09-16_uk-foundation-repair` — qualify + emails + owner-finding DONE on the operator's UK export; verification NOT run (no MillionVerifier/BounceBan keys) |
| Previous run (US) | `2026-09-11_foundation-repair` — closed out 2026-09-13 (US) |
| Runs shipped | none |
| Live campaigns | none |

## How to resume in a new session (written 2026-09-16)

1. Read root `CLAUDE.md`, then `skills/google-maps-scrape/README.md`, then this file.
2. The run's gitignored data (site text, owner batches, contacts, emails, the Plusvibe upload) is NOT in the repo. It was
   sent to the operator as `atlas-growth_rundata_essentials.tar.gz` (19 MB) on 2026-09-16: everything except the raw
   scrape shards (`shard-*`, `recover/`, ~370 MB, recreatable by re-running the scrape at API cost). Unpack it into
   `clients/atlas-growth/` before touching the run; without it, owner-finding and the waterfall start from zero.
3. API keys are in the operator's gitignored env file, never in the repo. Credits are never spent without an explicit go.
4. Open decisions: the second Plusvibe email needs a `company_short` variable (plan agreed, not built); paid email finders
   as 50-contact probes; the ~1,000-lead pull. Standing directives are in "Client directives" below.

## Where the 2026-09-16 UK run stands (2026-09-16, end of session)

Input: operator upload `60174952-Uk_Foundation_Repair-all.csv` (5,999 rows). Scripts + `RUN-NOTES.md` in the run
folder are tracked; data (`leads_*.csv`, `owner/`, `deliverable/`) is gitignored and was sent in session.

| Stage | State | Numbers |
|---|---|---|
| Stage A dedupe + non-trade/supplier deny ($0) | done | 5,999 → 2,865 universe (862 dup place/domain, 1,658 not a trade, 524 supplier, 90 non-trade primary) |
| Site text | done | 2,733 fetched: 2,339 ok, 394 failed (271 × 403 — block the container's egress IP; Scrapling stealth + Wayback + Jina all failed in-container) |
| Qualify (keyword tiers → Sonnet read of tiers A+B+C + 100-row D sample; geo gate) | done | **175 ICP**: 159 yes + 16 unclear-kept · 37 US pins dropped · 540 adjudicated no · 8 brand-flagged (Peter Cox, Prokil, DampMaster…) · 0 under review floor 30 |
| Emails (Maps vs on-site, best per company) | done | 151 of 175 have an email (6 person-shaped, 97 named generic, 48 other); universe-wide the site added 211 new emails and confirmed 1,129 of 1,637 Maps emails |
| Owner-finding (CH engine + low-conf officers + 6 Haiku reads; CH pass 2; LinkedIn-restricted Haiku sweep) | done | **138 of 175 named (79%)**, 133 owner_or_partner; sources: CH 95 + CH pass-2 17 + web search 16 + site 7 + email local part 3; 4 wrong CH matches caught and dropped |
| Named + email | — | 119 (82 generic mailbox, 31 other, 6 personal) |
| Verification (MillionVerifier → BounceBan) | **NOT RUN** — needs keys + explicit go | `deliverable/verify_input.csv`: 151 unique emails (~151 MV + ~50 BB credits) |

Deliverables sent 2026-09-16: `deliverable/atlas_uk_foundation_repair_qualified.csv` (175 rows, one per lead, with
service_bucket, adjudication reason, email comparison columns, primary contact + role bucket + evidence, qa_flags),
`deliverable/contacts_all.csv` (208 contacts), `deliverable/verify_input.csv`, `excluded_officp.csv` (every drop with a
reason). QA flags to read before sending: `sweep_named_verify_before_send` (16), `icp_unclear` (16), `brand` (8).

Open: recover the 271 blocked sites off-container (Firecrawl or a residential IP) and re-run stages B–C on them;
UK owner-prompt variant not yet saved to `owner-prompts/` (run used the US prompt + UK notes in the dispatch).

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
| Email waterfall, FULL RUN | **done 2026-09-13**: 791 contacts → 122 sendable (QuickEnrich 120, seeded pattern 2); 127 QE + 138 MV + 41 BB credits. QuickEnrich 152 credits left | `owner/emails_final.csv` rebuilt |
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

## Next run (decided in principle, not started)
Operator wants ~1,000 leads; at this run's rates that is ~4,700 ICP leads if "leads" means emailable, or a wider
footprint/category pull if it means scraped. Needs: QuickEnrich paid plan (152 trial credits left), a 50-contact probe
of one paid finder on the misses before widening, and the registry rung first in any LA/AR-heavy footprint.

## Plusvibe upload (2026-09-13, done)

Built with `google-maps-scrape/build-plusvibe.js` (STEP 7b): `base` → `prep` → Haiku subagent per batch on
`clients/atlas-growth/personalize-config.json` → `fill` → `redo` until empty → `check`. Final: 236 rows, 142 named
(`name_basis=local_match`; a name rides an address only when the local part is built from it — role mailboxes and
free-mail company inboxes are nameless by rule), 0 name-rule violations, 0 flags, 0 blank cities. 10 batches: 0-6
first pass (batch 4 gave 26 foundation-repair shops 'waterproofing'; batch 3 repeated the trade phrase), 7-9 redos
from the fill flags. Job tuning kept in the run: `owner/city_overrides.json` (tile labels like 'Houston Spring' →
metro; 17 no-address listings from the model's site read, else a keyless Nominatim reverse-geocode at town level,
else the county). 36 leads had no site text and carry the config fallbacks ('foundation repair / foundation
inspections / repair') — they are counted, not hidden. The config's per-trade tables now carry every correction the
redo prompts needed, so the next run's first pass should flag stragglers, not batches.

## Open items carried

- Paid finders (TryKitt paid bot, Hunter, Findymail) are the next rungs when budget allows: 50-contact probe each, fed only the misses. AI Ark parked (trial quota + 400s). BounceBan is ON for the full run.
- 7 corporate roll-up owner pages that 403 need a Tier-3 fetch off-container (low value: brand-flagged).
- Hand-off package + sweep shards/logs to `_archive/` at close-out.

## Deliverables ledger

| Date | Run | Rows shipped | Where |
|---|---|---|---|
| 2026-09-12 | 2026-09-11_foundation-repair | `contacts_final.csv` (845 named leads, 1,034 contacts), `leads_unnamed.csv` (259) | sent in session |
| 2026-09-13 | 2026-09-11_foundation-repair | `emails_final.csv` (275 verified sendable addresses on 236 leads; 172 personal) | sent in session |
| 2026-09-13 | 2026-09-11_foundation-repair | `plusvibe_upload.csv` (236 rows, one per lead; 142 with first/last; personalized_email on every row, 200 from site text, 36 fallbacks) | sent in session |
