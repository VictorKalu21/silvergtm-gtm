"""Build Companies-House-ONLY owner-read batches for the leads prep-owner-batches.js skipped.

`prep-owner-batches.js` drops a lead that has no evidence text at all (no site_text, no
owner_page_text, no serp_text, no web_search_evidence) — 262 of this run's 860 — and
`inject_ch_directors.py` runs AFTER that drop, so a lead whose ONLY evidence is the registry never
reaches a reader. READ-PLAN.md open item 1. This closes it: every skipped lead that has >= 1 active
officer in `owner/companies_house.jsonl` or `owner/companies_house_lowconf.jsonl` is emitted as a
lead object of EXACTLY the shape `prep-owner-batches.js` emits, with the four text-evidence fields
empty and `ch_directors` rendered EXACTLY as `inject_ch_directors.py` renders it.

Output: <run>/owner/read_chonly/batches/batch-<N>-in.json + <run>/owner/read_chonly/manifest.json
— a sibling of owner/read/, so `merge-owner-reads.js --dir <run>/owner/read_chonly` reads it with no
change (it globs `<dir>/batches/batch-*-in.json`, pairs each with `-out.json`, and writes
`<dir>/read_report.json`).

This file NEVER touches owner/read/ — the 15 live readers own that directory.

Why the renderer is COPIED, not imported: `inject_ch_directors.py` does its work at module level —
importing it would glob `owner/read/batches/batch-*-in.json` and rewrite those files underneath the
running readers. The three literals the approved prompt keys on (`[matched match]`,
`[low_confidence match]`, the `DEMOTED:` sentence) are reproduced below character-for-character; the
test at the bottom of this file asserts they still match that script's source text.

Usage:  python3 prep_chonly_batches.py [--batch 40] [--out owner/read_chonly]
No network, no credits, no API keys.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))


def arg(n, d):
    return sys.argv[sys.argv.index('--' + n) + 1] if ('--' + n) in sys.argv else d


BATCH = int(arg('batch', '40'))
OUT = os.path.join(HERE, arg('out', os.path.join('owner', 'read_chonly')))
LEADS = os.path.join(HERE, 'owner_read_input.csv')
SKIPPED = os.path.join(HERE, 'owner', 'read', 'skipped_none.json')

# ---------------------------------------------------------------- Companies House load
# Copied from inject_ch_directors.py. Same precedence: an engine match wins over a low-confidence
# candidate for the same lead; a `matched` record that demote_city_only_ch.py demoted carries
# `confidence: low_confidence` + `demoted_reason: city_only` and is rendered as a CANDIDATE.
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
        if o.get('officers') and (o['place_id'] not in ch or conf == 'matched'):
            c_conf = conf
            if conf == 'pass2':
                c_conf = o.get('confidence')
            elif conf == 'matched' and o.get('demoted_reason'):
                c_conf = o.get('confidence') or 'low_confidence'
            ch[o['place_id']] = {'confidence': c_conf, 'demoted': o.get('demoted_reason', ''),
                                 'company': o.get('ch_company'), 'number': o.get('ch_number'),
                                 'officers': o['officers']}
# The engine already stores ACTIVE officers only (companies-house.js filters `!x.resigned_on`
# before writing), so a non-empty `officers` array is the ">= 1 active officer" test.


def render_ch(c):
    """Byte-for-byte the expression inject_ch_directors.py assigns to lead['ch_directors']."""
    lines = ['%s — %s (appointed %s)' % (x['name'], x['role'], x.get('appointed_on', ''))
             for x in c['officers'][:8]]
    demo = ('  (DEMOTED: %s — the ONLY basis for this match was the town name, so it is a '
            'CANDIDATE, not authoritative: apply Companies House rule 3 before you output '
            'anybody from it)' % c['demoted']) if c.get('demoted') else ''
    return ('Companies House [%s match]%s: %s (%s)\n' % (c['confidence'], demo, c['company'], c['number'])) \
        + '\n'.join(lines)


def assert_renderer_matches_injector():
    """Guard: if inject_ch_directors.py's literals ever change, fail loudly instead of drifting."""
    src = open(os.path.join(HERE, 'inject_ch_directors.py'), encoding='utf-8').read()
    for lit in ("'%s — %s (appointed %s)'",
                "'  (DEMOTED: %s — the ONLY basis for this match was the town name, so it is a '",
                "'CANDIDATE, not authoritative: apply Companies House rule 3 before you output '",
                "'anybody from it)'",
                "'Companies House [%s match]%s: %s (%s)\\n'"):
        assert lit in src, 'renderer drift: inject_ch_directors.py no longer contains %s' % lit


assert_renderer_matches_injector()

# ---------------------------------------------------------------- leads + emails
def csv_rows(f):
    import csv as _csv
    return list(_csv.DictReader(open(f, newline='', encoding='utf-8-sig')))


leads = {r['place_id']: r for r in csv_rows(LEADS)}
skipped = json.load(open(SKIPPED, encoding='utf-8'))

# `emails` comes off site_text.jsonl, exactly as prep-owner-batches.js takes it (`s?.emails || []`),
# never off the CSV. A skipped lead can still have a site record whose text was empty but whose
# emails were harvested.
site_emails = {}
sf = os.path.join(HERE, 'owner', 'site_text.jsonl')
if os.path.exists(sf):
    for l in open(sf, encoding='utf-8'):
        if not l.strip():
            continue
        try:
            d = json.loads(l)
        except ValueError:
            continue
        if d.get('place_id'):
            site_emails[d['place_id']] = d.get('emails') or []

# ---------------------------------------------------------------- build
items, no_ch, no_lead = [], 0, 0
auth_n = demoted_n = cand_n = 0
for pid in skipped:
    r = leads.get(pid)
    if not r:
        no_lead += 1
        continue
    c = ch.get(pid)
    if not c:
        no_ch += 1
        continue
    if c.get('demoted'):
        demoted_n += 1
    elif c['confidence'] == 'matched':
        auth_n += 1
    else:
        cand_n += 1
    items.append({
        'place_id': pid, 'business_name': r['name'], 'full_address': r['full_address'],
        'zip': r['zip'], 'neighborhood': r['neighborhood'], 'city': r['city'], 'state': r['state'],
        'website': r['website'], 'brand_family': r.get('brand_family', '') or '',
        'emails': site_emails.get(pid, []),
        'site_text': '',
        'owner_page_url': '', 'owner_page_text': '',
        'serp_text': '',
        'web_search_evidence': '',
        'ch_directors': render_ch(c),
    })

bdir = os.path.join(OUT, 'batches')
os.makedirs(bdir, exist_ok=True)
n = 0
for i in range(0, len(items), BATCH):
    with open(os.path.join(bdir, 'batch-%d-in.json' % n), 'w', encoding='utf-8') as fh:
        json.dump(items[i:i + BATCH], fh, ensure_ascii=False, indent=1)
    n += 1

manifest = {'source': 'owner/read/skipped_none.json', 'evidence': 'companies_house_only',
            'skipped_leads': len(skipped), 'skipped_not_in_leads_csv': no_lead,
            'no_companies_house_officers': no_ch, 'items': len(items), 'batches': n,
            'batch_size': BATCH,
            'ch': {'authoritative': auth_n, 'candidates': cand_n, 'demoted_city_only': demoted_n},
            'leads_with_emails': sum(1 for x in items if x['emails'])}
with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as fh:
    json.dump(manifest, fh, indent=2)

# ---------------------------------------------------------------- report
print('skipped leads total:            %d' % len(skipped))
print('  with >=1 active CH officer:   %d' % len(items))
print('  no Companies House officers:  %d' % no_ch)
print('  not found in owner_read_input.csv: %d' % no_lead)
print('batches written:                %d  (%d per batch) -> %s' % (n, BATCH, bdir))
print('CH confidence of the %d:' % len(items))
print('  authoritative [matched match]:        %d' % auth_n)
print('  candidates    [low_confidence match]: %d' % cand_n)
print('  DEMOTED city_only (also low_confidence): %d' % demoted_n)
print('leads also carrying harvested emails:   %d' % manifest['leads_with_emails'])

for label, pick in (('AUTHORITATIVE', lambda x: '[matched match]' in x['ch_directors']),
                    ('DEMOTED', lambda x: 'DEMOTED:' in x['ch_directors'])):
    s = next((x for x in items if pick(x)), None)
    print('\n--- sanity: one %s rendered block ---' % label)
    print('%s (%s)' % (s['business_name'], s['place_id']) if s else '(none)')
    print(s['ch_directors'] if s else '')
