#!/usr/bin/env node
/*
 * shared-hosts.js :: ONE list of hosts where many unrelated businesses share a single
 * registrable domain — site builders, social pages, directories, Google's own short links.
 *
 * A lead whose `website` sits on one of these has, for owner-finding purposes, NO website
 * of its own. Three consequences, each enforced by a consumer of this list:
 *   - never group/dedupe by that domain      (collapse-domains.js: 400 Facebook-only
 *                                             contractors are not one company)
 *   - never fetch it as "the company site"   (fetch-sites.js: nothing to read there)
 *   - never trust an email/URL on it as the  (prep-website-recovery.js: a lookup keyed on
 *     business's own domain                   the host returns employees of the HOST)
 *   - route the lead to the no-website        (collapse-domains.js -> leads_nowebsite.csv,
 *     recovery track instead                  SKILL STEP 5d)
 *
 * Data, not logic: grow the list here. Matching = exact host OR any subdomain of a listed
 * host (foo.wixsite.com, m.facebook.com, maps.app.goo.gl all match).
 */
const SHARED_HOSTS = [
  // social / messaging pages used as "the website"
  'facebook.com', 'fb.com', 'fb.me', 'instagram.com', 'x.com', 'twitter.com', 'tiktok.com',
  'youtube.com', 'youtu.be', 'linkedin.com', 'pinterest.com', 'nextdoor.com', 'wa.me',
  'linktr.ee', 'beacons.ai',
  // Google properties handed out as a business "site"
  'sites.google.com', 'google.com', 'business.site', 'g.page', 'goo.gl', 'maps.app.goo.gl',
  'blogspot.com',
  // free site builders where the business is a subdomain / path of the host
  'wixsite.com', 'wix.com', 'wixstudio.io', 'godaddysites.com', 'weebly.com', 'squarespace.com',
  'wordpress.com', 'myshopify.com', 'webnode.com', 'webnode.page', 'strikingly.com',
  'jimdosite.com', 'webflow.io', 'github.io', 'notion.site', 'carrd.co', 'site123.me',
  'ueniweb.com', 'homestead.com', 'yolasite.com', 'bizland.com', 'mystrikingly.com',
  'wordpress.org', 'tumblr.com', 'weebly.net',
  // newer site-builder / deploy / "free site for your GMB listing" platforms. A business whose only
  // web presence is a subdomain here has no site of its own: grouping by that domain merges
  // UNRELATED firms into one "brand" (seen live: 4 unrelated UK trades on *.sitelift.site collapsed
  // to one root domain, so one firm's site text and owner would have been fanned to the other three).
  'sitelift.site', 'localo.site', 'brand.site', 'square.site', 'netlify.app', 'vercel.app',
  'lovable.app', 'replit.app', 'pages.dev', 'framer.website', 'framer.app', 'glitch.me',
  'weeblysite.com', 'jimdofree.com',
  // directories / lead marketplaces / review sites listed as "website"
  'yelp.com', 'angi.com', 'angieslist.com', 'homeadvisor.com', 'houzz.com', 'thumbtack.com',
  'porch.com', 'bark.com', 'bbb.org', 'yellowpages.com', 'superpages.com', 'manta.com',
  'mapquest.com', 'tripadvisor.com', 'birdeye.com', 'chamberofcommerce.com', 'expertise.com',
  'wheree.com', 'buildzoom.com', 'networx.com', 'checkatrade.com', 'trustatrader.com',
  'mybuilder.com', 'rated-people.com', 'yell.com', 'hotfrog.com', 'cylex.com', 'brownbook.net',
  // Australian directories / marketplaces (2026-09-20 AU run: three unrelated restumpers shared one
  // localsearch.com.au root_domain and inherited a neighbour's page text, verdict and email)
  'localsearch.com.au', 'yellowpages.com.au', 'truelocal.com.au', 'hipages.com.au', 'oneflare.com.au',
  'serviceseeking.com.au', 'hotfrog.com.au', 'startlocal.com.au', 'dlook.com.au', 'aussieweb.com.au',
  'cylex.com.au', 'wordofmouth.com.au', 'productreview.com.au', 'houzz.com.au', 'airtasker.com',
  'whereis.com', 'pinkpages.com.au',
];

// lenient host extraction: accepts a full URL, a bare host, or host+path; strips www.
function hostOf(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  try { return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : 'https://' + s).host.replace(/^www\./, '').toLowerCase(); }
  catch { return ''; }
}

// registrable ("root") domain for grouping branches of one brand: houston.groundworks.com and
// groundworks.com -> groundworks.com. Two-level public suffixes (co.uk, com.au, ...) keep 3 labels.
const SLD = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'or', 'ne', 'go', 'mil', 'ltd', 'plc', 'nhs', 'sch']);
function rootDomain(u) {
  const h = hostOf(u);
  if (!h || !h.includes('.')) return h;
  const p = h.split('.');
  if (p.length <= 2) return h;
  const tld = p[p.length - 1], sld = p[p.length - 2];
  return (tld.length === 2 && SLD.has(sld)) ? p.slice(-3).join('.') : p.slice(-2).join('.');
}

function isSharedHost(u) {
  const h = hostOf(u);
  if (!h) return false;
  return SHARED_HOSTS.some(s => h === s || h.endsWith('.' + s));
}

// 'site' = the business's own website | 'shared_host' = lives on a listed host | 'none' = empty/unparseable
function classifyWebsite(u) {
  const h = hostOf(u);
  if (!h) return 'none';
  return isSharedHost(u) ? 'shared_host' : 'site';
}

module.exports = { SHARED_HOSTS, hostOf, rootDomain, isSharedHost, classifyWebsite };
