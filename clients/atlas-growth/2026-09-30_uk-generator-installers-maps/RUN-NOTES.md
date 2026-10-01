# 2026-09-30_uk-generator-installers-maps — run notes

Operator ask (2026-09-30): "pull generator installers in uk — maps and clients/atlas-growth/ICP-generators-uk.md".
That resolves the ICP doc's GATE to **option B: generators only, Google Maps only** (no MCS battery spine).

## Built 2026-09-30 (no API calls, no key in the container)
- `../gen-runsheet-generators-uk.js` → `../atlas-growth-generators-uk-runsheet.csv` (885 rows), a 3-row
  calibration sheet, and 8 shards in `../shards-generators-uk/` (gitignored, regenerate with the script).
  The 177-tile grid is imported from `../gen-runsheet-uk.js`, which now exports its tile arrays
  (its own output is byte-identical to before — verified).
- `../atlas-growth-generators-uk-config.json` (4 rules) + `../recover-unrated-generators-uk-config.json`
  (3 rules); dry-run on an 18-row fixture in `dryrun-results.md`.
- `run-shards.sh` (refuses to launch without `SCRAPER_TECH_KEY`), `merge-shards.js` (copied unchanged
  from the 2026-09-16 UK maps run — `--run` defaults to this folder), `PIPELINE.md`, `GATE1.md`.
- `owner-prompt.md` = `../owner-prompts/uk-generator-installers.md` (built per STEP 6a; UK roles, Companies
  House authoritative, QS / sales-engineer / hire-desk traps).

## Operator go (2026-09-30)
Key supplied (in `skills/google-maps-scrape/.env`, gitignored) and "use floor 5". `generator shop` kept, offer
wording as the ICP doc. Still needed before PIPELINE STEP 5: the two UK foundation deliverables (gitignored)
restored into their run folders as the dedupe memory.

## Calibration (2026-09-30) — GATE1.md §6
`calibration/` (3 rows, 5 calls, 70 rows) + `calibration2/` (2-row probe of the London zero, 4 calls, 36 rows).
London-centre is a genuinely thin tile (0 and 5 rows on two queries) while Manchester gives 30–31 per query; the
universe is sparse and radius-expanded (national + 3 US pins). Config tuned from the evidence and re-qualified at $0.
**Full sheet launched 2026-09-30 via `run-shards.sh`** (885 rows, 8 workers, ≈1,600 calls expected).

## Probes
The calibration sheets are the probe (9 calls, output in GATE1 §6 and `calibration*/run_log.json`).

## Full run (2026-09-30) — funnel in GATE1.md §7
885 rows / 1,789 calls → 7,022 unique → qualify 2,138 + unrated 282 = 2,420 → geo 1,285 + 16 blank-address UK
recoveries = **1,301 in footprint** → collapse **1,146 owner-finding rows** + 81 no-website. The London
calibration zero was a transient `ok` empty response (51 rows on the full run) — GATE1 §6 corrected.
Job-side recovery `recovered_geo_blankaddr.csv`: 16 of 108 blank-address rows (UK phone or UK domain) appended to
`leads_clean_qualified_infootprint.csv` before collapse; the engine gap is the OPEN 2026-09-20 footprint-gate item.
**Stopped at GATE 3: dedupe memory absent, no owner-finding started, no credits spent beyond the 1,798 Maps calls.**

## Operator waiver (2026-09-30): cross-run dedupe
Operator: "waive". STEP 5c is skipped for this run (same call as the US generator run, 2026-09-24). Risk accepted:
an electrical contractor already in a UK foundation campaign could be contacted twice; the two prior UK lists are
damp/underpinning trades, so the overlap is expected to be small. Owner-finding proceeds on `leads_domains.csv`.
Site text: `fetch-sites.js --concurrency 12` over 1,146 domains → `owner/site_text.jsonl` (started 2026-09-30).
Fit classification prompt: `classify-prompt.md` (UK rubric; adds `hire_only`).

## STEP 5e fit classification (2026-09-30)
Site text: 1,146 domains fetched, **964 ok / 857 with >200 chars**; 182 failed (96 × 403, 33 TLS/TypeError, 19 × 503,
16 timeouts, 9 × 404, 9 other). `prep-classify.js` → 20 batches × 60; 883 with site text, 263 with none.
**First pass (Haiku, 20 readers)** audited and found unreliable: `plumber_gas_only` stamped on 60 generic plumbers
and hardware shops (1 of 61 mentioned a generator); online generator shops, a substation contractor, a marine
engineer and a fuel supplier as `residential_generator`; 57 `not_generator` rows whose text mentions generators
(one literally "generator installation"); Shenton Group in `hire_only`; templated `why` lines in batch 000; one
reader emitted an invented place_id and three rows were skipped; batches 001/006 were rewritten after the audit.
**Second pass (stronger model, 4 readers, `classify/second-opinion-prompt.md`)** over the 250 contested rows
(every residential verdict, every drop whose text mentions generators, every unclear-with-text, the 3 skipped):
**112 of 250 verdicts changed.** Merge rule: second pass wins; `plumber_gas_only` without a generator mention →
`not_generator`; 0 rows met the contest criteria after the rewrites without being covered.

**Final (`leads_classified.csv`, 1,146):** residential_generator **32** · commercial_only **60** · hire_only 32 ·
small_engine_shop 38 · not_generator 707 · unclear 277 (263 no text + 14). `leads_icp.csv` = 32,
`leads_commercial_only.csv` = 60. The UK residential standby-generator market is as small as
`ICP-generators-uk.md` warned ("low hundreds" was optimistic for homeowner-facing firms on Maps).

Three $0-ish levers, all operator decisions (GATE1 §8):
1. **Include `commercial_only` (60)** — UK generator installers who sell to businesses, farms and estates but
   never say "home". The offer's homeowner wording would need adapting.
2. **Re-admit the floor-5 drops that are generator-typed** — 254 `Electric generator shop` rows died as
   `too_small` (127 UK generator-named at 1–4 reviews, 109 with a website). The kept list was electrician-dense
   and the ICP-dense bucket sat below the floor. Costs free fetches + reads.
3. **Recover the 182 no-text sites** (96 are Cloudflare 403s → Scrapling, slow) — at the observed ~3% residential
   rate that is ~5 more leads; low value alone, worth it only alongside lever 2.

## Owner-finding + emails on the 32 ICP leads (2026-09-30)
Companies House (`companies-house.js`, key supplied 2026-09-30) over all 1,301 in-footprint rows: **822 matched
(63%), 816 with active directors**; basis exact_title 704 · postcode 74 · city_only 41 (demoted low_confidence) ·
name_overlap 3. On the 32 ICP leads: 20 matched, 0 low-confidence.
`prep-owner-batches.js --ch` → 1 batch of 32 → one Haiku read with `owner-prompt.md` → `merge-owner-reads.js`
(UK trade words; 0 guardrail drops) → `combine-owner-contacts.js`: **21 of 32 named (65.6%), all owner-level,
35 contacts (34 Companies House, 1 website)**. `owner/contacts_final.{jsonl,csv}`.
Emails (`build-email-candidates.js`, on-site harvest only — no waterfall, no credits): **26 of 32 leads with ≥1
address, 30 candidates, 2 on the named owner's own address** (colin@…, jim.newall@…), 24 company mailboxes.
`owner/emails_candidates.csv`, verdict blank — **verification needs MILLIONVERIFIER_KEY + BOUNCEBAN_KEY and an
explicit go** (email-verify-debounce-bounceban skill; ~30 MV credits + BounceBan on the catch-alls).
Then: `build-plusvibe.js base/prep/fill/check` with a UK personalize config (quote / site-survey wording).
