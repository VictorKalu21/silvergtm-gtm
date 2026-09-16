"""Build the Companies House input for the 2026-09-16 UK foundation-repair MAPS run.

ch_input.csv = union of leads_qualified.csv (ICP) and leads_damp_only.csv (damp-only segment),
one row per place_id, carrying a `segment` column plus exactly the columns companies-house.js
reads (place_id, name, full_address, city) and the identity/domain columns kept for the
downstream join (zip, website, root_domain).

A place_id present in both files is kept once with segment=qualified (the ICP segment wins).
Also counts how many rows carry a UK postcode in `full_address`, because the engine's matcher
disambiguates on the LAST postcode in that field and falls back to `city` when it is absent.

Usage: python3 build_ch_input.py
"""
import csv, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
COLS = ['place_id', 'name', 'full_address', 'city', 'zip', 'website', 'root_domain', 'segment']
# same shape as companies-house.js lastPostcode(): outward + inward, space-insensitive
PC = re.compile(r'([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})', re.I)

SOURCES = [('qualified', 'leads_qualified.csv'), ('damp_only', 'leads_damp_only.csv')]

out_rows, seen, dupes = [], {}, []
counts = {}
for segment, fname in SOURCES:
    rows = list(csv.DictReader(open(os.path.join(HERE, fname), encoding='utf-8')))
    counts[segment] = len(rows)
    for r in rows:
        pid = (r.get('place_id') or '').strip()
        if not pid:
            continue
        if pid in seen:
            dupes.append((pid, r.get('name'), seen[pid], segment))
            continue
        seen[pid] = segment
        out_rows.append({c: (r.get(c) or '').strip() for c in COLS if c != 'segment'} | {'segment': segment})

with open(os.path.join(HERE, 'ch_input.csv'), 'w', encoding='utf-8', newline='') as fh:
    w = csv.DictWriter(fh, fieldnames=COLS)
    w.writeheader()
    w.writerows(out_rows)

with_pc = sum(1 for r in out_rows if PC.search(r['full_address']))
with_zip = sum(1 for r in out_rows if r['zip'])
no_pc_no_city = sum(1 for r in out_rows if not PC.search(r['full_address']) and len(r['city']) < 3)
print('qualified rows: %d | damp_only rows: %d | overlapping place_ids dropped: %d'
      % (counts['qualified'], counts['damp_only'], len(dupes)))
print('ch_input.csv rows: %d (qualified %d / damp_only %d)'
      % (len(out_rows), sum(1 for r in out_rows if r['segment'] == 'qualified'),
         sum(1 for r in out_rows if r['segment'] == 'damp_only')))
print('postcode in full_address: %d (%.1f%%) | missing: %d (%.1f%%)'
      % (with_pc, 100.0 * with_pc / len(out_rows), len(out_rows) - with_pc,
         100.0 * (len(out_rows) - with_pc) / len(out_rows)))
print('non-empty zip column: %d | neither postcode nor usable city: %d' % (with_zip, no_pc_no_city))
for d in dupes:
    print('  dup place_id %s (%s) already in %s, skipped from %s' % d)
