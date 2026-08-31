# GTM Processes

Repeatable, documented go-to-market processes. Each file in `processes/` is one self-contained SOP: what it does, when to run it, the exact steps, and the scripts it uses.

**Why this exists:** execution is commoditizing — everyone can wire Claude Code → Clay → Smartlead. The moat is the *mapping and the proprietary process*, not the tools. This repo is that moat, written down and versioned.

## Conventions

- One process = one numbered markdown file in `processes/`.
- Reusable scripts live in `scripts/`, referenced by the process that uses them.
- **Data outputs (client lists, contacts, PII) are gitignored** — this repo holds *process*, not deliverables. Run outputs stay in the client working dir.
- Each SOP ends with a **worked example** (real numbers from a real run) so the process is proven, not theoretical.

## Index

| # | Process | Use when |
|---|---------|----------|
| [01](processes/01-job-board-trigger-sourcing.md) | Job-board-trigger sourcing → clean Apollo list | You want net-new companies showing a hire-trigger (e.g. posting a GTM/RevOps role) sourced, gated to ICP, and handed to Apollo for contacts. |
| [02](processes/02-email-verify-debounce-bounceban.md) | Email verification — DeBounce + BounceBan | You have a raw contact list and need to gate it before uploading to a cold-email tool. Two-stage: DeBounce all, BounceBan catch-alls. |
| [03](processes/03-email-verify-millionverifier-bounceban.md) | Email verification — MillionVerifier + BounceBan | Same gate as Process 02 but uses MillionVerifier as stage 1. Cheaper per-credit; good default for most lists. |
