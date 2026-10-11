# Atlas Growth — US restoration contractors — SHIPPED AS IS 2026-10-11, with these items PARKED

Operator decision 2026-10-11: "ship as is, and note what we are parking." The deliverable is
`restoration_qualified.csv` (11,558 residential restoration leads) plus `restoration_contacts.csv`
(every named decision-maker with verbatim evidence) and `summary.md`. The following rungs were not
completed and are parked, not dropped. Each has a ready-to-run entry point in the run folder.

## What shipped

| item | state |
|---|---|
| Qualified leads | 11,558 (Review 8,040 and Exclude 10,239 kept in their own files) |
| phone | 99.3% |
| website | 93.0% |
| street address | 82.4% |
| on-site email (generic, UNVERIFIED) | 35.3% (4,075) |
| named decision-maker | 883 (7.6%), 852 owner-level, all with verbatim evidence |
| BBB evidence (status, rating, accredited, profile URL) | 47.9% (5,534) |
| Facebook / Instagram URLs | 59% / 43% |
| franchise flag (`brand_family`) | 3,376 branches across 24 families, kept and flagged |

## PARKED 1 — owner names for the remaining 10,675 Qualified leads

- Why parked: in-session WebSearch is capped at 200 calls per user turn, shared across agents (~115 leads
  per turn). The first 200-lead tranche measured 45.5% named at 3.7 searches per named lead, so the
  pool is worth sweeping, but not by hand.
- State on disk: `owner/sweep3/batches/batch-{0..533}-in.json` queued (20 leads each), zero done;
  `owner/sweep3/AGENT-PROMPT.md` is the reader prompt (stops at the cap, omits unsearched leads).
- Resume paths:
  1. Raise `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION` on the environment → launch `sweep3` from batch 0
     in waves that fit the new cap → `merge-owner-reads.js --dir owner/sweep3 --out owner/contacts_sweep3.jsonl`
     → `combine-owner-contacts.js … contacts_read.jsonl contacts_sweep.jsonl contacts_sweep3.jsonl` → `assemble.js`.
  2. DataForSEO credentials + a spend go → `search-owner.js --mode standard --max-cost <usd>` over
     `owner/leads_unnamed.csv` (~2 queries/lead at $0.0018 ≈ $38) → `prep-owner-batches.js` with the
     SERP text → Haiku re-read (no WebSearch) → merge/combine/assemble as above.
- Expected lift at the measured rate: ~4,800 more named leads.

## PARKED 2 — email finding and verification

- Why parked: `email-waterfall` (QuickEnrich → pattern_seeded → finders) and the MillionVerifier +
  BounceBan gate need API keys in the skill `.env` files and an explicit spend go. None on this container.
- State on disk: `owner/contacts_final.csv` is the waterfall input (883 named contacts with root domains);
  the 4,075 on-site generic addresses in the deliverable are harvested, ranked, and UNVERIFIED —
  run `email-verify-debounce-bounceban` on them before any send.
- Entry point: `email-waterfall/SKILL.md` STEP 6e; blind permutation guessing stays OFF unless asked.

## PARKED 3 — BBB principals

- Why parked: BBB profile pages are Cloudflare-walled; `bbb-lookup.js --profiles` renders them through
  Firecrawl (paid per page, key `FIRECRAWL_KEY`, none on this container). 4,346 matched profiles would
  yield owner/principal names for the reader.
- State on disk: `owner/bbb.jsonl` with `profile_url` on every matched / low-confidence row.

## PARKED 4 — second-opinion verify on medium / low-confidence names (rung 4)

- 399 medium + 31 low confidence primaries have not had the second read. Contacts from the sweep that
  conflict (e.g. two different "owners" for one PuroClean branch) are flagged `needs_review` in
  `restoration_contacts.csv`. Run before the first send to those rows.

## PARKED 5 — the 8,040 Review rows and the 2,631 testing-only rows

- Review rows are `restoration_unconfirmed` / `unclear` reads of thin pages; re-admittable with a fetch
  of their L2 pages (Firecrawl) or a phone qualification. Testing-only (asbestos / lead / mold testing
  with no remediation tag) were excluded at the directory stage and are re-admittable at $0 by one
  config change if the offer widens.

## Housekeeping

- `fetch-sites.js` hang at the tail of a large run is logged OPEN in `skills/google-maps-scrape/IMPROVEMENTS.md`.
- The WebSearch per-turn cap is logged as a FACT entry there; the engine's `owner-sweep-subagent.md`
  should adopt the stop-at-cap rule (gated SKILL change, not made).
- Two stray empty remote sessions created by Haiku readers are the operator's to archive:
  `session_015pd3Bfrfd88hjhPptCGh4m`, `session_016DGsATpq9tko8KCB8PiHj8`.
