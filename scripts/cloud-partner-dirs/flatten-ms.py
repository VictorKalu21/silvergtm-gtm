#!/usr/bin/env python3
"""Merge data/ai-reserve/ms/*.jsonl (Microsoft partner directory slices) → ms-partners.csv, one row per partner id."""
import json, glob, csv, collections, re, os
D = "data/ai-reserve/ms"; rows = {}
for fn in sorted(glob.glob(f"{D}/*.jsonl")):
    slice_name = os.path.basename(fn)[:-6]
    for l in open(fn, encoding="utf-8"):
        o = json.loads(l); r = rows.setdefault(o["id"], {"slices": set(), "raw": o})
        r["slices"].add(slice_name)
def li(url):
    m = re.search(r"linkedin\.com/company/([^/?#]+)", url or ""); return m.group(1) if m else ""
out = []
for pid, r in rows.items():
    o = r["raw"]; a = (o.get("location") or {}).get("address") or {}
    out.append({
        "id": pid, "partner_id": o.get("partnerId"), "name": o.get("name"), "linkedin": o.get("linkedInOrganizationProfile") or "", "linkedin_slug": li(o.get("linkedInOrganizationProfile")),
        "country": a.get("country"), "state": a.get("state"), "city": a.get("city"),
        "azure_expert_msp": "Azure Expert MSPs" in (o.get("programQualificationsMsp") or []),
        "designations": ";".join(o.get("solutionsPartnerDesignations") or []),
        "has_dataai": "AzureDataAICompetency" in (o.get("solutionsPartnerDesignations") or []), "has_infra": "AzureInfraCompetency" in (o.get("solutionsPartnerDesignations") or []),
        "n_designations": len(o.get("solutionsPartnerDesignations") or []),
        "service_types": ";".join(o.get("serviceType") or []), "is_msp_service": any("Managed" in s for s in (o.get("serviceType") or [])),
        "solutions": ";".join(o.get("solutions") or []), "ai_solution": any(re.search(r"Artificial|Machine|Cognitive|Chatbot", s) for s in (o.get("solutions") or [])),
        "products": ";".join(o.get("product") or []), "industries": ";".join(o.get("industryFocus") or []),
        "gold": ";".join((o.get("competencies") or {}).get("gold") or []), "silver": ";".join((o.get("competencies") or {}).get("silver") or []),
        "slices": ";".join(sorted(r["slices"])), "description": re.sub(r"\s+", " ", o.get("description") or "")[:500],
    })
out.sort(key=lambda r: (not r["azure_expert_msp"], -r["n_designations"], r["name"] or ""))
cols = list(out[0].keys())
with open("data/ai-reserve/ms-partners.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(out)
print("partners", len(out), "| by country", collections.Counter(r["country"] for r in out).most_common())
print("azure expert msp", sum(r["azure_expert_msp"] for r in out), "| data&ai designation", sum(r["has_dataai"] for r in out), "| linkedin fill", sum(1 for r in out if r["linkedin"]))
print("MSP-service AND AI-solution AND (expert msp OR dataai):", sum(1 for r in out if r["is_msp_service"] and r["ai_solution"] and (r["azure_expert_msp"] or r["has_dataai"])))
