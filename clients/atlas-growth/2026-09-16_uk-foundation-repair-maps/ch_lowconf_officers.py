"""Job-side pass 1: pull directors for the Companies House candidates the ENGINE left as
`low_confidence`, so the model read can judge them against the business name itself.

Ported from clients/atlas-growth/2026-09-16_uk-foundation-repair/ch_lowconf_officers.py for the
2026-09-16 UK MAPS run. Changes: paths resolve from this file's folder (runnable from anywhere);
the input/output files are arguments; a dead `if False else` branch in the original is removed;
the officer filter and the acceptance rule are unchanged.

WHY this exists: companies-house.js's `nameOverlap` is deliberately conservative — it requires a
real token match and scores "X Ltd." against "X LIMITED" below the threshold. That is the right
default for an engine (a wrong owner is worse than no owner) but it strands ~46% of the leads on
the last UK run as `low_confidence` with a named candidate attached. This pass pulls those
candidates' ACTIVE directors and hands them to the reader, which applies owner-prompt.md's
Companies House rule 3: reject a match whose registered title shares no distinctive token with the
business name. THE MODEL DECIDES; this script only fetches. The engine is untouched.

Needs the operator's COMPANIES_HOUSE_KEY in skills/google-maps-scrape/.env (read at runtime by
this script; never printed). Rate limit: 600 requests / 5 minutes — the 0.3s sleeps below plus the
429 backoff keep one process comfortably inside it.

Usage:  python3 ch_lowconf_officers.py [--in owner/companies_house.jsonl]
                                       [--out owner/companies_house_lowconf.jsonl]
"""
import json, base64, urllib.request, urllib.error, urllib.parse, time, re, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
ENV = os.path.join(REPO, 'skills', 'google-maps-scrape', '.env')


def arg(n, d):
    return sys.argv[sys.argv.index('--' + n) + 1] if ('--' + n) in sys.argv else d


IN = os.path.join(HERE, arg('in', os.path.join('owner', 'companies_house.jsonl')))
OUT = os.path.join(HERE, arg('out', os.path.join('owner', 'companies_house_lowconf.jsonl')))

KEY = [l.split('=', 1)[1].strip() for l in open(ENV) if l.startswith('COMPANIES_HOUSE_KEY')][0]
AUTH = 'Basic ' + base64.b64encode((KEY + ':').encode()).decode()


def api(p):
    for a in range(4):
        try:
            req = urllib.request.Request('https://api.company-information.service.gov.uk' + p,
                                         headers={'Authorization': AUTH})
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(5 * (a + 1)); continue
            return {}
        except Exception:
            time.sleep(2)
    return {}


recs = [json.loads(l) for l in open(IN, encoding='utf-8') if l.strip()]
low = [r for r in recs if not r.get('matched') and r.get('candidate')
       and r.get('candidate_status') == 'active' and (r.get('name_overlap') or 0) >= 0.6]

out = open(OUT, 'w', encoding='utf-8')
n = 0
for r in low:
    s = api('/search/companies?q=' + urllib.parse.quote(r['candidate']) + '&items_per_page=5')
    items = [i for i in (s.get('items') or []) if i.get('title', '').upper() == r['candidate'].upper()] \
        or (s.get('items') or [])[:1]
    if not items:
        continue
    c = items[0]
    time.sleep(0.3)
    o = api('/company/' + c['company_number'] + '/officers?items_per_page=50')
    offs = [{'name': x.get('name'), 'role': x.get('officer_role'), 'appointed_on': x.get('appointed_on')}
            for x in (o.get('items') or [])
            if not x.get('resigned_on')
            and re.search(r'director|member', x.get('officer_role', ''))
            and not re.search(r'corporate|secretary|nominee', x.get('officer_role', ''))]
    rec = {'place_id': r['place_id'], 'business_name': r['business_name'], 'ch_company': c.get('title'),
           'ch_number': c['company_number'], 'ch_status': c.get('company_status'),
           'ch_address': (c.get('address_snippet') or ''), 'name_overlap': r['name_overlap'],
           'confidence': 'low', 'officers': offs}
    out.write(json.dumps(rec, ensure_ascii=False) + '\n')
    n += 1
    time.sleep(0.3)
out.close()
print('records in %s: %d | low-confidence candidates: %d | officers pulled for: %d'
      % (os.path.basename(IN), len(recs), len(low), n))
