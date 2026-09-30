"""Stage B: foundation-repair qualification from site text (deterministic, $0, auditable).  RUN-FOLDER ONE-OFF.

Ported from clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/stageB_classify.py for the
2026-09-20 AU MAPS run. Same tiers, same join; the CORE/ADJ/NEW/STRONG vocabulary is Australian.

Tiers (priority order):
  A foundation_repair          - underpinning / restumping / reblocking / relevelling / slab lifting / resin injection /
                                 subsidence / foundation repair / piering ...
  B house_raising_adjacent     - house raising / house lifting / relocation / retaining-wall repair (the adjacent trade;
                                 the UK's B tier was damp/waterproofing — in Australia waterproofing is the bathroom trade
                                 and is NOT an adjacent tier here)
  C groundworks_new_foundations- lays NEW foundations / footings / piling / excavation / concrete slabs (construction, not repair)
  D unrelated                  - none of the above

Input is leads_annotated.csv (the collapse spine: EVERY net-new row, branches included) joined to
owner/site_text.jsonl through `rep_place_id` — collapse-domains.js pays for one fetch per root
domain, so a branch row carries its representative's text and `text_from_rep` records that it did.
Rows whose website_class is not `site` (no website, or a shared host) have no site text by design
and are classified on name+types alone.

Each row gets: tier, score_core/adj/new, matched_terms, evidence (snippet round the strongest hit),
site_status, text_from_rep, engineer_inspector, site_emails.
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

# The verb trap from the UK run applies here too: "underpinned by our values" is not underpinning.
UNDERPIN_VERB = r"(?!\s+(?:our|the|its|this|every|all|long|his|her|their|everything|brand|values|business|work|philosophy|approach|success|ethos|commitment|by))"
CORE = [
    r"\bunderpinning\b" + UNDERPIN_VERB, r"\bunderpin(?:ned|ning)? (?:contractor|specialist|service|work|solution|method|project|company|expert)s?\b",
    r"\bmass concrete underpinning\b", r"\bscrew ?pile underpinning\b", r"\bresin (?:injection|underpinning)\b", r"\bpolyurethane injection\b",
    r"\bgeopolymer\b", r"\bunderpinning and\b", r"\bunderpinning,",
    r"\brestump\w*", r"\bre-stump\w*", r"\breblock\w*", r"\bre-block\w*", r"\brelevel\w*", r"\bre-level\w*", r"\bhouse levell?ing\b", r"\bfloor levell?ing\b",
    r"\bstump replacement\b", r"\b(?:steel|concrete|timber) stumps?\b", r"\bbearers? and joists?\b",
    r"\bslab (?:lift|jack|levell?)\w*", r"\bconcrete (?:lift|levell?)\w*", r"\bsinking (?:slab|floor|foundation)s?\b",
    r"subsidence", r"foundation repair\w*", r"foundation solution\w*", r"footing repair\w*", r"\bfoundation (?:movement|failure|settlement|crack)\w*",
    r"\bpiering\b", r"\bunderpinning pier\w*", r"\bbored piers?\b", r"\bscrew piers?\b", r"\bhelical pier\w*", r"\bpush pier\w*",
    r"ground stabili[sz]ation", r"soil stabili[sz]ation", r"foundation stabili[sz]ation", r"structural repair\w*", r"crack stitch\w*",
    r"\breactive (?:clay|soil)s?\b", r"\bcracked walls?\b", r"\bwall cracks?\b", r"\bsagging floors?\b", r"\bsloping floors?\b", r"\buneven floors?\b",
    r"\bheave\b", r"\bfoundation heave\b",
]
ADJ = [
    r"\bhouse rais(?:e|ing)\w*", r"\bhouse lift\w*", r"\braise and build\b", r"\bbuild under\w*", r"\bhouse relocat\w*", r"\bhouse restump\w*",
    r"\bretaining wall repair\w*", r"\bretaining wall\w*", r"\bflood (?:level|proof)\w*",
]
NEW = [
    r"\bnew (?:home|house) foundations?\b", r"\bfootings\b", r"\bstrip footing\w*", r"\bslab on ground\b", r"\bwaffle (?:pod|slab)s?\b", r"\braft slab\w*",
    r"\bpiling contractor\w*", r"\bbored piling\b", r"\bcfa\b", r"\bexcavat\w*", r"\bearthworks?\b", r"\bearthmoving\b",
    r"\bconcrete (?:slab|driveway|path|footpath)s?\b", r"\bconcreting\b", r"\bshotcrete\b", r"\bground ?beams?\b",
]
# strong single terms that alone make tier A (the ICP core vocabulary)
STRONG = re.compile(
    r"\bunderpinning\b" + UNDERPIN_VERB + r"|\brestump|\breblock|\brelevel|house levell?ing|subsidence|foundation repair|foundation solution|"
    r"slab (?:lift|jack)|concrete (?:lift|levell?)ing|resin injection|geopolymer|polyurethane injection|ground stabili|\bpiering\b|screw pile|"
    r"underpinning contractor|crack stitch", re.I)
ENGINEER = re.compile(r"structural engineer|geotechnical|engineering consult|building inspect|pre-?purchase inspect|building surveyor|certifier|building consultan", re.I)


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
               'engineer_inspector': 'Y' if ENGINEER.search(r['google_types'] + ' ' + r['name']) else '',
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
