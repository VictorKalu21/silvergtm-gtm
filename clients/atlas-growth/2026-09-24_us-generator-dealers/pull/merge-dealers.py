#!/usr/bin/env python3
"""Merge raw/leads_<brand>.csv -> raw/leads_dealers.csv: one row per company across brands.
Union-find on shared keys: own domain + 3-digit ZIP prefix (so franchisees on one brand domain stay
separate buyers; shared hosts and ISP mail never count), 10-digit phone,
normalised name+zip. Representative = the row with a website (then Briggs/Generac, which carry
emails). Adds `brands` (e.g. generac|kohler), `brand_tiers` (brand:tier;…) and `brand_count`."""
import csv, re, os, collections
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
BRANDS = ["generac","briggs","kohler","cummins","champion"]
rows = []
for b in BRANDS:
    rows += list(csv.DictReader(open(f"raw/leads_{b}.csv")))
SUFFIX = re.compile(r"\b(llc|inc|co|corp|corporation|company|ltd|the)\b")
def nkey(r): return re.sub(r"[^a-z0-9]", "", SUFFIX.sub("", r["name"].lower())) + "|" + r["zip"]
import json, subprocess
# The engine's ONE shared-host list (facebook.com, wixsite, g.page …): never a company key.
SHARED = json.loads(subprocess.check_output(["node", "-e",
    "const m=require('../../../skills/google-maps-scrape/shared-hosts.js');"
    "const v=m.SHARED_HOSTS||m.sharedHosts||m.HOSTS||Object.values(m).find(Array.isArray)||[];"
    "console.log(JSON.stringify([...v]))"]))
ISP = {"optonline.net","ptd.net","centurytel.net","embarqmail.com","centurylink.net","epix.net","mail.com","tds.net",
       "protonmail.com","frontiernet.net","fairpoint.net","roadrunner.com","optimum.net","twcny.rr.com","hughes.net",
       "rocketmail.com","twc.com","mac.com","rr.com","netzero.net","juno.com","gmx.com","zoho.com","q.com","suddenlink.net",
       "mediacombb.net","wowway.com","consolidated.net","nc.rr.com","tampabay.rr.com","cfl.rr.com","austin.rr.com"}
def shared(d): return any(d == s or d.endswith("." + s) for s in SHARED)
def dom(r):
    for d in (r["website"].lower(), r["email_domain"].lower()):
        if d and not shared(d) and d not in ISP: return d
    return ""
parent = list(range(len(rows)))
def find(i):
    while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
    return i
seen = {}
for i, r in enumerate(rows):
    for k in (("d", dom(r) and dom(r) + "|" + r["zip"][:3]), ("p", r["phone_number"] if len(r["phone_number"]) == 10 else ""), ("n", nkey(r))):
        if not k[1]: continue
        if k in seen: parent[find(i)] = find(seen[k])
        else: seen[k] = i
groups = collections.defaultdict(list)
for i in range(len(rows)): groups[find(i)].append(rows[i])
out = []
for g in groups.values():
    rep = sorted(g, key=lambda r: (not r["website"], not r["email"], BRANDS.index(r["source_brand"])))[0]
    o = dict(rep)
    o["website"] = rep["website"] or next((r["website"] for r in g if r["website"]), "")
    o["email"] = rep["email"] or next((r["email"] for r in g if r["email"]), "")
    o["email_domain"] = rep["email_domain"] or next((r["email_domain"] for r in g if r["email_domain"]), "")
    bs = sorted({r["source_brand"] for r in g}, key=BRANDS.index)
    o["brands"] = "|".join(bs); o["brand_count"] = len(bs)
    o["brand_tiers"] = ";".join(sorted({f'{r["source_brand"]}:{r["brand_tier"]}' for r in g if r["brand_tier"]}))
    o["merged_ids"] = "|".join(r["place_id"] for r in g)
    o["commercial_flag"] = "Y" if any(r["commercial_flag"] == "Y" for r in g) else rep["commercial_flag"]
    o["oem_page"] = next((r["oem_page"] for r in g if r["oem_page"]), "")
    out.append(o)
cols = list(rows[0].keys()) + ["brands", "brand_count", "brand_tiers", "merged_ids"]
with open("raw/leads_dealers.csv", "w", newline="") as f:
    w = csv.DictWriter(f, cols); w.writeheader(); w.writerows(out)
c = collections.Counter(o["brand_count"] for o in out)
dm = sum(1 for o in out if o["website"] or o["email_domain"])
print(f"rows in {len(rows)} -> companies {len(out)} | by brand_count {dict(sorted(c.items()))} | with own domain {dm} ({dm/len(out):.0%})")
print("brand presence", collections.Counter(b for o in out for b in o["brands"].split("|")))
