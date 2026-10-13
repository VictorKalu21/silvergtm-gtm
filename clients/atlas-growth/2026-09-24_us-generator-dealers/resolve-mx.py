#!/usr/bin/env python3
"""resolve-mx.py — MX bucket per email domain via dns.google (free, keyless), cached.
Campaign review 2026-10-12: US mail to Google-hosted inboxes gets zero replies, Microsoft 365 3.7%,
so a send list is split by the RECIPIENT's mail host before any verification credit is spent.
  python3 resolve-mx.py <in.csv with an email column> [--col Email] [--cache owner/verify/mx_cache.json]
Prints the bucket split; writes the cache {domain: {"mx": [...], "bucket": "google|microsoft|other|none"}}.
Bucket: any MX host containing google / aspmx / googlemail -> google; outlook / microsoft /
protection.outlook -> microsoft; MX present otherwise -> other; no MX / NXDOMAIN -> none."""
import csv, json, sys, os, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
IN = sys.argv[1]
COL = sys.argv[sys.argv.index('--col') + 1] if '--col' in sys.argv else 'Email'
CACHE = sys.argv[sys.argv.index('--cache') + 1] if '--cache' in sys.argv else 'owner/verify/mx_cache.json'
cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
def bucket(mx):
    s = ' '.join(mx).lower()
    if not mx: return 'none'
    if any(k in s for k in ('google', 'aspmx', 'googlemail')): return 'google'
    if any(k in s for k in ('outlook', 'microsoft', 'protection.outlook')): return 'microsoft'
    return 'other'
def look(d):
    for _ in range(3):
        try:
            u = 'https://dns.google/resolve?' + urllib.parse.urlencode({'name': d, 'type': 'MX'})
            j = json.load(urllib.request.urlopen(u, timeout=20))
            mx = [a['data'].split()[-1].rstrip('.') for a in j.get('Answer', []) if a.get('type') == 15]
            return d, {'mx': mx, 'bucket': bucket(mx), 'status': j.get('Status')}
        except Exception as e: err = type(e).__name__
    return d, {'mx': [], 'bucket': 'error', 'status': err}
rows = list(csv.DictReader(open(IN)))
doms = sorted({r[COL].split('@')[-1].strip().lower() for r in rows if '@' in r[COL]} - {k for k, v in cache.items() if v['bucket'] != 'error'})
with ThreadPoolExecutor(4) as ex:
    for d, v in ex.map(look, doms): cache[d] = v
json.dump(cache, open(CACHE, 'w'), indent=0)
from collections import Counter
c = Counter(cache[r[COL].split('@')[-1].strip().lower()]['bucket'] for r in rows)
print(json.dumps({'rows': len(rows), 'domains_looked_up': len(doms), 'by_bucket': dict(c)}))
