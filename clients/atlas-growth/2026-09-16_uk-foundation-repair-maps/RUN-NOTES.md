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

**Open items.**
1. **Email verification NOT run** — no MillionVerifier / BounceBan keys, and credits need an explicit
   operator go. `deliverable/verify_input.csv` (444 addresses) is staged for it.
2. **Plusvibe (STEP 7b) not built** — it runs after verification; `personalize-config-uk.json` is
   drafted and still needs the 3-lead then 7-lead operator test.
3. **Three engine fixes pending operator approval + a test**, all filed OPEN in
   `skills/google-maps-scrape/IMPROVEMENTS.md`: the city-only Companies House demotion (job-side in
   `demote_city_only_ch.py`), the sibling-domain + person-shape email ranking (job-side in
   `rerank_emails.py`), and the `prep-owner-batches.js` skip-before-CH-injection ordering. The
   `fetch-sites.js` extraction rungs and the `build-plusvibe.js` OUTCOME table are filed alongside them.
4. **8 junk-contact records** — read records holding a "contact" that is not a person
   (`"West Yorkshire"`, `"Home About Damptec"`) with a blank `primary_name`; they were re-queued by
   `build_have.py` this run, but the three-way "named" disagreement in the engine is still OPEN.
