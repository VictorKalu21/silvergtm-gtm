---
source: community.clay.com (Tightknit public web mirror of Clay's Slack)
vertical: Clay users (community members / intro posts)
verdict: validated (hard ceiling; vein exhausted 2026-08)
last_validated: 2026-08-02
access: WA-04 (sitemap enumeration) + WA-07 (Wayback — live origin now Cloudflare-walled)
dispatch: web-scrape-triage
cost_tier: free
---

# Tightknit community mirror × Clay users

**Coverage:** 16,444 posts / ~24.7k member-profile URLs (sitemap-verified). The `/x/welcome` intro channel is the ONLY high-yield stratum — **291 posts, hard ceiling** → 71 distinct end-user companies with domains (+44 agency companies for the exclusion map). Support channel = 67% of the site but ~6% attribution (question-askers don't name employers).
**Fields:** author display name TRUNCATED to "First L." at the data layer (meta/JSON-LD too); full name + company appear only in intro-post title/body text; NO structured employer field anywhere; some raw-handle display names leak full names.
**Fill (full run):** welcome stated-attribution 80% (sample predicted 66% — full channel denser); name→domain 95%; 104/222 new intro posts carried LinkedIn URLs (people-level bonus).
**Restrictions:** live origin behind a Cloudflare bot challenge since ~Aug 2026 (recon in Jul 2026 found it open — states change fast); Wayback archives through Mar 2026; 3.4% of welcome posts have no snapshot; robots Crawl-delay 3.
**Method:** `/server-sitemap-index.xml` → `sitemap-posts/0.xml` + `sitemap-user-profiles/{0..3}.xml`; channel is in the URL path `/x/{channel}/{id}/{slug}` so bucket BEFORE fetching; JSON-LD carries author+title; fetch via Wayback availability/CDX; pre-hydration "empty shell" snapshots recover by trying alternate timestamps.
**Gotchas:** attributed pool is agency-heavy (110 agency vs 90 end-user); announcements channel authors = Clay staff (use as staff-control stratum); segment-tag at ingestion (agency / staff / job-seeker / student).
**Runs:** 2026-08-02 — Silver GTM — all 291 welcome posts → 71 end-user companies w/ domains — PASS; welcome vein fully mined, only low-density channels remain.
