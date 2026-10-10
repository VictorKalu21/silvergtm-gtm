# 02 · Email Verification — Two-Stage Gate (DeBounce **or** MillionVerifier + BounceBan)

**Outcome:** a clean, split deliverability-gated email list: sendable / risky / dropped. Ready to upload to Smartlead, Instantly, or any cold-email sending tool.

**Why two stages:** the Stage-1 verifier classifies most emails instantly but flags corporate catch-all domains as uncertain (accept-all). BounceBan does a live SMTP probe on the catch-alls and recovers ~60–70% of them as deliverable. Without Stage 2 you lose that slice and over-drop.

**When to run:** before uploading any contact list to a cold-email campaign. Non-negotiable gate — skip it and your bounce rate will tank domain health.

---

## Pick your Stage 1 verifier

| Verifier | Script | When to pick |
|----------|--------|--------------|
| **MillionVerifier** | `verify-millionverifier-bounceban.js` | Cheaper per credit, faster, simpler result schema. **Good default for most lists.** |
| **DeBounce** | `verify-debounce-bounceban.js` | Marginally better catch-all detection on some enterprise domain ranges. Use for high-stakes lists where you want every edge. |

Both feed the **same** BounceBan Stage 2 — the catch-all recovery logic is identical either way.

---

## Inputs

- A CSV with at least one column named `Email` (exact header match, case-sensitive). Any other columns are passed through unchanged.
- API keys in `~/Silver GTM Systems/ENVs-Secrets/email-verification.env` (loaded automatically — no arg-passing):
  ```
  DEBOUNCE_KEY=...          # only needed if using DeBounce
  MILLIONVERIFIER_KEY=...   # only needed if using MillionVerifier
  BOUNCEBAN_KEY=...         # always needed (Stage 2)
  ```

## Pipeline

```
raw CSV → dedupe emails → Stage 1 verifier (DeBounce 6 / MillionVerifier 8 concurrent workers)
  good / ok           → sendable pool
  invalid/disposable  → dropped pool
  catch-all / unknown → BounceBan (4 concurrent workers)
                          deliverable → sendable pool (recovered)
                          other       → risky pool
→ write sendable / dropped / risky / full CSVs
```

### Step 1 — Stage 1 verifier on all emails

```
# MillionVerifier (default)
IN="C:/path/to/list.csv" OUT_DIR="verify" node scripts/verify-millionverifier-bounceban.js

# — or — DeBounce
IN="C:/path/to/list.csv" OUT_DIR="verify" node scripts/verify-debounce-bounceban.js
```

Results checkpoint to `OUT_DIR/mv.jsonl` (MillionVerifier) or `OUT_DIR/debounce.jsonl` (DeBounce) — append-only, so interrupts resume cleanly.

**Classification:**

*MillionVerifier result codes:*
| Result | Action |
|--------|--------|
| `ok` | sendable |
| `catch_all` / `unknown` | → BounceBan |
| `invalid` / `disposable` / `spamtrap` | dropped |

*DeBounce result strings:*
| Result contains | Action |
|-----------------|--------|
| "Safe to Send" | sendable |
| "Invalid" / "Disposable" / "Spamtrap" / "Syntax" | dropped |
| Anything else (Accept-All / Risky / Unknown) | → BounceBan |

### Step 2 — BounceBan on the uncertain emails

Runs automatically after Stage 1 in the same script. Checkpoints to `OUT_DIR/bounceban.jsonl`.

- BounceBan `result === "deliverable"` → recovered as sendable
- Anything else → risky

### Step 3 — Merge and split

The script writes four files to `OUT_DIR` (`<stem>` = input filename without extension):

| File | Who goes here |
|------|--------------|
| `<stem>_sendable.csv` | Stage-1 good/ok + BounceBan-recovered — **upload this** |
| `<stem>_dropped.csv` | Invalid / disposable / spamtrap / no-email |
| `<stem>_risky.csv` | Catch-alls BounceBan couldn't confirm |
| `<stem>_full.csv` | All rows with `verify_verdict` + `verify_detail` added |

## Credit consumption

| Stage | Credits used |
|-------|-------------|
| Stage 1 (either verifier) | 1 per unique email |
| BounceBan | 1 per catch-all/unknown (typically 30–40% of list) |

Check balances before large runs: MillionVerifier `https://app.millionverifier.com`, BounceBan `https://app.bounceban.com`.

## Gotchas

- The `Email` column header is case-sensitive — must be exactly `Email`.
- Duplicate emails are verified once; all rows for that email get the same verdict.
- BounceBan has a 90-second per-request timeout — do not kill mid-run. Use the resumable checkpoints instead.
- Risky ≠ necessarily bad. For high-value accounts (e.g. VC-funded AI cos) you may choose to send to risky too, with a tighter sequence.
- **Cloud / proxied sessions (Claude Code on the web): Node ignores the session proxy by default.** `fetch` and the `https` module do not read `HTTPS_PROXY`, so calls to proxy-authenticated hosts (BounceBan, MillionVerifier) go out direct with no credentials. BounceBan then answers `{"msg":"Authorization information is missing or invalid."}` — no `id`, no `result` — and the script logs a bare `{"email":...}` row for every catch-all, which the merge step reads as risky. Fix: run with `NODE_USE_ENV_PROXY=1` (Node ≥ 22.21) and drop the `Authorization` header — the proxy injects the key. curl is already proxied, so a one-off curl working while the script fails is the tell. No credits are consumed by the failed calls. (Seen 2026-10-10, AI Reserve Tier A run.)
- **BounceBan can return an async "not yet complete" response** (`{"id":"...","msg":"The email verification process is not yet complete..."}`) instead of the final verdict. Do **not** re-submit the same email — each submit costs a credit. Poll `GET /v1/verify/single/status?id=<id>` (free) until `status: "success"`. The current script's 5× retry loop re-submits; a proxy-aware rewrite that submits once and polls is in the 2026-10-10 session notes and should replace it.
- **DeBounce returns transient `result: "error"` rows** (16 of 672 on a 6-worker run) that `classifyDebounce` treats as *drop*. They are not verdicts. Strip `"result":"error"` lines from `debounce.jsonl` and re-run — the checkpoint makes this a 16-call retry, and on the retry 15/16 resolved (14 good, 1 catch-all). Treat a row that still errors after the retry as unverified, not dropped, and say so in the report.
- **Dedupe/decide the list *before* verifying, not after.** On the AI Reserve Tier A run the persona/concentration cuts removed 342 of 1,014 rows (34%) ahead of Stage 1 — that is ~340 DeBounce credits and ~130 BounceBan credits not spent on contacts that were never going to be uploaded.
- MillionVerifier also returns `free` (Gmail/Yahoo) and `role` (info@/support@) flags — logged in `mv.jsonl` but not applied to the verdict by default. For B2B-only sending, add a post-filter to suppress `role`/`free` if needed.

## Worked example — AI Reserve Portfolio (2026-08-30, DeBounce path)

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

## Worked example — AI Reserve, "AI Cloud and MSP Cos, Tier A (Direct Offer)" (2026-10-10, DeBounce path, cloud session)

Input was a 1,014-row Apollo export cut to 672 by persona/concentration rules first (sales/marketing/HR/legal/PMO titles, Apollo seniority Entry/Senior/Manager, delivery managers, CISOs, 7 already in Smartlead, 5 bad emails, 4 in-file dupes). Verified via `NODE_USE_ENV_PROXY=1`, BounceBan submit-once + poll.

| Stage | Count |
|-------|-------|
| Input (post-cut) | 672 |
| Unique emails | 672 |
| DeBounce: Safe to Send | 408 |
| DeBounce: catch-all / unknown → BounceBan | 262 |
| DeBounce: dropped (1 hard bounce + 1 persistent error) | 2 |
| BounceBan: deliverable (recovered) | 247 |
| BounceBan: undeliverable / risky | 15 |
| **SENDABLE → uploaded to Smartlead** | **655** |
| Risky (held back) | 15 |
| DeBounce credits used | 672 (+16 retries) |
| BounceBan credits used | 262 |

Post-upload check: `GET /campaigns/{id}/analytics` → `campaign_lead_stats.total = 655`, matching the sendable count. The 15 risky were all `Accept All` domains BounceBan marked `undeliverable` — including a CFO and two presidents — so "risky" here means a real catch-all with no SMTP confirmation, not junk; worth a tighter follow-up sequence if the account matters.
