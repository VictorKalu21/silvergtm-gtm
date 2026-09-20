#!/usr/bin/env python3
"""registry_wa.py :: WA Building and Energy (DEMIRS) register of building contractors as the owner registry for WA leads.
RUN-FOLDER ONE-OFF. Probed 2026-09-20 (RUN-NOTES.md, "Western Australia"):

  https://contenthub.demirs.wa.gov.au/downloads/cals/BuilderRegister.pdf   (5.4 MB, 1,389 pages, refreshed daily,
  plain GET, no anti-bot). Four sections; SECTION 1 = current building contractors, fixed-width layout:
     STATUS | REG NO | FORMER REG NO | NAME OF ENTITY | BUSINESS ADDRESS | FIRST REGISTERED | NOMINATED SUPERVISOR
  The supervisor column reads "BP103981 - Woodruffe, Bryn John" (one per line; several lines = several supervisors).
  Every WA builder — underpinners included, WA has no underpinning class — must hold a BC registration with at least
  one nominated supervisor, so for a 3-10-person firm the supervisor is the owner (owner-prompt.md registry rule 2:
  owner_or_partner only with a second signal; else gm).

Modes:
  --parse <register.txt> --out <register.jsonl>      pdftotext -layout output -> one record per current contractor
  --leads <leads.csv> --register <register.jsonl> --out <registry_wa.jsonl> [--all-states]
                                                     name-join WA leads (state token WA) -> companies_house.jsonl-shaped
                                                     records (registry:"wa_building_energy", officers = nominated supervisors)
  --probe --register <register.jsonl>                three hand-picked names through the join (the 3-call rule, offline)

Acceptance (same rule as registry_nsw.py): exact_title -> matched; all distinctive tokens of the shorter name in the
longer AND suburb/postcode agree -> matched (name_overlap); token overlap without location -> low_confidence only when
>=2 tokens or one distinctive (>=5 chars) token covers the whole lead name; else no match.
"""
import re, json, csv, sys, argparse, os

STATE_RE = re.compile(r'\b(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\b')
STOP = {'pty', 'ltd', 'limited', 'p/l', 'the', 'and', '&', 'of', 'co', 'group', 'services', 'service', 'solutions', 'australia', 'australian', 'wa',
        'underpinning', 'restumping', 'reblocking', 'foundation', 'foundations', 'levelling', 'leveling', 'raising', 'repairs', 'repair',
        'building', 'builders', 'builder', 'construction', 'constructions', 'contractors', 'contractor', 'concrete', 'structural', 'remedial', 'piling',
        'piering', 'pier', 'piers', 'perth', 'inc', 'trust', 'house', 'houses', 'home', 'homes', 'level', 'levels', 'floor', 'floors', 'slab', 'slabs',
        'stump', 'stumps', 'crack', 'cracks', 'specialist', 'specialists', 'expert', 'experts', 'pro', 'pros', 'plus', 'total', 'all', 'best', 'top',
        'quality', 'affordable', 'reliable', 'east', 'west', 'north', 'south', 'eastern', 'western', 'northern', 'southern', 'bay', 'hills', 'valley',
        'regional', 'metro', 'city', 'developments', 'development', 'projects'}

def norm(s):
    s = re.sub(r'[^a-z0-9 ]+', ' ', (s or '').lower().replace('&', ' and '))
    return ' '.join(s.split())
def tokens(s):
    return [t for t in norm(s).split() if t not in STOP and len(t) > 1]

# ---- parse -----------------------------------------------------------------------------------------------------
def col_positions(header):
    names = ['STATUS', 'REG NO', 'FORMER', 'NAME OF ENTITY', 'BUSINESS ADDRESS', 'FIRST', 'NOMINATED SUPERVISOR']
    if not all(n in header for n in names): return None   # sections 2-4 (practitioners / expired) use other columns
    return {n: header.index(n) for n in names}

def parse(txt_path):
    lines = open(txt_path, encoding='utf-8', errors='replace').read().split('\n')
    recs, cur, pos, section = [], None, None, None
    for ln in lines:
        s = ln.rstrip('\n')
        m = re.match(r'\s*SECTION (\d) - ', s)
        if m: section = int(m.group(1)); continue
        if 'STATUS' in s and 'REG NO' in s and 'NAME OF ENTITY' in s:
            pos = col_positions(s); continue
        if section != 1 or not pos: continue
        if not s.strip() or re.match(r'\s*\d\d/\d\d/\d\d\s+Page \d+', s) or s.strip().startswith('REGISTER OF') or s.strip().startswith('Notes') or s.strip().startswith('REG NO') or s.strip().startswith('REGISTERED'):
            if cur and not s.strip(): recs.append(cur); cur = None
            continue
        P = pos
        def seg(a, b): return s[a:b].strip() if len(s) > a else ''
        status = seg(P['STATUS'], P['REG NO']); reg = seg(P['REG NO'], P['FORMER']); name = seg(P['NAME OF ENTITY'], P['BUSINESS ADDRESS'])
        addr = seg(P['BUSINESS ADDRESS'], P['FIRST']); first = seg(P['FIRST'], P['NOMINATED SUPERVISOR']); sup = seg(P['NOMINATED SUPERVISOR'], 10 ** 6)
        if status in ('Current', 'Expired', 'Suspended', 'Cancelled') and reg:
            if cur: recs.append(cur)
            cur = {'status': status, 'reg_no': reg, 'name': name, 'address': addr, 'first_registered': first, 'supervisors': []}
            if sup: cur['supervisors'].append(sup)
        elif cur:
            if name: cur['name'] = (cur['name'] + ' ' + name).strip()
            if addr: cur['address'] = (cur['address'] + ' ' + addr).strip()
            if sup: cur['supervisors'].append(sup)
    if cur: recs.append(cur)
    for r in recs:
        # a registration's conditions text ("Restricted to: ...") can bleed into the NAME column on wrapped rows — cut it
        r['name'] = re.split(r'\s+Restricted to:?', r['name'], 1)[0].strip()
        # single-line rows overflow the FIRST REGISTERED date into the address column ("BICTON WA 6157 10/11/2020"): strip it
        r['address'] = re.sub(r'\s*\b\d\d/\d\d/\d{4}\b', '', ' '.join(r['address'].split())).strip()
        m = re.search(r'([A-Z][A-Z \'-]+?)\s+WA\s+(\d{4})\b', r['address']); r['suburb'] = (m.group(1).strip() if m else ''); r['postcode'] = (m.group(2) if m else '')
        offs = []
        for x in r['supervisors']:
            mm = re.match(r'(BP\d+)\s*-\s*(.+)$', x)
            if not mm: continue
            nm = mm.group(2).strip()
            if ',' in nm:
                sur, fore = [t.strip() for t in nm.split(',', 1)]
                nm = (fore.split()[0] + ' ' + sur.title()) if fore else sur.title()
            offs.append({'name': nm, 'role': 'Nominated supervisor', 'bp': mm.group(1)})
        r['officers'] = offs
    return recs

# ---- join ------------------------------------------------------------------------------------------------------
def postcode_of(addr):
    m = re.search(r'\b(\d{4})\b', addr or ''); return m.group(1) if m else ''
def suburb_of(city):
    return norm(STATE_RE.sub('', city or ''))

def match(lead, register_index):
    lname = norm(lead['name']); ltok = set(tokens(lead['name'])); lsub = suburb_of(lead.get('city')); lpc = postcode_of(lead.get('full_address'))
    cands = set()
    for t in ltok: cands.update(register_index['by_token'].get(t, []))
    if not ltok: cands.update(register_index['by_name'].get(lname, []))
    best = None
    for i in cands:
        r = register_index['recs'][i]
        if r['status'] != 'Current': continue
        rname = norm(r['name']); rtok = set(tokens(r['name'])); rsub = norm(r['suburb']); rpc = r['postcode']
        loc = bool(lsub and rsub and (lsub == rsub or lsub in rsub or rsub in lsub)) or bool(lpc and rpc and lpc == rpc)
        shared = ltok & rtok
        if rname == lname: cand = (r, 'exact_title', 'matched', 3)
        elif ltok and rtok and (ltok <= rtok or rtok <= ltok):
            distinctive = any(len(t) >= 5 for t in shared)
            if loc: cand = (r, 'name_overlap', 'matched', 2)
            elif len(shared) >= 2 or (distinctive and len(ltok) == len(shared)): cand = (r, 'name_only', 'low_confidence', 1)
            else: continue
        else: continue
        if not best or cand[3] > best[3]: best = cand
    return best

def build_index(recs):
    by_token, by_name = {}, {}
    for i, r in enumerate(recs):
        for t in set(tokens(r['name'])): by_token.setdefault(t, []).append(i)
        by_name.setdefault(norm(r['name']), []).append(i)
    return {'recs': recs, 'by_token': by_token, 'by_name': by_name}

def record(lead, r, basis, conf):
    return {'place_id': lead['place_id'], 'lead_name': lead['name'], 'company': r['name'], 'number': r['reg_no'], 'registry': 'wa_building_energy',
            'confidence': conf, 'match_basis': basis, 'licence_status': r['status'], 'suburb': r['suburb'], 'postcode': r['postcode'],
            'first_registered': r['first_registered'], 'officers': r['officers']}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--parse'); ap.add_argument('--register'); ap.add_argument('--leads'); ap.add_argument('--out'); ap.add_argument('--probe', action='store_true'); ap.add_argument('--all-states', action='store_true')
    a = ap.parse_args()
    if a.parse:
        recs = parse(a.parse)
        with open(a.out, 'w', encoding='utf-8') as f:
            for r in recs: f.write(json.dumps(r, ensure_ascii=False) + '\n')
        cur = [r for r in recs if r['status'] == 'Current']
        print(f'WA register: {len(recs)} section-1 records, {len(cur)} current, {sum(1 for r in cur if r["officers"])} with a nominated supervisor, {sum(1 for r in cur if r["postcode"])} with a parsed WA postcode -> {a.out}')
        return
    recs = [json.loads(l) for l in open(a.register, encoding='utf-8') if l.strip()]
    idx = build_index(recs)
    if a.probe:
        for lead in [{'place_id': 'p1', 'name': 'Future Foundations Group', 'city': 'Midland WA', 'full_address': '26c Mathoura St, Midland WA 6056'},
                     {'place_id': 'p2', 'name': '101 Residential', 'city': 'Osborne Park WA', 'full_address': ''},
                     {'place_id': 'p3', 'name': 'Perth Underpinning Specialists', 'city': 'Perth WA', 'full_address': ''}]:
            m = match(lead, idx)
            print(json.dumps(record(lead, *m[:3]) if m else {'lead': lead['name'], 'confidence': 'no_match'}, ensure_ascii=False)[:600])
        return
    csv.field_size_limit(10 ** 7)
    leads = list(csv.DictReader(open(a.leads, encoding='utf-8')))
    if not a.all_states:
        leads = [l for l in leads if 'WA' in STATE_RE.findall((l.get('city') or '') + ' ' + (l.get('full_address') or ''))]
    counts = {}
    with open(a.out, 'w', encoding='utf-8') as f:
        for lead in leads:
            m = match(lead, idx)
            rec = record(lead, *m[:3]) if m else {'place_id': lead['place_id'], 'lead_name': lead['name'], 'registry': 'wa_building_energy', 'confidence': 'no_match'}
            f.write(json.dumps(rec, ensure_ascii=False) + '\n'); counts[rec['confidence']] = counts.get(rec['confidence'], 0) + 1
    print(f'WA registry join: {len(leads)} WA leads -> {json.dumps(counts)} -> {a.out}', file=sys.stderr)

if __name__ == '__main__':
    main()
