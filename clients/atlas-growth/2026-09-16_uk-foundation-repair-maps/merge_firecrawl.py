#!/usr/bin/env python3
"""Merge Firecrawl-recovered site-text records into owner/site_text.jsonl (backup kept), report the gain."""
import json, shutil, collections
P = 'owner/site_text.jsonl'; F = 'owner/site_text_firecrawl.jsonl'
rec = {json.loads(l)['website']: json.loads(l) for l in open(F)}
ok = {w: r for w, r in rec.items() if r['status'] == 'ok'}
shutil.copy(P, P + '.pre-firecrawl.bak')
rows = [json.loads(l) for l in open(P)]; replaced = 0
with open(P, 'w') as f:
    for r in rows:
        if r['status'] != 'ok' and r['website'] in ok: r = ok[r['website']]; replaced += 1
        f.write(json.dumps(r) + '\n')
by = collections.Counter(r['status'].split(':')[0] + ':' + r['status'].split(':')[-1] for r in rec.values())
print(json.dumps({'attempted': len(rec), 'recovered': len(ok), 'merged_into_site_text': replaced,
                  'with_email': sum(1 for r in ok.values() if r.get('emails')),
                  'emails': sorted({e for r in ok.values() for e in (r.get('emails') or [])}),
                  'outcomes': dict(by), 'text_chars_median': sorted(len(r.get('text') or '') for r in ok.values())[len(ok)//2] if ok else 0}, indent=1))
