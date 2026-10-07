#!/usr/bin/env python3
"""Cross-source master: AWS (aws-scored.csv) ∪ Microsoft (ms-scored.csv) ∪ Google (gcp-partners.csv) → channel-partners-master.csv.
Match key = registrable domain when a website exists (AWS, Google), else normalized name (Microsoft has no website)."""
import csv, re, collections
STOP = r"\b(inc|llc|ltd|limited|corp|corporation|co|group|technologies|technology|solutions|consulting|services|the|a|an|company|digital|cloud|global|usa|us|canada|israel|uk|north america|holdings|partners|labs|systems|software|international|sa|srl|gmbh|bv|pte|pty|plc|sp z o o|s l|s p a)\b"
def nname(s): return " ".join(re.sub(STOP, " ", re.sub(r"[^a-z0-9 ]", " ", (s or "").lower())).split()[:2])
def dom(u):
    m = re.search(r"https?://(?:www\.)?([^/:?#]+)", (u or "").lower()); 
    if not m: return ""
    h = m.group(1); parts = h.split("."); 
    return ".".join(parts[-3:]) if len(parts) > 2 and parts[-2] in ("co", "com", "org", "net", "ac") else ".".join(parts[-2:])
R = lambda f: list(csv.DictReader(open(f, newline="", encoding="utf-8")))
aws, ms, gcp = R("data/ai-reserve/aws-scored.csv"), R("data/ai-reserve/ms-scored.csv"), R("data/ai-reserve/gcp-partners.csv")
master = {}; bydom = {}; byname = {}
def get(name, website):
    d, n = dom(website), nname(name)
    k = bydom.get(d) if d else None
    if k is None: k = byname.get(n) if n else None
    if k is None:
        k = len(master); master[k] = {"name": name, "domain": d, "names": set(), "sources": set(), "aws": None, "ms": None, "gcp": None}
    if d: bydom[d] = k
    if n: byname.setdefault(n, k)
    m = master[k]; m["names"].add(name); 
    if d and not m["domain"]: m["domain"] = d
    return m
for r in aws:
    if "technology partner" in (r["kill"] or ""): continue
    m = get(r["name"], r["website"]); m["sources"].add("aws"); m["aws"] = r
for r in gcp:
    m = get(r["name"], r["website"]); m["sources"].add("gcp"); m["gcp"] = r
for r in ms:
    m = get(r["name"], ""); m["sources"].add("ms"); m["ms"] = r
out = []
for m in master.values():
    a, s, g = m["aws"], m["ms"], m["gcp"]
    scores = [int(float(x)) for x in [a and a["score"], s and s["score"], g and g["score_rubric"]] if x not in (None, "")]
    kills = [x for x in [a and a["kill"], s and s["kill"], g and g["kill"]] if x]
    ai = any([a and a["ai_competency"] == "True", a and a["uc_genai_consulting"] == "True", s and s["designations"] and "DataAI" in s["designations"], g and g["ai_competency"] == "True"])
    msp = any([a and a["is_msp_program"] == "True", s and s["azure_expert_msp"] == "True", s and "Managed" in (s["service_types"] or "")])
    resale = any([a and (a["is_solution_provider"] == "True" or a["is_reseller"] == "True"), s and "Licensing" in (s["service_types"] or "")])
    finops = bool(a and a["uc_finops"] == "True") or bool(g and "FinOps" in (g["why"] or ""))
    hq = (a and f'{a["hq_city"] or ""}, {a["hq_state"] or ""}, {a["hq_country"] or ""}') or (g and f'{g["hq_city"]}, {g["hq_state"]}, {g["hq_country"]}') or (s and f'{s["city"]}, {s["state"]}, {s["country"]}') or ""
    best = max(scores) if scores else 0; multi = len(m["sources"])
    total = best + (2 if multi == 3 else 1 if multi == 2 else 0)
    out.append({"total_score": total, "best_single_score": best, "n_clouds": multi, "clouds": "+".join(sorted(m["sources"])), "kill": " | ".join(sorted(set(kills))), "name": m["name"], "domain": m["domain"], "website": (a and a["website"]) or (g and g["website"]) or "", "linkedin": (s and s["linkedin"]) or "", "hq": re.sub(r"^, |, ,|, $", "", hq).strip(", "),
                "ai_validated": ai, "msp_motion": msp, "resale_motion": resale, "finops_practice": finops,
                "aws_tier": a and a["tier"] or "", "aws_certs": a and a["certs"] or "", "aws_case_studies": a and a["casestudy_count"] or "", "aws_reference_customers": (a and a["reference_customers"] or "")[:300],
                "ms_designations": s and s["designations"] or "", "ms_azure_expert_msp": s and s["azure_expert_msp"] or "", "gcp_tier": g and g["tiers"] or "", "gcp_competencies": g and g["competencies"] or "",
                "aka": "; ".join(sorted(m["names"] - {m["name"]}))[:200], "why": " || ".join(x for x in [a and "AWS: " + a["why"], s and "MS: " + s["why"], g and "GCP: " + g["why"]] if x)})
out.sort(key=lambda r: (-r["total_score"], -r["n_clouds"], r["name"]))
cols = list(out[0].keys())
csv.DictWriter(open("data/ai-reserve/channel-partners-master.csv", "w", newline="", encoding="utf-8"), fieldnames=cols).writerows([dict(zip(cols, cols))] + out)
live = [r for r in out if not r["kill"]]
A = [r for r in live if r["ai_validated"] and (r["msp_motion"] or r["resale_motion"]) and r["total_score"] >= 9]
B = [r for r in live if r not in A and r["ai_validated"] and r["total_score"] >= 7]
csv.DictWriter(open("data/ai-reserve/channel-partners-tierA.csv", "w", newline="", encoding="utf-8"), fieldnames=cols).writerows([dict(zip(cols, cols))] + A)
csv.DictWriter(open("data/ai-reserve/channel-partners-tierB.csv", "w", newline="", encoding="utf-8"), fieldnames=cols).writerows([dict(zip(cols, cols))] + B)
print("master", len(out), "| not killed", len(live), "| clouds:", collections.Counter(r["clouds"] for r in live).most_common())
print("Tier A (AI-validated + MSP/resale + score>=9):", len(A), "| Tier B (AI-validated, score>=7):", len(B))
print("Tier A with AWS case studies:", sum(1 for r in A if r["aws_case_studies"] not in ("", "0")), "| with website/domain:", sum(1 for r in A if r["domain"]), "| multi-cloud:", sum(1 for r in A if r["n_clouds"] > 1), "| FinOps practice:", sum(1 for r in A if r["finops_practice"]))
print("Tier A HQ countries:", collections.Counter((r["hq"].split(", ")[-1] if r["hq"] else "?") for r in A).most_common(8))
for r in A[:20]: print(f'{r["total_score"]:>2} {r["n_clouds"]} {r["clouds"]:10} {r["name"][:30]:30} {r["hq"][-28:]:>28} aws={r["aws_tier"]:8} cs={r["aws_case_studies"]:>3} ms={r["ms_azure_expert_msp"]:5} gcp={r["gcp_tier"]}')
