# Atlas Growth — plan from 2026-10-12

Built on the review in `REVIEW.md`. One number drives it: UK damp contractors convert at 2.0% positive, everything else at 0.3–0.8%. The plan puts most of the sending capacity behind the thing that works, keeps the second-best running, and only continues the US bets where a list is already built.

## Capacity

15 inboxes (5 Google-hosted domains × 3). At 20 sends/inbox/day that is ~6,600 sends/month, ~2,500 new contacts/month on a 3-step sequence. Allocation below is of new contacts.

| Line | Share | Contacts/month | Expected positives | Expected meetings (30% bridge) |
|---|---|---|---|---|
| UK trades (extensions next; damp residue) | 50% | 1,250 | 25 | 7–8 |
| UK battery installers | 25% | 625 | 5 | 1–2 |
| US (foundation qualified + generator Maps) | 25% | 625 | 3 | 1 |
| **Total** | | **2,500** | **~33** | **~10** |

The bridge today is 13–17% (23 positives → 3–4 meetings). Getting it to 30% is the cheapest win in the plan and costs no sends.

## This week (2026-10-13 → 10-17)

1. **Inbox rule, same day.** First reply to any positive answers the question in-channel: price ($200 / £200 per attended qualified appointment, ads in the client's own account), what counts as qualified, then the call offer. Phone when a number is given. No video push to anyone who asked for phone or email.
2. **Work the open positives in the export:** The Damp Group ("send us some samples"), Dry-Guard (WhatsApp), Save Energy UK (email the named inbox), the two US generator Maps leads (answer their questions by email), Spilde Electric (one plain answer, no call times).
3. **Stop the raw US Maps campaign.** Mark complete. Never top up.
4. **UK battery keeps running.** Load the 501 held registry-only rows this week or it runs dry (1,170 of 1,369 contacted). Operator call; the queue is staged. Add a per-segment job word (`job_word`) in `personalize-config-battery-uk.json`: electrician-led and battery-only firms get "battery storage installs", solar-led firms keep "home energy surveys".
5. **Gmail is settled (lead exports, same day): 357 Google-hosted US recipients, 0 replies of any kind; 161 Microsoft, 6 replies.** US mail is in Gmail spam. Until a Google seed lands with the live copy: filter US uploads to `mx != GOOGLE_WORKSPACE`, park the Google rows, and test in order (a) plain-text opener, no signature domain, no numbers; (b) correctly spelled `.com` domains; (c) Microsoft-hosted sending inboxes for Google recipients. Spend the last EmailGuard credit on (a).

## Weeks 2–3: scale the UK pattern, not the UK damp list

The UK damp/foundation run was already nationwide (177 Maps tiles, 898 worked leads, 435 sendable, all sent). What is left there is ~400 leads with no email address; nothing to scale. What scales is the pattern: UK owner-operated trades with a survey-then-quote sales motion convert 3–10× the US lists on the same copy.

1. **UK home extensions** (branch `claude/modest-tesla-ezb1ii`, scraped 2026-10-11: 41,689 unique → 24,065 geo-qualified → 16,813 with website + 6,328 without). Same country, same buyer type as damp (owner in a van, survey → quote → job), far bigger ticket (£30–80k). This is the next UK campaign and it is the one that should get the damp-style phone-first reply handling and the trial framing. Pipeline: site-text fit → owner → emails → verify → upload in tranches of ~1,000.
2. **UK damp residue:** `email-waterfall` on the ~400 worked leads with no address, or phone them; small, cheap, same copy.
3. **AU foundation upload, 168 rows**, built 2026-09-21, never uploaded. Ship as its own campaign.

Copy: unchanged opener. First-reply template carries price, qualification criteria, the 10-day trial framing, and "what's your number, I'll call you" for trade verticals.

## Weeks 2–4: US

- **US foundation qualified:** 1,104 ICP leads exist, 845 named, only 236 had verified emails and went out. Run `email-waterfall` on the named leads without an address (~600), verify, top up the qualified campaign. Judge at 600 contacted.
- **US generator Maps:** let step 3 send, keep topping up from the 881-row Maps upload (394 contacted). Judge at 800 contacted.
- **US generator dealers:** pause at 1,500 contacted unless positive rate is above 0.3%. OEM dealers already get manufacturer leads; the data says this is the weakest segment.
- **US pool builders, US home additions, US restoration** (branches `clever-cerf`, `sweet-lovelace`, `dreamy-hopper`): builds continue; restoration has 11,558 qualified and 2k verification staged. None touch sending capacity until the Gmail question is settled, because US small trades skew Google-hosted and the 10-04 test put the Silver GTM copy in Gmail spam 4/4.

## Decision points

| When | Check | If yes | If no |
|---|---|---|---|
| End of week 1 | plain-text opener lands at Gmail (EmailGuard) | release the parked Google rows | try `.com` domains, then Microsoft-hosted senders |
| UK battery at 1,900 contacted | positive ≥ 0.7% | load the 531 secondary + 80 risky | hold at the registry rows |
| US gen dealers at 1,500 | positive ≥ 0.3% | continue | pause, move capacity to UK damp |
| UK extensions at 600 contacted | positive ≥ 1.5% | add inboxes (reserve `.com` domains, 2–3 inboxes each) | re-read replies before adding volume |
| Monthly | meetings ≥ 10 | hold allocation | shift US share to UK damp |

## For the client conversation

- The UK damp line is producing; the Trident deal is the proof. Ask for a case line from it once live.
- Five of 54 human replies want pay-on-job, not pay-per-survey. Not a campaign fix. Raise it before the next pricing conversation; a "first 3 surveys free, then per-appointment" variant would answer the objection without changing the model.
- Domains misspell the brand ("altas"). Buy correctly spelled `.com` reserve domains now; they take 3–4 weeks to warm and the plan above needs them by week 4 if UK damp scales.
