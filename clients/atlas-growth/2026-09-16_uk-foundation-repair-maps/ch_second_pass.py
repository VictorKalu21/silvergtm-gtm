"""Job-side pass 2: a second Companies House lookup for QUALIFIED leads still unnamed after the
engine's conservative match and the model read.

Ported from clients/atlas-growth/2026-09-16_uk-foundation-repair/ch_second_pass.py for the
2026-09-16 UK MAPS run. Changes: paths resolve from this file's folder; the leads file and the
"already named" file are arguments (so the damp-only segment can be run the same way); the
acceptance rules are unchanged.

THE BUG THIS WORKS AROUND — IMPROVEMENTS.md, "MEDIUM (companies-house.js): exact-title matches with
punctuation/'&' differences fall to low_confidence", found 2026-09-16, still OPEN:
  `nameOverlap` tokenises on words, so "Welba Construction Ltd." vs "WELBA CONSTRUCTION LTD" scores
  below the match threshold when the lead has no postcode to disambiguate, and "Master Waterproofing
  and Renovations Limited" vs "MASTER WATERPROOFING & RENOVATIONS LIMITED" scores 0.75 (`&` vs
  `and`). 83 of 180 leads came back low_confidence on the export run; this pass recovered 17 with
  active directors and no wrong matches on review — about 10% of the registry's names.
  Fixed JOB-SIDE, here. The engine is NOT edited (engine changes are bug-fix-only, with operator
  approval, a test and an IMPROVEMENTS entry — that entry exists and stays OPEN until then).

Acceptance is looser than the engine's but still deterministic — never a guess:
  (a) normalised company title == normalised business name (strip ltd/limited/llp/plc/the,
      `&`->and, punctuation), OR
  (b) the title contains ALL of the business name's distinctive tokens AND the registered office's
      outward postcode or town matches the lead's.
Only ACTIVE companies, only ACTIVE directors/members; secretaries, corporate officers and nominees
are dropped, exactly as owner-prompt.md requires.

Needs the operator's COMPANIES_HOUSE_KEY in skills/google-maps-scrape/.env (read at runtime; never
printed). Rate limit 600 req / 5 min — two calls per lead plus the 0.25s sleeps stay inside it.

Usage:  python3 ch_second_pass.py [--leads leads_qualified.csv]
                                  [--have owner/contacts_read.jsonl]
                                  [--out owner/companies_house_pass2.jsonl]
"""
import json, base64, urllib.request, urllib.error, urllib.parse, time, re, csv, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
ENV = os.path.join(REPO, 'skills', 'google-maps-scrape', '.env')


def arg(n, d):
    return sys.argv[sys.argv.index('--' + n) + 1] if ('--' + n) in sys.argv else d


LEADS = os.path.join(HERE, arg('leads', 'leads_qualified.csv'))
HAVE = os.path.join(HERE, arg('have', os.path.join('owner', 'contacts_read.jsonl')))
OUT = os.path.join(HERE, arg('out', os.path.join('owner', 'companies_house_pass2.jsonl')))

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
                time.sleep(6 * (a + 1)); continue
            return {}
        except Exception:
            time.sleep(2)
    return {}


STOP = {'ltd', 'limited', 'llp', 'plc', 'the', 'and', 'co', 'uk', 'company', 'services', 'service', 'group'}
def norm(s): return re.sub(r"[^a-z0-9 ]", " ", s.lower().replace('&', ' and ')).split()
def core(s): return [t for t in norm(s) if t not in STOP]
def outward(a):
    m = re.findall(r"\b([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}\b", (a or '').upper())
    return m[-1] if m else ''


csv.field_size_limit(10 ** 7)
q = list(csv.DictReader(open(LEADS, encoding='utf-8')))
named = set()
if os.path.exists(HAVE):
    for l in open(HAVE, encoding='utf-8'):
        if l.strip():
            d = json.loads(l)
            if d.get('contacts'):
                named.add(d['place_id'])
todo = [r for r in q if r['place_id'] not in named]

out = open(OUT, 'w', encoding='utf-8')
hit = 0
by_conf = {}
for r in todo:
    name = re.sub(r"\s*[|(].*$", "", r['name']).strip()        # 'Peter Cox | Preston' -> 'Peter Cox'
    name = re.sub(r"\s*-\s*[A-Z][a-z]+(?:\s[A-Z][a-z]+)?$", "", name).strip()   # '... - Belfast' -> '...'
    s = api('/search/companies?q=' + urllib.parse.quote(name) + '&items_per_page=10')
    time.sleep(0.25)
    lead_ow = outward(r.get('full_address', ''))
    lead_town = (r.get('city') or '').lower()
    best = None
    for it in (s.get('items') or []):
        if it.get('company_status') != 'active':
            continue
        t = it.get('title', '')
        exact = (core(t) == core(name)) or (norm(t) == norm(name))
        addr = it.get('address') or {}
        ow = outward(addr.get('postal_code') or '')
        town = (addr.get('locality') or '').lower()
        geo = (lead_ow and ow == lead_ow) or (lead_town and town == lead_town)
        toks = set(core(name)); ttoks = set(core(t))
        contains = bool(toks) and toks <= ttoks
        if exact:
            best = (it, 'exact_title'); break
        if contains and geo and not best:
            best = (it, 'title_contains+geo')
    if not best:
        continue
    it, conf = best
    o = api('/company/' + it['company_number'] + '/officers?items_per_page=50')
    time.sleep(0.25)
    offs = [{'name': x.get('name'), 'role': x.get('officer_role'), 'appointed_on': x.get('appointed_on')}
            for x in (o.get('items') or [])
            if not x.get('resigned_on')
            and re.search(r'director|member', x.get('officer_role', ''))
            and not re.search(r'corporate|secretary|nominee', x.get('officer_role', ''))]
    if not offs:
        continue
    out.write(json.dumps({'place_id': r['place_id'], 'business_name': r['name'], 'ch_company': it['title'],
                          'ch_number': it['company_number'], 'ch_address': it.get('address_snippet', ''),
                          'confidence': conf, 'officers': offs}, ensure_ascii=False) + '\n')
    hit += 1
    by_conf[conf] = by_conf.get(conf, 0) + 1
out.close()
print('leads: %d | already named by the read: %d | unnamed tried: %d | pass2 matched with directors: %d %s'
      % (len(q), len(named), len(todo), hit, by_conf))
print('NOTE: these are LOOSER matches than the engine\'s. owner-prompt.md CH rule 3 still applies —')
print('      reject any match whose registered title shares no distinctive token with the business name.')
