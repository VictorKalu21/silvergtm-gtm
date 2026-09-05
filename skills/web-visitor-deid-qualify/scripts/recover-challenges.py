#!/usr/bin/env python3
"""
RECOVERY part B: drop_no_pixel rows whose HTML was a JS/Cloudflare challenge page (we never
saw the real site). Render them with Scrapling StealthyFetcher(solve_cloudflare=True) so the
JS executes and pixels appear in the DOM, then re-run the same free gates. Resume-safe.

  py -3.13 recover-challenges.py    # env: RUN, DIR, CONC (default 4)

Rendered HTML already contains GTM-injected pixels, so no separate GTM-container crack needed.
"""
import os, re, json, asyncio, sys
DIR = os.environ.get("DIR", ".")
RUN = os.environ.get("RUN", "run")
CONC = int(os.environ.get("CONC", "4"))
SIG = f"{DIR}/{RUN}_signal.json"
OUT = f"{DIR}/{RUN}_challenge_recover.json"
from scrapling.fetchers import StealthyFetcher

CF = re.compile(r"just a moment|checking your browser|cf-browser-verification|enable javascript and cookies|attention required|challenge-platform|_cf_chl", re.I)
PAID = {
    "google_ads": [re.compile(r"AW-\d{6,}"), re.compile(r"gtag/js\?id=AW-", re.I)],
    "meta": [re.compile(r"fbq\s*\(", re.I), re.compile(r"connect\.facebook\.net/[^\"']*/fbevents\.js", re.I), re.compile(r"facebook\.com/tr\?id=\d", re.I)],
    "linkedin": [re.compile(r"snap\.licdn\.com/li\.lms-analytics/insight\.min\.js", re.I), re.compile(r"_linkedin_partner_id", re.I)],
}
DEID = [re.compile(p, re.I) for p in [r"knock2", r"\brb2b\b", r"s\.rb2b\.com", r"lftracker", r"lfeeder", r"albacross", r"warmly\.ai|getwarmly",
        r"clearbitjs\.com|x\.clearbit\.com", r"vector\.co|getvector", r"getkoala\.com", r"snitcher", r"leadforensics", r"6sc\.co|6sense",
        r"demandbase|company-target\.com", r"ws\.zoominfo\.com", r"factors\.ai", r"opensend"]]
SALES = re.compile(r"book a demo|request a demo|get a demo|schedule a demo|talk to (sales|an expert|us)|contact sales|see it in action|request (a )?(quote|pricing|consultation|proposal)|get (a )?quote|start (a |your )?(free )?trial|get started|speak (to|with) (an? )?(expert|specialist|advisor|rep)", re.I)
FORM = re.compile(r"<form[\s>]", re.I)
TEL = re.compile(r"href=[\"']tel:", re.I)
def anyp(t, ps): return any(p.search(t) for p in ps)

def load(p, d):
    try:
        with open(p, encoding="utf-8-sig") as f: return json.load(f)
    except FileNotFoundError: return d
def save(p, o):
    with open(p, "w", encoding="utf-8") as f: json.dump(o, f, indent=2)

def render(url):
    p = StealthyFetcher.fetch(url, headless=True, network_idle=True, solve_cloudflare=True, timeout=90000)
    return p.status, (p.html_content or "")

async def main():
    sig = load(SIG, [])
    targets = [r for r in sig if r.get("status") == "drop_no_pixel" and CF.search(r.get("text") or "")]
    done = load(OUT, {})
    todo = [r for r in targets if r.get("name") not in done]
    print(f"challenge pages: {len(targets)} | done: {len(done)} | todo: {len(todo)}", file=sys.stderr)
    sem = asyncio.Semaphore(CONC); lock = asyncio.Lock(); n = [0]
    async def work(r):
        async with sem:
            name, url = r.get("name"), r.get("url")
            try:
                st, html = await asyncio.to_thread(render, url)
                primary = [k for k, ps in PAID.items() if anyp(html, ps)]
                deid = anyp(html, DEID)
                routes = bool(SALES.search(html)) or bool(FORM.search(html)) or bool(TEL.search(html))
                status = "drop_deid" if deid else ("recovered_pass" if (primary and routes) else
                         ("recovered_no_sales" if primary else "still_no_pixel"))
                v = {"name": name, "http": st, "primaryPixels": primary, "hasDeid": deid,
                     "routesToSales": routes, "recovered_status": status}
            except Exception as e:
                v = {"name": name, "recovered_status": "render_fail", "error": f"{type(e).__name__}"}
            async with lock:
                done[name] = v; n[0] += 1
                if n[0] % 10 == 0 or n[0] == len(todo):
                    save(OUT, done)
                    print(f"  {n[0]}/{len(todo)} last={name} -> {v['recovered_status']}", file=sys.stderr)
    await asyncio.gather(*(work(r) for r in todo))
    save(OUT, done)
    v = list(done.values())
    passed = [x for x in v if x.get("recovered_status") == "recovered_pass"]
    print(f"\n===== {RUN}: CHALLENGE RECOVERY DONE =====", file=sys.stderr)
    print(f"newly PASS free gates: {len(passed)} / {len(v)} rendered", file=sys.stderr)
    print(f"  recovered_no_sales: {len([x for x in v if x.get('recovered_status')=='recovered_no_sales'])}", file=sys.stderr)
    print(f"  drop_deid (found a de-id tool): {len([x for x in v if x.get('recovered_status')=='drop_deid'])}", file=sys.stderr)
    print(f"  still no pixel: {len([x for x in v if x.get('recovered_status')=='still_no_pixel'])}", file=sys.stderr)
    print(f"  render_fail: {len([x for x in v if x.get('recovered_status')=='render_fail'])}", file=sys.stderr)

if __name__ == "__main__":
    asyncio.run(main())
