---
source: LinkedIn post-reactor harvest (HeyReach UI import → API export)
vertical: tool-user ICP via vendor/creator post engagement (proven on Clay)
verdict: validated
last_validated: 2026-08-02
access: HeyReach "LinkedIn Post (Reactors)" import (UI-ONLY — no API import endpoint) → HeyReach API export; discovery via WA-03/WA-08 SERP dorks
dispatch: hybrid — user does the 2-min UI import; agent exports + classifies
cost_tier: free (rides the connected LinkedIn sender seat)
---

# LinkedIn reactor harvest × tool-user ICP

**Coverage:** ~1k reactors per big vendor announcement post; **~300 end-user companies per 1k reactors on the right posts**, each row arriving WITH the person (name, title, profile URL — contact included, skips Apollo people-finding). Repeat-reactor overlap between batches was only ~4% — successive imports keep yielding net-new.
**THE VARIABLE IS AUDIENCE COMPOSITION, NOT THE MECHANIC — measured author-type ladder: FOUNDER launch post 70.6% end-user (Varun Anand, n=1,710) > vendor-page announcement 34.7% (n=1,069) > niche creator 12.8% (n=179).** Founder posts pull big-co in-house GTM staff (Adobe/Amazon/Databricks-grade). Post AGE is irrelevant — reactor employer data is current at export time (the 34.7% post was 6 months old). Rank candidate posts by reaction count × author type (founder > vendor page > creator), not recency. Caveats at scale: HeyReach captured only ~47% of a 3.6k-reaction post's displayed reactors (partial scrape, not an error); at 1k+ end-user rows domain resolution becomes the bottleneck — resolve in a separate scripted batch, don't cap it inside the classify agent (vaanand run left 938 confirmed end-users domain-blank).
**Fields:** name, headline, company field (**~96-97% employer-parse**), profile URL, location.
**Restrictions:** reactors only — explicitly NOT commenters (commenters need a ~$1-2/1k Apify actor); 10k reactors/post cap; export carries NO source-post field → one list per post + external ledger (naming: `CR-<author>-<last6-of-activity-id>`); consumes the sender seat's LinkedIn action budget — pace imports.
**Method:** discovery without any LinkedIn login: `site:linkedin.com/posts "<author-slug>" clay` dorks (+ announcement keywords); reaction/comment counts are SERVER-VISIBLE on logged-out post fetches — verify counts before proposing an import. Maintain `harvested_posts_ledger.csv` + a creator scoreboard (measured end-user % per author) so source ranking is empirical.
**Gotchas:** vendor's own employees flood their star creators' engagement; April-Fools/joke posts have big counts + junk audiences; "steal my template" comment-gates inflate comments not reactors; imported count ≈ displayed count minus deleted/private profiles.
**Runs:** 2026-08-02 — Silver GTM (Clay) — r1: 179 → 16 cos (12.8%); r2: 1,069 → 334 net-new cos, 302 domains (34.7%); r3 vaanand founder post: 1,710 exported (of 3,604 displayed) → 70.6% end-user, 145 net-new cos + 938 domain-blank backlog. Cycle-1 posts 2-8 unharvested (ledger status=proposed). Run PAUSED by user after r3 → size-gate + outreach.
