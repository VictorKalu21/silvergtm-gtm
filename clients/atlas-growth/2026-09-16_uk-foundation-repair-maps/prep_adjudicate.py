"""Build adjudication batches: services-preferred text slice (~2.5k chars) + evidence, 25 leads per batch.

Adapted from clients/atlas-growth/2026-09-16_uk-foundation-repair/prep_adjudicate.py for the
2026-09-16 UK MAPS run. Differences, all deliberate:
  * tiers A, B and C go in FULL, plus a SEEDED 100-row random sample of tier D (the D sample is a
    false-negative check on the keyword tiers, not a list to buy);
  * batches land in adjudicate/in/batch-NNN.jsonl (the orchestrator fans out over that directory);
  * batches are homogeneous by tier, numbered in tier order, so a per-tier count is readable;
  * site text is joined through `rep_place_id`, because collapse-domains.js paid for one fetch per
    root domain and a branch row reads its representative's pages.

Usage:  python3 prep_adjudicate.py            # A,B,C full + 100 of D (seed 20260916)
        python3 prep_adjudicate.py A,B        # override the full tiers
"""
import csv, json, re, os, sys, random

HERE = os.path.dirname(os.path.abspath(__file__))
IN_CSV = os.path.join(HERE, 'leads_classified.csv')
SITE_JSONL = os.path.join(HERE, 'owner', 'site_text.jsonl')
OUT_DIR = os.path.join(HERE, 'adjudicate', 'in')
FULL_TIERS = (sys.argv[1].split(',') if len(sys.argv) > 1 else ['A', 'B', 'C'])
SAMPLE_TIER, SAMPLE_N, SEED = 'D', 100, 20260916
B = 25

csv.field_size_limit(10 ** 7)
rows = list(csv.DictReader(open(IN_CSV, encoding='utf-8')))
site = {}
for ln in open(SITE_JSONL, encoding='utf-8'):
    ln = ln.strip()
    if ln:
        o = json.loads(ln); site[o['place_id']] = o


def slice_for(rec, cap=2500):
    if not rec:
        return ''
    pages = rec.get('pages') or []
    svc = [p for p in pages if re.search(r"serv|underpin|subsid|structur|foundation|basement|waterproof|tanking|damp|piling|groundwork|what-we-do", (p.get('label', '') + ' ' + p.get('url', '')), re.I)]
    home = [p for p in pages if p.get('label') == 'home']
    txt = '\n'.join(p['text'] for p in (svc[:2] + home))
    if not txt:
        txt = rec.get('text', '')
    return re.sub(r"\s+", " ", txt).strip()[:cap]


os.makedirs(OUT_DIR, exist_ok=True)
for f in os.listdir(OUT_DIR):
    if f.startswith('batch-') and f.endswith('.jsonl'):
        os.remove(os.path.join(OUT_DIR, f))

selected = []            # (tier, row) in tier order, so batch numbers run A -> B -> C -> D
for t in FULL_TIERS:
    selected += [(t, r) for r in rows if r['tier'] == t]
pool = [r for r in rows if r['tier'] == SAMPLE_TIER]
rng = random.Random(SEED)
sample = rng.sample(pool, min(SAMPLE_N, len(pool)))
sample.sort(key=lambda r: r['place_id'])          # stable on disk; the draw is what the seed fixes
selected += [(SAMPLE_TIER, r) for r in sample]

n = 0
per_tier_batches, per_tier_rows = {}, {}
i = 0
while i < len(selected):
    chunk = [selected[i]]
    t0 = selected[i][0]
    i += 1
    while i < len(selected) and selected[i][0] == t0 and len(chunk) < B:
        chunk.append(selected[i]); i += 1
    recs = [{'place_id': r['place_id'], 'name': r['name'], 'google_types': r['google_types'],
             'city': r['city'], 'tier': r['tier'], 'matched_terms': r['matched_terms'],
             'evidence': r['evidence'],
             'text': slice_for(site.get(r.get('rep_place_id') or r['place_id']))} for _, r in chunk]
    with open(os.path.join(OUT_DIR, 'batch-%03d.jsonl' % n), 'w', encoding='utf-8') as f:
        for o in recs:
            f.write(json.dumps(o, ensure_ascii=False) + '\n')
    per_tier_batches[t0] = per_tier_batches.get(t0, 0) + 1
    per_tier_rows[t0] = per_tier_rows.get(t0, 0) + len(chunk)
    n += 1

print('tiers in full: %s | tier %s sampled: %d of %d (seed %d)' % (','.join(FULL_TIERS), SAMPLE_TIER, len(sample), len(pool), SEED))
for t in FULL_TIERS + [SAMPLE_TIER]:
    print('  tier %s: %d leads -> %d batches' % (t, per_tier_rows.get(t, 0), per_tier_batches.get(t, 0)))
print('%d leads -> %d batches in %s' % (len(selected), n, os.path.relpath(OUT_DIR, HERE)))
