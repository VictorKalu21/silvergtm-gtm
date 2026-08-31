# 02 · Email Verification — DeBounce + BounceBan

**Outcome:** a clean, split deliverability-gated email list: sendable / risky / dropped. Ready to upload to Smartlead, Instantly, or any cold-email sending tool.

**Why two stages:** DeBounce classifies most emails instantly but flags corporate catch-all domains as uncertain (accept-all). BounceBan does a live SMTP probe on the catch-alls and recovers ~60–70% of them as deliverable. Without stage 2, you lose that slice and over-drop.

**When to run:** before uploading any contact list to a cold-email campaign. Non-negotiable gate — skip it and your bounce rate will tank domain health.

---

## Inputs

- A CSV with at least one column named `Email` (exact header match, case-sensitive). Any other columns are passed through unchanged.
- DeBounce API key → `DEBOUNCE_KEY` in the skill `.env`.
- BounceBan API key → `BOUNCEBAN_KEY` in the skill `.env`.

## Script

`scripts/verify-debounce-bounceban.js`

Keys are loaded automatically from `~/.claude/skills/email-verify-debounce-bounceban/.env` — no arg-passing needed.

## Pipeline

```
raw CSV → dedupe emails → DeBounce all (6 concurrent workers)
  good       → sendable pool
  invalid    → dropped pool
  catch-all  → BounceBan (4 concurrent workers)
                deliverable → sendable pool (recovered)
                other       → risky pool
→ write sendable / dropped / risky / full CSVs
```

### Step 1 — DeBounce all emails

```
IN="C:/path/to/list.csv" OUT_DIR="verify" node scripts/verify-debounce-bounceban.js
```

Results checkpoint to `OUT_DIR/debounce.jsonl` — append-only, so interrupts resume cleanly.

Classification:
- DeBounce result contains "Safe to Send" → `good`
- Contains "Invalid", "Disposable", "Spamtrap", "Syntax" → `drop`
- Anything else (Accept-All, Risky, Unknown) → `catchall` (stage 2)

### Step 2 — BounceBan catch-alls

Runs automatically after stage 1 in the same script. Results checkpoint to `OUT_DIR/bounceban.jsonl`.

- BounceBan `result === "deliverable"` → recovered as sendable
- Anything else → risky

### Step 3 — Merge and split

The script writes four files to `OUT_DIR`:

| File | Who goes here |
|------|--------------|
| `<stem>_sendable.csv` | DeBounce-good + BounceBan-recovered |
| `<stem>_dropped.csv` | Invalid / disposable / no-email |
| `<stem>_risky.csv` | Catch-alls BounceBan couldn't confirm |
| `<stem>_full.csv` | All rows with `verify_verdict` + `verify_detail` added |

`<stem>` = input filename without extension.

## Credit consumption

| Stage | Credits used |
|-------|-------------|
| DeBounce | 1 per unique email |
| BounceBan | 1 per catch-all (typically 30–40% of list) |

Check BounceBan balance before large runs (`~10k credits/500 emails` at typical catch-all rates).

## Gotchas

- The `Email` column header is case-sensitive — must be exactly `Email`.
- Duplicate emails in the CSV are verified once; all rows for that email get the same verdict.
- BounceBan has a 90-second per-request timeout — do not kill mid-run. Use the resumable checkpoints instead.
- Risky = not necessarily bad. For high-value accounts (e.g. VC-funded AI cos) you may choose to send to risky too, with a tighter sequence.

## Worked example — AI Reserve Portfolio (2026-08-30)

| Stage | Count |
|-------|-------|
| Input | 709 contacts |
| Unique emails | 709 |
| DeBounce: good | 457 |
| DeBounce: catch-all | 252 |
| DeBounce: dropped | 0 |
| BounceBan: recovered | 137 |
| **SENDABLE** | **594** |
| Risky | 15 |
| Dropped | 100 |
| BounceBan credits used | ~230 |
| BounceBan credits remaining | ~10,470 |
