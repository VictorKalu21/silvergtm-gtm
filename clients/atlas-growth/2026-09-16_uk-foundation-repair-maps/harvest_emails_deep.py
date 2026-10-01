#!/usr/bin/env python3
"""Deep on-site email harvest for the 2026-09-16 UK Maps run  (NO enrichment credits, free fetches only).

WHY THIS EXISTS
---------------
This scrape has no Maps email column (a live scraper.tech pull returns no email field), so every
email in the deliverable comes from the on-site harvest in `skills/google-maps-scrape/fetch-sites.js`.
That harvest is thin — 240/686 ICP leads (35%) and 116/174 damp-only leads — because it extracts with
a plain regex over the page TEXT *after* `htmlToText()` has stripped the HTML. Everything below is
invisible to it:

  * `mailto:` hrefs            -> `<a href>` is an attribute; the tag is deleted before the regex runs.
  * JSON-LD `"email"`          -> lives inside `<script type="application/ld+json">`, and htmlToText
                                  drops `<script>` blocks wholesale. (web-scrape-triage Tier 1:
                                  "structured data is often already in the page — parse it first".)
  * Cloudflare `data-cfemail`  -> the address is an XOR-encoded hex attribute; the visible text is a
                                  `[email protected]` placeholder.
  * text obfuscation           -> "info [at] example.co.uk", "(at)", "&#64;", `<span>@</span>` splits,
                                  zero-width characters, `"info" + "@" + "domain"` in a script.
  * contact pages not fetched  -> fetch-sites' L2 keyword list is owner-finding oriented (about/team/
                                  meet/...); `contact`, `contact-us`, `get-in-touch`, `enquiries` are
                                  NOT in it, and that is exactly where a UK trades site puts the email.

This script re-fetches the RAW HTML (never stripped first) of the homepage + the contact-like pages,
extracts with the rungs above, records the SOURCE of every address, and then re-runs stageC's
ranking over the UNION of the old site emails and the new ones.

WHAT IT IS NOT: it is not an engine change and it spends nothing. No scraper.tech, no finder API, no
verification credits, no Firecrawl, no Scrapling (RUN-NOTES: ~80 s/site and the Turnstile widget host
is blocked from this egress — a 403 stays a 403 here, so a 403 is recorded and skipped).
If the wins here hold up, the extraction rungs belong in fetch-sites.js via
`skills/google-maps-scrape/IMPROVEMENTS.md` + a test — not in a second run script.

PROBE, 3 calls, 2026-09-16 — is a curl_cffi rung worth adding for the 403s?
  groundworksconstructionlondon.co.uk  requests (403, 5753 B)  curl_cffi impersonate=chrome (403, 6031 B)
  minipilingsystems.co.uk              requests (202,  169 B)  curl_cffi impersonate=chrome (202,  169 B)
  groundworkcompanies.co.uk            requests (403, 5743 B)  curl_cffi impersonate=chrome (403, 6000 B)
TLS/JA3 impersonation alone clears none of them (same result RUN-NOTES got on petercox/timberwise), so
there is NO fallback rung here: a 403/challenge is recorded and skipped. Nothing is lost by that — the
merge unions the deep emails with the OLD site emails, so a failed re-fetch leaves the row untouched.

USAGE
    python3 harvest_emails_deep.py probe [url ...]     # 3-call rule: extractor on 3 known sites
    python3 harvest_emails_deep.py harvest [--limit N] [--resume] [--concurrency 10]
    python3 harvest_emails_deep.py merge              # re-rank + rewrite both contacts CSVs in place
"""
import csv, json, os, re, sys, html, time, threading, collections
from urllib.parse import urljoin, urlparse, unquote
from concurrent.futures import ThreadPoolExecutor

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
CONTACT_FILES = ['leads_qualified_contacts.csv', 'leads_damp_only_contacts.csv']
OUT_JSONL = os.path.join(HERE, 'owner', 'emails_deep.jsonl')
SITE_JSONL = os.path.join(HERE, 'owner', 'site_text.jsonl')

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
      'Chrome/124.0.0.0 Safari/537.36')
HEADERS = {'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
           'Accept-Language': 'en-GB,en;q=0.9'}
TIMEOUT = 10
MAX_PAGES = 5           # homepage + up to 4 contact-like pages
CONCURRENCY = 10
PAGE_DELAY = 0.35       # polite: between the pages of one site
MAX_HTML = 1_500_000    # a page bigger than this is a download, not a contact page

# ---------------------------------------------------------------------------
# shared-hosts.js, ported (suffix test). Data copied verbatim from
# skills/google-maps-scrape/shared-hosts.js — a lead on one of these has no site of its own.
# ---------------------------------------------------------------------------
SHARED_HOSTS = [
    'facebook.com', 'fb.com', 'fb.me', 'instagram.com', 'x.com', 'twitter.com', 'tiktok.com',
    'youtube.com', 'youtu.be', 'linkedin.com', 'pinterest.com', 'nextdoor.com', 'wa.me',
    'linktr.ee', 'beacons.ai',
    'sites.google.com', 'google.com', 'business.site', 'g.page', 'goo.gl', 'maps.app.goo.gl',
    'blogspot.com',
    'wixsite.com', 'wix.com', 'wixstudio.io', 'godaddysites.com', 'weebly.com', 'squarespace.com',
    'wordpress.com', 'myshopify.com', 'webnode.com', 'webnode.page', 'strikingly.com',
    'jimdosite.com', 'webflow.io', 'github.io', 'notion.site', 'carrd.co', 'site123.me',
    'ueniweb.com', 'homestead.com', 'yolasite.com', 'bizland.com', 'mystrikingly.com',
    'wordpress.org', 'tumblr.com', 'weebly.net',
    'sitelift.site', 'localo.site', 'brand.site', 'square.site', 'netlify.app', 'vercel.app',
    'lovable.app', 'replit.app', 'pages.dev', 'framer.website', 'framer.app', 'glitch.me',
    'weeblysite.com', 'jimdofree.com',
    'yelp.com', 'angi.com', 'angieslist.com', 'homeadvisor.com', 'houzz.com', 'thumbtack.com',
    'porch.com', 'bark.com', 'bbb.org', 'yellowpages.com', 'superpages.com', 'manta.com',
    'mapquest.com', 'tripadvisor.com', 'birdeye.com', 'chamberofcommerce.com', 'expertise.com',
    'wheree.com', 'buildzoom.com', 'networx.com', 'checkatrade.com', 'trustatrader.com',
    'mybuilder.com', 'rated-people.com', 'yell.com', 'hotfrog.com', 'cylex.com', 'brownbook.net',
]
SLD = {'co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'or', 'ne', 'go', 'mil', 'ltd', 'plc', 'nhs', 'sch'}


def host_of(u):
    s = str(u or '').strip()
    if not s:
        return ''
    if not re.match(r'^[a-z][a-z0-9+.-]*://', s, re.I):
        s = 'https://' + s
    try:
        return (urlparse(s).hostname or '').lower().lstrip('.').removeprefix('www.')
    except Exception:
        return ''


def root_domain(u):
    h = host_of(u)
    if not h or '.' not in h:
        return h
    p = h.split('.')
    if len(p) <= 2:
        return h
    tld, sld = p[-1], p[-2]
    return '.'.join(p[-3:]) if (len(tld) == 2 and sld in SLD) else '.'.join(p[-2:])


def is_shared_host(u):
    h = host_of(u)
    return bool(h) and any(h == s or h.endswith('.' + s) for s in SHARED_HOSTS)


# ---------------------------------------------------------------------------
# stageC_emails_names.py filters, copied VERBATIM so the ranking stays identical.
# ---------------------------------------------------------------------------
GENERIC_GOOD = ['info', 'enquiries', 'enquiry', 'hello', 'sales', 'office', 'admin', 'contact', 'mail',
                'enquire', 'email', 'hi', 'estimates', 'quotes', 'quote', 'team']
BAD = re.compile(r"noreply|no-reply|donotreply|privacy|webmaster|postmaster|abuse|jobs|careers|recruit|hr@|accounts|invoice|payroll|unsubscribe|example|sentry|wixpress|godaddy|squarespace|@.*\.(png|jpg|gif|webp|svg)$|dpo@|gdpr|complaints|press@|marketing@|newsletter", re.I)
THIRD = re.compile(r"checkatrade|trustatrader|ratedpeople|mybuilder|yell\.com|facebook|google|nhs\.uk|gov\.uk|\.ac\.uk|fmb\.org|which\.co|trustpilot|houzz|bark\.com|linkedin|fensa|gassafe|nicieic|trustmark", re.I)
FREE = re.compile(r"@(gmail|googlemail|hotmail|outlook|yahoo|live|aol|icloud|me|btinternet|btconnect|sky|talktalk|virginmedia|ntlworld|blueyonder|hotmail\.co|yahoo\.co|mail|protonmail|msn)\.", re.I)
GENERIC_ALL = set(GENERIC_GOOD) | {'accounts', 'support', 'service', 'services', 'help', 'bookings',
    'booking', 'orders', 'office', 'reception', 'customerservice', 'customer', 'general', 'main',
    'post', 'web', 'site', 'director', 'manager', 'md', 'boss', 'owner', 'company', 'business',
    'work', 'home', 'me', 'you', 'us'}
EMAIL_SHAPE = re.compile(r"^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$")
# fetch-sites.js emailsIn() junk filter, same list
JUNK = re.compile(r"\.(png|jpe?g|gif|webp|svg|bmp|ico|tiff?)$|(example|sentry|wixpress|godaddy|squarespace|sentry\.io|schema\.org|w3\.org|jquery|cloudflare|wordpress|gravatar|shopify|placeholder|yourdomain|domain\.com|email\.com|test\.com|company\.com)\.", re.I)


def name_from_local(local):
    """stageC name_from_local(), verbatim — decides `person_shaped`."""
    l = local.lower()
    if l in GENERIC_ALL or re.search(r"\d{3,}", l):
        return None
    m = re.match(r"^([a-z]{2,})[._-]([a-z]{2,})$", l)
    if m and m.group(1) not in GENERIC_ALL and m.group(2) not in GENERIC_ALL:
        return (m.group(1).title(), m.group(2).title(), 'first.last')
    m = re.match(r"^([a-z])[._-]([a-z]{3,})$", l)
    if m and m.group(2) not in GENERIC_ALL:
        return (m.group(1).upper() + '.', m.group(2).title(), 'f.last')
    return None


def is_own(edom, dom):
    """stageC own-domain rule, verbatim."""
    return bool(dom) and (edom == dom or edom.endswith('.' + dom) or dom.endswith('.' + edom))


# ---------------------------------------------------------------------------
# EXTRACTION — every rung runs against RAW HTML, never stripped text.
# ---------------------------------------------------------------------------
ZERO_WIDTH = re.compile(r'[​‌‍⁠﻿­]')
RE_EMAIL = re.compile(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", re.I)
RE_MAILTO = re.compile(r"""mailto\s*:\s*['"]?([^'"<>\s\)]+)""", re.I)
RE_LDJSON = re.compile(r"""<script[^>]+type\s*=\s*['"]?application/ld\+json['"]?[^>]*>(.*?)</script>""", re.I | re.S)
RE_CFEMAIL = re.compile(r"""data-cfemail\s*=\s*['"]([0-9a-fA-F]+)['"]""")
RE_CFLINK = re.compile(r"""/cdn-cgi/l/email-protection#([0-9a-fA-F]+)""")
RE_DATAEMAIL = re.compile(r"""data-(?:email|mail|e-mail|emailaddress)\s*=\s*['"]([^'"]{5,120})['"]""", re.I)
RE_MICRODATA = re.compile(r"""itemprop\s*=\s*['"]email['"][^>]*?content\s*=\s*['"]([^'"]{5,120})['"]""", re.I)
RE_SCRIPT = re.compile(r"<script[\s\S]*?</script>", re.I)
RE_STYLE = re.compile(r"<style[\s\S]*?</style>", re.I)
# tag-split @  ->  info<span>@</span>example.co.uk  /  info&#64;example.co.uk
RE_TAGSPLIT = re.compile(
    r"([a-z0-9._%+-]{2,64})\s*(?:<[^>]{1,160}>\s*){0,3}(?:@|&#0*64;|&#x0*40;|&commat;|\[\s*at\s*\]|\(\s*at\s*\))"
    r"\s*(?:<[^>]{1,160}>\s*){0,3}([a-z0-9-]+(?:\.[a-z0-9-]+)+\.?[a-z]{2,})", re.I)
# "info [at] example [dot] co [dot] uk"  — bracketed forms are high-confidence
RE_OBF_BRACKET = re.compile(
    r"([a-z0-9._%+-]{2,64})\s*(?:\[\s*at\s*\]|\(\s*at\s*\)|\{\s*at\s*\}|\[\s*@\s*\]|\(\s*@\s*\)|\s+-at-\s+)\s*"
    r"([a-z0-9.\-\s\[\]\(\)\{\}]{3,80}?[a-z]{2,})(?=[^a-z0-9.\-]|$)", re.I)
# bare " at " ONLY when the domain side ALSO spells out its dots — otherwise
# "look at example.com" fabricates look@example.com.
RE_OBF_AT_DOT = re.compile(
    r"([a-z0-9._%+-]{2,64})\s+at\s+([a-z0-9-]+(?:\s*(?:\[\s*dot\s*\]|\(\s*dot\s*\)|\{\s*dot\s*\}|\s+dot\s+)\s*[a-z0-9-]+)+)", re.I)
RE_JS_CONCAT = re.compile(
    r"""['"]([a-z0-9._%+-]{2,64})['"]\s*\+\s*['"]\s*(?:@|&#0*64;)\s*['"]\s*\+\s*['"]([a-z0-9.\-]+\.[a-z]{2,})['"]""", re.I)
RE_A = re.compile(r"""<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)</a>""", re.I)

CONTACTISH = re.compile(r"contact|contact-us|get-in-touch|getintouch|enquir|about|team|meet", re.I)
SKIP_EXT = re.compile(r"\.(pdf|jpe?g|png|gif|svg|webp|mp4|zip|css|js|ico|woff2?|docx?|xlsx?)($|\?)", re.I)
SOCIAL = re.compile(r"(facebook|instagram|twitter|x\.com|linkedin|youtube|tiktok|yelp|maps\.google|goo\.gl)\.", re.I)
CHALLENGE = re.compile(r"just a moment|cf-browser-verification|cf_chl_|attention required!|challenge-platform|enable javascript and cookies|please enable javascript", re.I)


def html_to_text(h):
    """fetch-sites.js htmlToText(), ported — used ONLY for the last (plain-regex) rung, so the
    'text' source here means exactly what the engine already sees."""
    t = RE_SCRIPT.sub(' ', h)
    t = RE_STYLE.sub(' ', t)
    t = re.sub(r"<!--[\s\S]*?-->", ' ', t)
    t = re.sub(r"</(p|div|li|h[1-6]|br|tr)>", '\n', t, flags=re.I)
    t = re.sub(r"<[^>]+>", ' ', t)
    t = html.unescape(t)
    return re.sub(r"\n\s*\n\s*", '\n', re.sub(r"[ \t\f\v]+", ' ', t)).strip()


def cf_decode(hexstr):
    """Cloudflare email obfuscation: first byte is the XOR key, the rest is the address."""
    try:
        b = bytes.fromhex(hexstr)
    except ValueError:
        return None
    if len(b) < 4:
        return None
    key = b[0]
    try:
        s = ''.join(chr(c ^ key) for c in b[1:])
    except Exception:
        return None
    return s if '@' in s else None


def _walk_json_emails(node, out):
    """JSON-LD `email` at ANY depth, including contactPoint[] and @graph[]."""
    if isinstance(node, dict):
        for k, v in node.items():
            if str(k).lower() in ('email', 'e-mail', 'emailaddress'):
                if isinstance(v, str):
                    out.append(v)
                elif isinstance(v, list):
                    out.extend(x for x in v if isinstance(x, str))
                elif isinstance(v, dict):
                    _walk_json_emails(v, out)
            else:
                _walk_json_emails(v, out)
    elif isinstance(node, list):
        for v in node:
            _walk_json_emails(v, out)


def _clean(raw):
    """normalise one candidate string -> a bare lowercase address, or None."""
    if not raw:
        return None
    s = html.unescape(unquote(str(raw).strip()))
    s = ZERO_WIDTH.sub('', s)
    s = re.sub(r"^\s*(mailto\s*:)+\s*", '', s, flags=re.I)
    s = s.split('?')[0].split(',')[0].split(';')[0]           # mailto query strings / multi-recipient
    s = s.strip().strip('<>"\'()[]{}')
    s = s.rstrip('.,;:!?|’\'")]}-')                       # trailing punctuation
    s = s.replace(' ', '').lower()
    m = RE_EMAIL.search(s)
    if not m:
        return None
    e = m.group(0).lower().rstrip('.')
    # JSON-escape residue: a tag_split/text match over an inline JS blob can swallow the escape
    # body of \u003e / \u0026 (the backslash is not in the local-part class) and produce
    # "u003eenquiries@host". Strip the residue rather than the address.
    loc, _, edom = e.partition('@')
    loc = re.sub(r'^(?:u00[0-9a-f]{2})+', '', loc)
    if not loc:
        return None
    e = loc + '@' + edom
    return e if EMAIL_SHAPE.match(e) else None


def _undot(dom):
    """'example [dot] co [dot] uk' / 'example dot co dot uk' -> 'example.co.uk'"""
    d = re.sub(r"\s*(?:\[\s*dot\s*\]|\(\s*dot\s*\)|\{\s*dot\s*\}|\s+dot\s+)\s*", '.', dom, flags=re.I)
    return re.sub(r"\s+", '', d).strip('.')


def extract_emails(raw_html, base_url=''):
    """Every rung, in provenance order. Returns [(email, source), ...] first-source-wins."""
    found = []            # (email, source) in discovery order
    seen = set()

    def add(cand, src):
        e = _clean(cand)
        if e and e not in seen:
            seen.add(e)
            found.append((e, src))

    h = ZERO_WIDTH.sub('', raw_html or '')

    # 1. mailto: hrefs (attribute — invisible to the engine's text regex)
    for m in RE_MAILTO.finditer(h):
        add(m.group(1), 'mailto')

    # 2. JSON-LD (inside <script>, which htmlToText deletes)
    for m in RE_LDJSON.finditer(h):
        blob = m.group(1).strip()
        blob = re.sub(r"^<!\[CDATA\[|\]\]>$", '', blob).strip()
        vals = []
        try:
            _walk_json_emails(json.loads(blob), vals)
        except Exception:
            # malformed JSON-LD is common; fall back to the key pattern
            vals = [x for x in re.findall(r'"e-?mail(?:address)?"\s*:\s*"([^"]{5,120})"', blob, re.I)]
        for v in vals:
            add(v, 'jsonld')

    # 3. Cloudflare obfuscation (data-cfemail + /cdn-cgi/l/email-protection#hex)
    for m in RE_CFEMAIL.finditer(h):
        d = cf_decode(m.group(1))
        if d:
            add(d, 'cfemail')
    for m in RE_CFLINK.finditer(h):
        d = cf_decode(m.group(1))
        if d:
            add(d, 'cfemail')

    # 4. data-email / microdata itemprop=email
    for m in RE_DATAEMAIL.finditer(h):
        add(m.group(1), 'data-email')
    for m in RE_MICRODATA.finditer(h):
        add(m.group(1), 'microdata')

    # 5. de-obfuscated text forms
    for m in RE_TAGSPLIT.finditer(h):
        add(m.group(1) + '@' + m.group(2), 'tag_split')
    for m in RE_JS_CONCAT.finditer(h):
        add(m.group(1) + '@' + m.group(2), 'js_concat')
    text_raw = re.sub(r"<[^>]+>", ' ', RE_STYLE.sub(' ', RE_SCRIPT.sub(' ', h)))
    text_raw = re.sub(r"\s+", ' ', text_raw)
    for m in RE_OBF_BRACKET.finditer(text_raw):
        add(m.group(1) + '@' + _undot(m.group(2)), 'obfuscated')
    for m in RE_OBF_AT_DOT.finditer(text_raw):
        add(m.group(1) + '@' + _undot(m.group(2)), 'obfuscated')
    for m in RE_EMAIL.finditer(html.unescape(text_raw)):   # &#64; / &commat; entity forms
        add(m.group(0), 'entity')

    # 6. the plain regex over stripped text — exactly what fetch-sites.js already does
    for m in RE_EMAIL.finditer(html_to_text(h)):
        add(m.group(0), 'text')

    # 7. catch-all over the rest of the raw document (alt=/title=/value=, inline JS blobs,
    #    __NEXT_DATA__, anything an attribute or script still holds)
    for m in RE_EMAIL.finditer(html.unescape(h)):
        add(m.group(0), 'raw_html')

    return found


def keep_email(e, dom):
    """The stageC accept rule, applied at harvest time. Returns (keep, reason)."""
    if not EMAIL_SHAPE.match(e):
        return False, 'shape'
    if JUNK.search(e):
        return False, 'junk'
    if BAD.search(e):
        return False, 'bad_regex'
    if THIRD.search(e):
        return False, 'third_party'
    edom = e.split('@', 1)[1]
    if is_own(edom, dom):
        return True, 'own'
    if FREE.search('@' + edom + '.'):
        return True, 'free'
    return False, 'other_domain'      # a 3rd-party domain scraped off the site is not this mailbox


# ---------------------------------------------------------------------------
# FETCH
# ---------------------------------------------------------------------------
_tls = threading.local()


def session():
    s = getattr(_tls, 's', None)
    if s is None:
        s = requests.Session()
        s.headers.update(HEADERS)
        _tls.s = s
    return s


def get_page(url):
    """-> dict(url, status, bytes, html|None). status: int | 'challenge' | 'ERR:<name>' | 'nonhtml'"""
    try:
        r = session().get(url, timeout=TIMEOUT, allow_redirects=True, stream=True)
    except Exception as e:
        return {'url': url, 'status': 'ERR:' + e.__class__.__name__, 'bytes': 0, 'html': None}
    try:
        ct = (r.headers.get('content-type') or '').lower()
        if r.status_code == 403 or r.status_code == 429:
            return {'url': r.url, 'status': r.status_code, 'bytes': 0, 'html': None}
        if r.status_code >= 400:
            return {'url': r.url, 'status': r.status_code, 'bytes': 0, 'html': None}
        if 'html' not in ct and 'xml' not in ct and ct:
            return {'url': r.url, 'status': 'nonhtml', 'bytes': 0, 'html': None}
        body = r.raw.read(MAX_HTML, decode_content=True) or b''
        txt = body.decode(r.encoding or 'utf-8', errors='replace')
        if CHALLENGE.search(txt[:4000]):
            return {'url': r.url, 'status': 'challenge', 'bytes': len(txt), 'html': None}
        return {'url': r.url, 'status': r.status_code, 'bytes': len(txt), 'html': txt}
    finally:
        r.close()


def contact_links(h, base):
    """contact-like URLs on the homepage: path OR anchor text matches the contact pattern."""
    out, seen = [], set()
    basehost = host_of(base)
    for m in RE_A.finditer(h):
        href = m.group(1).strip()
        anchor = re.sub(r"<[^>]+>", ' ', m.group(2))
        anchor = re.sub(r"\s+", ' ', html.unescape(anchor)).strip().lower()
        if not href or href.lower().startswith(('mailto:', 'tel:', 'javascript:', 'data:')):
            continue
        try:
            u = urljoin(base, href)
            p = urlparse(u)
        except Exception:
            continue
        if p.scheme not in ('http', 'https'):
            continue
        if SKIP_EXT.search(p.path) or SOCIAL.search(p.netloc):
            continue
        if host_of(u) != basehost:
            continue
        probe = (p.path + ' ' + anchor).lower()
        if not CONTACTISH.search(probe):
            continue
        key = p.path.rstrip('/').lower()
        if key in seen or not key:
            continue
        seen.add(key)
        # a real /contact beats /about-us; score so the best pages survive the MAX_PAGES cap
        score = 0
        if re.search(r"contact|get-?in-?touch|enquir", probe):
            score += 2
        if re.search(r"contact|get-?in-?touch|enquir", p.path, re.I):
            score += 1
        out.append((score, u))
    out.sort(key=lambda x: -x[0])
    return [u for _, u in out]


def harvest_one(lead):
    """Fetch homepage + contact pages of ONE root domain and extract. Returns the JSONL record."""
    dom = lead['root_domain'] or root_domain(lead['website'])
    rec = {'place_id': lead['place_id'], 'name': lead['name'], 'root_domain': dom,
           'website': lead['website'], 'priority': lead['_prio'], 'pages': [], 'emails': [],
           'status': 'ok', 'rejected': []}
    home = get_page(lead['website'])
    rec['pages'].append({'url': home['url'], 'label': 'home', 'status': home['status'], 'bytes': home['bytes']})
    if not home['html']:
        rec['status'] = 'home_failed:' + str(home['status'])
        return rec
    pairs = list(extract_emails(home['html'], home['url']))
    page_of = {e: home['url'] for e, _ in pairs}
    for u in contact_links(home['html'], home['url'])[:MAX_PAGES - 1]:
        time.sleep(PAGE_DELAY)
        pg = get_page(u)
        label = (urlparse(u).path.strip('/').split('/')[-1] or 'page')[:40]
        rec['pages'].append({'url': pg['url'], 'label': label, 'status': pg['status'], 'bytes': pg['bytes']})
        if pg['html']:
            for e, src in extract_emails(pg['html'], pg['url']):
                if all(e != x for x, _ in pairs):
                    pairs.append((e, src))
                    page_of[e] = pg['url']
    kept = []
    for e, src in pairs:
        ok, reason = keep_email(e, dom)
        if not ok:
            rec['rejected'].append({'email': e, 'source': src, 'reason': reason})
            continue
        edom = e.split('@', 1)[1]
        kept.append({'email': e, 'source': src, 'page': page_of.get(e, ''),
                     'own_domain': bool(is_own(edom, dom)),
                     'free_mail': bool(FREE.search('@' + edom + '.')),
                     'person_shaped': bool(name_from_local(e.split('@', 1)[0]))})
    # own-domain first, person-shaped first
    kept.sort(key=lambda d: (not d['own_domain'], not d['person_shaped']))
    rec['emails'] = kept[:8]
    rec['rejected'] = rec['rejected'][:12]
    rec['pages_fetched'] = sum(1 for p in rec['pages'] if p['status'] in (200, 201))
    return rec


# ---------------------------------------------------------------------------
# TARGETS
# ---------------------------------------------------------------------------
def read_contacts():
    csv.field_size_limit(10 ** 7)
    data = {}
    for f in CONTACT_FILES:
        data[f] = list(csv.DictReader(open(os.path.join(HERE, f), encoding='utf-8')))
    return data


def priority(r):
    """(a) no email -> (b) only free-mail / third-party -> (c) has a generic own-domain email.
    (c) is included deliberately: a person-shaped address on the contact page beats info@, and the
    Plusvibe name rule only names a row when the local part IS the person."""
    if not r['email']:
        return 0
    edom = r['email'].split('@', 1)[1] if '@' in r['email'] else ''
    if FREE.search('@' + edom + '.') or not is_own(edom, r.get('root_domain') or ''):
        return 1
    return 2


def targets(data):
    """one fetch per ROOT DOMAIN (collapse-domains paid for one fetch per domain; same mailbox)."""
    by_dom, leads = {}, []
    for f, rows in data.items():
        for r in rows:
            w = (r.get('website') or '').strip()
            if not w or not re.match(r'^https?://', w, re.I):
                continue
            if is_shared_host(w):
                continue
            dom = r.get('root_domain') or root_domain(w)
            p = priority(r)
            rec = {'place_id': r['place_id'], 'name': r['name'], 'website': w, 'root_domain': dom,
                   '_prio': p, '_file': f}
            leads.append(rec)
            cur = by_dom.get(dom)
            if cur is None or p < cur['_prio']:
                by_dom[dom] = rec
    return leads, list(by_dom.values())


# ---------------------------------------------------------------------------
# COMMANDS
# ---------------------------------------------------------------------------
def cmd_probe(urls):
    if not urls:
        urls = ['https://khbpiling.co.uk/', 'http://www.piledsolutions.co.uk/',
                'https://southwestunderpinning.co.uk/']
    for u in urls:
        dom = root_domain(u)
        print('\n=== %s   (root_domain=%s)' % (u, dom))
        pg = get_page(u)
        print('  home: status=%s bytes=%s final=%s' % (pg['status'], pg['bytes'], pg['url']))
        if not pg['html']:
            continue
        links = contact_links(pg['html'], pg['url'])[:MAX_PAGES - 1]
        print('  contact-like links: %s' % (links or 'none'))
        pairs = extract_emails(pg['html'], pg['url'])
        for u2 in links:
            pg2 = get_page(u2)
            print('  page: status=%s bytes=%s %s' % (pg2['status'], pg2['bytes'], u2))
            if pg2['html']:
                for e, s in extract_emails(pg2['html'], u2):
                    if all(e != x for x, _ in pairs):
                        pairs.append((e, s))
        print('  --- extracted (source) ---')
        for e, s in pairs:
            ok, why = keep_email(e, dom)
            print('    %-45s %-10s %s (%s)' % (e, s, 'KEEP' if ok else 'drop', why))
        eng = [e for e, s in pairs if s in ('text',)]
        print('  what the ENGINE text-regex rung alone would have seen: %s' % (eng or 'NOTHING'))


def cmd_harvest(argv):
    limit = None
    conc = CONCURRENCY
    resume = '--resume' in argv
    if '--limit' in argv:
        limit = int(argv[argv.index('--limit') + 1])
    if '--concurrency' in argv:
        conc = int(argv[argv.index('--concurrency') + 1])
    data = read_contacts()
    leads, doms = targets(data)
    doms.sort(key=lambda d: d['_prio'])
    done = set()
    if resume and os.path.exists(OUT_JSONL):
        for ln in open(OUT_JSONL, encoding='utf-8'):
            ln = ln.strip()
            if ln:
                done.add(json.loads(ln)['root_domain'])
        doms = [d for d in doms if d['root_domain'] not in done]
    if limit:
        doms = doms[:limit]
    print('targets: %d leads with a non-shared-host website -> %d unique root domains to fetch '
          '(%d already done)' % (len(leads), len(doms), len(done)))
    print('priority mix: %s' % dict(collections.Counter(d['_prio'] for d in doms)))
    os.makedirs(os.path.dirname(OUT_JSONL), exist_ok=True)
    lock = threading.Lock()
    fh = open(OUT_JSONL, 'a' if resume else 'w', encoding='utf-8')
    n = [0]

    def run(d):
        rec = harvest_one(d)
        with lock:
            fh.write(json.dumps(rec) + '\n')
            fh.flush()
            n[0] += 1
            sys.stderr.write('. %d/%d %s %s %de\n' % (n[0], len(doms), rec['status'],
                                                      rec['root_domain'], len(rec['emails'])))
        return rec

    with ThreadPoolExecutor(conc) as ex:
        recs = list(ex.map(run, doms))
    fh.close()
    st = collections.Counter(r['status'] for r in recs)
    src = collections.Counter(e['source'] for r in recs for e in r['emails'])
    print('\nfetch outcomes: %s' % dict(st))
    print('emails by source: %s' % dict(src))
    print('domains with >=1 kept email: %d/%d' % (sum(1 for r in recs if r['emails']), len(recs)))
    print('-> %s' % OUT_JSONL)


# --- merge -----------------------------------------------------------------
def rank(cands, dom):
    """stageC's ranking loop, replicated VERBATIM (same regexes, same score, same order).
    cands = [(email, src)] with src in {'maps','site'}."""
    seen, ranked = set(), []
    for e, src in cands:
        if e in seen or BAD.search(e) or THIRD.search(e):
            continue
        if not re.match(r"^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$", e):
            continue
        seen.add(e)
        local, edom = e.split('@', 1)
        own = dom and (edom == dom or edom.endswith('.' + dom) or dom.endswith('.' + edom))
        free = bool(FREE.search('@' + edom + '.'))
        if not own and not free and src == 'site':
            continue
        person = name_from_local(local)
        kind = 'person' if person else ('generic' if local in GENERIC_ALL else 'other')
        score = (3 if person else 2 if kind == 'generic' else 1) * 10 + (3 if own else 2 if src == 'maps' else 1)
        ranked.append((score, e, kind, own, person))
    ranked.sort(key=lambda x: -x[0])
    return ranked


def cmd_merge():
    deep = {}
    for ln in open(OUT_JSONL, encoding='utf-8'):
        ln = ln.strip()
        if ln:
            o = json.loads(ln)
            deep[o['root_domain']] = o
    site_text = {}
    if os.path.exists(SITE_JSONL):
        csv.field_size_limit(10 ** 7)
        for ln in open(SITE_JSONL, encoding='utf-8'):
            ln = ln.strip()
            if ln:
                o = json.loads(ln)
                site_text[o['place_id']] = o.get('text') or ''
    data = read_contacts()
    report = {}
    for f, rows in data.items():
        before = {'email': 0, 'person': 0, 'own': 0, 'n': len(rows)}
        after = {'email': 0, 'person': 0, 'own': 0, 'n': len(rows)}
        changed, newly, diff_own = [], [], []
        out = []
        for r in rows:
            before['email'] += bool(r['email'])
            before['person'] += (r['email_type'] == 'person')
            before['own'] += (r['email_own_domain'] == 'Y')
            dom = r.get('root_domain') or ''
            d = deep.get(dom)
            old_site = [x.strip().lower() for x in (r.get('site_emails_all') or '').split(';') if x.strip()]
            # re-clean on load so a fix to _clean() lands on an existing emails_deep.jsonl
            # without paying for the fetches again
            new_pairs = []
            for e in (d['emails'] if d else []):
                ce = _clean(e['email'])
                if ce and all(ce != x for x, _ in new_pairs):
                    new_pairs.append((ce, e['source']))
            src_of = {e: s for e, s in new_pairs}
            maps_e = (r.get('email_maps') or '').strip().lower()
            # the row's CURRENT pick goes first among the site candidates: Python's sort is stable,
            # so an equal-scoring address can never displace the email the run already chose. Only a
            # strictly better score (person > generic > other, own > maps > other) moves a row.
            # (stageC ranked s['emails'] in page order; site_emails_all is alphabetical, so without
            # this a tie would silently re-pick.)
            cands = ([(maps_e, 'maps')] if maps_e else []) + \
                    ([(r['email'].strip().lower(), 'site')] if r['email'] else []) + \
                    [(e, 'site') for e in old_site] + \
                    [(e, 'site') for e, _ in new_pairs]
            ranked = rank(cands, dom)
            best = ranked[0] if ranked else None
            r2 = dict(r)
            old_best = r['email']
            r2['email'] = best[1] if best else ''
            r2['email_type'] = best[2] if best else ''
            r2['email_own_domain'] = 'Y' if best and best[3] else ''
            r2['all_emails'] = '; '.join(x[1] for x in ranked)
            union = sorted(set(old_site) | {e for e, _ in new_pairs})
            r2['site_emails_all'] = '; '.join(union)
            r2['email_deep_source'] = src_of.get(r2['email'], '') if r2['email'] else ''
            if not maps_e:
                r2['email_source'] = 'site' if best else ''
                r2['email_change'] = 'new_from_site' if best else 'none'
            # name hint: only the email-derived branch, and only when the NEW winner is
            # person-shaped (ranking is monotone — a person winner can only be replaced by
            # another person, so nothing else can go stale). stageC's block, same precedence.
            if best and best[4] and r2['email'] != old_best:
                txt = site_text.get(r.get('rep_place_id') or r['place_id'], '')
                fp, lp, pat = best[4]
                if pat == 'first.last':
                    fn, ln_ = fp, lp
                    if re.search(r"\b" + re.escape(fp) + r"\b", txt, re.I) and re.search(r"\b" + re.escape(lp) + r"\b", txt, re.I):
                        conf = 'email+site'
                        m = re.search(r".{0,60}\b" + re.escape(fp) + r"\b.{0,60}", txt, re.I)
                        ev = re.sub(r"\s+", ' ', m.group(0)) if m else ''
                    else:
                        conf, ev = 'email_pattern', ''
                else:
                    m = re.search(r"\b([A-Z][a-z]{2,})\s+" + re.escape(lp) + r"\b", txt)
                    if m and m.group(1).lower().startswith(fp[0].lower()):
                        fn, ln_, conf, ev = m.group(1), lp, 'email+site', re.sub(r"\s+", ' ', txt[max(0, m.start() - 60):m.end() + 60])
                    else:
                        fn, ln_, conf, ev = fp, lp, 'email_initial_only', ''
                keep0 = (r.get('site_people_keep') or '').split(' || ')[0]
                mk = re.match(r"^(.*?) \[(.*?) -> (.*?)\]$", keep0)
                if mk and mk.group(1).lower().split()[-1] == ln_.lower().split()[-1]:
                    r2['role_bucket_hint'] = mk.group(3)
                    conf = conf + '+role:' + mk.group(2)
                r2['first_name_hint'], r2['last_name_hint'] = fn, ln_
                r2['name_confidence'], r2['name_evidence'] = conf, ev[:300]
            after['email'] += bool(r2['email'])
            after['person'] += (r2['email_type'] == 'person')
            after['own'] += (r2['email_own_domain'] == 'Y')
            if r2['email'] != old_best:
                changed.append((r['name'], old_best, r2['email'], r2['email_deep_source'], r2['email_type']))
                if not old_best:
                    newly.append((r['name'], r2['email'], r2['email_deep_source']))
                elif r2['email_own_domain'] == 'Y' and r['email_own_domain'] == 'Y':
                    diff_own.append((r['name'], old_best, r2['email'], r2['email_deep_source']))
            out.append(r2)
        # write in place, originals kept as *.pre-deep.csv
        src_path = os.path.join(HERE, f)
        bak = src_path.replace('.csv', '.pre-deep.csv')
        if not os.path.exists(bak):
            os.replace(src_path, bak)
        cols = list(out[0].keys())
        with open(src_path, 'w', newline='', encoding='utf-8') as fh:
            w = csv.DictWriter(fh, fieldnames=cols)
            w.writeheader()
            w.writerows(out)
        report[f] = {'before': before, 'after': after, 'changed': changed, 'newly': newly, 'diff_own': diff_own}
        print('\n== %s  (%d rows)  backup -> %s' % (f, len(out), os.path.basename(bak)))
        print('   email      %d (%.1f%%) -> %d (%.1f%%)' % (before['email'], 100.0 * before['email'] / before['n'],
                                                            after['email'], 100.0 * after['email'] / after['n']))
        print('   person     %d -> %d' % (before['person'], after['person']))
        print('   own-domain %d -> %d' % (before['own'], after['own']))
        print('   rows whose winning email changed: %d (of which newly-emailed %d, swapped own-domain %d)'
              % (len(changed), len(newly), len(diff_own)))
    srcmix = collections.Counter(c[3] for f in report for c in report[f]['changed'] if c[3])
    print('\nwinning-email source mix (deep rungs only): %s' % dict(srcmix))
    print('\n10 examples (business -> email -> source):')
    ex = [c for f in report for c in report[f]['changed'] if c[3]][:10]
    for nm, old, new, s, t in ex:
        print('   %-42s %-38s %-10s %s' % (nm[:42], new, s, ('was ' + old) if old else 'was (none)'))
    for f in report:
        if report[f]['diff_own']:
            print('\nDIFFERENT own-domain address found by the deep harvest (%s):' % f)
            for nm, old, new, s in report[f]['diff_own'][:20]:
                print('   %-42s old=%-32s chosen=%-32s [%s]' % (nm[:42], old, new, s))


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'probe'
    if cmd == 'probe':
        cmd_probe(sys.argv[2:])
    elif cmd == 'harvest':
        cmd_harvest(sys.argv[2:])
    elif cmd == 'merge':
        cmd_merge()
    else:
        print(__doc__)
        sys.exit(1)
