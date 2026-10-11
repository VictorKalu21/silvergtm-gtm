#!/usr/bin/env python3
"""Job-side recovery for the OPEN footprint-gate.js issue (IMPROVEMENTS 2026-09-20): a service-area listing with
NO address carries a country/continent centroid as its coordinates, so the hub-distance gate drops it as far_from_hubs.
Takes back the blank-address rows from excluded_geo.csv whose phone is UK-shaped (0…, +44…, 44…) and appends them to
leads_clean_qualified_infootprint.csv with lat/lng blanked (the centroid is not a location). Rows with a foreign or
missing phone stay dropped — they are the US bleed. Idempotent on place_id. Same pattern as the generators run's
16 blank-address recoveries (STATE.md 2026-09-30). Usage: python3 recover-blank-address.py <run dir>"""
import csv, re, sys
R = sys.argv[1]
IN = f'{R}/leads_clean_qualified_infootprint.csv'; EX = f'{R}/excluded_geo.csv'
kept = list(csv.DictReader(open(IN))); H = list(kept[0].keys())
have = {r['place_id'] for r in kept}
ex = list(csv.DictReader(open(EX)))
uk = lambda p: bool(re.match(r'^(0|\+44|44)', re.sub(r'[\s()\-]', '', p or '')))
rec = [r for r in ex if not r['full_address'].strip() and uk(r['phone_number']) and r['place_id'] not in have]
for r in rec:
    r['latitude'] = ''; r['longitude'] = ''
with open(IN, 'a', newline='') as f:
    w = csv.DictWriter(f, fieldnames=H, extrasaction='ignore'); [w.writerow(r) for r in rec]
print(f'blank-address geo drops {sum(1 for r in ex if not r["full_address"].strip())} | recovered (UK phone) {len(rec)} | in-footprint now {len(kept)+len(rec)}')
