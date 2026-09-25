# Atlas Growth — campaign / pipeline state

**Client:** Atlas Growth · **Vertical:** residential foundation repair · **Opened:** 2026-09-11

## Status

| | |
|---|---|
| **New vertical (opened 2026-09-24)** | **US residential standby-generator installers** — ICP `ICP-generators.md`, run `2026-09-24_us-generator-dealers/`. OEM dealer lists (Generac 13,171 · Briggs 2,444 · Cummins 2,415 via Wayback · Kohler 1,626 · Champion 476) + nationwide Maps (5,041 calls → 6,870 qualified) → 21,680 combined leads. Name→domain: 3,441 websites recovered (789 free resolver + 2,652 Haiku web-verify, deterministic verifier drops invented domains); 16,194 root domains, 83% with usable site text (fetch → http:// rung → Playwright render → Scrapling). STEP 5e fit (Haiku + session-model second opinion): **16,515 ICP leads** (10,998 site verdict · 5,408 OEM-listed no text · 109 Maps generator-type no text). **Owner-finding STOPPED 2026-09-25 (operator: "that's high, stop and move to the next stage"): 7,746 of 16,515 named (46.9%), 7,603 owner-level** — `owner/contacts_final.jsonl`, 8,769 in `owner/leads_unnamed.csv`. **Email waterfall skipped (operator: "we already have emails")**: `build-email-candidates.js` ranks the addresses already on disk (OEM list + on-site + reader) with `email-rank.js` → `owner/emails_candidates.csv`: **14,260 leads with ≥1 address** (18,683 candidates), 6,724 of them named, 2,364 whose top address is built from the named contact's name. Unverified. **Verification queued in 3k tranches, dealer lists first; tranche 01 next (needs keys); 02–05 banked.** Full record below. Cross-run dedupe waived (operator). Rotate the scraper.tech key (pasted in chat 2026-09-24). |
| Current run | `2026-09-20_au-foundation-repair-maps` — **PLUSVIBE UPLOAD BUILT, NOT UPLOADED** (2026-09-21). 329 worked leads · 93 named · 217 with an email · verified 140/180 sendable · **`owner/plusvibe_upload.csv` 168 rows** (140 personalised from site text, 28 on fallbacks; 4 blank-city rows held in `plusvibe_upload_blankcity.csv`; 12 rows carry a first name under the name rule). Wording signed off 2026-09-21 (rectification for foundation repair). Sweep tranche 1 only (120 of 284 unnamed). All run data gitignored in the run folder. Store: places 5,118 · site_text 364 · registry 52 · contacts 89 · verdicts 180 · ledger 6. |
| Previous run (UK Maps) | `2026-09-16_uk-foundation-repair-maps` — owner-finding DONE (586/860 named). **Verification DONE 2026-09-17** (MillionVerifier → BounceBan, keys supplied by operator): 444 unique addresses → **370 sendable**, 39 risky, 35 dropped (20 of the drops are persistent MillionVerifier API errors, unverified not invalid). `deliverable/emails_final.csv` 468 rows (392 sendable incl. shared brand mailboxes). **Plusvibe upload BUILT and sent 2026-09-17**: `deliverable/atlas_uk_plusvibe_upload.csv`, **391 rows** (one per lead, sendable addresses only), 364 personalised from site text + 27 config fallbacks, **27 named** under the name rule (357 company mailboxes stay nameless), 0 flags, 0 blank cities after a job-side `owner/city_overrides.json` (42 rows), `check` passed. **Firecrawl residue pass 2026-09-17 (operator key):** 204 blocked sites → **141 recovered (69%)**, 146 credits; 55 unworked leads re-tiered A–C → Opus adjudication → **+29 ICP +9 damp-only = 898 worked leads**; CH + Haiku read on the 38 → **610 named (67.9%)**; emails **495 (55.1%)**, 469 unique, 25 new addresses verified (23 sendable / 2 risky) and **BounceBan recovery over the earlier MV invalid/error rows (operator directive): 18 recovered sendable** (5 of 15 invalid, 13 of 20 error), 7 risky, 10 dropped → **411 unique sendable of 469 (87.6%)**, `emails_final.csv` 435 sendable / 49 risky / 11 dropped. **Plusvibe upload REBUILT and sent: 435 rows** (44 new), 409 personalised, 29 named, 0 blank cities (46 overrides: 41 job-side + 5 after the new `city-fallback`), outcome flag now LIVE via `outcome_by_type` in the UK config, `check` passed. Facebook and UK-directory rungs are dead ends (probes in the source library). **Run closed out** — nine engine changes from it shipped 2026-09-17 with tests |
| Previous run (export) | `2026-09-16_uk-foundation-repair` — qualify + emails + owner-finding DONE on the operator's UK export; verification NOT run (no MillionVerifier/BounceBan keys) |
| Previous run (US) | `2026-09-11_foundation-repair` — closed out 2026-09-13 (US) |
| Runs shipped | none |
| Live campaigns | none |

## US generator run — full record (2026-09-24 → 2026-09-25, saved for piecemeal work)

Run folder `2026-09-24_us-generator-dealers/`. ICP `ICP-generators.md`. Config `atlas-growth-generators-config.json`
(+ `-dealers-config.json`). Owner prompt `owner-prompts/us-generator-installers.md` (= `<run>/owner-prompt.md`).
Data is gitignored; this section is how to pick it back up.

### Restore the data (FIRST, in any new session)
Operator holds **`atlas-gen-rundata-0925b.part00..05`** (sent 2026-09-25; supersedes the 2026-09-24 parts).
`cat atlas-gen-rundata-0925b.part0* > rundata.tar.gz` (sha256 starts `0eeaa19e38c66dd0`) →
`tar -xzf rundata.tar.gz -C clients/atlas-growth/`. Excluded as rebuildable: Maps raw shards, `site_text.main.jsonl`
(pre-merge; `owner/site_text.jsonl` is the merged best), the owner-new/-render/-retry/-scrapling fetch folders, logs.
Smaller alternative for verification + Plusvibe only: **`atlas-gen-verify-kit.tar.gz`** (6 MB: `leads_icp.csv`,
`owner/contacts_final.*`, `owner/emails_candidates.*`, `owner/leads_unnamed.csv`, `owner/verify/`). Plusvibe `prep`
also needs `owner/site_text.jsonl` (full archive).

### What was done (funnel)
| stage | result |
|---|---|
| OEM dealer locators (`pull/`) | Generac 13,171 · Briggs 2,444 · Cummins 2,415 (Wayback) · Kohler 1,626 · Champion 476 → 20,132 rows → 17,795 companies (union-find merge) → 16,942 after name deny |
| Google Maps (`maps/`) | 477 anchors × 5 generator-intent queries, 5,041 calls → 28,524 unique → 6,870 qualified (30+ reviews) |
| Combined | 21,680 leads (`leads_combined.csv`); name→domain recovered 3,441 websites |
| Site text | 16,194 root domains, 83% usable text (fetch → http:// → Playwright → Scrapling) |
| STEP 5e fit | **16,515 ICP leads** (`leads_icp.csv`): 12,928 dealer-list · 1,947 both · 1,640 Maps-only |
| Owner-finding (CLOSED 2026-09-25) | **7,746 named (46.9%), 7,603 owner-level** — `owner/contacts_final.jsonl`; 8,769 in `owner/leads_unnamed.csv`. Read 66/138 · sweep2 156/156 · sweep3 226/390 · sweep4 129/253 · sweep5 7/122 (the unrun batches stay queued) |
| Emails (no waterfall, operator 2026-09-25) | `build-email-candidates.js` → `owner/emails_candidates.csv`: **14,260 leads with ≥1 address**, 18,683 candidates, `rank` 1 = pick; 2,364 picks built from the named contact's name |
| Verification queue | `make-verify-tranches.js --size 3000` → `owner/verify/queue.csv` + `tranche_NN.csv` (dealer lists first, operator 2026-09-25) |

### Verification tranches (operator: "do 3k, bank the rest, dealer lists specifically")
| tranche | rows | content | status |
|---|---|---|---|
| **01** | 3,000 | dealer-list · 2,187 owner-name addresses + 813 named owners on company mailboxes (top OEM tiers first) | **DONE 2026-09-25: 2,688 leads sendable (89.6%; 1,954 on the owner's own address, 734 company) · 221 risky-only · 87 none.** MV 2,655 ok-or-recovered of 2,996; BB 991 calls (16 recovered from invalid); rank-2 fallback 51 addresses → 43 sendable. In `owner/emails_final.csv` |
| 02 | 3,000 | dealer-list · named owners on company mailboxes | banked — **next** |
| 03 | 3,000 | dealer-list · unnamed (38 named) | banked |
| 04 | 3,000 | dealer-list · unnamed | banked |
| 05 | 2,260 | 1,299 dealer-list tail + 961 Maps-only (177 personal, 686 named) | banked |

Tranche files are fixed once written (re-running the script appends new rows to the last tranche, never reshuffles).
Keys: `$HOME/Silver GTM Systems/ENVs-Secrets/email-verification.env` (outside the repo; recreate from the operator in a new container). Run one tranche:
```
IN=owner/verify/tranche_01.csv OUT_DIR=owner/verify/t01 EMAIL_VERIFY_ENV=<gitignored env with MILLIONVERIFIER_KEY, BOUNCEBAN_KEY> \
  node ../../../skills/email-verify-debounce-bounceban/scripts/verify-millionverifier-bounceban.js --concurrency 4
```
Cost per tranche ≈ 3,000 MV credits + BounceBan on catch-all/unknown/error/invalid (UK run: ~40% of MV rows went to BB).
After a tranche: `node finalize-tranche.js NN fallback` → verify `owner/verify/tranche_NNb.csv` into `owner/verify/tNNb`
→ `node finalize-tranche.js NN final` (upserts into `owner/emails_final.csv`; `build-plusvibe.js base` reads `verdict == sendable`). Mark the tranche DONE in the table above.

### Then Plusvibe (per tranche or at the end)
`build-plusvibe.js base --leads leads_icp.csv --emails owner/emails_final.csv --contacts owner/contacts_final.jsonl` →
`city-fallback` → `prep` → Haiku personalise → `fill` → `check`. **Config:** `personalize-config-generators.json` (3-lead test signed off 2026-09-25: electricians -> 'generator installation', 'HVAC and generators', original US offer line unchanged; the file is gitignored by `*.json`, force-add was blocked, so it lives only in the run archive/container until the operator adds it). **Next: 7-lead test**, then full fill of the tranche-01 base (`owner/plusvibe_base.csv`, 2,688 rows, 40 blank city). Was: the generator
`personalize-config.json` (offer in `ICP-generators.md`; `outcome_by_type` for residential_generator), agreed on a
3-lead then 7-lead test with the operator.

### Watch-outs carried
- Name rule's last-name-prefix match puts an owner on a trade mailbox (`cannon.electric@outlook.com` → Cody Cannon);
  engine rule, flagged not patched.
- A few OEM-listed small-engine shops survived 5e (e.g. CRANES OUTDOOR POWER EQUIPMENT); skim tranche 01 before upload.
- Two sweep3 outputs unparseable (batches 147, 197); rerunnable.
- Workflow runs cap at ~200 WebSearch calls; ≤7 sweep batches per run.
- **Rotate the scraper.tech key** (pasted in chat 2026-09-24).

## How to resume the AU run (written 2026-09-20, after owner-finding)

1. Read root `CLAUDE.md`, `skills/google-maps-scrape/README.md`, then this file, then the run's `RUN-NOTES.md` (last
   section) and `PIPELINE.md`. Data files are gitignored; without the run folder's CSV/JSONL on disk, the scrape,
   site text and adjudication are in the Supabase store (`store-sync.js pull-places / pull-site-text`) — 3,861 Maps
   calls are NOT re-bought.
2. Keys (never printed, never in a prompt): `SCRAPER_TECH_KEY`, `FIRECRAWL_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
   in `skills/google-maps-scrape/.env`; `MILLIONVERIFIER_KEY`, `BOUNCEBAN_KEY` still to be supplied.
3. **Finish the sweep (free, needs a fresh WebSearch budget):** batches 6–14 under `<run>/owner/sweep2/batches/` have no
   `-out.json`. Six batches per session at most: dispatch per `skills/google-maps-scrape/owner-sweep-subagent.md`
   (or `owner-sweep` workflow, `args {run, batchIds:[6,7,8,9,10,11]}`), then
   `node skills/google-maps-scrape/merge-owner-reads.js --dir <run>/owner/sweep2 --out <run>/owner/contacts_sweep.jsonl --exclude-titles "<list in RUN-NOTES>"`,
   `node skills/google-maps-scrape/combine-owner-contacts.js --leads <run>/leads_qualified.csv --out <run>/owner/contacts_final.jsonl <read> <read_residue> <eponym> <sweep>`,
   `python3 <run>/assemble_deliverable_au.py`. Delete any `-out.json` a budget-starved agent wrote with 0 searches.
4. **Verification DONE 2026-09-21** (MillionVerifier → BounceBan, 180 unique addresses: 140 sendable · 27 risky · 13 dropped;
   `deliverable/emails_final.csv` carries the verdicts; store `verdicts` + ledger written). Keys are in
   `$HOME/Silver GTM Systems/ENVs-Secrets/email-verification.env`. If a re-run is ever needed, the agent must call it
   through `<run>/run_verify.sh` (the permission classifier refuses the bare command as a paid transaction).
5. **Plusvibe upload ready:** `<run>/owner/plusvibe_upload.csv` (168 rows; `check --csv` clean). Upload is the operator's step
   (no Plusvibe API on this run). Optional follow-ups: the 4 blank-city rows in `plusvibe_upload_blankcity.csv` (give them a
   town by hand or drop them); the 32 fallback rows read "underpinning / site inspections" — fine for the trade, listed in
   `fill_report.json`; the 164 unswept leads (step 3) would add names, not emails.
6. Engine gaps found this run are in `skills/google-maps-scrape/IMPROVEMENTS.md` (2026-09-20 index) — fix with a test and
   an operator go, not in the run folder.
## How to resume in a new session (written 2026-09-16)

1. Read root `CLAUDE.md`, then `skills/google-maps-scrape/README.md`, then this file.
2. The run's gitignored data (site text, owner batches, contacts, emails, the Plusvibe upload) is NOT in the repo. It was
   sent to the operator as `atlas-growth_rundata_essentials.tar.gz` (19 MB) on 2026-09-16: everything except the raw
   scrape shards (`shard-*`, `recover/`, ~370 MB, recreatable by re-running the scrape at API cost). Unpack it into
   `clients/atlas-growth/` before touching the run; without it, owner-finding and the waterfall start from zero.
   The MAPS run has its own tarball, sent 2026-09-17: **`atlas-growth_uk-maps_rundata_essentials.tar.gz`** — same rule,
   the raw scrape dirs (`shard-*`, plus `recover/` / `rebuy/`) were **excluded** as recreatable at API cost. Unpack it into
   `clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/` before resuming that run.
3. API keys are in the operator's gitignored env file, never in the repo. Credits are never spent without an explicit go.
4. Open decisions: the second Plusvibe email needs a `company_short` variable (plan agreed, not built); paid email finders
   as 50-contact probes; the ~1,000-lead pull. Standing directives are in "Client directives" below.

## Owner-finding, 2026-09-17 session (Companies House pass 2 + sweep prep)

- **483 of 860 named** after both reads (`primary_name` non-empty). 377 unnamed: qualified 287 /
  damp_only 82; 210 had site text and 159 did not; 224 have no Companies House record at all.
- **8 read records hold a "contact" that is not a person** ("West Yorkshire", "Home About Damptec")
  with `primary_name` blank. `combine-owner-contacts.js` drops them, `prep-sweep-batches.js` would
  have skipped them — `build_have.py` puts them back in the queue. See the IMPROVEMENTS entry.
- **Companies House pass 2** (`ch_second_pass.py`, now repeat-`--have` + a city-only demotion of its
  own): 102 of 377 matched with directors (27%), 96 on exact-title equality. The wins are the leads
  the engine matched to the WRONG company — `Derbyshire Damp Services` was on DERBYSHIRE COMPUTER
  SERVICES LTD and is now on DERBYSHIRE DAMP SERVICES LTD; `Southern Damp Proofing` was on
  ABOVEWATER DAMP PROOFING LTD. 55 of the 102 are brand branches resolving to the national parent
  and are excluded from the re-read.
- **Next:** 2 pass-2 read batches (free) → merge → rebuild `--have` → re-run the sweep prep → sweep
  tranche 1. All of it is written out in `SWEEP-PLAN.md`.

## Where the 2026-09-16 UK MAPS run stands (2026-09-17, end of session)

Our own UK scrape. Scripts + the reports in the run folder are tracked; all data (`leads_*.csv`,
`owner/`, `deliverable/`) is gitignored.

| Stage | State | Numbers |
|---|---|---|
| Scrape (177 tiles × 10 queries, 8 shards, pagination on) | done | 22,193 unique · 4,620 calls · 2.61 calls/row · 20 heal passes, 0 unhealed · 87 `ok`+0 events, 36 re-bought (+295) |
| Qualify + recoveries (GATE 3 P1–P8 applied) | done | main 2,057 + generic recovery 441 + unrated recovery 344 = **2,842** |
| Footprint gate + cross-run dedupe + collapse | done | 2,842 → 1,969 → **1,770 net-new** (199 dropped: 109 id + 89 host + 1 phone) → 1,469 spend rows + 146 no-website |
| Site text (+ Scrapling rung on the 403s) | done | 1,245 of 1,469 ok (**~85%**); 224 residue (15.2%): 157 challenge-class, 128 thin shells, 67 dead. Ceiling is this egress: the Turnstile host is blocked |
| Keyword tiers + model adjudication | done | A 246 · B 632 · C 117 · D 775; tier-D 100-row seeded sample **0 ICP of 100** → **686 ICP + 174 damp-only** |
| Emails (on-site only — this scrape has no Maps email column) | done, **unverified** | engine harvest 35% ICP → deep harvest **314/686 (46%)** ICP and **145/174 (83%)** damp-only; final **468/860 (54.4%)**, **444 unique best addresses**, 39 person-shaped |
| Companies House (engine pass + demotion) | done | **431/860 authoritative** (50.1%) + 189 candidates = 620 with a name on the table (72%); 83 city-only matches demoted job-side (~21% wrong path) |
| Owner reads (free, in-session Haiku) | done | site-text **380/598** · CH-only **103/192** · CH pass-2 **46/47** → **529 of 860 named (61.5%)** |
| Companies House pass 2 | done | 377 re-searched → 102 with active directors (96 exact-title); 55 brand branches skipped; 47 read |
| LinkedIn sweep (`--registry linkedin.com`) | **done** | 17 batches over 331 leads, ~470 WebSearch calls → **70 named (21%)**; tranche yields 23/100 · 22/100 · 24/100 · 5/31 (flat) |
| **Combined named** | **done** | **586 of 860 (68.1%)** after the same-company QA (599 before it, 13 branch/wrong-company matches removed). Sources: **CH 504 · web search + SERP 68 · website 12 · email local part 2**. **Named + email: 367 (42.7%)** |
| Verification (MillionVerifier → BounceBan) | **done 2026-09-17** (operator go + keys) | 444 unique addresses → **370 sendable** (83%), 39 risky (catch-all, excluded from the send), 35 dropped (15 invalid + 20 persistent MillionVerifier API errors, unverified not invalid). `deliverable/emails_final.csv` 468 rows: 392 sendable / 40 risky / 36 dropped incl. shared brand mailboxes. Spend: 444 MV + 118 BB credits |
| Plusvibe upload (STEP 7b) | **done 2026-09-17** | 3-lead → 7-lead → full fill on the operator-approved UK config (`personalize-config-uk.json`; 'structural waterproofing → basement surveys' per operator). 10 Haiku batches → **391 rows, 364 personalised, 27 fallback-only** (no site text), **27 named**, 0 of 4 flags, `redo` 0. Trades: damp proofing 273 · structural repairs 44 · mini piling 26 · structural waterproofing 20 · basement waterproofing 17 · underpinning 9 · subsidence repair 2. **41 blank cities** after the fill (no-address listings; the reader returned blank even where a footer address existed) cleared job-side: focused Haiku re-read of the site text 20/31 → keyless Nominatim reverse geocode at town level (3-call probe: Stockport / Fylde / Rotherham, <1 s each; district-level answers such as 'Fylde' or 'Mole Valley' rejected) → county / the area in the business name. One reader value carried a newline + tagline (`Hastings \nProud To Be…`) that `fill` passed through — patched in the batch output, filed in IMPROVEMENTS. `check --csv`: 0 name-rule violations, 0 unfilled placeholders |

Deliverables sent 2026-09-17 (see the ledger); verification and the Plusvibe upload are done, the
run is closed. Open: three engine fixes from this run are filed OPEN in
`skills/google-maps-scrape/IMPROVEMENTS.md` and need operator approval + a test (city-only CH
demotion, sibling-domain + person-shape email ranking, the `prep-owner-batches.js` skip order); 8
read records hold a junk "contact" with a blank `primary_name` (see the same file). The engine
write-back for this run was applied on 2026-09-17 from
`clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/WRITEBACK-DRAFT.md`.

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

- **Generators: cross-run dedupe against the foundation runs waived** (operator, 2026-09-24) — different trade; history not in the cloud container.
- **The whole pipeline lives in `google-maps-scrape`, for every vertical and every source** (operator, 2026-09-24). Non-Maps sources (OEM dealer locators, permits, registries) are fine as list sources, but their rows are normalised into the engine and run qualify → dedupe → site-text fit → **owner-finding → emails → Plusvibe upload**. A list that stops before owner-finding is not a deliverable.
- **Generators: commercial/industrial-only firms are dropped** (operator, 2026-09-24). Same offer as foundation repair, reworded for generator estimate appointments.
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
| 2026-09-17 | 2026-09-16_uk-foundation-repair-maps | `deliverable/atlas_uk_foundation_repair_maps_qualified.csv` (**860 rows**, 686 ICP + 174 damp-only, 586 named / 68.1%, 468 with an unverified email), `deliverable/contacts_all.csv` (852 contacts), `deliverable/verify_input.csv` (444 unique addresses), `excluded_adjudication.csv`, `atlas-growth_uk-maps_rundata_essentials.tar.gz` | sent in session |
| 2026-09-17 | 2026-09-16_uk-foundation-repair-maps | `deliverable/pca_members_contractors.csv` (397 PCA contractors with filed email, from the trade body's hidden API; unverified) | sent in session |
| 2026-09-17 | 2026-09-16_uk-foundation-repair-maps | final: `deliverable/atlas_uk_plusvibe_upload.csv` (**435 rows**, 409 personalised, 29 named, 0 blank cities, check passed), `deliverable/emails_final.csv` (495 rows: **435 sendable** / 49 risky / 11 dropped; 25 MV + 4 BB credits for the new addresses, 35 BB credits for the invalid/error recovery) | sent in session |
| 2026-09-17 | 2026-09-16_uk-foundation-repair-maps | after the Firecrawl residue pass: `deliverable/atlas_uk_foundation_repair_maps_qualified.csv` (**898 rows**, 610 named, 495 with email), `deliverable/emails_final.csv` (495 rows: 392 sendable / 40 risky / 36 dropped / **27 unverified**), `verify/verify_input_residue.csv` (25 new addresses, awaiting go) | sent in session |
| 2026-09-17 | 2026-09-16_uk-foundation-repair-maps | `deliverable/emails_final.csv` (468 rows: **392 sendable** / 40 risky / 36 dropped after MillionVerifier → BounceBan), `deliverable/atlas_uk_plusvibe_upload.csv` (**391 rows**, one per lead; 27 with first/last; personalized_email on every row, 364 from site text, 27 fallbacks; 0 blank cities), `deliverable/city_overrides.json` (42 job-side city fixes) | sent in session |
