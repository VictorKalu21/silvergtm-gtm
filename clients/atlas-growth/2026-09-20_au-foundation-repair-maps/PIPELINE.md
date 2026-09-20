# Pipeline — Atlas Growth Australia foundation repair (2026-09-20 Maps run)

Copy-paste, in order, from the repo root (`/home/user/silvergtm-gtm`). Every path below is real.
Mirrors the UK run's `PIPELINE.md`; steps 0–7 are deterministic, $0, no network. Steps marked
**[credits]** spend and need the operator's go with the count stated first.

Shorthand used in the prose only — the commands are written out in full:

| | |
|---|---|
| `<run>` | `clients/atlas-growth/2026-09-20_au-foundation-repair-maps` |
| `$ENG` | `skills/google-maps-scrape` |
| config | `clients/atlas-growth/atlas-growth-au-config.json` |
| recovery config | `clients/atlas-growth/recover-generic-au-config.json` |
| unrated config | `clients/atlas-growth/recover-unrated-au-config.json` |
| runsheet | `clients/atlas-growth/atlas-growth-au-runsheet.csv` (1,820 rows = 182 tiles × 10 queries) |
| shards | `clients/atlas-growth/shards-au/shard-0..7.csv` (gitignored; regenerate with `node clients/atlas-growth/gen-runsheet-au.js`) |
| memory | none — first Australian run for this client. `build-netnew.js` will report `ref files used: 0`, which is valid for THIS run only |
| store | `--store` on fetch/verify/match once `store.js` ships (IMPROVEMENTS entry 2026-09-20); file behaviour otherwise |

Each step lists its **STOP condition**. A stop is not an obstacle to route around — it is the step
that has not finished.

---

## Step 0 — Gates that must be true before the first Maps call

1. `SCRAPER_TECH_KEY` in `skills/google-maps-scrape/.env` (ask the operator; never printed).
2. The 3-call probe run and pasted into `GATE1.md` §0 and `RUN-NOTES.md`.
3. GATE1 approved: footprint, queries, review floor, brand families, Maps spend.
4. If the operator confirms Supabase first: `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` in the same
   `.env`, `store.js` shipped with its test and IMPROVEMENTS entry, `runs` row written for this run.

## Step 1 — Scrape **[credits: Maps, ~4,750 central]**

One process per shard, launched through the harness background runner (never `nohup … &` inside a
tool call — `scrape.js` writes `run_log.json` only at the end):

```bash
cd /home/user/silvergtm-gtm
for i in 0 1 2 3 4 5 6 7; do
  node skills/google-maps-scrape/run-scrape.js \
    --config clients/atlas-growth/atlas-growth-au-config.json \
    --runsheet clients/atlas-growth/shards-au/shard-$i.csv \
    --out clients/atlas-growth/2026-09-20_au-foundation-repair-maps/shard-$i --resume
done
```

Gate: every `shard-N/coverage_report.json` reports `COMPLETE`, 0 unhealed tiles. Read
`run_log.json` at ≥25% of the sheet for the real calls-per-row figure and write it to `RUN-NOTES.md`.

**STOP:** a shard not COMPLETE → re-run with `--resume`; never merge a partial shard.

## Step 2 — Merge the shards

Port `merge-shards.js` from `clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/` unchanged
(dedupe on `place_id`, union `google_types` and `icp_type` with `|`). Output `<run>/leads_clean.csv`.

**STOP:** the merged row count is not ≥ the largest single shard, or a `google_types` value contains
`,` instead of `|`.

## Step 3 — Qualify (main + two recoveries)

```bash
node skills/google-maps-scrape/qualify-leads.js --in <run>/leads_clean.csv --config clients/atlas-growth/atlas-growth-au-config.json --out <run>
node skills/google-maps-scrape/qualify-leads.js --in <run>/excluded_officp.csv --config clients/atlas-growth/recover-generic-au-config.json --out <run>/recover
node skills/google-maps-scrape/qualify-leads.js --in <run>/excluded_officp.csv --config clients/atlas-growth/recover-unrated-au-config.json --out <run>/recover-unrated
```

Append both recovery outputs to `leads_clean_qualified.csv` through the MAIN file's header, dedupe on
`place_id`, assert zero overlap between the three. Then **GATE 3**: the drop-reason audit
(`gate3-stats.js` ported from the UK run), with proposals; applied on approval, before site text. The
audit MUST include the `Structural engineer`-primaried rows whose name carries an ICP token (config
rule 2 note) and the `Concrete contractor` rows the generic recovery took back and left behind.

**STOP:** a `WARN` on stderr about a missing `drop_reason` column (the recovery pass has degraded).

## Step 4 — Footprint gate (mandatory in areas mode)

```bash
node skills/google-maps-scrape/footprint-gate.js --in <run>/leads_clean_qualified.csv \
  --runsheet clients/atlas-growth/atlas-growth-au-runsheet.csv \
  --config clients/atlas-growth/atlas-growth-au-config.json \
  --out <run> --hub-radius-deg 1.0 --regions NSW,VIC,QLD,SA,WA,TAS,ACT,NT
```

Read `footprint_gate_report.json`: expect `wrong_country` (US, NZ) and `far_from_hubs`; a large
`wrong_region` count means the `city` field does not carry the state token in the form the regex
expects — check three rows before trusting either the keeps or the drops.

## Step 5 — Cross-run dedupe, collapse, shared hosts

```bash
node skills/google-maps-scrape/build-netnew.js --new <run>/leads_clean_qualified_infootprint.csv --client clients/atlas-growth --out <run>/leads_netnew.csv
node skills/google-maps-scrape/collapse-domains.js --in <run>/leads_netnew.csv --config clients/atlas-growth/atlas-growth-au-config.json --out <run>
```

`ref files used: 0` is expected and valid: first Australian run. Then shared-host routing per the UK
`PIPELINE.md` step.

## Step 6 — Site text (needs `owner-prompt.md` in the run folder first — the hook enforces it)

```bash
cp clients/atlas-growth/owner-prompts/au-foundation-repair.md <run>/owner-prompt.md   # after GATE 6 read-back
node skills/google-maps-scrape/fetch-sites.js --in <run>/leads_domains.csv --out <run>/owner --config clients/atlas-growth/atlas-growth-au-config.json
node skills/google-maps-scrape/fetch-sites.js --firecrawl-residue <run>/owner/site_text.jsonl     # [credits: Firecrawl, count stated first]
```

Plain → longer-timeout retry → Firecrawl residue (Hobby plan: concurrency 2, 10 req/min — the flag
respects it). Turnstile-walled hosts are a known ceiling from this egress.

## Step 7 — Classify and adjudicate

Port `stageB_classify.py`, `prep_adjudicate.py`, `merge_adjudication.py` and `adjudicate/PROMPT.md`
from the UK run folder with the Australian vocabulary (CORE: underpin/restump/reblock/relevel/
foundation repair/slab lift/resin inject/subsidence/piering/screw pile; ADJ: house raising/retaining
wall; NEW: new foundations/footings/piling/excavation/earthworks; ENGINEER: structural engineer/
geotechnical/building inspector/certifier). Opus adjudicates; Haiku never.

## Step 8 — Owner-finding

1. **Registries** (job-side `registry_<state>.py`, each with a 3-call probe in `RUN-NOTES.md` first):
   NSW → VIC → QLD → WA → SA. Output one JSONL per registry in the `companies_house.jsonl` record
   shape (`place_id`, `company`, `number`, `confidence`, `match_basis`, `officers[]`) with a
   `registry` field, so `prep-owner-batches.js --ch` renders it unchanged.
2. `node skills/google-maps-scrape/prep-owner-batches.js --leads <run>/leads_icp.csv --dir <run>/owner --out <run>/owner/read --batch 40 --ch registry_nsw.jsonl,registry_vic.jsonl,...`
3. Haiku reads per batch (`owner-read-subagent.md`), then `merge-owner-reads.js` with the
   exclude-titles list from the UK `ch_pipeline.md` extended with estimator/assessor/inspector/
   supervisor/nominee-only.
4. Sweep the unnamed: `prep-sweep-batches.js --registry linkedin.com`, one run of ≤6 batches at a
   time, read the first tranche's cost per named lead before queuing the rest.
5. `combine-owner-contacts.js`.

## Step 9 — Emails and verification **[credits: MillionVerifier + BounceBan, count stated first]**

On-site harvest only unless the operator releases finder credits. Port `stageC_emails_names.py` and
`rerank_emails.py` from the UK folder (or wire `email-rank.js` if approved), `assemble_deliverable.py`,
then:

```bash
IN=<run>/deliverable/verify_input.csv OUT_DIR=<run>/verify node skills/email-verify-debounce-bounceban/scripts/verify-millionverifier-bounceban.js
python3 <run>/apply_verify.py
```

The runner routes MillionVerifier invalid/error to BounceBan by default (recovered 18 of 35 on the UK run).

## Step 10 — Plusvibe (STEP 7b)

```bash
node skills/google-maps-scrape/build-plusvibe.js base --leads <run>/leads_union.csv --emails <run>/deliverable/emails_final.csv --contacts <run>/owner/contacts_final.jsonl --out <run>/owner/plusvibe_base.csv --city-overrides <run>/owner/city_overrides.json
node skills/google-maps-scrape/build-plusvibe.js prep --base <run>/owner/plusvibe_base.csv --site <run>/owner/site_text.jsonl --dir <run>/owner/personalize
# 3-lead test → operator → 7-lead test → operator → full fill:
node skills/google-maps-scrape/build-plusvibe.js fill --base <run>/owner/plusvibe_base.csv --config clients/atlas-growth/personalize-au-config.json --dir <run>/owner/personalize --out <run>/owner/plusvibe_upload.csv
node skills/google-maps-scrape/build-plusvibe.js redo --dir <run>/owner/personalize      # loop until exit 2
node skills/google-maps-scrape/build-plusvibe.js city-fallback ...                        # for blank cities
node skills/google-maps-scrape/build-plusvibe.js check --csv <run>/owner/plusvibe_upload.csv
```

## Write-back (end of run)

`skills/google-maps-scrape/IMPROVEMENTS.md` (engine bugs), `SKILL.md` (method changes),
`clients/atlas-growth/STATE.md`, `skills/icp-source-planner/library/google-maps--au-foundation-repair.md`
plus a registry profile `au-state-licence-boards--foundation-repair-owners.md`, both indexed in
`library/_index.md`.
