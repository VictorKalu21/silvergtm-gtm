#!/usr/bin/env node
/* render-fetch.js — web-scrape-triage render rung for sites fetch-sites.js could not read (403 / JS shells that
 * returned 'ok' with empty text). Replaces pull/scrapling-fetch.py for bulk: Scrapling's StealthyFetcher took
 * ~45 s/site (network-idle + challenge solver); Cloudflare's challenge host is blocked from this egress anyway,
 * so the solver buys nothing here. One Chromium, C pages in parallel, domcontentloaded + short settle.
 * Output: owner-render/site_text.jsonl in fetch-sites.js's record shape. Resumable (skips place_ids already written,
 * including those from owner-scrapling/). Usage: NODE_PATH=$(npm root -g) node pull/render-fetch.js [--conc 6] */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const RUN = path.join(__dirname, '..');
const CONC = +(process.argv[process.argv.indexOf('--conc') + 1] || 6) || 6;
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch!=='\r')c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const rows = pc(fs.readFileSync(path.join(RUN, 'leads_scrapling.csv'), 'utf8')).filter(r => r.length > 1);
const H = rows.shift(); const leads = rows.map(r => Object.fromEntries(H.map((h, i) => [h, r[i] ?? ''])));
const OUTD = path.join(RUN, 'owner-render'); fs.mkdirSync(OUTD, { recursive: true });
const OUT = path.join(OUTD, 'site_text.jsonl');
const done = new Set();
for (const f of [OUT, ...fs.readdirSync(path.join(RUN, 'owner-scrapling')).map(x => path.join(RUN, 'owner-scrapling', x))])
  if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split('\n')) if (l.trim()) { try { done.add(JSON.parse(l).place_id); } catch {} }
const queue = leads.filter(l => !done.has(l.place_id));
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, BADM = /\.(png|jpe?g|gif|svg|webp)$|example\.com|sentry|wixpress|domain\.com/i;
const BLOCK = /Attention Required|Just a moment|verify you are human|Access denied|Enable JavaScript and cookies/i;
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
    args: ['--ignore-certificate-errors-spki-list=KnP1OnzHv/y42eRQmbGwoYTHcSJF448m6CU5mdngwKk='] });
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36' });
  await ctx.route('**/*', r => ['image', 'media', 'font'].includes(r.request().resourceType()) ? r.abort() : r.continue());
  let n = 0, ok = 0; const total = queue.length;
  async function one(l) {
    const rec = { place_id: l.place_id, name: l.name, website: l.website, neighborhood: l.neighborhood || '', city: l.city,
      phone: l.phone_number, full_address: l.full_address, source: 'render' };
    const page = await ctx.newPage();
    try {
      let resp = null;
      for (const u of [l.website, l.website.replace(/^https:/, 'http:')]) {
        try { resp = await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 20000 }); if (resp) break; } catch {}
      }
      await page.waitForTimeout(2500);
      const read = async () => [(await page.evaluate(() => document.body ? document.body.innerText : '')), await page.content()];
      let got; try { got = await read(); } catch { await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {}); await page.waitForTimeout(2000); got = await read(); }
      const text = got[0].replace(/\s+/g, ' ').trim().slice(0, 20000), html = got[1];
      const status = resp ? resp.status() : 0;
      const blocked = BLOCK.test(text.slice(0, 400));
      const good = status && status < 400 && text.length >= 200 && !blocked;
      const mails = [...new Set((html.match(EMAIL) || []).map(m => m.toLowerCase()).filter(m => !BADM.test(m)))];
      Object.assign(rec, { status: good ? 'ok' : `home_failed:${status || 'nav'}${blocked ? '_challenge' : ''}`,
        pages: good ? [{ url: page.url(), label: 'home', text }] : [], emails: good ? mails : [],
        emails_by_source: good && mails.length ? { render: mails } : {}, text: good ? `=== home (${page.url()}) ===\n${text}` : '',
        pages_fetched: good ? 1 : 0 });
      if (good) ok++;
    } catch (e) { Object.assign(rec, { status: 'home_failed:' + (e.name || 'err'), pages: [], emails: [], emails_by_source: {}, text: '', pages_fetched: 0 }); }
    finally { await page.close().catch(() => {}); }
    fs.appendFileSync(OUT, JSON.stringify(rec) + '\n');
    if (++n % 25 === 0) console.error(`${n}/${total} ok ${ok}`);
  }
  const q = [...queue];
  await Promise.all(Array.from({ length: CONC }, async () => { while (q.length) await Promise.race([one(q.shift()), new Promise(r => setTimeout(r, 60000))]); }));
  console.error(`DONE ${n}/${total} ok ${ok}`); await browser.close(); process.exit(0);
})();
