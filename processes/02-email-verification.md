# 02 · Email Verification — Two-Stage Gate (DeBounce **or** MillionVerifier + BounceBan)

**Outcome:** a clean, split deliverability-gated email list — sendable / risky / dropped — ready
to upload to Smartlead, Instantly, or any cold-email sending tool.

**When to run:** before uploading any contact list to a cold-email campaign. Non-negotiable gate.

> **The procedure lives in the skill:**
> [`skills/email-verify-debounce-bounceban/SKILL.md`](../skills/email-verify-debounce-bounceban/SKILL.md)
> — verifier choice, key file, result-code tables, credit consumption, outputs and gotchas.
> The scripts moved with it: `skills/email-verify-debounce-bounceban/scripts/verify-*.js`.
>
> This file keeps the **worked example**, per this repo's convention that every process is proven
> with real numbers rather than described in the abstract.

---

## Worked example — AI Reserve Portfolio (2026-08-30, DeBounce path)

```bash
IN="~/lists/ai-reserve-portfolio.csv" OUT_DIR="verify" \
  node skills/email-verify-debounce-bounceban/scripts/verify-debounce-bounceban.js
```

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

**What this run shows:** 252 of 709 (36%) came back catch-all — unusable without Stage 2. BounceBan
recovered 137 of them, 54%. Dropping Stage 2 would have cost 137 contacts out of a 594-contact
sendable list, i.e. **23% of the usable list**, for the sake of ~230 credits.

Note DeBounce reported zero dropped at Stage 1 while 100 rows ended up dropped — those were
rows with no email at all, caught at the merge step, not by the verifier.
