#!/usr/bin/env python3
"""blank_centroid.py :: STEP 4 pre-step for the AU run.  RUN-FOLDER ONE-OFF (GATE1 §7.7; IMPROVEMENTS 2026-09-20).

Google places an address-less service-area listing at the geographic centre of its country. For
Australia that is (-32.2054, 136.1074) — measured on the 2026-09-20 probe, where four real Victorian
reblockers carried exactly that pair. footprint-gate.js keeps rows with MISSING coordinates but has
no notion of a placeholder coordinate, so they died as far_from_hubs (~700 km from every tile).

This blanks latitude/longitude on rows that (a) sit within 0.01 deg of the centroid AND (b) have an
empty full_address, so the gate falls through to the region check instead. Nothing else changes.

Usage: python3 blank_centroid.py --in leads_clean_qualified.csv --out leads_clean_qualified.centroid.csv
"""
import csv, sys, argparse
CENTROID = (-32.2054, 136.1074)
ap = argparse.ArgumentParser(); ap.add_argument('--in', dest='inp', required=True); ap.add_argument('--out', required=True); ap.add_argument('--tol', type=float, default=0.01)
a = ap.parse_args()
csv.field_size_limit(10 ** 7)
rows = list(csv.DictReader(open(a.inp, encoding='utf-8')))
n = 0
for r in rows:
    try: lat, lng = float(r.get('latitude') or 'x'), float(r.get('longitude') or 'x')
    except ValueError: continue
    if abs(lat - CENTROID[0]) <= a.tol and abs(lng - CENTROID[1]) <= a.tol and not (r.get('full_address') or '').strip():
        r['latitude'] = ''; r['longitude'] = ''; n += 1
with open(a.out, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else []); w.writeheader(); w.writerows(rows)
print(f'blank_centroid: {n} of {len(rows)} rows sat on the Australian centroid with no address -> coordinates blanked -> {a.out}')
