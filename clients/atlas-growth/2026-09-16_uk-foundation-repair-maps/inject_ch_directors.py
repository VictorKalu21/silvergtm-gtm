"""Add Companies House officers to each owner-read batch as `ch_directors` — the AUTHORITATIVE
source in owner-prompt.md's SOURCE PRIORITY.

Ported from clients/atlas-growth/2026-09-16_uk-foundation-repair/inject_ch_directors.py for the
2026-09-16 UK MAPS run. Changes: paths resolve from this file's folder; the hardcoded "of 180" in
the summary is computed; pass-2 records are injected too (the export run ran pass 2 after the read,
so it never had them at inject time — here the pipeline can inject whatever exists).

Runs AFTER prep-owner-batches.js and BEFORE the Haiku owner reads. prep-owner-batches.js writes the
batch items; this adds one extra field per lead. Confidence is carried into the text on purpose:
the reader must know whether it is looking at an engine match or a candidate it has to judge
against the business name (owner-prompt.md, Companies House rule 3 — the check that caught four
wrong owners on the export run).

Usage:  python3 inject_ch_directors.py [--dir owner/read/batches]
"""
import json, glob, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))


def arg(n, d):
    return sys.argv[sys.argv.index('--' + n) + 1] if ('--' + n) in sys.argv else d


BATCHES = os.path.join(HERE, arg('dir', os.path.join('owner', 'read', 'batches')))

ch = {}
for fn, conf in ((os.path.join('owner', 'companies_house.jsonl'), 'matched'),
                 (os.path.join('owner', 'companies_house_lowconf.jsonl'), 'low_confidence'),
                 (os.path.join('owner', 'companies_house_pass2.jsonl'), 'pass2')):
    f = os.path.join(HERE, fn)
    if not os.path.exists(f):
        continue
    for l in open(f, encoding='utf-8'):
        if not l.strip():
            continue
        o = json.loads(l)
        # an engine match wins over a low-confidence candidate for the same lead
        if o.get('officers') and (o['place_id'] not in ch or conf == 'matched'):
            ch[o['place_id']] = {'confidence': o.get('confidence') if conf == 'pass2' else conf,
                                 'company': o.get('ch_company'), 'number': o.get('ch_number'),
                                 'officers': o['officers']}

files = sorted(glob.glob(os.path.join(BATCHES, 'batch-*-in.json')))
if not files:
    print('ERROR: no batch-*-in.json in %s — run prep-owner-batches.js first' % BATCHES)
    raise SystemExit(1)

n = total = 0
for f in files:
    b = json.load(open(f, encoding='utf-8-sig'))
    for lead in b:
        total += 1
        c = ch.get(lead['place_id'])
        if c:
            lines = ['%s — %s (appointed %s)' % (x['name'], x['role'], x.get('appointed_on', ''))
                     for x in c['officers'][:8]]
            lead['ch_directors'] = ('Companies House [%s match]: %s (%s)\n' % (c['confidence'], c['company'], c['number'])) \
                                   + '\n'.join(lines)
            n += 1
        else:
            lead['ch_directors'] = ''
    json.dump(b, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)

print('batches: %d | leads: %d | leads given ch_directors: %d (%.0f%%)'
      % (len(files), total, n, 100.0 * n / total if total else 0))
print('CH records loaded: %d' % len(ch))
