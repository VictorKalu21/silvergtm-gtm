# 2026-09-16_uk-foundation-repair — run notes (resume from here)

Input: operator upload `60174952-Uk_Foundation_Repair-all.csv` (5,999 rows, query "Foundation, Concrete contractor,
Waterproofing service", UK). Task: qualify for foundation repair, harvest on-site emails and compare with the export's,
name the decision-maker per the owner prompt's role buckets, verify emails (MillionVerifier → BounceBan).

## Pipeline as run (scripts in this folder, data gitignored)
1. `stageA_prefilter.py` — normalise to engine schema (place_id from the Maps URL), dedupe place_id + domain, $0 deny
   of non-trades / suppliers → `leads_universe.csv` (2,865) + `excluded_stageA.csv`.
2. `fetch-sites.js` (engine) on the universe → `owner/site_text.jsonl` (2,339 ok / 394 failed, 271 of them 403).
3. `stageB_classify.py` — keyword tiers A/B/C/D with evidence (pre-filter only, not the reader).
4. `prep_adjudicate.py` + `adjudicate/PROMPT.md` — Sonnet subagent per 25 reads tiers A+B (374) and, in `adjudicate2/`,
   tier C (372) + a 100-row tier-D sample. Verdicts in `adjudicate*/out/`.
5. `merge_adjudication.py` — verdicts + geography gate (37 US pins had bled into the export) + brand flag + review-floor
   flag → `leads_qualified.csv` (175) + `excluded_officp.csv` (drop_reason on every row).
6. `stageC_emails_names.py` — best email per company, Maps-vs-site comparison columns, role-bucketed name hints.
7. Owner-finding: `companies-house.js` (engine) + `ch_lowconf_officers.py` + `inject_ch_directors.py` →
   `prep-owner-batches.js` (engine) → 6 Haiku reads → `merge-owner-reads.js` → `owner/contacts_read.jsonl`;
   `ch_second_pass.py` for the unnamed; `prep-sweep-batches.js` (engine, registry linkedin.com) → Haiku sweep in
   `owner/sweep2/` (in progress at last save).
8. `assemble_deliverable.py` → `deliverable/atlas_uk_foundation_repair_qualified.csv`, `contacts_all.csv`,
   `verify_input.csv` (Email column, NOT yet verified — needs keys + an explicit go).

## Standing directives applied
No credits spent. Roll-ups kept and brand-flagged. Review floor 30 flagged (0 rows under). Role set from the owner
prompt (owner_or_partner > gm > marketing > sales_manager > office_manager; estimator etc. excluded).

## Known gaps
- 394 sites unfetched (271 × 403). Probed in-container: curl_cffi rung 403, Scrapling stealth browser 401/timeout,
  Wayback CDX 503 (archive.org down at the time), Jina 403 (needs key). The 403s block this container's egress IP;
  recover from the operator's machine or Firecrawl.
- companies-house.js left exact-title matches with trailing "Ltd." as low_confidence (fixed job-side in
  `ch_second_pass.py`); logged for IMPROVEMENTS.md.
