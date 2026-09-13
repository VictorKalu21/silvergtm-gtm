---
name: email-waterfall
description: Find a work email for a NAMED contact (owner / decision-maker) at a known company domain by cascading cheap-first through finder APIs (QuickEnrich → AI Ark → TryKitt), verifying each candidate before moving on (MillionVerifier, optionally BounceBan on catch-alls), so every lead ends with a sendable address or a counted reason. Use after owner-finding (google-maps-scrape STEP 6) or any time you have people + domains and need emails without Clay; never for domain-less names (that is name-to-domain first) and never as a substitute for the verification gate (email-verify-debounce-bounceban runs on everything this finds).
---

# Email waterfall (find, then verify, cheapest rung first)

Input: a CSV with `full_name, first_name, last_name, root_domain` (+ `business_name, city, state, place_id` for
entity checks; every other column passes through). Output: one row per contact with the rung that won, the
email, verifier results, verdict, phone if a rung returned one; and `report.json` with per-rung attempted /
found / sendable / credits / cost per sendable.

## The rungs (verified 2026-09-12 with one-contact probes; shapes recorded in `scripts/waterfall.js`)

| rung | call | charged when | notes |
|---|---|---|---|
| quickenrich | `GET https://app.quickenrich.io/api/employees/search?first_name&last_name&company_url` · `Authorization: Bearer` | 1 credit per RESULT; a miss is free (`meta.reason: EMPLOYEE_NOT_FOUND`) | `meta.remaining_credits` in every response; returns `email`, `email_verification_date`, `employee_phone` |
| aiark | `POST …/v1/people` (name SMART + `account.domain`, `size:1`) → `trackId` → `POST …/v1/people/email-finder {trackId}` → poll `GET …/email-finder/{trackId}/inquiries` until `state: DONE` · `X-TOKEN` | 0.5 per returned PERSON (0 on miss) + 1 per VALID email (0 on none) | never page or raise `size`: every returned person costs 0.5. trackId is single-use, 6 h. Second search by `account.name` only with an entity check. Credits: `GET …/v1/payments/credits` (free) |
| trykitt | `POST https://api.trykitt.ai/job/find_email {fullName, domainOrWebsite, fastMode}` → `GET /job?id=` · `x-api-key` | per its plan; `GET /credit` is free | trial key showed `{"credits":0}`: rung is skipped with reason `no_credits` until funded |

**Waterfall rule:** a candidate that verifies `ok` wins and the cascade stops. `invalid`/`disposable` falls through to
the next rung. `catch_all`/`unknown` is kept as `risky` and the cascade STOPS (the domain, not the finder, is the
problem; BounceBan is the only thing that resolves it). One lookup per person per root domain, ever; every rung
checkpoints to its own JSONL so reruns are free.

## Run

```
IN=<contacts.csv> OUT_DIR=<dir> node skills/email-waterfall/scripts/waterfall.js \
  [--rungs quickenrich,aiark,trykitt] [--verify mv|mv,bb] [--limit N] [--concurrency 3] [--dry-run]
```
Keys: the same env file as email-verify (`$HOME/Silver GTM Systems/ENVs-Secrets/email-verification.env`):
`QUICKENRICH_KEY`, `AIARK_KEY`, `TRYKITT_KEY`, `MILLIONVERIFIER_KEY`, `BOUNCEBAN_KEY`. `--dry-run` classifies from
checkpoints only. Test: `node tests/waterfall-dry-run.test.js`.

## Guardrails
- Probe each vendor on ONE contact and read the raw response before a batch; two small contractors returned
  `EMPLOYEE_NOT_FOUND` / `totalElements: 0` on the first probes — these databases skew to LinkedIn-present people.
- Never re-query a vendor for a person already in its checkpoint. Never raise AI Ark `size` above 1.
- Report cost per SENDABLE email per rung, not per lookup; that number decides the rung order for the next vertical.

## Facts from the first 100-contact test (Atlas Growth, 2026-09-12)
- **QuickEnrich** returns a full record and `credits_used: 0` when the email field is `"N/A"` (8 of 29 records on the
  first run). Treat only a real address as `found`; a record without one is `record_no_email` and costs nothing.
  21 real emails from 100 owner-level contacts; 12 sendable after MillionVerifier, 7 catch-all (risky without
  BounceBan), 2 invalid. Credits: 1 per real email. `meta.remaining_credits` is the only balance readout.
- **AI Ark** rate limit (5/s, 300/min) is returned as `{"message":"API rate limit exceeded"}` with HTTP 200 and no
  `content`; read as a miss it silently zeroes the rung (81 of 81 on the first run). The runner now paces calls at
  ≤2.5/s, retries with backoff, records `error` instead of `miss`, and retries `error` rows on rerun.
- **TryKitt** `POST /job/find_email` answers `400 "must set callbackURL parameter"` even with `fastMode`, but a
  placeholder URL is accepted (`{"job_id":"…"}`) and the job is readable by polling `GET /job?id=` → `[{status:
  "pending-queued"|…, results:{email}}]`, so no public webhook is needed (`TRYKITT_CALLBACK_URL` env overrides the
  placeholder). The trial key reports `{"credits":0}` yet the job still completed (`bot_type: "freemium"`,
  `status: "completed"`, `outcome: "no-results-found"`), so a zero balance is NOT a reason to skip the rung; the
  runner no longer gates on it.
- **AI Ark trial quota:** after ~160 searches in one run, every call (including the free credits endpoint) returned
  `429 {"message":"API rate limit exceeded"}` for many minutes, not just the documented 5/s and 300/min windows.
  Treat a trial key as a small daily/hourly allowance: probe with 3 searches, then batch in groups of ≤50 spaced an
  hour apart, and never let a 429 be recorded as a miss.
- **TryKitt free tier, measured:** 81 jobs submitted at zero balance; 58 completed, **0 found** (`outcome:
  "no-results-found"` on every one, `results.domain` comes back null even though `domainOrWebsite` was sent), 16
  refused at submission with `418 "The free tier API is busy right now"`, 7 still queued after 2 min of polling.
  Conclusion: the freemium bot is not a usable rung; TryKitt only counts once the account is funded (paid bot).
- **First-run totals (QuickEnrich + TryKitt free, MillionVerifier only, 100 owner-level contacts):** 12 sendable,
  7 risky (catch-all), 81 none. **Names read off the company's own site enriched 3× better than names found by
  web search** (9 sendable of 50 vs 3 of 50): a searched name is more often a sole proprietor with no company
  mailbox in any database. AI Ark still untested (trial quota); retry scheduled.

## Registry rung (free, state-specific) — check BEFORE any vendor
Some state contractor licence boards publish the licensee's email: **Louisiana** (record + roster CSV, with
qualifying party) and **Arkansas** (nightly CSV, 98% filled, with officers). Mississippi and Alabama do not.
Full grammar in `icp-source-planner/library/state-contractor-licence-boards--home-services-emails.md`. Join by
normalised company name + city, then verify. For an LA/AR-heavy list this rung goes first; it costs nothing.
- **BounceBan on + pattern rung, same 100 owners (2026-09-12):** 33 sendable (QuickEnrich 18 incl. BounceBan-recovered
  catch-alls, pattern 15), 1 risky, 66 none. Cost: 337 MillionVerifier + 31 BounceBan credits on top of the 21
  QuickEnrich. **The pattern rung alone found 15 of 81, more than QuickEnrich found in raw terms once BounceBan
  resolves the catch-all domains, for ~4 MV credits per owner.** Order for this vertical: registry (LA/AR) → on-site
  → QuickEnrich → pattern → AI Ark, with BounceBan always on.
- Company mailboxes on the same list: 69 of 82 sendable (MV 82 + BB 35). Registry (LA + AR, 22 in-state leads):
  11 strict matches, 9 sendable. A loose token join first produced 6 wrong companies out of 14; the join must
  require the whole normalised name or ≥2 distinctive tokens plus city.
- **AI Ark, second attempt after the quota reset (2026-09-12 21:57Z):** 36 contacts, every people-search returned
  `400 {"error":"request not readable"}` from the runner's JSON body (the same shape worked from curl earlier in the
  day) and the key hit 429 again after ~40 requests, so the trial allowance is roughly one 40-request batch per hour.
  Net measured contribution: 0 found, 1 credit spent, 99 left. **Rung parked**: not runnable at test scale on a trial
  key, and the 400 needs a side-by-side diff of the runner body against a working curl before any paid key is tried.

## `pattern_seeded` rung (operator rule 2026-09-13: no blind guessing)
Blind pattern guessing had quality problems in the operator's past runs. The seeded rung only fires where the SAME
domain already has a verified sendable address with a known person (this run's QuickEnrich hits, on-site personal
addresses, licence-board addresses with a qualifying party, or `--seeds email,first_name,last_name[,domain]`): it
reads the pattern off that address (`first`, `first.last`, `flast`, …) and applies it to the company's other named
people, then verifies. No seed → nothing. Use `--rungs quickenrich,pattern_seeded`; keep the blind `pattern` rung
for explicit probes only.
