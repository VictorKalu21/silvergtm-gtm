#!/usr/bin/env python3
"""Join the Maps leg (maps/leads_netnew.csv) with the qualified OEM dealer list
(dealers/leads_clean_qualified.csv) -> leads_combined.csv, the single spine that enters
google-maps-scrape STEP 5c-dom (collapse-domains) and everything after it.

Match keys: own domain + 3-digit ZIP prefix, then 10-digit phone. A matched pair keeps the MAPS row
(place_id, google_types, reviews, rating) and gains the dealer columns; unmatched dealer rows ride as
their own leads with place_id '<brand>:<id>'. `lead_source` = maps | dealer | both."""
import csv, os, re, sys
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
sys.path.insert(0, "pull")
from importlib import import_module
md = import_module("merge-dealers")          # reuse its dom()/shared-host/ISP rules, not a copy
def host(u):
    u = re.sub(r"^https?://", "", (u or "").strip().lower()).split("/")[0]
    return re.sub(r"^www\.", "", u)
def phone(p): return re.sub(r"\D", "", p or "")[-10:]
maps = list(csv.DictReader(open("maps/leads_netnew.csv")))
dealers = list(csv.DictReader(open("dealers/leads_clean_qualified.csv")))
DEXTRA = ["website_from", "state", "email", "email_domain", "brands", "brand_count", "brand_tiers", "consumer_flag",
          "commercial_flag", "oem_page", "merged_ids"]
idx = {}
for i, d in enumerate(dealers):
    k = md.dom(d)
    if k: idx.setdefault(("d", k + "|" + d["zip"][:3]), i)
    if len(d["phone_number"]) == 10: idx.setdefault(("p", d["phone_number"]), i)
used = set(); out = []
for m in maps:
    zipc = (m.get("zip") or "")[:5]
    mh = host(m.get("website"))
    mk = mh if mh and not md.shared(mh) else ""
    hit = None
    if mk: hit = idx.get(("d", mk + "|" + zipc[:3]))
    if hit is None: hit = idx.get(("p", phone(m.get("phone_number"))))
    o = dict(m); o["lead_source"] = "maps"
    for c in DEXTRA: o[c] = ""
    if hit is not None and hit not in used:
        used.add(hit); d = dealers[hit]
        for c in DEXTRA: o[c] = d.get(c, "")
        if not o.get("website") and d["website"]: o["website"] = d["website"]
        o["lead_source"] = "both"
    out.append(o)
mcols = list(maps[0].keys())
for i, d in enumerate(dealers):
    if i in used: continue
    o = {c: "" for c in mcols}
    for c in ("place_id", "name", "icp_type", "full_address", "zip", "neighborhood", "city", "phone_number", "website"):
        o[c] = d.get(c, "")
    o["latitude"], o["longitude"] = d.get("lat", ""), d.get("lng", "")
    if "city" in o and d.get("state") and d["city"]: o["city"] = f'{d["city"].title()}, {d["state"]}'
    for c in DEXTRA: o[c] = d.get(c, "")
    o["lead_source"] = "dealer"
    out.append(o)
# R4b (icp-source-planner process-rules): a non-freemail, non-ISP, non-shared-host email domain is the
# company's own domain. Use it when there is no website, and say so in website_from.
for o in out:
    if o.get("website"): o["website_from"] = o.get("website_from") or "listing"
    else:
        d = md.dom({"website": "", "email_domain": o.get("email_domain", "")})
        if d: o["website"], o["website_from"] = d, "email_domain"
cols = mcols + ["lead_source"] + DEXTRA
with open("leads_combined.csv", "w", newline="") as f:
    w = csv.DictWriter(f, cols, extrasaction="ignore"); w.writeheader(); w.writerows(out)
from collections import Counter
c = Counter(o["lead_source"] for o in out)
print(f"maps {len(maps)} + dealers {len(dealers)} -> combined {len(out)} | {dict(c)}")
