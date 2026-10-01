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

## STEP A2 — the 5 Companies-House-ONLY reads (the 262 skipped leads)

Closes open item 1. `prep_chonly_batches.py` (this folder) rebuilds the leads
`prep-owner-batches.js` dropped for having no evidence text, in the identical lead-object shape,
with `site_text` / `owner_page_text` / `serp_text` / `web_search_evidence` all empty and
`ch_directors` rendered by a byte-for-byte copy of `inject_ch_directors.py`'s renderer (the script
asserts the `[matched match]` / `[low_confidence match]` / `DEMOTED` literals still match that
file's source before it writes anything). It is **not** imported — `inject_ch_directors.py` works at
module level and an import would rewrite `owner/read/batches/` underneath the live readers.

```bash
python3 $RUN/prep_chonly_batches.py          # --batch 40, --out owner/read_chonly
```

```
skipped leads total:            262
  with >=1 active CH officer:   192     (the engine stores active officers only — `!x.resigned_on`)
  no Companies House officers:  70      (STEP C sweeps these for a name)
batches written:                5       (4 x 40 + 1 x 32) -> owner/read_chonly/batches
  authoritative [matched match]:        86
  candidates    [low_confidence match]: 78
  DEMOTED city_only:                    28   <- the exposure open item 1 named
```

Dispatch **one subagent per batch, `model: haiku`, all 5 in a single message** — the STEP A prompt
template verbatim, with `owner/read/batches/batch-<N>-in.json` swapped for
`owner/read_chonly/batches/batch-<N>-in.json` (and the same swap in the `-out.json` write path), for
`N` in `0 … 4`. Three things to add to it, because these readers see a different world:

1. **The Companies House block is the ONLY evidence.** `site_text`, `owner_page_text`, `serp_text`
   and `web_search_evidence` are empty by construction, not by accident — do not report them as
   missing data and do not go looking for more (no web search; that is STEP C's job).
2. **For a `[low_confidence match]` — 106 of the 192 — rule 3 is the ENTIRE judgement.** With no
   page text there is no second signal to corroborate with, so the distinctive-token overlap between
   the registered company title and the business name decides it alone. No overlap ⇒ output `[]`.
   `BNS Groundwork London → GROUNDWORK EAST LONDON` shares only the generic `groundwork` and dies;
   `TARN Basement Excavation London → TARN DEVELOPMENT LONDON LLP` shares `tarn` and survives.
3. **A sole-trader-style business name is not evidence of a director.** "J Smith Damp Proofing"
   matching a `SMITH` officer at some company is a name coincidence, not a match — the surname in a
   trading name does not satisfy rule 3 on its own, and the ENTITY-MATCH rule still applies (a
   same-name firm in another UK town is a different company).

`evidence` is still a verbatim quote containing the person's name — here that quote comes from the
`ch_directors` block itself. `SURNAME, Forename` is converted (`BARLOW, Reginald William` →
`Reginald Barlow`, first forename only) and never emitted raw. `source` is `companies_house`.

### Merge (confirmed: `merge-owner-reads.js --dir` points anywhere)

`--dir` is used only as `path.join(DIR, 'batches')` for the `batch-<N>-in.json` / `-out.json` pairs
and as the write path for `read_report.json`; `--out` defaults to `<dir>/../contacts_read.jsonl` and
is passed explicitly here so it cannot collide with STEP B's file. Nothing in it is hardcoded to
`owner/read`, so this directory works unchanged:

```bash
node $ENG/merge-owner-reads.js --dir $RUN/owner/read_chonly --out $RUN/owner/contacts_read_chonly.jsonl \
  --exclude-titles "surveyor,damp surveyor,building surveyor,remedial surveyor,quantity surveyor,estimator,inspector,site manager,site foreman,foreman,contracts manager,contracts supervisor,project manager,production manager,technician,damp technician,damp proofer,installer,operative,labourer,laborer,apprentice,scheduler,dispatcher,receptionist,bookkeeper,accounts,health and safety,company secretary,former,retired"
```
→ `owner/contacts_read_chonly.jsonl` + `.csv` + `owner/read_chonly/read_report.json`

Same UK `--exclude-titles` list as STEP B, verbatim — `company secretary` earns its place here more
than anywhere else, since a registry block is exactly where one shows up. Feed
`contacts_read_chonly.jsonl` to `combine-owner-contacts.js` (step 9) alongside
`contacts_read.jsonl` and `contacts_sweep.jsonl`.

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

1. ~~**262 leads never reach a reader.**~~ **CLOSED by STEP A2.** `prep-owner-batches.js` drops a
   lead with no evidence text at all, and `ch_directors` is injected *after* that drop — so a lead
   whose only evidence is the registry was not judged. **192 of the 262 carry Companies House
   officers: 86 authoritative, 78 low_confidence candidates, 28 demoted `city_only`** — the 28 being
   the exposure, an unjudged town-name-only match. `prep_chonly_batches.py` now queues all 192 as 5
   CH-only read batches in `owner/read_chonly/` (STEP A2); `assemble_deliverable.py`'s
   `same_company()` QA stays as the second net one stage later. The remaining 70 have no registry
   record either; STEP C sweeps all 262 for a name regardless.
2. **The engine still accepts on `cityMatch` alone.** The demotion here is job-side and applies to
   this run's output only. The permanent fix belongs in `skills/google-maps-scrape/companies-house.js`
   behind a test and an operator go — a new `IMPROVEMENTS.md` entry, distinct from the OPEN
   2026-09-16 tokenisation entry.
3. ~~**`ch_second_pass.py` has not run.**~~ **RAN 2026-09-17**, after both reads, as the ordering
   correction in `ch_pipeline.md` requires. `--have` now repeats (both read files) and "already
   named" is `contacts` AND `primary_name`; acceptances made on the town name alone get the same
   `city_only` demotion `demote_city_only_ch.py` applies to the engine's output. **377 unnamed
   tried → 102 matched with active directors** (96 exact_title, 4 title_contains+postcode, 2
   title_contains+city → demoted). 55 of the 102 are national-brand branches resolving to the
   national parent (Timberwise 29, Rentokil 25, Protectahome 1) — the prompt's branch rule already
   rejected that evidence, so `prep_pass2_batches.py` skips them; **47 queued as 2 CH-only read
   batches in `owner/read_pass2/`.** STEP C is now written out in full in `SWEEP-PLAN.md`, which
   also supersedes the `owner/sweep2` path above with `owner/sweep`.

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
python3 $RUN/prep_chonly_batches.py          # 192 of the 262 skipped, 5 batches -> owner/read_chonly
```

`demote_city_only_ch.py` and `inject_ch_directors.py` are both idempotent; re-running
`prep-owner-batches.js` rewrites the `-in.json` files and therefore **requires**
`inject_ch_directors.py` to be run again after it.
