#!/usr/bin/env python3
"""web-scrape-triage Tier 3 (free rung): Scrapling StealthyFetcher render for sites fetch-sites.js could not read —
403/anti-bot blocks and JS-rendered shells that came back 'ok' with empty text. Home page only, rendered.
Writes records in fetch-sites.js's site_text.jsonl shape to owner-scrapling/site_text.jsonl (resumable).
Usage: python3 pull/scrapling-fetch.py --shard K --of N [--in leads_scrapling_stealth.csv]"""
import csv, json, os, re, sys, html, signal
from scrapling.fetchers import StealthyFetcher
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
K = int(sys.argv[sys.argv.index("--shard") + 1]); N = int(sys.argv[sys.argv.index("--of") + 1])
OUT = f"owner-scrapling/site_text.{K}.jsonl"; os.makedirs("owner-scrapling", exist_ok=True)
done = set()
if os.path.exists(OUT):
    for l in open(OUT):
        if l.strip(): done.add(json.loads(l)["place_id"])
IN = sys.argv[sys.argv.index("--in") + 1] if "--in" in sys.argv else "leads_scrapling.csv"
todo = [r for i, r in enumerate(csv.DictReader(open(IN))) if i % N == K and r["place_id"] not in done]
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
BAD = re.compile(r"\.(png|jpe?g|gif|svg|webp)$|example\.com|sentry|wixpress|domain\.com", re.I)
def to_text(h):
    h = re.sub(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", h)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"(?s)<[^>]+>", " ", h))).strip()
class TO(Exception): pass
def alarm(*_): raise TO()
signal.signal(signal.SIGALRM, alarm)
for r in todo:
    rec = {k: r.get(k, "") for k in ("place_id", "name", "website", "neighborhood", "city", "full_address")}
    rec["phone"] = r.get("phone_number", "")
    try:
        signal.alarm(90)
        p = StealthyFetcher.fetch(r["website"], headless=True, solve_cloudflare=True, timeout=45000, network_idle=True)
        signal.alarm(0)
        body = p.body.decode("utf-8", "ignore") if isinstance(p.body, bytes) else str(p.body)
        text = to_text(body)[:20000]
        blocked = re.search(r"Attention Required|Just a moment|verify you are human|Access denied", text[:400], re.I)
        ok = p.status == 200 and len(text) >= 200 and not blocked
        mails = sorted({m.lower() for m in EMAIL.findall(body) if not BAD.search(m)})
        rec.update(status="ok" if ok else f"home_failed:{p.status}{'_challenge' if blocked else ''}",
                   pages=[{"url": r["website"], "label": "home", "text": text if ok else ""}],
                   emails=mails if ok else [], emails_by_source={"scrapling": mails} if ok and mails else {},
                   text=f"=== home ({r['website']}) ===\n{text}" if ok else "", pages_fetched=1 if ok else 0, source="scrapling")
    except TO:
        rec.update(status="home_failed:scrapling_timeout", pages=[], emails=[], emails_by_source={}, text="", pages_fetched=0, source="scrapling")
    except Exception as e:
        signal.alarm(0)
        rec.update(status="home_failed:" + type(e).__name__, pages=[], emails=[], emails_by_source={}, text="", pages_fetched=0, source="scrapling")
    with open(OUT, "a") as f: f.write(json.dumps(rec) + "\n")
    print(rec["status"], rec["name"][:40], flush=True)
