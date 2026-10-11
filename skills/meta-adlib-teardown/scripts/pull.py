# -*- coding: utf-8 -*-
"""
Stage 2 — FULL PAGINATED PULL of every ad for each allowlisted advertiser, FREE via Scrapling.

Usage:  py -3.13 pull.py <config.json> <workdir>

Reads the curated `allowlist` from the config (set it after eyeballing stage-1's
discover_<country>.csv). For each page it captures the WHOLE ad history (active + inactive),
not just the ~30-ad first payload, by attaching a Playwright response handler and harvesting
every {"ad_archive_id"...} object from each GraphQL response during a scroll. Dedupes by
archive id, angle-tags each ad with the config's angle_taxonomy, sorts by days_running, and
writes swipe_file_full.csv.

days_running is the winning-ad proxy (Meta publishes no spend/impressions for commercial ads).
"""
import json, re, csv, time, sys
from datetime import datetime, timezone
from scrapling.fetchers import StealthyFetcher

dec = json.JSONDecoder()

def build_tagger(taxonomy):
    rx = {k: re.compile(v, re.I) for k, v in taxonomy.items()}
    def tag(txt):
        hits = [k for k, r in rx.items() if r.search(txt or "")]
        return "|".join(hits) if hits else "(untagged)"
    return tag

def extract_ads(blob):
    out = []
    for m in re.finditer(r'\{"ad_archive_id"', blob):
        try:
            o, _ = dec.raw_decode(blob, m.start()); out.append(o)
        except Exception:
            pass
    return out

def total_count(html):
    m = re.search(r'"search_results_connection":\{"count":(\d+)', html)
    return int(m.group(1)) if m else None

def ts(v):
    try:
        return datetime.fromtimestamp(int(v), tz=timezone.utc).strftime("%Y-%m-%d")
    except Exception:
        return ""

def flat(tag, name, country, tot, ad):
    snap = ad.get("snapshot") or {}
    start = ad.get("start_date") or snap.get("start_date")
    end = ad.get("end_date") or snap.get("end_date")
    tat = ad.get("total_active_time") or snap.get("total_active_time")
    b = snap.get("body"); body = ""
    if isinstance(b, dict): body = b.get("text") or ""
    elif isinstance(b, str): body = b
    cards = snap.get("cards") or []
    if not body and cards: body = cards[0].get("body") or ""
    link = snap.get("link_url") or (cards[0].get("link_url") if cards else "")
    cta = snap.get("cta_text") or (cards[0].get("cta_text") if cards else "")
    title = snap.get("title") or (cards[0].get("title") if cards else "")
    days = ""
    try:
        if tat: days = round(int(tat) / 86400, 1)
        elif start: days = round(((int(end) if end else int(time.time())) - int(start)) / 86400, 1)
    except Exception:
        pass
    body = re.sub(r"\s+", " ", body or "").strip()
    return {"advertiser": name, "country": country, "page_total_ads": tot,
            "ad_archive_id": ad.get("ad_archive_id", ""), "is_active": ad.get("is_active", ""),
            "variants": ad.get("collation_count", ""), "start_date": ts(start),
            "end_date": ts(end) if end else ("(running)" if ad.get("is_active") else ""),
            "days_running": days, "display_format": snap.get("display_format", ""),
            "angle": tag(body + " " + (title or "")),
            "cta": cta, "title": (title or "")[:120], "link_url": link, "body": body[:1500]}

def pull_page(pid, country, name):
    url = ("https://www.facebook.com/ads/library/?active_status=all&ad_type=all"
           f"&country={country}&view_all_page_id={pid}&media_type=all")
    bodies = []
    def act(page):
        def on_response(resp):
            try:
                if "/api/graphql" in resp.url or "/ads/library" in resp.url:
                    t = resp.text()
                    if '"ad_archive_id"' in t:
                        bodies.append(t)
            except Exception:
                pass
        page.on("response", on_response)
        seen_n, flat_streak = 0, 0
        for i in range(45):
            page.mouse.wheel(0, 40000)
            page.keyboard.press("End")
            page.wait_for_timeout(2500)
            cur = sum(len(set(re.findall(r'"ad_archive_id":"(\d+)"', b))) for b in bodies)
            if cur == seen_n:
                flat_streak += 1
                if flat_streak >= 4 and i > 5:
                    break
            else:
                flat_streak = 0
            seen_n = cur
        return page
    p = StealthyFetcher.fetch(url, headless=True, solve_cloudflare=True,
                              network_idle=True, timeout=300000, page_action=act)
    html = p.html_content if hasattr(p, "html_content") else str(p)
    tot = total_count(html)
    all_ads = {}
    for blob in bodies + [html]:
        for ad in extract_ads(blob):
            aid = ad.get("ad_archive_id")
            if aid and aid not in all_ads:
                all_ads[aid] = ad
    return tot, list(all_ads.values())

def main():
    global tag
    cfg = json.load(open(sys.argv[1], encoding="utf-8"))
    workdir = sys.argv[2]
    tag = build_tagger(cfg["angle_taxonomy"])
    exclude = set(cfg.get("exclude", []))
    pages = [(p, c, n) for (p, c, n) in cfg["allowlist"] if p not in exclude]
    print(f"Pulling {len(pages)} advertisers for '{cfg['vertical']}'", flush=True)
    rows = []
    for pid, country, name in pages:
        print(f"=== {name} ({country}/{pid}) ===", flush=True)
        try:
            tot, ads = pull_page(pid, country, name)
        except Exception as e:
            print("  ERR", repr(e)[:100]); continue
        print(f"  page_total={tot}  captured={len(ads)}", flush=True)
        for ad in ads:
            rows.append(flat(tag, name, country, tot, ad))
        time.sleep(2)
    rows.sort(key=lambda r: -(r["days_running"] if isinstance(r["days_running"], float) else 0))
    cols = ["advertiser","country","page_total_ads","ad_archive_id","is_active","variants",
            "start_date","end_date","days_running","display_format","angle","cta","title","link_url","body"]
    fn = f"{workdir}\\swipe_file_full.csv"
    with open(fn, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=cols); w.writeheader()
        for r in rows: w.writerow(r)
    print(f"\nWROTE {len(rows)} rows -> {fn}")

if __name__ == "__main__":
    main()
