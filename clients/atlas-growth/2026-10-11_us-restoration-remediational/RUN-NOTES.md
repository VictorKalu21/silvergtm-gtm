# 2026-10-11_us-restoration-remediational — run notes

Client: Atlas Growth · Vertical: US residential water / mold / fire restoration contractors · ICP: `../ICP-restoration-us.md` ·
Config: `../atlas-growth-restoration-config.json` · Source: remediational.com directory (web-scrape-triage, $0; library
profile `skills/icp-source-planner/library/remediational-directory--us-restoration-contractors.md`) ·
Owner prompt: `owner-prompt.md` (= `../owner-prompts/us-restoration-contractors.md`) · Classify prompt: `classify-prompt.md`.
All data in this folder is gitignored.

## STEP 1 answers (operator, 2026-10-11)
- Client **atlas-growth**. Footprint **all 506 metros** (nationwide). Review floor **0**. No website rule.
- Operator ask: "a qualification step to confirm if they are residential" → STEP 5e site-text classify (`classify-prompt.md`),
  then owner-finding; no emails exist on the source, so STEP 6e (email-waterfall) is unavoidable and gated on a go.
- Offer + target role PROPOSED in `ICP-restoration-us.md` — sign-off pending. New trade-specific exclusion: the restoration
  "marketing representative" (route sales), never a buyer.

## Source (web-scrape-triage, probe output in the session transcript)
- Tier 0: `GET /data/places.json` (4.1 MB) → 29,837 rows: name, path, city, state, zip, lat/lng, 12-tag services bitmask,
  rating, review count, 24/7 flag. One call.
- Tier 1: per-listing JSON-LD `LocalBusiness` → phone, website (`sameAs`), street, Google Maps CID, % five-star, the
  business's own profile description. Static Netlify, no anti-bot, ~18 pages/s at concurrency 6 (~27 min for all rows).
- Merged file: scratchpad `remediational/remediational_merged.csv` (gitignored; rebuildable from the two rungs above).

## Pipeline (every step through the engine; `bash <run>/pipeline.sh [step]`, commands relative to repo root)
1. Import (job-side, no engine logic): `import-remediational.js` → `leads_clean.csv` in the engine's column set.
   `place_id = cid:<Google Maps CID>`; the 12 directory tags → pseudo `google_types` (config `categories`); `city = "City, ST"`.
2. Qualify: `qualify-leads.js --config ../atlas-growth-restoration-config.json` → `leads_clean_qualified.csv` + `excluded_officp.csv`.
   Rules: name deny (never-a-buyer entities) + allow on any remediation tag. **No review floor** (operator).
3. Geo gate: **NOT RUN** — directory import has no runsheet tiles; every row carries a US state + ZIP from the source.
4. Dedupe: `build-netnew.js --client clients/atlas-growth` — prior shipped feeds are NOT on this container; run for the record
   (same posture as the pool run); operator to waive or supply.
5. Collapse: `collapse-domains.js --config …` → `leads_domains.csv` (spend) / `leads_nowebsite.csv` / `leads_annotated.csv`
   (`brand_family` + `location_count` — the franchise flag).
6. Site text: `fetch-sites.js --in leads_domains.csv --out owner --concurrency 12 --config …` (emails + socials captured).
7. STEP 5e: fan site text to domain siblings → `prep-classify.js` → Haiku per batch with `classify-prompt.md` →
   `apply-classify.js --fallback unclear` → verdict map: residential_restoration = **Qualified**; restoration_unconfirmed +
   unclear = **Review**; commercial_only / inspection_only / cleaning_only / adjacent_trade / not_restoration = **Exclude**.
8. Owner-finding (STEP 6): `prep-owner-batches.js` on the Qualified set → `owner-read` (Haiku per batch) →
   `merge-owner-reads.js --trade-words …` → BBB rung (`bbb-lookup.js`) → sweep tranche → `combine-owner-contacts.js`.
   SERP (`search-owner.js`, DataForSEO) only if credentials are in the skill `.env` and a `--max-cost` is agreed.
9. Emails: on-site harvest + `email-waterfall`; verify MV → BB only on an explicit go.
10. Deliverable: job-side assembly → `deliverable/restoration_all.csv`, `_qualified.csv`, `_review.csv`, `_excluded.csv`, `summary.md`.

## Gates
- READ-BACK: qualify rules + DECISIONS block (offer, target role, franchise posture, testing-only drop) → operator.
- Drop-reason audit after qualify. Credits (DataForSEO, MillionVerifier, BounceBan) never spent without a go and a cap.

## Log
- 2026-10-11 — scaffold; source probed (3-call: 200/200 + 2 hand-guessed 404s, no rate-limit headers); Tier 0 pulled;
  Tier 1 enrichment running in the session scratchpad.
- 2026-10-11 — Tier 1 enrichment DONE: 29,837/29,837 listings (100% 200). Import → qualify **29,837 → 25,005** (name_deny 2,201 · not_in_icp 2,631) → dedupe (0 prior feeds) → collapse **13,842 representatives + 6,982 siblings + 4,181 no-website**.
- 2026-10-11 — `fetch-sites.js` 13,842 domains @12: **12,078 ok (87%)**; 462 TypeError · 313 503 · 297 404 · 290 403 · 267 AbortError · 47 500 · 16 429. Process HUNG at 13,840 (no log for 15 min, 37% CPU) and was killed; PASS 2 (free retry, 662 transient rows) never ran — IMPROVEMENTS.md entry (MEDIUM, OPEN). Thin/failed pages fall back to the directory profile description (`build-classify-text.js`: 10,566 site · 2,613 profile · 661 no text).
- 2026-10-11 — STEP 5e classify, Haiku per 100-lead batch (20 concurrent, ~6 min each): no-website set 21 batches (2,087 rows with a profile description) · wave 1 51 · wave 2 45 (13 rows re-run in wave 3) · wave 3 38 → **13,179 representatives + 2,087 no-website rows classified, 0 missing**; siblings inherit the representative verdict at assembly. Test batch of 60 audited first: every evidence quote verbatim, roofers → adjacent, consultants → not_restoration.
- 2026-10-11 — `assemble.js` → `deliverable/`: **Qualified 11,558 (residential_restoration) · Review 8,040 (unconfirmed 5,027 + unclear 3,013) · Exclude 10,239** (directory drops 4,832 · adjacent 1,583 · commercial 1,205 · not_restoration 1,185 · inspection 817 · cleaning 617). Qualified fill: phone 99.3% · website 93.0% · street 82.4% · Facebook 59.1% · email 35.3% (on-site harvest, unverified) · owner 0% (not run). Brand-flagged Qualified 3,376 (SERVPRO 1,362 · ServiceMaster 544 · PuroClean 347 · Rainbow 231 · Paul Davis 208 …), independents 8,182.
- 2026-10-11 — Owner-finding STAGED, NOT RUN (gate: offer + target role in `owner-prompt.md` DECISIONS are PROPOSED, not signed off): `leads_icp.csv` 11,558 → `prep-owner-batches.js --batch 40` → **142 batches (5,673 leads with site text)**; 5,885 skipped (5,363 `nothing` = siblings whose text sits under the representative place_id + no-website rows; 522 `no_text`). On a go: `owner-read` workflow or one Haiku agent per batch → `merge-owner-reads.js --trade-words …` → BBB rung → sweep tranche → `combine-owner-contacts.js`. No DataForSEO / MV / BB keys on this container.
- 2026-10-11 — READ-BACK: operator "offer and role approved, keep franchises, run owner finding". Owner-finding STARTED on the 142 prepared batches.

### Owner-read progress (checkpoint)
- Batches 0–70 complete and validated (every in-batch place_id present in its out file): 2,840 leads read, 396 with a named contact (~14%).
- Batches 71–90 in flight (20 concurrent Haiku readers); 91–141 queued.
- BBB rung at 5,059/11,558, still running in background (`bbb.log`).
