# silvergtm-ship

Safely ship the **Silver GTM** website (`silvergtm.com`) — a hand-written static site on
**Cloudflare Pages** (project `silver-gtm`), with no framework and no CI. This skill exists so a
solo operator never silently breaks the live site on a deploy.

## When to use
Whenever the intent is "make these edits live" — the homepage, `/clay`, `/clay-playbook`, `/sample`,
a new wedge/offer/lead-magnet page, or wiring a new sending domain. Reach for it **before** any raw
`wrangler` command against this site.

## The pipeline (in `SKILL.md`)
Commit a restore point → `build.sh` → auth check → **deploy to `--branch main`** → verify the exact
live URLs → roll back if broken. The commit is the rollback target; the verify catches a bad ship
before prospects do. Never skip either.

## Secondary domains (per-domain color variants)
13 cold-email sending domains each serve their own accent color of the homepage from the same
project, via `_worker.js` host routing. **The #1 trap: deploy the worker to the production branch
(`main`), not a preview branch — otherwise the host→color map goes stale and every domain shows one
color** (this bit Atlas). The only proof is curling a live non-control domain bare and seeing its own
color. Full playbook, domain→color map, and the **ready-to-send provider CNAME message** are in
`references/secondary-domains.md`.

## Files
| File | What it is |
|---|---|
| `SKILL.md` | The full ship pipeline + secondary-domain section + guardrails. Start here. |
| `references/build.sh` | Canonical build script — assembles `dist/`, clean-URL folders, and the 14 color-variant folders + `_worker.js`. |
| `references/secondary-domains.md` | Per-domain color playbook, domain→color map, provider CNAME message, go-live + color-routing verification. |

## Key facts
- **Source dir:** `C:\Users\victo\gtme_analysis\silvergtm_site` (a git repo). **Deploy dir:** `dist/` (git-ignored, built).
- **Project:** `silver-gtm` · **Production branch:** `main` · **Account:** `611ae142e99376aa21293384c6714b55`.
- **Auth:** wrangler OAuth session (`npx wrangler whoami` to refresh; `account read` + `pages write` suffices). A saved `cfat_…` token may be dead — if `9109 Invalid access token`, `unset CLOUDFLARE_API_TOKEN` and let OAuth drive.
- No secrets live in this skill — keep it that way (it's mirrored to a **public** git repo).
