# -*- coding: utf-8 -*-
"""
Stage 1 — DISCOVER advertisers + page_ids for a vertical, FREE via Scrapling.

Usage:  py -3.13 discover.py <config.json> <workdir> [country|all]

Keyword search ONLY surfaces advertisers + their page_ids (capped ~30 ads/term, which is
all we need). The output discover_<country>.csv is then eyeballed to curate the allowlist
in the config before the stage-2 pull. Reads discovery_terms[country] from the config.

Requires Scrapling on py-3.13 (NOT 3.14):  py -3.13 -m pip install scrapling
"""
import json, re, time, csv, sys
from urllib.parse import quote
from collections import defaultdict
from scrapling.fetchers import StealthyFetcher

dec = json.JSONDecoder()

# Known keyword-collision junk categories (webnovel/drama apps, mobile games, ecommerce, streaming).
# These recur across verticals when generic terms over-match. We only FLAG (likely_junk=yes) so the
# human curation pass is faster — we never auto-drop, because a real advertiser could share a token.
JUNK = re.compile(
    r"\b(shein|temu|drama|dramabox|webfic|pocket ?fm|novel|romance|chapters|story|stories|"
    r"manga|webtoon|archero|game|gaming|royale|puzzle|casino|slots?|boutique|beauty|cosmetic|"
    r"perfume|fashion|jewel|clothing|streaming|movies?|tv\b|music|detroit|mated|shimmer)\b",
    re.I)

def fetch(country, q):
    url = ("https://www.facebook.com/ads/library/?active_status=all&ad_type=all"
           f"&country={country}&q={quote(q)}&media_type=all&search_type=keyword_unordered")
    p = StealthyFetcher.fetch(url, headless=True, solve_cloudflare=True,
                              network_idle=True, timeout=90000)
    return p.html_content if hasattr(p, "html_content") else str(p)

def ads(h):
    out = []
    for m in re.finditer(r'\{"ad_archive_id"', h):
        try:
            o, _ = dec.raw_decode(h, m.start()); out.append(o)
        except Exception:
            pass
    return out

def run(country, terms):
    # key = (page_id, page_name) -> [ad_count, set(terms), text_ads, active_ads, page_url]
    pages = defaultdict(lambda: [0, set(), 0, 0, ""])
    for q in terms:
        try:
            h = fetch(country, q)
        except Exception as e:
            print(f"  ERR {q!r}", repr(e)[:80], flush=True); continue
        a = ads(h)
        for ad in a:
            s = ad.get("snapshot") or {}
            pid = ad.get("page_id", "")
            name = s.get("page_name", "?")
            k = (pid, name)
            pages[k][0] += 1
            pages[k][1].add(q)
            b = s.get("body")
            txt = (b.get("text") if isinstance(b, dict) else b) or ""
            if txt.strip():
                pages[k][2] += 1
            if ad.get("is_active"):
                pages[k][3] += 1
            if not pages[k][4]:
                pages[k][4] = s.get("page_profile_uri", "")
        print(f"  [{country}] {q:28} -> {len(a)} ads", flush=True)
        time.sleep(1)
    return pages

def dump(workdir, country, pages):
    ranked = sorted(pages.items(), key=lambda kv: -kv[1][0])
    junk_n = sum(1 for (pid, name), _ in ranked if JUNK.search(name or ""))
    print(f"\n===== {country} ADVERTISERS FOUND ({len(ranked)}; {junk_n} flagged likely_junk) =====", flush=True)
    for (pid, name), (n, terms, txt, active, url) in ranked[:40]:
        flag = " [JUNK?]" if JUNK.search(name or "") else ""
        print(f"  {n:3}ads active={active:2} txt={txt:2}  {name[:38]:38} id={pid:18} terms={len(terms)}{flag}", flush=True)
    fn = f"{workdir}\\discover_{country}.csv"
    with open(fn, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["country","page_id","page_name","ad_hits","active_hits","text_hits","n_terms","likely_junk","matched_terms","page_url"])
        for (pid, name), (n, terms, txt, active, url) in ranked:
            junk = "yes" if JUNK.search(name or "") else ""
            w.writerow([country, pid, name, n, active, txt, len(terms), junk, "|".join(sorted(terms)), url])
    print(f"  WROTE -> {fn}  (sort by likely_junk to speed the curation pass)", flush=True)

def main():
    cfg = json.load(open(sys.argv[1], encoding="utf-8"))
    workdir = sys.argv[2]
    which = sys.argv[3] if len(sys.argv) > 3 else "all"
    countries = cfg["countries"] if which == "all" else [which]
    for c in countries:
        terms = cfg["discovery_terms"].get(c, [])
        print(f"### {cfg['display_name']} — {c} discovery ({len(terms)} terms) ###", flush=True)
        dump(workdir, c, run(c, terms))

if __name__ == "__main__":
    main()
