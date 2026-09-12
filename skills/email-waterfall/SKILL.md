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
