#!/usr/bin/env python3
"""make-tranche-07m.py — tranche 07m (operator 2026-10-18): every still-unverified rank-1 row in the queue whose
mail host is Microsoft (MX from resolve-mx.py's cache), for the Microsoft-only Plusvibe campaign that booked the
first meeting off 06m. Order: personal address > named owner on a company mailbox > unnamed; then OEM top tier.
Stage 1 for this tranche is DeBounce (operator choice), not MillionVerifier."""
import csv, json, re
L = {r['place_id']: r for r in csv.DictReader(open('leads_icp.csv'))}
fin = {r['place_id'] for r in csv.DictReader(open('owner/emails_final.csv'))}
mx = json.load(open('owner/verify/mx_cache.json'))
TOP = re.compile(r'elite|power ?pro|premier|platinum|titanium|gold|installer', re.I)
q = [r for r in csv.DictReader(open('owner/verify/queue.csv')) if r['place_id'] not in fin]
for r in q: r['mx_bucket'] = mx.get(r['email'].split('@')[-1].strip().lower(), {}).get('bucket', 'unknown')
t = [r for r in q if r['mx_bucket'] == 'microsoft']
t.sort(key=lambda r: (0 if r['email_kind'] == 'personal' else 1 if r['named'] == 'true' else 2, 0 if TOP.search(r['brand_tiers']) else 1))
for r in t: r['source_tranche'] = r['tranche']; r['tranche'] = '07m'
H = ['Email'] + [h for h in t[0].keys() if h != 'email']
w = csv.DictWriter(open('owner/verify/tranche_07m.csv', 'w'), fieldnames=H, extrasaction='ignore'); w.writeheader()
for r in t: w.writerow({**r, 'Email': r['email']})
from collections import Counter
print(json.dumps({'rows': len(t), 'unique_emails': len({r['email'].lower() for r in t}),
  'personal': sum(r['email_kind'] == 'personal' for r in t), 'named': sum(r['named'] == 'true' for r in t),
  'lead_source': dict(Counter(L[r['place_id']]['lead_source'] for r in t)), 'from_tranche': dict(Counter(r['source_tranche'] for r in t))}))
