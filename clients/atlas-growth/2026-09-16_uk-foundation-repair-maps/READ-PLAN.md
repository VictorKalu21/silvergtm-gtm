# Owner-read dispatch plan — 2026-09-16 UK foundation-repair MAPS run

Steps 6–8 of `ch_pipeline.md`, ready to run. GATE 6 approved by the operator on 2026-09-17;
`owner-prompt.md` in this folder IS the approved prompt and is not edited from here on.

```
RUN=clients/atlas-growth/2026-09-16_uk-foundation-repair-maps
ENG=skills/google-maps-scrape
```

Everything below is run from the repo root. **No credits are spent by any of it** — the reads are
in-session Haiku, the sweep is `WebSearch`. The paid gate is `email-verify-debounce-bounceban`,
which is separate and needs an explicit operator go.

---

## State on disk (what the readers will see)

| | |
|---|---|
| reader input CSV | `$RUN/owner_read_input.csv` — **860** rows (qualified 686 / damp_only 174) |
| batches | **15** — `batch-0-in.json` … `batch-14-in.json` (14 × 40 + 1 × 38 = **598** leads) |
| leads carrying `site_text` | **598 / 598** (100% — it is the only evidence source this run has) |
| leads carrying `emails` | 386 |
| `owner_page_text` / `serp_text` / `web_search_evidence` | 0 / 0 / 0 — none of those files exist for this run |
| segment split inside the batches | qualified 429 · damp_only 169 |
| CH **authoritative** directors injected | **262** |
| CH **demoted** (`city_only`) candidates injected | **55** |
| CH **low_confidence** candidates injected | **111** |
| no Companies House record at all | 170 |
| dropped by `prep-owner-batches.js` for having no evidence text | 262 (`owner/read/skipped_none.json`) |

### Why `owner_read_input.csv` and not `ch_input.csv`

`prep-owner-batches.js` reads these columns off the leads CSV: `place_id, name, full_address, zip,
neighborhood, city, state, website, brand_family`. `ch_input.csv` was built for the registry pass and
carries only `place_id, name, full_address, city, zip, website, root_domain, segment` — it is missing
**`neighborhood`**, **`state`** and **`brand_family`**. `brand_family` is the one that matters: the
approved prompt's branch/franchise rule ("a Companies House record for the national holding company
is not this branch's owner" — the Rentokil trap) needs it, and `merge-owner-reads.js` writes it to
every output row. `owner_read_input.csv` is `ch_input.csv` plus those columns joined on `place_id`
from the contacts CSVs (860/860 matched, 0 unmatched). `state` stays blank on purpose — no source CSV
in this run has one, and the UK has no state.

**`emails` does not come from the CSV.** The engine takes it from `owner/site_text.jsonl`
(`emails: s?.emails || []`), not from the leads file, so an `emails` column cannot change what the
reader sees. Probed before relying on it:

```
PROBE site_text.jsonl emails field types: {'list': 1469}
   ('ChIJDRX8VT8SdkgRhnthIGtD3z8', "['info@khb-piling.co.uk']")
```

It is a real JSON array, not a stringified one, so `merge-owner-reads.js`'s
`(lead.emails || [])[0]` fallback for `best_send_email` is sound. The column is carried in
`owner_read_input.csv` anyway for the downstream join.

`owner/site_text_recovered.jsonl` (40 records) was probed too and adds **nothing**: 27 of its records
touch these 860 leads, and for all 27 `site_text.jsonl` already holds the same or longer text and the
same emails — the recovery was merged back before the batches were built. No job-side merge needed.

### Companies House confidence, after the demotion

`demote_city_only_ch.py` (this folder) has already run over `owner/companies_house.jsonl`
(`.bak` kept). Of the engine's 432 accepted matches:

| acceptance basis | n | verdict |
|---|---|---|
| postcode in the registered-office snippet | 154 | kept authoritative |
| name overlap ≥ 0.9 | 195 | kept authoritative |
| **town name only** (`match_postcode` false **and** `name_overlap` < 0.9) | **83** | **demoted** to `confidence: low_confidence`, `demoted_reason: city_only` |

CH-REPORT.md measured the town-name path at **~21% wrong** against ~0.6% / 0% for the other two.
21 of the 23 wrong matches it named by hand are inside the 83 (the two that are not: one is a
correct exact-name match to a namesake, and `Universal Basement Waterproofing → BASEMENT
WATERPROOFING SPECIALISTS` is the known single postcode-path miss). CH-REPORT's own "city only = 119"
bucket is wider than this one: it counted every no-postcode match with a city hit, including 36 that
*also* cleared the ≥ 0.9 name test — and that path measured 0% wrong, so those 36 stay authoritative.

`inject_ch_directors.py` renders a demoted record with the literal the approved prompt keys on:

```
Companies House [low_confidence match]  (DEMOTED: city_only — the ONLY basis for this match was the
town name, so it is a CANDIDATE, not authoritative: apply Companies House rule 3 before you output
anybody from it): TARN DEVELOPMENT LONDON LLP (OC448387)
MARTIN, Antony — llp-designated-member (appointed 2023-07-27)
```

so `owner-prompt.md` Companies House rule 3 — *reject a match whose registered title shares no
distinctive token with the business name* — fires on them. Demotion means **judge it**, not drop it:
the example above shares the distinctive token `tarn` and should survive the rule.

An authoritative one is unchanged and still reads `Companies House [matched match]: KHB PILING LTD
(11024729)`.

---

## STEP A — the 15 Haiku owner reads

Dispatch **one subagent per batch, `model: haiku`, all 15 in a single message** so they run in
parallel. The template is `skills/google-maps-scrape/owner-read-subagent.md`; the text below is that
template with this run's two paths substituted. Send it once per `N` in `0 … 14`.

> Read `clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/owner-prompt.md` in full. It is the
> decision-maker prompt for this vertical: the UK DECISIONS block, the KEEP / EXCLUDE roles, the
> Companies House rules, the UK traps, the contact schema, the ENTITY-MATCH rule, the guardrails and
> the few-shots. Apply it exactly.
>
> Then read
> `clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/owner/read/batches/batch-<N>-in.json`.
> It is an array of leads. Each lead carries its identity (`business_name`, `full_address`, `zip`,
> `neighborhood`, `city`, `state`, `website`, `brand_family`) and its evidence: `ch_directors`
> (Companies House — authoritative when tagged `[matched match]`, a CANDIDATE you must judge when
> tagged `[low_confidence match]`), `site_text`, `owner_page_text`, `serp_text`,
> `web_search_evidence`.
>
> For EACH lead, output the prompt's OUTPUT FIELDS. Write ONE JSON object to
> `clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/owner/read/batches/batch-<N>-out.json`,
> keyed by `place_id`, in the schema in `owner-read-subagent.md`.
>
> Rules that override everything else: `evidence` must be a verbatim quote from the sources that
> contains the person's name, or the person is not output. A candidate whose employer or city does
> not match THIS lead is dropped. `[]` is the correct answer when nobody is named. Never invent a
> name, title or email. Do the work yourself: do NOT spawn, launch or delegate to other agents, and
> do NOT use web search. Write the file with plain UTF-8, no BOM.
>
> Reply with one line: `batch <N>: <leads read> leads, <n> with contacts`.

Two additions to hold the readers to, both already in `owner-prompt.md`:

1. A `[low_confidence match]` block — whether it came from `companies_house_lowconf.jsonl` or from
   the `city_only` demotion — gets **rule 3 applied explicitly** before any of its directors is
   output. 166 of the 598 leads (55 demoted + 111 candidates) are in that state.
2. Companies House prints `SURNAME, Forename`. It is converted (`BIRD, Martin Paul` → `Martin Bird`,
   first forename only) and never emitted raw.

## STEP B — merge the reads (UK exclude list is not optional)

```bash
node $ENG/merge-owner-reads.js --dir $RUN/owner/read --out $RUN/owner/contacts_read.jsonl \
  --exclude-titles "surveyor,damp surveyor,building surveyor,remedial surveyor,quantity surveyor,estimator,inspector,site manager,site foreman,foreman,contracts manager,contracts supervisor,project manager,production manager,technician,damp technician,damp proofer,installer,operative,labourer,laborer,apprentice,scheduler,dispatcher,receptionist,bookkeeper,accounts,health and safety,company secretary,former,retired"
```
→ `owner/contacts_read.jsonl` + `.csv` + `owner/read/read_report.json`

The engine default is the **US** foundation-repair block and does not contain `surveyor` — the
highest-risk false positive in this vertical, because the offer sells inspection appointments and the
person who performs the visit at a UK damp firm is titled *Surveyor*. Pass the list above verbatim.

Check `read_report.json` before moving on: `batches_missing_out` must be empty (re-dispatch any batch
listed there), and `dropped_no_evidence_name` / `excluded_by_title` are the guardrails' own counts,
not errors.

## STEP C — sweep prep for the still-unnamed

```bash
node $ENG/prep-sweep-batches.js \
  --leads $RUN/owner_read_input.csv \
  --out   $RUN/owner/sweep2 \
  --have  $RUN/owner/contacts_read.jsonl \
  --batch 20 --registry linkedin.com
```
→ `owner/sweep2/batches/batch-<N>-in.json`, `owner/sweep2/manifest.json`

**`--registry linkedin.com`, not the engine default `bbb.org`** — the BBB is a US institution with no
UK coverage; LinkedIn is what resolved the UK residue on the export run (+30% of what was left).
`--leads owner_read_input.csv` (860), not `leads_qualified.csv` (686), so the damp_only segment and
the 262 leads with no on-disk text are swept too.

Then one Haiku subagent per sweep batch per `skills/google-maps-scrape/owner-sweep-subagent.md`: at
most two `WebSearch` calls per lead, `owner-prompt.md` applied exactly, ENTITY-MATCH hard (a
same-name firm in another UK town is a different company). **Each sweep subagent must load the search
tool first with `ToolSearch` `select:WebSearch`** — batches that skipped that returned nothing on the
export run. Merge with the same UK `--exclude-titles` list:

```bash
node $ENG/merge-owner-reads.js --dir $RUN/owner/sweep2 --out $RUN/owner/contacts_sweep.jsonl \
  --exclude-titles "<the same UK list as STEP B>"
```

Then `ch_second_pass.py` (step 5 of `ch_pipeline.md`, needs the key), re-run steps 4 and 6 for
whatever it names, and `combine-owner-contacts.js` (step 9).

---

## Open items for the operator

1. **262 leads never reach a reader.** `prep-owner-batches.js` drops a lead with no evidence text at
   all, and `ch_directors` is injected *after* that drop — so a lead whose only evidence is the
   registry is not judged. **192 of the 262 carry Companies House officers: 86 authoritative, 78
   low_confidence candidates, 28 demoted `city_only`.** The 28 are the exposure: an unjudged
   town-name-only match. Two ways to close it, operator's call — queue a CH-only read pass over
   `owner/read/skipped_none.json`, or leave them to `assemble_deliverable.py`'s own `same_company()`
   QA (it already drops a `companies_house`-sourced contact whose CH title shares no core token with
   the business name), which catches the same defect one stage later. STEP C sweeps all 262 for a
   name regardless.
2. **The engine still accepts on `cityMatch` alone.** The demotion here is job-side and applies to
   this run's output only. The permanent fix belongs in `skills/google-maps-scrape/companies-house.js`
   behind a test and an operator go — a new `IMPROVEMENTS.md` entry, distinct from the OPEN
   2026-09-16 tokenisation entry.
3. **`ch_second_pass.py` has not run.** It is a post-read step by design (`ch_pipeline.md`'s ordering
   correction) and needs `COMPANIES_HOUSE_KEY`.

## Reproducing `owner_read_input.csv`

```python
import csv
COLS = ['place_id','name','full_address','city','zip','neighborhood','state','website',
        'root_domain','brand_family','segment','emails']
base = list(csv.DictReader(open('ch_input.csv', newline='', encoding='utf-8-sig')))
enrich = {}
for f in ('leads_qualified_contacts.csv','leads_damp_only_contacts.csv'):
    for r in csv.DictReader(open(f, newline='', encoding='utf-8-sig')):
        enrich[r['place_id']] = r
rows = []
for r in base:
    e = enrich.get(r['place_id'], {})
    rows.append({'place_id': r['place_id'], 'name': r['name'],
                 'full_address': r.get('full_address') or e.get('full_address',''),
                 'city': r.get('city') or e.get('city',''), 'zip': r.get('zip') or e.get('zip',''),
                 'neighborhood': e.get('neighborhood',''), 'state': '',
                 'website': r.get('website') or e.get('website',''),
                 'root_domain': r.get('root_domain') or e.get('root_domain',''),
                 'brand_family': e.get('brand_family',''), 'segment': r.get('segment',''),
                 'emails': e.get('all_emails') or e.get('email','')})
with open('owner_read_input.csv','w',newline='',encoding='utf-8') as fh:
    w = csv.DictWriter(fh, fieldnames=COLS); w.writeheader(); w.writerows(rows)
```

## Commands already run (do not repeat)

```bash
python3 $RUN/demote_city_only_ch.py          # 349 kept authoritative / 83 demoted / 428 already low
node $ENG/prep-owner-batches.js --leads $RUN/owner_read_input.csv --dir $RUN/owner \
     --out $RUN/owner/read --batch 40        # 598 items, 15 batches, 262 skipped_none
python3 $RUN/inject_ch_directors.py          # 428 of 598 leads given ch_directors
```

`demote_city_only_ch.py` and `inject_ch_directors.py` are both idempotent; re-running
`prep-owner-batches.js` rewrites the `-in.json` files and therefore **requires**
`inject_ch_directors.py` to be run again after it.
