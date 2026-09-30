#!/usr/bin/env node
/*
 * email-rank.test.js :: the two stageC ranking fixes, ported into the engine (email-rank.js).
 *
 * FIX (b) own-domain is exact | subdomain | SIBLING. The five pairs below are the live losses
 * from the Atlas Growth 2026-09-16 UK MAPS run — each one a lead whose ONLY address sat on a
 * sibling domain and was therefore dropped as third-party, leaving the row with nothing at all.
 * The reject pins that this stayed a SIBLING test and never became a substring test.
 *
 * FIX (a) person-shape. The four first-name accepts are own-domain owner mailboxes the old rule
 * ranked below `info@`; the two rejects are trading names in a free mailbox that the old rule
 * scored as `first.last` and let beat the company's own inbox. The last case pins the normal
 * `first.last@owndomain` path as UNCHANGED.
 */
const assert = require('assert');
const { ownness, personShape, rankEmails } = require('../email-rank.js');

let pass = 0;
const t = (n, f) => { try { f(); console.log('  ok  ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };

console.log('email-rank :: FIX (b) sibling own-domain');

// the five live sibling losses: root_domain -> the address harvest rejected as other_domain
const SIBLINGS = [
  ['khbpiling.co.uk', 'info@khb-piling.co.uk'],
  ['dc-edney.co.uk', 'enquiries@dcedney.co.uk'],
  ['telforddampproofing.com', 'info@telforddampproofing.co.uk'],
  ['tflower.uk', 'info@tflower.co.uk'],
  ['renlon.co.uk', 'survey@renlon.com'],
];

t('the five live sibling pairs all read as own-domain/sibling', () => {
  for (const [dom, email] of SIBLINGS) {
    assert.strictEqual(ownness(email, dom), 'sibling', `${email} vs ${dom}`);
  }
});

t('a sibling-only lead ends WITH an address instead of nothing', () => {
  for (const [dom, email] of SIBLINGS) {
    const r = rankEmails([[email, 'site']], dom);
    assert.strictEqual(r.length, 1, `${email} was dropped for ${dom}`);
    assert.strictEqual(r[0].email, email);
    assert.strictEqual(r[0].own, true);
    assert.strictEqual(r[0].basis, 'sibling');
  }
});

t('SIBLING, not substring: dampproofing.co.uk does NOT own dampproofingltd.co.uk', () => {
  assert.strictEqual(ownness('info@dampproofingltd.co.uk', 'dampproofing.co.uk'), '');
  assert.strictEqual(ownness('info@dampproofing.co.uk', 'dampproofingltd.co.uk'), '');
  // and the ranker drops it: a third-party, non-free domain off the site is not this mailbox
  assert.deepStrictEqual(rankEmails([['info@dampproofingltd.co.uk', 'site']], 'dampproofing.co.uk'), []);
  // the short-label guard from the same rule
  assert.strictEqual(ownness('info@dampex.com', 'damp.co.uk'), '');
});

t('exact and subdomain still report as before', () => {
  assert.strictEqual(ownness('info@acme.co.uk', 'acme.co.uk'), 'exact');
  assert.strictEqual(ownness('info@mail.acme.co.uk', 'acme.co.uk'), 'subdomain');
  assert.strictEqual(ownness('info@acme.co.uk', ''), '');
  assert.strictEqual(ownness('', 'acme.co.uk'), '');
});

console.log('email-rank :: FIX (a) person shape');

// too tight: a first-name-only mailbox on the company's OWN domain lost to info@
const FIRST_NAME_WINS = [
  ['falconstructural.co.uk', 'jim@falconstructural.co.uk'],
  ['atkinswallcare.co.uk', 'garry@atkinswallcare.co.uk'],
  ['maljon.co.uk', 'jean@maljon.co.uk'],
  ['renlon.co.uk', 'paul@renlon.co.uk'],
];

t('a first-name-only local part is person-shaped', () => {
  for (const [, e] of FIRST_NAME_WINS) assert.ok(personShape(e.split('@')[0]), e);
});

t('the first-name own-domain mailbox now BEATS info@ on the same domain', () => {
  for (const [dom, e] of FIRST_NAME_WINS) {
    // info@ pushed FIRST — it is the row's current pick, so only a higher score can displace it
    const r = rankEmails([['info@' + dom, 'site'], [e, 'site']], dom);
    assert.strictEqual(r[0].email, e, `${e} should beat info@${dom}`);
    assert.strictEqual(r[0].kind, 'person');
    assert.strictEqual(r[0].person.pattern, 'first_name');
    assert.strictEqual(r[1].kind, 'generic');
  }
});

// too loose: a trading name in a free mailbox scored `first.last` and beat the own-domain inbox
const TRADE_NAME_REJECTS = [
  ['bullnosebrickwork.co.uk', 'albion.groundworkers@gmail.com'],
  ['russellpreservation.co.uk', 'russell.pres@btconnect.com'],
];

t('a free-mail trading name is NOT person-shaped', () => {
  for (const [, e] of TRADE_NAME_REJECTS) assert.ok(!personShape(e.split('@')[0]), e);
});

t('the own-domain generic beats the free-mail trading name', () => {
  for (const [dom, e] of TRADE_NAME_REJECTS) {
    // the trading name pushed FIRST, i.e. it is the address the old ranking picked
    const r = rankEmails([[e, 'site'], ['info@' + dom, 'site']], dom);
    assert.strictEqual(r[0].email, 'info@' + dom, `info@${dom} should beat ${e}`);
    assert.strictEqual(r[0].kind, 'generic');
    assert.strictEqual(r[0].own, true);
    const loser = r.find(x => x.email === e);
    assert.strictEqual(loser.kind, 'other');
    assert.strictEqual(loser.own, false);
  }
});

t('the normal first.last@owndomain case is UNCHANGED', () => {
  const dom = 'maljon.co.uk';
  const r = rankEmails([['info@' + dom, 'site'], ['sarah.hughes@' + dom, 'site']], dom);
  assert.strictEqual(r[0].email, 'sarah.hughes@' + dom);
  assert.strictEqual(r[0].kind, 'person');
  assert.strictEqual(r[0].person.pattern, 'first.last');
  assert.strictEqual(r[0].basis, 'exact');
  assert.strictEqual(r[0].score, 33);          // kind 3*10 + ownness 3
});

console.log('email-rank :: score model + gates (unchanged from stageC)');

t('score = kind*10 + ownness, person > generic > other', () => {
  const dom = 'acme.co.uk';
  const r = rankEmails([
    ['supplies@other-supplier.com', 'maps'],       // other, not own, maps  -> 12
    ['info@' + dom, 'site'],                       // generic, own          -> 23
    ['jane.doe@' + dom, 'site'],                   // person, own           -> 33
  ], dom);
  assert.deepStrictEqual(r.map(x => x.score), [33, 23, 12]);
  assert.deepStrictEqual(r.map(x => x.kind), ['person', 'generic', 'other']);
});

t('BAD / THIRD / malformed candidates are dropped', () => {
  const dom = 'acme.co.uk';
  const r = rankEmails([
    ['noreply@' + dom, 'site'], ['careers@' + dom, 'site'],
    ['hello@checkatrade.com', 'site'], ['not-an-email', 'site'], ['', 'site'],
    ['info@' + dom, 'site'], ['INFO@' + dom.toUpperCase(), 'site'],   // dedupe, case-insensitive
  ], dom);
  assert.deepStrictEqual(r.map(x => x.email), ['info@' + dom]);
});

t('a third-party domain off the site is dropped, but a free mailbox and a maps address are kept', () => {
  const dom = 'acme.co.uk';
  assert.deepStrictEqual(rankEmails([['sales@randomsupplier.com', 'site']], dom), []);
  assert.strictEqual(rankEmails([['acmebuilders@gmail.com', 'site']], dom).length, 1);
  assert.strictEqual(rankEmails([['sales@randomsupplier.com', 'maps']], dom).length, 1);
});

t('equal scores keep caller order, so the row CURRENT pick is never displaced', () => {
  const dom = 'acme.co.uk';
  const r = rankEmails([['office@' + dom, 'site'], ['info@' + dom, 'site']], dom);
  assert.strictEqual(r[0].email, 'office@' + dom);
  assert.strictEqual(r[0].score, r[1].score);
});

t('cands accept strings, pairs and objects alike', () => {
  const dom = 'acme.co.uk';
  assert.strictEqual(rankEmails(['info@' + dom], dom)[0].source, 'site');
  assert.strictEqual(rankEmails([{ email: 'info@' + dom, source: 'maps' }], dom)[0].source, 'maps');
  assert.deepStrictEqual(rankEmails([], dom), []);
  assert.deepStrictEqual(rankEmails(null, dom), []);
});

console.log('\nemail-rank :: country tables (IMPROVEMENTS 2026-09-20, Atlas Growth AU run)');
const { isFree, PLACEHOLDER, nameFromLocal } = require('../email-rank.js');

t('.com.au twins are siblings: buildfix.com.au owns info@buildfix.com, and reblocking.com.au owns hello@reblocking.net.au', () => {
  assert.strictEqual(ownness('info@buildfix.com', 'buildfix.com.au'), 'sibling');
  assert.strictEqual(ownness('hello@reblocking.net.au', 'reblocking.com.au'), 'sibling');
  assert.strictEqual(ownness('info@damp.com.au', 'dampex.com.au'), '', 'still a sibling test, never a substring test');
});

t('AU ISP webmail is free ONLY with country au; the UK list is unchanged', () => {
  assert.strictEqual(isFree('stumpy.88@bigpond.com', 'au'), true);
  assert.strictEqual(isFree('assurancerestumping@iinet.net.au', 'au'), true);
  assert.strictEqual(isFree('gplw@westnet.com.au', 'au'), true);
  assert.strictEqual(isFree('stumpy.88@bigpond.com', 'gb'), false);
  assert.strictEqual(isFree('x@btinternet.com', 'au'), true, 'the base FREE list still applies everywhere');
  const r = rankEmails([['stumpy.88@bigpond.com', 'site']], 'centrestaterestumping.com.au', { country: 'au' });
  assert.strictEqual(r.length, 1, 'a one-man restumper keeps his bigpond address');
  assert.strictEqual(rankEmails([['stumpy.88@bigpond.com', 'site']], 'centrestaterestumping.com.au').length, 0, 'without the country it is still third-party');
});

t('site-builder and font-licence placeholders are never a mailbox', () => {
  for (const e of ['example@mysite.com', 'your@email.com', 'mymail@mailservice.com', 'micah@micahrich.com', 'info@indiantypefoundry.com', 'eben@eyebytes.com', 'impallari@gmail.com', 'team@latofonts.com', 'test@test.com', 'support@yourmail.tld', 'name@domain.com']) {
    assert.ok(PLACEHOLDER.test(e), e + ' should be a placeholder');
    assert.deepStrictEqual(rankEmails([[e, 'site']], 'anything.com.au', { keepThirdParty: true }), [], e + ' should be dropped');
  }
  assert.ok(!PLACEHOLDER.test('info@buildfix.com.au') && !PLACEHOLDER.test('dennis@dennisheale.com.au'), 'real addresses pass');
  assert.strictEqual(rankEmails([['jane.doe@acme.co.uk', 'site']], 'acme.co.uk').length, 1, 'a placeholder-shaped local on the lead\'s OWN domain is a real mailbox');
  assert.strictEqual(rankEmails([['jane.doe@gmail.com', 'site']], 'acme.co.uk').length, 0, 'the same local on free-mail is a placeholder');
});

t('the job\'s trade words make first.last a trading name, not a person', () => {
  const tw = ['restumping', 'reblocking', 'underpinning', 'restump', 'reblock'];
  assert.strictEqual(nameFromLocal('goldenstar.reblocking', tw), null);
  assert.strictEqual(nameFromLocal('nextlevel_restumping', tw), null);
  assert.strictEqual(nameFromLocal('oc.restumping', tw), null);
  assert.ok(nameFromLocal('goldenstar.reblocking') !== null, 'without the words the UK list does not know the trade');
  assert.deepStrictEqual(nameFromLocal('jamie.key', tw), { first: 'Jamie', last: 'Key', pattern: 'first.last' });
  const r = rankEmails([['goldenstar.reblocking@gmail.com', 'site'], ['info@goldenstarreblocking.com.au', 'site']], 'goldenstarreblocking.com.au', { country: 'au', tradeWords: tw });
  assert.strictEqual(r[0].email, 'info@goldenstarreblocking.com.au', 'the own-domain inbox beats the free-mail trading name');
});

console.log(`\n${pass}/18 checks passed`);
