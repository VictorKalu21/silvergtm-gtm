"""Join the adjudication verdicts onto leads_classified.csv -> leads_qualified.csv
   (+ leads_house_raising_only.csv, + excluded_officp_adjudication.csv with a drop_reason on every row).  RUN-FOLDER ONE-OFF.

Ported from clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/merge_adjudication.py for the
2026-09-20 AU MAPS run. Same machinery (sibling reconciliation over root_domain + domain_siblings.json,
the brand-unclear standing rule, the tier-D sample rule). Two Australian differences:

  * THE CARVE-OUT is house raising, not damp. The UK kept pure damp-proofers as their own segment
    (leads_damp_only.csv). Here the adjacent trade is HOUSE RAISING (QLD / northern NSW): a firm the
    adjudicator scores "no" with bucket "house_raising" lifts houses but does not offer restumping /
    underpinning / relevelling as a service. GATE 1 tagged house raising adjacent, so those rows go to
    leads_house_raising_only.csv with qa_flags += house_raising_only, for the operator to work or skip.
  * TWO review tracks are flagged, never dropped: `unrated_track` (blank review_count, taken back by
    recover-unrated-au-config.json) and `lowrated_track` (1-4 reviews with a website and an ICP name,
    taken back by recover-lowrated-au-config.json — GATE 1 option (a), approved 2026-09-20).

Verdict rules (applied to the EFFECTIVE verdict, i.e. post-reconciliation)
  tier A/B/C  : yes -> keep · unclear -> keep + icp_unclear · no -> drop adjudicated_no:<bucket> ·
                missing -> KEEP + missing_verdict (an unread batch is not a verdict)
  carve-out   : no + bucket house_raising -> leads_house_raising_only.csv (every tier)
  tier D      : the seeded 100-row sample; own verdicts honoured; unadjudicated D rows dropped as
                tier_d_unadjudicated (with a LOUD recommendation) when the sample yes-rate >= 5%, else tier_d_unsampled.
  standing    : an `unclear` row with a brand_family is never dropped (brand_unclear_kept).

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
OUT_ADJ   = os.path.join(BASE, 'leads_house_raising_only.csv')
OUT_X     = os.path.join(BASE, 'excluded_officp_adjudication.csv')

CARVE_BUCKET = 'house_raising'
D_YES_RATE_THRESHOLD = 0.05
RANK = {'yes': 0, 'unclear': 1, 'no': 2}

csv.field_size_limit(10 ** 7)
rows = list(csv.DictReader(open(IN_CSV, encoding='utf-8')))

verd = {}
files = sorted(glob.glob(os.path.join(VERDICTS, 'batch-*.json')))
bad_files = []
for f in files:
    try:
        arr = json.load(open(f, encoding='utf-8-sig'))
    except Exception as e:
        bad_files.append(os.path.basename(f) + ' (' + type(e).__name__ + ')')
        continue
    if isinstance(arr, dict):
        arr = list(arr.values())
    for o in arr:
        if o.get('place_id'):
            verd[o['place_id']] = o

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

effective = {}
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
                effective[m['place_id']] = (gv, win.get('bucket', ''), '[from sibling %s] %s' % (donor.get('root_domain') or donor['name'], win.get('reason', '')), ov or 'none')
                sibling_changed += 1
    else:
        for m in members:
            own = verd.get(m['place_id'])
            if own is not None:
                effective[m['place_id']] = (own.get('offers_foundation_repair', ''), own.get('bucket', ''), own.get('reason', ''), None)

d_rows = [r for r in rows if r['tier'] == 'D']
d_sampled = [r for r in d_rows if r['place_id'] in verd]
d_yes = sum(1 for r in d_sampled if verd[r['place_id']].get('offers_foundation_repair') == 'yes')
d_rate = (d_yes / len(d_sampled)) if d_sampled else 0.0
d_rate_pct = round(100 * d_rate, 1)
D_WORTH_IT = bool(d_sampled) and d_rate >= D_YES_RATE_THRESHOLD

def review_track(r):
    rc = (r.get('review_count') or '').strip()
    if not rc:
        return 'unrated_track'
    try:
        n = float(rc)
    except ValueError:
        return ''
    return 'lowrated_track' if 1 <= n <= 4 else ''

qualified, carve, excluded = [], [], []
counts = collections.Counter()
for r in rows:
    r2 = dict(r)
    tier = r['tier']
    flags = []
    verdict, bucket, reason_txt, from_sib = effective.get(r['place_id'], ('', '', '', None))
    r2['adjudication'] = verdict
    r2['service_bucket'] = bucket
    r2['adjudication_reason'] = reason_txt
    if from_sib is not None:
        flags.append('verdict_from_sibling:' + from_sib)
    if r.get('brand_family'):
        flags.append('brand:' + r['brand_family'])
    r2['review_floor_flag'] = review_track(r)
    if r2['review_floor_flag']:
        flags.append(r2['review_floor_flag'])

    carve_row = (verdict == 'no' and bucket == CARVE_BUCKET)
    brand_unclear = (verdict == 'unclear' and bool(r.get('brand_family')))

    reason = ''
    if tier in ('A', 'B', 'C'):
        if not verdict:
            flags.append('missing_verdict'); counts['KEPT_missing_verdict'] += 1
        elif verdict == 'yes':
            pass
        elif verdict == 'unclear':
            flags.append('icp_unclear')
        elif carve_row:
            pass
        else:
            reason = 'adjudicated_no:' + (bucket or 'unknown')
    elif tier == 'D':
        if verdict == 'yes':
            flags.append('tier_d_sampled_yes')
        elif verdict == 'unclear':
            flags.append('icp_unclear'); flags.append('tier_d_sampled_unclear')
        elif carve_row:
            flags.append('tier_d_sampled_carve')
        elif verdict == 'no':
            reason = 'adjudicated_no:' + (bucket or 'unknown')
        else:
            reason = ('tier_d_unadjudicated:sample_yes_rate=%.1f%%' % d_rate_pct) if D_WORTH_IT else ('tier_d_unsampled:sample_yes_rate=%.1f%%' % d_rate_pct)
    else:
        reason = 'unknown_tier:' + tier

    if reason and brand_unclear:
        flags.append('brand_unclear_kept:' + reason.split(':')[0]); counts['KEPT_brand_unclear'] += 1
        reason = ''

    if carve_row and not reason:
        flags.append('house_raising_only')
        r2['qa_flags'] = '; '.join(flags)
        carve.append(r2); counts['HOUSE_RAISING_ONLY'] += 1
        continue

    r2['qa_flags'] = '; '.join(flags)
    if reason:
        r2['drop_reason'] = reason
        excluded.append(r2); counts['DROP_' + reason.split(':')[0]] += 1
    else:
        qualified.append(r2); counts['QUALIFIED_' + (verdict or 'no_verdict')] += 1

cols = list(rows[0].keys()) + ['service_bucket', 'adjudication', 'adjudication_reason', 'review_floor_flag', 'qa_flags']
def write(path, recs, extra=()):
    fields = cols + list(extra)
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
        w.writeheader()
        for r in recs:
            w.writerow({k: r.get(k, '') for k in fields})
write(OUT_Q, qualified)
write(OUT_ADJ, carve)
write(OUT_X, excluded, extra=('drop_reason',))

multi = sum(1 for g in groups.values() if len(g) > 1)
print('=' * 78)
print('MERGE ADJUDICATION — funnel (AU)')
print('=' * 78)
print('input leads_classified.csv rows : %d' % len(rows))
print('verdict files read              : %d  (%d verdicts)%s' % (len(files), len(verd), ('  UNREADABLE: ' + ', '.join(bad_files)) if bad_files else ''))
print('tiers in                        : %s' % dict(sorted(collections.Counter(r['tier'] for r in rows).items())))
print('sibling groups (>1 row)         : %d  | rows taking a sibling verdict: %d' % (multi, sibling_changed))
print('-' * 78)
print('QUALIFIED (leads_qualified.csv) : %d' % len(qualified))
print('HOUSE-RAISING-ONLY (leads_house_raising_only.csv): %d   <- no + bucket=house_raising, the adjacent segment' % len(carve))
print('EXCLUDED (excluded_officp_adjudication.csv): %d' % len(excluded))
print('-' * 78)
for k, n in sorted(counts.items()):
    print('  %-46s %d' % (k, n))
print('-' * 78)
print('tier D sample: %d of %d D rows carried an OWN verdict | yes=%d | yes-rate=%.1f%%' % (len(d_sampled), len(d_rows), d_yes, d_rate_pct))
unadj = sum(1 for r in d_rows if r['place_id'] not in effective)
if D_WORTH_IT and unadj:
    print('*' * 78)
    print('** RECOMMENDATION: ADJUDICATE ALL OF TIER D — sample yes-rate %.1f%% >= %.0f%%; ~%d of the %d unadjudicated D rows are likely in-scope.' % (d_rate_pct, 100 * D_YES_RATE_THRESHOLD, round(d_rate * unadj), unadj))
    print('** Run:  python3 prep_adjudicate.py D    then the adjudicator, then re-run this merge.')
    print('*' * 78)
elif not D_WORTH_IT:
    print('tier D dropped as tier_d_unsampled (%.1f%% < %.0f%% threshold) — D is noise, no further read needed.' % (d_rate_pct, 100 * D_YES_RATE_THRESHOLD))
print('-' * 78)
print('service buckets (qualified)     : %s' % collections.Counter(r['service_bucket'] for r in qualified).most_common())
print('brand-flagged (qualified)       : %d' % sum(1 for r in qualified if r.get('brand_family')))
print('unrated track (qualified)       : %d | lowrated track: %d' % (sum(1 for r in qualified if r['review_floor_flag'] == 'unrated_track'), sum(1 for r in qualified if r['review_floor_flag'] == 'lowrated_track')))
print('icp_unclear (qualified)         : %d' % sum(1 for r in qualified if 'icp_unclear' in r['qa_flags']))
print('missing_verdict (qualified)     : %d' % sum(1 for r in qualified if 'missing_verdict' in r['qa_flags']))
print('=' * 78)
