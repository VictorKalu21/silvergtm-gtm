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
| **MillionVerifier** | `verify-millionverifier-bounceban.mjs` | Cheaper per credit, faster, good default for most lists |

Stage 2 is always **BounceBan** — it SMTP-probes the catch-alls and recovers ~60–70% as sendable.

## Keys (one file, auto-loaded by scripts)

`C:/Users/victo/Silver GTM Systems/ENVs-Secrets/email-verification.env`:
```
DEBOUNCE_KEY=...
MILLIONVERIFIER_KEY=...
BOUNCEBAN_KEY=...
```

## How to run

```
# DeBounce + BounceBan
IN="C:/path/to/list.csv" OUT_DIR="verify" node skills/email-verify-debounce-bounceban/scripts/verify-debounce-bounceban.js

# MillionVerifier + BounceBan
IN="C:/path/to/list.csv" OUT_DIR="verify" node skills/email-verify-debounce-bounceban/scripts/verify-millionverifier-bounceban.mjs
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
