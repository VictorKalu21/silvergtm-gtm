"""Tier-3 rung for the site-text fetch: ONE Scrapling StealthyFetcher attempt per confirmed
403 / challenge / thin-shell failure from fetch-sites.js.

web-scrape-triage "When Tier 1 fails": dead (ENOTFOUND / connection reset / 404) gets no rung at
all; a slow site was already recovered by fetch-sites.js's free 20 s retry; only an anti-bot
challenge or a JS-only shell is worth a browser. RUN-NOTES.md probes: curl_cffi does NOT clear this
WAF, Scrapling 0.4.15 `solve_cloudflare=True` does (~80 s/solve) via /opt/pw-browsers/chromium-1234.

One StealthySession per shard, so the Turnstile clearance cookie is reused for that lead's L2 pages
instead of being re-solved per page. Page set = the same L2 keyword list fetch-sites.js uses (its
defaults + the config's `site_l2_keywords`), so contact/about pages are picked the same way.

Writes owner/site_text_recovered.jsonl in the EXACT record shape fetch-sites.js emits.

Usage:
  python3 scrapling_recover.py --shard 0 --shards 2 --deadline-min 90 [--limit N]
"""
import argparse, json, os, re, sys, time
from urllib.parse import urljoin, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, 'owner', 'site_text.jsonl')
CFG = os.path.join(os.path.dirname(HERE), 'atlas-growth-uk-config.json')

ap = argparse.ArgumentParser()
ap.add_argument('--shard', type=int, default=0)
ap.add_argument('--shards', type=int, default=1)
ap.add_argument('--deadline-min', type=float, default=90.0)
ap.add_argument('--limit', type=int, default=0)
ap.add_argument('--timeout', type=int, default=60000)
ap.add_argument('--max-l2', type=int, default=3)
ap.add_argument('--out', default='')
A = ap.parse_args()
OUT = A.out or os.path.join(HERE, 'owner', 'site_text_recovered.part%d.jsonl' % A.shard)

# ---- same caps / cleaning as fetch-sites.js -------------------------------------------------
HOME_CAP, L2_CAP, TOTAL_CAP = 6000, 2800, 18000
L2_DEFAULT = ['about', 'team', 'meet', 'our-story', 'story', 'staff', 'provider', 'providers', 'doctor', 'doctors', 'dentist', 'owner', 'founder', 'leadership', 'who-we-are', 'about-us', 'our-team', 'meet-the']
try:
    L2_EXTRA = json.load(open(CFG, encoding='utf-8')).get('site_l2_keywords') or []
except Exception:
    L2_EXTRA = []
L2_KEYWORDS = list(dict.fromkeys(L2_DEFAULT + L2_EXTRA))
SKIP_EXT = re.compile(r"\.(pdf|jpe?g|png|gif|svg|webp|mp4|zip|css|js|ico|woff2?)($|\?)", re.I)
SOCIAL = re.compile(r"(facebook|instagram|twitter|x\.com|linkedin|youtube|tiktok|yelp|maps\.google|goo\.gl)\.", re.I)
ENT = {'&amp;': '&', '&nbsp;': ' ', '&#39;': "'", '&apos;': "'", '&quot;': '"', '&lt;': '<', '&gt;': '>'}


def html_to_text(html):
    t = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    t = re.sub(r"<style[\s\S]*?</style>", " ", t, flags=re.I)
    t = re.sub(r"<!--[\s\S]*?-->", " ", t)
    t = re.sub(r"</(p|div|li|h[1-6]|br|tr)>", "\n", t, flags=re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    for k, v in ENT.items():
        t = t.replace(k, v)
    t = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), t)
    t = re.sub(r"[ \t\f\v]+", " ", t)
    t = re.sub(r"\n\s*\n\s*", "\n", t)
    return t.strip()


EMAIL_RE = re.compile(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", re.I)
BAD_EMAIL = re.compile(r"\.(png|jpg|gif|webp)$|(example|sentry|wixpress|godaddy|squarespace)\.", re.I)


def emails_in(txt):
    out = []
    for e in EMAIL_RE.findall(txt):
        e = e.lower()
        if BAD_EMAIL.search(e) or e in out:
            continue
        out.append(e)
    return out


A_RE = re.compile(r"<a\b[^>]*href=[\"']([^\"'#]+)[\"'][^>]*>([\s\S]*?)</a>", re.I)


def pick_l2(html, base, limit):
    host = urlparse(base).netloc
    scored = []
    seen = {urlparse(base).path or '/'}
    for href, anchor in A_RE.findall(html):
        href = href.strip()
        if not href or href.startswith(('mailto:', 'tel:', 'javascript:')):
            continue
        try:
            u = urljoin(base, href)
        except Exception:
            continue
        p = urlparse(u)
        if p.scheme not in ('http', 'https') or p.netloc != host:
            continue
        if SKIP_EXT.search(p.path) or SOCIAL.search(p.netloc):
            continue
        path = (p.path + ' ' + html_to_text(anchor)).lower()
        score = sum(1 for k in L2_KEYWORDS if k in path)
        if score > 0:
            scored.append((score, u, p.path, path))
    scored.sort(key=lambda x: -x[0])
    picks = []
    for score, u, path, label in scored:
        if path in seen:
            continue
        seen.add(path)
        picks.append((u, label))
        if len(picks) >= limit:
            break
    return picks


# ---- which failures earn the rung ------------------------------------------------------------
CHALLENGE = re.compile(r"home_failed:(40[13]|429|50[023]|202|999)")


def is_candidate(rec):
    """Only the confirmed anti-bot subset. Thin shells are NOT candidates: probed 2026-09-16 on
    obsbasements.co.uk / geobond.co.uk / shieldpreservation.co.uk with a full Scrapling render
    (network_idle=True) and they came back 205 / 63 / 211 chars — they are genuinely near-empty
    pages (splash/frame/parked), not JS shells a renderer can fill. No rung recovers them."""
    st = rec.get('status', '')
    if st == 'ok':
        return False
    return bool(CHALLENGE.search(st))


recs = []
for ln in open(SITE, encoding='utf-8'):
    ln = ln.strip()
    if ln:
        recs.append(json.loads(ln))
cands = [r for r in recs if is_candidate(r)]
# most reviews first is not in the record; fall back to page-count/name order, the caller sorts
order = {}
try:
    import csv
    csv.field_size_limit(10 ** 7)
    for r in csv.DictReader(open(os.path.join(HERE, 'leads_domains.csv'), encoding='utf-8')):
        try:
            order[r['place_id']] = int(r['review_count'] or 0)
        except ValueError:
            order[r['place_id']] = 0
except Exception:
    pass
cands.sort(key=lambda r: -order.get(r['place_id'], 0))
mine = [r for i, r in enumerate(cands) if i % A.shards == A.shard]
if A.limit:
    mine = mine[:A.limit]
print('shard %d/%d: %d of %d candidates' % (A.shard, A.shards, len(mine), len(cands)), flush=True)

os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
from scrapling.fetchers import StealthySession

t0 = time.time()
deadline = t0 + A.deadline_min * 60
done = ok = 0
with open(OUT, 'w', encoding='utf-8') as fout, \
     StealthySession(headless=True, solve_cloudflare=True, timeout=A.timeout, max_pages=1,
                     disable_resources=False, block_ads=True) as sess:
    for rec in mine:
        if time.time() > deadline:
            print('DEADLINE hit after %d leads — %d not attempted' % (done, len(mine) - done), flush=True)
            break
        done += 1
        url = rec['website']
        try:
            page = sess.fetch(url)
            status, html = page.status, page.html_content or ''
        except Exception as e:
            status, html = 0, ''
            err = type(e).__name__
        else:
            err = ''
        text = html_to_text(html) if html else ''
        if not (200 <= (status or 0) < 400) or len(text) < 300:
            rec2 = dict(rec)
            # 502 + "upstream request failed" is THIS container's egress proxy refusing the host,
            # not the site's WAF — label it so the residue stays honest.
            if not err and status == 502 and 'upstream request failed' in (html or '').lower():
                rec2['status'] = 'scrapling_failed:proxy_502'
            else:
                rec2['status'] = 'scrapling_failed:%s' % (err or status)
            rec2['source'] = 'scrapling'
            fout.write(json.dumps(rec2, ensure_ascii=False) + '\n'); fout.flush()
            print('  x %d/%d %s %s %s' % (done, len(mine), rec2['status'], rec['name'][:40], url), flush=True)
            continue
        base = getattr(page, 'url', url) or url
        pages = [{'url': base, 'label': 'home', 'text': text[:HOME_CAP]}]
        for u, label in pick_l2(html, base, A.max_l2):
            if time.time() > deadline:
                break
            try:
                p2 = sess.fetch(u)
                if 200 <= (p2.status or 0) < 400 and p2.html_content:
                    t2 = html_to_text(p2.html_content)
                    if t2:
                        lab = (re.sub(r"[^a-z]", " ", label).strip().split(' ') or ['page'])[0] or 'page'
                        pages.append({'url': u, 'label': lab, 'text': t2[:L2_CAP]})
            except Exception:
                pass
        combined = '\n\n'.join('=== %s (%s) ===\n%s' % (p['label'], p['url'], p['text']) for p in pages)[:TOTAL_CAP]
        rec2 = dict(rec)
        rec2.update({'status': 'ok', 'pages': pages, 'emails': emails_in(combined)[:8],
                     'text': combined, 'pages_fetched': len(pages), 'source': 'scrapling'})
        fout.write(json.dumps(rec2, ensure_ascii=False) + '\n'); fout.flush()
        ok += 1
        print('  . %d/%d ok %dp %s' % (done, len(mine), len(pages), rec['name'][:40]), flush=True)

print('shard %d: attempted %d, recovered %d, %.1f min' % (A.shard, done, ok, (time.time() - t0) / 60), flush=True)
