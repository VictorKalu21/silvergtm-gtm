#!/usr/bin/env python3
"""make-tranche-06m.py — tranche 06m (operator 2026-10-13): 'both' (Maps + dealer-list) leads from tranches 02-03,
not yet in emails_final, NON-Google mail host only (campaign review 2026-10-12: Google-hosted US inboxes 0 replies,
Microsoft 365 3.7%). MX from resolve-mx.py's cache. Google rows parked in parked_google_both.csv; no-MX domains
(cannot receive mail) parked in parked_nomx_both.csv. Order: personal address > named owner on a company mailbox >
unnamed, then microsoft before other. Hard cap 600 rows (the operator's MillionVerifier budget)."""
import csv, json
CAP = 600
L = {r['place_id']: r for r in csv.DictReader(open('leads_icp.csv'))}
fin = {r['place_id'] for r in csv.DictReader(open('owner/emails_final.csv'))}
mx = json.load(open('owner/verify/mx_cache.json'))
q = [r for r in csv.DictReader(open('owner/verify/queue.csv'))
     if r['tranche'] in ('2', '3') and L[r['place_id']]['lead_source'] == 'both' and r['place_id'] not in fin]
for r in q: r['mx_bucket'] = mx[r['email'].split('@')[-1].strip().lower()]['bucket']
H = list(q[0].keys())
def write(path, rows, email_first=False):
    cols = (['Email'] + [h for h in H if h != 'email']) if email_first else H
    w = csv.DictWriter(open(path, 'w'), fieldnames=cols, extrasaction='ignore'); w.writeheader()
    for r in rows: w.writerow({**r, 'Email': r['email']} if email_first else r)
write('owner/verify/parked_google_both.csv', [r for r in q if r['mx_bucket'] == 'google'])
write('owner/verify/parked_nomx_both.csv', [r for r in q if r['mx_bucket'] in ('none', 'error')])
keep = [r for r in q if r['mx_bucket'] in ('microsoft', 'other')]
keep.sort(key=lambda r: (0 if r['email_kind'] == 'personal' else 1 if r['named'] == 'true' else 2, 0 if r['mx_bucket'] == 'microsoft' else 1))
t = keep[:CAP]
for r in t: r['tranche'] = '06m'
write('owner/verify/tranche_06m.csv', t, email_first=True)
from collections import Counter
print(json.dumps({'pool': len(q), 'non_google_with_mx': len(keep), 'tranche_06m': len(t), 'unique_emails': len({r['email'] for r in t}),
                  'by_bucket': dict(Counter(r['mx_bucket'] for r in t)), 'named': sum(r['named'] == 'true' for r in t),
                  'left_out': dict(Counter(r['mx_bucket'] + '|named=' + r['named'] for r in keep[CAP:]))}))
