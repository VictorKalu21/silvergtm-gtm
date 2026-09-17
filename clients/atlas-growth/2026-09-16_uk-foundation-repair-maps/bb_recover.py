#!/usr/bin/env python3
"""Operator directive 2026-09-17: BounceBan also recovers addresses MillionVerifier called `invalid`
or returned `error` on, not only catch-all/unknown. The runner (verify-millionverifier-bounceban.js)
routes only catch_all/unknown/error to BounceBan and drops `invalid` outright, and this run's 20
`error` rows never reached stage 2. This sends every MV invalid/error address in verify/mv.jsonl
that has no BounceBan checkpoint yet, appends to verify/bounceban.jsonl in the runner's record
shape (+ `recovered_from`), and prints the tally. Resumable. Never prints keys."""
import json, os, sys, time, urllib.request, urllib.parse
ENV = os.path.join(os.environ.get('HOME', ''), 'Silver GTM Systems', 'ENVs-Secrets', 'email-verification.env')
KEY = next((l.split('=', 1)[1].strip() for l in open(ENV) if l.startswith('BOUNCEBAN_KEY=')), None)
if not KEY: sys.exit('BOUNCEBAN_KEY missing')
MV = 'verify/mv.jsonl'; BB = 'verify/bounceban.jsonl'
WHICH = set(sys.argv[1].split(',')) if len(sys.argv) > 1 else {'invalid', 'error'}
done = {json.loads(l)['email'] for l in open(BB)} if os.path.exists(BB) else set()
todo = [json.loads(l) for l in open(MV)]
todo = [m for m in todo if m.get('result') in WHICH and m['email'] not in done]
print('candidates', len(todo), {w: sum(1 for m in todo if m['result'] == w) for w in WHICH})
def bb(email):
    req = urllib.request.Request('https://api.bounceban.com/v1/verify/single?' + urllib.parse.urlencode({'email': email}), headers={'Authorization': KEY})
    d = json.load(urllib.request.urlopen(req, timeout=60))
    for _ in range(12):
        if d.get('status') != 'verifying': return d
        time.sleep(max(3, int(d.get('try_again_at', 5)) if str(d.get('try_again_at', '')).isdigit() else 5))
        req = urllib.request.Request('https://api.bounceban.com/v1/verify/single/status?id=' + d['id'], headers={'Authorization': KEY})
        d = json.load(urllib.request.urlopen(req, timeout=60))
    return d
tally = {}
with open(BB, 'a') as out:
    for i, m in enumerate(todo, 1):
        try: d = bb(m['email'])
        except Exception as e: d = {'result': 'api_error', 'error': str(e)[:120]}
        rec = {'email': m['email'], 'result': d.get('result'), 'score': d.get('score'), 'is_accept_all': d.get('is_accept_all'), 'is_role': d.get('is_role'), 'recovered_from': 'mv:' + m['result']}
        out.write(json.dumps(rec) + '\n'); out.flush()
        tally[(m['result'], rec['result'])] = tally.get((m['result'], rec['result']), 0) + 1
        sys.stderr.write('%d/%d %s -> %s\n' % (i, len(todo), m['result'], rec['result']))
print(json.dumps({'%s->%s' % k: v for k, v in tally.items()}, indent=1))
