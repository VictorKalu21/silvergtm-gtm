# 2026-10-11_us-pool-builders — run notes

Client: Atlas Growth · Vertical: US residential in-ground swimming-pool builders · ICP: `../ICP-pools.md` ·
Config: `../atlas-growth-pools-config.json` (+ `../recover-generic-pools-config.json`) ·
Runsheet: `../atlas-growth-pools-runsheet.csv` from `../gen-runsheet-pools.js` (warm states, core queries by default) ·
Shards: `../shards-pools/shard-0..7.csv` · Owner prompt: `owner-prompt.md` (= `../owner-prompts/us-pool-builders.md`) ·
Classify prompt: `classify-prompt.md`. All data in this folder is gitignored.

## STEP 1 answers (operator, 2026-10-11)
- Client **atlas** (atlas-growth). Qualify **lenient** (no review floor, no website rule). Depth **warm states first**
  (18 states, 362 anchors). Owner-finding: SERP via **DataForSEO** once credentials + credit cap are set; emails via
  the same SERP rung (2e) + on-site harvest. Offer + target role PROPOSED in ICP-pools.md — sign-off pending.

## Pipeline (every step through the engine; commands relative to repo root)
1. Scrape: `bash <run>/run-shards.sh` (8 × `run-scrape.js` over `shards-pools/`, `RESUME=1` to resume) → `maps/shard-N/`.
2. Merge: `node <run>/merge-shards.js` → `maps/leads_clean.csv` + `coverage_summary.json` (must say ALL SHARDS COMPLETE).
3. Qualify: `qualify-leads.js --config ../atlas-growth-pools-config.json` → `leads_clean_qualified.csv`; then
   `qualify-leads.js --in excluded_officp.csv --config ../recover-generic-pools-config.json` → generic-type recovery;
   keyword recovery = `kw:pool` rows dropped `not_in_icp` → classify track. Union → `leads_qualified.csv`.
4. Geo gate: `footprint-gate.js --keep-domestic` (whole US is the footprint; foreign pins drop).
5. Dedupe: `build-netnew.js --client clients/atlas-growth` — prior shipped feeds are NOT on this container; operator to waive or supply.
6. Collapse: `collapse-domains.js --config ../atlas-growth-pools-config.json` → `leads_domains.csv` (spend) / `leads_nowebsite.csv` / `leads_annotated.csv`.
7. Site text: `fetch-sites.js --in leads_domains.csv --out owner --concurrency 12 --config ../atlas-growth-pools-config.json` (emails + socials captured).
8. STEP 5e: `prep-classify.js` → Haiku per batch with `classify-prompt.md` → `apply-classify.js --fallback unclear` →
   verdict map: inground_builder = **Qualified**; builder_unconfirmed + unclear = **Review**; the rest = **Exclude**.
9. Owner-finding (STEP 6): `search-owner.js` (DataForSEO backend, `--max-cost`) → `prep-owner-batches.js` → `owner-read`
   workflow → `merge-owner-reads.js --trade-words …` → BBB rung → sweep → `combine-owner-contacts.js`.
10. Emails: on-site harvest + SERP email rung + `email-waterfall`; verify MV → BB only on an explicit go.
11. Deliverable: `node <run>/assemble.js` → `deliverable/pool_builders_all.csv`, `_qualified.csv`, `_review.csv`, `_excluded.csv`,
    `summary.md` (totals, by state, by pool type, field fill %, coverage gaps) + `pool_builders.xlsx` (tabs).

## Gates
- READ-BACK (STEP 3): tile count, queries, qualify rules, DECISIONS block → operator go before the first API call.
- Drop-reason audit after qualify. Coverage summary must be COMPLETE before anything downstream.
- Credits (DataForSEO SERP, MillionVerifier, BounceBan) never spent without an explicit go and a cap.

## Log
- 2026-10-11 — scaffold; key validated (1 call); qualify rules dry-run on an 18-row fixture (see session transcript).
