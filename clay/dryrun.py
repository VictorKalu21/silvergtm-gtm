"""Dry-run the Claygent supply chain resilience prompt against sample rows.

Usage: OPENAI_API_KEY must be set in the environment.
    python3 clay/dryrun.py [model] [csv_path]
Defaults: gpt-4.1-mini, the Clay export in the uploads folder.
Writes clay/dryrun_<model>.json and prints each row's JSON as it comes back.
"""
import csv, json, os, re, sys, urllib.request, urllib.error, datetime, glob

HERE = os.path.dirname(os.path.abspath(__file__))
PROMPT = open(os.path.join(HERE, "claygent-supply-chain-resilience-v2.md")).read().split("---\n", 1)[1]
SAMPLE = ["jdplc.com", "pepcogroup.eu", "halfords.com", "unitestudents.com", "heliostowers.com", "st.co.uk"]

model = sys.argv[1] if len(sys.argv) > 1 else "gpt-4.1-mini"
csv_path = sys.argv[2] if len(sys.argv) > 2 else (glob.glob("/root/.claude/uploads/*/*Clay_Trial_Task_5*.csv") or [None])[0]
if not csv_path:
    sys.exit("CSV not found; pass its path as the second argument")
key = os.environ.get("OPENAI_API_KEY") or sys.exit("OPENAI_API_KEY not set")

rows = {r["Company Domain"]: r for r in csv.DictReader(open(csv_path, encoding="utf-8-sig"))}
desc_col = next(c for c in next(iter(rows.values())) if c.startswith("Company Description"))
out = []
for d in SAMPLE:
    r = rows[d]
    p = (PROMPT.replace("{{today}}", str(datetime.date.today()))
                .replace("{{Company Domain}}", d)
                .replace("{{Company Description}}", r[desc_col]))
    body = {"model": model, "tools": [{"type": "web_search_preview"}], "input": p}
    req = urllib.request.Request("https://api.openai.com/v1/responses", data=json.dumps(body).encode(),
                                 headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
    try:
        resp = json.load(urllib.request.urlopen(req, timeout=300))
    except urllib.error.HTTPError as e:
        print(d, "HTTP", e.code, e.read().decode()[:500]); continue
    text = "".join(c.get("text", "") for o in resp["output"] if o["type"] == "message" for c in o["content"])
    searches = sum(1 for o in resp["output"] if o["type"] == "web_search_call")
    m = re.search(r"\{.*\}", text, re.S)
    try:
        js = json.loads(m.group(0)) if m else {"raw": text}
    except Exception:
        js = {"raw": text}
    js["_domain"] = d; js["_searches"] = searches; js["_usage"] = resp.get("usage", {})
    out.append(js); print(json.dumps(js, indent=1, ensure_ascii=False)); sys.stdout.flush()
json.dump(out, open(os.path.join(HERE, f"dryrun_{model}.json"), "w"), indent=1)
