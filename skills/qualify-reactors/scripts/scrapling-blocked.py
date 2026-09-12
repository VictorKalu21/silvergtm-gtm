# scrapling-blocked.py — Stage 7. FREE anti-bot recovery of the Cloudflare/403-blocked rows.
# Reads b2b_verify.jsonl, takes bucket=="blocked", runs Scrapling StealthyFetcher(solve_cloudflare=True),
# prunes to text, writes pages_blocked.jsonl in the SAME shape as pages.jsonl (feeds the LLM adjudicator).
# Try this BEFORE paying for Firecrawl — it recovers ~75-80% of Cloudflare-walled sites for free.
# Resume-safe. Install once: pip install "scrapling[fetchers]" ; scrapling install
# Run:  py -3.13 scrapling-blocked.py     (cwd = run folder)
import json, os, re
CFG = json.load(open(os.environ.get("CONFIG", "config.json"), "r", encoding="utf-8"))
CAP = (CFG.get("fetch") or {}).get("text_cap", 3000)

blocked = [json.loads(l) for l in open("b2b_verify.jsonl","r",encoding="utf-8") if l.strip()]
blocked = [b for b in blocked if b.get("bucket") == "blocked"]
OUT = "pages_blocked.jsonl"
done = set()
if os.path.exists(OUT):
    for l in open(OUT,"r",encoding="utf-8"):
        if l.strip():
            try: done.add(json.loads(l)["domain"])
            except: pass
queue = [b for b in blocked if b["domain"] not in done]
print(f"blocked {len(blocked)}, done {len(done)}, to fetch {len(queue)}", flush=True)

from scrapling.fetchers import StealthyFetcher
CF = re.compile(r"just a moment|enable javascript|cf-browser-verification|attention required", re.I)
def prune(html):
    if not html: return ""
    t = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    t = re.sub(r"<style[\s\S]*?</style>", " ", t, flags=re.I)
    t = re.sub(r"<nav[\s\S]*?</nav>", " ", t, flags=re.I); t = re.sub(r"<footer[\s\S]*?</footer>", " ", t, flags=re.I)
    tm = re.search(r"<title[^>]*>([^<]{0,200})</title>", t, flags=re.I); title = tm.group(1) if tm else ""
    dm = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']{0,300})', t, flags=re.I); desc = dm.group(1) if dm else ""
    t = re.sub(r"<[^>]+>", " ", t).replace("&nbsp;"," ").replace("&amp;","&"); t = re.sub(r"&#\d+;"," ",t); t = re.sub(r"\s+"," ",t).strip()
    return (f"TITLE: {title} | META: {desc} | BODY: {t}")[:CAP]

fh = open(OUT,"a",encoding="utf-8"); n=0
for b in queue:
    dom=b["domain"]; text=""; status="ERR"
    try:
        page=StealthyFetcher.fetch(f"https://{dom}/", headless=True, solve_cloudflare=True, network_idle=True, timeout=90000)
        status=getattr(page,"status","?"); html=getattr(page,"html_content","") or ""
        if html and not CF.search(html[:1500]): text=prune(html)
    except Exception as e: status="ERR:"+type(e).__name__
    fh.write(json.dumps({"domain":dom,"company":b.get("company",""),"prior_type":b.get("prior_type",""),"sig":None,"text":text,"scrapling_status":status}, ensure_ascii=False)+"\n"); fh.flush()
    n+=1; print(f"  {n}/{len(queue)} {dom} status={status} textlen={len(text)}", flush=True)
fh.close(); print(f"DONE: {n} -> {OUT}", flush=True)
