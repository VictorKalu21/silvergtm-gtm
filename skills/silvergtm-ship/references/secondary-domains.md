# Secondary domains — per-domain color variants

The 13 cold-email sending domains each serve their own accent color of the homepage, from the one
`silver-gtm` Pages project, via `_worker.js`. `silvergtm.com` is the control (emerald). This file
holds the domain→color map, the wiring/verify steps, and the **exact message to send the inbox
provider** so the domains go live.

## Domain → color map

| Domain | Color | Domain | Color |
|---|---|---|---|
| **silvergtm.com** (control) | emerald | getsilvergtm.info | navy |
| bringsilvergtm.co | cobalt | gotsilvergtm.co | ochre |
| bringsilvergtm.info | oxblood | silvergtm.co | slate |
| comesilvergtm.co | teal | worksilvergtm.co | burgundy |
| findsilvergtm.co | plum | worksilvergtm.info | pine |
| findsilvergtm.info | terracotta | workwithsilvergtm.co | indigo |
| getsilvergtm.co | forest | workwithsilvergtm.info | copper |

The authoritative copy of this map lives in two places that must stay in sync:
`silvergtm_site/_worker.js` (`HOST_TO_VARIANT`) and the `VARIANTS` table in `silvergtm_site/build.sh`.

Accent hexes (base / hover-dark), swapped from the emerald base `#157A4D` / `#0f5e3b`:
cobalt `#1E4F9C`/`#17407F` · oxblood `#9B2D3A`/`#7C232E` · teal `#0E6E70`/`#0A5658` ·
plum `#5E2A7E`/`#4A2163` · terracotta `#A8431E`/`#863518` · forest `#2F6B34`/`#245328` ·
navy `#22396B`/`#1A2C54` · ochre `#8A6212`/`#6E4E0E` · slate `#3B5566`/`#2E4351` ·
burgundy `#7A2140`/`#611A33` · pine `#14584A`/`#0F473B` · indigo `#3D3A8E`/`#302D71` ·
copper `#8A5A2B`/`#6E4822`.

## Why the provider has to set DNS (not us)

These domains' mailboxes run inside the **inbox provider's** Cloudflare account (that's where the
cold-email sending is set up). The domains are on Cloudflare nameservers but the **zone is not in
our account**, so we cannot add DNS to it. We register each domain as a Pages custom domain on
`silver-gtm` (it sits `pending` / "CNAME record not set"), and the provider adds one CNAME per
domain to flip it live. Moving the nameservers to our account instead would break their email.

> Going-forward alternative: for domains **we** own the zone for, point the nameservers at our own
> Cloudflare, add the custom domain, and set the CNAME ourselves — no provider round-trip.

## The message to send the provider

Copy-paste this. It covers all 13 in one go.

---

**Subject: One DNS record per domain to point them at our landing pages**

Hi — I've set up landing pages for the SilverGTM sending domains. Each one is already registered on
our Cloudflare Pages project and will go live automatically the moment you add **one DNS record per
domain**. Nothing else changes — please **don't touch the MX, SPF (TXT), DKIM, or DMARC records**,
so email keeps working.

For **each** of the domains below, add:

- **Type:** CNAME
- **Name / Host:** `@` (the root/apex)
- **Target / Value:** `silver-gtm.pages.dev`
- **Proxy status:** **Proxied (orange cloud)** — a grey-cloud / DNS-only record will not work

Domains:

```
bringsilvergtm.co
bringsilvergtm.info
comesilvergtm.co
findsilvergtm.co
findsilvergtm.info
getsilvergtm.co
getsilvergtm.info
gotsilvergtm.co
silvergtm.co
worksilvergtm.co
worksilvergtm.info
workwithsilvergtm.co
workwithsilvergtm.info
```

If your DNS won't accept a CNAME on the root, add it on `www` instead and set a root→www redirect,
and let me know. SSL provisions automatically a few minutes to ~1 hour after the record is added.
Thanks!

---

## Verify go-live (run this after the provider says it's done)

`active` = live. `pending` + "CNAME record not set" = the record isn't in place (or it's grey-cloud).

```bash
# refresh the wrangler OAuth token first (it expires ~hourly), then read it
npx wrangler whoami >/dev/null 2>&1
TOKEN=$(grep oauth_token /c/Users/victo/.wrangler/config/default.toml | sed 's/.*= *"//; s/".*//')
ACCT=611ae142e99376aa21293384c6714b55
for d in bringsilvergtm.co bringsilvergtm.info comesilvergtm.co findsilvergtm.co \
         findsilvergtm.info getsilvergtm.co getsilvergtm.info gotsilvergtm.co \
         silvergtm.co worksilvergtm.co worksilvergtm.info workwithsilvergtm.co \
         workwithsilvergtm.info; do
  curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCT/pages/projects/silver-gtm/domains/$d" \
    -H "Authorization: Bearer $TOKEN" | grep -oE '"name":"[^"]*"|"status":"[a-z]*"|CNAME record not set'
done
```

**Then prove the color routing** (this is the check that would have caught the Atlas bug): for a
handful of live NON-control domains, confirm the bare host returns that domain's OWN accent, not the
emerald default `#157A4D`:

```bash
for d in bringsilvergtm.co findsilvergtm.co workwithsilvergtm.info; do
  echo -n "$d -> "; curl -sL "https://$d/" --max-time 12 | grep -oiE -- '--emerald:#[0-9a-f]{6}' | head -1
done
# expect: bringsilvergtm.co=#1E4F9C (cobalt), findsilvergtm.co=#5E2A7E (plum),
#         workwithsilvergtm.info=#8A5A2B (copper) — NOT all #157A4D
```

## Wrangler token gotchas
- Deploys and the API calls above use the **wrangler OAuth session** (`account read` + `pages write`
  is enough). Run `npx wrangler whoami` first — the OAuth token in
  `/c/Users/victo/.wrangler/config/default.toml` expires roughly hourly.
- A saved `cfat_…` Pages:Edit token may be **dead/rotated** — if `wrangler pages deploy` returns
  `Invalid access token [code: 9109]`, `unset CLOUDFLARE_API_TOKEN` and let the OAuth session drive.
