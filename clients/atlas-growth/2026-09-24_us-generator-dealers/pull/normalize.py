#!/usr/bin/env python3
"""Map each OEM locator dump -> the google-maps-scrape lead shape (+ dealer columns).
Base columns match skills/google-maps-scrape/_normalize_export.js; extra columns ride along
for STEP 5b/5e. One output per brand: raw/leads_<brand>.csv. US rows only."""
import csv, json, re, sys, os
FREEMAIL = {"gmail.com","yahoo.com","hotmail.com","outlook.com","aol.com","icloud.com","live.com",
            "msn.com","comcast.net","att.net","sbcglobal.net","bellsouth.net","verizon.net","me.com",
            "charter.net","cox.net","ymail.com","earthlink.net","frontier.com","windstream.net"}
COLS = ["place_id","name","icp_type","full_address","zip","neighborhood","city","phone_number","website",
        "state","email","email_domain","lat","lng","source_brand","brand_tier","brand_dealer_id",
        "consumer_flag","commercial_flag","oem_page"]
def host(u):
    u=(u or "").strip().lower()
    if not u: return ""
    u=re.sub(r"^https?://","",u); u=u.split("/")[0].split("?")[0]
    return re.sub(r"^www\.","",u)
def edom(e):
    d=(e or "").strip().lower().rpartition("@")[2]
    return "" if (not d or d in FREEMAIL) else d
def phone(p): return re.sub(r"\D","",str(p or ""))[-10:]
def w(brand, rows):
    out=f"raw/leads_{brand}.csv"
    with open(out,"w",newline="") as f:
        wr=csv.DictWriter(f,COLS,restval=""); wr.writeheader(); [wr.writerow(r) for r in rows]
    print(f"{brand}: {len(rows)} US rows -> {out}")

def briggs():
    rows=[]
    for r in json.load(open("raw/briggs.json")):
        if (r.get("country") or "").upper()!="US": continue
        pl=r.get("productLines") or [{}]
        segs=sorted({p.get("productSegement","") for p in pl if p.get("productSegement")})
        if segs and all(s.startswith("DISTRIBUTOR") for s in segs): continue  # distributors are not installers
        site=host(r.get("website"))
        rows.append(dict(place_id=f"briggs:{r['dealerId']}", name=r["dealerName"].strip(), icp_type="generator_dealer",
            full_address=", ".join(x for x in [r.get("address1"),r.get("city"),r.get("state"),(r.get("zip") or "")[:5]] if x),
            zip=(r.get("zip") or "")[:5], neighborhood="", city=r.get("city",""), phone_number=phone(r.get("phone")),
            website=site, state=r.get("state",""), email=(r.get("email") or "").strip().lower(), email_domain=edom(r.get("email")),
            lat=r.get("latitude"), lng=r.get("longitude"), source_brand="briggs", brand_tier="|".join(segs),
            brand_dealer_id=r["dealerId"],
            consumer_flag="Y" if any(p.get("consumerIndicator")=="Y" for p in pl) else "N",
            commercial_flag="Y" if any(p.get("commercialIndustrialIndicator")=="Y" for p in pl) else "N"))
    w("briggs",rows)

def champion():
    rows=[]
    for m in json.load(open("raw/champion.json"))["markers"]:
        if m.get("country")!="US": continue
        rows.append(dict(place_id=f"champion:{m['id']}", name=(m.get("name") or "").strip(), icp_type="generator_dealer",
            full_address=", ".join(x for x in [m.get("address"),m.get("city"),m.get("state"),m.get("zip")] if x),
            zip=(m.get("zip") or "")[:5], neighborhood="", city=m.get("city",""), phone_number=phone(m.get("phone")),
            website="", state=m.get("state",""), email="", email_domain="", lat=m.get("lat"), lng=m.get("lng"),
            source_brand="champion", brand_tier="AUTHORIZED DEALER", brand_dealer_id=m["id"],
            consumer_flag="Y", commercial_flag=""))
    w("champion",rows)

STATES = {"ALABAMA":"AL","ALASKA":"AK","ARIZONA":"AZ","ARKANSAS":"AR","CALIFORNIA":"CA","COLORADO":"CO","CONNECTICUT":"CT",
 "DELAWARE":"DE","DISTRICT OF COLUMBIA":"DC","FLORIDA":"FL","GEORGIA":"GA","HAWAII":"HI","IDAHO":"ID","ILLINOIS":"IL",
 "INDIANA":"IN","IOWA":"IA","KANSAS":"KS","KENTUCKY":"KY","LOUISIANA":"LA","MAINE":"ME","MARYLAND":"MD","MASSACHUSETTS":"MA",
 "MICHIGAN":"MI","MINNESOTA":"MN","MISSISSIPPI":"MS","MISSOURI":"MO","MONTANA":"MT","NEBRASKA":"NE","NEVADA":"NV",
 "NEW HAMPSHIRE":"NH","NEW JERSEY":"NJ","NEW MEXICO":"NM","NEW YORK":"NY","NORTH CAROLINA":"NC","NORTH DAKOTA":"ND","OHIO":"OH",
 "OKLAHOMA":"OK","OREGON":"OR","PENNSYLVANIA":"PA","RHODE ISLAND":"RI","SOUTH CAROLINA":"SC","SOUTH DAKOTA":"SD",
 "TENNESSEE":"TN","TEXAS":"TX","UTAH":"UT","VERMONT":"VT","VIRGINIA":"VA","WASHINGTON":"WA","WEST VIRGINIA":"WV",
 "WISCONSIN":"WI","WYOMING":"WY","PUERTO RICO":"PR"}
def jl(path): return [json.loads(l) for l in open(path) if l.strip()]
def addr(*parts): return ", ".join(x for x in parts if x)

def generac():
    rows=[]
    for r in jl("raw/generac.jsonl"):
        if r.get("country") not in ("USA","US") or r.get("distributor"): continue
        z=(r.get("postal") or "")[:5]
        rows.append(dict(place_id=f"generac:{r['id']}", name=r["name"].strip(), icp_type="generator_dealer",
            full_address=addr(r.get("address1"),r.get("city"),r.get("state"),z), zip=z, city=r.get("city",""),
            phone_number=phone(r.get("phone")), website=host(r.get("website")), state=r.get("state",""),
            email=(r.get("email") or "").strip().lower(), email_domain=edom(r.get("email")), lat=r.get("lat"), lng=r.get("lng"),
            source_brand="generac", brand_tier=r.get("tier") or "", brand_dealer_id=r["id"], consumer_flag="Y"))
    w("generac",rows)

def kohler():
    rows=[]
    for r in jl("raw/kohler.jsonl"):
        if r.get("country")!="US" or not r.get("residential"): continue
        z=(r.get("postal") or "")[:5]
        rows.append(dict(place_id=f"kohler:{r['id']}", name=r["name"].strip(), icp_type="generator_dealer",
            full_address=addr(r.get("street"),r.get("city"),r.get("state"),z), zip=z, city=r.get("city",""),
            phone_number=phone(r.get("phone")), website="", state=r.get("state",""), email="", email_domain="",
            lat=r.get("lat"), lng=r.get("lng"), source_brand="kohler", brand_tier=r.get("tier") or "",
            brand_dealer_id=r["id"], consumer_flag="Y", commercial_flag="Y" if r.get("light_commercial") else "N",
            oem_page=(r.get("microsite_url") or "").split("?")[0]))
    w("kohler",rows)

def cummins():
    rows=[]; seen=set()
    for r in json.load(open("raw/cummins.json"))["rows_us"]:
        if "distributor" in (r.get("dealer_type") or "").lower(): continue
        st=STATES.get((r.get("state") or "").strip().upper(), (r.get("state") or "").strip()[:2].upper())
        k=(r["name"].strip().lower(), (r.get("street") or "").strip().lower())
        if k in seen: continue
        seen.add(k); z=(r.get("postal_code") or "")[:5]
        rows.append(dict(place_id=f"cummins:{r['cummins_id']}", name=r["name"].strip(), icp_type="generator_dealer",
            full_address=addr(r.get("street"),r.get("city"),st,z), zip=z, city=r.get("city",""),
            phone_number=phone(r.get("phone")), website=host(r.get("website")), state=st, email="", email_domain="",
            lat=r.get("lat"), lng=r.get("lng"), source_brand="cummins", brand_tier=r.get("dealer_type") or "",
            brand_dealer_id=r["cummins_id"], consumer_flag="Y"))
    w("cummins",rows)

if __name__=="__main__":
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)),".."))
    for b in (sys.argv[1:] or ["briggs","champion","generac","kohler","cummins"]): globals()[b]()
