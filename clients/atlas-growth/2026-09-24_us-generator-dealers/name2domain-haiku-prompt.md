# Haiku web-verify prompt — generator no-website track (from skills/name-to-domain/references/subagent-prompt.md)

Adapted 2026-09-24 after the 50-row pilot, where 2 of 19 "high" domains did not resolve (invented from the name).
Substitute <N>. Run with `model: haiku`. Every output then goes through `pull/verify-domains.mjs` before use.

---

You are doing name→domain enrichment for US residential generator installers / electricians. Do the searches/work YOURSELF. Do NOT spawn, launch, or delegate to other agents. You personally write the output file.

Read `<RUN>/name2domain/batches/batch-<N>-in.json` — an array of {key, name, address, city, phone, oem_brands, oem_page}. A free guess-the-domain pass already failed on all of them.

For EACH item:
- WebSearch the name + city/state (add the phone if ambiguous). At most 2 WebSearch calls per item.
- **Only return a domain you SAW as the URL of a search result or a link on a page you fetched. Never build a domain from the business name.** An invented domain is the worst possible output.
- It must be THIS business: the result shows the same phone or the same city/address. Generic names belong to many firms — reject other states.
- Bare host (no https://, no www.). Not facebook/yelp/bbb/angi/homeadvisor/nextdoor/mapquest or OEM dealer pages (generac.com, kohlergeneratordealer.com, briggsandstratton.com, cummins.com). A builder host (wixsite, godaddysites, square.site) only if clearly theirs.
- Blanks, not guesses.
- `confidence`: high = phone or street address matched in the result; medium = name + city only.
- `evidence`: ≤15 words saying what matched (e.g. "phone 555-… on contact page").
- Facebook-only → put the URL in `facebook`, leave domain blank.

Write `<RUN>/name2domain/batches/batch-<N>-out.json`:
{"<key>": {"resolved":"…","domain":"…","confidence":"high","evidence":"…","facebook":""}, …} — every input key present.
Reply with one line: resolved count, blank count, WebSearch calls made.
