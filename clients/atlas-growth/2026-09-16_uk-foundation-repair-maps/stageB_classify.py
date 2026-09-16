"""Stage B: foundation-repair qualification from site text (deterministic, $0, auditable).

Adapted from clients/atlas-growth/2026-09-16_uk-foundation-repair/stageB_classify.py for the
2026-09-16 UK MAPS run. Same tiers, same CORE/ADJ/NEW/STRONG vocabulary — only the join changed.

Tiers (priority order):
  A foundation_repair          - underpinning / subsidence / structural repair / crack stitching / mini-piling repair ...
  B waterproofing_damp         - basement/structural waterproofing, tanking, damp proofing (adjacent trade)
  C groundworks_new_foundations- lays NEW foundations / groundworks / piling (construction, not repair)
  D unrelated                  - none of the above

Input is leads_annotated.csv (the collapse spine: EVERY net-new row, branches included) joined to
owner/site_text.jsonl through `rep_place_id` — collapse-domains.js pays for one fetch per root
domain, so a branch row carries its representative's text and `text_from_rep` records that it did.
Rows whose website_class is not `site` (no website, or a shared host such as facebook.com /
checkatrade.com / sitelift.site) have no site text by design and are classified on name+types alone.

Each row gets: tier, score_core/adj/new, matched_terms, evidence (snippet round the strongest hit),
site_status, text_from_rep.
"""
import csv, json, re, collections, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
IN_CSV   = os.path.join(HERE, 'leads_annotated.csv')
SITE_JSONL = os.path.join(HERE, 'owner', 'site_text.jsonl')
OUT_CSV  = os.path.join(HERE, 'leads_classified.csv')

csv.field_size_limit(10 ** 7)
U = list(csv.DictReader(open(IN_CSV, encoding='utf-8')))
site = {}
if os.path.exists(SITE_JSONL):
    for ln in open(SITE_JSONL, encoding='utf-8'):
        ln = ln.strip()
        if not ln:
            continue
        o = json.loads(ln)
        site[o['place_id']] = o
else:
    print('WARN: no ' + SITE_JSONL + ' — classifying on name+types only', file=sys.stderr)

CORE=[r"\bunderpinning\b(?!\s+(?:our|the|its|this|every|all|long|his|her|their|everything|brand|values|business|work|philosophy|approach|success|ethos|commitment))",r"\bunderpinning (?:contractor|specialist|service|work|solution|method|project|scheme|company|expert)s?\b",r"\bmass concrete underpinning\b",r"\bpiled underpinning\b",r"\bunderpinning and\b",r"\bunderpinning,",r"subsidence",r"foundation repair\w*",r"foundation solution\w*",r"structural repair\w*",r"structural stabili[sz]ation",r"crack stitch\w*",r"heli(?:cal|bar|fix)\w*",r"mini[- ]?pil\w+",r"piled underpin\w*",r"resin injection",r"ground stabili[sz]ation",r"geopolymer",r"foundation heave",r"\bheave\b",r"wall tie replacement",r"cavity wall tie\w*",r"remedial tie\w*",r"mass concrete underpin\w*",r"beam and base",r"retaining wall repair\w*",r"lintel replacement",r"brick stitch\w*",r"remedial structural",r"structural remediation",r"subsidence repair\w*",r"foundation strengthening",r"foundation stabili[sz]ation",r"remedial works",r"masonry repair\w*",r"structural defect\w*",r"cracked wall\w*",r"bowing wall\w*",r"bulging wall\w*"]
ADJ=[r"basement waterproof\w*",r"structural waterproof\w*",r"\btanking\b",r"damp[- ]?proof\w*",r"rising damp",r"penetrating damp",r"cellar conversion\w*",r"basement conversion\w*",r"cavity drain\w* membrane\w*",r"type c waterproof\w*",r"sump pump\w*",r"cellar waterproof\w*",r"wet basement\w*",r"basement tank\w*",r"dpc injection",r"damp course\w*"]
NEW=[r"\bgroundworks?\b",r"\bfoundations\b",r"\bpiling\b",r"\bfootings?\b",r"strip foundation\w*",r"raft foundation\w*",r"trench ?fill",r"concrete foundation\w*",r"pad foundation\w*",r"\bpiles\b",r"\bcfa\b",r"ground ?beams?"]
# strong single terms that alone make tier A (the ICP core vocabulary)
STRONG=re.compile(r"\bunderpinning\b(?!\s+(?:our|the|its|this|every|all|long|his|her|their|everything|brand|values|business|work|philosophy|approach|success|ethos|commitment))|\bsubsidence\b|foundation repair|foundation solution|crack stitch|mini[- ]?pil|helical bar|helibar|helifix|resin injection|ground stabili|piling contractor|underpinning contractor",re.I)
ENGINEER=re.compile(r"structural engineer|surveyor|geotechnical|engineering consultant|building inspector",re.I)


def hits(pats, txt):
    found = {}
    for p in pats:
        for m in re.finditer(p, txt, re.I):
            found.setdefault(p, []).append(m)
    return found


def snippet(txt, m, w=110):
    s = max(0, m.start() - w); e = min(len(txt), m.end() + w)
    return re.sub(r"\s+", " ", txt[s:e]).strip()


def status_for(r, s):
    """site_status that stays honest about WHY there is no text."""
    wc = r.get('website_class', '')
    if wc == 'none':
        return 'no_website'
    if wc == 'shared_host':
        return 'shared_host'
    if s is None:
        return 'not_fetched'
    return s.get('status', 'not_fetched')


out = []; tiers = collections.Counter(); from_rep = 0
for r in U:
    rep = r.get('rep_place_id') or r['place_id']
    s = site.get(rep)
    if s is not None and rep != r['place_id']:
        from_rep += 1
    txt = (r['name'] + ' | ' + r['google_types'] + ' \n ' + ((s or {}).get('text') or ''))
    core = hits(CORE, txt); adj = hits(ADJ, txt); new = hits(NEW, txt)
    ncore = len(core); nadj = len(adj); nnew = len(new)
    strong = STRONG.search(txt)
    if strong or ncore >= 2: tier = 'A'
    elif nadj >= 1: tier = 'B'
    elif nnew >= 1 or ncore == 1: tier = 'C'
    else: tier = 'D'
    ev = ''
    if strong: ev = snippet(txt, strong)
    elif core: ev = snippet(txt, next(iter(core.values()))[0])
    elif adj: ev = snippet(txt, next(iter(adj.values()))[0])
    elif new: ev = snippet(txt, next(iter(new.values()))[0])
    terms = sorted({m.group(0).lower() for v in core.values() for m in v} | {m.group(0).lower() for v in adj.values() for m in v})
    r2 = dict(r)
    r2.update({'tier': tier, 'score_core': ncore, 'score_adj': nadj, 'score_new': nnew,
               'matched_terms': '; '.join(terms)[:400], 'evidence': ev[:400],
               'site_status': status_for(r, s),
               'text_from_rep': 'Y' if (s is not None and rep != r['place_id']) else '',
               'engineer_surveyor': 'Y' if ENGINEER.search(r['google_types'] + ' ' + r['name']) else '',
               'site_emails': '; '.join((s or {}).get('emails') or [])})
    out.append(r2); tiers[tier] += 1

cols = list(out[0].keys())
with open(OUT_CSV, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(out)
print("rows:", len(out), "| site_text records:", len(site), "| branch rows fanned their rep's text:", from_rep)
print("tiers:", dict(sorted(tiers.items())))
print("site status:", collections.Counter(r['site_status'].split(':')[0] for r in out).most_common())
print("site status (full):", collections.Counter(r['site_status'] for r in out).most_common(12))
print("tier A by primary:", collections.Counter(r['google_types'].split('|')[0] for r in out if r['tier'] == 'A').most_common(15))
