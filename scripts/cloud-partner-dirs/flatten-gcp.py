#!/usr/bin/env python3
"""Flatten + score the Google Cloud Partner Finder pull (gcp-partners.jsonl, one row per query hit) → gcp-partners.csv (unique partners) + gcp-shortlist.csv.
Row shape (as written by gcp-finder.mjs): profile_id=[profile, legal_entity, name, tagline, desc_html, [locations...], [resources], ...], legal_entity=competencies list, name=tier records."""
import json, csv, re, collections
TIER = {2: "Select", 3: "Premier", 4: "Diamond"}
HOME = {"US", "CA", "IL"}
strip = lambda h: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h or "")).replace("&nbsp;", " ").replace("&#39;", "'").replace("&amp;", "&").strip()
GSI = re.compile(r"\b(accenture|deloitte|kpmg|pwc|ernst|ey\b|capgemini|cognizant|infosys|wipro|tcs|tata consultancy|hcl\w*|ibm|dxc|ntt|atos|kyndryl|cgi|slalom|rackspace|softwareone|softchoice|ingram micro|td synnex|arrow|cdw|insight|presidio|wwt|world wide tech|sada|epam|endava|thoughtworks|perficient|publicis|virtusa|ltimindtree|tech mahindra|mphasis|hexaware|persistent|nagarro|ust\b|zensar|birlasoft|coforge|sopra|globant|crayon|hashicorp|datadog|mongodb|elastic|confluent|snowflake|databricks|palo alto|nvidia|dell|lenovo|hpe|cisco|vmware|servicenow|salesforce|sap\b|workday|adobe|oracle|intel|amd\b|t-mobile|verizon|at&t)\b", re.I)
def walk(x, out):
    if isinstance(x, list):
        for y in x: walk(y, out)
    else: out.append(x)
    return out
parts = {}
for l in open("data/ai-reserve/gcp-partners.jsonl", encoding="utf-8"):
    o = json.loads(l); f = o.get("profile_id")
    if not (isinstance(f, list) and f and isinstance(f[0], str)): continue
    pid = f[0]; p = parts.setdefault(pid, {"via": set(), "f": f, "comps": o.get("legal_entity") or [], "tiers": o.get("name") or [], "score": o.get("score")})
    p["via"].add(o.get("found_via", ""))
rows = []
for pid, p in parts.items():
    f = p["f"]; flat = walk(f[5:], [])
    strs = [s for s in flat if isinstance(s, str)]
    websites = [s for s in strs if s.startswith("http") and not re.search(r"googleusercontent|youtube|youtu\.be|linkedin|cloud\.google", s)]
    emails = [s for s in strs if re.fullmatch(r"[\w.+-]+@[\w-]+\.[\w.-]+", s)]
    phones = [s for s in strs if re.fullmatch(r"\+?[\d (). -]{8,}", s) and re.search(r"\d{3}", s)]
    # locations: lists shaped [null, "US", null, zip, null, state, city, null, [street]]
    locs = []
    def findlocs(x):
        if isinstance(x, list):
            if len(x) >= 7 and isinstance(x[1], str) and re.fullmatch(r"[A-Z]{2}", x[1]) and (x[6] is None or isinstance(x[6], str)): locs.append((x[1], x[5] if len(x) > 5 and isinstance(x[5], str) else "", x[6] or ""))
            for y in x: findlocs(y)
    findlocs(f[5:])
    countries = sorted({c for c, _, _ in locs}); hq = next((l for l in locs if l[0] in HOME), locs[0] if locs else ("", "", ""))
    comps = [c for c in p["comps"] if isinstance(c, list) and len(c) > 2 and isinstance(c[1], str) and c[1].startswith("competency_")]
    comp_keys = sorted({c[1].replace("competency_", "") for c in comps})
    tiers = sorted({TIER[int(m)] for v in p["via"] for m in re.findall(r":t([234])", v)})
    ai = any(k in ("artificial_intelligence", "gemini_enterprise", "machine_learning") for k in comp_keys) or any("artificial_intelligence" in v or "gemini" in v for v in p["via"])
    name = f[2] if len(f) > 2 else ""
    pts, why, kill = 0, [], ""
    if GSI.search(name or ""): kill = "GSI / ISV / distributor"
    if not (set(countries) & HOME): kill = kill or "no US/CA/IL office"
    if ai: pts += 3; why.append("AI competency (vendor-validated)")
    if "Diamond" in tiers: pts += 2; why.append("Diamond")
    elif "Premier" in tiers: pts += 2; why.append("Premier")
    elif "Select" in tiers: pts += 1; why.append("Select")
    if len(comp_keys) >= 3: pts += 1; why.append(f"{len(comp_keys)} competencies")
    d = strip(f[4] if len(f) > 4 else "")
    if re.search(r"managed service|MSP|managed cloud|FinOps|cost optimi", d, re.I): pts += 2; why.append("managed/FinOps language")
    if re.search(r"resell|reseller|licens|marketplace", d, re.I): pts += 1; why.append("resale language")
    rows.append({"score_rubric": pts, "kill": kill, "why": ";".join(why), "name": name, "website": websites[0] if websites else "", "email": emails[0] if emails else "", "phone": phones[0] if phones else "",
                 "hq_country": hq[0], "hq_state": hq[1], "hq_city": hq[2], "countries": ";".join(countries), "n_locations": len(locs), "tiers": ";".join(tiers), "ai_competency": ai, "competencies": ";".join(comp_keys), "n_competencies": len(comp_keys),
                 "tagline": f[3] if len(f) > 3 else "", "description": d[:600], "profile_id": pid, "legal_entity": f[1] if len(f) > 1 else "", "found_via_n": len(p["via"])})
rows.sort(key=lambda r: (-r["score_rubric"], r["name"] or ""))
cols = list(rows[0].keys())
csv.DictWriter(open("data/ai-reserve/gcp-partners.csv", "w", newline="", encoding="utf-8"), fieldnames=cols).writerows([dict(zip(cols, cols))] + rows)
short = [r for r in rows if not r["kill"] and r["score_rubric"] >= 5]
csv.DictWriter(open("data/ai-reserve/gcp-shortlist.csv", "w", newline="", encoding="utf-8"), fieldnames=cols).writerows([dict(zip(cols, cols))] + short)
print("unique partners", len(rows), "| website fill", sum(1 for r in rows if r["website"]), "| with locations", sum(1 for r in rows if r["n_locations"]), "| HQ country", collections.Counter(r["hq_country"] for r in rows).most_common(6))
print("tiers", collections.Counter(r["tiers"] for r in rows).most_common(6), "| AI competency", sum(r["ai_competency"] for r in rows))
print("killed", sum(1 for r in rows if r["kill"]), "| shortlist (>=5, no kill)", len(short), collections.Counter(r["hq_country"] for r in short).most_common(5))
for r in short[:12]: pass  # print(f'{r["score_rubric"]:>2} {r["name"][:34]:34} {r["tiers"]:8} {r["hq_state"] or r["hq_country"]:>14} {r["website"][:30]:30} | {r["why"]}')
