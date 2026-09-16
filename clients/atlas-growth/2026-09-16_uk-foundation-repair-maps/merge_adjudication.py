"""Join the adjudication verdicts onto leads_classified.csv -> leads_qualified.csv
   (+ leads_damp_only.csv, + excluded_officp_adjudication.csv with a drop_reason on every row).

Adapted from clients/atlas-growth/2026-09-16_uk-foundation-repair/merge_adjudication.py for the
2026-09-16 UK MAPS run. Differences from the export-run version, all deliberate:

  * NO geography logic. `footprint-gate.js` already ran on this list (excluded_geo.csv,
    footprint_gate_report.json) — re-deriving UK-ness from postcode/phone here would be a second,
    weaker gate disagreeing with the engine's. Removed entirely.
  * The brand flag is read from the `brand_family` COLUMN that collapse-domains.js wrote; the
    export run had to regex it out of the business name because it had no collapse step.
  * The review-floor flag is the UK rule, not the US one: the floor is 5 and it already ran in
    qualify; what survives here is the **unrated track** (P7, 2026-09-16) — `review_count` blank
    means an unreviewed listing that `recover-unrated-uk-config.json` took back, not a ghost. It
    is flagged (`review_floor_flag = unrated_track`), never dropped.
  * Verdicts come from adjudicate/out/batch-NNN.json only (one directory, not two).
  * Tier D is a SAMPLE, so it gets the sample rule below rather than a blanket drop.
  * Sibling-verdict reconciliation and the damp-only carve-out: see below.

SIBLING RECONCILIATION (operator, 2026-09-16) — runs FIRST, before any tier rule
-------------------------------------------------------------------------------
The adjudicators read one branch at a time and score branches of the SAME brand inconsistently:
Rentokil Property Care came back "yes" on 14 branches whose page carries the wall-tie /
structural-repairs menu and "no" on the Belfast branch whose page does not. They are one company
on one website; they cannot have two answers. So rows sharing a `root_domain` are reconciled to
ONE group verdict:

    any sibling "yes"                  -> the whole group is "yes"
    else any sibling "unclear"         -> the whole group is "unclear"
    else                               -> "no"

Grouping is a union of (a) the `root_domain` column and (b) domain_siblings.json's rep/sibling
map, so a row whose root_domain is blank but which collapse-domains.js attached to a rep is still
reconciled. Every row whose verdict CHANGED (or that had none and inherited one) is flagged
`verdict_from_sibling:<own verdict or none>`, and takes the donor's bucket and reason so the
service_bucket stays coherent. The D-sample yes-rate below is measured on OWN verdicts only —
inherited ones would contaminate the measurement it exists to make.

STANDING RULE (carried over from the export run / ICP.md rule 2): **never drop an "unclear" row
whose brand_family is set.** Olshan and Ram Jack were both `unclear` on the US run purely because
their sites blocked the scraper, and they are companies we already know are in-ICP. A blocked
fetch must not cost a known brand. Flagged `brand_unclear_kept`.

Verdict rules (applied to the EFFECTIVE verdict, i.e. post-reconciliation)
-------------------------------------------------------------------------
tier A/B/C  : a verdict is required.
              yes      -> keep
              unclear  -> keep, qa_flags += icp_unclear
              no       -> drop, drop_reason = adjudicated_no:<bucket>
              missing  -> KEEP, qa_flags += missing_verdict  (never silently lose a tier A/B/C row;
                          an unread batch is an operational gap, not a verdict)

DAMP-ONLY CARVE-OUT (operator, locked at GATE 1; applied to every tier)
              A row with offers_foundation_repair == "no" AND bucket == "waterproofing_damp" is a
              pure damp-proofing firm — rising-damp DPC injection and replastering, no structural
              repair. adjudicate/PROMPT.md scores that "no" and is right to, because the PROMPT is
              written around structural repair. But the operator locked damp-proofing firms IN
              scope, tagged by service bucket (ICP-uk.md: they are ~60% of the UK universe and sell
              the same survey-led remedial job to the same homeowner). So those rows are NOT
              discarded: they go to leads_damp_only.csv with qa_flags += damp_only_no_structural,
              as their own segment for the operator to work or skip.

tier D      : the D rows in adjudicate/in were a SEEDED 100-row sample (prep_adjudicate.py), a
              false-negative check on the keyword tiers — not a list to buy. So:
                - measure the sample's yes-rate = yes / (D rows with an OWN verdict);
                - a D row WITH an effective verdict always honours it, at either rate. A measured
                  "yes" is a company we have read and confirmed; throwing it away to keep the rule
                  tidy would discard known-good leads for nothing. Kept rows carry
                  qa_flags += tier_d_sampled_yes so the segment stays visible and separable.
                - the D rows with NO verdict at all are the decision:
                    yes-rate >= 5%  -> dropped as tier_d_unadjudicated, and the script prints a
                                       LOUD recommendation to adjudicate all of D and re-run this
                                       merge (the sample says D is hiding real ICP).
                    yes-rate <  5%  -> dropped as tier_d_unsampled, with the measured rate in the
                                       drop_reason, and no recommendation. D is noise.

Usage:  python3 merge_adjudication.py [--dir <run folder>]
"""
import csv, json, glob, os, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = HERE
if '--dir' in sys.argv:
    BASE = os.path.abspath(sys.argv[sys.argv.index('--dir') + 1])

IN_CSV    = os.path.join(BASE, 'leads_classified.csv')
VERDICTS  = os.path.join(BASE, 'adjudicate', 'out')
SIBLINGS  = os.path.join(BASE, 'domain_siblings.json')
OUT_Q     = os.path.join(BASE, 'leads_qualified.csv')
OUT_DAMP  = os.path.join(BASE, 'leads_damp_only.csv')
OUT_X     = os.path.join(BASE, 'excluded_officp_adjudication.csv')

D_YES_RATE_THRESHOLD = 0.05          # >= 5% of the D sample saying yes means D is worth adjudicating in full
RANK = {'yes': 0, 'unclear': 1, 'no': 2}     # lower wins the group

csv.field_size_limit(10 ** 7)
rows = list(csv.DictReader(open(IN_CSV, encoding='utf-8')))
by_id = {r['place_id']: r for r in rows}

# --- verdicts: adjudicate/out/batch-NNN.json, each a JSON ARRAY of
#     {place_id, offers_foundation_repair, bucket, reason} -------------------------------------
verd = {}
files = sorted(glob.glob(os.path.join(VERDICTS, 'batch-*.json')))
bad_files = []
for f in files:
    try:
        arr = json.load(open(f, encoding='utf-8-sig'))
    except Exception as e:
        bad_files.append(os.path.basename(f) + ' (' + type(e).__name__ + ')')
        continue
    if isinstance(arr, dict):                     # tolerate a keyed object as well as an array
        arr = list(arr.values())
    for o in arr:
        if o.get('place_id'):
            verd[o['place_id']] = o

# --- grouping: union-find over root_domain + domain_siblings.json ----------------------------
parent = {r['place_id']: r['place_id'] for r in rows}


def find(a):
    while parent[a] != a:
        parent[a] = parent[parent[a]]
        a = parent[a]
    return a


def union(a, b):
    if a in parent and b in parent:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra


dom_first = {}
for r in rows:
    d = (r.get('root_domain') or '').strip().lower()
    if not d:
        continue
    if d in dom_first:
        union(dom_first[d], r['place_id'])
    else:
        dom_first[d] = r['place_id']

if os.path.exists(SIBLINGS):
    sib = json.load(open(SIBLINGS, encoding='utf-8'))
    for rep, info in (sib.get('reps') or {}).items():
        for s in (info.get('siblings') or []):
            union(rep, s)
    for s, rep in (sib.get('sibling_of') or {}).items():
        union(rep, s)

groups = collections.defaultdict(list)
for r in rows:
    groups[find(r['place_id'])].append(r)

# --- reconcile each multi-row group to ONE verdict --------------------------------------------
effective = {}            # place_id -> (verdict, bucket, reason, donor_place_id or None)
sibling_changed = 0
for g, members in groups.items():
    owned = [(verd[m['place_id']], m) for m in members if m['place_id'] in verd]
    if len(members) > 1 and owned:
        owned.sort(key=lambda t: RANK.get(t[0].get('offers_foundation_repair', ''), 3))
        win, donor = owned[0]
        gv = win.get('offers_foundation_repair', '')
        for m in members:
            own = verd.get(m['place_id'])
            ov = (own or {}).get('offers_foundation_repair', '')
            if own is not None and ov == gv:
                effective[m['place_id']] = (ov, own.get('bucket', ''), own.get('reason', ''), None)
            else:
                effective[m['place_id']] = (
                    gv, win.get('bucket', ''),
                    '[from sibling %s] %s' % (donor.get('root_domain') or donor['name'], win.get('reason', '')),
                    ov or 'none')
                sibling_changed += 1
    else:
        for m in members:
            own = verd.get(m['place_id'])
            if own is not None:
                effective[m['place_id']] = (own.get('offers_foundation_repair', ''), own.get('bucket', ''),
                                            own.get('reason', ''), None)

# --- tier D sample rate, measured on OWN verdicts only ----------------------------------------
d_rows = [r for r in rows if r['tier'] == 'D']
d_sampled = [r for r in d_rows if r['place_id'] in verd]
d_yes = sum(1 for r in d_sampled if verd[r['place_id']].get('offers_foundation_repair') == 'yes')
d_rate = (d_yes / len(d_sampled)) if d_sampled else 0.0
d_rate_pct = round(100 * d_rate, 1)
D_WORTH_IT = bool(d_sampled) and d_rate >= D_YES_RATE_THRESHOLD

qualified, damp_only, excluded = [], [], []
counts = collections.Counter()

for r in rows:
    r2 = dict(r)
    tier = r['tier']
    flags = []

    verdict, bucket, reason_txt, from_sib = effective.get(r['place_id'], ('', '', '', None))
    r2['adjudication']        = verdict
    r2['service_bucket']      = bucket
    r2['adjudication_reason'] = reason_txt
    if from_sib is not None:
        flags.append('verdict_from_sibling:' + from_sib)

    # brand flag: the column collapse-domains.js already wrote. Roll-ups are KEPT and flagged.
    if r.get('brand_family'):
        flags.append('brand:' + r['brand_family'])
    # review floor: the UK unrated track (P7). Blank review_count is an unreviewed listing, not a ghost.
    r2['review_floor_flag'] = 'unrated_track' if not (r.get('review_count') or '').strip() else ''
    if r2['review_floor_flag']:
        flags.append('unrated_track')

    damp_only_row = (verdict == 'no' and bucket == 'waterproofing_damp')
    brand_unclear = (verdict == 'unclear' and bool(r.get('brand_family')))

    reason = ''
    if tier in ('A', 'B', 'C'):
        if not verdict:
            flags.append('missing_verdict')          # kept: an unread batch is not a verdict
            counts['KEPT_missing_verdict'] += 1
        elif verdict == 'yes':
            pass
        elif verdict == 'unclear':
            flags.append('icp_unclear')
        elif damp_only_row:
            pass                                      # handled below, goes to leads_damp_only.csv
        else:
            reason = 'adjudicated_no:' + (bucket or 'unknown')
    elif tier == 'D':
        if verdict == 'yes':
            flags.append('tier_d_sampled_yes')
        elif verdict == 'unclear':
            flags.append('icp_unclear'); flags.append('tier_d_sampled_unclear')
        elif damp_only_row:
            flags.append('tier_d_sampled_damp')
        elif verdict == 'no':
            reason = 'adjudicated_no:' + (bucket or 'unknown')
        else:
            reason = ('tier_d_unadjudicated:sample_yes_rate=%.1f%%' % d_rate_pct) if D_WORTH_IT \
                     else ('tier_d_unsampled:sample_yes_rate=%.1f%%' % d_rate_pct)
    else:
        reason = 'unknown_tier:' + tier

    # STANDING RULE: an `unclear` row with a brand_family is never dropped, whatever the tier said.
    if reason and brand_unclear:
        flags.append('brand_unclear_kept:' + reason.split(':')[0])
        counts['KEPT_brand_unclear'] += 1
        reason = ''

    if damp_only_row and not reason:
        flags.append('damp_only_no_structural')
        r2['qa_flags'] = '; '.join(flags)
        damp_only.append(r2)
        counts['DAMP_ONLY'] += 1
        continue

    r2['qa_flags'] = '; '.join(flags)
    if reason:
        r2['drop_reason'] = reason
        excluded.append(r2)
        counts['DROP_' + reason.split(':')[0]] += 1
    else:
        qualified.append(r2)
        counts['QUALIFIED_' + (verdict or 'no_verdict')] += 1

# --- write -----------------------------------------------------------------------------------
cols = list(rows[0].keys()) + ['service_bucket', 'adjudication', 'adjudication_reason',
                               'review_floor_flag', 'qa_flags']


def write(path, recs, extra=()):
    fields = cols + list(extra)
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
        w.writeheader()
        for r in recs:
            w.writerow({k: r.get(k, '') for k in fields})


write(OUT_Q, qualified)
write(OUT_DAMP, damp_only)
write(OUT_X, excluded, extra=('drop_reason',))

# --- funnel ----------------------------------------------------------------------------------
multi = sum(1 for g in groups.values() if len(g) > 1)
print('=' * 78)
print('MERGE ADJUDICATION — funnel')
print('=' * 78)
print('input leads_classified.csv rows : %d' % len(rows))
print('verdict files read              : %d  (%d verdicts)%s'
      % (len(files), len(verd), ('  UNREADABLE: ' + ', '.join(bad_files)) if bad_files else ''))
print('tiers in                        : %s' % dict(sorted(collections.Counter(r['tier'] for r in rows).items())))
print('sibling groups (>1 row)         : %d  | rows taking a sibling verdict: %d' % (multi, sibling_changed))
print('-' * 78)
print('QUALIFIED (leads_qualified.csv) : %d' % len(qualified))
print('DAMP-ONLY (leads_damp_only.csv) : %d   <- offers_foundation_repair=no + bucket=waterproofing_damp,'
      % len(damp_only))
print('                                       kept as its own segment per the GATE 1 operator lock')
print('EXCLUDED (excluded_officp_adjudication.csv): %d' % len(excluded))
print('-' * 78)
for k, n in sorted(counts.items()):
    print('  %-46s %d' % (k, n))
print('-' * 78)
print('tier D sample: %d of %d D rows carried an OWN verdict | yes=%d | yes-rate=%.1f%%'
      % (len(d_sampled), len(d_rows), d_yes, d_rate_pct))
unadj = sum(1 for r in d_rows if r['place_id'] not in effective)
if D_WORTH_IT and unadj:
    print('')
    print('*' * 78)
    print('** RECOMMENDATION: ADJUDICATE ALL OF TIER D.')
    print('** The %d-row D sample came back %.1f%% yes (threshold %.0f%%). The keyword tiers are'
          % (len(d_sampled), d_rate_pct, 100 * D_YES_RATE_THRESHOLD))
    print('** hiding real ICP in D: roughly %d of the %d unadjudicated D rows are likely in-scope.'
          % (round(d_rate * unadj), unadj))
    print('** Run:  python3 prep_adjudicate.py D    then the adjudicator, then re-run this merge.')
    print('** Until then those %d rows sit in excluded_officp_adjudication.csv as' % unadj)
    print('** tier_d_unadjudicated — dropped for lack of a read, NOT because they were judged out.')
    print('*' * 78)
elif D_WORTH_IT:
    print('tier D yes-rate is above the %.0f%% threshold, but every D row already carries a verdict —'
          % (100 * D_YES_RATE_THRESHOLD))
    print('nothing left to adjudicate; each D row was placed on its own verdict.')
else:
    print('tier D dropped as tier_d_unsampled (%.1f%% < %.0f%% threshold) — D is noise, no further read needed.'
          % (d_rate_pct, 100 * D_YES_RATE_THRESHOLD))
print('-' * 78)
print('service buckets (qualified)     : %s' % collections.Counter(r['service_bucket'] for r in qualified).most_common())
print('brand-flagged (qualified)       : %d' % sum(1 for r in qualified if r.get('brand_family')))
print('unrated track (qualified)       : %d' % sum(1 for r in qualified if r['review_floor_flag'] == 'unrated_track'))
print('icp_unclear (qualified)         : %d' % sum(1 for r in qualified if 'icp_unclear' in r['qa_flags']))
print('missing_verdict (qualified)     : %d' % sum(1 for r in qualified if 'missing_verdict' in r['qa_flags']))
print('=' * 78)
