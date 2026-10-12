# Atlas Growth — plan from 2026-10-12

Built on the review in `REVIEW.md`. One number drives it: UK damp contractors convert at 2.0% positive, everything else at 0.3–0.8%. The plan puts most of the sending capacity behind the thing that works, keeps the second-best running, and only continues the US bets where a list is already built.

## Capacity

15 inboxes (5 Google-hosted domains × 3). At 20 sends/inbox/day that is ~6,600 sends/month, ~2,500 new contacts/month on a 3-step sequence. Allocation below is of new contacts.

| Line | Share | Contacts/month | Expected positives | Expected meetings (30% bridge) |
|---|---|---|---|---|
| UK damp / foundation | 50% | 1,250 | 25 | 7–8 |
| UK battery installers | 25% | 625 | 5 | 1–2 |
| US (foundation qualified + generator Maps) | 25% | 625 | 3 | 1 |
| **Total** | | **2,500** | **~33** | **~10** |

The bridge today is 13–17% (23 positives → 3–4 meetings). Getting it to 30% is the cheapest win in the plan and costs no sends.

## This week (2026-10-13 → 10-17)

1. **Inbox rule, same day.** First reply to any positive answers the question in-channel: price ($200 / £200 per attended qualified appointment, ads in the client's own account), what counts as qualified, then the call offer. Phone when a number is given. No video push to anyone who asked for phone or email.
2. **Work the open positives in the export:** The Damp Group ("send us some samples"), Dry-Guard (WhatsApp), Save Energy UK (email the named inbox), the two US generator Maps leads (answer their questions by email), Spilde Electric (one plain answer, no call times).
3. **Stop the raw US Maps campaign.** Mark complete. Never top up.
4. **UK battery keeps running.** Load the 501 held registry-only rows this week or it runs dry (1,170 of 1,369 contacted). Operator call; the queue is staged. Add a per-segment job word (`job_word`) in `personalize-config-battery-uk.json`: electrician-led and battery-only firms get "battery storage installs", solar-led firms keep "home energy surveys".
5. **Settle Gmail.** Export each campaign's lead list from PlusVibe; MX-resolve to get the Google share. Spend the last EmailGuard credit on the live Atlas copy. If Google leads are >40% of lists but <20% of repliers, route Gmail-hosted leads to a separate campaign and test a plain-text variant on them.

## Weeks 2–3: scale UK damp

The current UK list is spent (398 contacted of 435). Three sources, cheapest first:

1. **PCA members, 397 contractors** (already pulled from the trade body's hidden API, emails unverified). Verify (MillionVerifier → BounceBan, operator key + go), personalise with the existing UK config, upload. ~300 sendable expected.
2. **Dedicated UK damp-proofing Maps run.** The foundation-repair UK run admitted damp as adjacent and damp is what replied (273 damp-proofing rows carried the campaign). Run `google-maps-scrape` nationwide on damp proofing / timber & damp / basement waterproofing as the primary trade, not the adjacent one. Target 1,500 qualified, same pipeline (qualify → dedupe against the 898 worked leads → site text → owner → emails → verify → upload). Goes through `icp-source-planner` as a new ICP file (`ICP-damp-mould.md` exists; extend it).
3. **AU foundation upload, 168 rows, built 2026-09-21, never uploaded.** Same offer, new country, no new work. Ship it as its own campaign so the result is readable on its own.

Copy: unchanged. The opener works. Only change is the first-reply template above.

## Weeks 2–4: US

- **US foundation qualified:** 1,104 ICP leads exist, 845 named, only 236 had verified emails and went out. Run `email-waterfall` on the named leads without an address (~600), verify, top up the qualified campaign. Judge at 600 contacted.
- **US generator Maps:** let step 3 send, keep topping up from the 881-row Maps upload (394 contacted). Judge at 800 contacted.
- **US generator dealers:** pause at 1,500 contacted unless positive rate is above 0.3%. OEM dealers already get manufacturer leads; the data says this is the weakest segment.
- **US pool builders:** run opened 2026-10-11, continue the build; it does not touch sending capacity until a list exists.

## Decision points

| When | Check | If yes | If no |
|---|---|---|---|
| End of week 1 | Gmail share of lists vs repliers | Gmail-only campaign with plain-text variant | nothing changes |
| UK battery at 1,900 contacted | positive ≥ 0.7% | load the 531 secondary + 80 risky | hold at the registry rows |
| US gen dealers at 1,500 | positive ≥ 0.3% | continue | pause, move capacity to UK damp |
| UK damp new list at 600 contacted | positive ≥ 1.5% | add inboxes (reserve `.com` domains, 2–3 inboxes each) | re-read replies before adding volume |
| Monthly | meetings ≥ 10 | hold allocation | shift US share to UK damp |

## For the client conversation

- The UK damp line is producing; the Trident deal is the proof. Ask for a case line from it once live.
- Five of 54 human replies want pay-on-job, not pay-per-survey. Not a campaign fix. Raise it before the next pricing conversation; a "first 3 surveys free, then per-appointment" variant would answer the objection without changing the model.
- Domains misspell the brand ("altas"). Buy correctly spelled `.com` reserve domains now; they take 3–4 weeks to warm and the plan above needs them by week 4 if UK damp scales.
