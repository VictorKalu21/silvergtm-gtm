# STEP C — web-search sweep for the still-unnamed · 2026-09-16 UK foundation-repair MAPS run

`READ-PLAN.md` STEP C, ready to dispatch. Supersedes STEP C's `owner/sweep2` path: this run's sweep
directory is **`owner/sweep`** (the `sweep2` name was carried over verbatim from the 2026-09-16
export run's folder layout; nothing reads the name).

```
RUN=clients/atlas-growth/2026-09-16_uk-foundation-repair-maps
ENG=skills/google-maps-scrape
```

Run everything from the repo root. **No credits are spent by any of it** — the sweep is `WebSearch`
and the readers are in-session Haiku. The paid gate is `email-verify-debounce-bounceban`, which is
separate and needs an explicit operator go.

---

## State on disk when this plan was written (2026-09-17)

| | |
|---|---|
| lead spine | `owner_read_input.csv` — **860** (qualified 686 · damp_only 174) |
| named by the site-text read | 380 (`owner/contacts_read.jsonl`, 598 records) |
| named by the CH-only read | 103 (`owner/contacts_read_chonly.jsonl`, 192 records) |
| **named, `primary_name` non-empty** | **483** → `owner/contacts_named_have.jsonl` (`build_have.py`) |
| records with `contacts` but NO `primary_name` | 8 — **not** named; see below |
| still unnamed | **377** |
| Companies House pass 2 (`ch_second_pass.py`) | 102 matched with active directors; 55 are national-brand branches, **47 queued** as `owner/read_pass2/batches/` (2 batches) |
| sweep queue | **377 leads · 19 batches of 20** → `owner/sweep/batches/batch-0-in.json … batch-18-in.json` |

### The 8 records that have `contacts` but no `primary_name`

`prep-sweep-batches.js` counts a lead as named when the record has `contacts.length`;
`combine-owner-contacts.js` — the step that actually builds the deliverable — counts it named when
`primary_name` is non-empty. They disagree on 8 records, because `merge-owner-reads.js` kept a
"contact" the reader produced but promoted none of them to primary: they are page headings and
postal addresses, not people (`"West Yorkshire"` / title `"WF12 7QE"`, `"Home About Damptec"`,
`"Southeast Preservation"`), all `role_bucket: other`, `is_likely_owner: false`. Left alone they are
the worst of both worlds — the deliverable drops them and the sweep skips them. `build_have.py`
writes the combined `--have` file from the `primary_name` test, so all 8 are back in the sweep
queue. **Always sweep against `owner/contacts_named_have.jsonl`, never against the two raw read
files.**

---

## Order of operations — read pass 2 BEFORE the sweep

The pass-2 reads cost no WebSearch and cover 47 of the 377 sweep-queued leads (all 47 are in the
queue today). Reading them first is free and shrinks the sweep:

1. Dispatch the **2 pass-2 CH-only read batches** (`owner/read_pass2/batches/`) with the STEP A2
   prompt from `READ-PLAN.md`, swapping `owner/read_chonly` → `owner/read_pass2`. Its three
   additions apply verbatim — the Companies House block is the ONLY evidence by construction; for a
   `[low_confidence match]` rule 3 is the entire judgement; a surname inside a trading name is not
   evidence of a director.
2. Merge them:

   ```bash
   node $ENG/merge-owner-reads.js --dir $RUN/owner/read_pass2 --out $RUN/owner/contacts_read_pass2.jsonl \
     --exclude-titles "surveyor,damp surveyor,building surveyor,remedial surveyor,quantity surveyor,estimator,inspector,site manager,site foreman,foreman,contracts manager,contracts supervisor,project manager,production manager,technician,damp technician,damp proofer,installer,operative,labourer,laborer,apprentice,scheduler,dispatcher,receptionist,bookkeeper,accounts,health and safety,company secretary,former,retired"
   ```

3. Rebuild the `--have` file and **re-run the sweep prep** so the sweep never searches a lead pass 2
   just named:

   ```bash
   python3 $RUN/build_have.py owner/contacts_read.jsonl owner/contacts_read_chonly.jsonl \
                              owner/contacts_read_pass2.jsonl   # paths resolve against the run folder
   node $ENG/prep-sweep-batches.js --leads $RUN/owner_read_input.csv --out $RUN/owner/sweep \
     --have $RUN/owner/contacts_named_have.jsonl --batch 20 --registry linkedin.com
   ```

   The prep is deterministic and free; re-running it rewrites `owner/sweep/batches/` from scratch.
   Expect ~330–377 queued (17–19 batches) depending on the pass-2 read's yield.

The command that built today's queue, for the record:

```bash
python3 $RUN/build_have.py            # 483 named -> owner/contacts_named_have.jsonl (8 junk retried)
node $ENG/prep-sweep-batches.js --leads $RUN/owner_read_input.csv --out $RUN/owner/sweep \
  --have $RUN/owner/contacts_named_have.jsonl --batch 20 --registry linkedin.com
# {"leads":860,"already_named":483,"only":null,"queued":377,"batches":19,"batch_size":20,"registry":"linkedin.com"}
```

`--registry linkedin.com`, **not** the engine default `bbb.org` — the BBB is a US institution with
no UK coverage; LinkedIn is what resolved the UK residue on the export run (+30% of what was left).
`--leads owner_read_input.csv` (860), not `leads_qualified.csv` (686), so the damp_only segment and
the 262 leads with no on-disk text are swept too.

---

## WebSearch budget and the first tranche

**200 WebSearch calls per run is the ceiling.** The prompt caps each lead at two searches, so a
batch of 20 costs at most 40 and **5 batches = 100 leads = 200 searches is the whole budget for one
session.** Six batches (240) does not fit.

- **First tranche: `batch-0` … `batch-4` — 5 batches, 100 leads, ≤200 searches.** Dispatch all five
  in one message. Nothing else in that session may use WebSearch.
- If the session needs headroom for a retry or a re-dispatch, take **4 batches (80 leads, ≤160
  searches)** instead and keep 40 in reserve.
- Measure before scaling (`owner-finding.md`, "Tier the sources by cost"): after the tranche merges,
  check `owner/sweep/read_report.json` for `leads_with_contacts` and each subagent's reported search
  count. The export run's LinkedIn sweep named ~30% of what was left. **Below ~15% named, stop** —
  the remaining leads are no-website sole traders and brand branches, and the sweep is not paying
  for itself.
- 19 batches at 5 per tranche is 4 sessions; ~17 after the pass-2 dedupe.

### What the ready-made queries look like

`prep-sweep-batches.js` writes `query` = `"<business_name>" <town> <state> owner`. `state` is blank
for the UK (the double space is cosmetic). Three real examples from `batch-0-in.json`:

```
"L&V Underpinning Services" London  owner
"B&S Underpinning Basements" Beckenham  owner
"Prime Piling | Piling & Mini Piling | Covering Essex and London"   owner
```

The third is the failure mode to plan for: **73 of the 377 names carry a Google-Maps title
separator (`|`, `,`, ` - `) or run past 45 characters, and 106 leads have a blank `city`.** Quoted
as an exact phrase those return nothing. The dispatch text below therefore tells the agent to trim
the name for search 1; that is a query fix, not an extra search, and the two-search cap is unchanged.

---

## The dispatch text — one Haiku subagent per batch

`skills/google-maps-scrape/owner-sweep-subagent.md` with this run's paths substituted. Send it once
per `N` in the tranche, **all in a single message, `model: haiku`,** so they run in parallel.

> Read `clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/owner-prompt.md` in full and apply
> it exactly: the UK DECISIONS block and its KEEP / EXCLUDE roles, the UK vertical traps, the
> ENTITY-MATCH rule, the contact schema, the guardrails and the few-shots.
>
> Then read
> `clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/owner/sweep/batches/batch-<N>-in.json`.
> It is an array of leads, each with `place_id`, `business_name`, `city`, `state` (blank — this is
> the UK), `zip`, `website`, `brand_family`, a ready-made `query`, and `registry` =
> `linkedin.com`.
>
> **Before anything else, load the search tool: call `ToolSearch` with query `select:WebSearch`.**
> It is a deferred tool for subagents and is not callable until you load it; batches that skipped
> this step returned nothing on the last run.
>
> Then, for EACH lead, at most **two** `WebSearch` calls and no page fetches:
>
> 1. **Search 1 — the lead's `query`.** If `business_name` carries a Google-Maps title separator
>    (`|`, `,`, ` - `) or runs past ~45 characters, first trim it to the trading name — everything
>    before the first `|` or `,`, and drop a trailing ` - <Town>` — and search
>    `"<trimmed name>" <city> owner` instead. Trimming is a query fix, not an extra search.
> 2. **Search 2 — only if search 1 names nobody for THIS business.** The same query with
>    `allowed_domains: ["linkedin.com"]`. That is the second and last search for this lead.
> 3. Read the result titles and snippets only. Output a person **only** when the result names THIS
>    business — the company name closely matches `business_name` — **in THIS city**. `evidence` must
>    be a **verbatim quote from a search-result snippet that contains the person's name**; no such
>    quote, no contact. `source` is `"web_search"`.
>
> Rules that override everything else:
>
> - **BRANCH MISMATCH — reject.** A multi-location company returns a real director or president for
>   the WRONG branch. If the result's city differs from the lead's `city`, drop the person. When
>   `brand_family` is non-empty (`Timberwise`, `Rentokil Property Care`, `DampMaster`,
>   `Protectahome` — 58 leads in this queue) the national holding company's board is **not** this
>   branch's decision-maker: output only a person the snippet ties to THIS branch and THIS town
>   (a branch manager, a regional manager), never a group director.
> - **ENTITY-MATCH is hard.** A same-name firm in another UK town is a different company. A LinkedIn
>   profile in another city or region is a REJECT. A wrong owner is worse than no owner.
> - `[]` is the correct answer when nobody qualifies. **Never invent a name, title or email.**
> - Apply the UK EXCLUDE roles — **Surveyor above all** (the person who attends the damp survey is
>   not the buyer), plus Estimator, Contracts Manager, Site Manager, Technician, Company Secretary
>   and the rest of the prompt's EXCLUDE list.
> - The UK sole-trader trap still applies: `A J Walker Underpinning` → the surname is Walker, but
>   never invent a forename that no source states.
>
> Write ONE JSON object to
> `clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/owner/sweep/batches/batch-<N>-out.json`,
> keyed by `place_id`, with **every lead in the batch present**. Each value is shaped exactly as the
> owner-read output: `contacts[]` of
> `{name, first_name, title, role_bucket, is_likely_owner, evidence, source:"web_search", email}`,
> plus `primary_name`, `primary_first_name`, `primary_role`, `primary_is_owner`, `best_send_email`,
> `confidence`, `needs_review`. Plain UTF-8, no BOM, written with the Write tool. Do NOT spawn,
> launch or delegate to other agents.
>
> Reply with exactly one line: `batch <N>: <leads> leads, <searches> searches, <n> with contacts`.

Before merging, confirm every dispatched batch wrote its `-out.json`; `merge-owner-reads.js` lists
any that did not in `read_report.json`'s `batches_missing_out`, and those get re-dispatched.

## Merge the sweep

```bash
node $ENG/merge-owner-reads.js --dir $RUN/owner/sweep --out $RUN/owner/contacts_sweep.jsonl \
  --exclude-titles "surveyor,damp surveyor,building surveyor,remedial surveyor,quantity surveyor,estimator,inspector,site manager,site foreman,foreman,contracts manager,contracts supervisor,project manager,production manager,technician,damp technician,damp proofer,installer,operative,labourer,laborer,apprentice,scheduler,dispatcher,receptionist,bookkeeper,accounts,health and safety,company secretary,former,retired"
```
→ `owner/contacts_sweep.jsonl` + `.csv` + `owner/sweep/read_report.json`

The same UK `--exclude-titles` list as STEP A2 / STEP B, verbatim. It is **not optional**: the engine
default is the US foundation-repair block and has no `surveyor` in it, the highest-risk false
positive in this vertical. The merge re-applies the fixed guardrails deterministically (evidence must
contain the name, bucket must be in the enum, a name may not contain a role or trade word) and counts
every drop. Run it once per tranche — it re-reads every `-out.json` present, so a later tranche's
merge supersedes the earlier one.

## Combine — read + read_chonly + read_pass2 + sweep

```bash
node $ENG/combine-owner-contacts.js \
  --leads $RUN/owner_read_input.csv \
  --out   $RUN/owner/contacts_final.jsonl \
  $RUN/owner/contacts_read.jsonl \
  $RUN/owner/contacts_read_chonly.jsonl \
  $RUN/owner/contacts_read_pass2.jsonl \
  $RUN/owner/contacts_sweep.jsonl
```
→ `owner/contacts_final.jsonl` + `.csv` + `owner/contacts_final_summary.json`

**Precedence is argument order**, and this order is deliberate:

1. `contacts_read.jsonl` — the site-text read, the richest evidence (website + registry together).
2. `contacts_read_chonly.jsonl` — the registry-only read of the 192 leads that had no page text.
3. `contacts_read_pass2.jsonl` — the pass-2 registry matches; later because pass 2's matcher is
   looser than the engine's, so an earlier file's name wins where both name the same lead.
4. `contacts_sweep.jsonl` — web search, the weakest evidence, fills only leads still unnamed.

A file that does not exist yet is skipped with a `WARN missing` line, so the command is safe to run
after each tranche to watch `named_pct` move.

`--leads owner_read_input.csv` puts all **860** leads on the spine (qualified + damp_only), so
`named_pct` is measured over the whole run; `review_count` is blank in the CSV because that column
lives in `leads_qualified_contacts.csv` / `leads_damp_only_contacts.csv` and is joined back by
`assemble_deliverable.py`. For the qualified-only headline against the export run's **79%**, re-run
the same command with `--leads $RUN/leads_qualified.csv --out $RUN/owner/contacts_final_qualified.jsonl`.

## After this

`assemble_deliverable.py` (ported from the export run) joins the leads CSVs and
`contacts_final.jsonl` into the deliverable, with its `same_company()` QA as the second net over the
low-confidence registry matches. Then `email-waterfall` fills missing addresses and
`email-verify-debounce-bounceban` gates the send — **verification spends credits and needs an
explicit operator go.**
