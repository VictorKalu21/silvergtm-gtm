#!/usr/bin/env python3
"""Draft channel-partner rubric over the Microsoft directory pull (ms-partners.csv) → ms-scored.csv + ms-shortlist.csv."""
import csv, re, collections
GSI = re.compile(r"\b(accenture|deloitte|kpmg|pwc|ernst|ey\b|capgemini|cognizant|infosys|wipro|tcs|tata consultancy|hcl|ibm|dxc|ntt|atos|kyndryl|avanade|cgi|slalom|rackspace|softwareone|softchoice|ingram micro|td synnex|arrow|cdw|insight|presidio|wwt|world wide tech|epam|endava|perficient|virtusa|ltimindtree|tech mahindra|mphasis|hexaware|persistent|nagarro|ust\b|zensar|birlasoft|coforge|sopra|hitachi|fujitsu|unisys|crayon|hso\b|bdo|rsm|grant thornton|protiviti|publicis|wipro|dell|hpe|lenovo|microsoft)\b", re.I)
def b(v): return str(v) == "True"
rows = list(csv.DictReader(open("data/ai-reserve/ms-partners.csv", newline="", encoding="utf-8")))
out = []
for r in rows:
    pts, why, kill = 0, [], ""
    if GSI.search(r["name"] or ""): kill = "GSI / distributor / big-4"
    st = r["service_types"] or ""
    if st and not re.search(r"Consulting|Managed|Deployment|Integration|Custom", st): kill = kill or "non-services (licensing/hardware/training only)"
    if b(r["has_dataai"]): pts += 3; why.append("Data&AI designation")
    elif b(r["ai_solution"]): pts += 1; why.append("AI solution tag")
    if b(r["azure_expert_msp"]): pts += 3; why.append("Azure Expert MSP")
    elif b(r["is_msp_service"]): pts += 2; why.append("MSP service type")
    if "Licensing" in st: pts += 1; why.append("resale (licensing)")
    n = int(r["n_designations"] or 0)
    if n >= 3: pts += 1; why.append(f"{n} designations")
    if re.search(r"Services|Professional", r["industries"] or ""): pts += 0
    if b(r["has_infra"]): pts += 1; why.append("Infra designation")
    o = dict(r); o.update(score=pts, why=";".join(why), kill=kill); out.append(o)
out.sort(key=lambda r: (-r["score"], r["name"] or ""))
cols = ["score", "kill", "why", "name", "linkedin", "country", "state", "city", "azure_expert_msp", "designations", "service_types", "ai_solution", "industries", "slices", "description", "id"]
csv.DictWriter(open("data/ai-reserve/ms-scored.csv", "w", newline="", encoding="utf-8"), fieldnames=cols, extrasaction="ignore").writerows([dict(zip(cols, cols))] + out)
short = [r for r in out if not r["kill"] and r["score"] >= 6]
csv.DictWriter(open("data/ai-reserve/ms-shortlist.csv", "w", newline="", encoding="utf-8"), fieldnames=cols, extrasaction="ignore").writerows([dict(zip(cols, cols))] + short)
print("scored", len(out), "killed", sum(1 for r in out if r["kill"]), "| shortlist (>=6):", len(short), collections.Counter(r["country"] for r in short).most_common())
print("score dist:", sorted(collections.Counter(r["score"] for r in out if not r["kill"]).items(), reverse=True))
for r in short[:12]: print(f'{r["score"]:>2} {r["name"][:36]:36} {r["country"]} {r["state"] or "":>4} | {r["why"]}')
