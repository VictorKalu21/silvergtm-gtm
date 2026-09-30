# Post-scrape pipeline — Atlas Growth UK generator installers (2026-09-30 Maps run)

Copy-paste, in order, from the repo root (`/home/user/silvergtm-gtm`). Adapted from the 2026-09-16
UK foundation run's `PIPELINE.md` (same engine, same grid, same gates); the differences are the
config, ONE recovery pass instead of two, and the dedupe memory. STEPS 1–7 spend nothing.

| | |
|---|---|
| `<run>` | `clients/atlas-growth/2026-09-30_uk-generator-installers-maps` |
| config | `clients/atlas-growth/atlas-growth-generators-uk-config.json` |
| unrated config | `clients/atlas-growth/recover-unrated-generators-uk-config.json` |
| runsheet | `clients/atlas-growth/atlas-growth-generators-uk-runsheet.csv` (885 rows = 177 tiles × 5 queries) |
| dedupe memory | the two UK foundation deliverables (gitignored; restore from the operator's archive): `../2026-09-16_uk-foundation-repair-maps/deliverable/atlas_uk_foundation_repair_maps_qualified.csv` (860) and `../2026-09-16_uk-foundation-repair/deliverable/atlas_uk_foundation_repair_qualified.csv` (175) |

Each step lists its **STOP condition**. A stop is the step that has not finished.

## 0. Gate: are all 8 shards done?

```bash
for i in 0 1 2 3 4 5 6 7; do printf 'shard-%s: ' "$i"; node -e 'const f=process.argv[1];const fs=require("fs");if(!fs.existsSync(f)){console.log("NO coverage_report.json");process.exit(0)}const c=JSON.parse(fs.readFileSync(f,"utf8"));console.log(c.status,"| tiles",c.runsheet_tiles,"| heal passes",c.heal_passes,"| unhealed",(c.unhealed_tiles||[]).length)' "clients/atlas-growth/2026-09-30_uk-generator-installers-maps/shard-$i/coverage_report.json"; done
```
**STOP** unless all 8 print `COMPLETE`. Re-buy only the gap: `RESUME=1 bash <run>/run-shards.sh`
(or one shard with `run-scrape.js … --resume`).

## 1. Merge shards → one universe
```bash
node clients/atlas-growth/2026-09-30_uk-generator-installers-maps/merge-shards.js
```
→ `<run>/leads_clean.csv`, `excluded.csv`, `coverage_summary.json`, `calls_summary.json`. Refuses on
an INCOMPLETE shard. Read `calls_summary.json`: expect calls/row nearer 1.5 than 2.6 (sparse trade);
a `page_depth_histogram` spike at 6 means a London tile was not exhausted.

## 2. Qualify
```bash
node skills/google-maps-scrape/qualify-leads.js --in clients/atlas-growth/2026-09-30_uk-generator-installers-maps/leads_clean.csv --config clients/atlas-growth/atlas-growth-generators-uk-config.json --out clients/atlas-growth/2026-09-30_uk-generator-installers-maps
```
Expect `rules: 4 active`. Compare the drop mix with `dryrun-results.md`; a `not_in_icp` bucket full
of obvious installers means the allow list is missing a UK type stem — fix the config, re-run.

## 3. Unrated recovery, then append once
```bash
node skills/google-maps-scrape/qualify-leads.js --in clients/atlas-growth/2026-09-30_uk-generator-installers-maps/excluded_officp.csv --config clients/atlas-growth/recover-unrated-generators-uk-config.json --out clients/atlas-growth/2026-09-30_uk-generator-installers-maps/recover-unrated
```
Expect `rules: 3 active`; a `skipping rule on unknown field "drop_reason"` WARN means the wrong
input — **STOP**. Then append once:
```bash
node clients/atlas-growth/2026-09-30_uk-generator-installers-maps/append-unrated.js
```
(writes through the MAIN header, asserts zero place_id overlap; not idempotent — a second run fails by design). No generic-recovery pass
this run (config `_no_generic_recovery`).

## 4. Footprint gate — 0.75°, no `--regions`
```bash
node skills/google-maps-scrape/footprint-gate.js --in clients/atlas-growth/2026-09-30_uk-generator-installers-maps/leads_clean_qualified.csv --runsheet clients/atlas-growth/atlas-growth-generators-uk-runsheet.csv --config clients/atlas-growth/atlas-growth-generators-uk-config.json --out clients/atlas-growth/2026-09-30_uk-generator-installers-maps --hub-radius-deg 0.75
```
Same grid, same radius rationale as the foundation run (keeps Orkney, drops Dublin). Grep the kept
file for `France` / `Belgium` / `Isle of Man` / `Guernsey` / `Jersey` afterwards.

## 5. Cross-run dedupe (MANDATORY) — vs both UK foundation deliverables
`build-netnew.js --client` finds 0 refs here (its filename filter; see the foundation PIPELINE
STEP 5), so use that run's `dedupe-ref.js` with explicit paths, chained:
```bash
node clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/dedupe-ref.js --in clients/atlas-growth/2026-09-30_uk-generator-installers-maps/leads_clean_qualified_infootprint.csv --ref clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/deliverable/atlas_uk_foundation_repair_maps_qualified.csv --expect-ref-rows 860 --out clients/atlas-growth/2026-09-30_uk-generator-installers-maps/leads_netnew_a.csv --report clients/atlas-growth/2026-09-30_uk-generator-installers-maps/dedupe_report_a.json
node clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/dedupe-ref.js --in clients/atlas-growth/2026-09-30_uk-generator-installers-maps/leads_netnew_a.csv --ref clients/atlas-growth/2026-09-16_uk-foundation-repair/deliverable/atlas_uk_foundation_repair_qualified.csv --expect-ref-rows 175 --out clients/atlas-growth/2026-09-30_uk-generator-installers-maps/leads_netnew.csv --report clients/atlas-growth/2026-09-30_uk-generator-installers-maps/dedupe_report_b.json
```
**STOP** unless the ref-row lines read 860 and 175 — a missing memory file silently passes
everything as net-new. Overlap should be near zero (different trade), but an electrical
contractor can sit in both, and a lead already in a live campaign is never re-contacted.

## 6. Collapse domains
```bash
node skills/google-maps-scrape/collapse-domains.js --in clients/atlas-growth/2026-09-30_uk-generator-installers-maps/leads_netnew.csv --out clients/atlas-growth/2026-09-30_uk-generator-installers-maps --config clients/atlas-growth/atlas-growth-generators-uk-config.json
```
→ `leads_annotated.csv`, `leads_domains.csv` (the only file a paid step is fed), `leads_nowebsite.csv`
(STEP 5d recovery track), `collapse_report.json`. Read the top `root_domain`s by `location_count`
and fill `brand_families` in the config at GATE 3.

## 7. GATE 3 read-out
Sample 10 rows per `drop_reason` in `excluded_officp.csv` + `excluded_geo.csv`, bucket the kept list
by nation (postcode area), list top root domains. `node <run>/gate3-stats.js` (copied from the 2026-09-16 UK maps run; generic over these files). Act on: a drop bucket full of real installers →
config fix; a nation far below its tile share → coverage hole, check `calls_summary.json` first.

## 8. Then
`leads_domains.csv` → site text (`fetch-sites.js`, then the triage ladder for the residue) → STEP 5e
fit with the ICP-doc verdicts (residential generator install = keep; hire-only / commercial-only /
portable-retail / no-generator-service = drop; `unclear` = drop unless brand-flagged) → owners:
`companies-house.js` first (needs `COMPANIES_HOUSE_KEY`), then the Haiku read with
`owner-prompt.md`, then the LinkedIn sweep on the unnamed → on-site emails → MillionVerifier →
BounceBan → Plusvibe with a UK personalize config (quote / site-survey wording). Write-back at the
end: `IMPROVEMENTS.md` (engine), `STATE.md` (client), a `google-maps--uk-generator-installers.md`
profile in `skills/icp-source-planner/library/`.
