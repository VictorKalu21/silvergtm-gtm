# -*- coding: utf-8 -*-
"""
Stage 5 (optional) — pull the REAL creative of the top-N LIVE winners, FREE via Scrapling.

Usage:  py -3.13 fetch-creatives.py <workdir> [N=5]

Reads <workdir>/swipe_file_full.csv, picks the top N by days_running FILTERED TO is_active
(one ad per advertiser), re-fetches each ad's single-ad page to read the REAL media (not the
unreliable display_format), and downloads a still (video preview frame or image) to
<workdir>/creatives/. Then a human/vision pass describes what's actually in each.

WHY only the top few: copy + format metadata miss what's ON SCREEN (real crew vs stock vs
review card vs before/after), and that's often the biggest creative lesson — but fetching media
is the expensive step, so cap it at the proven winners. GOTCHA: display_format AND the snapshot
videos[] array can both mislabel a video as an image; confirm video-vs-image by eye.
"""
import json, re, sys, csv, urllib.request, os
from scrapling.fetchers import StealthyFetcher

WORK = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 5
OUT = WORK + r"\creatives"; os.makedirs(OUT, exist_ok=True)
dec = json.JSONDecoder()

def top_live(n):
    rows = list(csv.DictReader(open(WORK + r"\swipe_file_full.csv", encoding="utf-8-sig")))
    def dr(r):
        try: return float(r["days_running"])
        except: return 0.0
    live = [r for r in rows if str(r.get("is_active", "")).lower() == "true"]
    best = {}
    for r in sorted(live, key=lambda r: -dr(r)):
        a = r["advertiser"]
        if a not in best:
            best[a] = r
    return list(best.values())[:n]

def extract(blob):
    out = []
    for m in re.finditer(r'\{"ad_archive_id"', blob):
        try:
            o, _ = dec.raw_decode(blob, m.start()); out.append(o)
        except Exception:
            pass
    return out

def media_of(snap):
    vids = snap.get("videos") or []; imgs = snap.get("images") or []; cards = snap.get("cards") or []
    if vids:
        v = vids[0]; return "VIDEO", v.get("video_preview_image_url"), (v.get("video_hd_url") or v.get("video_sd_url"))
    if imgs:
        im = imgs[0]; return "IMAGE", (im.get("original_image_url") or im.get("resized_image_url")), None
    if cards:
        c = cards[0]
        if c.get("video_preview_image_url"):
            return "CAROUSEL/VIDEO", c.get("video_preview_image_url"), (c.get("video_hd_url") or c.get("video_sd_url"))
        return "CAROUSEL", (c.get("original_image_url") or c.get("resized_image_url")), None
    return "UNKNOWN", None, None

def dl(url, path):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
            f.write(r.read())
        return True
    except Exception as e:
        print("   DL FAIL", repr(e)[:80]); return False

def safe(s): return re.sub(r"[^A-Za-z0-9]+", "", s or "")[:30]

for r in top_live(N):
    aid = r["ad_archive_id"]; name = safe(r["advertiser"]); days = r["days_running"]
    print(f"=== {r['advertiser']} ({aid}, {days}d, fmt={r.get('display_format')}) ===", flush=True)
    url = f"https://www.facebook.com/ads/library/?id={aid}"
    try:
        p = StealthyFetcher.fetch(url, headless=True, solve_cloudflare=True, network_idle=True, timeout=90000)
        html = p.html_content if hasattr(p, "html_content") else str(p)
    except Exception as e:
        print("   FETCH FAIL", repr(e)[:80]); continue
    ads = extract(html)
    ad = next((a for a in ads if a.get("ad_archive_id") == aid), ads[0] if ads else None)
    if not ad:
        print("   no ad object found"); continue
    mt, still, vurl = media_of(ad.get("snapshot") or {})
    print(f"   REAL media_type={mt}  still={still}")
    if vurl: print(f"   video={vurl}")
    if still and dl(still, f"{OUT}\\{days}d_{name}.jpg"):
        print(f"   saved -> creatives\\{days}d_{name}.jpg  (open it + describe what's actually shown)")
print("DONE — now open each still and describe the real creative (proof device, on-image text, before/after, etc.)")
