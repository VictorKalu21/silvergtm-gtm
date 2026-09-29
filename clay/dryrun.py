"""Dry-run the Claygent supply chain resilience prompt against sample rows.

Usage: OPENAI_API_KEY must be set in the environment (a placeholder works behind the agent proxy).
    python3 clay/dryrun.py [model] [csv_path] [prompt_version]
Defaults: gpt-4.1-mini, the Clay export in the uploads folder, v3.
Set STRICT_JSON=1 to ask the Responses API for a JSON object (mirrors Clay's JSON output mode).
Writes clay/dryrun_<model>.json and prints each row's JSON as it comes back.
"""
import csv, json, os, re, sys, urllib.request, urllib.error, datetime, glob

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLE = ["jdplc.com", "pepcogroup.eu", "halfords.com", "unitestudents.com", "heliostowers.com", "st.co.uk"]

model = sys.argv[1] if len(sys.argv) > 1 else "gpt-4.1-mini"
csv_path = sys.argv[2] if len(sys.argv) > 2 else (glob.glob("/root/.claude/uploads/*/*Clay_Trial_Task_5*.csv") or [None])[0]
version = sys.argv[3] if len(sys.argv) > 3 else "v3"
PROMPT = open(os.path.join(HERE, f"claygent-supply-chain-resilience-{version}.md")).read().split("---\n", 1)[1]
today = datetime.date.today()
window_start = today.replace(year=today.year - 1)
if not csv_path:
    sys.exit("CSV not found; pass its path as the second argument")
key = os.environ.get("OPENAI_API_KEY") or sys.exit("OPENAI_API_KEY not set")

rows = {r["Company Domain"]: r for r in csv.DictReader(open(csv_path, encoding="utf-8-sig"))}
desc_col = next(c for c in next(iter(rows.values())) if c.startswith("Company Description"))
out = []
for d in SAMPLE:
    r = rows[d]
    p = (PROMPT.replace("{{today}}", str(today))
                .replace("{{window_start}}", str(window_start))
                .replace("{{Company Domain}}", d)
                .replace("{{Company Name}}", r.get("Company Name", ""))
                .replace("{{Company Description}}", r[desc_col]))
    body = {"model": model, "tools": [{"type": "web_search_preview"}], "input": p}
    if os.environ.get("STRICT_JSON"):
        body["text"] = {"format": {"type": "json_object"}}
    req = urllib.request.Request("https://api.openai.com/v1/responses", data=json.dumps(body).encode(),
                                 headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
    resp = None
    for attempt in range(3):
        try:
            resp = json.load(urllib.request.urlopen(req, timeout=400)); break
        except urllib.error.HTTPError as e:
            print(d, "HTTP", e.code, e.read().decode()[:300]); 
            if e.code < 500: break
        except Exception as e:
            print(d, "error", str(e)[:200])
    if resp is None: continue
    text = "".join(c.get("text", "") for o in resp["output"] if o["type"] == "message" for c in o["content"])
    searches = sum(1 for o in resp["output"] if o["type"] == "web_search_call")
    m = re.search(r"\{.*\}", text, re.S)
    try:
        js = json.loads(m.group(0)) if m else {"raw": text}
    except Exception:
        js = {"raw": text}
    js["_domain"] = d; js["_searches"] = searches; js["_usage"] = resp.get("usage", {})
    out.append(js); print(json.dumps(js, indent=1, ensure_ascii=False)); sys.stdout.flush()
json.dump(out, open(os.path.join(HERE, f"dryrun_{version}_{model}.json"), "w"), indent=1)
