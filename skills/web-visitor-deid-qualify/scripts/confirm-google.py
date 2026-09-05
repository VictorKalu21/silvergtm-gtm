#!/usr/bin/env python3
"""
Google-routed confirm: check Google Ads Transparency Center for active ads, by DOMAIN
(no page-id resolution needed). curl_cffi only gets the SPA shell, so render with Scrapling
(network_idle) to populate the ad DOM, then count creatives. Resume-safe.

  py -3.13 confirm-google.py   # env: RUN, DIR, CONC (default 2), COUNTRY (US)
"""
import os, re, json, asyncio, sys
from urllib.parse import urlparse
DIR = os.environ.get("DIR", ".")
RUN = os.environ.get("RUN", "run")
CONC = int(os.environ.get("CONC", "2"))
COUNTRY = os.environ.get("COUNTRY", "US")
OUT = f"{DIR}/{RUN}_google_adlib.json"
from scrapling.fetchers import StealthyFetcher

CREATIVE = re.compile(r'/advertiser/AR\d+/creative/CR\d+')
NORES = re.compile(r"no ads|couldn't find|no results", re.I)

def dom(u):
    try:
        h = urlparse(u if re.match(r"^https?:", u or "") else "https://" + (u or "")).hostname or ""
        return h.replace("www.", "").lower()
    except Exception:
        return (u or "").lower()

def render(domain):
    u = f"https://adstransparency.google.com/?region={COUNTRY}&domain={domain}"
    p = StealthyFetcher.fetch(u, headless=True, network_idle=True, timeout=90000)
    h = p.html_content or ""
    creatives = len(re.findall(CREATIVE, h))
    seen = creatives > 0 or "See all ads" in h or "Last shown" in h
    nores = bool(NORES.search(h)) and creatives == 0
    return {"channel": "google", "adlib_active": creatives > 0 or (seen and not nores),
            "creatives": creatives, "resolved_via": "transparency_domain", "http": p.status}

def load(p, d):
    try:
        with open(p, encoding="utf-8-sig") as f: return json.load(f)
    except FileNotFoundError: return d
def save(p, o):
    with open(p, "w", encoding="utf-8") as f: json.dump(o, f, indent=2)

async def main():
    keeps = load(f"{DIR}/{RUN}_google_keeps.json", [])
    done = load(OUT, {})
    todo = [k for k in keeps if k.get("name") not in done]
    print(f"google-routed={len(keeps)} done={len(done)} todo={len(todo)}", file=sys.stderr)
    sem = asyncio.Semaphore(CONC); lock = asyncio.Lock(); n = [0]
    async def work(k):
        async with sem:
            try:
                v = {"name": k["name"], **await asyncio.to_thread(render, dom(k.get("url")))}
            except Exception as e:
                v = {"name": k["name"], "channel": "google", "adlib_active": False, "retryable": True, "error": f"{type(e).__name__}"}
            async with lock:
                done[v["name"]] = v; n[0] += 1
                if n[0] % 10 == 0 or n[0] == len(todo):
                    save(OUT, done); print(f"  {n[0]}/{len(todo)} last={v['name']} active={v['adlib_active']} creatives={v.get('creatives')}", file=sys.stderr)
    await asyncio.gather(*(work(k) for k in todo))
    save(OUT, done)
    v = list(done.values())
    print(f"\n===== {RUN}: GOOGLE CONFIRM DONE =====", file=sys.stderr)
    print(f"active (PASS): {len([x for x in v if x.get('adlib_active')])} / {len(v)}", file=sys.stderr)

if __name__ == "__main__":
    asyncio.run(main())
