"""Re-rank the best email per lead — two job-side fixes to stageC's ranking, applied in the RUN
folder (the engine is not touched; an engine-shaped write-back is HARVEST-REPORT.md residue #1).

Runs over BOTH segments (leads_qualified_contacts.csv, leads_damp_only_contacts.csv) and re-ranks
from the UNION of every address harvested for the lead: the row's current `all_emails` /
`site_emails_all`, plus `owner/emails_deep.jsonl` — including the addresses that harvest REJECTED
as `other_domain`, because fix (b) is exactly the rule that says some of those are this company's
own mailbox after all.

FIX (a) — person-shaped is narrowed, and widened.
  stageC scored ANY dotted/separated local part as `first.last`, so a company's own trade name in a
  free mailbox outranked its own inbox:
      BullNose Brickwork     albion.groundworkers@gmail.com  beat  bullnosebrickwork@gmail.com
      Russell Preservation   russell.pres@btconnect.com      beat  info@russellpreservation.co.uk
  A separated local is now person-shaped ONLY when it plausibly is first.last: the SECOND token is
  not a trade/company word (and neither token is a generic mailbox word).
  In the other direction, stageC required a separator, so a first-name-only mailbox scored `other`
  and lost to `info@` — `jim@falconstructural.co.uk`, `garry@atkinswallcare.co.uk`,
  `jean@maljon.co.uk`, `paul@…` (HARVEST-REPORT.md, "A different own-domain address"). Those are
  the best owner-outreach addresses on the list. A single-token local that is a common first name
  is now person-shaped.

FIX (b) — sibling domains count as own-domain.
  stageC's own-domain test is exact-or-subdomain, so a hyphen or a .com/.co.uk twin read as a
  third-party domain and was dropped outright, leaving 10 leads with no address at all:
      khbpiling.co.uk        -> info@khb-piling.co.uk
      telforddampproofing.com-> info@telforddampproofing.co.uk
      dc-edney.co.uk         -> enquiries@dcedney.co.uk
      tflower.uk             -> info@tflower.co.uk
      renlon.co.uk           -> survey@renlon.com
  Two domains are the same company when their second-level label matches after stripping hyphens
  and dots, both public suffixes are in the same-company set (.co.uk/.com/.uk/.net/.org/...), and
  the label is at least 4 characters.

Everything else is stageC verbatim: the same BAD / THIRD / FREE / shape regexes, the same
GENERIC_GOOD list, the same score = kind*10 + ownness, the same "a third-party domain scraped off
the site is not this business's mailbox" gate, and the same stable-sort rule that the row's CURRENT
pick goes first among the candidates so an equal-scoring address can never displace it.

Usage:  python3 rerank_emails.py            # writes both CSVs in place, keeps *.pre-rerank.csv
        python3 rerank_emails.py --dry-run  # report only, writes nothing
"""
import csv, json, os, re, sys, shutil, collections

HERE = os.path.dirname(os.path.abspath(__file__))
DRY = '--dry-run' in sys.argv
csv.field_size_limit(10 ** 7)

FILES = ['leads_qualified_contacts.csv', 'leads_damp_only_contacts.csv']
DEEP_JSONL = os.path.join(HERE, 'owner', 'emails_deep.jsonl')
SITE_JSONL = os.path.join(HERE, 'owner', 'site_text.jsonl')

# ---------------------------------------------------------------------------
# stageC's accept rules, verbatim
# ---------------------------------------------------------------------------
GENERIC_GOOD = ['info', 'enquiries', 'enquiry', 'hello', 'sales', 'office', 'admin', 'contact',
                'mail', 'enquire', 'email', 'hi', 'estimates', 'quotes', 'quote', 'team']
BAD = re.compile(r"noreply|no-reply|donotreply|privacy|webmaster|postmaster|abuse|jobs|careers|recruit|hr@|accounts|invoice|payroll|unsubscribe|example|sentry|wixpress|godaddy|squarespace|@.*\.(png|jpg|gif|webp|svg)$|dpo@|gdpr|complaints|press@|marketing@|newsletter", re.I)
THIRD = re.compile(r"checkatrade|trustatrader|ratedpeople|mybuilder|yell\.com|facebook|google|nhs\.uk|gov\.uk|\.ac\.uk|fmb\.org|which\.co|trustpilot|houzz|bark\.com|linkedin|fensa|gassafe|nicieic|trustmark", re.I)
FREE = re.compile(r"@(gmail|googlemail|hotmail|outlook|yahoo|live|aol|icloud|me|btinternet|btconnect|sky|talktalk|virginmedia|ntlworld|blueyonder|hotmail\.co|yahoo\.co|mail|protonmail|msn)\.", re.I)
SHAPE = re.compile(r"^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$")
GENERIC_ALL = set(GENERIC_GOOD) | {'accounts', 'support', 'service', 'services', 'help', 'bookings',
    'booking', 'orders', 'office', 'reception', 'customerservice', 'customer', 'general', 'main',
    'post', 'web', 'site', 'director', 'manager', 'md', 'boss', 'owner', 'company', 'business',
    'work', 'home', 'me', 'you', 'us'}

# ---------------------------------------------------------------------------
# FIX (a) — trade/company words, and a compact common-first-name list
# ---------------------------------------------------------------------------
# A second token from this set means the local part is a trading name, not a surname.
TRADE = {
    'groundwork', 'groundworks', 'groundworker', 'groundworkers', 'pres', 'preservation',
    'preservations', 'preserve', 'damp', 'damps', 'dampproofing', 'proofing', 'proof', 'proofers',
    'waterproofing', 'waterproof', 'waterproofers', 'tanking', 'ltd', 'ltds', 'limited', 'llp',
    'plc', 'co', 'company', 'companies', 'services', 'service', 'servicing', 'building',
    'buildings', 'builders', 'builder', 'build', 'construction', 'constructions', 'contractors',
    'contractor', 'contracting', 'piling', 'piles', 'pile', 'underpinning', 'underpin',
    'basement', 'basements', 'remedial', 'remedials', 'treatment', 'treatments', 'solutions',
    'solution', 'systems', 'system', 'uk', 'gb', 'group', 'groups', 'property', 'properties',
    'maintenance', 'repair', 'repairs', 'roofing', 'plastering', 'plaster', 'plasterers',
    'survey', 'surveys', 'surveying', 'surveyors', 'structural', 'structures', 'structure',
    'homes', 'interiors', 'developments', 'development', 'projects', 'project', 'install',
    'installs', 'installation', 'installations', 'specialists', 'specialist', 'timber',
    'woodworm', 'rot', 'drainage', 'drains', 'concrete', 'brickwork', 'masonry', 'joinery',
    'decorating', 'cleaning', 'scaffolding', 'excavation', 'excavations', 'demolition',
    'landscaping', 'insulation', 'ventilation', 'engineering', 'engineers', 'engineer',
    'consultancy', 'consultants', 'consulting', 'trades', 'trade', 'works', 'restoration',
    'renovation', 'renovations', 'foundation', 'foundations', 'crack', 'cracks', 'subsidence',
    'mini', 'civils', 'civil', 'groundworkltd', 'enquiries', 'estimating', 'estimates',
}
# long trade words are also caught inside a token ('anglianpreservation', 'jpddampproofing')
TRADE_SUBSTR = tuple(w for w in TRADE if len(w) >= 6)
# a token ending in a company suffix is a company word whatever its stem ('jpdltd', 'abcuk')
TRADE_SUFFIX = ('ltd', 'limited', 'llp', 'plc')

FIRST_NAMES = set("""
aaron abbie abby abdul abigail adam adrian aidan aiden ailsa aimee alan alanna albert alec alex
alexander alexandra alfie alfred ali alice alicia alise alison alistair allan allen alun amanda
amber amelia amy ana andrea andrew andy angela angus anita ann anna anne annette annie anthony
antony april archie arthur ash ashleigh ashley aaronson aidy barbara barry beatrice becky belinda
ben benjamin bernard bernadette beth bethan bethany bev beverley bill billy bob bobby bonnie brad
bradley brendan brett brian bruce bryan bryn callum calum cameron campbell carl carla carol
caroline carolyn carrie casey catherine cathy cerys charles charlie charlotte chelsea cheryl chris
chris christian christine christopher cindy claire clare clark claude clayton clifford clive
colin colleen connor conor craig curtis cyril daisy dale damian damien dan dana daniel danielle
danny darren darryl dave david dawn dean debbie deborah declan dee denis dennis derek des diana
diane dianne dick dominic don donald donna doreen doug douglas duncan dylan eamon ed eddie eddy
edward eileen elaine eleanor elizabeth ella ellen elliot elliott ellie emily emma eric erica
ernest esther ethan eugene eve evelyn ewan faye felicity fergus fiona frances francesca francis
frank fraser fred freddie frederick gabriel gail gareth garry gary gavin gemma gene geoff geoffrey
george georgia georgina gerald gerard geraldine gerry gill gillian glen glenn gloria godfrey
gordon grace graeme graham grant greg gregory guy gwen hannah harold harriet harry hayley hazel
heather heidi helen henry hilary holly howard hugh hugo iain ian imogen ines irene isaac isabel
isla ivan jack jackie jacob jacqueline jade jake james jamie jan jane janet janice jared jasmine
jason jay jayne jean jeff jeffrey jemma jenna jennifer jenny jeremy jerry jess jessica jill jim
jimmy jo joan joanna joanne jodie joe joel john johnny jon jonathan jonny jordan joseph josephine
josh joshua joy joyce judith judy julia julian julie justin karen karl kate katherine kathleen
kathryn kathy katie katy kay kayleigh keith kelly kelsey ken kenneth kerry kevin kieran kim
kimberley kirsty kris kristian krystal kyle lance larry laura lauren lawrence lee leigh leo leon
lesley leslie lewis liam libby lily linda lindsay lindsey lisa liz lloyd logan lois lorna lorraine
louis louise lucas lucy luke lydia lyn lynda lynn lynne maggie malcolm mandy marc marcus margaret
maria marian marie marilyn mario marion mark marlene martin martyn mary mason matt matthew maureen
maurice max maxine may megan mel melanie melissa mia michael michaela michelle mick mike mikey
miles millie miranda mitch mitchell mohammed molly monica morgan murray nadine naomi natalie
natasha nathan neil nia nicholas nick nicky nicola nicole nigel nina noel norman oliver olivia
ollie omar oscar owen paddy paige pam pamela pat patricia patrick paul paula pauline pete peter
philip phillip phoebe phil rachel rachael ralph ray raymond rebecca reece rhys ricardo richard
rick ricky rita rob robbie robert roberta robin rod roderick rodney roger roland ron ronald rory
rosalind rose rosemary ross rowan roy ruby russell ruth ryan sadie sally sam samantha samuel
sandra sandy sara sarah scott sean sebastian selina shane shannon sharon shaun shauna sheila
shelley shirley sian sid sidney simon sonia sophia sophie stacey stan stanley stephanie stephen
steve steven stewart stuart sue susan susie suzanne sylvia tania tanya tara ted terence terry tess
theresa thomas tim timothy tina tobias toby todd tom tommy tony tracey tracy travis trevor trish
troy tyler val valerie vanessa vaughan vera vicki vicky victor victoria vincent vivien wade walter
warren wayne wendy wes wesley will william willie yvonne zac zach zachary zoe
""".split())


def is_trade_token(t):
    if t in TRADE:
        return True
    if t.endswith(TRADE_SUFFIX) and len(t) > 4:
        return True
    return any(w in t for w in TRADE_SUBSTR)


def name_from_local(local):
    """stageC's name_from_local with FIX (a). Returns (first, last, pattern) or None."""
    l = local.lower()
    if l in GENERIC_ALL or re.search(r"\d{3,}", l):
        return None
    m = re.match(r"^([a-z]{2,})[._-]([a-z]{2,})$", l)          # first.last / first_last / first-last
    if m:
        a, b = m.group(1), m.group(2)
        if a in GENERIC_ALL or b in GENERIC_ALL:
            return None
        # FIX (a): 'albion.groundworkers', 'russell.pres', 'lisa.jpdltd' are trading names
        if is_trade_token(b) or is_trade_token(a):
            return None
        return (a.title(), b.title(), 'first.last')
    m = re.match(r"^([a-z])[._-]([a-z]{3,})$", l)              # f.last (separator REQUIRED)
    if m and m.group(2) not in GENERIC_ALL and not is_trade_token(m.group(2)):
        return (m.group(1).upper() + '.', m.group(2).title(), 'f.last')
    # FIX (a), the other direction: a first-name-only mailbox is the best outreach address there is
    if re.match(r"^[a-z]{2,}$", l) and l in FIRST_NAMES:
        return (l.title(), '', 'first_name')
    return None


# ---------------------------------------------------------------------------
# FIX (b) — sibling-domain normalisation
# ---------------------------------------------------------------------------
# public suffixes a UK trades business plausibly twins across
MULTI_SUFFIX = ('co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk', 'sch.uk', 'ac.uk',
                'gov.uk', 'com.au', 'co.nz', 'org.au')
SAME_COMPANY_TLD = {'co.uk', 'com', 'uk', 'net', 'org', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk',
                    'net.uk', 'biz', 'eu', 'london', 'co', 'info', 'net.uk', 'company', 'services'}


def split_domain(d):
    """-> (second-level label, public suffix). 'www.khb-piling.co.uk' -> ('khb-piling','co.uk')"""
    d = (d or '').lower().strip().strip('.')
    if d.startswith('www.'):
        d = d[4:]
    for suf in MULTI_SUFFIX:
        if d.endswith('.' + suf):
            return d[:-(len(suf) + 1)].split('.')[-1], suf
    parts = d.split('.')
    if len(parts) < 2:
        return '', ''
    return parts[-2], parts[-1]


def sld_key(d):
    lab, _ = split_domain(d)
    return re.sub(r"[^a-z0-9]", "", lab)


def ownness(edom, dom):
    """'' | 'exact' | 'subdomain' | 'sibling'."""
    if not dom or not edom:
        return ''
    if edom == dom or edom.endswith('.' + dom) or dom.endswith('.' + edom):
        return 'exact' if edom == dom else 'subdomain'
    ka, kb = sld_key(edom), sld_key(dom)
    if ka and ka == kb and len(ka) >= 4:
        _, sa = split_domain(edom)
        _, sb = split_domain(dom)
        if sa in SAME_COMPANY_TLD and sb in SAME_COMPANY_TLD:
            return 'sibling'
    return ''


# ---------------------------------------------------------------------------
# ranking — stageC's score, with ownness from FIX (b) and kind from FIX (a)
# ---------------------------------------------------------------------------
def rank(cands, dom):
    seen, ranked = set(), []
    for e, src in cands:
        e = (e or '').strip().lower()
        if not e or e in seen or BAD.search(e) or THIRD.search(e) or not SHAPE.match(e):
            continue
        seen.add(e)
        local, edom = e.split('@', 1)
        basis = ownness(edom, dom)
        own = bool(basis)
        free = bool(FREE.search('@' + edom + '.'))
        if not own and not free and src == 'site':
            continue                      # a 3rd-party domain scraped off the site is not this mailbox
        person = name_from_local(local)
        kind = 'person' if person else ('generic' if local in GENERIC_ALL else 'other')
        score = (3 if person else 2 if kind == 'generic' else 1) * 10 + (3 if own else 2 if src == 'maps' else 1)
        ranked.append((score, e, kind, own, person, basis))
    ranked.sort(key=lambda x: -x[0])       # stable: the row's current pick was pushed in first
    return ranked


# ---------------------------------------------------------------------------
def load_deep():
    by_dom = {}
    if not os.path.exists(DEEP_JSONL):
        return by_dom
    for ln in open(DEEP_JSONL, encoding='utf-8'):
        ln = ln.strip()
        if not ln:
            continue
        o = json.loads(ln)
        by_dom[o['root_domain']] = o
    return by_dom


def load_site_text():
    t = {}
    if os.path.exists(SITE_JSONL):
        for ln in open(SITE_JSONL, encoding='utf-8'):
            ln = ln.strip()
            if ln:
                o = json.loads(ln)
                t[o['place_id']] = o.get('text') or ''
    return t


def main():
    deep = load_deep()
    site_text = load_site_text()
    grand = collections.Counter()
    all_changes = []
    for fn in FILES:
        path = os.path.join(HERE, fn)
        rows = list(csv.DictReader(open(path, encoding='utf-8')))
        before = collections.Counter()
        after = collections.Counter()
        changed, recovered, lost = [], [], []
        out = []
        for r in rows:
            before['email'] += bool(r['email'])
            before['person'] += (r['email_type'] == 'person')
            before['generic'] += (r['email_type'] == 'generic')
            before['other'] += (r['email_type'] == 'other')
            before['own'] += (r['email_own_domain'] == 'Y')
            dom = r.get('root_domain') or ''
            d = deep.get(dom)
            maps_e = (r.get('email_maps') or '').strip().lower()
            cur = (r.get('email') or '').strip().lower()
            deep_ok = [(e['email'].lower(), e['source']) for e in (d['emails'] if d else [])]
            # FIX (b) is exactly the rule that says some other_domain rejects ARE this mailbox
            deep_rej = [(x['email'].lower(), x.get('source', '')) for x in (d.get('rejected') if d else []) or []
                        if x.get('reason') == 'other_domain']
            src_of = {e: s for e, s in deep_ok + deep_rej}
            cands = ([(maps_e, 'maps')] if maps_e else []) + \
                    ([(cur, 'site')] if cur else []) + \
                    [(x.strip().lower(), 'site') for x in (r.get('all_emails') or '').split(';') if x.strip()] + \
                    [(x.strip().lower(), 'site') for x in (r.get('site_emails_all') or '').split(';') if x.strip()] + \
                    [(e, 'site') for e, _ in deep_ok] + \
                    [(e, 'site') for e, _ in deep_rej]
            ranked = rank(cands, dom)
            best = ranked[0] if ranked else None
            r2 = dict(r)
            r2['email'] = best[1] if best else ''
            r2['email_type'] = best[2] if best else ''
            r2['email_own_domain'] = 'Y' if best and best[3] else ''
            r2['email_own_basis'] = best[5] if best else ''
            r2['email_person_shape'] = best[4][2] if (best and best[4]) else ''
            r2['all_emails'] = '; '.join(x[1] for x in ranked)
            r2['site_emails_all'] = '; '.join(sorted({e for e, _ in
                [(x.strip().lower(), '') for x in (r.get('site_emails_all') or '').split(';') if x.strip()] + deep_ok + deep_rej}))
            r2['email_deep_source'] = src_of.get(r2['email'], '') if r2['email'] else ''
            if not maps_e:
                r2['email_source'] = 'site' if best else ''
                r2['email_change'] = 'new_from_site' if best else 'none'
            # name hint from the email local part — stageC's block, re-run only when the winner moved
            if r2['email'] != cur:
                if best and best[4]:
                    txt = site_text.get(r.get('rep_place_id') or r['place_id'], '')
                    fp, lp, pat = best[4]
                    fn_, ln_, conf, ev = '', '', '', ''
                    if pat == 'first.last':
                        fn_, ln_ = fp, lp
                        if re.search(r"\b" + re.escape(fp) + r"\b", txt, re.I) and re.search(r"\b" + re.escape(lp) + r"\b", txt, re.I):
                            conf = 'email+site'
                            m = re.search(r".{0,60}\b" + re.escape(fp) + r"\b.{0,60}", txt, re.I)
                            ev = re.sub(r"\s+", " ", m.group(0)) if m else ''
                        else:
                            conf = 'email_pattern'
                    elif pat == 'f.last':
                        m = re.search(r"\b([A-Z][a-z]{2,})\s+" + re.escape(lp) + r"\b", txt)
                        if m and m.group(1).lower().startswith(fp[0].lower()):
                            fn_, ln_, conf = m.group(1), lp, 'email+site'
                            ev = re.sub(r"\s+", " ", txt[max(0, m.start() - 60):m.end() + 60])
                        else:
                            fn_, ln_, conf = fp, lp, 'email_initial_only'
                    else:   # first_name — surname unknown, and never invented
                        fn_, ln_ = fp, ''
                        m = re.search(r"\b" + re.escape(fp) + r"\b", txt, re.I)
                        conf = 'email_first_name+site' if m else 'email_first_name'
                        ev = re.sub(r"\s+", " ", m.group(0)) if m else ''
                    r2['first_name_hint'], r2['last_name_hint'] = fn_, ln_
                    r2['name_confidence'], r2['name_evidence'] = conf, ev[:300]
                elif (r.get('name_confidence') or '').startswith('email'):
                    # the old hint was read off the old winner's local part; it is stale now
                    # (BullNose: 'Albion Groundworkers' must not survive the revert)
                    r2['first_name_hint'] = r2['last_name_hint'] = ''
                    r2['name_confidence'] = r2['name_evidence'] = ''
                changed.append((r['name'], dom, cur or '(none)', r['email_type'] or '-',
                                r2['email'] or '(none)', r2['email_type'] or '-', r2['email_own_basis']))
                if not cur and r2['email']:
                    recovered.append((r['name'], dom, r2['email'], r2['email_own_basis']))
                if cur and not r2['email']:
                    lost.append((r['name'], dom, cur))
            after['email'] += bool(r2['email'])
            after['person'] += (r2['email_type'] == 'person')
            after['generic'] += (r2['email_type'] == 'generic')
            after['other'] += (r2['email_type'] == 'other')
            after['own'] += (r2['email_own_domain'] == 'Y')
            after['sibling'] += (r2['email_own_basis'] == 'sibling')
            out.append(r2)
        cols = list(rows[0].keys())
        for c in ('email_own_basis', 'email_person_shape'):
            if c not in cols:
                cols.append(c)
        if not DRY:
            bak = path.replace('.csv', '.pre-rerank.csv')
            if not os.path.exists(bak):
                shutil.copyfile(path, bak)
            with open(path, 'w', newline='', encoding='utf-8') as f:
                w = csv.DictWriter(f, fieldnames=cols)
                w.writeheader()
                w.writerows(out)
        print('=' * 100)
        print(fn, len(rows), 'rows', '' if not DRY else '(DRY RUN — nothing written)')
        print('  before: email %d (%.1f%%)  person %d  generic %d  other %d  own-domain %d'
              % (before['email'], 100.0 * before['email'] / len(rows), before['person'], before['generic'], before['other'], before['own']))
        print('  after : email %d (%.1f%%)  person %d  generic %d  other %d  own-domain %d  (of which sibling %d)'
              % (after['email'], 100.0 * after['email'] / len(rows), after['person'], after['generic'], after['other'], after['own'], after['sibling']))
        print('  winning email CHANGED on %d rows   (%d newly have one, %d lost the only one they had)'
              % (len(changed), len(recovered), len(lost)))
        for c in changed[:40]:
            print('    %-42s %-34s %s [%s] -> %s [%s%s]' % (c[0][:42], c[1][:34], c[2], c[3], c[4], c[5], '/' + c[6] if c[6] == 'sibling' else ''))
        if len(changed) > 40:
            print('    ... %d more' % (len(changed) - 40))
        if lost:
            print('  LOST:', lost)
        for k, v in before.items():
            grand['before_' + k] += v
        for k, v in after.items():
            grand['after_' + k] += v
        grand['changed'] += len(changed)
        grand['recovered'] += len(recovered)
        all_changes += changed
    print('=' * 100)
    print('BOTH SEGMENTS:', dict(grand))
    return all_changes


if __name__ == '__main__':
    main()
