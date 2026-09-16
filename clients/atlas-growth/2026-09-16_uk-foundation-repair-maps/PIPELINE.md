# Post-scrape pipeline — Atlas Growth UK foundation repair (2026-09-16 Maps run)

Copy-paste, in order, from the repo root (`/home/user/silvergtm-gtm`). Every path below is real.
Nothing here spends an API credit: STEPS 1–7 are deterministic, $0, no network.

Shorthand used in the prose only — the commands are written out in full:

| | |
|---|---|
| `<run>` | `clients/atlas-growth/2026-09-16_uk-foundation-repair-maps` |
| config | `clients/atlas-growth/atlas-growth-uk-config.json` |
| recovery config | `clients/atlas-growth/recover-generic-uk-config.json` |
| runsheet | `clients/atlas-growth/atlas-growth-uk-runsheet.csv` (1770 rows = 177 tiles × 10 queries) |
| memory | `clients/atlas-growth/2026-09-16_uk-foundation-repair/deliverable/atlas_uk_foundation_repair_qualified.csv` (175 rows, gitignored) |

Each step lists its **STOP condition**. A stop is not an obstacle to route around — it is the step
that has not finished.

---

## 0. Gate: are all 8 shards actually done?

```bash
cd /home/user/silvergtm-gtm
for i in 0 1 2 3 4 5 6 7; do
  printf 'shard-%s: ' "$i"
  node -e 'const f=process.argv[1];const fs=require("fs");if(!fs.existsSync(f)){console.log("NO coverage_report.json");process.exit(0)}const c=JSON.parse(fs.readFileSync(f,"utf8"));console.log(c.status,"| tiles",c.runsheet_tiles,"| heal passes",c.heal_passes,"| unhealed",(c.unhealed_tiles||[]).length)' \
    "clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/shard-$i/coverage_report.json"
done
```

**STOP** unless all 8 print `COMPLETE`. `run-scrape.js` exits 1 on INCOMPLETE for a reason: in
`areas` mode there is no other coverage alarm, so an unhealed tile ships looking complete
(SKILL STEP 4; the SolveX 75%-coverage loss). Re-buy only the missing tiles:

```bash
node skills/google-maps-scrape/run-scrape.js \
  --runsheet clients/atlas-growth/shards/shard-3.csv \
  --config   clients/atlas-growth/atlas-growth-uk-config.json \
  --out      clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/shard-3 \
  --resume --max-retries 3
```

`--resume` skips every tile that already reached `status:'ok'` in that shard dir (it reads the
top-level `run_log.json` plus each `heal-`/`resume-` subdir), so a re-run costs only the gap.

---

## 1. Merge the 8 shards → one run-level universe

```bash
node clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/merge-shards.js
```

Writes into `<run>/`: `leads_clean.csv`, `excluded.csv`, `coverage_summary.json`,
`calls_summary.json`. Round-robin sharding puts the same business in several shards, so the
cross-shard dupe count is expected to be large; dedupe is on `place_id`, unioning `google_types`
and `icp_type` **rejoined with `|`** (IMPROVEMENTS HIGH — any other separator turns the
primary-only `deny` into an any-match deny) and keeping the highest-`review_count` hit as the base
row with the first hit's primary type preserved.

It **refuses (exit 1)** if any shard is missing `coverage_report.json` or says INCOMPLETE. Only
override once the gap is understood:

```bash
node clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/merge-shards.js --allow-incomplete
```

**Read before moving on:** `calls_summary.json` — `calls_per_runsheet_row` (the Lagos pilot
measured ~2.91 on dense tiles; far below ~1.5 means pagination under-collected), the
`page_depth_histogram` (a spike at `max_pages` = 6 means tiles hit the page guard and the viewport
was NOT exhausted), `zero_count_tiles`, and `non_ok_by_status` (should be empty once every shard is
COMPLETE).

---

## 2. Qualify — main ICP rules

```bash
node skills/google-maps-scrape/qualify-leads.js \
  --in     clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/leads_clean.csv \
  --config clients/atlas-growth/atlas-growth-uk-config.json \
  --out    clients/atlas-growth/2026-09-16_uk-foundation-repair-maps
```

→ `leads_clean_qualified.csv` + `excluded_officp.csv`. Expect `rules: 5 active`. The rule set was
dry-run against `<run>/fixture.csv` (26 rows → 10 keep / 16 drop, re-verified 2026-09-16); if the
live drop-reason mix looks nothing like `dryrun-results.md`, suspect the merge separator first
(`grep -c ';' leads_clean.csv` should be about the quoted-address count, never a per-row hit in the
`google_types` column).

---

## 3. Recovery pass — general builders with a structural-repairs line

The main allow deliberately omits the generic construction types; in the 2026-09-16 UK profile
those are ~17% of the real ICP. The recovery config reverses exactly ONE drop reason
(`not_in_icp`) and nothing else.

```bash
node skills/google-maps-scrape/qualify-leads.js \
  --in     clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/excluded_officp.csv \
  --config clients/atlas-growth/recover-generic-uk-config.json \
  --out    clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/recover
```

→ `<run>/recover/leads_clean_qualified.csv`. Expect `rules: 4 active`; if it warns
`skipping rule on unknown field "drop_reason"`, the input was the wrong file and the pass has
degraded to type+name — **STOP** and re-point `--in`.

Then append the recovered rows into the main qualified list, **deduped on `place_id` with an
explicit no-overlap assertion** (the recovery input is the main pass's own drop file, so an overlap
means one of the two passes read the wrong file):

```bash
cd /home/user/silvergtm-gtm/clients/atlas-growth/2026-09-16_uk-foundation-repair-maps
node - <<'EOF'
const fs=require('fs');
const A='leads_clean_qualified.csv', B='recover/leads_clean_qualified.csv';
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
const rd=f=>{const R=pc(fs.readFileSync(f,'utf8')).filter(r=>r.length>1);const H=R.shift();return{H,rows:R.map(r=>Object.fromEntries(H.map((h,i)=>[h,r[i]==null?'':r[i]])))};};
const a=rd(A), b=rd(B);
const seen=new Set(a.rows.map(r=>r.place_id));
const overlap=b.rows.filter(r=>seen.has(r.place_id));
if(overlap.length){console.error('ASSERT FAILED: '+overlap.length+' recovered place_ids are ALREADY in the main pass ('+overlap.slice(0,5).map(r=>r.place_id).join(', ')+') — nothing written');process.exit(1);}
// write through the MAIN header, so the recovery file's trailing drop_reason column is dropped
const out=[a.H.map(esc).join(','), ...a.rows.map(r=>a.H.map(h=>esc(r[h])).join(',')), ...b.rows.map(r=>a.H.map(h=>esc(r[h])).join(','))];
fs.writeFileSync(A, out.join('\n')+'\n');
console.log('appended '+b.rows.length+' recovered + '+a.rows.length+' main = '+(a.rows.length+b.rows.length)+' rows | place_id overlap: 0 (asserted)');
EOF
cd /home/user/silvergtm-gtm
```

This is **not** idempotent — run it exactly once; a second run fails the assertion by design.

---

## 4. Footprint gate (SKILL STEP 5b-geo) — the ONLY geo gate in `areas` mode

```bash
node skills/google-maps-scrape/footprint-gate.js \
  --in       clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/leads_clean_qualified.csv \
  --runsheet clients/atlas-growth/atlas-growth-uk-runsheet.csv \
  --config   clients/atlas-growth/atlas-growth-uk-config.json \
  --out      clients/atlas-growth/2026-09-16_uk-foundation-repair-maps \
  --hub-radius-deg 0.75
```

→ `leads_clean_qualified_infootprint.csv` + `excluded_geo.csv` + `footprint_gate_report.json`.

**No `--regions`.** `geo.region_from_city` is `null` for the UK (there is no state token to parse
out of `city`), so the region check cannot run; passing `--regions` with a null regex would do
nothing here, and on any geo where the regex DOES exist it would drop in-country leads. Verified on
the 10-row keep set: `hub_gate: true`, 0 dropped, all four nations kept.

### Hub radius: use **0.75° (~83 km)**, not the 1.0° default

The Lagos lesson is to tune the radius against the run sheet **actually shipped**, and this sheet is
dense: 177 unique tile centres, nearest-neighbour spacing median 20.7 km / p90 43.8 km / max 88.7 km,
built to a stated "no populated area more than ~25 km from a tile" rule (GATE1 §1). Measured
distance from each anchor set to real places (probe, 2026-09-16):

| point | km to nearest anchor | 1.0° (111 km) | **0.75° (83 km)** | 0.5° (56 km) |
|---|---:|---|---|---|
| every named anchor town (Penzance, Wick, Enniskillen, Haverfordwest, Dover …) | ≤ 0.4 | keep | **keep** | keep |
| Thurso | 29.9 | keep | **keep** | keep |
| Kirkwall (Orkney — no anchor) | 60.7 | keep | **keep** | **DROPS — real UK loss** |
| Douglas, Isle of Man (not the UK) | 81.6 | keep | **keep (marginal)** | drops |
| Dublin | 91.9 | **keep — bleed** | **drops** | drops |
| Guernsey / Jersey / Cherbourg / Lille | 123–158 | drops | drops | drops |
| Stornoway (Western Isles — no anchor) | 151.8 | drops | drops | drops |

0.75° is the only setting that keeps everything the sheet actually commissioned (worst real gap:
Orkney at 60.7 km) while the hub gate still does its job. End-to-end probe through the live gate:

```
hub-radius 1.0  -> dropped 2: Donegal(wrong_country), Dublin-with-"Ireland"(wrong_country)
hub-radius 0.75 -> dropped 3: + a Dublin pin whose address has NO country token (far_from_hubs)
hub-radius 0.5  -> dropped 4: + Kirkwall, Orkney (far_from_hubs)   <-- a real UK firm
```

At 1.0° a Dublin pin carrying no country token rides straight in; that is the exact `areas`-mode
bleed this gate exists for.

**Residual, check it by hand:** a Calais pin is 43.0 km from the Dover anchor, so it survives every
radius above and is caught only by the `wrong_country` rule — i.e. only if its address ends in
"France". Grep `excluded_geo.csv` and the kept file for `62100`/`France`/`Belgium` after the run.
UK-token addresses are safe: `geo.region_default:"UK"` deletes the whole alias group
`[united kingdom, uk, england, scotland, wales]` from the foreign-country set (verified: addresses
ending "England", "Scotland", "Wales", "United Kingdom" all kept; "…, Ireland" dropped).

---

## 5. Cross-run dedupe vs the 2026-09-16 export run (SKILL STEP 5c, MANDATORY)

```bash
node clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/dedupe-ref.js \
  --in clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/leads_clean_qualified_infootprint.csv
```

→ `<run>/leads_netnew.csv` + `<run>/dedupe_report.json`.

**STOP unless the first line reads `ref rows: 175`.** The memory file is gitignored, so a wrong or
moved path fails silently as "everything is net-new" — which means re-contacting 175 firms that are
already in a live campaign.

Three keys, first match wins: `new.business_id == ref.place_id` (the memory's `place_id` column
holds the `0x…:0x…` id that the Maps engine writes as `business_id`), registrable website host, and
the normalised phone (`+44…` → `0…`). Shared hosts are never a key on either side — one ref row
lists a checkatrade.com profile, and keying on that host would delete every Checkatrade-only UK
lead.

### Do NOT also run `build-netnew.js --client` here

Probed 2026-09-16 against this client folder:

```
$ node skills/google-maps-scrape/build-netnew.js --new <probe.csv> --client clients/atlas-growth --out <probe_netnew.csv>
ref files used: 0 | prior place_ids: 0 | new: 1
dropped: 0 (place_id) + 0 (website host) | NET-NEW kept: 1
```

Its `--client` walk accepts shipped-feed filenames only (`/^clay.*\.csv$|_netnew\.csv$/i`), and
nothing under `clients/atlas-growth` matches: the export deliverable is
`atlas_uk_foundation_repair_qualified.csv`, `clients/atlas-growth/shards/shard-*.csv` are RUNSHEET
shards with no `place_id` column, the 2026-09-11 US run folder holds no CSV at all, and this run's
own folder is skipped by design. So it discovers zero refs and drops nothing — while printing the
`ref files used: 0` line that SKILL STEP 5c defines as a STOP for a client with history. Forcing it
with an explicit `--ref` at the deliverable is worse: its `place_id` key still matches nothing
(0x… vs ChIJ…), so the only key that fires is its website host — full-host, not registrable, and
with no shared-host guard, so that one checkatrade.com row would drop real leads for no id-match
upside. **Use `dedupe-ref.js` and skip `--client`.**

Watch for later: if anyone drops a `clay*.csv` or `*_netnew.csv` from the 2026-09-11 **US** run into
`clients/atlas-growth`, `--client` will start matching it and its host key can then drop UK rows on
a US host match (and on any shared host in that feed). Keep using `dedupe-ref.js` if that happens.

---

## 6. Collapse domains + route shared hosts (SKILL STEP 5c-dom)

```bash
node skills/google-maps-scrape/collapse-domains.js \
  --in     clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/leads_netnew.csv \
  --out    clients/atlas-growth/2026-09-16_uk-foundation-repair-maps \
  --config clients/atlas-growth/atlas-growth-uk-config.json
```

→ `leads_annotated.csv` (the spine — every row survives, plus `website_class`, `root_domain`,
`location_count`, `is_multi_location`, `brand_family`, `rep_place_id`), `leads_domains.csv` (the
only file any paid step is fed), `leads_nowebsite.csv` (the STEP 5d recovery track — includes
Checkatrade/Facebook-only firms), `domain_siblings.json`, `collapse_report.json`.

`--config` is required for `brand_family` labelling. The 18 UK brand families were substring-tested
against the 26-row fixture and flagged 4 brands and zero of the 22 independents.

---

## 7. Gate-3 read-out — look before spending

```bash
node clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/gate3-stats.js
```

Prints: every `drop_reason` with 10 evenly-sampled rows (name · **primary type** · all types ·
reviews · city) for both `excluded_officp.csv` and `excluded_geo.csv`; the final list bucketed by
nation (derived from the UK postcode area in `full_address` — there is no nation column and
`region_from_city` is null, so BT → NIR, the Scottish/Welsh area sets → SCT/WLS, everything else
ENG, with cross-border areas flagged as approximate and IM/GY/JE called out as not-the-UK);
`brand_family` counts; and the top 15 `root_domain`s by `location_count`.

What to act on:
- a `drop_reason` whose samples are obviously real ICP firms → a config rule is wrong (fix the
  config, re-run STEP 2 — never edit the engine);
- `hard_off_icp_type` samples where the ICP tag is a SECONDARY type → the `scope:"any"` list is too
  broad (the Lagos bank-branch bug);
- any nation far below its anchor share (ENG 130 / SCT 25 / WLS 13 / NIR 9 tiles) → a coverage hole,
  not a small market; check `calls_summary.json` and the shard coverage before blaming the rules;
- `Isle of Man` / `Guernsey` / `Jersey` rows → decide explicitly whether the client wants them, they
  are not the UK.

---

## 8. Then, and only then

`leads_domains.csv` → SKILL STEP 6 (owner-finding; `<run>/owner-prompt.md` must exist first — the
hook enforces it), `leads_nowebsite.csv` → STEP 5d recovery, and the write-back at the end of the
run: `IMPROVEMENTS.md` for bugs, `clients/atlas-growth/STATE.md` for client state, and the vertical
profile in `skills/icp-source-planner/library/`.
