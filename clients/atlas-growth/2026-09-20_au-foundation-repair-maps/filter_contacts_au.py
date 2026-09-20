#!/usr/bin/env python3
"""filter_contacts_au.py :: RUN-FOLDER ONE-OFF, two job-side passes over the owner reads.

1. DROP business names output as people. merge-owner-reads.js's TRADEWORD guard is the US/UK
   foundation-repair list (foundation, waterproofing, mudjacking ...) and does not know the
   Australian trade or the AU place names, so one reader's "Perth House", "BDG Raising",
   "Explosive Restumping", "Gold Coast", "Calcon Building" passed it (owner-prompt trap 3: a
   business name is not a person). A contact is dropped when its name is a leading substring of
   the business name AND carries a trade / place / company token, or when the evidence is nothing
   but the business name and the name has a trade token. (Engine gap -> IMPROVEMENTS.md: the
   guard should take the vertical's word list, like --exclude-titles does.)
   In place: owner/contacts_read.jsonl (owner/contacts_read.pre-filter.jsonl kept).

2. EPONYMOUS business names -> owner (owner-prompt rule 1, "the business name IS the person, for
   sole traders"), applied deterministically over EVERY qualified lead, not only the ones a reader
   happened to notice: business name starts with <First> <Last> where <First> is in the engine's
   FIRST_NAMES list (email-rank.js) and <Last> is a capitalised non-trade, non-place token >= 3
   chars; "Joe's Reblocking" / "Darren's House Restumping" (possessive first name, no surname)
   give a first name only, which the prompt allows for the salutation but not as a named
   contact — recorded as first_name_hint in a side file, not as a contact.
   Writes owner/contacts_eponym.jsonl (only leads NOT already named in contacts_read.jsonl).

Usage: python3 filter_contacts_au.py
"""
import csv, json, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
READ = os.path.join(HERE, 'owner', 'contacts_read.jsonl')
PRE = os.path.join(HERE, 'owner', 'contacts_read.pre-filter.jsonl')
EPO = os.path.join(HERE, 'owner', 'contacts_eponym.jsonl')
LEADS = os.path.join(HERE, 'leads_qualified.csv')
ENGINE = os.path.join(HERE, '..', '..', '..', 'skills', 'google-maps-scrape', 'email-rank.js')

TRADE = re.compile(r"\b(restump\w*|reblock\w*|underpin\w*|relevel\w*|levell?ing|foundations?|piers?|piling|pile|slab\w*|raising|stump\w*|concret\w*|construct\w*|building|builders?|brick\w*|stone|remedial|structural|property|group|solutions?|services?|australia\w*|pty|ltd|p/l|expert|total|top|best|explosive|getting|dirty|truss|zest|calcon|structial|advanced|screw|melbourne|sydney|brisbane|perth|adelaide|geelong|hobart|canberra|darwin|ballarat|bendigo|newcastle|wollongong|gold|coast|sunshine|toowoomba|townsville|cairns|ipswich|hunter|valley|nsw|qld|vic|tas|wa|sa|nq|bdg|j&w|ws|top)\b", re.I)
PLACE_OR_TRADE_LAST = re.compile(r"^(house|home|homes|restumping|reblocking|underpinning|building|builders|constructions?|concreting|piling|piers|foundations?|property|projects?|group|and|&|co|pty|the|of)$", re.I)

def norm(s): return re.sub(r"\s+", " ", (s or '').lower().replace('&', ' and ')).strip()

def first_names():
    js = "const e=require(process.argv[1]);console.log(JSON.stringify([...e.FIRST_NAMES]))"
    out = subprocess.run(['node', '-e', js, ENGINE], capture_output=True, text=True, check=True).stdout
    return set(json.loads(out))

def main():
    if not os.path.exists(PRE): shutil.copy(READ, PRE)
    rows = [json.loads(l) for l in open(PRE, encoding='utf-8') if l.strip()]
    csv.field_size_limit(10 ** 7)
    leads = {r['place_id']: r for r in csv.DictReader(open(LEADS, encoding='utf-8'))}
    dropped, kept_n, named = [], 0, set()
    for d in rows:
        biz = leads.get(d['place_id'], {}).get('name', '') or d.get('business_name', '')
        keep = []
        for c in d.get('contacts') or []:
            nm, ev = c.get('name', ''), c.get('evidence', '')
            lead_sub = norm(biz).startswith(norm(nm))
            trade = bool(TRADE.search(nm))
            if (lead_sub and trade) or (norm(ev) == norm(biz) and trade) or (trade and len(nm.split()) <= 2 and lead_sub):
                dropped.append((biz, nm)); continue
            keep.append(c)
        d['contacts'] = keep
        if keep:
            kept_n += len(keep); named.add(d['place_id'])
            if not any(x.get('name') == d.get('primary_name') for x in keep):
                p = keep[0]; d['primary_name'] = p['name']; d['primary_first_name'] = p.get('first_name') or p['name'].split()[0]
                d['primary_role'] = p.get('title', ''); d['primary_is_owner'] = p.get('role_bucket') == 'owner_or_partner'
        else:
            d['primary_name'] = ''; d['primary_first_name'] = ''; d['primary_role'] = ''; d['primary_is_owner'] = False
    with open(READ, 'w', encoding='utf-8') as f:
        for d in rows: f.write(json.dumps(d, ensure_ascii=False) + '\n')
    print(f'pass 1: {len(rows)} read rows, dropped {len(dropped)} business-name contacts, {kept_n} contacts kept on {len(named)} leads')
    for b, n in dropped: print(f'   drop {n!r:28} @ {b[:50]}')

    FN = first_names()
    epo, hints = [], []
    for pid, r in leads.items():
        if pid in named: continue
        name = r['name'].strip()
        m = re.match(r"^([A-Z][a-z]+)('s)?\s+([A-Z][a-zA-Z'-]{2,})\b", name)
        if not m or m.group(1).lower() not in FN: continue
        first, poss, last = m.group(1), m.group(2), m.group(3)
        if poss or PLACE_OR_TRADE_LAST.match(last) or TRADE.search(last):
            if poss and not TRADE.search(first): hints.append({'place_id': pid, 'business_name': name, 'first_name_hint': first})
            continue
        epo.append({'place_id': pid, 'business_name': name,
                    'contacts': [{'name': f'{first} {last}', 'first_name': first, 'title': 'Owner (business trades under this name)', 'role_bucket': 'owner_or_partner',
                                  'is_likely_owner': True, 'evidence': name, 'source': 'business_name', 'email': ''}],
                    'primary_name': f'{first} {last}', 'primary_first_name': first, 'primary_role': 'Owner', 'primary_is_owner': True,
                    'best_send_email': '', 'best_website': r.get('website', ''), 'confidence': 'medium', 'needs_review': True})
    with open(EPO, 'w', encoding='utf-8') as f:
        for d in epo: f.write(json.dumps(d, ensure_ascii=False) + '\n')
    with open(os.path.join(HERE, 'owner', 'first_name_hints.json'), 'w', encoding='utf-8') as f: json.dump(hints, f, indent=1)
    print(f'pass 2: eponymous business names -> {len(epo)} owner contacts on unnamed leads; {len(hints)} possessive first-name hints')
    for d in epo: print(f"   {d['primary_name']:24} <- {d['business_name'][:50]}")
    for h in hints: print(f"   hint {h['first_name_hint']:12} <- {h['business_name'][:50]}")

if __name__ == '__main__': main()
