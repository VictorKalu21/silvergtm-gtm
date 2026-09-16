# 2026-09-16_uk-foundation-repair-maps — run notes

Our own UK Google Maps scrape (GATE 1 approved 2026-09-16: 177 tiles × 10 queries, 8 shards, pagination on,
review floor 5, 150 anchors). Post-scrape commands: `PIPELINE.md`. Dedupe memory: the export run's 175-row
deliverable (`../2026-09-16_uk-foundation-repair/deliverable/`), keyed on business_id + host + phone (`dedupe-ref.js`).

## Probes (3-call rule) — site-text rungs from this container, 2026-09-16
- Plain fetch: welbaconstruction.co.uk 200 · petercox.com 403 (Cloudflare managed Turnstile) · timberwise.co.uk 202 / 169 B shell.
- curl_cffi `impersonate="chrome"`: petercox 403 · timberwise 202 · kenwoodplc.co.uk 200. TLS impersonation alone does not clear the WAF.
- Scrapling 0.4.15 `StealthyFetcher(solve_cloudflare=True)` using the pre-installed Playwright Chromium (symlink
  /opt/pw-browsers/chromium-1234 → chromium-1243): **petercox.com solved → 200, 15 kB text, ~80 s**; timberwise → 202
  chrome-error (a `.well-known` redirect challenge, not Cloudflare) — not recovered. Reserve Scrapling for the confirmed
  403/Turnstile subset only (slow), never bulk.
- Wayback CDX: archive.org "Temporarily Offline" at probe time; retry later for the Scrapling residue.
- Firecrawl: no key; not a rung this run.

## Owner prompt
`owner-prompt.md` copied from the export run (US prompt + UK role notes) so `fetch-sites.js` can write under `owner/`.
The UK variant is built at GATE 6 before any owner read and saved to `owner-prompts/uk-foundation-repair.md`.
