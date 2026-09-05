#!/usr/bin/env python3
"""
STEP 6 (HARD GATE): confirm each free-gate survivor is ACTIVELY running Meta ads,
by exact Facebook Page ID (not keyword search -- keyword matches anyone who mentions
the brand). Uses Scrapling StealthyFetcher, the only rung that clears Meta's 403 WAF.

Per company:
  1. resolve Page ID: render facebook.com/<fbHandle> -> regex a numeric pageID
     (fallback: Ad Library page-search by company name, take best name match)
  2. query Ad Library view_all_page_id=<id>, active_status=active -> read the
     "~N results" count. count>0 => PASS (confirmed active ads), else DROP.

Resume-safe: appends each verdict to {RUN}_adlib.json keyed by company name; re-runs
skip already-done names. Modest concurrency (renders are ~40s each).

  py -3.13 adlib_confirm.py            # env: RUN, DIR, CONC (default 3)

Requires: pip install "scrapling[fetchers]" ; scrapling install
"""
import os, re, json, asyncio, sys

DIR = os.environ.get("DIR", ".")
RUN = os.environ.get("RUN", "run")
CONC = int(os.environ.get("CONC", "3"))
COUNTRY = os.environ.get("COUNTRY", "US")

from scrapling.fetchers import StealthyFetcher

SIG = f"{DIR}/{RUN}_signal.json"
OUT = f"{DIR}/{RUN}_adlib.json"

RESULTS_RE = re.compile(r'([~\d,]+)\s*results', re.I)
PAGEID_RES = [
    re.compile(r'"pageID":"(\d{5,})"'),
    re.compile(r'"page_id":"(\d{5,})"'),
    re.compile(r'"entity_id":"(\d{5,})"'),
    re.compile(r'"delegate_page":\{"id":"(\d{5,})"'),
    re.compile(r'profile_id=(\d{5,})'),
]

def render(url):
    p = StealthyFetcher.fetch(url, headless=True, network_idle=True, timeout=90000)
    return p.status, (p.html_content or "")

def resolve_page_id(rec):
    handle = rec.get("fbHandle")
    if handle:
        st, html = render(f"https://www.facebook.com/{handle}")
        for rx in PAGEID_RES:
            m = rx.search(html)
            if m:
                return m.group(1), "fb_page"
    # fallback: Ad Library page-search by company name, take a page whose name matches
    name = (rec.get("name") or "").strip()
    if name:
        q = re.sub(r"[^A-Za-z0-9 ]", "", name)
        url = (f"https://www.facebook.com/ads/library/?active_status=active&ad_type=all"
               f"&country={COUNTRY}&q={q}&search_type=page&media_type=all")
        st, html = render(url)
        pairs = re.findall(r'"page_id":"?(\d{5,})"?,"[^}]*?"page_name":"([^"]{1,80})"', html)
        low = name.lower()
        for pid, pname in pairs:
            pn = pname.lower()
            if pn and (pn in low or low in pn or pn.split()[0] == low.split()[0]):
                return pid, "adlib_namematch"
    return None, "unresolved"

def active_ads(page_id):
    url = (f"https://www.facebook.com/ads/library/?active_status=active&ad_type=all"
           f"&country={COUNTRY}&view_all_page_id={page_id}&media_type=all")
    st, html = render(url)
    m = RESULTS_RE.search(html)
    lib_ids = len(re.findall(r'Library ID', html))
    count_txt = m.group(1) if m else None
    n = None
    if count_txt:
        digits = re.sub(r"[^\d]", "", count_txt)
        n = int(digits) if digits else 0
    has = bool(count_txt) and lib_ids > 0
    return {"active_count_text": count_txt, "active_count": n, "ad_cards": lib_ids, "adlib_active": has}

def load(path, default):
    try:
        with open(path, "r", encoding="utf-8-sig") as f:
            return json.load(f)
    except FileNotFoundError:
        return default

def save(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2)

async def main():
    rows = load(SIG, [])
    # Prefer the post-classify B2B keeps (step 5) so we only pay for renders on real B2B.
    keeps = load(f"{DIR}/{RUN}_keeps.json", None)
    if keeps:
        keep_names = {k.get("name") for k in keeps}
        survivors = [r for r in rows if r.get("name") in keep_names]
        print(f"using {RUN}_keeps.json (post-classify): {len(survivors)} B2B keeps", file=sys.stderr)
    else:
        survivors = [r for r in rows if r.get("status") == "pass_free_gates"]
        print(f"no keeps file -- using all free-gate survivors: {len(survivors)}", file=sys.stderr)
    done = load(OUT, {})
    todo = [r for r in survivors if r.get("name") not in done]
    print(f"survivors={len(survivors)} already_done={len(done)} todo={len(todo)}", file=sys.stderr)

    sem = asyncio.Semaphore(CONC)
    lock = asyncio.Lock()
    n_done = [0]

    async def work(rec):
        async with sem:
            name = rec.get("name")
            try:
                pid, how = await asyncio.to_thread(resolve_page_id, rec)
                if not pid:
                    verdict = {"name": name, "page_id": None, "resolved_via": how, "adlib_active": False, "reason": "no_page_id"}
                else:
                    aa = await asyncio.to_thread(active_ads, pid)
                    verdict = {"name": name, "page_id": pid, "resolved_via": how, **aa}
            except Exception as e:
                verdict = {"name": name, "adlib_active": False, "error": f"{type(e).__name__}: {e}"}
            async with lock:
                done[name] = verdict
                n_done[0] += 1
                if n_done[0] % 5 == 0 or n_done[0] == len(todo):
                    save(OUT, done)
                    print(f"  {n_done[0]}/{len(todo)}  last={name} active={verdict.get('adlib_active')} ({verdict.get('active_count_text')})", file=sys.stderr)

    await asyncio.gather(*(work(r) for r in todo))
    save(OUT, done)
    passed = [v for v in done.values() if v.get("adlib_active")]
    print(f"\n===== {RUN}: AD-LIB CONFIRM DONE =====", file=sys.stderr)
    print(f"confirmed active (PASS): {len(passed)} / {len(done)} resolved", file=sys.stderr)
    print(f"unresolved page-id: {len([v for v in done.values() if not v.get('page_id')])}", file=sys.stderr)

if __name__ == "__main__":
    asyncio.run(main())
