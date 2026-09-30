#!/usr/bin/env python3
"""registry_nsw.py :: NSW Fair Trading licence register as the owner registry (the Companies House substitute).
RUN-FOLDER ONE-OFF. Grammar captured and replayed 2026-09-20 (RUN-NOTES.md, "NSW Fair Trading"):

  POST https://verify.licence.nsw.gov.au/publicregisterapi/api/v1/licence/search/advQuery
       {"licenceGroup":"Trades","search":"<ONE token>","autoComplete":false,"pageNumber":N,"pageSize":10,"licenceTypes":[]}
       -> {"pagingInfo":{...,"totalRecords":n}, "results":[{licenceId, licenceNumber, licenceType, status, licensee,
          licenseeType (Individual|Organisation), suburb, state, postcode, ABN, ACN, granted, expires}]}
       pageSize MUST be <= 10 (anything larger silently returns {"results":[]}); pageNumber is ZERO-BASED (probed
       2026-09-20: "underpinning" -> page 0 = 10 rows, page 1 = the remaining 4, page 2 = []); the search term is
       matched as ONE token against the licensee name — a space in it returns [] ("Underpinning Solutions" -> 0,
       "underpinning" -> 14 incl. UNDERPINNING SOLUTIONS PTY LTD). So: search the business name's most distinctive
       token(s), one call each, union the results, then match on name tokens + suburb/postcode.
  GET  .../licence/search/details/{licenceType url-encoded}/{licenceId}
       -> componentData.associatedRoles[] = [{name:"Licensee"|"Director"|"Nominated supervisor", parties:[{name, partyType, suburb, ...}]}]
  Keyless. Polite: 2 workers, ~1 req/s.

Modes:
  --probe                       3 hand-picked names (the 3-call rule; output pasted in RUN-NOTES.md before any bulk pull)
  --leads <csv> --out <jsonl>   one search per NSW lead (state token NSW in city/full_address, or --all-states),
                                one details GET per accepted match; emits companies_house.jsonl-shaped records
                                so prep-owner-batches.js --ch renders them unchanged:
       {place_id, company (licensee), number (licenceNumber), registry:"nsw_fair_trading", confidence, match_basis,
        licence_status, licence_classes, officers:[{name, role, suburb}], ...}
  --class-universe <jsonl>      pull every CURRENT "Underpinning and Piering" contractor licence (13 pages) for a
                                name-independent cross-check of the Maps universe.

Acceptance (owner-prompt.md registry rule 3, made mechanical):
  exact_title   normalised licensee == normalised business name                                -> matched
  abn           lead has no ABN column, so never used here (kept for symmetry with companies-house.js)
  name_overlap  all distinctive tokens of the shorter name appear in the longer one AND suburb or postcode matches -> matched
  name_only     token overlap but no suburb/postcode agreement                                   -> low_confidence
  Everything else is not a match. Cancelled / expired / surrendered licences are recorded but never accepted.
"""
import csv, json, re, sys, time, argparse, urllib.parse, urllib.request, os, concurrent.futures as cf

BASE = 'https://verify.licence.nsw.gov.au/publicregisterapi/api/v1'
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128 Safari/537.36'
STOP = {'pty', 'ltd', 'limited', 'p/l', 'the', 'and', '&', 'of', 'co', 'group', 'services', 'service', 'solutions', 'australia', 'australian',
        'underpinning', 'restumping', 'reblocking', 'foundation', 'foundations', 'levelling', 'leveling', 'raising', 'repairs', 'repair',
        'building', 'builders', 'construction', 'constructions', 'contractors', 'contractor', 'concrete', 'structural', 'remedial', 'piling',
        'piering', 'pier', 'piers', 'sydney', 'nsw', 'melbourne', 'brisbane', 'newcastle', 'wollongong', 'central', 'coast', 'inc', 'trust',
        'house', 'houses', 'home', 'homes', 'level', 'levels', 'floor', 'floors', 'slab', 'slabs', 'stump', 'stumps', 'crack', 'cracks',
        'specialist', 'specialists', 'expert', 'experts', 'pro', 'pros', 'plus', 'total', 'all', 'best', 'top', 'quality', 'affordable', 'reliable',
        'east', 'west', 'north', 'south', 'eastern', 'western', 'northern', 'southern', 'bay', 'hills', 'valley', 'regional', 'metro', 'city'}
STATE_RE = re.compile(r'\b(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\b')

def norm(s):
    s = re.sub(r'[^a-z0-9 ]+', ' ', (s or '').lower().replace('&', ' and '))
    return ' '.join(s.split())
def tokens(s):
    return [t for t in norm(s).split() if t not in STOP and len(t) > 1]

def http(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={'User-Agent': UA, 'Accept': 'application/json', 'Content-Type': 'application/json'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.status, json.loads(r.read().decode() or '{}')
        except urllib.error.HTTPError as e:
            return e.code, {'error': e.read().decode()[:200]}
        except Exception as e:  # noqa
            if attempt == 2: return 0, {'error': str(e)}
            time.sleep(2 * (attempt + 1))

def search_token(tok, max_pages=5):
    """One token, zero-based pages of 10, stop at totalPages or max_pages (a token like 'precision' has 123 hits — cap it)."""
    out = []
    for p in range(0, max_pages):
        st, j = http('POST', BASE + '/licence/search/advQuery', {"licenceGroup": "Trades", "search": tok, "autoComplete": False, "pageNumber": p, "pageSize": 10, "licenceTypes": []})
        if st != 200: return out, st
        out += j.get('results') or []
        pi = j.get('pagingInfo') or {}
        if p + 1 >= int(pi.get('totalPages') or 1): break
        time.sleep(0.4)
    return out, 200

TRADE_TOKENS = {'underpinning', 'restumping', 'reblocking', 'relevelling', 'levelling', 'leveling', 'raising', 'piering', 'piling', 'foundation', 'foundations', 'stumps', 'stump', 'slab'}
def query_tokens(name):
    """The 1-2 most distinctive tokens: non-stopword, longest first; fall back to a trade token if that is all there is."""
    toks = tokens(name)
    if toks:
        toks = sorted(set(toks), key=lambda t: (-len(t), t))[:2]
        return toks
    trade = [t for t in norm(name).split() if t in TRADE_TOKENS]
    return trade[:1]

def search(name):
    seen, out, status = set(), [], 200
    for tok in query_tokens(name):
        res, st = search_token(tok)
        if st != 200: status = st
        for r in res:
            if r.get('licenceId') not in seen: seen.add(r.get('licenceId')); out.append(r)
    return out, status

def details(rec):
    st, j = http('GET', f"{BASE}/licence/search/details/{urllib.parse.quote(rec['licenceType'])}/{urllib.parse.quote(rec['licenceId'])}")
    if st != 200: return None
    cd = j.get('componentData') or {}
    officers = []
    for role in cd.get('associatedRoles') or []:
        for p in role.get('parties') or []:
            if (p.get('partyType') or '') == 'Individual':
                officers.append({'name': p.get('name'), 'role': role.get('name'), 'suburb': p.get('suburb'), 'state': p.get('state'), 'start': p.get('start')})
    return {'officers': officers, 'classes': [c.get('name') for c in (cd.get('classes') or []) if c.get('isActive')], 'status': cd.get('status'), 'abn': cd.get('ABN'), 'acn': cd.get('ACN')}

def postcode_of(addr):
    m = re.search(r'\b(\d{4})\b', addr or ''); return m.group(1) if m else ''
def suburb_of(city):
    return norm(STATE_RE.sub('', city or ''))

def match(lead, results):
    """Return (record, basis, confidence) for the best acceptable licence, else None."""
    lname = norm(lead['name']); ltok = set(tokens(lead['name'])); lsub = suburb_of(lead.get('city')); lpc = postcode_of(lead.get('full_address'))
    best = None
    for r in results:
        if (r.get('status') or '') != 'Current': continue
        rname = norm(r.get('licensee')); rtok = set(tokens(r.get('licensee')))
        rsub = norm(r.get('suburb')); rpc = r.get('postcode') or ''
        loc = bool(lsub and rsub and (lsub == rsub or lsub in rsub or rsub in lsub)) or bool(lpc and rpc and lpc == rpc)
        shared = ltok & rtok
        if rname == lname: cand = (r, 'exact_title', 'matched', 3)
        elif ltok and rtok and (ltok <= rtok or rtok <= ltok):
            # a subset match on ONE short token ("adam john HOUSE" vs "sydney HOUSE levelling") is noise unless the location agrees
            distinctive = any(len(t) >= 5 for t in shared)
            if loc: cand = (r, 'name_overlap', 'matched', 2)
            elif len(shared) >= 2 or (distinctive and len(ltok) == len(shared)): cand = (r, 'name_only', 'low_confidence', 1)
            else: continue
        else: continue
        if not best or cand[3] > best[3]: best = cand
    return best

def record(lead, r, basis, conf, det):
    return {'place_id': lead['place_id'], 'lead_name': lead['name'], 'company': r.get('licensee'), 'number': r.get('licenceNumber'),
            'registry': 'nsw_fair_trading', 'confidence': conf, 'match_basis': basis, 'licence_type': r.get('licenceType'),
            'licence_status': r.get('status'), 'licensee_type': r.get('licenseeType'), 'suburb': r.get('suburb'), 'postcode': r.get('postcode'),
            'abn': (det or {}).get('abn') or r.get('ABN'), 'licence_classes': (det or {}).get('classes') or [],
            'officers': (det or {}).get('officers') or [], 'licence_id': r.get('licenceId')}

def work(lead):
    results, st = search(lead['name'])
    if st != 200: return {'place_id': lead['place_id'], 'lead_name': lead['name'], 'registry': 'nsw_fair_trading', 'confidence': 'error', 'http': st}
    m = match(lead, results)
    if not m:
        return {'place_id': lead['place_id'], 'lead_name': lead['name'], 'registry': 'nsw_fair_trading', 'confidence': 'no_match', 'candidates': len(results)}
    r, basis, conf, _ = m
    det = details(r)
    rec = record(lead, r, basis, conf, det)
    if r.get('licenseeType') == 'Individual' and not rec['officers']:
        rec['officers'] = [{'name': r.get('licensee'), 'role': 'Licensee', 'suburb': r.get('suburb'), 'state': r.get('state')}]
    return rec

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--probe', action='store_true'); ap.add_argument('--leads'); ap.add_argument('--out'); ap.add_argument('--all-states', action='store_true')
    ap.add_argument('--class-universe'); ap.add_argument('--workers', type=int, default=2); ap.add_argument('--limit', type=int, default=0)
    a = ap.parse_args()
    if a.probe:
        for lead in [{'place_id': 'probe-1', 'name': 'Underpinning Solutions Pty Ltd', 'city': 'Sans Souci NSW', 'full_address': 'Sans Souci NSW 2219'},
                     {'place_id': 'probe-2', 'name': 'Sydney House Levelling', 'city': 'Sydney NSW', 'full_address': ''},
                     {'place_id': 'probe-3', 'name': 'Buildfix', 'city': 'Seven Hills NSW', 'full_address': 'Seven Hills NSW 2147'}]:
            print(json.dumps(work(lead), ensure_ascii=False)[:900]); time.sleep(1)
        return
    if a.class_universe:
        out = []; cls = {"classCodes": ["HBS_CON_Underpinning and Piering", "AMR-TRADES-036"], "displayName": "Contractor Licence - Underpinning and Piering", "licenceTypes": ["Contractor Licence"]}
        for p in range(0, 40):
            st, j = http('POST', BASE + '/licence/search/advQuery', {"licenceGroup": "Trades", "search": "", "autoComplete": False, "pageNumber": p, "pageSize": 10, "licenceTypes": [], "status": ["Current"], "licenceClassSearch": [cls]})
            if st != 200: print('HTTP', st, j, file=sys.stderr); break
            out += j.get('results') or []
            if p + 1 >= int((j.get('pagingInfo') or {}).get('totalPages') or 1): break
            time.sleep(1)
        with open(a.class_universe, 'w', encoding='utf-8') as f:
            for r in out: f.write(json.dumps(r, ensure_ascii=False) + '\n')
        print(f'class universe: {len(out)} current Underpinning and Piering contractor licences -> {a.class_universe}')
        return
    csv.field_size_limit(10 ** 7)
    leads = list(csv.DictReader(open(a.leads, encoding='utf-8')))
    if not a.all_states:
        leads = [l for l in leads if 'NSW' in (STATE_RE.findall((l.get('city') or '') + ' ' + (l.get('full_address') or '')) or ['NSW' if not (l.get('city') or l.get('full_address')) else ''])]
    if a.limit: leads = leads[:a.limit]
    done = set()
    if os.path.exists(a.out):
        for ln in open(a.out, encoding='utf-8'):
            try: done.add(json.loads(ln)['place_id'])
            except Exception: pass
    todo = [l for l in leads if l['place_id'] not in done]
    print(f'NSW registry: {len(leads)} leads in scope, {len(done)} already done, {len(todo)} to search', file=sys.stderr)
    counts = {}
    with open(a.out, 'a', encoding='utf-8') as f, cf.ThreadPoolExecutor(max_workers=a.workers) as ex:
        for rec in ex.map(work, todo):
            f.write(json.dumps(rec, ensure_ascii=False) + '\n'); f.flush()
            counts[rec.get('confidence')] = counts.get(rec.get('confidence'), 0) + 1
            time.sleep(0.3)
    print('NSW registry result:', json.dumps(counts), file=sys.stderr)

if __name__ == '__main__':
    main()
