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
| [02](processes/02-email-verification.md) | Email verification — two-stage gate | You have a raw contact list and need to gate it before uploading to a cold-email tool. Pick Stage 1 (DeBounce or MillionVerifier), BounceBan recovers the catch-alls. |
| [03](processes/03-web-visitor-deid-qualify.md) | Web-visitor de-ID qualify | You're building the cold-outbound list for a website-visitor de-anonymization offer: companies that run ads, lack a de-id pixel, have a sales motion, are B2B in a vertical, and are confirmed advertising on the Meta Ad Library. |
