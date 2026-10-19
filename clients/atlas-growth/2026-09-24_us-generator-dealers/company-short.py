#!/usr/bin/env python3
"""company-short.py — trading name for a Plusvibe {{company_short}} column (campaign review 2026-10-12, NOTES.md
item 9: names went out as the register / Maps wrote them — "SPILDE ELECTRIC, INC.", a Maps descriptor in brackets).
Deterministic: drop bracketed descriptors and ' - ' / ' | ' taglines, keep the name after DBA / T/A, strip legal
suffixes (Inc, LLC, Ltd, Corp, Co, PLLC, LP …), and re-case an ALL-CAPS name to Title Case while keeping short
consonant-only tokens and known acronyms (HVAC, AC, A/C, USA …) upper case.
  python3 company-short.py <in.csv> <out.csv> [--col business_name]   -> adds company_short after --col
  import: from company_short import short  (module name via importlib)"""
import csv, re, sys
LEGAL = r'(?:incorporated|inc|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|pllc|plc|lp|llp|pc|p\.c)'
ACRO = {'HVAC', 'AC', 'A/C', 'USA', 'US', 'LP', 'DC', 'NY', 'NJ', 'TX', 'FL', 'II', 'III', 'IV', 'JR', 'SR', 'GE', 'RV', 'HQ', 'LED', 'MEP'}
def recase(w):
    core = re.sub(r'[^A-Za-z/]', '', w)
    if core.upper() in {'ST', 'CO', 'MT', 'FT'}: return w.lower().capitalize()   # Saint / Company / Mount / Fort, never initials
    if core.upper() in ACRO or (2 <= len(core) <= 4 and not re.search(r'[AEIOUY]', core.upper())): return w.upper()
    # any other 2-letter token is an abbreviation ("Brevard/IR", "EZ Power"), unless it is a small word
    # ... but real two-letter words keep normal casing ("Power Up", "Charge Me Up", "Allen St.", "AA Service Co.")
    if len(core) == 2 and core.upper() not in {'OF', 'IN', 'TO', 'AT', 'BY', 'ON', 'OR', 'AN', 'AS', 'IS', 'IT', 'MY', 'OK',
                                               'UP', 'ME', 'ST', 'CO', 'GO', 'DO', 'SO', 'NO', 'WE', 'BE', 'HE'}: return w.upper()
    if '&' in w or not core: return w
    out = w.lower().capitalize()
    out = re.sub(r"^(Mc)([a-z])", lambda m: m.group(1) + m.group(2).upper(), out)
    out = re.sub(r"^(O')([a-z])", lambda m: m.group(1) + m.group(2).upper(), out)
    out = re.sub(r"(-)([a-z])", lambda m: m.group(1) + m.group(2).upper(), out)
    return out
def short(name):
    s = (name or '').strip()
    m = re.search(r'\b(?:d/?b/?a|t/a|dba)\b\.?\s*:?\s*(.+)$', s, re.I)
    if m: s = m.group(1)
    s = re.sub(r'\s*[\(\[][^\)\]]*[\)\]]', '', s)
    s = re.split(r'\s+[-|–—]\s+', s)[0]
    # a legal suffix mid-string ends the trading name: "Schuman Electric Inc. Jacksonville", "PDQ Electric Corp 24/7 …"
    m = re.search(r'^(.+?\S)[\s,]+(?:inc|llc|l\.l\.c|ltd|corp|pllc)\b\.?(?:\s|,|-|$)', s, re.I)
    if m: s = m.group(1)
    for _ in range(3):
        s = re.sub(r'[\s,]+' + LEGAL + r'\.?\s*$', '', s, flags=re.I).strip(' ,.')
    letters = re.sub(r'[^A-Za-z]', '', s)
    if letters and letters.isupper() and len(letters) > 4:
        s = ' '.join('-'.join('/'.join(recase(q) for q in p.split('/')) for p in w.split('-')) for w in s.split())
        # small words stay lower case after the first word ("Generator Supercenter of Lawton")
        s = re.sub(r'(?<=\s)(Of|And|The|At|In|For|By|On|To)(?=\s)', lambda m: m.group(1).lower(), s)
    s = re.sub(r'\s{2,}', ' ', s).strip(' ,.-')
    return s or (name or '').strip()
if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    col = sys.argv[sys.argv.index('--col') + 1] if '--col' in sys.argv else 'business_name'
    rows = list(csv.DictReader(open(src))); H = list(rows[0].keys())
    if 'company_short' not in H: H.insert(H.index(col) + 1, 'company_short')
    for r in rows: r['company_short'] = short(r[col])
    w = csv.DictWriter(open(dst, 'w'), fieldnames=H); w.writeheader(); w.writerows(rows)
    print(f'{len(rows)} rows, changed {sum(r["company_short"] != r[col] for r in rows)}')
