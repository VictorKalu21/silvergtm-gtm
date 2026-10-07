#!/usr/bin/env node
/* yp-search.js parser: fixture is a trimmed copy of the real 2026-10-07 yellowpages.com search page
 * (two cards + the "Showing" line). Asserts every field, locality split, claimed flag, categories,
 * the total, URL building, and that an empty page yields no cards. No network. */
const path = require('path');
const { parseCards, parseTotal, searchUrl } = require(path.join(__dirname, '..', 'yp-search.js'));
let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };

const CARD = (id, name, claimed, phone, addr, loc, site, cats, slug) => `<div class="result" id="lid-${id}" data-analytics="{&quot;listing_id&quot;:&quot;1002085601699&quot;,&quot;ypid&quot;:&quot;${id}&quot;,&quot;mip_claimed_status&quot;:&quot;${claimed}&quot;}" data-ypid="${id}"><div class="srp-listing clickable-area iy"><div class="v-card"><div class="info"><div class="info-section info-primary"><h2 class="n">1. <a class="business-name" href="/phoenix-az/mip/${slug}-${id}?lid=1002085601699" rel=""><span>${name}</span></a></h2><div class="categories">${cats.map(c => `<a href="https://www.yellowpages.com/phoenix-az/x">${c}</a>`).join('')}</div><div class="ratings" data-israteable="false"></div><div class="links">${site ? `<a class="track-visit-website" href="${site}" rel="nofollow noopener" target="_blank">Website</a>` : ''}</div></div><div class="info-section info-secondary">${phone ? `<div class="phones phone primary">${phone}</div>` : ''}<div class="adr">${addr ? `<div class="street-address">${addr}</div>` : ''}<div class="locality">${loc}</div></div><div class="open-status open now">open now</div></div><div class="snippet"><p class="body"><span>From Business: Fast, friendly, efficient service GUARANTEED!</span></p></div></div></div></div></div>`;
const PAGE = `<html><body><main><div class="search-results organic"><div class="pagination"><p>Showing 1-30 of 1,108</p></div>` +
  CARD('462528116', 'George Brazil Plumbing &amp; Electrical', 'mip_claimed', '(480) 582-1589', '3830 S 38th St', 'Phoenix, AZ 85040', 'https://georgebrazilplumbingelectrical.com/', ['Plumbers', 'Water Softening &amp; Conditioning Equipment &amp; Service', 'Electricians'], 'george-brazil-plumbing-electrical') +
  CARD('9516032', 'Apache Plumbing Services', 'mip_unclaimed', '', '', 'Tempe, AZ 85281', '', ['Plumbers'], 'apache-plumbing-services') +
  `<div class="pagination"><a class="next ajax-page" href="/search?search_terms=plumber&amp;geo_location_terms=Phoenix%2C%20AZ&amp;page=2">Next</a></div></div></main></body></html>`;

const cards = parseCards(PAGE);
check('two cards parsed', cards.length === 2);
const a = cards[0], b = cards[1];
check('ypid + name (entities decoded)', a.ypid === '462528116' && a.name === 'George Brazil Plumbing & Electrical');
check('phone, street, locality split into city/state/zip', a.phone === '(480) 582-1589' && a.street_address === '3830 S 38th St' && a.city === 'Phoenix' && a.state === 'AZ' && a.zip === '85040');
check('website is the direct href', a.website === 'https://georgebrazilplumbingelectrical.com/');
check('categories pipe-joined, decoded', a.categories === 'Plumbers|Water Softening & Conditioning Equipment & Service|Electricians');
check('claimed flag from data-analytics', a.claimed === 'yes' && b.claimed === '');
check('yp_url is absolute without the ?lid tracking', a.yp_url === 'https://www.yellowpages.com/phoenix-az/mip/george-brazil-plumbing-electrical-462528116');
check('snippet stripped of the "From Business:" prefix', a.snippet === 'Fast, friendly, efficient service GUARANTEED!');
check('absent fields are empty strings, not undefined', b.phone === '' && b.website === '' && b.street_address === '' && b.city === 'Tempe' && b.zip === '85281');
check('parseTotal reads the thousands separator', parseTotal(PAGE) === 1108 && parseTotal('<p>no results</p>') === null);
check('empty page → no cards', parseCards('<html><body><p>We found 0 results</p></body></html>').length === 0);
check('searchUrl encodes term/location and omits page=1', searchUrl('plumber', 'Phoenix, AZ', 1) === 'https://www.yellowpages.com/search?search_terms=plumber&geo_location_terms=Phoenix%2C%20AZ' && /&page=3$/.test(searchUrl('a', 'b', 3)));
process.exit(fails ? 1 : 0);
