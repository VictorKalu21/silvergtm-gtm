#!/usr/bin/env python3
"""fix_directory_hosts.py :: RUN-FOLDER ONE-OFF. Undo the rep fan-out over Australian directory hosts.

shared-hosts.js does not list localsearch.com.au / yellowpages.com.au / truelocal / hipages, so
collapse-domains.js grouped unrelated firms whose Maps "website" is a directory listing under one
root_domain and one representative: Scott Myers Construction and LJ Constructions inherited NQ
Restumping Solutions' localsearch page (text, verdict, emails); Wide Bay Stumping inherited Elite
Reblocking's yellowpages page. The residue adjudicator caught it (batch-021 note). Engine fix is
the shared-host list (IMPROVEMENTS.md); this repairs the run:

  * a qualified row whose root_domain is a directory host AND whose rep is another business:
      - ICP token in its name  -> adjudication "unclear", reason "directory_host_text_not_own",
                                  qa flag directory_host:<host> (same treatment as no_site_text tier A)
      - no ICP token           -> removed from leads_qualified.csv, logged in excluded_directory_host.csv
    site_status / text_from_rep / site_emails are cleared so nothing downstream reads the neighbour's page.
Runs in place after merge_adjudication.py; rank_emails_au.js carries the same guard.
"""
import csv, os, re
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
DIRECTORY_HOSTS = {'localsearch.com.au', 'yellowpages.com.au', 'truelocal.com.au', 'hipages.com.au', 'oneflare.com.au', 'serviceseeking.com.au',
                   'hotfrog.com.au', 'startlocal.com.au', 'dlook.com.au', 'aussieweb.com.au', 'cylex.com.au', 'yelp.com', 'wordofmouth.com.au', 'productreview.com.au', 'houzz.com.au', 'airtasker.com'}
ICP = re.compile(r"restump|reblock|underpin|relevel|levell|foundation|slab|pier|piling|house raising|stump", re.I)
csv.field_size_limit(10 ** 7)
rows = list(csv.DictReader(open('leads_qualified.csv', encoding='utf-8'))); H = list(rows[0].keys())
keep, excl = [], []
for r in rows:
    if r['root_domain'] in DIRECTORY_HOSTS and r['rep_place_id'] and r['rep_place_id'] != r['place_id']:
        r['site_status'] = 'shared_host'; r['text_from_rep'] = ''; r['site_emails'] = ''; r['engineer_inspector'] = ''
        if ICP.search(r['name']):
            r['adjudication'] = 'unclear'; r['adjudication_reason'] = 'directory_host_text_not_own:' + r['root_domain']
            fl = [x.strip() for x in r['qa_flags'].split(';') if x.strip() and not x.strip().startswith('no_site_text')]
            fl += ['directory_host:' + r['root_domain']] + (['icp_unclear'] if 'icp_unclear' not in fl else [])
            r['qa_flags'] = '; '.join(dict.fromkeys(fl)); keep.append(r); print('  unclear ', r['name'][:44], r['root_domain'])
        else:
            excl.append(r); print('  removed ', r['name'][:44], r['root_domain'])
    else:
        keep.append(r)
with open('leads_qualified.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=H); w.writeheader(); w.writerows(keep)
with open('excluded_directory_host.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=H); w.writeheader(); w.writerows(excl)
print(f'{len(rows)} -> {len(keep)} qualified; {len(excl)} removed -> excluded_directory_host.csv')
