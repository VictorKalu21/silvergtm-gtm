---
name: email-verify-debounce-bounceban
description: Two-stage email deliverability gate before cold outreach. Stage 1 = either DeBounce or MillionVerifier (user picks); Stage 2 = BounceBan on catch-alls/unknowns. Use whenever a contact list needs to be cleaned before uploading to Smartlead, Instantly, or any cold-email tool.
---

# Email Verification — Two-Stage Gate

## When to use

Before uploading any contact list to a cold-email campaign. Non-negotiable gate — skip it
and your bounce rate will tank domain health.

**Why two stages:** the Stage-1 verifier classifies most emails instantly but flags corporate
catch-all domains as uncertain (accept-all). BounceBan does a live SMTP probe on those and
recovers ~60–70% of them as deliverable. Without Stage 2 you lose that slice and over-drop.

## Pick your Stage 1 verifier

| Verifier | Script | When to pick |
|---|---|---|
| **MillionVerifier** | `scripts/verify-millionverifier-bounceban.js` | Cheaper per credit, faster, simpler result schema. **Good default for most lists.** |
| **DeBounce** | `scripts/verify-debounce-bounceban.js` | Marginally better catch-all detection on some enterprise domain ranges. Use for high-stakes lists where you want every edge. |

Both feed the **same** BounceBan Stage 2 — the catch-all recovery logic is identical either way.

## Inputs

- A CSV with a column named `Email` — **exact header, case-sensitive**. All other columns are
  passed through unchanged.
- API keys in `~/Silver GTM Systems/ENVs-Secrets/email-verification.env`, loaded automatically
  by both scripts (they resolve `USERPROFILE` or `HOME`, so the same path works on Windows and
  Linux — no arg-passing):
  ```
  DEBOUNCE_KEY=...          # only if using DeBounce
  MILLIONVERIFIER_KEY=...   # only if using MillionVerifier
  BOUNCEBAN_KEY=...         # always (Stage 2)
  ```

## Pipeline

```
raw CSV → dedupe emails → Stage 1 (DeBounce 6 / MillionVerifier 8 concurrent workers)
  good / ok           → sendable pool
  invalid/disposable  → dropped pool
  catch-all / unknown → BounceBan (4 concurrent workers)
                          deliverable → sendable pool (recovered)
                          other       → risky pool
→ write sendable / dropped / risky / full CSVs
```

## How to run

Both stages run in one command; Stage 2 fires automatically after Stage 1.

```bash
# MillionVerifier + BounceBan (default)
IN="/path/to/list.csv" OUT_DIR="verify" node scripts/verify-millionverifier-bounceban.js

# — or — DeBounce + BounceBan
IN="/path/to/list.csv" OUT_DIR="verify" node scripts/verify-debounce-bounceban.js
```

## Classification

*MillionVerifier result codes:*

| Result | Action |
|---|---|
| `ok` | sendable |
| `catch_all` / `unknown` | → BounceBan |
| `invalid` / `disposable` / `spamtrap` | dropped |

*DeBounce result strings:*

| Result contains | Action |
|---|---|
| "Safe to Send" | sendable |
| "Invalid" / "Disposable" / "Spamtrap" / "Syntax" | dropped |
| anything else (Accept-All / Risky / Unknown) | → BounceBan |

*BounceBan (Stage 2):* `result === "deliverable"` → recovered as sendable; anything else → risky.

## Outputs (written to `OUT_DIR`, `<stem>` = input filename without extension)

| File | Who goes here |
|---|---|
| `<stem>_sendable.csv` | Stage-1 good/ok + BounceBan-recovered — **upload this** |
| `<stem>_risky.csv` | Catch-alls BounceBan couldn't confirm |
| `<stem>_dropped.csv` | Invalid / disposable / spamtrap / no-email |
| `<stem>_full.csv` | All rows with `verify_verdict` + `verify_detail` added |
| `mv.jsonl` or `debounce.jsonl` | Stage-1 checkpoint (resumable) |
| `bounceban.jsonl` | Stage-2 checkpoint (resumable) |

## Credit consumption

| Stage | Credits |
|---|---|
| Stage 1 (either verifier) | 1 per unique email |
| BounceBan | 1 per catch-all/unknown (typically 30–40% of the list) |

Check balances before a large run: MillionVerifier `app.millionverifier.com`,
BounceBan `app.bounceban.com`.

## Resumability

Both checkpoints are append-only JSONL. If interrupted (laptop sleep, crash, kill), re-run the
same command — already-verified emails are skipped automatically.

## Gotchas

- The `Email` column header is case-sensitive. Must be exactly `Email`.
- Duplicate emails are verified once; every row for that email gets the same verdict.
- BounceBan has a 90-second per-request timeout — **do not kill mid-run**. Use the resumable
  checkpoints instead.
- Risky ≠ necessarily bad. For high-value accounts (e.g. VC-funded AI companies) you may choose
  to send to risky too, with a tighter sequence.
- MillionVerifier also returns `free` (Gmail/Yahoo) and `role` (info@/support@) flags — logged
  in `mv.jsonl` but **not** applied to the verdict. For B2B-only sending, add a post-filter to
  suppress `role`/`free` if you want them gone.

## Typical results

~35–40% catch-all rate · BounceBan recovers ~60–70% of those · net sendable ~80–85% of raw list.

A worked example with real numbers is in
[`processes/02-email-verification.md`](../../processes/02-email-verification.md).

## After verification

Upload `_sendable.csv` to Smartlead/Instantly. Do NOT upload `_risky.csv` unless the list is
high-value and you have no alternative.
