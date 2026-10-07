# AI Reserve · Channel-partner play — scope + business case

**Date:** 2026-10-07 · **Status:** PULLED 2026-10-07 (AWS + Microsoft + Google, US/CA/IL) — draft rubric applied, awaiting Emerson's weights. Results in §6.
**Trigger:** Emerson check-in 2026-10-02 — two inbound-from-cold wins (In Balance IT → Tim Currie → OpsGuru) suggest cloud/AI consultancies and MSPs are both a *customer* and a *channel*. Find more firms shaped like those two.

---

## 1. The two model companies (what "shaped like" actually means)

| | **OpsGuru** (current, becoming customer + channel) | **In Balance IT Solutions** (origin of the thread) |
|---|---|---|
| What they are | AWS-first cloud + AI consultancy. "OpenAI practice for enterprises on AWS." Services: data modernization, migration, managed cloud ops, cloud-native dev, GenAI/agentic AI | Chicago-area (Oakbrook Terrace, IL) VAR/MSP. Vendor-agnostic "75+ partners". Services: AI infra, cloud (AWS + Azure), security, data center, **a listed FinOps practice**, Microsoft E3/E5 optimization |
| Size | ~250 staff globally pre-acquisition; acquired by Carbon60 (Toronto) May-2021; combined 160+ at the time. Offices BC, ON, NB, + Israel engineering arm | 21–50 staff, founded 2019 (public firmographic estimates) |
| Official-directory footprint | **AWS Partner Finder: listed** as "OpsGuru, a Carbon60 Company" — **Premier** tier, 141 AWS certs, 349 customer launches, 9 competencies incl. **AI Services**, DevOps, Migration, Data. Programs: **AWS Managed Service Provider**, **AWS Solution Provider Program** (resale), Authorized Commercial Reseller, Well-Architected, Training Partner. Target clients incl. Startup + Mid-size | **Not found** under its name in AWS Partner Finder (typeahead) nor Microsoft's directory (free-text). Self-describes as Microsoft Gold. **The official directories would have missed this company.** |
| Buyer persona that bit | President (new, owns all GTM; ex-Onica/Rackspace, Cloudreach, Wipro) | Leadership page: President, CTO, **VP Channels & Alliances**, Director of Services, VP Ops, 2 senior sales execs |
| Why they bit | Technically deep team (Technion-grade eng leadership), a president hired to grow revenue, an existing MSP + resale motion, GenAI practice = they already sell AI and pay for AI | Vendor-agnostic MSP with a FinOps line = already sells cost optimization to clients; white-label is a natural SKU |

**The pattern:** mid-size (50–300) cloud consultancy or MSP, **AI practice that the cloud vendor has validated** (competency/use-case tag, not marketing copy), **a resale/managed-service motion** (so white-labelling is a habit, not a leap), and a **revenue-accountable leader** (president / CRO / alliances) who gains personally from a new margin line. Big GSIs (Accenture, Deloitte, TCS) sit in the same directory facets and are the wrong target — they won't white-label a stealth product.

Both wins trace to **one person** (Tim Currie) who carried the idea between firms. That's the real lesson: this channel converts through individual champions, so the list should be small, multi-threaded, and phone-backed — not a 5,000-row blast.

---

## 2. What the directories can give us (probed 2026-10-07, all free, no auth)

### AWS Partner Solutions Finder — CRACKED, Tier-0 ★ (best fit)
- Raw REST, no key: `GET https://api.finder.partners.aws.a2z.com/search?facets=<Facet : Value>[|<Facet : Value>]&location=<Country>&locale=en&size=30&from=N`
- `|` between facets = AND. `location=United States` / `Canada` restricts by HQ. `size` caps at 30; `from` pages cleanly to `total`. Results sort Premier → Advanced → Select.
- **Fields per record (100% fill on probe):** name, **website + domain[]**, HQ + all offices (country/state/city), **partner tier**, **AWS cert count (size proxy)**, customer-launch count, competency memberships (AI Services, DevOps, Migration…), program memberships (**Managed Service Provider**, **Solution Provider/Reseller**, Well-Architected), professional-service types, target client base (Startup / Mid-size / Enterprise), use-case refiners. `numberofemployees` is always 0 — size comes from certs, headcount from Apollo.
- **Slice sizes measured:**

| Slice | US | CA |
|---|---|---|
| Use Case : AI | 474 | 81 |
| Use Case : AI AND Program : AWS Managed Service Provider | 102 | — |
| Program : AWS Managed Service Provider | 169 | — |
| Use Case : Cloud Operations : Cloud Financial Management (FinOps) | 78 | — |
| Generative AI Consulting Services (global) | 612 | |
| Agentic AI Consulting Services (global) | 269 | |

- Canada AI slice tier mix: 41 Premier / 38 Advanced / 2 lower. Cert count median 141, p75 1,279, max 33k (= the GSIs to kill).
- Model-company check: OpsGuru found, tagged exactly as the ICP predicts (AI Services + MSP + Solution Provider).

### Microsoft / Azure partner directory — CRACKED, Tier-0 (second source, needs sharding)
- Raw REST, no key: `GET https://main.prod.marketplacepartnerdirectory.azure.com/api/partners?filter=<url-encoded ; -separated kv>`; detail at `/api/partners/{id}`.
- Working keys: `country=US|CA` (hard restrict), `products=Azure`, `solutions=ArtificialIntelligence|MachineLearning|DevOps`, `serviceType=ManagedServices`, `designations=AzureDataAICompetency|AzureInfraCompetency`, `azuremsp=true` (Azure Expert MSP — the elite managed-services tier), `freetext=<name>`, geo = `lat=..;lng=..;radius=<miles>;locationNotRequired=false`.
- Fields: name, HQ address, Solutions Partner designations (Data & AI / Infra / Digital & App / Security), Azure Expert MSP flag, gold/silver competencies, solutions, service types, industries, **LinkedIn URL (95% fill)**. **No website** → name→domain last mile (Clearbit free → grounded model) per process rule R4.
- Universe: ~26k US / ~6k CA partners. **Hard ceiling ~2,000 rows per query** (pageSize ≤20 × 100 pages); every useful national slice hits it → **shard by metro lat/lng radius** (≈40 US metros + 8 CA) or lead with the small elite slices (`azuremsp=true`, `designations=AzureDataAICompetency`).
- Why second, not first: the directory is dominated by Microsoft-365/Dynamics resellers. The AI-Reserve-shaped firm is the Azure Expert MSP / Data & AI designated consultancy — a thin slice of a huge list.

### Google Cloud Partner Finder — RPC FOUND, pagination not yet resolved
- Angular/Boq app; data via `POST https://cloud.google.com/find-a-partner/_/PartnerFinder/data/batchexecute?rpcids=EkbYOc` with `f.req=[[["EkbYOc","[null,[],[null,\"en-US\"]]",null,"generic"]]]`. Replays with plain curl (verified). Returns partner profiles with legal entity, description, country codes, tier/specialization records with dates. Typeahead rpc `iu5oHd`.
- Default call returns 29 featured partners; the filter/page payload shape needs one more headless capture (scroll / apply a region filter). ~½ day. Lowest priority: AI Reserve's proof point is AWS-first, and Google-only partners skew to a different buyer.

### Gap the directories don't close
In Balance IT (the firm that started the thread) is **not in** either directory under its name. Mid-market VAR/MSPs often never list, or list under a parent. To catch that layer, add one non-vendor source later: CRN MSP 500 / Solution Provider 500 lists, or the Clutch `it-services` MSP slice (already profiled in the library — export path). Not needed for a first pass.

---

## 3. Qualification rubric (draft — to confirm with Emerson before any pull)

Score each firm; pass ≥ 7; kill rules override.

| Signal | Points | Why |
|---|---|---|
| Vendor-validated AI capability (AWS AI Services Competency / GenAI or Agentic use case; Azure Data & AI designation) | +3 | Solves "they don't say AI on their site" — the registry proves it (process rule R3) |
| Managed-service motion (AWS MSP program / Azure Expert MSP / `serviceType=ManagedServices`) | +2 | Recurring-revenue habit → white-label fits their P&L |
| Resale motion (AWS Solution Provider / Authorized Commercial Reseller) | +2 | Already resells someone else's product |
| Tier Premier +2 / Advanced +1 | | Credibility; Select is usually too small |
| Size sweet spot: 20–600 AWS certs | +1 | Below 20 = too small to matter; above ~2,000 = GSI |
| FinOps / Cloud Financial Management practice listed | +1 | Understands the pitch in one sentence (In Balance pattern); note possible overlap, not a kill |
| Target client base includes Startup / Mid-size | +1 | AI Reserve's end customers are AI product companies, not Fortune 500 |
| Listed in ≥2 cloud directories | +1 | Multi-cloud = more of their clients have AI spend to reduce |
| **Kill:** GSI / Big-4 / distributor (certs > 2,000 or name list) · HQ outside US/CA with no NA office · hardware-only VAR · staffing/training-only | | |

Tech-depth (the Technion signal) can't come from a directory. Apply it as a **manual/LLM pass on the top ~60 only**: engineering-led leadership bios, OSS/blog activity, AWS Ambassadors/Heroes on staff.

**Expected output size:** AWS US+CA raw ≈ 550 (AI slice) ∪ 170 (MSP) ∪ 80 (FinOps) ≈ 650 unique → after kills + rubric ≈ **150–250 firms**. Microsoft elite slices add maybe 50–100 net-new. That is an account-based list, not a volume list.

**Personas (Apollo, by domain):** CEO · President · CTO · CRO / Head of Sales · Head of Strategy & Partnerships / VP Alliances · VP/Head of Professional Services. 4–6 threads per firm → ~1,000 contacts, phone-enriched (Emerson's ask).

---

## 4. Business case — my advice

**Worth doing? Yes, as a focused second motion, not a replacement for the AI-product campaigns.** The economics are different in kind: one OpsGuru-shaped partner carries dozens of AI-spending end customers plus its own $50k/mo AI bill. Direct outbound wins one logo per cycle; a partner win compounds. The list is small (~200), the buyers are identifiable, and the data is free — the cost is Victor's build time (1–2 days) plus call time.

**Offer sequencing: lead with their own bill, expand to white-label.** The hook that is provably true today is "you spend ~$50k/mo on AI; we cut it." That's self-interest, measurable in a pilot, and needs no brand. White-label is the expansion conversation once a pilot has a number in it. Don't open with "become our channel" — a stealth company asking a consultancy to resell it is asking for trust it hasn't earned yet.

**The stealth constraint shapes the plan more than the data does.** Channel partners need collateral, a logo, a partner page and references before they'll put you in front of clients. Those arrive in 2–3 months. Partner ecosystems are small and talk to each other, and you get one first impression. So:

1. **Now (stealth):** pull the list, score it, pick the **top 25–40**. Work them as design-partner conversations: president/CTO + alliances persona, email + LinkedIn warm-up, phone to close the meeting. Goal: **2–3 pilot partners on their own AI spend** before coming out of stealth. OpsGuru becomes the reference once they'll allow it.
2. **At stealth exit:** launch the partner motion to the remaining ~150 with a real partner page, the OpsGuru story and pilot numbers. This is when the FinOps-practice firms and Azure Expert MSPs get a proper "white-label SKU" pitch.
3. **Keep the model companies' lesson:** the wins came through a champion, not a company. Score people as hard as firms — track where ex-Onica / Cloudreach / Rackspace / Mission Cloud GTM leaders land (the AWS-partner alumni network Tim Currie came from). A recently appointed president or CRO at a shortlisted firm is the single strongest trigger.

**Risks to name to Emerson:** channel cycles are longer than direct; a partner with its own FinOps practice may see AI Reserve as a competitor before a product (position as the AI-spend layer their FinOps tooling doesn't cover); margin share compresses unit economics; a weak partner can shelve you. Mitigation is the pilot-first sequencing above and a hard cap on how many partners you onboard before the first one is live.

**Decision needed from Emerson:** (a) rubric weights above, (b) whether to include firms with a FinOps practice or exclude as competitors, (c) go-ahead to pull AWS (US+CA) first, Microsoft elite slices second, Google after the pagination capture.

---

## 5. Build plan if approved (free, Tier-0 throughout)

| Step | Effort | Output |
|---|---|---|
| AWS pull: 3 facet slices × US/CA, paginate at 30 | 2 hrs | ~650 raw rows, domain-first |
| Rubric + kills (script) | 2 hrs | ~200 scored firms |
| Microsoft elite slices (`azuremsp`, Data & AI designation) + name→domain | ½ day | +50–100 net-new |
| Google: one capture to resolve paging, then pull NA | ½ day | +?, optional |
| Cross-directory dedupe (domain), multi-cloud flag | 1 hr | final list |
| Tech-depth pass on top 60 (LLM over leadership pages) | 2 hrs | ranked top 40 |
| Apollo personas + phone enrichment | downstream | ~1,000 contacts |

Method detail and gotchas live in `skills/icp-source-planner/library/cloud-partner-directories--msp-channel-partners.md`.

## Sources used for company facts
- https://bcbusiness.ca/business/tech-science/vancouver-based-cloud-expert-opsguru-becomes-first-canadian-company-to-hit-aws-milestone/
- https://www.cantechletter.com/newswires/opsguru-names-tim-currie-president-to-lead-next-phase-of-cloud-ai-growth-across-canada-and-the-us/
- https://www.channele2e.com/news/carbon60-aws-azure-gcp-opsguru
- https://techcouver.com/2021/05/13/opsguru-acquired-by-carbon60
- https://www.opsguru.io/ and https://www.opsguru.io/about-us (fetched 2026-10-07)
- https://www.inbalanceit.com/ , /leadership-team/ , /partners/ (fetched 2026-10-07)
- https://prospeo.io/c/in-balance-it-solutions (headcount/founded estimates)

---

## 6. Run results — 2026-10-07 (US · Canada · Israel)

Files (gitignored, in `data/ai-reserve/`): `channel-partners-master.csv` (all sources merged), `channel-partners-tierA.csv`, `channel-partners-tierB.csv`, plus per-source `aws-partners.csv` / `aws-scored.csv`, `ms-partners.csv` / `ms-scored.csv`, `gcp-partners.csv`.

| Source | Pulled (unique) | Of which consulting/services | After draft rubric |
|---|---|---|---|
| AWS Partner Finder — all partners, US 3,691 · CA 406 · IL 233 | 4,040 | 1,734 (2,306 are ISVs) | 374 shortlist · 148 at score ≥9 |
| Microsoft directory — elite slices only (Azure Expert MSP, Data & AI / Infra designations, Azure+AI+MSP) | 963 | 963 | 399 shortlist · 44 at score 9 |
| Google Cloud Partner Finder — all tiers via facet×keyword union | 1,218 | 1,218 | 107 shortlist (Premier/Diamond + AI competency) |
| **Merged master** (domain + name match) | **3,389** | 2,860 after kills | **Tier A 200 · Tier B 362** |

- Tier A = AI capability validated by a cloud vendor AND an MSP or resale motion AND total score ≥9. 161 of 200 have published AWS customer case studies to cite; 179 have a domain; 66 are in two or three directories; 32 list a FinOps practice.
- Tier A HQ mix: US 144 · Israel 11 · Canada 13 · other (with a NA office) 32.
- **Validation:** OpsGuru scores 12/14 and ranks in the top 10 of Tier A on the rubric alone (AWS Premier + MSP + Solution Provider + AI competency + Google Premier). Its Google Cloud brand MyOps (IL) also surfaced independently. In Balance IT is in none of the three directories, as predicted.
- Top of Tier A by score: ProfiSea (IL, 3 clouds), Adastra (ON), TeraSky (IL), Commit (IL), Dedicatted (ON), OpsGuru (BC), Quantiphi (MA), RapidScale (GA), Sela (IL), AppSquadz (PA), Ollion (WA), zeb (NJ).

**What changed vs the scope:** the cloud-directory universe is ~3,400 services firms, not the ~650 estimated from AWS AI facets alone, because the pull took every partner (so the rubric can be re-weighted without re-scraping). Israel over-indexes in Tier A relative to size — consistent with the "technically deep" OpsGuru pattern Emerson described.

**Open decisions for Emerson:** rubric weights; FinOps-practice firms (32 in Tier A) as targets or competitors; whether to include foreign-HQ firms with a NA office (32); which 25–40 to work first while in stealth.
