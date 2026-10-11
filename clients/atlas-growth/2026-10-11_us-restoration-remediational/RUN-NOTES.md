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
