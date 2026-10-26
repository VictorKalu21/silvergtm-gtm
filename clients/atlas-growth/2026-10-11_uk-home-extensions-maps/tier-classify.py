#!/usr/bin/env python3
"""Keyword TIERING as a pre-filter for STEP 5e (never the verdict — the Haiku reader with classify-prompt.md is).
Validated pattern from the 2026-09-16 UK foundation run (tiers A-D, tier-D 100-row false-negative test returned 0 ICP of 100).
The rubric makes `extension_builder` REQUIRE a quotable build phrase, so a representative whose fetched text carries no
extension / loft / conversion / design-and-build vocabulary cannot reach Qualified; it is read in full only if the tier-D
sample proves the tier is hiding real builders.

Tiers (on the representative's own site text, services page + home page as prep-classify.js slices it):
  A  extension / loft / garage-or-basement conversion / design-and-build phrase present        -> read in full
  B  generic build vocabulary with renovation / refurbishment / 'conversions' only             -> read in full
  D  text fetched OK but none of the vocabulary                                                -> 100-row FN sample first
  F  no usable text (fetch failed / < 200 chars)                                               -> unclear (Review); Firecrawl residue is a key + go
Writes <run>/classify/tiers.csv (place_id, tier, hits) and leads_tier_{AB,D,F}.csv for prep-classify.js.
Usage: python3 tier-classify.py <run dir>"""
import csv, json, re, sys, os, random, collections
R = sys.argv[1]
A = re.compile(r"\b(extensions?|loft conversions?|loft rooms?|dormer|hip[- ]to[- ]gable|mansard|side[- ]return|wrap[- ]around|double[- ]store?y|single[- ]store?y|two[- ]store?y|garage conversions?|basement conversions?|cellar conversions?|design (and|&) build|design[- ]build|orangery|orangeries|rear extension|kitchen extension|house extension|home extension|extend(ing)? your home|extended)\b", re.I)
B = re.compile(r"\b(conversions?|renovations?|refurbishments?|remodel(l)?ing|building work|building services|new build|structural (work|alterations)|knock[- ]through|open[- ]plan)\b", re.I)
site = {}
for ln in open(f'{R}/owner/site_text.jsonl', encoding='utf-8'):
    try: o = json.loads(ln)
    except: continue
    txt = ''
    for p in (o.get('pages') or []):
        txt += ' ' + (p.get('text') or '')
    if not txt.strip(): txt = o.get('text') or ''
    site[o.get('place_id')] = (o.get('status'), re.sub(r'\s+', ' ', txt))
rows = list(csv.DictReader(open(f'{R}/leads_domains.csv', encoding='utf-8')))
H = list(rows[0].keys())
tiers = {}; byT = collections.defaultdict(list); hitc = collections.Counter()
for r in rows:
    st, txt = site.get(r['place_id'], (None, ''))
    if st != 'ok' or len(txt) < 200: t, hits = 'F', ''
    else:
        a = A.findall(txt)
        if a: t = 'A'; hits = '|'.join(sorted({(m[0] if isinstance(m, tuple) else m).lower() for m in a})[:6])
        elif B.search(txt): t = 'B'; hits = B.search(txt).group(0).lower()
        else: t, hits = 'D', ''
    tiers[r['place_id']] = (t, hits); byT[t].append(r)
    for h in hits.split('|'): 
        if h: hitc[h] += 1
os.makedirs(f'{R}/classify', exist_ok=True)
with open(f'{R}/classify/tiers.csv', 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['place_id', 'tier', 'hits']); [w.writerow([k, *v]) for k, v in tiers.items()]
def wcsv(name, rs):
    with open(f'{R}/{name}', 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=H); w.writeheader(); [w.writerow(r) for r in rs]
wcsv('leads_tier_AB.csv', byT['A'] + byT['B']); wcsv('leads_tier_D.csv', byT['D']); wcsv('leads_tier_F.csv', byT['F'])
random.seed(11); wcsv('leads_tier_D_sample100.csv', random.sample(byT['D'], min(100, len(byT['D']))))
print('tiers:', {t: len(byT[t]) for t in 'ABDF'}, '| top A hits:', hitc.most_common(8))
