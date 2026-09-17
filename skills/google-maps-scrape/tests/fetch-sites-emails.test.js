#!/usr/bin/env node
/* TDD test for the on-site email harvest in fetch-sites.js (IMPROVEMENTS.md HIGH, 2026-09-17).
 * The old extractor ran a plain regex over htmlToText() output, i.e. AFTER every tag, attribute and
 * <script> block had been deleted, so four whole classes of address were invisible by construction:
 * mailto: hrefs, JSON-LD "email", Cloudflare data-cfemail (XOR hex; the visible text is only the
 * "[email protected]" placeholder) and tag-split / entity-obfuscated forms — and the page they usually
 * live on (contact / get-in-touch) was never fetched, because the default L2 keywords are
 * owner-finding shaped (about / team / meet).
 * Asserts: one fixture per rung over RAW html, provenance per address, the old text rung still
 * works, the junk rejects (a CDN image URL, a data-cfemail-less placeholder, image-extension junk),
 * the > inline-JS-blob defect (must yield enquiries@…, never u003eenquiries@…), the 8 cap,
 * the contact keywords in L2_DEFAULT, and an end-to-end run against a local server proving the
 * contact page is now fetched and emails_by_source reaches site_text.jsonl.
 */
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { spawn } = require('child_process');   // async: a *Sync child would block this process's own server
const SCRIPT = path.join(__dirname, '..', 'fetch-sites.js');
const { extractEmails, emailsIn, mergeEmailSources, cfDecode, cleanEmail, L2_DEFAULT } = require(SCRIPT);
let fails = 0;
const check = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; };
const got = html => extractEmails(html);                       // [{email, source}]
const addrs = html => got(html).map(x => x.email);
const srcOf = (html, email) => (got(html).find(x => x.email === email) || {}).source;

// --- Cloudflare XOR scheme: first byte is the key, the rest is the address ---
const cfEncode = (addr, key) => [key, ...[...addr].map(c => c.charCodeAt(0) ^ key)]
  .map(b => b.toString(16).padStart(2, '0')).join('');
const CF_HEX = cfEncode('sales@piledsolutions.co.uk', 0x5b);   // a real-shaped value, encoded here
check('cfDecode round-trips the XOR scheme', cfDecode(CF_HEX) === 'sales@piledsolutions.co.uk');
check('cfDecode rejects rubbish hex', cfDecode('zz') === null && cfDecode('5b28') === null && cfDecode('') === null);

// --- rung 1: mailto: href (an attribute — the tag is gone before htmlToText's regex runs) ---
const MAILTO = `<html><body><a class="em" href="mailto:info@khbpiling.co.uk?subject=Quote%20please">Email us</a>
  <a href="MAILTO:%20Enquiries@khbpiling.co.uk">and again</a></body></html>`;
check('mailto: href is found, lowercased, query string stripped', addrs(MAILTO).includes('info@khbpiling.co.uk'));
check('mailto: is case/percent tolerant and deduped', addrs(MAILTO).includes('enquiries@khbpiling.co.uk') && addrs(MAILTO).length === 2);
check('mailto provenance', srcOf(MAILTO, 'info@khbpiling.co.uk') === 'mailto');

// --- rung 2: JSON-LD, nested under contactPoint (inside <script>, which htmlToText deletes) ---
const JSONLD = `<html><head><script type="application/ld+json">
{"@context":"https://schema.org","@graph":[{"@type":"LocalBusiness","name":"South West Underpinning",
 "contactPoint":[{"@type":"ContactPoint","telephone":"+44 1179 000000","email":"office@southwestunderpinning.co.uk"}]}]}
</script></head><body><h1>Underpinning</h1></body></html>`;
check('JSON-LD email nested under contactPoint/@graph is found', addrs(JSONLD).includes('office@southwestunderpinning.co.uk'));
check('jsonld provenance', srcOf(JSONLD, 'office@southwestunderpinning.co.uk') === 'jsonld');
const JSONLD_BAD = `<script type="application/ld+json">{"@type":"Org", "email": "hi@brokenld.co.uk",}</script>`;
check('malformed JSON-LD falls back to the key pattern', addrs(JSONLD_BAD).includes('hi@brokenld.co.uk'));

// --- rung 3: Cloudflare data-cfemail (the visible text is only the placeholder) ---
const CFEMAIL = `<html><body><a href="/cdn-cgi/l/email-protection" class="__cf_email__"
  data-cfemail="${CF_HEX}">[email&#160;protected]</a></body></html>`;
check('data-cfemail decodes to the real address', addrs(CFEMAIL).includes('sales@piledsolutions.co.uk'));
check('cfemail provenance', srcOf(CFEMAIL, 'sales@piledsolutions.co.uk') === 'cfemail');
check('the /cdn-cgi/l/email-protection#hex link form decodes too',
  addrs(`<a href="/cdn-cgi/l/email-protection#${CF_HEX}">email</a>`).includes('sales@piledsolutions.co.uk'));

// --- rung 4: tag-split / entity-obfuscated forms ---
check('&#64; entity form', addrs(`<p>Email: sales&#64;khbpiling.co.uk</p>`).includes('sales@khbpiling.co.uk'));
check('[at] form', addrs(`<p>hello [at] tflower.co.uk</p>`).includes('hello@tflower.co.uk'));
check('(at) form', addrs(`<p>survey (at) renlon.com</p>`).includes('survey@renlon.com'));
check('<span>@</span> split', addrs(`<p>info<span>@</span>renlon.co.uk</p>`).includes('info@renlon.co.uk'));
check('zero-width chars inside the address', addrs(`<p>info​@ren‌lon.co.uk</p>`).includes('info@renlon.co.uk'));
check('tag_split provenance', srcOf(`<p>info<span>@</span>renlon.co.uk</p>`, 'info@renlon.co.uk') === 'tag_split');

// --- the > defect: a match over an inline JS blob swallowed the escape body ---
const JSBLOB = `<script>window.__DATA__={"html":"\\u003cp\\u003eenquiries@dcedney.co.uk\\u003c/p\\u003e"};</script>`;
check('inline-JS blob yields the address, not u003eenquiries@…',
  addrs(JSBLOB).includes('enquiries@dcedney.co.uk') && !addrs(JSBLOB).some(e => /^u00[0-9a-f]{2}/.test(e)));

// --- rung 5: the old text regex still works, and is still reachable on text-only input ---
check('plain visible address is still kept', addrs(`<p>Contact: hello@acme.co.uk</p>`).includes('hello@acme.co.uk'));
check('emailsIn (the text rung) is unchanged on plain text',
  emailsIn('write to hello@acme.co.uk or Office@Acme.co.uk.').join() === 'hello@acme.co.uk,office@acme.co.uk');
check('the text rung takes a pre-stripped text when the caller already has one (no second strip)',
  extractEmails('<!-- nothing in the html -->', 'ring us or write to office@acme.co.uk')
    .map(x => x.email + ':' + x.source).join() === 'office@acme.co.uk:text');
check('emailsIn keeps the old junk rejects',
  emailsIn('a@sentry.io b@example.com c@wixpress.com d@godaddy.com e@squarespace.com logo@2x.png').length === 0);

// --- negatives: neither of these may be kept ---
const CDN = `<html><body><img src="https://cdn.shopify.com/s/files/1/logo/info@2x.png?v=1">
  <img srcset="https://d1abcd.cloudfront.net/assets/info@3x.jpg 3x"></body></html>`;
check('an info@ inside a CDN image URL is rejected', addrs(CDN).length === 0);
const PLACEHOLDER = `<html><body><a href="/cdn-cgi/l/email-protection" class="__cf_email__">[email&#160;protected]</a>
  <span>[email protected]</span></body></html>`;
check('a bare [email protected] with no data-cfemail yields nothing', addrs(PLACEHOLDER).length === 0);
check('vendor/placeholder hosts stay rejected',
  addrs(`<a href="mailto:you@yourdomain.com">x</a><a href="mailto:me@example.com">y</a>`).length === 0);

// --- provenance priority + the cap (mailto > jsonld > cfemail > tag_split > text) ---
const SAME = `<p>info@acme.co.uk</p><script type="application/ld+json">{"@type":"Org","email":"info@acme.co.uk"}</script>
  <a href="mailto:info@acme.co.uk">mail</a>`;
check('an address found by several rungs is labelled by the highest-priority one',
  got(SAME).length === 1 && srcOf(SAME, 'info@acme.co.uk') === 'mailto');
const many = Array.from({ length: 12 }, (_, i) => `<a href="mailto:p${i}@acme.co.uk">x</a>`).join('');
const merged = mergeEmailSources([extractEmails(many)]);
check('cap stays at 8', merged.emails.length === 8 && merged.emails[0] === 'p0@acme.co.uk');
check('emails_by_source covers exactly the capped addresses',
  Object.keys(merged.by_source).length === 8 && merged.by_source['p0@acme.co.uk'] === 'mailto');
const cross = mergeEmailSources([
  [{ email: 'info@acme.co.uk', source: 'text' }],
  [{ email: 'info@acme.co.uk', source: 'mailto' }, { email: 'sales@acme.co.uk', source: 'cfemail' }],
]);
check('across pages the better source wins the label, discovery order is kept',
  cross.emails.join() === 'info@acme.co.uk,sales@acme.co.uk' && cross.by_source['info@acme.co.uk'] === 'mailto');
check('cleanEmail strips mailto:, punctuation and wrapping', cleanEmail('  <MAILTO:Info@Acme.co.uk>,  ') === 'info@acme.co.uk');

// --- the contact page is now a default second-level target ---
for (const k of ['contact', 'contact-us', 'get-in-touch', 'enquir']) check(`L2_DEFAULT contains "${k}"`, L2_DEFAULT.includes(k));
for (const k of ['about', 'team', 'meet', 'our-team']) check(`L2_DEFAULT still contains "${k}"`, L2_DEFAULT.includes(k));

// --- end to end against a local server: the contact page is fetched, provenance is written out ---
const PAGES = {
  '/': `<html><body><h1>KHB Piling</h1><a href="/contact-us">Get in touch</a>
    <a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="${CF_HEX}">[email&#160;protected]</a></body></html>`,
  '/contact-us': `<html><body><a href="mailto:info@khbpiling.co.uk">Email</a><p>accounts@khbpiling.co.uk</p></body></html>`,
};
const server = http.createServer((req, res) => {
  const body = PAGES[req.url.split('?')[0]];
  res.writeHead(body ? 200 : 404, { 'content-type': 'text/html' });
  res.end(body || 'no');
});
server.listen(0, '127.0.0.1', () => {
  const base = 'http://127.0.0.1:' + server.address().port;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fsemails-'));
  fs.writeFileSync(path.join(tmp, 'leads.csv'), 'place_id,name,website\nL1,KHB Piling,' + base + '/\n');
  const child = spawn(process.execPath, [SCRIPT, '--in', path.join(tmp, 'leads.csv'), '--out', tmp, '--no-prompt-ok', '--no-retry'], { stdio: 'pipe' });
  child.on('close', () => {
    const rec = JSON.parse(fs.readFileSync(path.join(tmp, 'site_text.jsonl'), 'utf8').trim().split('\n')[0]);
    check('e2e: the contact page is fetched by default', rec.pages_fetched === 2 && rec.pages.some(p => /contact-us/.test(p.url)));
    check('e2e: emails is still a flat array of addresses',
      Array.isArray(rec.emails) && rec.emails.every(e => typeof e === 'string') &&
      rec.emails.includes('sales@piledsolutions.co.uk') && rec.emails.includes('info@khbpiling.co.uk') &&
      rec.emails.includes('accounts@khbpiling.co.uk'));
    check('e2e: emails_by_source carries the rung per address',
      rec.emails_by_source['sales@piledsolutions.co.uk'] === 'cfemail' &&
      rec.emails_by_source['info@khbpiling.co.uk'] === 'mailto' &&
      rec.emails_by_source['accounts@khbpiling.co.uk'] === 'tag_split');
    fs.rmSync(tmp, { recursive: true, force: true });
    server.close();
    process.exit(fails ? 1 : 0);
  });
});
