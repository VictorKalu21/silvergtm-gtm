"""Join the verifier's verdict back onto the Plusvibe `base` input.

Ported verbatim from clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/apply_verify.py for the 2026-09-20 AU MAPS run (paths only).

`assemble_deliverable_au.py` writes `deliverable/emails_final_unverified.csv` in the shape
`build-plusvibe.js base` expects (place_id,email,verdict,email_kind,found_by,contact_name) with
`verdict` BLANK, because `base` keeps only `verdict === 'sendable'` and nothing is sendable until
`email-verify-debounce-bounceban` has run. That run spends credits and needs an explicit operator go.

After it has run, its `<stem>_full.csv` carries every input column plus `verify_verdict`
(sendable | risky | dropped) and `verify_detail`. This joins that column back, on the lowercased
address, and writes `deliverable/emails_final.csv` — the file to hand to:

    node skills/google-maps-scrape/build-plusvibe.js base \
      --leads <run>/deliverable/atlas_au_foundation_repair_maps_qualified.csv \
      --emails <run>/deliverable/emails_final.csv \
      --contacts <run>/owner/contacts_final.jsonl \
      --out <run>/owner/plusvibe_base.csv

An address the verifier never saw keeps a blank verdict and is counted as `unverified`; `base` will
skip it, which is the safe default.

Usage:  python3 apply_verify.py <stem>_full.csv
        python3 apply_verify.py <stem>_full.csv --in deliverable/emails_final_unverified.csv \
                                                --out deliverable/emails_final.csv
"""
import csv, os, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
csv.field_size_limit(10 ** 7)


def arg(name, default):
    a = sys.argv
    return a[a.index('--' + name) + 1] if '--' + name in a else default


pos = [a for a in sys.argv[1:] if not a.startswith('--')
       and sys.argv[sys.argv.index(a) - 1] not in ('--in', '--out')]
FULL = pos[0] if pos else None
IN = arg('in', 'deliverable/emails_final_unverified.csv')
OUT = arg('out', 'deliverable/emails_final.csv')
if not FULL or not os.path.exists(FULL):
    sys.exit('usage: python3 apply_verify.py <stem>_full.csv [--in ...] [--out ...]\n'
             '       (<stem>_full.csv is written by skills/email-verify-debounce-bounceban)')

verdict = {}
for r in csv.DictReader(open(FULL, encoding='utf-8')):
    e = (r.get('Email') or r.get('email') or '').strip().lower()
    v = (r.get('verify_verdict') or '').strip().lower()
    if e and v:
        verdict[e] = v

COLS = ['place_id', 'email', 'verdict', 'email_kind', 'found_by', 'contact_name']
rows = list(csv.DictReader(open(IN, encoding='utf-8')))
stats = collections.Counter()
for r in rows:
    v = verdict.get((r['email'] or '').strip().lower(), '')
    r['verdict'] = v
    stats[v or 'unverified'] += 1
with open(OUT, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=COLS, extrasaction='ignore')
    w.writeheader()
    w.writerows(rows)
print(len(rows), 'rows ->', OUT, dict(stats),
      '| verdicts in', os.path.basename(FULL) + ':', len(verdict))
