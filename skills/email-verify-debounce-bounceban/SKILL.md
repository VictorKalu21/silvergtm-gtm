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

Stage 2 is always **BounceBan** — it SMTP-probes what Stage 1 could not settle and recovers it as sendable.
**Operator directive 2026-09-17: BounceBan gets MV `invalid` and `error` too, not just catch-all/unknown.**
Measured on the Atlas Growth UK run: 3 of the first 4 MV-`invalid` addresses sent to BounceBan came back
`deliverable`. A BounceBan `deliverable` on an MV `invalid` overrides the drop (detail
`bb:recovered_from_invalid`); anything else keeps the MV reason and stays dropped, so the override can only
ever add sendable addresses. `disposable` is never sent — it is not recoverable. `ok` needs nothing.

## The runner lives in this skill folder

`scripts/verify-millionverifier-bounceban.js` (added 2026-09-12; resumable; `--dry-run` classifies from the
checkpoints without spending; test in `tests/verify-dry-run.test.js`). The older copies under
`C:/Users/victo/gtm-processes/scripts/` are the same interface. Run from any machine:

```
IN=<list.csv> OUT_DIR=<dir> node skills/email-verify-debounce-bounceban/scripts/verify-millionverifier-bounceban.js [--concurrency 4]
                                                                                    [--bb-on catch_all,unknown,error,invalid] [--dry-run]
```

`--bb-on` lists the MillionVerifier results that are routed to BounceBan; the default is the set above.
**`--bb-on catch_all,unknown,error` is the old behaviour, one flag away** (every `invalid` dropped outright).

**API facts (verified 2026-09-12, one probe each):** MillionVerifier `GET https://api.millionverifier.com/api/v3/?api=KEY&email=&timeout=20`
→ `result` ∈ `ok | catch_all | unknown | disposable | invalid | error`, plus `role`, `free`, `subresult`; credits at
`/api/v3/credits?api=KEY` (free). BounceBan `GET https://api.bounceban.com/v1/verify/single?email=` with header
`Authorization: KEY` (no `Bearer`) answers inline MOST of the time: `result` ∈ `deliverable | undeliverable | risky |
unknown`, `is_accept_all`, `is_role`, `credits_consumed`, `credits_remaining`. About 1 in 8 calls instead returns
`{status:"verifying", id, try_again_at}` and must be polled at `GET /v1/verify/single/status?id=<id>` (same header)
until `result` appears; the runner does this. (The single-address probe said "synchronous"; 25 calls said otherwise.
Probe with more than one address before writing a fact down.) Account at `/v1/account`. Rate limit 100/s.

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

| Stage 1 (MillionVerifier) | Stage 2 | Verdict |
|---|---|---|
| `ok` | — | **sendable** (`mv:ok`) |
| `disposable` | never sent | **dropped** (`mv:disposable`) |
| `catch_all` / `unknown` | BounceBan | `deliverable` → **sendable** (`bb:deliverable(recovered)`) · anything else → **risky** · no answer yet → `unverified` |
| `error`, or an empty/missing result | BounceBan | same as above — an MV error is a question, not a verdict |
| `invalid` | BounceBan (since 2026-09-17) | `deliverable` → **sendable** (`mv:invalid bb:recovered_from_invalid`) · **anything else, including no answer → dropped** with the MV reason |

Stage 2 runs over every address whose Stage-1 result is in `--bb-on` **plus every address Stage 1 failed to
answer at all** — a MillionVerifier call that throws is now checkpointed as `result: "error"` instead of
writing nothing, which is what used to strand such rows as `unverified`, outside BounceBan's reach, on every
retry (20 rows on the Atlas Growth UK run; see `IMPROVEMENTS.md`).

`report.json` also carries `bb_on` (the routing set actually used), `mv_call_failures` and
`recovered_from_invalid` so a run can be read back without re-deriving it.

## Resumability
Both checkpoints are append-only JSONL files. If interrupted (laptop sleep, crash), re-run the same command — already-verified emails are skipped automatically.

## Typical results
- ~35–40% catch-all rate
- BounceBan recovers ~60–70% of catch-alls
- Net sendable: ~80–85% of raw list

## After verification
Upload `_sendable.csv` to Smartlead/Instantly. Do NOT upload `_risky.csv` unless the list is high-value and you have no alternative.
