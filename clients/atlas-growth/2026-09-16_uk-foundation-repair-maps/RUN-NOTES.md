# 2026-09-16_uk-foundation-repair-maps — run notes

Our own UK Google Maps scrape (GATE 1 approved 2026-09-16: 177 tiles × 10 queries, 8 shards, pagination on,
review floor 5, 150 anchors). Post-scrape commands: `PIPELINE.md`. Dedupe memory: the export run's 175-row
deliverable (`../2026-09-16_uk-foundation-repair/deliverable/`), keyed on business_id + host + phone (`dedupe-ref.js`).

## Probes (3-call rule) — site-text rungs from this container, 2026-09-16
- Plain fetch: welbaconstruction.co.uk 200 · petercox.com 403 (Cloudflare managed Turnstile) · timberwise.co.uk 202 / 169 B shell.
- curl_cffi `impersonate="chrome"`: petercox 403 · timberwise 202 · kenwoodplc.co.uk 200. TLS impersonation alone does not clear the WAF.
- Scrapling 0.4.15 `StealthyFetcher(solve_cloudflare=True)` using the pre-installed Playwright Chromium (symlink
  /opt/pw-browsers/chromium-1234 → chromium-1243): **petercox.com solved → 200, 15 kB text, ~80 s**; timberwise → 202
  chrome-error (a `.well-known` redirect challenge, not Cloudflare) — not recovered. Reserve Scrapling for the confirmed
  403/Turnstile subset only (slow), never bulk.
- Wayback CDX: archive.org "Temporarily Offline" at probe time; retry later for the Scrapling residue.
- Firecrawl: no key; not a rung this run.

## Owner prompt
`owner-prompt.md` copied from the export run (US prompt + UK role notes) so `fetch-sites.js` can write under `owner/`.
The UK variant is built at GATE 6 before any owner read and saved to `owner-prompts/uk-foundation-repair.md`.

## Final (2026-09-17, close-out)

**Funnel, end to end.** 177 tiles × 10 queries, 8 shards, pagination on → **22,193 unique businesses**
(4,620 Maps calls, 2.61 calls/row, 20 heal passes, 0 unhealed; 36 `ok`+0 pairs re-bought by hand for
79 calls, +295 rows) → qualify 2,057 + generic recovery 441 + unrated recovery 344 = **2,842** →
footprint gate **1,969** → cross-run dedupe vs the export run's 175-row deliverable **1,770 net-new**
→ collapse to 1,469 spend rows + 146 no-website → site text **1,245 of 1,469 ok (~85%)**, 224 residue
→ keyword tiers (A 246 · B 632 · C 117 · D 775, tier-D 100-row sample 0 ICP of 100) + model
adjudication → **860 worked leads: 686 ICP + 174 damp-only**.

Owner-finding: Companies House engine pass **431 authoritative** + 189 candidates → on-disk Haiku
reads (site-text 380/598 · CH-only 103/192 · CH pass-2 46/47) = **529/860 (61.5%)** with no web search
→ LinkedIn-restricted sweep, **17 batches over 331 leads, ~470 WebSearch calls, 70 named (21%)**
(tranches 23/100 · 22/100 · 24/100 · 5/31) → **599 raw, 586 of 860 (68.1%) after the same-company QA**
that removed 13 branch-to-parent / wrong-company matches. Sources: **Companies House 504 · web search
+ SERP 68 · website 12 · email local part 2**.

Emails (on-site only — this scrape has no Maps email column): deep harvest lifted coverage to
**468 of 860 (54.4%)**, **444 unique best addresses**, 39 person-shaped, **367 leads (42.7%) named +
emailed**. Deliverables sent 2026-09-17: `atlas_uk_foundation_repair_maps_qualified.csv` (860 rows),
`contacts_all.csv` (852 contacts), `verify_input.csv` (444), `excluded_adjudication.csv`, and
`atlas-growth_uk-maps_rundata_essentials.tar.gz` (raw `shard-*` dirs excluded — recreatable at API cost).

**Verification (2026-09-17, operator go + keys).** MillionVerifier → BounceBan over the 444 unique
addresses: **370 sendable**, 39 risky (catch-all, kept out of the send), 35 dropped (15 invalid + 20
addresses MillionVerifier returned a persistent `error` for across three attempts — unverified, not
invalid). `deliverable/emails_final.csv` = 468 rows (392 sendable once shared brand mailboxes are
counted per lead).

**Plusvibe (STEP 7b, 2026-09-17).** 3-lead test → wording change ('structural waterproofing →
basement surveys', operator) → 7-lead test → full fill, 10 Haiku batches over `plusvibe_base.csv`
(391 sendable leads, 27 named under the name rule). Fill: **364 personalised, 27 fallback-only**
(no site text), 0 of 4 flags, `redo` 0, **41 blank cities**. Blank cities cleared job-side into
`owner/city_overrides.json` (42 rows incl. one newline-polluted value): a focused Haiku re-read of the
site text found the base town for 20 of 31 (the first reader had returned blank even for 'From our
Beckenham base'); keyless Nominatim reverse geocode at zoom 14 for the rest (3-call probe: Stockport /
Fylde / Rotherham, <1 s each — district-level answers rejected), then the county or the area in the
business name for franchise listings ('Damp Detectives South West' → 'the South West'). Final
`check --csv`: 391 rows, 27 named, 0 name-rule violations, 0 unfilled placeholders. Sent as
`deliverable/atlas_uk_plusvibe_upload.csv`.

**Open items.**
1. **20 addresses unverified** (persistent MillionVerifier API error) — classed dropped; re-run once
   if MV recovers, they cost 20 credits.
2. **Second Plusvibe email** still needs the `company_short` variable (STATE.md open decision).
3. **Three engine fixes pending operator approval + a test**, all filed OPEN in
   `skills/google-maps-scrape/IMPROVEMENTS.md`: the city-only Companies House demotion (job-side in
   `demote_city_only_ch.py`), the sibling-domain + person-shape email ranking (job-side in
   `rerank_emails.py`), and the `prep-owner-batches.js` skip-before-CH-injection ordering. The
   `fetch-sites.js` extraction rungs and the `build-plusvibe.js` OUTCOME table are filed alongside them.
4. **8 junk-contact records** — read records holding a "contact" that is not a person
   (`"West Yorkshire"`, `"Home About Damptec"`) with a blank `primary_name`; they were re-queued by
   `build_have.py` this run, but the three-way "named" disagreement in the engine is still OPEN.

## Firecrawl residue pass (2026-09-17, operator key)

The 224-site residue (status != ok in `owner/site_text.jsonl`, minus 404/400/402/307 = **204**) went
through `firecrawl_residue.js`: 2 workers, one request every 6.5 s (the Hobby plan is
`maxConcurrency 2`, 10 req/min — the engine's own `--firecrawl` pass at 4 workers produced 408s and
then 429s on every row; filed in IMPROVEMENTS). **141 recovered (69%)**, 63 failed (41 thin/parked
pages returning 200 with <200 chars, 15 engine-500, 3 timeouts, rest 4xx). 146 credits.
Merged by `merge_firecrawl.py` (backup `site_text.jsonl.pre-firecrawl.bak`), then the run's own
chain re-ran on the recovered text only:

| step | result |
|---|---|
| `stageB_classify.py` | 76 rows changed tier, all recovered; **55 unworked leads now A/B/C** |
| adjudication batches 45–47 (Opus, same PROMPT.md) | 27 yes · 26 no · 2 unclear |
| `merge_adjudication.py` | **+29 ICP, +9 damp-only → 715 + 183 = 898 worked leads**; 0 removed, kept rows changed only in classification fields |
| `companies-house.js` on the 38 (`owner/residue/`) + low-conf officers | 24 matched with directors; 6 low-confidence candidates |
| `prep-owner-batches.js` → `inject_ch_residue.py` → 2 Haiku reads → `merge-owner-reads.js` | 35 read (3 no evidence), **24 named**, 39 contacts (CH 38, site 1) |
| `combine-owner-contacts.js` (+ `owner/residue/contacts_read.jsonl`) | **623 of 898 named (69.4%)** at contact level; **610** in the deliverable after the CH name-mismatch QA |
| recovered emails → `owner/emails_deep.jsonl` → `rerank_emails.py` | **+13 worked leads gained a first email**, +14 on the new leads → **495 of 898 (55.1%)**, 469 unique |
| `assemble_deliverable.py` (+ `read_residue` source) → `apply_verify.py` | 392 sendable · 40 risky · 36 dropped · **27 unverified** (25 unique new addresses, 6 person-shaped) |

Facebook and the UK directories were probed through Firecrawl and are dead as email rungs (login
wall; Yell/Checkatrade publish none). **Open:** operator go on 25 MillionVerifier credits for
`verify/verify_input_residue.csv`; then rebuild the Plusvibe upload for the new sendable rows.
The new extractor's junk (MHTML frame ids, `%20` residue, placeholder addresses, Bookings URL
mailboxes) was found on this replay and fixed in the engine with tests the same day.

## Close-out after verification and the BounceBan recovery (2026-09-17)

The 25 new addresses: 23 sendable / 2 risky / 0 dropped (25 MV + 4 BB credits). Operator directive:
BounceBan also recovers what MillionVerifier calls `invalid` or returned `error` on — `bb_recover.py`
sent the earlier batch's 15 invalid + 20 error rows (35 BB credits): **invalid → 5 deliverable /
9 undeliverable / 1 no answer; error → 13 deliverable / 7 risky.** Reclassified from the checkpoints
with the runner's new default routing (`--bb-on catch_all,unknown,error,invalid`):

| | before | after |
|---|---|---|
| unique addresses | 444 | 469 |
| sendable | 370 | **411 (87.6%)** |
| risky | 39 | 48 |
| dropped | 35 | 10 |
| `emails_final.csv` sendable rows | 392 | **435** |

Plusvibe rebuilt with the engine's new `base --city-overrides` (46 overrides; the 5 stragglers after
`city-fallback` were village/pin answers replaced by the town the lead itself names) and with
`outcome_by_type` added to the UK config, so `flag_outcome_off_trade` is live for the first time
(0 hits on 435 rows). **435 rows, 409 personalised, 26 fallback-only, 29 named, 0 flags, check
passed.** Sent as `deliverable/atlas_uk_plusvibe_upload.csv`.
