#!/usr/bin/env python3
"""
STEP 6 (pixel-routed, render-free): confirm each B2B keep is ACTIVELY advertising, by
checking ONLY the ad library its pixel indicates -- so we never render a browser for the
common case. B2B tech lives on LinkedIn/Google, not Meta (pilot: 76% LinkedIn, 34% Meta).

Routing (per keep's primaryPixels):
  linkedin pixel -> LinkedIn Ad Library via curl_cffi (accountOwner=<company>) -> ad count/presence
  google  pixel  -> trust the AW- pixel as proof of active Google Ads (no library call)
  meta-only      -> tagged 'meta_pending' (handled later by adlib_confirm.py render batch)

LinkedIn is a plain curl_cffi GET (~1s, free, no browser). Threaded, resume-safe per name.
Output {RUN}_adlib.json is schema-compatible with merge.mjs final (adlib_active + fields).

  py -3.13 confirm-ads.py     # env: RUN, DIR, CONC (default 12)
"""
import os, re, json, sys, time, random
from urllib.parse import quote
from curl_cffi import requests as cr

DIR = os.environ.get("DIR", ".")
RUN = os.environ.get("RUN", "run")
DELAY = float(os.environ.get("DELAY", "4"))     # base polite delay between LinkedIn hits
LIMIT = int(os.environ.get("LIMIT", "0"))       # >0 = only process first N linkedin cos (gentle test)
OUT = f"{DIR}/{RUN}_adlib.json"

def load(path, default):
    try:
        with open(path, "r", encoding="utf-8-sig") as f:
            return json.load(f)
    except FileNotFoundError:
        return default

def save(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2)

DETAIL_RE = re.compile(r'/ad-library/detail/(\d+)')
COUNT_RE = re.compile(r'([\d,]+)\s+ad[s]?\b', re.I)
NOADS_RE = re.compile(r"(doesn'?t have any ads|no ads to show|no results found)", re.I)

def linkedin_confirm(name):
    # polite + resilient: LinkedIn ad library 429s on bursts. Back off on 429, don't misread
    # a 429/empty as "no ads". Returns http=429 (retryable) so the caller can leave it un-final.
    url = f"https://www.linkedin.com/ad-library/search?accountOwner={quote(name)}"
    backoff = [30, 60, 120]
    for attempt in range(len(backoff) + 1):
        try:
            r = cr.get(url, impersonate="chrome124", timeout=25)
        except Exception as e:
            # transient network/DNS blip (e.g. contention) -> back off + retry, never crash
            if attempt < len(backoff):
                time.sleep(backoff[attempt] + random.uniform(0, 5)); continue
            return {"channel": "linkedin", "adlib_active": False, "http": None,
                    "resolved_via": "linkedin_accountOwner", "retryable": True, "error": f"{type(e).__name__}"}
        if r.status_code == 429:
            if attempt < len(backoff):
                time.sleep(backoff[attempt] + random.uniform(0, 5)); continue
            return {"channel": "linkedin", "adlib_active": False, "http": 429,
                    "resolved_via": "linkedin_accountOwner", "retryable": True}
        html = r.text
        ids = set(DETAIL_RE.findall(html))
        noads = bool(NOADS_RE.search(html))
        m = COUNT_RE.search(html)
        return {"channel": "linkedin", "adlib_active": len(ids) > 0 and not noads,
                "li_ad_ids_on_page": len(ids), "active_count_text": (m.group(0) if m else None),
                "resolved_via": "linkedin_accountOwner", "http": r.status_code}

def li_query(keep):
    # best accountOwner key: LinkedIn URL vanity (hyphens->spaces, title-case) beats the
    # messy Apollo name (domain-form, Inc/LLC, acquired->renamed all cause false negatives).
    v = keep.get("liVanity")
    if v:
        return " ".join(w.capitalize() for w in re.split(r"[-_]", v) if w)
    n = (keep.get("name") or "").split("|")[0].split(",")[0].strip()
    n = re.sub(r"\b(inc|llc|ltd|corp|co|gmbh|plc)\.?$", "", n, flags=re.I).strip()
    n = re.sub(r"\.(ai|com|io|co|app|dev|net|xyz)$", "", n, flags=re.I).strip()
    return n

def route(keep):
    name = keep.get("name")
    pix = keep.get("primaryPixels") or []
    try:
        if "linkedin" in pix:
            return {"name": name, "li_query": li_query(keep), **linkedin_confirm(li_query(keep))}
        if "google_ads" in pix:
            # AW- conversion pixel = active Google Ads; trust as confirmation (no library call)
            return {"name": name, "channel": "google", "adlib_active": True,
                    "active_count_text": "google_pixel", "resolved_via": "aw_pixel_trust"}
        # meta-only or none: defer to the render batch
        return {"name": name, "channel": "meta_only" if "meta" in pix else "none",
                "adlib_active": False, "resolved_via": "meta_pending"}
    except Exception as e:
        return {"name": name, "adlib_active": False, "error": f"{type(e).__name__}: {e}"}

def main():
    keeps = load(f"{DIR}/{RUN}_keeps.json", [])
    done = load(OUT, {})
    # a prior 429 (retryable) is NOT final -> redo it
    def needs(k):
        v = done.get(k.get("name"))
        return v is None or v.get("retryable")
    # instant (no-network) rows: google pixel-trust + meta_pending -> resolve immediately
    li_todo = []
    for k in keeps:
        if not needs(k):
            continue
        pix = k.get("primaryPixels") or []
        if "linkedin" in pix:
            li_todo.append(k)
        else:
            done[k["name"]] = route(k)  # google/meta/none, no network
    if LIMIT:
        li_todo = li_todo[:LIMIT]
    save(OUT, done)
    print(f"keeps={len(keeps)} linkedin-to-fetch={len(li_todo)} DELAY={DELAY}s (polite/sequential)", file=sys.stderr)
    for i, k in enumerate(li_todo, 1):
        q = li_query(k)
        try:
            v = {"name": k["name"], "li_query": q, **linkedin_confirm(q)}
        except Exception as e:
            v = {"name": k["name"], "li_query": q, "channel": "linkedin", "adlib_active": False,
                 "retryable": True, "error": f"{type(e).__name__}: {e}"}
        done[v["name"]] = v
        if i % 10 == 0 or i == len(li_todo):
            save(OUT, done)
            print(f"  {i}/{len(li_todo)} last={v['name']} http={v.get('http')} active={v['adlib_active']} ({v.get('active_count_text')})", file=sys.stderr)
        if i < len(li_todo):
            time.sleep(DELAY + random.uniform(0, DELAY))  # jitter
    save(OUT, done)
    vals = list(done.values())
    li = [v for v in vals if v.get("channel") == "linkedin"]
    print(f"\n===== {RUN}: PIXEL-ROUTED CONFIRM DONE =====", file=sys.stderr)
    print(f"LinkedIn-confirmed active : {len([v for v in li if v['adlib_active']])} / {len(li)} linkedin-routed", file=sys.stderr)
    print(f"Google pixel-trusted      : {len([v for v in vals if v.get('channel')=='google'])}", file=sys.stderr)
    print(f"Meta-pending (render later): {len([v for v in vals if v.get('channel')=='meta_only'])}", file=sys.stderr)
    print(f"TOTAL adlib_active (PASS)  : {len([v for v in vals if v['adlib_active']])} / {len(vals)}", file=sys.stderr)

if __name__ == "__main__":
    main()
