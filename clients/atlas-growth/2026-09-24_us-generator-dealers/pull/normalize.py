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
        "consumer_flag","commercial_flag"]
def host(u):
    u=(u or "").strip().lower()
    if not u: return ""
    u=re.sub(r"^https?://","",u); u=u.split("/")[0].split("?")[0]
    return re.sub(r"^www\.","",u)
def edom(e):
    d=(e or "").strip().lower().rpartition("@")[2]
    return "" if (not d or d in FREEMAIL) else d
def phone(p): return re.sub(r"\D","",p or "")[-10:]
def w(brand, rows):
    out=f"raw/leads_{brand}.csv"
    with open(out,"w",newline="") as f:
        wr=csv.DictWriter(f,COLS); wr.writeheader(); [wr.writerow(r) for r in rows]
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

if __name__=="__main__":
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)),".."))
    for b in (sys.argv[1:] or ["briggs","champion"]): globals()[b]()
