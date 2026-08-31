# campaign-review — eval suite

Re-runnable evals for the campaign-review skill. Two axes:

1. **Triggering** — does the skill fire on real review requests and stay quiet on
   near-misses that belong to sibling skills (`cold-email` = write outreach,
   `prospecting` / `directory-lead-sourcing` / `google-maps-scrape` = build a list,
   `ads` / `ad-creative`, `copywriting` / `cro`, `content-strategy`, `analytics`,
   `emails` = warm/lifecycle). 12 should-fire + 10 near-miss = 22 queries.
2. **Diagnostic quality** — given a golden client case (funnel numbers + reply
   signature), does the rubric land on the correct **binding constraint**? 5 cases
   drawn from real reviews with settled verdicts: Untitled (placement), SolveX
   (company-size targeting), Bluesoft (persona/business-model, NOT wrong vertical,
   NOT placement), Campus51 (list quality/bounce), Minerva (offer/timing, seller-sourcing).

## Why a custom harness

skill-creator's `run_eval.py` / trigger-optimizer **cannot run on Windows** — `select()`
on a subprocess pipe throws `[WinError 10038] not a socket`, making every query score 0%
(pure artifact). See memory `reference_skillcreator_windows`. This harness scores the same
two things by shelling out to `claude -p` (which PowerShell resolves fine via `claude.cmd`).

## Run

```powershell
pwsh .\run-eval.ps1                       # default model claude-sonnet-4-6
pwsh .\run-eval.ps1 -Model claude-opus-4-8  # eval against the production model
```

~30s per call, ~14 min total. Writes `results.md` (scored tables + each model verdict).
Triggering is auto-scored (does the answer name `campaign-review`); quality is auto-scored
by keyword match but **eyeball the verdict column** — the rubric can be right with different
wording. Update the golden set as new client verdicts settle.
