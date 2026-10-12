# Atlas Growth — campaign review, 2026-10-12

**Platform:** PlusVibe (no API on the plan; review run from the unibox export + the per-campaign analytics pasted by the operator).
**Window:** 2026-09-01 → 2026-10-12. **Inputs:** `exports/inbox-export.xlsx` (112 threads, 138 inbound messages, 6 campaigns), pasted analytics, `STATE.md`, `ICP*.md`, `vertical-patterns.md`.
**Method:** `skills/campaign-review` rubric. Every reply body was read; PlusVibe's own labels were checked against the bodies. MX of every human replier's domain was resolved to bucket recipient provider.

## Verdict

**Mail is landing. The binding constraint is conversion: positives are lost in the reply handling (call-pushing, price withheld), and one campaign was sent on an unqualified list.** The UK damp campaign is the winner at 2.0% positive and a verbal "go ahead" and should be scaled first.

Evidence for "landing": human replies on all 6 campaigns and on all 5 sending domains (14 / 12 / 10 / 9 / 8 human replies, no dead domain), bounce under 1.3% everywhere, 3 PlusVibe-labelled meetings plus 1 verbal close. The high auto-reply shares (60% UK battery, 71% US raw Maps) are explained by the bodies: UK annual leave in early October, small-firm auto-acknowledgements, and, on the raw Maps list, ticket bots at charities and utilities. Not spam placement.

**One open question (not settled by this export):** 33 of 54 human repliers are on Microsoft 365, 11 on Google, 10 other. Without the recipient-provider mix of the uploaded lists, that skew cannot be read as Gmail suppression, but it is consistent with the 2026-10-04 test (Gmail 4/4 spam on the Silver GTM copy; the Atlas copy was never placement-tested). Resolve it with the two cheap checks in the action list.

## Portfolio

| Campaign | Dates | Contacted | Human replies | Auto | Positive (label) | Positive % of contacted | Bounce | Grade |
|---|---|---|---|---|---|---|---|---|
| UK foundation / damp (ST) | 09-20 → 10-06 | ~398 (step-1 sends) | 11 (2.8%) | 8 | 8 (7 interested + 1 meeting) | **2.0%** | n/a¹ | 🟢 winner |
| UK battery installers (ST) | 10-01 → 10-12 | 1,170 | 16 (1.4%) | 24 | 9 (7 + 2 meetings) | **0.77%** | 0.3% | 🟢 conv / 🟡 copy fit |
| US generator dealers | 09-28 → 10-10 | 744 | 11 (1.5%) | 2 | 2 | 0.27% | 0.5% | 🟡 copy/offer |
| US generator Maps | 09-29 → 10-04 | 394 | 5 (1.3%) | 2 | 2 | 0.5% | 0.2% | 🟡 monitor (step 3 not sent) |
| US foundation raw Maps | 09-01 → 09-11 | 1,349 | 9 (0.7%) | 22 | 1 | 0.07% | 1.2% | 🔴 **list** |
| US foundation qualified-in-Claude | 09-15 → 09-16 | 199 | 2 (1.0%) | 0 | 1 | 0.5% | 0.2% | 🟡 too small |
| **Total** | | **4,254** | **54 (1.3%)** | 58 | **23** | **0.54%** | <1.3% | |

¹ The pasted headline for the UK foundation campaign (11 sent, 6 contacted, 0 replies, 9.1% bounce) is a filtered date window; the step table (398 / 382 / 379 sends) and the unibox (19 repliers) are the real numbers.

Reply→meeting: 23 positives → 3 labelled meetings + 1 verbal close. That 13–17% bridge is where the money leaks (see §Conversion).

## Per-campaign reads

### UK foundation / damp — scale this
- Positive 2.0% of contacted, every stage 🟢. Trident Damp Solutions after the call: *"I think we'd like to go ahead using your service."* HMS Damp Proofing: *"Worth a chat."* Dry-Guard: *"send me a WhatsApp."* Crystal Damp Proofing: *"certainly open to such a proposal."*
- Objections, all about the **commercial model, not the offer**: Damp2Dry *"Why do I have to pay a fee of £100… nothing is guaranteed to win the job"*; J.N Home *"paying £200 for a survey appointment isn't going to work… unless the customer has accepted my quotation and paid their deposit"*; The Damp Group *"We already get 10-15 a week… based on inbound from website & seo"* then *"go ahead and send us over some samples"* (PlusVibe labelled this NOT_INTERESTED; it is a soft positive, follow it up).
- Fit leak, small: Thorpe Structural *"we don't do surveys"* (structural engineer, not a damp contractor); Homeshield *"the company has now closed down"*.
- List is spent: 398 contacted of the 435-row upload. Next list: the 897 worked UK leads not yet uploaded, the 397 PCA contractors (unverified), and the AU upload already built (168 rows).

### UK battery installers — keep running, fix the wording for electricians
- 0.77% positive after 12 days, 2 meetings (GLANtech Solar, Eco Greenenergy Solutions), Green Energy Systems *"happy to talk… I'm particularly focussed on how you qualify the leads"*, Save Energy UK *"Yes please send me an email."*
- **Copy confusion on the "home energy surveys" line**: TECC *"When you say home energy survey? What exactly is this as we are electricians"*; Precision Green Energy *"Depends what you mean by home energy surveys."* Two of 16 human replies did not understand the ask. Battery-only or electrician-led firms need the concrete job word (battery storage install / solar+battery quote).
- Model objections again: Solar Structures *"How much is a lead, and what do you call a qualified lead?… Why not get a percentage off a sale instead?"* and *"I get 100's of emails and calls on this per week"*; Renova *"we will only pay once we install"*; Solar Star *"we already get ten sales enquiries a day minimum and need more electricians than sales"*; Eaasy Heat *"we get 10 leads per day… through our social media advertising"*.
- 60% auto share = annual leave + auto-acks (read the bodies: honeymoon, training course, "skeleton hours"). Not placement.
- Volume: 1,170 of 1,369 contacted. Runs dry this week. The 501 held registry-only rows and the 80 risky addresses are the operator's call.

### US generator dealers — copy/offer, with list leakage
- Replies land (15% auto, 1.5% human) but the human pool is 9 "no" to 2 "yes". The "no"s are flat: *"I don't need a salesman"*, *"we're all set"*, *"How about I just hire you outright? You sound like a great sales person!"*, three "Stop/Remove". Two leaks: a solar firm *"I do not sell generators"* and a roofing company.
- Both positives went cold: Spilde Electric *"Yes"* → three call-scheduling pushes → silence; Sunrise *"Bring it!"* → no recorded reply in the export.
- Read: OEM dealers already receive manufacturer leads; the "10 generator estimates" promise reads as a sales pitch to them. Test the Maps-sourced electrician segment separately (campaign below) before judging the vertical.

### US generator Maps — too early
- 394 contacted, step 3 not sent. 2 positives, both asking for answers in-channel: *"A lot of people make that promise, how much is it and I only pay once I quote the job? … cut thru the fluff and tell me on here rather than a phone call"* (answered with a call request → silence) and NW Generator Pros *"How are you driving estimates? How are you qualifying leads?"*.
- Leave running; apply the reply-handling fix below.

### US foundation raw Maps — stop, never resend this list
- 0.07% positive on 1,349 contacted. The repliers tell you what the list was: Limbs for Life Foundation (*"grossly misleading"*), Tzu Chi Foundation, Communities Foundation of Texas, Deep Ellum Foundation, Cavett Kids Foundation, a university admissions office, El Paso Water, Alta Pest Control (3 branches), a YMCA, Webador and Instacart support desks, Sundek (*"we are not a foundation repair outfit"*), Warriors Concrete (*"we only do new construction"*), Superior Fence. Six "take me off your list" in nine human replies.
- This was the unqualified Maps export; the qualified list from `2026-09-11_foundation-repair` (1,104 ICP → 236-row upload) is what the sibling campaign used. Sending to charities and a university from the Atlas domains is a complaint risk. Mark the campaign complete and do not top it up.

### US foundation qualified-in-Claude — small sample, one lost positive
- 199 contacted, 1 positive (0.5%): Guru Waterproofing *"yes please call me <phone>"* → reply was *"Can't call you right now, but we could speak briefly on a video meeting"* → silence after two bumps. A phone number offered is a meeting; call it.
- Too small to grade. The remaining ~870 qualified US leads were never uploaded.

## Conversion — the reply-handling leak (cross-campaign)

Six positives in this export were lost by pushing the lead to a call or video instead of answering in the channel they chose:

| Lead said | Reply sent | Result |
|---|---|---|
| "yes please call me <number>" | "can't call… video meeting?" | silence |
| "I won't chat over the phone, I'd rather email. If it's free give it a go" | video call offered | "I don't do video calls. Don't worry we will leave it" |
| "cut thru the fluff and tell me on here rather than a phone call" | call times offered | silence |
| "How much?" / "How much per survey" | price given, then call push | one declined on price, one silent |
| "Yes" | three rounds of call times | silence |
| "send me a WhatsApp <number>" | — | not followed in export |

Rule for the inbox: **answer the question asked, in the channel asked, including the price and the qualification criteria, then offer the call.** Add a two-line price-and-criteria block to the first reply template. Where a phone number is given, phone.

## Offer feedback for the client (not a campaign fix)

Five of 54 human replies pushed back on pay-per-appointment and asked for pay-on-job or revenue share. Three UK damp firms and two generator firms. Two others said the "10 in 30 days" line sounds like every other pitch (*"a lot of people make that promise"*, *"lot of bad actors out there selling snake oil"*) yet still replied. The promise works as a hook; the payment model is the sticking point at the close. Worth telling Atlas before the Trident deal terms are set.

## Sending infrastructure

- 5 Google-hosted domains × 3 inboxes (15 inboxes), human replies spread evenly across all five. No dead domain. `.info` domains drew as many human replies as `.co` (24 vs 29), so no TLD penalty is visible.
- Brand misspelling ("altas") and reserve `.com` domains: still open from the 10-04 entry in STATE.md.
- PlusVibe labels were right on 50 of 54 human replies. Two mislabels matter: The Damp Group (soft positive labelled NOT_INTERESTED) and Rowing Restoration (walked away, labelled INTERESTED).

## Actions, in order

1. **T1 — US foundation raw Maps:** mark complete, never top up. Upload the remaining qualified US foundation leads (~870) to the qualified campaign instead.
2. **T1 — settle the Gmail question with two cheap checks:** (a) export each campaign's lead list from PlusVibe and resolve MX (the parser is in this folder) to get the Google share of the list, then compare with the 20% Google share of human repliers; (b) spend the last EmailGuard credit on the live Atlas copy unchanged. If Google-hosted leads are over ~40% of the lists and under 20% of repliers, hold Gmail leads until (b) passes.
3. **T2 — reply handling:** adopt the inbox rule above; answer the open UK/US positives today (Damp Group samples, Dry-Guard WhatsApp, Save Energy UK email, the two US generator Maps leads answered in-channel, Spilde one last plain answer).
4. **T3 — scale UK damp:** build the next UK upload (remaining worked UK leads + PCA members after verification) and the AU upload (168 rows, built, not uploaded). Same copy.
5. **T2 — UK battery wording:** add a `job_word` variant for electrician-led and battery-only firms ("battery storage installs" / "solar and battery quotes") and keep "home energy surveys" for the solar-led firms. Config change in `personalize-config-battery-uk.json`, not the engine.
6. **T2 — US generators:** let the Maps campaign finish step 3; if the dealer campaign stays under 0.3% positive at 1,500 contacted, pause it and keep the electrician/Maps segment only.
7. **Client conversation:** pay-per-appointment vs pay-on-job objection, with the five quotes above.

## Files
- `exports/` (gitignored): `inbox-export.xlsx`, `threads.json` (parsed), `replies_in.txt` (every inbound body, cleaned), `sent_out.txt` (sample outbound per campaign), `human_replier_domains.txt`.
- `parse-unibox.py`: turns the PlusVibe unibox export into threads + per-campaign tallies. Reusable for the next review.
