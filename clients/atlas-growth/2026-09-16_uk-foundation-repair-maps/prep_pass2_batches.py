"""Build Companies-House-ONLY owner-read batches for the leads `ch_second_pass.py` named in pass 2.

Same job as `prep_chonly_batches.py`, different source. Pass 2 re-searches Companies House for the
leads still unnamed after BOTH reads (`owner/contacts_read.jsonl` + `owner/contacts_read_chonly.jsonl`)
with a looser-but-still-deterministic matcher, and writes `owner/companies_house_pass2.jsonl`. Those
records have never reached a reader, so this queues them in the identical lead-object shape
`prep-owner-batches.js` emits, with the four text-evidence fields empty and `ch_directors` rendered
EXACTLY as `inject_ch_directors.py` renders it.

Output: <run>/owner/read_pass2/batches/batch-<N>-in.json + <run>/owner/read_pass2/manifest.json
— a sibling of owner/read/ and owner/read_chonly/, so `merge-owner-reads.js --dir <run>/owner/read_pass2`
reads it unchanged.

WHY THE PASS-2 FILE IS THE ONLY SOURCE (and precedence is NOT applied here). `inject_ch_directors.py`
and `prep_chonly_batches.py` both let an engine `matched` record win over anything else for the same
lead. That is right when the question is "what is the best evidence for this lead"; it is wrong here,
because the whole point of these batches is the evidence the reader has NOT yet seen. A lead that had
an engine low-confidence candidate the reader rejected, and now has a DIFFERENT pass-2 match, must be
shown the pass-2 match. So this script renders the pass-2 record and nothing else.

CH-ONLY SHAPE IS DELIBERATE, including for the ~half of these leads that DO have site text. Those
leads were already read with their site text and the reader named nobody from it; the only new
evidence is the registry match, so the reader is given the registry and told so (the STEP A2 prompt
additions in READ-PLAN.md apply verbatim). Nothing is lost — a lead the pass-2 reader leaves unnamed
still goes to the STEP C web-search sweep.

Confidence is carried into the text on purpose. `ch_second_pass.py` writes `matched` for an
exact-title or title-contains+postcode acceptance, and `low_confidence` + `demoted_reason: city_only`
for one accepted on the TOWN NAME ALONE (the same demotion `demote_city_only_ch.py` applies to the
engine's output — CH-REPORT.md measured the engine's town-only path at ~21% wrong). A demoted record
therefore reaches the reader as `[low_confidence match] (DEMOTED: city_only ...)` and
`owner-prompt.md` Companies House rule 3 fires on it.

NATIONAL-BRAND BRANCHES ARE SKIPPED (`--keep-brand-branch` turns this off). 55 of the 102 pass-2
records are branch listings of Timberwise (29), Rentokil Property Care (25) and Protectahome (1).
Companies House holds ONE company for each of those brands, so pass 2 can only ever return the
national holding company's officers for a branch — and `owner-prompt.md`'s branch rule says a
Companies House record for the national holding company is NOT this branch's owner. The readers
already applied that rule to 47 of these leads and correctly named nobody; re-reading the identical
evidence cannot produce a right answer, only a chance of a wrong one. A lead is a brand branch when
`brand_family` is non-empty in `owner_read_input.csv` — the same field the prompt's branch rule and
`merge-owner-reads.js` key on. They still go to the STEP C web-search sweep, which is the only
route to a real branch manager.

Usage:  python3 prep_pass2_batches.py [--batch 40] [--src owner/companies_house_pass2.jsonl]
                                      [--out owner/read_pass2] [--keep-brand-branch]
No network, no credits, no API keys.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))


def arg(n, d):
    return sys.argv[sys.argv.index('--' + n) + 1] if ('--' + n) in sys.argv else d


BATCH = int(arg('batch', '40'))
SKIP_BRAND = '--keep-brand-branch' not in sys.argv
SRC = os.path.join(HERE, arg('src', os.path.join('owner', 'companies_house_pass2.jsonl')))
OUT = os.path.join(HERE, arg('out', os.path.join('owner', 'read_pass2')))
LEADS = os.path.join(HERE, 'owner_read_input.csv')

if not os.path.exists(SRC):
    print('ERROR: %s not found — run ch_second_pass.py first' % SRC)
    raise SystemExit(1)


# ---------------------------------------------------------------- renderer (copied, not imported)
# Byte-for-byte the expression inject_ch_directors.py assigns to lead['ch_directors']. Copied for
# the same reason prep_chonly_batches.py copies it: that script works at module level and importing
# it would rewrite owner/read/batches/ underneath whatever is running.
def render_ch(c):
    lines = ['%s — %s (appointed %s)' % (x['name'], x['role'], x.get('appointed_on', ''))
             for x in c['officers'][:8]]
    demo = ('  (DEMOTED: %s — the ONLY basis for this match was the town name, so it is a '
            'CANDIDATE, not authoritative: apply Companies House rule 3 before you output '
            'anybody from it)' % c['demoted']) if c.get('demoted') else ''
    return ('Companies House [%s match]%s: %s (%s)\n' % (c['confidence'], demo, c['company'], c['number'])) \
        + '\n'.join(lines)


def assert_renderer_matches_injector():
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
    _csv.field_size_limit(10 ** 7)
    return list(_csv.DictReader(open(f, newline='', encoding='utf-8-sig')))


leads = {r['place_id']: r for r in csv_rows(LEADS)}

# `emails` comes off site_text.jsonl, exactly as prep-owner-batches.js takes it (`s?.emails || []`),
# never off the CSV.
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

# "had site text" is prep-owner-batches.js's own verdict, not a re-derivation: a lead it skipped is
# in owner/read/skipped_none.json, every other lead reached a reader WITH text.
_sk = os.path.join(HERE, 'owner', 'read', 'skipped_none.json')
no_text = set(json.load(open(_sk, encoding='utf-8'))) if os.path.exists(_sk) else set()
has_text = lambda pid: pid not in no_text

# ---------------------------------------------------------------- build
items, no_lead, brand_skip = [], 0, 0
auth_n = demoted_n = 0
brands = {}
seen = set()
for l in open(SRC, encoding='utf-8'):
    if not l.strip():
        continue
    o = json.loads(l)
    if not o.get('officers'):
        continue
    pid = o['place_id']
    if pid in seen:
        continue
    seen.add(pid)
    r = leads.get(pid)
    if not r:
        no_lead += 1
        continue
    bf = (r.get('brand_family') or '').strip()
    if bf and SKIP_BRAND:
        brand_skip += 1
        brands[bf] = brands.get(bf, 0) + 1
        continue
    c = {'confidence': o.get('confidence') or 'low_confidence',
         'demoted': o.get('demoted_reason', ''),
         'company': o.get('ch_company'), 'number': o.get('ch_number'),
         'officers': o['officers']}
    if c['demoted']:
        demoted_n += 1
    else:
        auth_n += 1
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

manifest = {'source': os.path.relpath(SRC, HERE), 'evidence': 'companies_house_only',
            'pass2_records_with_officers': len(seen), 'not_in_leads_csv': no_lead,
            'skipped_brand_branch': brand_skip, 'skipped_brands': brands,
            'skip_brand_branch': SKIP_BRAND,
            'items': len(items), 'batches': n, 'batch_size': BATCH,
            'ch': {'authoritative': auth_n, 'demoted_city_only': demoted_n},
            'leads_that_also_had_site_text': sum(1 for x in items if has_text(x['place_id'])),
            'leads_with_emails': sum(1 for x in items if x['emails'])}
with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as fh:
    json.dump(manifest, fh, indent=2)

print('pass-2 records with officers:  %d' % len(seen))
print('  not in owner_read_input.csv: %d' % no_lead)
print('  skipped, national-brand branch (parent officers are not this branch\'s owner): %d %s'
      % (brand_skip, brands))
print('  queued:                      %d' % len(items))
print('    authoritative [matched match]:            %d' % auth_n)
print('    DEMOTED city_only [low_confidence match]: %d' % demoted_n)
print('    of these, leads that already had site text: %d' % manifest['leads_that_also_had_site_text'])
print('batches written:               %d  (%d per batch) -> %s' % (n, BATCH, bdir))

for label, pick in (('AUTHORITATIVE', lambda x: '[matched match]' in x['ch_directors']),
                    ('DEMOTED', lambda x: 'DEMOTED:' in x['ch_directors'])):
    s = next((x for x in items if pick(x)), None)
    print('\n--- sanity: one %s rendered block ---' % label)
    print('%s (%s)' % (s['business_name'], s['place_id']) if s else '(none)')
    print(s['ch_directors'] if s else '')
