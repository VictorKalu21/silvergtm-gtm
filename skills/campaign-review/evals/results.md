# campaign-review eval results
Model: claude-sonnet-4-6  |  Run via subprocess claude -p

## 1. Triggering (should fire / should not)
| # | Expected | Result | Pass | Query |
|---|---|---|---|---|
| 1 | campaign-review | `campaign-review` - directly matches diagnosing cold email campaigns with low reply rates. | PASS | Can you review my cold email campaign? My reply rate is low. |
| 2 | campaign-review | `campaign-review` — diagnosing cold-outreach accounts (Instantly included) end-to-end is exactly what this skill covers. | PASS | Diagnose why my Instantly account is not booking meetings. |
| 3 | campaign-review | `campaign-review` — this is exactly the roster-review use case it covers. | PASS | Run the weekly roster review across all my cold outreach clients. |
| 4 | campaign-review | `campaign-review` — diagnosing low replies from a Smartlead campaign is exactly what this skill covers. | PASS | My Smartlead campaigns get opens but no replies. What is wrong? |
| 5 | campaign-review | `campaign-review` — directly covers diagnosing cold LinkedIn outreach via HeyReach when acceptance/reply rates are low. | PASS | Audit my HeyReach LinkedIn campaign, acceptance rate is terrible. |
| 6 | campaign-review | `campaign-review` - diagnosing deliverability/spam issues on a cold email account is exactly what this skill covers. | PASS | I think my cold email is going to spam. Can you check the account? |
| 7 | campaign-review | `campaign-review` — explicitly covers "categorize the reply pool" for Instantly campaigns via API. | PASS | Categorize the replies in my Instantly campaign and tell me what is landing. |
| 8 | campaign-review | `campaign-review` — this is exactly what that skill is built to diagnose. | PASS | Is my campaign problem the copy, the list, or deliverability? |
| 9 | campaign-review | `campaign-review` — drift-from-approved-ICP is explicitly listed as a trigger for that skill. | PASS | Check whether my live campaigns drifted from our approved ICP. |
| 10 | campaign-review | `campaign-review` — this is a cold email account review/diagnosis task. | PASS | Review the Bluesoft cold email account. |
| 11 | campaign-review | `campaign-review` - bounce rate spike on a cold email platform is a deliverability/infra diagnostic. | PASS | My bounce rate spiked on Smartlead. What is going on? |
| 12 | campaign-review | `campaign-review` — inbox placement testing and reply-drop diagnosis are explicitly covered by that skill. | PASS | Should I run an inbox placement test? My replies dropped to zero. |
| 13 | NONE | `cold-email` — directly matches cold email sequence writing. | PASS | Write me a cold email sequence for SaaS founders. |
| 14 | NONE | `prospecting` — building a targeted lead list is a prospecting task. | PASS | Help me build a list of Shopify agencies to reach out to. |
| 15 | NONE | `google-maps-scrape` - request is exactly what this skill covers: scraping Google Maps for local businesses by type and geography. | PASS | Scrape Google Maps for roofers in Phoenix. |
| 16 | NONE | `copywriting` — landing page copy improvement is a direct copywriting task. | PASS | Improve the copy on my landing page, it is not converting. |
| 17 | NONE | `ads` — directly covers Google Ads campaign setup. | PASS | Set up a Google Ads search campaign for my product. |
| 18 | NONE | `copywriting` — headline generation for ad copy is a copywriting task. | PASS | Generate 10 headline variations for my Facebook ad. |
| 19 | NONE | `prospecting` — finding agencies on a platform and getting decision-maker contact info is a prospecting/lead-sourcing task. | PASS | Find agencies on Clutch and get their decision-maker emails. |
| 20 | NONE | `content-strategy` - directly matches blog topic planning. | PASS | What topics should I write about on my blog? |
| 21 | NONE | `analytics` — GA4 conversion tracking setup is analytics configuration work. | PASS | Set up GA4 conversion tracking on my site. |
| 22 | NONE | `cold-email` — re-engagement email is a cold-email copywriting task. | PASS | Draft a re-engagement email to a warm lead who went quiet. |

**Trigger score: 22 / 22**

## 2. Diagnostic quality (golden cases -> correct binding constraint)
| Case | Expected | Model verdict | Pass |
|---|---|---|---|
| Untitled(orig) | deliver|placement|spam|infra | **Deliverability/placement** — `.info` sending domain (`k.caswell@webidentify-untitled.info`) is landing in spam; 80% auto-reply share + 0 positives with 1.4% bounce confirms mail is *accepted* but never seen, and LinkedIn converting the same offer rules out copy/targeting entirely. | PASS |
| SolveX | size | **targeting-company-size** — "only 1 contractor / one van" is the size-mismatch tell; the 2 real-company converts prove the offer and copy work, so the fix is the size filter on the list, not the message. | PASS |
| Bluesoft | persona|business.model|distributor|targeting | **targeting-persona-or-business-model** — the Shopify tech-stack filter is pulling B2B industrial manufacturers (prosthetics, surgical lighting, industrial filters) not D2C consumer brands; CRO is a D2C offer, and the off-persona titles (National Account Executive, B2B Business Manager) confirm you're reaching B2B salespeople, not ecommerce founders or heads of growth. | PASS |
| Campus51 | list|bounce|quality|rot | **list-quality/bounce** — 27% bounce + 15% "retired/wrong contact" replies confirm a stale educator database, not a copy or deliverability problem. | PASS |
| Minerva(seller) | offer|timing | **offer-timing** — seller-sourcing motions are gated to active sellers only, and your own positives are explicitly 12+ months pre-exit (Q1 2027), so the list is right but the window isn't. | PASS |

**Quality score: 5 / 5**

## TOTAL: trigger 22/22, quality 5/5
DONE
