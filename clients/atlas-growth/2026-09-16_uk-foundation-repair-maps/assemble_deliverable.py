"""Assemble the run deliverable — ported from
clients/atlas-growth/2026-09-16_uk-foundation-repair/assemble_deliverable.py for the 2026-09-16 UK
MAPS run. One row per lead across BOTH segments, with the best email, the named decision-maker, the
role bucket, the evidence and the QA flags.

What moved from the export run's version:

  * **Both segments, one file.** The export run assembled `leads_qualified.csv` alone. This run has
    a second segment (`leads_damp_only`, 174 rows) that is a real part of the deliverable, so the
    leads CSV carries a `segment` column and the funnel is printed per segment.
  * **Contacts come from four read files, in the SWEEP-PLAN precedence** — `contacts_read` (site
    text + registry) -> `contacts_read_chonly` (registry only) -> `contacts_read_pass2` (the looser
    pass-2 registry match) -> `contacts_sweep` (web search, weakest). That is the same precedence
    `combine-owner-contacts.js` applies, reproduced here so the Companies-House QA below can fall
    THROUGH: when every contact a source offers is dropped as a name mismatch, the next source gets
    its turn instead of the lead going unnamed. A missing file is skipped with a note (the sweep is
    merged tranche by tranche, so this script is re-run after each merge).
  * **`same_company()` and `natural()` are kept verbatim.** `same_company()` is the second net over
    the low-confidence registry matches; `natural()` converts a surname-first registry name
    (`BIRD, Martin Paul` -> `Martin Bird`) and is applied defensively, since `merge-owner-reads.js`
    has usually done it already.
  * **Column shapes**: `domain` -> `root_domain`, no `region`/`state` (UK), no `email_maps`
    (a live scraper.tech pull returns no email field), plus this run's `email_own_basis` /
    `email_person_shape` from `rerank_emails.py`.
  * **The lead's own `qa_flags` are carried through and merged**, not overwritten — the upstream
    stages already wrote `icp_unclear`, `damp_only_no_structural`, `unrated_track`,
    `verdict_from_sibling:*`, `tier_d_sampled_unclear`, `brand:*` there.

Outputs (all under deliverable/):
  atlas_uk_foundation_repair_maps_qualified.csv   one row per lead, both segments
  contacts_all.csv                                every kept contact, one row each
  verify_input.csv                                column `Email` — the MillionVerifier->BounceBan
                                                  runner's input; one row per UNIQUE best email
                                                  across both segments. VERIFICATION SPENDS CREDITS
                                                  AND NEEDS AN EXPLICIT OPERATOR GO.
  emails_final_unverified.csv                     the build-plusvibe `base` input shape
                                                  (place_id,email,verdict,email_kind,found_by,contact_name)
                                                  with `verdict` LEFT BLANK. `apply_verify.py` fills
                                                  it from the verifier's <stem>_full.csv and writes
                                                  emails_final.csv; build-plusvibe base keeps only
                                                  verdict == sendable, so it must be filled first.

Usage:  python3 assemble_deliverable.py
"""
import csv, json, re, os, collections

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
os.makedirs('deliverable', exist_ok=True)
csv.field_size_limit(10 ** 7)

SEGMENTS = [('qualified', 'leads_qualified_contacts.csv'),
            ('damp_only', 'leads_damp_only_contacts.csv')]
# precedence: SWEEP-PLAN.md "Combine" — richest evidence first, web search last
SOURCES = [('read',        'owner/contacts_read.jsonl',        ['owner/companies_house.jsonl', 'owner/companies_house_lowconf.jsonl']),
           ('read_chonly', 'owner/contacts_read_chonly.jsonl', ['owner/companies_house.jsonl', 'owner/companies_house_lowconf.jsonl']),
           ('read_pass2',  'owner/contacts_read_pass2.jsonl',  ['owner/companies_house_pass2.jsonl']),
           ('sweep',       'owner/contacts_sweep.jsonl',       [])]

# ---------------------------------------------------------------------------
# the export run's QA helpers, verbatim
# ---------------------------------------------------------------------------
STOP = {'ltd', 'limited', 'llp', 'plc', 'the', 'and', 'co', 'uk', 'company', 'services', 'service',
        'group', 'damp', 'proofing', 'waterproofing', 'solutions', 'specialists', 'specialist',
        'building', 'builders', 'construction', 'preservation', 'remedial', 'remedials',
        'treatments', 'property', 'maintenance'}


def core(s):
    return {t for t in re.sub(r"[^a-z0-9 ]", " ", (s or '').lower().replace('&', ' and ')).split() if t not in STOP}


def same_company(chn, biz):
    a, b = core(chn), core(biz)
    if a & b:
        return True
    sa = re.sub(r"[^a-z0-9]", "", re.sub(r"\b(ltd|limited|llp|plc|the)\b", "", chn.lower().replace('&', 'and')))
    sb = re.sub(r"[^a-z0-9]", "", re.sub(r"\b(ltd|limited|llp|plc|the)\b", "", biz.lower().replace('&', 'and')))
    return bool(sa and sb) and (sa in sb or sb in sa)


def natural(n):
    """'BIRD, Martin Paul' -> ('Martin','Bird'). Already-natural names pass through."""
    if ',' in n:
        sur, fore = [x.strip() for x in n.split(',', 1)]
        return (fore.split()[0].title() if fore else ''), sur.title()
    p = n.split()
    return (p[0], ' '.join(p[1:])) if len(p) > 1 else (n, '')


BUCKET_ORDER = ['owner_or_partner', 'gm', 'marketing', 'sales_manager', 'office_manager', 'other']
DEPARTED = re.compile(r"\b(former|retired|ex-)\b", re.I)

# ---------------------------------------------------------------------------
# load
# ---------------------------------------------------------------------------
def jsonl(path, key='place_id'):
    m = {}
    if not os.path.exists(path):
        return m
    for ln in open(path, encoding='utf-8'):
        ln = ln.strip()
        if ln:
            d = json.loads(ln)
            if d.get(key):
                m[d[key]] = d
    return m


reads, ch_by_src, missing = {}, {}, []
for name, path, chfiles in SOURCES:
    if not os.path.exists(path):
        missing.append(path)
    reads[name] = jsonl(path)
    ch = {}
    for f in chfiles:
        for pid, d in jsonl(f).items():
            if d.get('ch_company') and pid not in ch:
                ch[pid] = d['ch_company']
    ch_by_src[name] = ch

rows, contacts, dropped_examples = [], [], []
per_seg = {}

for segment, fn in SEGMENTS:
    leads = list(csv.DictReader(open(fn, encoding='utf-8')))
    st = collections.Counter()
    for r in leads:
        pid = r['place_id']
        row = {'segment': segment}
        for k in ('place_id', 'name', 'icp_type', 'google_types', 'full_address', 'city', 'zip',
                  'neighborhood', 'phone_number', 'website', 'root_domain', 'rating', 'review_count',
                  'location_count', 'is_multi_location', 'brand_family', 'tier', 'service_bucket',
                  'matched_terms', 'adjudication', 'adjudication_reason', 'site_status'):
            row[k] = r.get(k, '')
        for k in ('email', 'email_type', 'email_own_domain', 'email_own_basis', 'email_person_shape',
                  'email_source', 'email_deep_source', 'emails_from_rep', 'all_emails', 'site_emails_all'):
            row[k] = r.get(k, '')

        qa = [x.strip() for x in (r.get('qa_flags') or '').split(';') if x.strip()]

        # ---- contacts: first source (in precedence order) that survives the QA ----------------
        cs, src_file = [], ''
        for name, _, _ in SOURCES:
            d = reads[name].get(pid)
            if not d or not d.get('primary_name'):
                continue
            chn_default = ch_by_src[name].get(pid, '')
            cand, dropped_here = [], []
            for x in d.get('contacts') or []:
                nm = (x.get('name') or '').strip()
                if not nm:
                    continue
                fn_, ln_ = natural(nm)
                nm = (fn_ + ' ' + ln_).strip() if ',' in (x.get('name') or '') else nm
                ev = x.get('evidence') or ''
                if DEPARTED.search(ev[:60]):
                    dropped_here.append('departed:' + nm)
                    continue
                csrc = x.get('source') or ''
                if csrc.startswith('companies_house'):
                    m = re.search(r"Companies House[^:]*:\s*([^(]+)\(", ev)
                    chn = (m.group(1).strip() if m else chn_default)
                    if chn and not same_company(chn, r['name']):
                        dropped_here.append('dropped_ch_name_mismatch:' + chn + '->' + nm)
                        if len(dropped_examples) < 25:
                            dropped_examples.append((r['name'], chn, nm))
                        continue
                b = x.get('role_bucket') or 'other'
                title = x.get('title') or ''
                if csrc == 'web_search' and re.search(r"managing director|\bdirector\b|proprietor|owner|founder", title, re.I):
                    b = 'owner_or_partner'
                cand.append({'name': nm,
                             'first_name': x.get('first_name') or nm.split()[0],
                             'last_name': ' '.join(nm.split()[1:]),
                             'title': title, 'role_bucket': b,
                             'source': csrc or ('web_search' if name == 'sweep' else 'model_read'),
                             'evidence': ev})
            if cand:
                cand.sort(key=lambda x: BUCKET_ORDER.index(x['role_bucket']) if x['role_bucket'] in BUCKET_ORDER else 9)
                cs, src_file = cand, name
                qa += dropped_here
                break
            qa += dropped_here      # every contact this source offered was dropped — fall through

        prim = next((x for x in cs if x['role_bucket'] != 'other'), None)
        if cs and not prim:
            qa.append('only_non_decision_maker_contact')
        if prim and (prim['source'] == 'web_search' or src_file == 'sweep'):
            qa.append('sweep_named_verify_before_send')
        if row['brand_family'] and not any(x.startswith('brand:') for x in qa):
            qa.append('brand:' + row['brand_family'])
        if row['adjudication'] == 'unclear' and 'icp_unclear' not in qa:
            qa.append('icp_unclear')
        if row['email_own_basis'] == 'sibling':
            qa.append('email_sibling_domain')

        # a person-shaped local part that matches a named contact's surname picks that contact
        if row['email_type'] == 'person' and cs:
            loc = row['email'].split('@')[0].lower()
            m = [x for x in cs if x['name'].split()[-1].lower() in loc and len(x['name'].split()[-1]) > 2]
            if m:
                prim = m[0]
                qa.append('email_matches_named_contact')

        if prim:
            row.update({'primary_name': prim['name'], 'first_name': prim['first_name'],
                        'last_name': prim['last_name'], 'primary_title': prim['title'],
                        'role_bucket': prim['role_bucket'], 'name_source': prim['source'],
                        'name_source_file': src_file, 'name_evidence': prim['evidence'][:300]})
        elif row['email_type'] == 'person' and r.get('first_name_hint'):
            row.update({'primary_name': (r['first_name_hint'] + ' ' + r.get('last_name_hint', '')).strip(),
                        'first_name': r['first_name_hint'], 'last_name': r.get('last_name_hint', ''),
                        'primary_title': '', 'role_bucket': '',
                        'name_source': 'email_local_part:' + (r.get('name_confidence') or ''),
                        'name_source_file': '', 'name_evidence': (r.get('name_evidence') or '')[:300]})
            qa.append('name_from_email_only')
        else:
            row.update({'primary_name': '', 'first_name': '', 'last_name': '', 'primary_title': '',
                        'role_bucket': '', 'name_source': '', 'name_source_file': '', 'name_evidence': ''})

        row['other_contacts'] = ' || '.join(f"{x['name']} [{x['title']} -> {x['role_bucket']}]"
                                            for x in cs[1:5] if x is not prim)
        seen_f = set()
        row['qa_flags'] = '; '.join(x for x in qa if not (x in seen_f or seen_f.add(x)))
        rows.append(row)
        for x in cs:
            contacts.append({'place_id': pid, 'segment': segment, 'business': r['name'],
                             'city': r.get('city', ''), 'root_domain': r.get('root_domain', ''),
                             'source_file': src_file, 'is_primary': 'Y' if x is prim else '',
                             **{k: x[k] for k in ('name', 'first_name', 'last_name', 'title', 'role_bucket', 'source')},
                             'evidence': x['evidence'][:400]})
        named, mail = bool(row['primary_name']), bool(row['email'])
        st['leads'] += 1
        st['named'] += named
        st['named+email'] += (named and mail)
        st['email_no_name'] += (mail and not named)
        st['name_no_email'] += (named and not mail)
        st['neither'] += (not named and not mail)
        st['email'] += mail
        st['person_email'] += (row['email_type'] == 'person')
        st['brand'] += bool(row['brand_family'])
        st['ch_mismatch_dropped'] += ('dropped_ch_name_mismatch' in row['qa_flags'])
    per_seg[segment] = st

# ---------------------------------------------------------------------------
# write
# ---------------------------------------------------------------------------
LEADS_OUT = 'deliverable/atlas_uk_foundation_repair_maps_qualified.csv'
cols = list(rows[0].keys())
with open(LEADS_OUT, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    w.writerows(rows)

with open('deliverable/contacts_all.csv', 'w', newline='', encoding='utf-8') as f:
    ccols = list(contacts[0].keys()) if contacts else ['place_id']
    w = csv.DictWriter(f, fieldnames=ccols)
    w.writeheader()
    w.writerows(contacts)

# verify_input.csv — `Email` exactly as stored, one row per UNIQUE best email across both segments
seen, vrows = set(), []
for r in rows:
    e = r['email']
    if e and e not in seen:
        seen.add(e)
        vrows.append([e, r['place_id'], r['segment'], r['name'], r['first_name'], r['last_name'], r['email_type']])
with open('deliverable/verify_input.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['Email', 'place_id', 'segment', 'business', 'first_name', 'last_name', 'email_type'])
    w.writerows(vrows)

# emails_final_unverified.csv — build-plusvibe `base` input shape, verdict left blank
BASE_COLS = ['place_id', 'email', 'verdict', 'email_kind', 'found_by', 'contact_name']
with open('deliverable/emails_final_unverified.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=BASE_COLS)
    w.writeheader()
    for r in rows:
        if not r['email']:
            continue
        w.writerow({'place_id': r['place_id'], 'email': r['email'], 'verdict': '',
                    'email_kind': 'personal' if r['email_type'] == 'person' else 'company',
                    'found_by': 'site_deep:' + r['email_deep_source'] if r['email_deep_source'] else 'site_harvest',
                    'contact_name': r['primary_name']})

# ---------------------------------------------------------------------------
# funnel
# ---------------------------------------------------------------------------
if missing:
    print('NOTE: not on disk yet, skipped:', ', '.join(missing))
print('=' * 96)
print('%-14s %7s %7s %11s %13s %11s %8s %13s %6s' % ('segment', 'leads', 'named', 'named+email',
      'email_no_name', 'name_only', 'neither', 'person_email', 'brand'))
tot = collections.Counter()
for seg, st in per_seg.items():
    print('%-14s %7d %7d %11d %13d %11d %8d %13d %6d' % (seg, st['leads'], st['named'],
          st['named+email'], st['email_no_name'], st['name_no_email'], st['neither'],
          st['person_email'], st['brand']))
    tot.update(st)
print('%-14s %7d %7d %11d %13d %11d %8d %13d %6d' % ('BOTH', tot['leads'], tot['named'],
      tot['named+email'], tot['email_no_name'], tot['name_no_email'], tot['neither'],
      tot['person_email'], tot['brand']))
print('=' * 96)
print('named %.1f%% · email %.1f%% · named+email %.1f%%' % (100.0 * tot['named'] / tot['leads'],
      100.0 * tot['email'] / tot['leads'], 100.0 * tot['named+email'] / tot['leads']))
print('contacts rows', len(contacts), '| verify_input rows', len(vrows),
      '| emails_final_unverified rows', sum(1 for r in rows if r['email']))
print('name source file', collections.Counter(r['name_source_file'] for r in rows if r['primary_name']).most_common())
print('name source     ', collections.Counter(r['name_source'].split(':')[0] for r in rows if r['primary_name']).most_common())
print('role buckets    ', collections.Counter(r['role_bucket'] for r in rows if r['primary_name']).most_common())
print('email types     ', collections.Counter(r['email_type'] for r in rows).most_common())
print('person shapes   ', collections.Counter(r['email_person_shape'] for r in rows if r['email_person_shape']).most_common())
print('CH name mismatches dropped', tot['ch_mismatch_dropped'], '— examples:')
for b, chn, nm in dropped_examples[:8]:
    print('   %-44s CH %-44s -> %s' % (b[:44], chn[:44], nm))
fl = collections.Counter()
for r in rows:
    for x in r['qa_flags'].split('; '):
        if x:
            fl[x.split(':')[0]] += 1
print('qa flags        ', fl.most_common())
print('->', LEADS_OUT)
