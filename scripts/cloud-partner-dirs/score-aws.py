#!/usr/bin/env python3
"""Draft channel-partner rubric over the AWS Partner Finder pull (data/ai-reserve/aws-partners.csv).
Scores every Consulting Partner; writes aws-scored.csv (all) + aws-shortlist.csv (pass >= 7, no kill)."""
import csv, re, sys
SRC = sys.argv[1] if len(sys.argv) > 1 else "data/ai-reserve/aws-partners.csv"
OUT_ALL, OUT_SHORT = "data/ai-reserve/aws-scored.csv", "data/ai-reserve/aws-shortlist.csv"
GSI = re.compile(r"\b(doit|accenture|deloitte|kpmg|pwc|ernst|ey\b|capgemini|cognizant|infosys|wipro|tcs|tata consultancy|hcl|ibm|dxc|ntt|atos|kyndryl|mckinsey|bcg|booz|leidos|saic|general dynamics|lockheed|raytheon|cgi|slalom|rackspace|softwareone|ingram micro|td synnex|arrow|cdw|insight|presidio|wwt|world wide tech|sada|globant|epam|endava|thoughtworks|perficient|publicis|virtusa|ltimindtree|tech mahindra|mphasis|hexaware|persistent|nagarro|ust\b|zensar|birlasoft|coforge|sopra|gft|reply)\b", re.I)
HOME = {"United States", "Canada", "Israel"}
def b(v): return str(v).lower() == "true"
def score(r):
    pts, why, kill = 0, [], None
    certs = int(float(r.get("certs") or 0))
    if r["customer_type"] != "Consulting Partner": kill = "technology partner (ISV)"
    if GSI.search(r["name"] or "") or certs > 2000: kill = kill or "GSI / distributor"
    if r.get("hq_country") not in HOME and not any(c in (r.get("offices_countries") or "") for c in HOME): kill = kill or "no US/CA/IL presence"
    st = (r.get("service_types") or "")
    if st and not re.search(r"Consulting|Managed|Migration|Development|Integration|Assessments", st): kill = kill or "non-services (training/hardware only)"
    if b(r["ai_competency"]) or b(r["uc_genai_consulting"]) or b(r["uc_agentic"]): pts += 3; why.append("AI validated")
    elif b(r["uc_ai"]): pts += 2; why.append("AI use case")
    if b(r["is_msp_program"]) or "Managed Service Provider" in st: pts += 2; why.append("MSP")
    if b(r["is_solution_provider"]) or b(r["is_reseller"]): pts += 2; why.append("resale")
    pts += {"Premier": 2, "Advanced": 1}.get(r["tier"], 0); why.append(r["tier"])
    if 20 <= certs <= 600: pts += 1; why.append("size sweet spot")
    if b(r["uc_finops"]): pts += 1; why.append("FinOps practice")
    tc = r.get("target_clients") or ""
    if "Startup" in tc or "Mid-size" in tc: pts += 1; why.append("serves startups/mid-size")
    if r.get("hq_country") not in HOME: pts -= 2; why.append("foreign HQ (-2)")
    return pts, ";".join(why), kill
rows = list(csv.DictReader(open(SRC, newline="", encoding="utf-8")))
out = []
for r in rows:
    pts, why, kill = score(r); r = dict(r); r.update(score=pts, why=why, kill=kill or ""); out.append(r)
cols = ["score", "kill", "why", "name", "website", "tier", "certs", "launches", "hq_country", "hq_state", "hq_city", "is_msp_program", "is_solution_provider", "is_reseller", "ai_competency", "uc_genai_consulting", "uc_agentic", "uc_finops", "target_clients", "casestudy_count", "reference_customers", "competencies", "service_types", "matched_countries", "brief", "id"]
out.sort(key=lambda r: (-r["score"], -int(float(r["certs"] or 0))))
with open(OUT_ALL, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore"); w.writeheader(); w.writerows(out)
short = [r for r in out if not r["kill"] and r["score"] >= 7]
with open(OUT_SHORT, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore"); w.writeheader(); w.writerows(short)
import collections
print("scored", len(out), "| consulting", sum(1 for r in out if r["customer_type"] == "Consulting Partner"), "| killed", sum(1 for r in out if r["kill"]))
print("shortlist (>=7, no kill):", len(short), collections.Counter(r["hq_country"] for r in short).most_common(6))
print("score dist (no kill):", sorted(collections.Counter(r["score"] for r in out if not r["kill"]).items(), reverse=True))
print("with named case studies in shortlist:", sum(1 for r in short if int(float(r["casestudy_count"] or 0)) > 0), "| with FinOps:", sum(1 for r in short if b(r["uc_finops"])))
for r in short[:15]: print(f'{r["score"]:>2} {r["name"][:34]:34} {r["tier"]:8} certs={r["certs"]:>5} {r["hq_state"] or r["hq_country"]:>18} | {r["why"]}')
