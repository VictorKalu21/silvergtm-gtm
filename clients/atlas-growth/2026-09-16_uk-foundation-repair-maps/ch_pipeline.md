# Owner-finding pipeline — 2026-09-16 UK foundation-repair MAPS run

The exact commands, in order, from `leads_qualified.csv` to `owner/contacts_final.jsonl`.
Engine scripts (`.js`) are run from `skills/google-maps-scrape/` and are **never edited**; the
`.py` scripts in this folder are job-side one-offs. Every command is written to be run from this
run folder.

```
RUN=clients/atlas-growth/2026-09-16_uk-foundation-repair-maps
ENG=skills/google-maps-scrape
```

**Why Companies House leads this pipeline and the website does not.** Measured on the 2026-09-16
export run: a UK ICP firm's own site names somebody on **~4%** of sites (16% in the US). Companies
House named directors for **64%** at $0. The LinkedIn-restricted sweep added **30% of what was
left**. Combined: **79% named**. So the order below is registry → read → registry again → sweep,
not site-first. (`skills/icp-source-planner/library/google-maps--uk-foundation-repair.md`.)

---

## Credentials and rate limit — read before step 1

- Steps **1, 2 and 5** call the Companies House Public Data API and need the operator's
  **`COMPANIES_HOUSE_KEY`**, which lives in `skills/google-maps-scrape/.env`. Each script reads it
  at runtime. **Do not open, print, copy or commit that file.** If the key is absent the engine
  exits with `ERROR: COMPANIES_HOUSE_KEY not in ...` — that is the expected failure, not a bug.
- The API allows **600 requests per 5 minutes** (~2 req/sec sustained) and returns `429` with a
  `Retry-After` header on overrun. All three scripts back off on 429; `companies-house.js` honours
  `Retry-After` directly.
- **Budget:** `companies-house.js` and `ch_second_pass.py` each spend **2 requests per lead**
  (a company search + an officers pull); `ch_lowconf_officers.py` spends 2 per low-confidence
  candidate (~46% of leads on the last run). For N qualified leads that is roughly `2N + 0.9N + 2N`
  ≈ **5N requests**, so N=500 is ~2,500 requests ≈ **21 minutes at the cap**. Run ONE process at a
  time — two in parallel share the same quota and simply 429 each other.
- **No credits are spent anywhere in this pipeline.** Companies House is free and the reads are
  in-session Haiku. The paid gate is email verification (`email-verify-debounce-bounceban`), which
  is a separate step and needs an explicit operator go.

## Two ordering corrections to the pipeline as usually written

1. **`inject_ch_directors.py` must run AFTER `prep-owner-batches.js`, not before.** It edits the
   `batch-*-in.json` files that prep-owner-batches.js creates, adding the `ch_directors` field. Run
   it first and it exits with `no batch-*-in.json ... run prep-owner-batches.js first`.
2. **`ch_second_pass.py` is a post-read step.** Its whole job is the residue — the qualified leads
   still unnamed *after* the engine match and the model read — so it reads
   `owner/contacts_read.jsonl` to know who those are. It will run before the read (the `--have`
   file simply will not exist, and every qualified lead is tried), but that spends 2N requests
   instead of ~0.4N for no extra names. It is placed at step 5 below for that reason.

---

## 1. Engine Companies House match  *(needs the key)*

```bash
node $ENG/companies-house.js --leads $RUN/leads_qualified.csv --out $RUN/owner --concurrency 4
```
→ `owner/companies_house.jsonl`

Searches each business name, picks the best-matching **active** company disambiguated on the
postcode parsed from `full_address` (falling back to `city`), and pulls its **active directors and
LLP members** — secretaries, corporate officers and nominees are filtered out in the engine, which
is exactly what `owner-prompt.md`'s Companies House rule 5 requires. Matching is deliberately
conservative (`nameOverlap >= 0.34` plus postcode/city scoring): a wrong owner is worse than none.

To work the damp-only segment as well, run the same command a second time with
`--leads $RUN/leads_damp_only.csv --out $RUN/owner-damp`.

## 2. Low-confidence candidates  *(needs the key)*

```bash
python3 $RUN/ch_lowconf_officers.py
```
→ `owner/companies_house_lowconf.jsonl`

Pulls directors for the candidates the engine left as `low_confidence` (name overlap ≥ 0.6, active)
so the reader can judge them. **These are not accepted here.** They are handed to the model tagged
`[low_confidence match]`, and `owner-prompt.md` Companies House rule 3 applies: reject a match
whose registered title shares no distinctive token with the business name. That check caught **four
wrong owners** on the export run — the clearest being *"Crown Preservation"* matched to
**ABOVEWATER DAMP PROOFING**.

## 3. Build the owner-read batches

```bash
node $ENG/prep-owner-batches.js \
  --leads $RUN/leads_qualified.csv \
  --dir   $RUN/owner \
  --out   $RUN/owner/read \
  --batch 40
```
→ `owner/read/batches/batch-<N>-in.json`, `owner/read/manifest.json`, `owner/read/skipped_none.json`

Deterministic Node assembles the evidence already on disk — identity fields, `emails`, `site_text`
(people-bearing pages ranked first), `owner_page_text`, `serp_text`. **Nothing here names a person.**

## 4. Inject the registry into the batches

```bash
python3 $RUN/inject_ch_directors.py
```
Adds `ch_directors` to every lead in every batch file, from `companies_house.jsonl` (tagged
`matched`), `companies_house_lowconf.jsonl` (`low_confidence`) and, on a re-run,
`companies_house_pass2.jsonl`. An engine match always wins over a low-confidence candidate for the
same lead. The confidence tag is carried into the text on purpose — the reader must know whether it
is looking at an authoritative match or a candidate it has to judge.

## 5. Second Companies House pass on the residue  *(needs the key)*

> Run this AFTER step 7 the first time through, then re-run steps 4 and 6 for the leads it names.
> Listed here because it belongs to the Companies House block.

```bash
python3 $RUN/ch_second_pass.py --leads leads_qualified.csv --have owner/contacts_read.jsonl
```
→ `owner/companies_house_pass2.jsonl`

Works around the OPEN engine bug in `IMPROVEMENTS.md` (2026-09-16, MEDIUM): `nameOverlap`
tokenises on words, so `"Welba Construction Ltd."` vs `WELBA CONSTRUCTION LTD` and
`"... and Renovations Limited"` vs `... & RENOVATIONS LIMITED` fall to `low_confidence`. 83 of 180
leads on the export run; this pass recovered 17 with active directors and no wrong matches on
review — about **10% of the registry's names**. Acceptance stays deterministic: normalised-title
equality, or title-contains-all-core-tokens **and** an outward-postcode/town match. Fixed job-side;
the engine is not touched and the IMPROVEMENTS entry stays OPEN until it is fixed properly with a
test and operator approval.

## 6. The Haiku owner reads

Dispatch **one subagent per `batch-<N>-in.json`, `model: haiku`, all in one message** so they run
in parallel. The prompt template is `skills/google-maps-scrape/owner-read-subagent.md`; substitute
the two paths. Each subagent reads `$RUN/owner-prompt.md` in full — the UK DECISIONS block, the
KEEP/EXCLUDE roles, the Companies House rules, the UK traps, the schema, ENTITY-MATCH, the
guardrails and the few-shots — and applies it to its batch, writing
`owner/read/batches/batch-<N>-out.json` keyed by `place_id`.

**The model is the only reader.** No regex names anybody in this pipeline.

## 7. Merge the reads

```bash
node $ENG/merge-owner-reads.js --dir $RUN/owner/read --out $RUN/owner/contacts_read.jsonl \
  --exclude-titles "surveyor,damp surveyor,building surveyor,remedial surveyor,quantity surveyor,estimator,inspector,site manager,site foreman,foreman,contracts manager,contracts supervisor,project manager,production manager,technician,damp technician,damp proofer,installer,operative,labourer,laborer,apprentice,scheduler,dispatcher,receptionist,bookkeeper,accounts,health and safety,company secretary,former,retired"
```
→ `owner/contacts_read.jsonl`

`--exclude-titles` is **not optional here.** The engine's default list is the US foundation-repair
block and does not contain `surveyor` — the single highest-risk false positive in this vertical,
because the offer sells inspection appointments and in a UK damp firm the person who performs the
visit is titled *Surveyor*. The list above is the UK EXCLUDE set from `owner-prompt.md`. The merge
also enforces the fixed guardrails deterministically (evidence must contain the name, bucket must
be in the enum, a name may not contain a role or trade word) and counts every drop.

## 8. Sweep the still-unnamed

```bash
node $ENG/prep-sweep-batches.js \
  --leads $RUN/leads_qualified.csv \
  --out   $RUN/owner/sweep2 \
  --have  $RUN/owner/contacts_read.jsonl \
  --batch 20 --registry linkedin.com
```
→ `owner/sweep2/batches/batch-<N>-in.json`, `owner/sweep2/manifest.json`

**`--registry linkedin.com`, not the engine default `bbb.org`.** The BBB is a US institution and
has no UK coverage; LinkedIn is the registry that resolved the UK residue (+30% of what was left).

Then dispatch one Haiku subagent per batch per `skills/google-maps-scrape/owner-sweep-subagent.md`
— at most two `WebSearch` calls per lead, `owner-prompt.md` applied exactly, ENTITY-MATCH hard
(a same-name firm in another UK town is a different company). Each subagent must load the search
tool first with `ToolSearch` `select:WebSearch`; batches that skipped that returned nothing.

```bash
node $ENG/merge-owner-reads.js --dir $RUN/owner/sweep2 --out $RUN/owner/contacts_sweep.jsonl \
  --exclude-titles "<the same UK list as step 7>"
```

## 9. Combine

```bash
node $ENG/combine-owner-contacts.js \
  --leads $RUN/leads_qualified.csv \
  --out   $RUN/owner/contacts_final.jsonl \
  $RUN/owner/contacts_read.jsonl \
  $RUN/owner/contacts_sweep.jsonl
```
→ `owner/contacts_final.jsonl` + `.csv` + `_summary.json`

Precedence is argument order — the read wins, the sweep only fills leads still unnamed. Check
`contacts_final_summary.json`'s `named_pct` against the export run's **79%** before moving on.

---

## After this pipeline

`assemble_deliverable.py` (to be ported from the export run when the reads land) joins
`leads_qualified.csv` + `leads_qualified_contacts.csv` + `contacts_final.jsonl` into the
deliverable, then the `email-waterfall` skill fills missing addresses and
`email-verify-debounce-bounceban` gates the send. **Verification spends credits and needs an
explicit operator go.**

## Write-back when the run ends

`IMPROVEMENTS.md` for bugs found · `clients/atlas-growth/STATE.md` for the client's state · the
source profile at `skills/icp-source-planner/library/google-maps--uk-foundation-repair.md` for the
vertical's measured yields (update the 64% / 30% / 79% figures with this run's).
