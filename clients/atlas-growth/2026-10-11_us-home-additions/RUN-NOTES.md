# 2026-10-11_us-home-additions — run notes

Client: Atlas Growth · Vertical: US residential home addition contractors · ICP: `../ICP-additions.md` ·
Config: `../atlas-growth-additions-config.json` (+ `../recover-generic-additions-config.json`) ·
Runsheet: `../atlas-growth-additions-runsheet.csv` from `../gen-runsheet-additions.js` (warm states, core queries by default;
anchors parsed from `gen-runsheet-pools.js`) · Shards: `../shards-additions/shard-0..7.csv` ·
Owner prompt: `owner-prompt.md` (= `../owner-prompts/us-home-additions.md`) · Classify prompt: `classify-prompt.md` ·
Source plan: `source-candidates.md`. All data in this folder is gitignored.

## Operator answers (2026-10-11)
- Phase 1 gate: client **atlas**, **warm states first**, qualify **lenient**, source **Google Maps**.
- Taken as routine calls (say so if wrong): kitchen/bath-only remodelers → **Review** (never Qualified on category alone);
  ADU-only builders → **Qualified**; cross-run dedupe **waived** (as the last two runs); offer line + target role as
  PROPOSED in ICP-additions.md.

## Pipeline (every step through the engine; commands relative to repo root)
1. Scrape: `bash <run>/run-shards.sh` (8 × `run-scrape.js` over `shards-additions/`, `RESUME=1` to resume) → `maps/shard-N/`.
2. Merge: `node <run>/merge-shards.js` → `maps/leads_clean.csv` + `coverage_summary.json` (must say ALL SHARDS COMPLETE).
3. Qualify: `qualify-leads.js --config ../atlas-growth-additions-config.json` → `leads_clean_qualified.csv`; then
   `qualify-leads.js --in excluded_officp.csv --config ../recover-generic-additions-config.json` → generic-type recovery
   (scoped to `not_in_icp` drops); keyword recovery = `kw:addition` rows dropped `not_in_icp` → classify track. Union → `leads_qualified.csv`.
4. Geo gate: `footprint-gate.js --keep-domestic` (whole US is the footprint; foreign pins drop).
5. Dedupe: `build-netnew.js --client clients/atlas-growth` — waived; run for the record.
6. Collapse: `collapse-domains.js` → `leads_domains.csv` (spend) / `leads_nowebsite.csv` / `leads_annotated.csv`.
7. Site text: `fetch-sites.js --in leads_domains.csv --out owner --concurrency 12 --config ../atlas-growth-additions-config.json`.
8. STEP 5e: `prep-classify.js` → Haiku per batch with `classify-prompt.md` → `apply-classify.js --fallback unclear` →
   verdict map: addition_builder = **Qualified**; remodeler_unconfirmed + unclear = **Review**; the rest = **Exclude**.
9. Owner-finding (STEP 6): `search-owner.js` (DataForSEO, `--mode standard`, `--max-cost`) → `prep-owner-batches.js` →
   `owner-read` workflow → `merge-owner-reads.js --trade-words …` (list in owner-prompt.md) → BBB rung → sweep → `combine-owner-contacts.js`.
   Free head start: the Qualified Remodeler Top 500 `leadership` field joined on domain (source-candidates.md #2).
10. Emails: on-site harvest + SERP email rung + `email-waterfall`; verify MV → BB only on an explicit go.
11. Deliverable: copy `../2026-10-11_us-pool-builders/assemble.js` + `build-xlsx.py` with the verdict map above once the pools run has proven them.

## Gates
- READ-BACK (STEP 3): tile count, queries, qualify rules, DECISIONS block → operator go before the first API call.
- Drop-reason audit after qualify. Coverage summary must be COMPLETE before anything downstream.
- Credits (scraper.tech tiles, DataForSEO SERP, MillionVerifier, BounceBan) never spent without an explicit go and a cap.

## Log
- 2026-10-11 — Phase 0–1 (icp-source-planner): ICP contract drafted, 8 candidate sources ranked, 14 keyless probes. $0.
- 2026-10-11 — STEP 2–3 + 6a: config, recovery config, runsheet (core: 361 anchors × 7 queries = 2,527 rows, 8 shards;
  full: 14 queries = 5,054 rows), owner prompt, classify prompt, run scripts. Qualify rules dry-run on an 18-row fixture
  (scratchpad): big box / civic / apartments / architect / handyman-primary / landscaper / pool / roofer-primary dropped;
  Remodeler, GC, custom builder, kitchen-bath remodeler, sunroom, garage builder kept for the text gate; bare-Contractor /
  Carpenter rows recovered on name; the roofer leak fixed by scoping the recovery to `not_in_icp`.
  **BLOCKED on the first API call: `SCRAPER_TECH_KEY` is not on this container** (`skills/google-maps-scrape/.env` absent);
  DataForSEO credentials absent too (needed at STEP 6, not now).
