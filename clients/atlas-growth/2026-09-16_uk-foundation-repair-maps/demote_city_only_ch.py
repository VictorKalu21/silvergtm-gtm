"""Demote city-only Companies House acceptances to low_confidence — JOB-SIDE, not the engine.

WHY. `companies-house.js` accepts a company when it is ACTIVE and ANY of three things holds:
a full postcode match in the registered-office snippet, a `city` match, or a name overlap >= 0.9
(`confident = active && (pcMatch || cityMatch || ov >= 0.9)`). CH-REPORT.md measured the three
acceptance paths separately over this run's 432 matches:

    postcode        154 matched   ~0.6% wrong (3 of its 4 flags are punctuation false alarms)
    overlap >= 0.9  159 matched     0% wrong
    city only       119 matched    ~21% wrong   <-- this script

A UK town name is not a disambiguator in a vertical where every firm is called
"<word> Damp Proofing": "Rentokil Property Care - Belfast" -> BELFAST PROPERTY DEVELOPMENTS LTD,
"Perlini Damp Proofing" and "Damp Proofing Direct" -> ABOVEWATER DAMP PROOFING LTD. Those records
are written `matched` (authoritative), so `owner-prompt.md`'s Companies House rule 3 — reject a CH
title sharing no distinctive token with the business name — is NOT applied to them by the reader;
the prompt only invokes rule 3 when the block is flagged `[low_confidence match]`.

WHAT THIS DOES. Rewrites `owner/companies_house.jsonl` in place (a `.bak` of the pre-demotion file
is kept) adding, to every city-only acceptance:

    "confidence": "low_confidence", "demoted_reason": "city_only"

Nothing is deleted: `matched`, `ch_company`, `ch_number` and `officers` all stay, so any consumer
that wants the candidate still has it. `inject_ch_directors.py` renders the record's own
`confidence` when it carries one, so the demoted leads reach the reader tagged
`Companies House [low_confidence match] (DEMOTED: city_only ...)` and rule 3 fires on them.

THE ENGINE IS NOT TOUCHED. The permanent fix belongs in `companies-house.js` behind a test and an
operator go; this is the job-side demotion for THIS run, and the matching `IMPROVEMENTS.md` entry
stays OPEN until the engine is fixed properly.

BASIS. The engine records the basis per matched record (`match_postcode`, `match_city`,
`name_overlap`), so it is read, not guessed. A record is city-only when

    match_postcode is false AND name_overlap < 0.9

(acceptance required one of the three, so that is exactly the cityMatch path). If a record predates
those fields, the basis is recomputed here: `name_overlap` from `norm`/`nameOverlap` copied
VERBATIM from `companies-house.js`, and a missing/blank `lead_postcode` — the engine's own parse of
`full_address` — read as "no postcode in full_address", hence no postcode match. The fallback is
deliberately conservative: unknown basis demotes.

Idempotent: a record already carrying `demoted_reason` is counted, not re-processed.

Usage:  python3 demote_city_only_ch.py [--file owner/companies_house.jsonl] [--dry-run]
"""
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OVERLAP_FLOOR = 0.9   # the engine's own near-exact-name acceptance threshold


def arg(n, d=None):
    return sys.argv[sys.argv.index('--' + n) + 1] if ('--' + n) in sys.argv else d


# --- copied VERBATIM from skills/google-maps-scrape/companies-house.js ------------------------
# const norm=s=>String(s||'').toLowerCase().replace(/\b(ltd|limited|llp|plc|the)\b/g,'')
#                .replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
def norm(s):
    s = str(s or '').lower()
    s = re.sub(r'\b(ltd|limited|llp|plc|the)\b', '', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


# function nameOverlap(a,b){const A=new Set(...),B=new Set(...);if(!A.size||!B.size)return 0;
#   let n=0;for(const t of A)if(B.has(t))n++;return n/Math.max(A.size,B.size);}
def name_overlap(a, b):
    A = set(t for t in norm(a).split(' ') if t)
    B = set(t for t in norm(b).split(' ') if t)
    if not A or not B:
        return 0.0
    return len(A & B) / float(max(len(A), len(B)))
# ----------------------------------------------------------------------------------------------


def basis(rec):
    """('postcode'|'name_overlap'|'city_only', overlap, how_it_was_derived)"""
    derived = 'engine_fields'
    if 'match_postcode' in rec:
        pc = bool(rec.get('match_postcode'))
    else:
        # no recorded basis: the engine's parse of full_address is `lead_postcode`; empty means
        # there was no postcode to match on, so the acceptance cannot have been the postcode path.
        pc = False
        derived = 'recomputed'
    if rec.get('name_overlap') is not None:
        ov = float(rec['name_overlap'])
    else:
        ov = name_overlap(rec.get('business_name'), rec.get('ch_company'))
        derived = 'recomputed'
    if pc:
        return 'postcode', ov, derived
    if ov >= OVERLAP_FLOOR:
        return 'name_overlap', ov, derived
    return 'city_only', ov, derived


def main():
    path = os.path.join(HERE, arg('file', os.path.join('owner', 'companies_house.jsonl')))
    dry = '--dry-run' in sys.argv
    if not os.path.exists(path):
        print('ERROR: %s not found' % path)
        return 1

    recs = [json.loads(l) for l in open(path, encoding='utf-8') if l.strip()]

    n = {'matched': 0, 'postcode': 0, 'name_overlap': 0, 'city_only': 0,
         'already_demoted': 0, 'low_confidence': 0, 'no_name_match': 0, 'recomputed': 0,
         'demoted_with_officers': 0}
    demoted_names = []
    for r in recs:
        if not r.get('matched'):
            n['low_confidence' if r.get('reason') == 'low_confidence' else 'no_name_match'] += 1
            continue
        n['matched'] += 1
        if r.get('demoted_reason'):          # idempotent re-run
            n['already_demoted'] += 1
            n['city_only'] += 1
            if r.get('officers'):
                n['demoted_with_officers'] += 1
            continue
        b, ov, derived = basis(r)
        n[b] += 1
        if derived == 'recomputed':
            n['recomputed'] += 1
        if b != 'city_only':
            continue
        r['confidence'] = 'low_confidence'
        r['demoted_reason'] = 'city_only'
        demoted_names.append((r.get('business_name', ''), r.get('ch_company', ''), ov))
        if r.get('officers'):
            n['demoted_with_officers'] += 1

    kept = n['postcode'] + n['name_overlap']
    print('companies_house.jsonl: %d records' % len(recs))
    print('  matched (engine-accepted)      : %d' % n['matched'])
    print('    authoritative KEPT           : %d   (postcode %d + name_overlap>=%.2f %d)'
          % (kept, n['postcode'], OVERLAP_FLOOR, n['name_overlap']))
    print('    DEMOTED city_only            : %d   (%d of them carry officers)'
          % (n['city_only'], n['demoted_with_officers']))
    print('      of which already demoted   : %d' % n['already_demoted'])
    print('      basis recomputed, not read : %d' % n['recomputed'])
    print('  already low (not accepted)     : %d   (low_confidence %d + no_name_match %d)'
          % (n['low_confidence'] + n['no_name_match'], n['low_confidence'], n['no_name_match']))

    # Sanity: the three wrong matches named in CH-REPORT.md must end up demoted.
    must = ['Rentokil Property Care - Belfast', 'Perlini Damp Proofing', 'Damp Proofing Direct']
    by_name = {}
    for r in recs:
        by_name.setdefault((r.get('business_name') or '').strip().lower(), []).append(r)
    ok = True
    print('  sanity (CH-REPORT.md wrong matches):')
    for m in must:
        hits = [r for k, v in by_name.items() if m.lower() in k for r in v]
        if not hits:
            print('    MISSING  %-38s not in the file' % m)
            ok = False
            continue
        for r in hits:
            good = r.get('demoted_reason') == 'city_only' or not r.get('matched')
            ok = ok and good
            print('    %-8s %-38s -> %-42s %s' % ('demoted' if r.get('demoted_reason') else
                                                  ('not-matched' if not r.get('matched') else 'KEPT!'),
                                                  r.get('business_name', '')[:38],
                                                  (r.get('ch_company') or r.get('candidate') or '-')[:42],
                                                  'ok' if good else 'FAIL'))
    if dry:
        print('  --dry-run: nothing written')
        return 0 if ok else 1
    if not ok:
        print('ERROR: sanity check failed — file NOT rewritten')
        return 1

    bak = path + '.bak'
    if not os.path.exists(bak):          # keep the pristine pre-demotion copy across re-runs
        shutil.copy2(path, bak)
        print('  backup -> %s' % bak)
    else:
        print('  backup already exists (pre-demotion copy kept) -> %s' % bak)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        for r in recs:
            fh.write(json.dumps(r, ensure_ascii=False) + '\n')
    os.replace(tmp, path)
    print('  rewrote %s' % path)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
