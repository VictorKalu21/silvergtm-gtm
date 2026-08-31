---
name: silvergtm-ship
description: >-
  Safely ship/deploy/publish changes to the Silver GTM website (silvergtm.com),
  a Cloudflare Pages project named `silver-gtm`. Use this WHENEVER you are about to
  put site changes live — the homepage, /clay, /clay-playbook, or any new wedge/offer/
  lead-magnet page — or whenever the user says "ship it", "deploy the site", "push the
  clay page live", "publish the changes", "redeploy silvergtm", or similar. It bakes in
  the safety net that keeps a solo operator from breaking the live site on a ship:
  commit a restore point → build → deploy → verify live → roll back if broken. Reach for
  this BEFORE running any raw `wrangler` command against this site, even if the user
  didn't say the word "deploy" — if the intent is "make these edits live", this is the skill.
---

# Ship the Silver GTM site (safely)

This site is a small, hand-written static site deployed to **Cloudflare Pages**. There is
no framework and no CI — deploys are direct uploads. The whole point of this skill is to
make every ship **reversible and verified**, so a single bad edit never silently breaks
the live site at silvergtm.com.

Run the steps in order. Don't skip the commit (it's the rollback target) or the verify
(it's how you catch a broken ship before the user's prospects do).

## The site at a glance

| | |
|---|---|
| Source dir | `C:\Users\victo\gtme_analysis\silvergtm_site` (a git repo) |
| Cloudflare Pages project | `silver-gtm` (domains: silvergtm.com, www.silvergtm.com, silver-gtm.pages.dev) |
| Deploy dir | `dist/` — **build output, git-ignored**, assembled by `build.sh` |
| Production branch | `main` (deploy here, never a preview branch — see the gotcha below) |
| Secondary domains | 13 cold-email sending domains, each serving a **per-domain accent color** of the homepage via `_worker.js`. See "Secondary domains" below. |

**Source → URL map** (this is why we build into clean-URL folders, not raw files):

| Source file | Built to | Live URL |
|---|---|---|
| `index.html` | `dist/index.html` + `dist/<color>/index.html` (recolored) | `/` (per-domain color) |
| `clay.html` | `dist/clay/index.html` | `/clay` |
| `clay-playbook.html` | `dist/clay-playbook/index.html` | `/clay-playbook` |
| `sample.html` | `dist/sample/index.html` | `/sample` |
| `_worker.js` | `dist/_worker.js` | (host→color router; Pages advanced mode) |
| `victor.jpg`, `logos/`, `clay-og.png`, `clay-playbook-og.png` | `dist/` (root) | `/victor.jpg`, `/logos/…`, etc. |

When you add a **new page** `foo.html`, it must build to `dist/foo/index.html` to serve at `/foo`.
Update `build.sh` to copy it, and add its OG image to the root copy line. **Assets referenced by
the homepage must be absolute** (`/victor.jpg`, `/logos/…`) — the worker keeps the browser URL at
`/` while serving a `/<color>/` file, so relative paths would break in the color variants.

## The ship pipeline

Use `git -C "$DIR"` (not `cd`) so you never trip a directory-permission prompt. Set
`DIR="/c/Users/victo/gtme_analysis/silvergtm_site"`.

### 1. Pre-flight
- Confirm you're working in the source dir and it's a git repo (`git -C "$DIR" status`).
- Know **which URLs this change affects** — you'll verify exactly those in step 6.
- If `build.sh` doesn't yet copy a new page you added, fix it first (see the map above).

### 2. Commit a restore point — always
Every deploy must be preceded by a commit, because the previous commit IS your rollback
target. Never deploy uncommitted work — if the ship breaks something, you want a clean
`git revert` available, not a pile of unsaved edits.
```bash
git -C "$DIR" add -A
git -C "$DIR" commit -q -m "<what changed, one line>" -m "<why / detail>

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git -C "$DIR" log --oneline | head -3
```

### 3. Build dist/
```bash
bash "$DIR/build.sh"
```
This wipes and rebuilds `dist/` from source into the clean-URL structure. If `build.sh`
is missing, recreate it from the template in `references/build.sh` and commit it.

### 4. Auth check
Deploying needs Cloudflare auth. In this non-interactive shell, **`wrangler login` (browser
OAuth) will hang** — prefer an API token.
```bash
wrangler whoami 2>&1 | tail -3
```
- If authenticated → continue.
- If not → you need `CLOUDFLARE_API_TOKEN` set for the deploy command. The token must have
  **Pages:Edit** and **no IP-address filter** (an IP filter blocks this sandbox's egress IP
  and the deploy fails with an auth error). If the user pastes a token in chat, use it for
  the single deploy command and then **remind them to rotate it** — a token in a transcript
  is a leaked secret.

### 5. Deploy to production
This publishes to the live silvergtm.com. It's outward-facing — **confirm with the user
before pushing** unless they've already told you to ship. Confirm the project is `silver-gtm`
(don't deploy on a guess of project name; `wrangler pages project list` shows it).
```bash
CLOUDFLARE_API_TOKEN="<token>" wrangler pages deploy "$DIR/dist" \
  --project-name silver-gtm --branch main --commit-dirty=true 2>&1 | tail -8
```
A successful deploy prints `✨ Deployment complete!` and a `https://<hash>.silver-gtm.pages.dev`
URL. Because `--branch main` is the production branch, the change also goes live on the
custom domain (silvergtm.com) within seconds.

### 6. Verify live — don't trust the deploy, check it
Pages can 308-redirect `/clay` → `/clay/`, so follow redirects (`curl -sL`). For each URL the
change touched, confirm a 200 and grep for a string that proves the new content shipped.
Pattern:
```bash
echo "status:"; curl -sL -o /dev/null -w "%{http_code} -> %{url_effective}\n" https://silvergtm.com/<path>
echo "content:"; curl -sL https://silvergtm.com/<path> | grep -oF "<a unique new string from this change>"
# any OG image the change references must resolve 200:
curl -s -o /dev/null -w "og: %{http_code}\n" https://silvergtm.com/<image>.png
```
Use `grep -F` (literal) to dodge Windows/regex issues with em-dashes and quotes. If the
expected string is missing or the status isn't 200/308→200, the ship is bad — go to step 7.

### 7. Rollback if verification fails
Two clean ways back, in order of preference:
1. **Cloudflare dashboard** → Pages → `silver-gtm` → Deployments → find the previous good
   deployment → "Rollback to this deployment". Instant, no rebuild.
2. **Git revert + redeploy**: `git -C "$DIR" revert --no-edit HEAD` → `bash "$DIR/build.sh"`
   → re-run the deploy command. This restores source AND live to the prior good state.

Tell the user what broke, which restore point you used, and what you'll fix before re-shipping.

## Secondary domains — per-domain color variants

The site is fronted by 13 cold-email **sending domains** (bring/come/find/get/got/work/workwith-
prefixed, `.co`/`.info`), plus `silvergtm.com` as the main/control. All are attached as custom
domains to the **same** `silver-gtm` project, and each one serves its **own accent color** of the
homepage. This lets every sending domain look distinct without a second project or codebase.

**How it works** (`_worker.js` at the dist root, Pages advanced mode):
- The worker host-routes **only** `/` (and `/index.html`): strips a leading `www.`, looks up
  `HOST_TO_VARIANT[host]`, then server-side `env.ASSETS.fetch('/<color>/')` and returns it as the
  response to `/`. Everything else (`/clay`, `/sample`, assets) passes straight through.
- `build.sh` generates one `dist/<color>/index.html` per color by `sed`-swapping the accent hexes
  (`--emerald #157A4D` / `--emerald-d #0f5e3b`, which also covers the Cal.com `cal-brand`). The
  control color (`emerald`) is also the `DEFAULT` for any unmapped host.
- Preview any color on the live control domain or the `*.pages.dev` URL with `?v=<color>`.

**⚠️ THE GOTCHA — deploy variant workers to `--branch main`, always.** The `HOST_TO_VARIANT` map
only takes effect for a host once (a) that custom domain is **live** and (b) the worker carrying
the map is on the **production branch**. If you deploy to a *preview* branch (e.g. `--branch master`
→ `master.<proj>.pages.dev`), production keeps running an **older/empty map and every domain falls
back to DEFAULT — i.e. all domains show one color.** This is invisible to the usual checks: `?v=`
and `/<color>/` both work regardless of the host map, and bare-host routing can't be tested while
domains are still `pending` (no DNS). **The only proof is: after go-live, curl a NON-control domain
bare and confirm it returns its OWN color, not the default.** (This exact bug hit Atlas — fixed by
re-deploying the same worker to `--branch main`.)

**Adding / wiring a secondary domain:**
1. Add its `hostname → color` entry to `_worker.js` (`HOST_TO_VARIANT` + the `VARIANTS` set) and a
   `color base dark` row to `build.sh`. Rebuild, `?v=<color>` to eyeball it.
2. Register it as a custom domain on the project (Pages API):
   `POST /accounts/<acct>/pages/projects/silver-gtm/domains  {"name":"<domain>"}`
   (or dashboard → Pages → silver-gtm → Custom domains). It lands `pending` / "CNAME record not set".
3. Ship normally (steps 2–6) — **`--branch main`**.
4. **Send the provider the CNAME message** (these domains' mailboxes run on the inbox provider's
   Cloudflare, so we can't set their DNS). The ready-to-send message + the domain→color map + the
   post-go-live verification are in **`references/secondary-domains.md`**. Do NOT touch MX/SPF/DKIM/DMARC.

## Guardrails (why these matter)
- **Commit before deploy, every time.** A solo site with no CI has no other safety net — the
  prior commit and the prior CF deployment are the only undo buttons. Protect them.
- **Confirm the project + production intent before pushing.** Deploying is publishing; it's
  hard to un-see. Don't infer the project name or push to prod on a guess.
- **Treat any pasted token as burned.** Use it, then tell the user to rotate it.
- **Verify the exact URLs you changed.** "It deployed" ≠ "it works" — a build that copied the
  wrong file or an OG image that 404s both pass the deploy step and fail the user.

See `references/build.sh` for the canonical build script if you need to recreate it, and
`references/secondary-domains.md` for the per-domain color-variant playbook, the domain→color map,
and the exact CNAME message to send the inbox provider.
