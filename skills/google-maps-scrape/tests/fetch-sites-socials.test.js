#!/usr/bin/env node
/* Social profile capture in fetch-sites.js (socialLinks / mergeSocials). The old `links()` skipped
 * every social host, so a lead's own Facebook / Instagram / LinkedIn page was thrown away even though it
 * is where the boolean email searches and the owner read look next. Asserts: each network from raw
 * HTML, share/intent/login/plugin junk and bare roots dropped, LinkedIn only company/in, YouTube only
 * channel forms, facebook pages/ + profile.php kept, m./www. normalised, 2-per-network cap, markdown
 * input (Firecrawl renders) works, merge across pages dedupes, and an end-to-end run against a local
 * server writes `socials` into site_text.jsonl. */
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { spawn } = require('child_process');
const SCRIPT = path.join(__dirname, '..', 'fetch-sites.js');
const { socialLinks, mergeSocials } = require(SCRIPT);
let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };

const HTML = `<html><body>
<a href="https://www.facebook.com/AcmePlumbingAZ/">fb</a>
<a href="https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Facme.com">share</a>
<a href="https://facebook.com/">root</a>
<a href="https://m.facebook.com/pages/Acme-Plumbing/123456789">pages</a>
<a href="https://www.facebook.com/profile.php?id=100064">profile</a>
<a href="https://www.instagram.com/acmeplumbing/?hl=en">ig</a>
<a href="https://www.instagram.com/explore/tags/plumbing/">ig-explore</a>
<a href="https://www.linkedin.com/company/acme-plumbing/about/">li</a>
<a href="https://www.linkedin.com/in/jane-acme-1234/">li-in</a>
<a href="https://www.linkedin.com/shareArticle?mini=true&amp;url=x">li-share</a>
<a href="https://www.linkedin.com/feed/">li-feed</a>
<a href="https://twitter.com/intent/tweet?text=hi">tw-intent</a>
<a href="https://x.com/acmeplumbing">x</a>
<a href="https://www.youtube.com/@AcmePlumbing/videos">yt</a>
<a href="https://www.youtube.com/watch?v=abc123">yt-watch</a>
<a href="https://www.tiktok.com/@acmeplumbing">tt</a>
<a href="https://www.yelp.com/biz/acme-plumbing-phoenix">yelp</a>
<a href="https://www.yelp.com/writeareview/biz/xyz">yelp-review</a>
<a href="https://www.facebook.com/login.php">login</a>
<a href="https://www.facebook.com/AcmePlumbingAZ">fb-dupe</a>
</body></html>`;
const s = socialLinks(HTML);
check('facebook page kept, normalised (no trailing slash, www stripped), deduped', s.facebook && s.facebook[0] === 'https://facebook.com/AcmePlumbingAZ');
check('facebook pages/ and profile.php forms kept, cap of 2 per network', s.facebook.length === 2 && s.facebook[1] === 'https://facebook.com/pages/Acme-Plumbing/123456789');
check('sharer / root / login dropped', !JSON.stringify(s).includes('sharer') && !JSON.stringify(s).includes('login'));
check('instagram handle kept without query; explore dropped', s.instagram && s.instagram.length === 1 && s.instagram[0] === 'https://instagram.com/acmeplumbing');
check('linkedin company (trailing /about stripped) + in; share/feed dropped', s.linkedin && s.linkedin.join(',') === 'https://linkedin.com/company/acme-plumbing,https://linkedin.com/in/jane-acme-1234');
check('x handle kept; twitter intent dropped', s.x && s.x.length === 1 && s.x[0] === 'https://x.com/acmeplumbing');
check('youtube @handle kept; watch dropped', s.youtube && s.youtube.length === 1 && s.youtube[0] === 'https://youtube.com/@AcmePlumbing');
check('tiktok + yelp biz kept; yelp writeareview dropped', s.tiktok[0] === 'https://tiktok.com/@acmeplumbing' && s.yelp.length === 1 && s.yelp[0] === 'https://yelp.com/biz/acme-plumbing-phoenix');
check('no socials → empty object', JSON.stringify(socialLinks('<p>hello</p>')) === '{}');
check('markdown input (Firecrawl) works', socialLinks('Follow us: [Facebook](https://www.facebook.com/AcmePlumbingAZ) and [Instagram](https://instagram.com/acmeplumbing).').instagram[0] === 'https://instagram.com/acmeplumbing');
const merged = mergeSocials([{ facebook: ['https://facebook.com/a'] }, { facebook: ['https://facebook.com/a', 'https://facebook.com/b', 'https://facebook.com/c'] }, { instagram: ['https://instagram.com/x'] }]);
check('mergeSocials dedupes across pages and caps at 2', merged.facebook.join(',') === 'https://facebook.com/a,https://facebook.com/b' && merged.instagram.length === 1);

// --- end-to-end: a local site with a footer link → socials in site_text.jsonl ---
const srv = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<html><body><h1>Acme Plumbing</h1><p>Call us.</p><footer><a href="https://www.facebook.com/AcmePlumbingAZ">Facebook</a><a href="https://www.instagram.com/acmeplumbing/">IG</a></footer></body></html>`); });
srv.listen(0, '127.0.0.1', () => {
  const port = srv.address().port;
  const run = fs.mkdtempSync(path.join(os.tmpdir(), 'fssoc-'));
  fs.writeFileSync(path.join(run, 'owner-prompt.md'), '# prompt\n');
  const csv = path.join(run, 'leads.csv');
  fs.writeFileSync(csv, `place_id,name,website,city,phone_number,full_address,neighborhood\nP1,Acme Plumbing,http://127.0.0.1:${port}/,"Phoenix, AZ",(602) 555-0100,1 Main St,\n`);
  const out = path.join(run, 'owner');
  const child = spawn('node', [SCRIPT, '--in', csv, '--out', out, '--no-retry', '--concurrency', '1'], { env: { ...process.env, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' } });
  let err = ''; child.stderr.on('data', d => err += d);
  child.on('close', code => {
    const f = path.join(out, 'site_text.jsonl');
    const rec = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8').trim().split('\n')[0]) : null;
    check('end-to-end: fetch-sites exits 0 and writes the record', code === 0 && rec && rec.status === 'ok');
    check('end-to-end: socials reach site_text.jsonl', rec && rec.socials && rec.socials.facebook[0] === 'https://facebook.com/AcmePlumbingAZ' && rec.socials.instagram[0] === 'https://instagram.com/acmeplumbing');
    if (!rec) console.log(err.slice(-600));
    srv.close(); fs.rmSync(run, { recursive: true, force: true });
    process.exit(fails ? 1 : 0);
  });
});
