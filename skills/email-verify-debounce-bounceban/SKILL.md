---
name: email-verify-debounce-bounceban
description: Two-stage email deliverability gate before cold outreach. Stage 1 = either DeBounce or MillionVerifier (user picks); Stage 2 = BounceBan on catch-alls/unknowns. Use whenever a contact list needs to be cleaned before uploading to Smartlead, Instantly, or any cold-email tool.
---

# Email Verification — Two-Stage Gate

## When to use
Before uploading any contact list to a cold-email campaign. Non-negotiable gate.

## Pick your Stage 1 verifier

| Verifier | Script | When to pick |
|----------|--------|--------------|
| **DeBounce** | `verify-debounce-bounceban.js` | Better catch-all detection on enterprise domains |
| **MillionVerifier** | `verify-millionverifier-bounceban.js` | Cheaper per credit, faster, good default for most lists |

Stage 2 is always **BounceBan** — it SMTP-probes the catch-alls and recovers ~60–70% as sendable.

## The runner lives in this skill folder

`scripts/verify-millionverifier-bounceban.js` (added 2026-09-12; resumable; `--dry-run` classifies from the
checkpoints without spending; test in `tests/verify-dry-run.test.js`). The older copies under
`C:/Users/victo/gtm-processes/scripts/` are the same interface. Run from any machine:

```
IN=<list.csv> OUT_DIR=<dir> node skills/email-verify-debounce-bounceban/scripts/verify-millionverifier-bounceban.js [--concurrency 4]
```

**API facts (verified 2026-09-12, one probe each):** MillionVerifier `GET https://api.millionverifier.com/api/v3/?api=KEY&email=&timeout=20`
→ `result` ∈ `ok | catch_all | unknown | disposable | invalid | error`, plus `role`, `free`, `subresult`; credits at
`/api/v3/credits?api=KEY` (free). BounceBan `GET https://api.bounceban.com/v1/verify/single?email=` with header
`Authorization: KEY` (no `Bearer`) is **synchronous**: `result` ∈ `deliverable | undeliverable | risky | unknown`,
`is_accept_all`, `is_role`, `credits_consumed`, `credits_remaining`; account at `/v1/account`. Rate limit 100/s on
single verify.

## Keys (one file, auto-loaded by scripts)

`C:/Users/victo/Silver GTM Systems/ENVs-Secrets/email-verification.env` on Windows, `$HOME/Silver GTM Systems/ENVs-Secrets/email-verification.env`
elsewhere, or `EMAIL_VERIFY_ENV=<path>`; the two keys may also be plain env vars:
```
DEBOUNCE_KEY=...
MILLIONVERIFIER_KEY=...
BOUNCEBAN_KEY=...
```

## How to run

```
# DeBounce + BounceBan
IN="C:/path/to/list.csv" OUT_DIR="verify" node C:/Users/victo/gtm-processes/scripts/verify-debounce-bounceban.js

# MillionVerifier + BounceBan
IN="C:/path/to/list.csv" OUT_DIR="verify" node C:/Users/victo/gtm-processes/scripts/verify-millionverifier-bounceban.js
```

The CSV must have an `Email` column (exact, case-sensitive). All other columns are passed through unchanged.

## Outputs (written to OUT_DIR)

| File | Contents |
|------|----------|
| `<stem>_sendable.csv` | Safe to send — upload this to campaign tool |
| `<stem>_risky.csv` | Catch-alls BounceBan couldn't recover |
| `<stem>_dropped.csv` | Invalid / disposable / spam-trap |
| `<stem>_full.csv` | All rows with `verify_verdict` + `verify_detail` columns |
| `debounce.jsonl` or `mv.jsonl` | Stage-1 checkpoint (resumable) |
| `bounceban.jsonl` | Stage-2 checkpoint (resumable) |

## Classification logic

```
Stage 1 → "safe/ok"                → sendable
Stage 1 → "invalid/disposable/spam" → dropped
Stage 1 → "catch-all/unknown"       → BounceBan
  BounceBan → "deliverable"         → sendable (recovered)
  BounceBan → anything else         → risky
```

## Resumability
Both checkpoints are append-only JSONL files. If interrupted (laptop sleep, crash), re-run the same command — already-verified emails are skipped automatically.

## Typical results
- ~35–40% catch-all rate
- BounceBan recovers ~60–70% of catch-alls
- Net sendable: ~80–85% of raw list

## After verification
Upload `_sendable.csv` to Smartlead/Instantly. Do NOT upload `_risky.csv` unless the list is high-value and you have no alternative.
