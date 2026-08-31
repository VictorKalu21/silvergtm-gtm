---
name: campaign-review
description: Diagnose a cold-outreach account (cold email via Instantly / Smartlead, or LinkedIn via HeyReach) end-to-end via API — find whether the bottleneck is deliverability, copy, offer, or targeting, grade it against a fixed rubric AND against the client's own GTM/ICP, and produce a prioritized action list. Use when asked to review/diagnose a cold email or LinkedIn campaign, run a weekly multi-client roster review, figure out why replies/meetings are low, audit sending-account/domain health, categorize the reply pool, run an inbox-placement test, check whether live campaigns have drifted from the approved GTM or approved copy, audit list targeting (persona/title fit, business model such as D2C-brand vs B2B-distributor, company-size band, ICP adherence), or — once a review finds targeting/list quality is the bottleneck — recommend where and how to re-source or rebuild the lead list.
---

# Campaign Review (cold-outreach diagnosis)

A repeatable methodology for diagnosing a cold-outreach account — email (Instantly/Smartlead) or LinkedIn (HeyReach) — and telling the user **what is actually broken**, in priority order, instead of guessing. Built for both single-account deep dives and weekly multi-client roster reviews.

## Core principle — find the binding constraint, don't default to a cause

Walk the funnel top-to-bottom and stop at the first stage that fails its threshold (see Rubric). That failing stage is the **binding constraint** and it dictates the fix. Two opposite traps to avoid:

- **Don't default to copy.** Most people's instinct is "low replies = bad copy." It usually isn't — no copy converts from the spam folder. Prove inbox placement before touching copy.
- **Don't default to infra either.** A low-performing campaign is not automatically a deliverability problem. Over-blaming infra is the mirror-image laziness.

**The discriminator settles it:**
- **Same infra, results vary by angle/vertical → it's the COPY/OFFER/targeting.** (One account's campaigns differ widely → copy.)
- **Same/varied copy, everything dead-flat AND ~50% auto-reply share → it's the INFRA.** (Systemic across different copy → placement.)
- When copy can't be ruled out (e.g. all campaigns share one template), **run a real inbox-placement test** — it's the only tiebreaker. Never declare "deliverability, not copy" on a template-heavy account without one.

**Two axes, not one.** The funnel walk above finds the binding constraint *within* delivery → engagement → conversion. But an account can pass every funnel stage — deliver fine, get real human replies — and still be aimed at the wrong people, the wrong business model, or run copy the client never approved. So whenever you have the client's GTM/ICP doc, also run the **Execution-vs-strategy audit** (below). It's a parallel, mandatory check, not a fallback — **don't stop at an all-🟢 funnel.**

## Inputs to collect from the user

0. **Read the priors FIRST (before asking for anything):** `vertical-patterns.md` (next to this file) to set expectations for this motion × vertical, and the client's **`STATE.md`** in the client's folder under the agency root (on the original author's machine `C:\Users\victo\db2b\<client>\STATE.md`; on any machine, confirm the agency root with the operator once) for current campaign IDs/status, standing client directives, and open blockers. Don't re-derive what a prior review already settled, and don't violate a recorded client directive.
1. **Sequencer API key** — Instantly v2 (Bearer token, base64-looking string) or Smartlead. Have them save it to a file (e.g. `~/Downloads/<name> API Key.txt`) rather than pasting; read it with the Read tool.
2. **GTM / ICP / onboarding doc** (required before any *targeting* or *copy-drift* verdict) — the client's approved strategy: ICP (vertical, revenue/size band, geography), buyer persona/titles, business-model definition (e.g. D2C brand vs B2B distributor), disqualification criteria, and approved copy + credibility rules. **This is the source of truth.** Without it you cannot tell an intentional target from a targeting error — grading live campaigns against generic best practice instead of the client's own GTM is how you misdiagnose "wrong vertical" when the vertical was deliberate (the client may have case-study proof there). If it's missing, ask for it before calling targeting.
3. **Winning / approved copy** (ideal) — proven scripts to benchmark against, and the *approved* sequence copy to detect drift (see Execution-vs-strategy audit). Often lives in the GTM doc.
4. **EmailGuard API key** (optional) — for an actual inbox-placement test.
5. **Symptom** — low opens / good opens-low replies / low volume / high bounce. Steers where to dig, but verify against data regardless.
6. **DB2B internal portal (roster reviews / booking ground-truth)** — the agency's own portal holds what the sequencers can't: per-client bookings, deal model, KPI targets. Auth: `POST https://portal.directb2bleads.com/api/admin/auth/login {"email","password"}` → `{token}` → `Authorization: Bearer <token>` (creds in `db2b\_keys\agency-handover.env`; the SPA at admin.directb2bleads.com 405s on POST — the API host is portal.). Key calls: `/api/customers` (industry, `pricing_plan` retainer|pay_per_appointment, notes w/ service plan + client revenue), `/api/customers/{id}/pipeline` (`lead_status`: booked/warmlead/lead/voided/no_show + channel + month_key — THE booking record), `/kpis` (target_value+period). `/api/finance/*` needs super_admin (403 on admin role). Portal `booked` counts are the conversion ground truth — sequencer `interested`/`opportunities` undercount it.
7. **Expired-plan gotchas:** a Smartlead sub-account key on a lapsed plan returns `{"message":"Plan expired!"}`; a lapsed Instantly workspace returns HTTP 402 on every endpoint. Neither means a bad key — fall back to prior-review numbers in STATE.md and FLAG the staleness.

## The signal that settles deliverability vs copy

Compute these from analytics. They beat opinions:

- **Auto-reply share** = `out_of_office (auto) replies / total replies`. **If ≈50% of "replies" are autoresponders AND there are near-zero genuine human replies, mail is being accepted by servers but never seen by humans = spam placement.** Decisive — but only with the second half. **Caveat (don't over-read it):** a high auto-reply share *alongside plenty of real human replies* (people saying "no thanks"/"not now"/"scam") is **not spam** — mail is clearly landing. Two things inflate the auto-reply share on perfectly-delivered campaigns: (1) **seasonal OOO** (mid-summer/holidays push OOO to ~45%), and (2) **small-business auto-acknowledgement bots** ("we aim to respond in 2 working days", "acknowledge safe receipt") — common when the list skews toward micro-businesses/sole traders. The only way to tell spam from auto-ack/OOO is to **read the bodies** (see Reply-sentiment pull). High auto-reply share is a flag to investigate, not a verdict.
- **Genuine positive rate** = `(interested + meeting_booked) / emails_sent`. Healthy cold email ≈ 0.5–2%. Below ~0.05% with low bounce = deliverability, not copy.
- **Same near-zero result across many campaigns with different copy/offers/verticals** = systemic (infrastructure), not copy.
- **Bounce rate low + replies near zero** = lists are fine, mail is landing somewhere (spam), not being rejected.
- **Open tracking is usually OFF** (correct for deliverability) → you're blind on opens. Use the auto-reply ratio and an EmailGuard test instead of opens.

## Grading rubric (apply to every account)

Grade each funnel stage 🟢/🟡/🔴; the lowest failing stage is the binding constraint.

### Email funnel (Instantly / Smartlead)
| Stage | Metric | 🟢 Good | 🟡 Watch | 🔴 Broken |
|---|---|---|---|---|
| Delivery | Bounce % | <2% | 2–4% | >4% |
| Placement | Auto-reply share of replies | <20% | 20–40% | >40% (=spam) |
| Volume | Sent vs weekly capacity | ≥80% | 40–80% | <40% (list dry) |
| Engagement | Reply % (of contacted) | >3% | 1–3% | <1% |
| Conversion | Positive % (interested+mtg / sent) | >0.5% | 0.2–0.5% | <0.2% (<0.05% = infra) |

### LinkedIn funnel (HeyReach)
| Stage | Metric | 🟢 | 🟡 | 🔴 |
|---|---|---|---|---|
| Acceptance | Connection-accept % | >30% | 20–30% | <20% (profile/ICP/note) |
| Volume | Requests sent vs cap | ≥80% | 40–80% | <40% |
| Engagement | Reply % of accepted | >15% | 8–15% | <8% |
| Conversion | Positive % of accepted | >3% | 1–3% | <1% |

### Constraint → action engine
| Binding constraint | Diagnosis | Action point |
|---|---|---|
| Bounce 🔴 | Dirty list | Re-verify / clean list (pause first if torching reputation) |
| Auto-reply 🔴 / positive <0.05% across *different* copy | Deliverability/infra | Pause + placement test + fix infra |
| Volume 🔴, everything upstream 🟢 | List exhausted | Needs more leads |
| Placement 🟢 but Reply 🔴 | Copy/offer | Underperforming — rewrite angle |
| 4%+ reply but <0.2% positive | CTA/offer (copy, NOT infra) | Tweak CTA / qualify harder |
| Replies but all "wrong person" | Targeting | Fix ICP / seniority |
| Live copy ≠ approved GTM copy (fabricated/scam claims) | Copy-drift from signed-off strategy | Revert to approved copy; cut the unprovable claims |
| On-persona title share <~40% of list | Persona targeting | Re-pull list filtered to GTM persona titles |
| Right vertical but B2B-distributor / sales-rep titles | Wrong business model | Add brand-vs-distributor + size filter, re-source |
| Live list outside ICP size/revenue band | Off-band targeting | Tighten size filter to the ICP band |
| One angle clears bar, others don't (same infra) | Winner found | Double down on winning angle |
| LinkedIn accept 🔴 | Profile / ICP / connection note | Rewrite note, re-check list fit |
| LinkedIn accepts high but msgs << accepts | Sequence not firing | Fix follow-up automation (leak, not targeting) |
| All 🟢 and at capacity | Headroom | Expand (inboxes / leads / verticals) |

### Priority tiers (for roster ranking)
- **T1 — Stop the bleed:** infra broken, fully stalled, or actively damaging reputation (e.g. high bounce). Fix this week.
- **T2 — Optimize:** delivering but weak engagement/conversion. Copy/targeting/sequence work.
- **T3 — Scale:** winning + at capacity. Pour fuel.
- **T4 — Monitor:** just launched / still ramping. Leave it, note the check-back date.

## Execution-vs-strategy audit (grade the live account against the client's GTM)

Run this whenever you have the GTM/ICP doc. It catches the failure mode the funnel rubric **cannot**: a campaign that *delivers fine and gets real human replies* but is pointed at the wrong people, the wrong business model, or runs copy the client never approved. The funnel can be all-🟢 and the account still fails here. Five proactive checks, each graded against the GTM — **not** generic best practice.

### A. Copy-drift — live copy vs approved copy
Pull the live sequence: `GET /campaigns/{id}` → `sequences[0].steps[].variants[].subject/body` (HTML — strip tags). Compare to the GTM's approved copy + credibility rules:
- **Fabricated / unbelievable claims** ("grew revenue 2,600%", "added 255K in 90 days", a *different* miracle stat per campaign) — especially ones absent from the approved doc or that violate its "what we don't say" list. Scam-reading claims tank an otherwise credible offer and produce "is this a scam?" replies.
- **Missing credibility stack** the GTM specifies (years in business, review counts, named proof).
- **Generic subjects** the GTM warned against.
Verdict: if live copy ≠ approved copy, the fix is **revert to the approved version**, not "rewrite the angle." Flag the drift explicitly — execution deviating from the signed-off strategy is its own finding.

### B. Persona fit — bucket the lead-list titles (don't wait for reply tags)
The reply-tag method (`FILTER_LEAD_WRONG_PERSON`) is reactive and only fires post-send. Do it proactively: pull the lead list, read each lead's title, bucket against the GTM persona, report the **on-persona %**.
- Titles live under inconsistent uploaded-payload keys — check **`payload.Title` AND `payload.'Job Title'`** (capitalized), not lowercase `title`.
- Bucket: Founder/Owner/CEO/President · Ecommerce · Marketing/Brand/Growth · **Sales/Account-exec** · Ops/Other · None.
- On-persona = the GTM's target roles (e.g. Founder + Ecom + Marketing). **If on-persona < ~40% of the list, persona targeting is the binding constraint** regardless of deliverability. (Example: an account at 12% on-persona / 88% sales+ops is mis-targeted at the person level — and that matched the "reach out to marketing / I oversee, not interested" replies.)

### C. Business model — right vertical, wrong model (brand vs distributor)
A vertical filter — or a tech-stack filter like "uses Shopify" — pulls in companies in the right *industry* but the wrong *business model*: B2B distributors / manufacturers / wholesalers that aren't the client's D2C-brand ICP. **The off-persona titles are the tell** — a small D2C consumer brand has no "Regional Sales Manager – Eastern US" or "Large Account Manager"; those titles mean the company is B2B. Cross-check company names/domains for B2B signals (`supply, distribution, wholesale, components, manufacturing, services, resource, systems`) and the site for "request a quote / net-30 / dealer login". Grade against the GTM's disqualification criteria (which usually excludes "B2B services").

### D. Size-band adherence — is the live list inside the ICP band?
Check the live list's company size/revenue against the GTM band (e.g. $500K–$5M / 1–50 employees). Off-band segments (e.g. 200–500-employee lists when the ICP is small scaling brands) are a targeting error even when everything upstream is 🟢 — and they tend to be the dead segments (0 opportunities). The size filter alone usually strips out most wrong-business-model companies (big B2B distributors fall out).

### E. Source-provenance — compare performance by lead source
If campaign names or metadata encode the lead source (e.g. `AP`=Apollo vs `SI`=another source), compare reply/positive rates **by source**. The account's own data often already shows which sourcing method works (small-store / "with-titles" / non-Apollo lists out-converting the big generic Apollo pulls) — that's evidence for the sourcing fix, straight from the client's own results.

## Instantly v2 API — the calls that work

Base: `https://api.instantly.ai/api/v2/`  Header: `Authorization: Bearer <KEY>`
Use PowerShell `Invoke-RestMethod` on Windows (bash has no python here). Large responses: persist to file.

### 1. Per-campaign analytics (start here)
`GET /campaigns/analytics` → array, one row per campaign. Key fields:
`emails_sent_count, contacted_count, open_count_unique, reply_count_unique,
reply_count_automatic_unique, bounced_count, total_opportunities, leads_count, campaign_status`
Build a table: Sent / OpenU / Reply% / Bounce% / Opps, sorted by Sent. Sum for portfolio totals.
- Reply% = `reply_count_unique / emails_sent_count`.
- Auto share = `reply_count_automatic_unique / reply_count_unique`.

### 2. Sending-account health
`GET /accounts?limit=100` (paginate via `next_starting_after`). Per account:
`email, status (1=active), warmup_status, stat_warmup_score, daily_limit, provider_code
(1=Google, 2=Microsoft/Outlook, 3=other/SMTP), enable_slow_ramp, sending_gap, setup_pending`
**Warmup score 90+ is a VANITY metric** — it only measures Instantly's warmup network, not real-world Gmail/Microsoft placement. Do not trust it as a deliverability signal.
Compute:
- **TLD split** — `.info`/`.biz`/`.co` are spam-flagged; `.com` is the standard. High `.info` share is a red flag.
- **Inboxes per domain** — 3–4 is healthy; **>10 on one domain is a spam-cannon pattern** (that domain is likely torched).
- **ESP concentration** — heavy Microsoft/Outlook (provider_code 2) is high-risk; MS junks cold outreach aggressively.
- **Misspelled lookalike domains** (e.g. `untitledaudeince.co`) scream phishing to filters and prospects.

### 3. Reply pool — categorize with Instantly's own tags (don't guess sentiment)
`POST /leads/list` with body `{"filter":"<FILTER>","limit":100}`, paginate via `starting_after`.
Working filters (count each by paginating):
`FILTER_LEAD_INTERESTED, FILTER_LEAD_MEETING_BOOKED, FILTER_LEAD_MEETING_COMPLETED,
FILTER_LEAD_CLOSED, FILTER_LEAD_NOT_INTERESTED, FILTER_LEAD_WRONG_PERSON, FILTER_LEAD_OUT_OF_OFFICE`
Tagged totals should roughly equal `reply_count_unique` from analytics → that confirms you have the full pool.
**GOTCHA:** `{"status":3}` does NOT filter (it returns all leads). Use the `filter` enums above for categories.
**GOTCHA:** `FILTER_LEAD_REPLIED` is NOT a working reply filter — it returns ALL leads (verified 2026-07-16: it returned each campaign's full `leads_count`, not just repliers). To get the replied set, use the category enums above (interested/not-interested/OOO/etc.) or filter client-side on `status:3`.
**GOTCHA:** a `campaign_id` in the `/leads/list` body may NOT filter either (returns account-wide) — verify each lead's returned `campaign` field, or filter client-side. Paginate the whole account via `next_starting_after` and bucket yourself.
Lead fields: `email, company_name, campaign, status (3=replied, -1=bounced, -2=unsub), email_reply_count`.
**Uploaded custom vars sit in `payload`** — including the contact title under inconsistent keys (`payload.Title` and/or `payload.'Job Title'`, capitalized — not lowercase `title`). This is what powers proactive persona bucketing (see Execution-vs-strategy audit → Persona fit).

### 4. Read actual reply bodies
`GET /emails?search=<url-encoded lead email>&limit=30` → returns that lead's thread.
- `ue_type=1` = your outbound send. **`ue_type=2` = inbound reply from the lead.** `ue_type=3` = forward.
- Body is an object: use `body.text` (plain) — strip quoted history (`On ... wrote:`, `-----Original Message-----`, `From:`).
- `lead_id=` and `thread_id=` params are unreliable (return only outbound / get ignored). `search=` by email works.
- `emails?ue_type=2` filter is ignored. Read per-lead via `search`.
Pull verbatim quotes from interested + meeting_booked leads — they reveal objections, competitor mentions, and pricing/integration questions to pre-empt in follow-up.

## Smartlead API — the calls that work (verified)

Base: `https://server.smartlead.ai/api/v1/`  Auth: **`?api_key=<KEY>` query param** (not a header).
Agency setups use a **separate key per client sub-account** — each key only sees that client's campaigns/inboxes. Use PowerShell `Invoke-RestMethod`.

### 1. Campaigns + per-campaign analytics (start here)
`GET /campaigns?api_key=KEY` → array of `{id, name, status}` (`ACTIVE/PAUSED/COMPLETED/DRAFTED`).
`GET /campaigns/{id}/analytics?api_key=KEY` → key fields:
`unique_sent_count` (people contacted), `sent_count` (total touches), `reply_count`, `bounce_count`,
`open_count` (usually 0 = tracking off), `campaign_lead_stats.interested` (manual positive tag),
`send_as_plain_text` (true is good for deliverability).
Build totals: contacted = Σ`unique_sent_count`; Reply% = `reply_count/unique_sent_count`; Bounce% = `bounce_count/unique_sent_count`; positives = Σ`interested`.

### 2. Recipient ESP mix (the Google→Microsoft decider)
`GET /campaigns/{id}/leads?api_key=KEY&offset=0&limit=100` (paginate to `total_leads`); each row is `{lead:{email,...}}`.
Extract recipient domains, dedupe, `Resolve-DnsName -Type MX` each unique domain, bucket: `google|googlemail|aspmx`→Google, `outlook|microsoft|protection.outlook|office365`→Microsoft, else Other.
**Why:** Google-sending inboxes land in spam on Microsoft tenants (worst sender→receiver combo). The Microsoft share decides whether to buy provider-matched O365 infra. Buy infra **sized to the MS segment only** if its pipeline value justifies it — don't re-infra the whole list for a 25% slice.

### 3. Sending-account health
`GET /email-accounts/?api_key=KEY&offset=0&limit=200` (paginate). Same infra checks as Instantly: TLD split (`.info`/`.biz` bad), inboxes-per-domain (>10 = spam cannon), ESP concentration, misspelled lookalikes.

**GAP:** Smartlead analytics has **no native auto-reply / sentiment field** (unlike Instantly's `reply_count_automatic_unique`). Don't fabricate an auto-reply ratio for Smartlead from analytics alone.

**BUT — the cheap middle path (verified 2026-07-07): the `/campaigns/{id}/statistics` rows carry a `lead_category` string field** (Smartlead's own reply tags: `Out Of Office`, `Not Interested`, `Do Not Contact`, `Interested`, `Meeting Booked`, `Meeting Request`, `Information Request`, `Potential`, `Wrong Person`, `Uncategorizable by Ai`, …). Page `/statistics` to `total_stats`, keep rows where `reply_time` is non-null, **dedupe by `lead_email`**, and bucket `lead_category` → a **full reply breakdown INCLUDING the OOO share, without reading a single body.** (On a real account this surfaced 174 OOO / 328 repliers = 53% auto — the number the analytics endpoint can't give you, and it settled a "are these all human?" challenge instantly.) Caveats: (1) tags are auto/team-applied, so an **`(untagged)` bucket remains** → read those bodies to finish it; (2) **match category names EXACTLY** — substring-matching `interested` also catches `not interested` (a real bug that pulled the wrong bodies — filter on the exact lowercased string); (3) a **`Meeting Booked` tag ≠ a real booked call** — one was a business-*sale* inquiry misreading the offer → always read the positive-category bodies to confirm what the reply actually *did*. Use this categorization FIRST; fall back to the full body-pull (section 4) only for the untagged + positive buckets.

### 4. Reply-sentiment pull (opt-in — confirm before running, it's many calls)
The way that works (verified) to read actual reply bodies:
1. `GET /campaigns/{id}/statistics?api_key=KEY&offset=&limit=100` (paginate to `total_stats`) → collect `lead_email` where `reply_time` is non-null = the replied set.
2. **Per-replied-email, look up the lead id:** `GET /leads/?api_key=KEY&email=<urlencoded>` → `id`. (Do NOT paginate `/campaigns/{id}/leads` to find them — that endpoint caps at the first 100 and `offset>=100` returns empty.)
3. `GET /campaigns/{id}/leads/{lead_id}/message-history?api_key=KEY` → `history[]` with `type` `SENT`/`REPLY` and `email_body` (HTML — strip tags). Take the first `type:"REPLY"`.
4. Categorize each body yourself: OOO / not-interested / wrong-person / contact-changed / objection / **interested**. Pull verbatim quotes from positives + objections.
   - **List-rot signal:** a high share of "I've retired / no longer employed / email changed / wrong person" replies independently corroborates a high bounce rate → the list is stale, not the copy. Reading replies cross-checks the bounce number.
   - **Targeting signal:** replies like "we're not a school" / "online-only, no teachers" / "forwarded to the Head" reveal ICP leakage and wrong-seniority targeting to tighten. **Size-mismatch** is a common hidden one: "there's only 1 of us / one van", "small team, we move together" = the product needs a bigger company than the list contains → fix the size filter, not the copy. When the *same copy* gets positives from right-sized firms but "too small for us" from the rest, the constraint is targeting, full stop.
`lead_category_id` exists on leads (Smartlead defaults ≈ 1 Interested, 3 Not-Interested, 6 OOO) but the team tags sloppily, so read bodies rather than trust tags. (`/lead-categories` 404s on these keys.)

### 5. Cloning a campaign (create a draft testbed for an A/B without touching the live one)
No single "clone" endpoint. Rebuild in steps: `POST /campaigns/create?api_key=KEY` `{name, client_id}` → returns new `id` (a DRAFT). Then `POST /campaigns/{id}/sequences` with the copied steps. Leave mailboxes + leads UNattached and it cannot send — a safe testbed. **Schema gotcha (asymmetric GET vs POST):** the sequences GET returns `sequence_variants` + `seq_delay_details.delayInDays` (camelCase), but the POST body requires **`seq_variants`** + **`seq_delay_details.delay_in_days`** (snake_case), plus `variant_distribution_type:"MANUAL_EQUAL"` per step. Map GET→POST or you get `"sequence_variants" is not allowed` / `"delay_in_days" is required`. Send `User-Agent: Mozilla/5.0` on POSTs (default UA can 403 via Cloudflare). `client_id` comes from any campaign's analytics row. **Editing sequences:** POST `/campaigns/{id}/sequences` REPLACES the whole sequence set (to cut/add a variant, re-POST the full structure minus/plus it). **Read-after-write lag:** a GET immediately after a sequence POST can return STALE data (e.g. still shows the variant you just dropped) — the write succeeded (`ok:true`); re-GET a moment later to confirm, don't trust the first verify. Attach mailboxes: `POST /campaigns/{id}/email-accounts` `{email_account_ids:[...]}` (ids from `/email-accounts`). A campaign with a sequence + mailboxes but NO leads is still inert (won't send) — safe end-state for a testbed.

### 6. Uploading leads (and the `upload_count` lie — verified 2026-07-09)
`POST /campaigns/{id}/leads?api_key=KEY` body `{lead_list:[{email, first_name, last_name, company_name, custom_fields:{...}}], settings:{...}}`. Batches of ≤100. Native fields map directly; anything else goes in `custom_fields` (referenced in copy as `{{field}}`). **THE TRAP:** the response `upload_count` counts leads it *received*, NOT leads it *attached*. When a lead already exists in ANOTHER campaign in the same client (e.g. re-testing leads that sit in an old paused campaign), Smartlead **silently skips attaching it** while STILL reporting `upload_count:100 block_count:0` — so a "successful" 495-lead upload can leave only the net-new ~85 actually in the campaign. **The control is the `settings.ignore_duplicate_leads_in_other_campaign` flag, whose sense is INVERTED from what the name suggests:** `true` = skip leads that live in other campaigns (they won't attach); **`false` = attach them anyway.** Set it **`false`** to re-use/re-test existing leads in a new campaign. Also read the full response fields (`duplicate_count, invalid_email_count, already_added_to_campaign, unsubscribed_leads, is_lead_limit_exhausted`) not just `upload_count`. **ALWAYS verify post-upload** with `GET /campaigns/{id}/analytics` → `campaign_lead_stats.total` and confirm it equals the intended count — never trust the upload response alone.

### 7. Bounce diagnosis — sender-side vs dirty-list, and "are my domains dead?" (verified 2026-08-12, AI Reserve)
When the symptom is **high bounce**, don't guess list-vs-sender — the data separates them cleanly:
- **Read the bounce CATEGORY, not just the count.** `GET /campaigns/{id}/statistics` rows carry `is_bounced` (bool) + `lead_category`. **`lead_category = "Sender Originated Bounce"` = the send was rejected on the SENDER's side (reputation/spam/auth), NOT an invalid recipient address.** That single tag reorients the whole diagnosis away from "clean the list."
- **Read the actual DSN to get the reason + attribute the domain.** The bounce-back is stored as a `type:"REPLY"` entry in `GET /campaigns/{id}/leads/{lead_id}/message-history` (look up `lead_id` via `GET /leads/?email=`). Its `from` field is the **sending domain** (e.g. `MicrosoftExchange…@solutionaireserve.co`) → tally `from`-domain across all bounced leads to find WHICH sending domain is bad (here 24/25 bounces = one domain). The body names the rejecting server + reason: *"<recipient-domain> suspects your message is spam… Office 365… Spam or virus detected"* = the recipient's **Microsoft tenant spam-rejected** it.
- **The MS→MS smoking gun.** If the bad sending domain's MX is `*.mail.protection.outlook.com` (Microsoft 365) AND the bounces come from recipient **Office 365** tenants, that's the worst sender→receiver combo — Microsoft aggressively spam-rejects cold mail, hardest from another MS tenant. Google-hosted sending domains (`aspmx.l.google.com`) in the same account bounced **zero** → the problem is isolated to the MS domain, not the account.
- **"Are the domains dead?" = a DNS health sweep, not a vibe.** Per domain: `Resolve-DnsName A / MX / TXT(SPF) / _dmarc(TXT)` + Spamhaus DBL (`Resolve-DnsName "<domain>.dbl.spamhaus.org"` — an answer = LISTED, NXDOMAIN = clean). **Resolves + SPF/DMARC intact + not on DBL = NOT dead** — the bounces are placement/reputation, not a burned domain. MX host doubles as the ESP tell (outlook = Microsoft, google = Google). Grouping the account's inboxes by domain (`GET /email-accounts`) also surfaces the **spam-cannon**: here 25 of 35 inboxes stacked on the one MS domain that produced ~all bounces, vs 2/domain on the healthy ones (>10/domain confirmed as the reputation-killer, first-hand).
- **Verify the list anyway to CLOSE the loop** (DeBounce the contacted set): 0% invalid here → decisively ruled the list out and left sender-reputation as the sole cause. A clean list + "Sender Originated Bounce" + MS-hosted over-stacked domain = fix the infra (retire/rebuild the over-loaded MS domain, spread inboxes ≤3/domain, prefer Google-hosted for MS-heavy recipient lists), not the list.

## HeyReach API — LinkedIn outreach (verified)

Base: `https://api.heyreach.io/api/public/`  Header: **`X-API-KEY: <KEY>`** + `Content-Type: application/json`. One key per LinkedIn account. POST endpoints take JSON bodies. (`auth/CheckApiKey` is POST-only — a GET returns 405; use `campaign/GetAll` to prove a key works.)

### 1. Campaign list
`POST /campaign/GetAll` body `{"offset":0,"limit":50}` → `{items:[{id,name,status}]}` (`IN_PROGRESS/PAUSED/FINISHED/DRAFT`).

### 2. Overall stats (the LinkedIn funnel)
`POST /stats/GetOverallStats` body `{"accountIds":[],"campaignIds":[],"startDate":"<ISO>","endDate":"<ISO>"}` (empty arrays = all). Returns `byDayStats` keyed by day; **sum across days** in your window. Per-day fields:
`connectionsSent, connectionsAccepted, connectionAcceptanceRate, messagesSent, totalMessageReplies, messageReplyRate, autoTaggedInterested, uniqueLeadsContacted`.
Compute: Accept% = `Σaccepted/Σsent`; Reply% = `Σreplies/Σaccepted`; positives = `ΣautoTaggedInterested`.
**Watch the `messagesSent << connectionsAccepted` leak** — means the follow-up sequence isn't firing on most accepted connections (a fixable automation gap, not a targeting problem).

### 2b. Access path when you're given an MCP key, not a REST key (verified 2026-07-07)
Clients often hand over a **HeyReach MCP URL** (`https://mcp.heyreach.io/mcp?xMcpKey=<urlencoded>`) instead of the REST `X-API-KEY`. **They are different tokens** — the `xMcpKey` returns 401 against `api.heyreach.io`. Don't ask for the REST key; drive the review through the MCP endpoint (it wraps the same data + more):
- It's **stateless streamable-HTTP JSON-RPC**. No session handshake needed — POST `tools/call` directly. Headers: `Content-Type: application/json`, `Accept: application/json, text/event-stream`.
- Response is **SSE**: body is `event: message\ndata: {json}`. Extract with `[regex]::Match($resp.Content,'(?s)data: (\{.*\})').Groups[1].Value`, then the tool's real payload is a **doubly-encoded JSON string** at `.result.content[0].text` → `ConvertFrom-Json` it a second time.
- Tools map 1:1 to the review: `get_all_campaigns` (→ `.items[]` with `progressStats`: `totalUsers/InProgress/Failed` — **high `totalUsersFailed` = unconnectable-list volume leak, flag it**), `get_overall_stats` (the funnel; args `startDate/endDate/accountIds/campaignIds`, **omit the array args entirely rather than passing `@()`** or the call returns null), `get_campaign_sequence` (the connection note + message tree), `get_conversations_v2` (read replies; filter `campaignIds`, page `limit`≤100).
- **PowerShell gotcha that silently returns null:** do NOT name a helper-function parameter `$args` — it's an automatic variable and the hashtable never reaches the body. Use `$argsHash` or inline the call. (Cost a real debugging loop.)
- **Reading `get_conversations_v2`:** `items[].messages[].sender` did NOT cleanly separate our sends from lead replies by id — **distinguish by content** (short/conversational = lead; templated = ours). The sender's display name appears in lead replies ("Hi <Cristina>, happy to connect") → that's who the LinkedIn sender profile actually is, even when the campaign is "branded" for someone else.
- **MCP keys are per-workspace AND can be READ-ONLY (verified 2026-07-17).** Each `xMcpKey` scopes to ONE client's org — a db2b agency handing you "the HeyReach key" may hand the WRONG client's workspace (identify it by `get_all_campaigns`/`get_all_lists` content, not by trusting the label — e.g. "LH |" list prefixes = Link Helpers). And a given key may be **read-only**: reads work but any write (`create_empty_list`, `create_campaign`, …) returns **`403 Forbidden`** in the SSE `text` with `isError:true`. To BUILD (not just review) you need a **write-scoped** key. Two more consequences of read-only/limited scope: `get_all_linked_in_accounts` returns **`totalCount:0`** even though senders exist → **get the sender LinkedIn account ID from an existing campaign's `campaignAccountIds[]`** (via `get_campaign`), not that endpoint.
- **Building a campaign needs a list up front.** `create_campaign` requires `linkedInUserListId` + `linkedInAccountIds[]` at creation (creates a DRAFT). The list may be **empty** — create an empty `USER_LIST`, build the draft + `sequenceJson`, load leads later, then `start_campaign`. To repurpose an existing campaign's structure, `create_campaign_from_template` clones sequence+schedule (can't edit copy — use `create_campaign` with custom `sequenceJson`, or `update_campaign_sequence` after). Sequence delay rule: `actionDelay>=3 HOUR` (or use DAY) on EVERY node following a CONNECTION_REQUEST/MESSAGE/VIEW_PROFILE incl. END nodes, or the API rejects `invalid delay: 00:00:00`.
- **`create_empty_list` returns a PLAIN STRING, not JSON** — don't `ConvertFrom-Json` the `.text` for that tool (only the read tools return doubly-encoded JSON). (`create_empty_list`/`create_campaign` DO return small JSON objects — `{id,...}` / `{campaignId}` — it's only some tools that return prose; wrap the parse in try/catch.)
- **Load-then-build pattern (verified 2026-07-17, TMZ 839-lead build):** `add_leads_to_list_v2 {listId, leads[≤100]}` (returns `{addedLeadsCount,updatedLeadsCount,failedLeadsCount}`) into the list, THEN `create_campaign` pointing `linkedInUserListId` at it. **A DRAFT campaign shows `progressStats.totalUsers:0` even when its list is full** — leads only pull into the campaign on start; verify via `get_leads_from_list` count, not the campaign. Multiple `linkedInAccountIds` on one campaign auto-distribute the leads across senders (no per-lead assignment needed). HeyReach may silently drop ~1 lead/batch on internal identity dedupe (839 loaded from 840) — reconcile via the list count, don't chase it. Personalization = native `{FIRST_NAME}` + custom vars loaded in `customUserFields` (names alphanumeric/underscore), referenced single-brace `{app}` etc.; set a **token-free `fallbackMessage`** on every MESSAGE node for missing-field safety.

### 2c. LinkedIn discriminator — acceptance variance settles list-vs-note-vs-infra
When account-wide acceptance is low, **pull it per-campaign before blaming the profile.** If accept% swings widely across campaigns on the SAME sender/infra (e.g. 4% vs 44%), it's **list/ICP or the connection note**, never systemic profile health. Then read the notes via `get_campaign_sequence`:
- **Broken merge syntax is the #1 silent acceptance killer.** HeyReach renders **single-brace UPPERCASE** (`{FIRST_NAME}`, `{COMPANY}`, `{MY_FIRST_NAME}`). A note pasted from Smartlead/Instantly with **`{{first_name}}` (double-brace lowercase) does NOT render** — the prospect sees the literal token and doesn't accept → craters accept to ~4-6% vs ~20-44% on correctly-tagged twins. Check this FIRST on any low-accept campaign. Fix = find-replace the tags.
- Note *frame* also moves accept a lot: a **peer/social-proof note** ("we work with several PE/VC-backed portfolios, and your perspective at {COMPANY} would be valuable") beat a **pitch-y note** ("your work on {COMPANY}'s AI infra is interesting") 44% vs 20% on the same account.
- **`autoTaggedInterested` over-counts.** It tags polite soft-accepts ("happy to connect") and even job-seekers ("keen to discuss my next role") as interested. Always read the threads to separate genuine buying intent (asks for demo/pricing, proposes a time) from politeness before reporting a positive count.
- **Sender-profile IDENTITY is a hidden variable — ask who the sending profile is before trusting accept/interested rates.** A recruiter/networking profile inflates acceptance (people readily accept recruiters) AND poisons the reply signal (accepts + "happy to connect" replies come from job-seekers/networkers, not buyers) — the auto-interested tag becomes almost meaningless. Match the sender profile to the offer. When the profile identity changes mid-account, **re-baseline** — new accepts aren't comparable to the old ones (operator profiles get accepted LESS than recruiters, but reply quality rises). [AI Reserve 2026-07-07: a recruiter profile produced 8.4% "interested" of which ~1 was real product-interest.]

## Inbox placement test

A real placement test sends to seed inboxes across providers and reports inbox/promotions/spam. This is the ground truth that warmup score and open-tracking cannot give you.

**GATING (opt-in, outward-facing):** the scriptable test (Option B) needs an **EmailGuard API key** — block on it, don't improvise. It also *sends seed emails through the client's real inboxes*, so even when pre-authorized, give the user a one-line heads-up before it sends. Use a placement test as the tiebreaker whenever copy can't be ruled out (template-heavy account) or auto-reply share is ambiguous.

**Option A — Instantly native "Inbox Placement" (UI only).** Instantly has its own placement feature: Gmail/Outlook/Yahoo placement, SPF/DKIM/DMARC, 94 blacklists, automated recurring tests, and auto-pause-when-placement-below-X% rules. It is a **separate paid subscription**. **NOT exposed in the v2 public API** — verified: all `inbox-placement* / deliverability* / spam-test* / blacklist*` endpoints return 404 while auth works. So it can be run manually in the dashboard but cannot be scripted by this skill. (It is Instantly's own product, NOT EmailGuard-powered.)

**Option B — EmailGuard (has a public API → scriptable).** Base `https://api.emailguard.io/api/v1/`, `Authorization: Bearer <KEY>`.
1. `POST /inbox-placement-tests` → returns `uuid`, `filter_phrase`, and `inbox_placement_test_emails[]` (seed addresses per provider).
2. **Send through the real Instantly inboxes** (mandatory — that's what's being measured): add the seed addresses as a lead list to a small dedicated test campaign whose body contains the `filter_phrase`, and let it send.
3. `GET /inbox-placement-tests/{uuid}` → folder placement per provider, score, SPF/DKIM/DMARC + blacklist checks.
(GlockApps has a similar API as an alternative.)

**Either tool: run one test per domain group** (e.g. `.info` batch vs `.com` batch) so results map onto a kill/keep list. A blended test only re-confirms "in spam."

## Decision tree

- Auto-reply ≈50% / genuine-positive <0.05% / consistent across campaigns → **DELIVERABILITY.** Fix infra before anything else.
- Good inbox placement (per a placement test) but low replies → **COPY/OFFER.** Benchmark against winning copy; check clarity (do replies say "what do you actually do?").
- High bounce (>3–5%) → **LIST QUALITY.** Verify/clean lists.
- Replies but all "wrong person" → **TARGETING.** Fix ICP / seniority / department.
- Delivers + gets human replies, but on-persona title share <~40%, off-size-band, or a B2B-distributor mix → **TARGETING (list rebuild).** Grade the list against the GTM (Execution-vs-strategy audit); rebuild via the sourcing section — don't touch copy.
- Live copy carries claims not in the approved GTM (fabricated stats, missing credibility stack) → **COPY-DRIFT.** Revert to the approved copy before judging the angle.

**When the verdict is COPY/OFFER, the rebuild method is a separate document:** `<agency-root>/copy-rebuild-playbook.md` (on the original author's machine `C:\Users\victo\db2b\copy-rebuild-playbook.md`) — the 9-step loop (claimed-vs-real results, diagnose against the client's OWN framework, loser-vs-winner isolation, offer anatomy, truth-test every claim, plain-English job, concrete reward, benefit-of-the-benefit, easy-yes CTA). Diagnosis (this skill) and rebuild (that playbook) are separate jobs — most of the value is refusing to touch copy until the constraint is named. `campaign-review-methodology.md` at the same root is the plain-language method summary for humans.

## Deliverability fix list (priority order)

1. Run a placement test per domain group → hard data (Instantly native Inbox Placement in the UI, or EmailGuard/GlockApps via API).
2. Retire `.info`/`.biz`/misspelled-lookalike domains; rebuild on clean `.com` domains, 3–4 inboxes each.
3. Kill any domain with >10 inboxes on it.
4. Verify SPF / DKIM / DMARC per domain (mail-tester.com).
5. Turn on slow-ramp, lower per-inbox daily volume, reduce per-lead touch frequency / cross-campaign overlap.
6. Reduce reliance on Microsoft inboxes for Microsoft recipients.
7. THEN optimize copy: build an objection-handling follow-up + one-page sales doc from real reply content (pricing tiers, competitor comparison, integrations, compliance, demo video).

## When the constraint is targeting — how to rebuild the list

Diagnosing "fix the ICP" isn't enough; say *where and how*. Core principle: **separate sourcing (the company list) from enrichment (the right person).** A single tool doing both — e.g. Apollo picking the company AND the contact — is the usual root cause: it can't confirm the business model and hands you whatever contact exists (often a sales rep at a B2B firm).

1. **Sourcing layer — build the company list against the ICP's defining attribute,** using a database native to that attribute, not a generic B2B DB:
   - **Shopify / ecommerce brands → Store Leads (storeleads.app)** — filter by platform, product category, estimated sales/traffic (revenue proxy), employee count, country. Built from real storefronts, so it inherently confirms consumer-facing brands (solves the brand-vs-distributor problem a generic DB can't).
   - **Tech-stack confirmation / migration targets → BuiltWith** (e.g. on Wix/Squarespace/WooCommerce = a rebuild opening).
   - **Intent overlays** — hiring (LinkedIn Jobs / Indeed), running ads (Google Ad Transparency Center, SpyFu), recent funding (Crunchbase).
2. **Enrichment layer — find the RIGHT person.** Run Apollo / LinkedIn Sales Nav *filtered to the GTM persona titles* (Founder / Head of Ecom / Marketing) **against the sourced domain list** — not as the company finder.
3. **Orchestrate + filter in Clay** — import the company list, waterfall-enrich the persona contact, verify emails (DeBounce / BounceBan), and add the **business-model classifier** that's usually missing (e.g. GPT on the homepage: "consumer-facing brand or B2B distributor?").
4. **Let the size filter do work** — the ICP size/revenue band alone strips out most wrong-business-model companies.
5. **Follow the account's own evidence** — if one source/segment already outperforms (small-store, "with-titles", non-Apollo), that's the sourcing direction; systematize it (see Source-provenance check).

## Output format

Lead with the **verdict** (one line: what's broken). Then:
- Portfolio totals table (sent / replies / auto-share / opportunities).
- Per-campaign table (worst reply rates first).
- Reply pool categorized (table) with verbatim quotes from the wins.
- Infra findings (TLD split, inboxes/domain, ESP, smoking-gun prospect quotes like "your email went to spam").
- Prioritized fix list.
- Offer concrete next steps (placement test, domain kill list, objection one-pager) with a recommendation, not a menu.
- **Log lessons before you finish (mandatory).** See "Self-improvement protocol" below — a review that doesn't write its lessons down is a review you'll have to redo from scratch next time.

## Self-improvement protocol (mandatory — run at the END of every review)

This skill only gets smarter if each review writes back what it learned. There is no automatic learning loop — **if you don't record the lesson, it evaporates.** So before you close out any review, look back over what you did *this session* and do a two-part write-back. Skipping this is the single biggest way the skill decays.

**Step 1 — Review the session for lessons.** Scan what actually happened this review and pull out anything reusable that isn't already written down:
- A new API call / endpoint / field / gotcha that worked (or a documented one that *didn't*).
- A diagnostic discriminator that settled a call (e.g. "same copy, only the list changed → it's the list").
- A mistake you made and corrected (record the correction so it isn't repeated).
- A **user directive** about how to run reviews (e.g. "don't criticize the domains — judge deliverability by real signals only"). These are binding; capture them verbatim.

**Step 2 — Write each lesson to the right home:**
- **METHOD / diagnostic / API / user-directive lessons → back into this `SKILL.md`** (the relevant section: API calls, Grading rubric, Honesty notes, or here). Keep it tight — small edits, not prose dumps. **Promotion gate:** API/mechanics FACTS (endpoints, fields, gotchas) can go in at n=1 — they're data. METHOD or threshold changes (rubric numbers, decision-tree rows, new mandatory steps) must recur across ≥2 accounts OR get the operator's sign-off first; until then they live in the ledger flagged `[unconfirmed]`. One review must not rewrite the method.
- **VERTICAL / campaign-pattern data → append to `vertical-patterns.md`** (the cross-vertical ledger, next to this file). One row/stanza per (motion × vertical) observed, with the benchmark numbers and the reply-type signature. This is how the skill accumulates "what works where."
- **Client-specific state → the client's `STATE.md`** in the client's folder under the agency root (`C:\Users\victo\db2b\<client>\STATE.md` on the original author's machine; on any machine it's the SAME root you confirmed at Inputs step 0): campaign IDs/status, verdicts, open blockers, client directives, next actions. Update it at the end of every review — it is the portable replacement for personal memory and what the next reviewer reads first (Inputs step 0). The skill holds *generalizable* patterns; STATE.md holds *this client's* current state.

**Step 3 — Note what's still unproven.** If a lesson is a hypothesis (one campaign, small n), log it in the ledger flagged `[unconfirmed, n=X]` so the next review knows to validate rather than trust it.

### The cross-vertical knowledge ledger (`vertical-patterns.md`)

An append-only record of **what works by campaign motion and vertical** — so the next review starts from accumulated evidence, not a blank page. Two motions to classify every campaign into first:
- **Buyer-acquisition** — the prospect is being sold something to *buy* (the default: SaaS, services, sponsorship, ads). Almost every campaign.
- **Seller-sourcing** — the prospect is being asked to *sell/exit/list* (M&A/acquisition offers, "we buy X", recruiting-as-supply). Behaves differently: timing-gated, only active sellers bite → lead with a low-commitment value asset (valuation/benchmark) + long nurture, never a "let's talk acquisition" CTA.

Within each motion, the ledger tracks per vertical: offer type, winning subject pattern, winning CTA, **reply-type signature** (the tell for buyer sophistication), sequence shape that works, and benchmark reply/positive rates. Read it BEFORE a review to set priors; append to it AFTER. When priors and this account's data disagree, the account's own data wins (and you update the ledger).

## Honesty notes

- Don't oversell a per-account API "health" number — Instantly's per-inbox score is the same vanity warmup metric. Real placement comes from EmailGuard or reply/auto-reply ratios.
- `total_opportunities` (analytics) may not equal `FILTER_LEAD_INTERESTED` count — opportunities can include meeting-booked and manual tags across more scope. State the discrepancy; don't force a match.
- Opportunities/interested are MANUALLY tagged → a reliable floor on genuine positives, never inflated, possibly undercounted if the team tags sloppily.
- **Don't call "wrong vertical / wrong business type" without grading against the client's GTM first.** The verticals may be intentional (the client may have direct case-study proof there). Generic best practice is NOT the rubric for what the client *meant* to target — the GTM/ICP doc is. Get it before asserting a targeting verdict; the same discipline as not retracting or asserting work without re-reading the source of truth. When a "wrong target" diagnosis can't be grounded in the GTM, the real finding is usually that **execution drifted from the GTM** (off-persona, off-band, B2B-distributor mix, or copy-drift) — name that, not "wrong vertical."
