#!/usr/bin/env python3
"""Assemble the run deliverable — ported from
clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/assemble_deliverable.py for the 2026-09-20
AU MAPS run. One row per qualified lead with the best email, the named decision-maker, the role
bucket, the evidence and the QA flags.

What changed from the UK version:
  * ONE segment (leads_qualified_contacts.csv, written by rank_emails_au.js). The AU run has no
    damp-only segment; the two house-raising-only rows live in leads_house_raising_only.csv and are
    not a deliverable segment.
  * Contact sources, in precedence: `read` (site text + NSW/WA registry) -> `read_residue` (the
    Firecrawl-recovered sites) -> `eponym` (owner-prompt rule 1 applied deterministically by
    filter_contacts_au.py) -> `sweep` (web search, weakest). A missing file is skipped with a note.
  * The registry QA (`same_company`) reads registry_matched.jsonl / registry_lowconf.jsonl, whose
    records already carry `ch_company` (prep-owner-batches --ch shape). AU stop-words.
  * `state` column (token in city/address, else blank), no UK-only columns.
  * Email columns come from rank_emails_au.js: email, email_type, email_own_domain, email_own_basis,
    email_person_shape, email_source, first_name_hint/last_name_hint, all_emails, site_emails_all,
    emails_from_rep.

Outputs (deliverable/):
  atlas_au_foundation_repair_maps_qualified.csv   one row per lead
  contacts_all.csv                                every kept contact
  verify_input.csv                                `Email` — one row per UNIQUE best email. VERIFICATION
                                                  SPENDS CREDITS AND NEEDS AN EXPLICIT OPERATOR GO.
  emails_final_unverified.csv                     build-plusvibe `base` input shape with `verdict` blank
  leads_unnamed.csv                               leads still without a named decision-maker
Usage:  python3 assemble_deliverable_au.py
"""
import csv, json, re, os, collections

HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
os.makedirs('deliverable', exist_ok=True)
csv.field_size_limit(10 ** 7)

LEADS_IN = 'leads_qualified_contacts.csv'
SOURCES = [('read',         'owner/contacts_read.jsonl',         ['registry_matched.jsonl', 'registry_lowconf.jsonl']),
           ('read_residue', 'owner/contacts_read_residue.jsonl', ['registry_matched.jsonl', 'registry_lowconf.jsonl']),
           ('eponym',       'owner/contacts_eponym.jsonl',       []),
           ('sweep',        'owner/contacts_sweep.jsonl',        [])]
STATE_RE = re.compile(r'\b(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\b')
STOP = {'pty', 'ltd', 'limited', 'p/l', 'the', 'and', 'co', 'au', 'company', 'services', 'service', 'group', 'solutions', 'specialists', 'specialist',
        'building', 'builders', 'construction', 'constructions', 'remedial', 'foundation', 'foundations', 'underpinning', 'restumping', 'reblocking',
        'levelling', 'raising', 'house', 'home', 'trustee', 'for', 'australia', 'australian', 'property', 'projects', 'contractors', 'concrete', 'structural'}

def core(s): return {t for t in re.sub(r"[^a-z0-9 ]", " ", (s or '').lower().replace('&', ' and ')).split() if t not in STOP}
def same_company(chn, biz):
    a, b = core(chn), core(biz)
    if a & b: return True
    sa = re.sub(r"[^a-z0-9]", "", re.sub(r"\b(pty|ltd|limited|the|trustee|for)\b", "", chn.lower().replace('&', 'and')))
    sb = re.sub(r"[^a-z0-9]", "", re.sub(r"\b(pty|ltd|limited|the|trustee|for)\b", "", biz.lower().replace('&', 'and')))
    return bool(sa and sb) and (sa in sb or sb in sa)
def natural(n):
    if ',' in n:
        sur, fore = [x.strip() for x in n.split(',', 1)]
        return (fore.split()[0].title() if fore else ''), sur.title()
    p = n.split(); return (p[0], ' '.join(p[1:])) if len(p) > 1 else (n, '')
# state: the token in city / full_address; else the coordinate box (gen-runsheet-au.js STATE_BOX; boxes overlap, so
# the token wins and the box is a guess flagged state_from_coords); the country-centroid placeholder gives nothing.
STATE_BOX = {'NSW': ((-37.6, -28.1), (140.9, 153.7)), 'VIC': ((-39.2, -33.9), (140.9, 150.0)), 'QLD': ((-29.2, -10.0), (137.9, 153.6)),
             'WA': ((-35.2, -13.6), (112.9, 129.1)), 'SA': ((-38.1, -25.9), (129.0, 141.1)), 'TAS': ((-43.7, -39.5), (143.8, 148.5)),
             'ACT': ((-35.95, -35.1), (148.7, 149.4)), 'NT': ((-26.1, -10.9), (129.0, 138.1))}
BOX_ORDER = ['ACT', 'TAS', 'VIC', 'NSW', 'QLD', 'SA', 'NT', 'WA']   # small / specific boxes first where they overlap
CENTROID = (-32.2054, 136.1074)
def state_of(r):
    m = STATE_RE.findall((r.get('city') or '') + ' ' + (r.get('full_address') or ''))
    if m: return m[-1], ''
    try: la, ln = float(r.get('latitude') or 'x'), float(r.get('longitude') or 'x')
    except ValueError: return '', ''
    if abs(la - CENTROID[0]) < 0.01 and abs(ln - CENTROID[1]) < 0.01: return '', ''
    for st in BOX_ORDER:
        (a, b), (c, d) = STATE_BOX[st]
        if a <= la <= b and c <= ln <= d: return st, 'state_from_coords'
    return '', ''

BUCKET_ORDER = ['owner_or_partner', 'gm', 'marketing', 'sales_manager', 'office_manager', 'other']
DEPARTED = re.compile(r"\b(former|retired|ex-|late)\b", re.I)

def jsonl(path, key='place_id'):
    m = {}
    if not os.path.exists(path): return m
    for ln in open(path, encoding='utf-8'):
        ln = ln.strip()
        if ln:
            d = json.loads(ln)
            if d.get(key): m[d[key]] = d
    return m

reads, ch_by_src, missing = {}, {}, []
for name, path, chfiles in SOURCES:
    if not os.path.exists(path): missing.append(path)
    reads[name] = jsonl(path)
    ch = {}
    for f in chfiles:
        for pid, d in jsonl(f).items():
            if d.get('ch_company') and pid not in ch: ch[pid] = d['ch_company']
    ch_by_src[name] = ch

leads = list(csv.DictReader(open(LEADS_IN, encoding='utf-8')))
rows, contacts, dropped_examples, unnamed = [], [], [], []
st = collections.Counter()
for r in leads:
    pid = r['place_id']
    row = {}
    for k in ('place_id', 'name', 'icp_type', 'google_types', 'full_address', 'city'):
        row[k] = r.get(k, '')
    row['state'], st_flag = state_of(r)
    for k in ('zip', 'neighborhood', 'phone_number', 'website', 'root_domain', 'rating', 'review_count', 'location_count', 'is_multi_location',
              'brand_family', 'tier', 'service_bucket', 'matched_terms', 'adjudication', 'adjudication_reason', 'site_status',
              'email', 'email_type', 'email_own_domain', 'email_own_basis', 'email_person_shape', 'email_source', 'emails_from_rep', 'all_emails', 'site_emails_all'):
        row[k] = r.get(k, '')
    qa = [x.strip() for x in (r.get('qa_flags') or '').split(';') if x.strip()] + ([st_flag] if st_flag else [])

    cs, src_file = [], ''
    for name, _, _ in SOURCES:
        d = reads[name].get(pid)
        if not d or not d.get('contacts'): continue
        chn_default = ch_by_src[name].get(pid, '')
        cand, dropped_here = [], []
        for x in d.get('contacts') or []:
            nm = (x.get('name') or '').strip()
            if not nm: continue
            if ',' in nm:
                fn_, ln_ = natural(nm); nm = (fn_ + ' ' + ln_).strip()
            ev = x.get('evidence') or ''
            if DEPARTED.search(ev[:60]): dropped_here.append('departed:' + nm); continue
            csrc = x.get('source') or ''
            if csrc.startswith('companies_house') or csrc == 'registry':
                chn = chn_default
                if chn and not same_company(chn, r['name']):
                    dropped_here.append('dropped_registry_name_mismatch:' + chn + '->' + nm)
                    if len(dropped_examples) < 25: dropped_examples.append((r['name'], chn, nm))
                    continue
                csrc = 'registry'
            b = x.get('role_bucket') or 'other'
            title = x.get('title') or ''
            if csrc == 'web_search' and re.search(r"managing director|\bdirector\b|proprietor|owner|founder|principal", title, re.I): b = 'owner_or_partner'
            cand.append({'name': nm, 'first_name': x.get('first_name') or nm.split()[0], 'last_name': ' '.join(nm.split()[1:]),
                         'title': title, 'role_bucket': b, 'source': csrc or ('web_search' if name == 'sweep' else 'model_read'), 'evidence': ev})
        if cand:
            cand.sort(key=lambda x: BUCKET_ORDER.index(x['role_bucket']) if x['role_bucket'] in BUCKET_ORDER else 9)
            cs, src_file = cand, name; qa += dropped_here; break
        qa += dropped_here

    prim = next((x for x in cs if x['role_bucket'] != 'other'), None)
    if cs and not prim: qa.append('only_non_decision_maker_contact')
    if prim and (prim['source'] == 'web_search' or src_file == 'sweep'): qa.append('sweep_named_verify_before_send')
    if prim and src_file == 'eponym': qa.append('name_from_business_name')
    if row['brand_family'] and not any(x.startswith('brand:') for x in qa): qa.append('brand:' + row['brand_family'])
    if row['adjudication'] == 'unclear' and 'icp_unclear' not in qa: qa.append('icp_unclear')
    if row['email_own_basis'] == 'sibling': qa.append('email_sibling_domain')
    if row['email_own_basis'] == 'name_match': qa.append('email_name_matched_domain')
    if row['emails_from_rep'] == 'Y': qa.append('email_from_domain_rep')

    if row['email_type'] == 'person' and cs:
        loc = row['email'].split('@')[0].lower()
        m = [x for x in cs if x['name'].split()[-1].lower() in loc and len(x['name'].split()[-1]) > 2] or \
            [x for x in cs if x['first_name'].lower() == loc or (len(x['first_name']) > 2 and loc.startswith(x['first_name'].lower()))]
        if m: prim = m[0]; qa.append('email_matches_named_contact')

    if prim:
        row.update({'primary_name': prim['name'], 'first_name': prim['first_name'], 'last_name': prim['last_name'], 'primary_title': prim['title'],
                    'role_bucket': prim['role_bucket'], 'name_source': prim['source'], 'name_source_file': src_file, 'name_evidence': prim['evidence'][:300]})
    elif row['email_type'] == 'person' and r.get('first_name_hint'):
        row.update({'primary_name': (r['first_name_hint'] + ' ' + r.get('last_name_hint', '')).strip(), 'first_name': r['first_name_hint'],
                    'last_name': r.get('last_name_hint', ''), 'primary_title': '', 'role_bucket': '', 'name_source': 'email_local_part:' + (r.get('email_person_shape') or ''),
                    'name_source_file': '', 'name_evidence': row['email']})
        qa.append('name_from_email_only')
    else:
        row.update({'primary_name': '', 'first_name': '', 'last_name': '', 'primary_title': '', 'role_bucket': '', 'name_source': '', 'name_source_file': '', 'name_evidence': ''})
        unnamed.append(row)

    row['other_contacts'] = ' || '.join(f"{x['name']} [{x['title']} -> {x['role_bucket']}]" for x in cs[1:5] if x is not prim)
    seen_f = set(); row['qa_flags'] = '; '.join(x for x in qa if not (x in seen_f or seen_f.add(x)))
    rows.append(row)
    for x in cs:
        contacts.append({'place_id': pid, 'business': r['name'], 'city': r.get('city', ''), 'state': row['state'], 'root_domain': r.get('root_domain', ''),
                         'source_file': src_file, 'is_primary': 'Y' if x is prim else '', **{k: x[k] for k in ('name', 'first_name', 'last_name', 'title', 'role_bucket', 'source')},
                         'evidence': x['evidence'][:400]})
    named, mail = bool(row['primary_name']), bool(row['email'])
    st['leads'] += 1; st['named'] += named; st['named+email'] += (named and mail); st['email_no_name'] += (mail and not named)
    st['name_no_email'] += (named and not mail); st['neither'] += (not named and not mail); st['email'] += mail
    st['person_email'] += (row['email_type'] == 'person'); st['brand'] += bool(row['brand_family'])
    st['registry_mismatch_dropped'] += ('dropped_registry_name_mismatch' in row['qa_flags'])

LEADS_OUT = 'deliverable/atlas_au_foundation_repair_maps_qualified.csv'
cols = list(rows[0].keys())
with open(LEADS_OUT, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(rows)
with open('deliverable/contacts_all.csv', 'w', newline='', encoding='utf-8') as f:
    ccols = list(contacts[0].keys()) if contacts else ['place_id']
    w = csv.DictWriter(f, fieldnames=ccols); w.writeheader(); w.writerows(contacts)
with open('deliverable/leads_unnamed.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(unnamed)
seen, vrows = set(), []
for r in rows:
    e = r['email']
    if e and e not in seen:
        seen.add(e); vrows.append([e, r['place_id'], r['name'], r['first_name'], r['last_name'], r['email_type']])
with open('deliverable/verify_input.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f); w.writerow(['Email', 'place_id', 'business', 'first_name', 'last_name', 'email_type']); w.writerows(vrows)
BASE_COLS = ['place_id', 'email', 'verdict', 'email_kind', 'found_by', 'contact_name']
with open('deliverable/emails_final_unverified.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=BASE_COLS); w.writeheader()
    for r in rows:
        if r['email']:
            w.writerow({'place_id': r['place_id'], 'email': r['email'], 'verdict': '', 'email_kind': 'personal' if r['email_type'] == 'person' else 'company',
                        'found_by': r['email_source'] or 'site_harvest', 'contact_name': r['primary_name']})

if missing: print('NOTE: not on disk yet, skipped:', ', '.join(missing))
print('=' * 96)
print('leads %d · named %d (%.1f%%) · email %d (%.1f%%) · named+email %d (%.1f%%) · email_no_name %d · name_no_email %d · neither %d · person_email %d · brand %d' % (
    st['leads'], st['named'], 100.0 * st['named'] / st['leads'], st['email'], 100.0 * st['email'] / st['leads'], st['named+email'], 100.0 * st['named+email'] / st['leads'],
    st['email_no_name'], st['name_no_email'], st['neither'], st['person_email'], st['brand']))
print('by state (leads / named / email):', sorted(collections.Counter((r['state'] or '?') for r in rows).items(), key=lambda x: -x[1]))
print('   named  :', sorted(collections.Counter((r['state'] or '?') for r in rows if r['primary_name']).items(), key=lambda x: -x[1]))
print('   email  :', sorted(collections.Counter((r['state'] or '?') for r in rows if r['email']).items(), key=lambda x: -x[1]))
print('contacts rows', len(contacts), '| verify_input rows', len(vrows), '| emails_final_unverified rows', sum(1 for r in rows if r['email']), '| unnamed', len(unnamed))
print('name source file', collections.Counter(r['name_source_file'] for r in rows if r['primary_name']).most_common())
print('name source     ', collections.Counter(r['name_source'].split(':')[0] for r in rows if r['primary_name']).most_common())
print('role buckets    ', collections.Counter(r['role_bucket'] for r in rows if r['primary_name']).most_common())
print('email types     ', collections.Counter(r['email_type'] for r in rows).most_common())
print('email basis     ', collections.Counter(r['email_own_basis'] for r in rows if r['email']).most_common())
print('registry name mismatches dropped', st['registry_mismatch_dropped'], '— examples:')
for b, chn, nm in dropped_examples[:8]: print('   %-44s registry %-44s -> %s' % (b[:44], chn[:44], nm))
fl = collections.Counter()
for r in rows:
    for x in r['qa_flags'].split('; '):
        if x: fl[x.split(':')[0]] += 1
print('qa flags        ', fl.most_common())
print('->', LEADS_OUT)
