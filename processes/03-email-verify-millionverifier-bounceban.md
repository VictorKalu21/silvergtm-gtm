# 03 · Email Verification — MillionVerifier + BounceBan

**Outcome:** a clean, split deliverability-gated email list: sendable / risky / dropped. Functionally equivalent to Process 02 but uses MillionVerifier as the first stage instead of DeBounce.

**When to use this vs Process 02:**
- **MillionVerifier** — cheaper per credit, faster (no per-request rate concerns), simpler result schema. Good default for most lists.
- **DeBounce** (Process 02) — marginally better catch-all detection on some enterprise domain ranges. Use for high-stakes lists where you want every edge.
- Both feed the same BounceBan second stage; the catch-all recovery logic is identical.

**When to run:** before uploading any contact list to a cold-email campaign.

---

## Inputs

- A CSV with at least one column named `Email` (exact header match, case-sensitive).
- MillionVerifier API key → `MILLIONVERIFIER_KEY` in the skill `.env`.
- BounceBan API key → `BOUNCEBAN_KEY` in the skill `.env`.

## Script

`scripts/verify-millionverifier-bounceban.js`

Keys are loaded automatically from `~/.claude/skills/email-verify-millionverifier-bounceban/.env`.

## Pipeline

```
raw CSV → dedupe emails → MillionVerifier all (8 concurrent workers)
  ok                 → sendable pool
  invalid/disposable → dropped pool
  catch_all/unknown  → BounceBan (4 concurrent workers)
                         deliverable → sendable pool (recovered)
                         other       → risky pool
→ write sendable / dropped / risky / full CSVs
```

### Step 1 — MillionVerifier all emails

```
IN="C:/path/to/list.csv" OUT_DIR="verify" node scripts/verify-millionverifier-bounceban.js
```

Results checkpoint to `OUT_DIR/mv.jsonl` — append-only, resumable.

MillionVerifier result codes:
| Result | Code | Action |
|--------|------|--------|
| `ok` | 1 | sendable |
| `catch_all` | 2 | → BounceBan |
| `unknown` | 3 | → BounceBan |
| `invalid` | 4 | dropped |
| `disposable` | — | dropped |
| `spamtrap` | — | dropped |

### Step 2 — BounceBan uncertain emails

Runs automatically after stage 1. Checkpoints to `OUT_DIR/bounceban.jsonl`.

- `result === "deliverable"` → recovered as sendable
- Anything else → risky

### Step 3 — Merge and split

| File | Contents |
|------|----------|
| `<stem>_sendable.csv` | MV-ok + BounceBan-recovered |
| `<stem>_dropped.csv` | Invalid / disposable / spamtrap / no-email |
| `<stem>_risky.csv` | Catch-alls/unknowns BounceBan couldn't recover |
| `<stem>_full.csv` | All rows with `verify_verdict` + `verify_detail` added |

## Credit consumption

| Stage | Credits used |
|-------|-------------|
| MillionVerifier | 1 per unique email |
| BounceBan | 1 per catch-all/unknown (typically 30–40% of list) |

Check MV balance at `https://app.millionverifier.com` and BounceBan at `https://app.bounceban.com` before large runs.

## Gotchas

- Same as Process 02: `Email` column header is case-sensitive.
- MillionVerifier also returns `free` (Gmail/Yahoo flag) and `role` (info@/support@ flag) — these are logged in `mv.jsonl` but do not affect the verdict by default. Add your own suppression logic post-verification if needed.
- For lists sourced from consumer databases (B2C), the `free=true` suppression matters more — add a post-filter step if sending B2B only.
