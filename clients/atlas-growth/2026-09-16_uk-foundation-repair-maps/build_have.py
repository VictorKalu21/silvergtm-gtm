"""Build the single "already named" file the sweep prep should exclude on.

WHY THIS EXISTS. `prep-sweep-batches.js` treats a lead as named when its record has
`contacts.length`. `combine-owner-contacts.js` — the step that actually builds the deliverable —
treats a lead as named when its record has a non-empty `primary_name`. Those two tests disagree on
8 of this run's read records: `merge-owner-reads.js` kept a contact but promoted none of them to
primary, because the "contact" is not a person. Real examples from `owner/contacts_read.jsonl`:

    "West Yorkshire"        / title "WF12 7QE"      (Epic, Dewsbury)
    "Home About Damptec"    / title "Tanking Systems and Structural Waterproofing"
    "Southeast Preservation"/ title "Your Local Damp Proofing Company Covering Hastings ..."

All 8 are `role_bucket: other`, `is_likely_owner: false`, `primary_name: ""`. They are page
headings and addresses the reader mis-cast as people; the merge's guardrails caught them, which is
why `primary_name` is blank. Left alone they are the worst of both worlds: the deliverable drops
them (no `primary_name`), and the sweep skips them (they have `contacts`), so they are never
worked again. This writes a combined file holding ONLY records with a real primary, so
`--have` excludes exactly the leads `combine-owner-contacts.js` will count as named.

Reads every file given, in order; writes one JSONL. No network, no credits.

Paths are resolved against THIS FILE'S folder first (so `owner/contacts_read.jsonl` works from
anywhere), then against the working directory.

Usage:  python3 build_have.py [--out owner/contacts_named_have.jsonl] <in.jsonl> [<in.jsonl>...]
        (default inputs: owner/contacts_read.jsonl owner/contacts_read_chonly.jsonl)
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))


def arg(n, d):
    return sys.argv[sys.argv.index('--' + n) + 1] if ('--' + n) in sys.argv else d


_o = arg('out', os.path.join('owner', 'contacts_named_have.jsonl'))
OUT = _o if os.path.isabs(_o) else os.path.join(HERE, _o)
ins = [a for i, a in enumerate(sys.argv[1:], 1)
       if not a.startswith('--') and sys.argv[i - 1] != '--out']
if not ins:
    ins = [os.path.join('owner', 'contacts_read.jsonl'),
           os.path.join('owner', 'contacts_read_chonly.jsonl')]

def resolve(f):
    a = os.path.join(HERE, f)
    return a if os.path.exists(a) else f


kept = dropped = 0
seen = set()
with open(OUT, 'w', encoding='utf-8') as fh:
    for f in ins:
        p = resolve(f)
        if not os.path.exists(p):
            print('WARN missing %s' % p)
            continue
        for l in open(p, encoding='utf-8'):
            if not l.strip():
                continue
            d = json.loads(l)
            if not d.get('primary_name'):
                if d.get('contacts'):
                    dropped += 1
                continue
            if d['place_id'] in seen:
                continue
            seen.add(d['place_id'])
            fh.write(json.dumps(d, ensure_ascii=False) + '\n')
            kept += 1
print('inputs: %s' % ', '.join(ins))
print('named (contacts AND primary_name) -> %s : %d' % (os.path.relpath(OUT, HERE), kept))
print('records with contacts but NO primary_name, deliberately NOT excluded: %d' % dropped)
