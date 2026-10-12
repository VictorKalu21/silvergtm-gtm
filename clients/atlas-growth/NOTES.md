# Atlas Growth — working notes (internal, Silver GTM side)

Running notes on what the campaigns have taught us, which niches have been tried, and where this account is going. Review detail lives in `2026-10-12_campaign-review/REVIEW.md`; this file is the short memory.

## What we know as of 2026-10-12

**The offer gets replies in every niche. What varies is who receives the email and what they do with a yes.**

1. **US mail is not reaching Google-hosted inboxes.** PlusVibe lead exports (with its `mx` column) for the two cleanest US campaigns: 357 Google Workspace recipients contacted, **0 replies, 0 auto-replies, 0 out-of-office**. 161 Microsoft 365 recipients contacted, **6 replies (3.7%)**. Gmail does not fire vacation responders on mail it puts in spam, so zero auto-replies from 357 Google inboxes is the spam folder, not silence. The 2026-10-04 EmailGuard test said the same (Gmail 4/4 spam, Microsoft 3/3 inbox) on a different copy. US lists are 54–58% Google-hosted, so every US campaign so far ran at roughly 40% effective delivery.
2. **The US is not the problem.** The Microsoft slice of the US lists replies at 3.7%, which is higher than UK damp (2.8%) and UK battery (1.4%). "US needs an obscure niche" was the wrong read; the US needs Gmail placement.
3. **UK lists are mostly Microsoft 365**, which is why the UK "just works": UK battery repliers were 11 Microsoft to 1 Google. The UK results are real, and they were also never exposed to the Gmail problem.
4. **Niche ranking on actual results (positive % of contacted):** UK damp/foundation 2.0% → UK battery 0.77% → US foundation qualified 0.5% (n=199) → US generator Maps 0.5% (n=394) → US generator OEM dealers 0.27% → US raw unqualified Maps 0.07% (list error, not a niche result).
5. **Owner-operator trades want the phone.** Damp guys: "call me", "send me a WhatsApp", "I'd rather email". Battery firms (design directors, sales managers) are fine with a calendar. Match the close to the buyer.
6. **Six positives were lost by pushing a call/video on someone who asked for phone, email or a straight answer.** Reply template now carries price, qualification criteria, the 10-day trial and "what's your number".
7. **Nobody saw the 10-day trial.** Sent copy says "no pay unless I book you a survey". The trial (they fund ads in their own account, pay per attended appointment, stops after 10 days) is the line that answers the only real objection: "I won't pay before there's a job."
8. **Pricing rule (operator, 2026-10-12):** per attended appointment + trial by default. Percentage of contract only where jobs are reliably £20k+ (extensions yes; battery no at £3.5–15k).
9. **Personalisation defects:** company names go in as the register/Maps wrote them ("Eco Greenenergy Solutions Group Ltd", "SPILDE ELECTRIC, INC.", a Maps descriptor in brackets). Needs the `company_short` variable (planned in STATE, not built). Job word must match how the firm describes its own work ("home energy surveys" confused electricians).

## Niches: tried, building, to test

| Niche | Country | Source | Status | Result / note |
|---|---|---|---|---|
| Damp proofing + foundation/structural repair | UK | Google Maps, nationwide, 177 tiles | sent, list spent (435 of 898 had email) | **2.0% positive, 1 verbal close.** Winner. ~400 leads left with no email. |
| Home battery / solar installers | UK | MCS register (hidden API) | live, 1,170/1,369 contacted; 501 held + 531 secondary + 80 risky in hand | 0.77% positive, 2 meetings. Maps never pulled; would overlap MCS heavily. |
| Standby generator installers | UK | Google Maps | scraped, 32 residential leads | market too small. |
| Foundation repair | US | Google Maps, 10 states | qualified list 1,104; 236 sent, 199 contacted | 0.5% positive on the Microsoft half; Google half unreachable. Re-run after Gmail fix. |
| Foundation repair, raw Maps export | US | Google Maps, unqualified | sent 1,349 | 0.07%. Charities and a university replied. Never again. |
| Generator OEM dealers | US | Generac/Kohler/Cummins/Briggs/Champion dealer locators | sent 744 | 0.27%. Dealers get manufacturer leads; "I don't need a salesman". Deprioritise. |
| Generator installers (Maps) | US | Google Maps | live, 394 contacted | 0.5% on the Microsoft half. Re-read after Gmail fix. |
| Foundation repair | AU | Google Maps | 168-row upload built 2026-09-21, never sent | ship as its own campaign. |
| Home extensions | UK | Google Maps, nationwide | scraped 2026-10-11, 16,813 with website (branch `modest-tesla`) | next UK campaign. Big ticket (£40–150k), % of contract viable. Householder planning applications down 14% YoY, so builders are hungrier and homeowners slower. Test 400–500 first. |
| Water / fire / mold restoration | US | remediational.com directory ($0) | 11,558 qualified, 2k verification staged (branch `dreamy-hopper`) | the real US test once Gmail is fixed: urgent, insurance-funded, big ticket. |
| In-ground pool builders | US | Google Maps, warm states | building (branch `clever-cerf`) | |
| Home additions | US | Google Maps | ready to scrape, key missing (branch `sweet-lovelace`) | |
| **Septic tank / sewage treatment plant replacement** | UK | **British Water accredited installers register** (hidden-API playbook as MCS) | **to test** | Operator 2026-10-12: General Binding Rules force replacement at sale and on failure; £6k–£15k jobs; thousands of groundworkers and drainage firms do it; marketing near zero. Survey-then-quote motion like damp, owner-operated, UK = Microsoft-heavy. Strong candidate. |
| TRT clinics | US | — | considered, dropped | underserved but the market is too small to carry a campaign. |

## Direction

1. **Fix Gmail before any more US volume.** Until a Google-hosted test seed lands in the inbox with the live copy, route US lists Microsoft-only (the `mx` column makes that a filter) and park the Google rows. Candidate fixes in order: plain-text copy with no signature domain and no numbers (the plain-text question landed 3/3 on 2026-10-04), then a correctly spelled `.com` domain set, then Microsoft-hosted sending inboxes for Google-hosted recipients if the first two fail.
2. **UK carries the account meanwhile.** Battery rows in hand (1,100) with the new email, then extensions in a 400–500 tranche, then septic once the register is pulled. All UK trades get the phone-first reply.
3. **Rewrite the opener around the 10-day trial.** Drafts in the 2026-10-12 session; A/B against the current opener on the battery rows.
4. **Restoration is the US proof.** Big list, big ticket, buyers who already pay for leads. If it clears 1% positive with Gmail fixed, the US is open; if it does 0.3% with clean placement, then look for the obscure niche.
5. **Ask Atlas for a case line from Trident** once the first survey books.

## Changelog
- 2026-10-12: file created from the first campaign review. Gmail finding from the PlusVibe lead exports. Septic niche added by the operator.
