#!/usr/bin/env node
/*
 * email-rank.js :: THE one place the engine decides which address is a lead's best address.
 *
 * WHY THIS EXISTS. Until now the engine had no single ranking point: the scoring lived in a
 * per-job "stageC" script, so every fix to it died with the run folder. Two of those fixes are
 * ported here (IMPROVEMENTS.md, both MEDIUM, both found on the Atlas Growth 2026-09-16 UK MAPS
 * run; the job-side original is that run's `rerank_emails.py`):
 *
 *  FIX (b) — SIBLING DOMAINS COUNT AS OWN-DOMAIN. stageC's own-domain test was
 *  exact-or-subdomain, so a hyphen variant or a .com/.co.uk twin — routine on UK trade sites,
 *  where the Maps website and the mailbox domain are registered separately — read as a
 *  third-party domain and was dropped outright. On a lead whose ONLY address is that sibling the
 *  row ended with nothing at all (10 leads on that run):
 *      khbpiling.co.uk         -> info@khb-piling.co.uk
 *      dc-edney.co.uk          -> enquiries@dcedney.co.uk
 *      telforddampproofing.com -> info@telforddampproofing.co.uk
 *      tflower.uk              -> info@tflower.co.uk
 *      renlon.co.uk            -> survey@renlon.com
 *  Two domains are the same company when their SECOND-LEVEL LABEL matches after hyphens are
 *  stripped, both public suffixes are in SAME_COMPANY_TLD, and the label is >= 4 chars. It is a
 *  SIBLING test, never a substring test — or `damp.co.uk` starts owning `dampex.com`, and
 *  `dampproofing.co.uk` starts owning `dampproofingltd.co.uk`. The public-suffix split comes from
 *  `rootDomain()` in shared-hosts.js (it already knows to keep 3 labels for a co.uk-style
 *  suffix), so there is ONE public-suffix table in this skill, not two.
 *
 *  FIX (a) — PERSON-SHAPE, NARROWED AND WIDENED. stageC called any dotted/separated local part
 *  `first.last`, which was wrong in both directions:
 *    too loose — a company's own trade name in a free mailbox outranked its own inbox:
 *      BullNose Brickwork    albion.groundworkers@gmail.com  beat  the own-domain inbox
 *      Russell Preservation  russell.pres@btconnect.com      beat  info@russellpreservation.co.uk
 *    too tight — a separator was REQUIRED, so a first-name-only mailbox on the company's own
 *    domain scored `other` and lost to `info@`: `jim@falconstructural.co.uk`,
 *    `garry@atkinswallcare.co.uk`, `jean@maljon.co.uk`, `paul@…` — the best owner-outreach
 *    addresses on the list.
 *  Two narrow rules, no new scoring dimension: a separated local is person-shaped only when the
 *  SECOND token is not a trade/company word and neither token is a generic mailbox word; and a
 *  single-token local that is a common first name is person-shaped.
 *
 * SCORE MODEL (unchanged from stageC): score = kind*10 + ownness, with
 *   kind    person 3 > generic 2 > other 1
 *   ownness own-domain (exact | subdomain | sibling) 3 > came from the Maps record 2 > 1
 * and the same gate: a third-party, non-free domain scraped off the site is not this business's
 * mailbox. Sorting is STABLE, so among equal scores the order the caller pushed candidates in
 * wins — push the row's CURRENT pick first and an equal-scoring address can never displace it.
 *
 * API
 *   ownness(email, rootDom)   -> '' | 'exact' | 'subdomain' | 'sibling'   (arg 1: address or bare domain)
 *   personShape(local)        -> boolean
 *   nameFromLocal(local)      -> {first, last, pattern} | null
 *   rankEmails(cands, rootDom[, opts]) -> [{email, local, domain, kind, own, basis, source, person, score}]
 *                                         sorted best-first
 *   cands accepts 'a@b.com' | ['a@b.com','maps'] | {email:'a@b.com', source:'maps'}; default source 'site'.
 */
const { hostOf, rootDomain } = require('./shared-hosts');

// ---------------------------------------------------------------------------
// stageC's accept rules, verbatim
// ---------------------------------------------------------------------------
const GENERIC_GOOD = ['info', 'enquiries', 'enquiry', 'hello', 'sales', 'office', 'admin', 'contact',
  'mail', 'enquire', 'email', 'hi', 'estimates', 'quotes', 'quote', 'team'];
const BAD = /noreply|no-reply|donotreply|privacy|webmaster|postmaster|abuse|jobs|careers|recruit|hr@|accounts|invoice|payroll|unsubscribe|example|sentry|wixpress|godaddy|squarespace|@.*\.(png|jpg|gif|webp|svg)$|dpo@|gdpr|complaints|press@|marketing@|newsletter/i;
const THIRD = /checkatrade|trustatrader|ratedpeople|mybuilder|yell\.com|facebook|google|nhs\.uk|gov\.uk|\.ac\.uk|fmb\.org|which\.co|trustpilot|houzz|bark\.com|linkedin|fensa|gassafe|nicieic|trustmark/i;
const FREE = /@(gmail|googlemail|hotmail|outlook|yahoo|live|aol|icloud|me|btinternet|btconnect|sky|talktalk|virginmedia|ntlworld|blueyonder|hotmail\.co|yahoo\.co|mail|protonmail|msn)\./i;
// Per-country ISP webmail on top of FREE (2026-09-20 AU run: a one-man restumper's stumpy.88@bigpond.com was
// dropped as "a third-party domain scraped off the site"). Keyed by the job's geo.country; `gb` is FREE alone.
const FREE_BY_COUNTRY = {
  au: /@(bigpond|optusnet|iinet|tpg|westnet|internode|dodo|adam|ozemail|y7mail|exemail|aapt|iprimus|primus|netspace|optushome|people|live|yahoo|hotmail|outlook)\.(com\.au|net\.au|com|net)$/i,
};
function isFree(email, country) {
  const e = String(email || '').toLowerCase();
  if (FREE.test('@' + e.slice(e.lastIndexOf('@') + 1) + '.')) return true;
  const r = FREE_BY_COUNTRY[String(country || '').toLowerCase()];
  return !!(r && r.test(e));
}
// Site-builder and CSS-font-licence placeholders the raw-HTML harvest picks up (9% of the 2026-09-20 AU
// harvest): never a mailbox, whatever domain they sit on.
const PLACEHOLDER_DOMAIN = /@(mysite|email|mailservice|example|domain|yourdomain|yourmail|company|website|test|micahrich|indiantypefoundry|eyebytes|fontspring|myfonts|fonts|typekit|latofonts|impallari|fontsquirrel|pixelspread|dafont|fontshare)\.(com|net|org|io|tld)$|\.tld$/i;
// a placeholder LOCAL part (name@, your@, john.doe@ ...) only counts on a domain that is not the lead's own —
// jane.doe@acme.co.uk on acme.co.uk is a real mailbox
const PLACEHOLDER_LOCAL = /^(email|name|yourname|your|user|username|firstname|lastname|johndoe|john\.doe|jane\.doe|test|mymail|example|someone|impallari)@/i;
const PLACEHOLDER = new RegExp(PLACEHOLDER_DOMAIN.source + '|' + PLACEHOLDER_LOCAL.source, 'i');
const SHAPE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const GENERIC_ALL = new Set([...GENERIC_GOOD,
  'accounts', 'support', 'service', 'services', 'help', 'bookings', 'booking', 'orders', 'office',
  'reception', 'customerservice', 'customer', 'general', 'main', 'post', 'web', 'site', 'director',
  'manager', 'md', 'boss', 'owner', 'company', 'business', 'work', 'home', 'me', 'you', 'us']);

// ---------------------------------------------------------------------------
// FIX (a) — trade/company words, and a compact common-first-name list
// ---------------------------------------------------------------------------
// A second token from this set means the local part is a trading name, not a surname.
const TRADE = new Set(`
groundwork groundworks groundworker groundworkers pres preservation preservations preserve damp
damps dampproofing proofing proof proofers waterproofing waterproof waterproofers tanking ltd ltds
limited llp plc co company companies services service servicing building buildings builders builder
build construction constructions contractors contractor contracting piling piles pile underpinning
underpin basement basements remedial remedials treatment treatments solutions solution systems
system uk gb group groups property properties maintenance repair repairs roofing plastering plaster
plasterers survey surveys surveying surveyors structural structures structure homes interiors
developments development projects project install installs installation installations specialists
specialist timber woodworm rot drainage drains concrete brickwork masonry joinery decorating
cleaning scaffolding excavation excavations demolition landscaping insulation ventilation
engineering engineers engineer consultancy consultants consulting trades trade works restoration
renovation renovations foundation foundations crack cracks subsidence mini civils civil
groundworkltd enquiries estimating estimates
`.trim().split(/\s+/));
// long trade words are also caught INSIDE a token ('anglianpreservation', 'jpddampproofing')
const TRADE_SUBSTR = [...TRADE].filter(w => w.length >= 6);
// a token ending in a company suffix is a company word whatever its stem ('jpdltd', 'abcuk')
const TRADE_SUFFIX = ['ltd', 'limited', 'llp', 'plc'];

const FIRST_NAMES = new Set(`
aaron abbie abby abdul abigail adam adrian aidan aiden ailsa aimee alan alanna albert alec alex
alexander alexandra alfie alfred ali alice alicia alise alison alistair allan allen alun amanda
amber amelia amy ana andrea andrew andy angela angus anita ann anna anne annette annie anthony
antony april archie arthur ash ashleigh ashley aaronson aidy barbara barry beatrice becky belinda
ben benjamin bernard bernadette beth bethan bethany bev beverley bill billy bob bobby bonnie brad
bradley brendan brett brian bruce bryan bryn callum calum cameron campbell carl carla carol
caroline carolyn carrie casey catherine cathy cerys charles charlie charlotte chelsea cheryl chris
christian christine christopher cindy claire clare clark claude clayton clifford clive
colin colleen connor conor craig curtis cyril daisy dale damian damien dan dana daniel danielle
danny darren darryl dave david dawn dean debbie deborah declan dee denis dennis derek des diana
diane dianne dick dominic don donald donna doreen doug douglas duncan dylan eamon ed eddie eddy
edward eileen elaine eleanor elizabeth ella ellen elliot elliott ellie emily emma eric erica
ernest esther ethan eugene eve evelyn ewan faye felicity fergus fiona frances francesca francis
frank fraser fred freddie frederick gabriel gail gareth garry gary gavin gemma gene geoff geoffrey
george georgia georgina gerald gerard geraldine gerry gill gillian glen glenn gloria godfrey
gordon grace graeme graham grant greg gregory guy gwen hannah harold harriet harry hayley hazel
heather heidi helen henry hilary holly howard hugh hugo iain ian imogen ines irene isaac isabel
isla ivan jack jackie jacob jacqueline jade jake james jamie jan jane janet janice jared jasmine
jason jay jayne jean jeff jeffrey jemma jenna jennifer jenny jeremy jerry jess jessica jill jim
jimmy jo joan joanna joanne jodie joe joel john johnny jon jonathan jonny jordan joseph josephine
josh joshua joy joyce judith judy julia julian julie justin karen karl kate katherine kathleen
kathryn kathy katie katy kay kayleigh keith kelly kelsey ken kenneth kerry kevin kieran kim
kimberley kirsty kris kristian krystal kyle lance larry laura lauren lawrence lee leigh leo leon
lesley leslie lewis liam libby lily linda lindsay lindsey lisa liz lloyd logan lois lorna lorraine
louis louise lucas lucy luke lydia lyn lynda lynn lynne maggie malcolm mandy marc marcus margaret
maria marian marie marilyn mario marion mark marlene martin martyn mary mason matt matthew maureen
maurice max maxine may megan mel melanie melissa mia michael michaela michelle mick mike mikey
miles millie miranda mitch mitchell mohammed molly monica morgan murray nadine naomi natalie
natasha nathan neil nia nicholas nick nicky nicola nicole nigel nina noel norman oliver olivia
ollie omar oscar owen paddy paige pam pamela pat patricia patrick paul paula pauline pete peter
philip phillip phoebe phil rachel rachael ralph ray raymond rebecca reece rhys ricardo richard
rick ricky rita rob robbie robert roberta robin rod roderick rodney roger roland ron ronald rory
rosalind rose rosemary ross rowan roy ruby russell ruth ryan sadie sally sam samantha samuel
sandra sandy sara sarah scott sean sebastian selina shane shannon sharon shaun shauna sheila
shelley shirley sian sid sidney simon sonia sophia sophie stacey stan stanley stephanie stephen
steve steven stewart stuart sue susan susie suzanne sylvia tania tanya tara ted terence terry tess
theresa thomas tim timothy tina tobias toby todd tom tommy tony tracey tracy travis trevor trish
troy tyler val valerie vanessa vaughan vera vicki vicky victor victoria vincent vivien wade walter
warren wayne wendy wes wesley will william willie yvonne zac zach zachary zoe
`.trim().split(/\s+/));

function isTradeToken(t, extra) {
  if (TRADE.has(t)) return true;
  if (t.length > 4 && TRADE_SUFFIX.some(s => t.endsWith(s))) return true;
  if (TRADE_SUBSTR.some(w => t.includes(w))) return true;
  // the job's own trade vocabulary (config site_l2_keywords: restumping, reblocking, underpinning ...) —
  // exact token, or inside the token when the word is >= 6 chars ('goldenstar.reblocking', 'nextlevel_restumping')
  for (const w of (extra || [])) { const x = String(w).toLowerCase(); if (t === x || (x.length >= 6 && t.includes(x))) return true; }
  return false;
}

/** stageC's name_from_local WITH FIX (a). -> {first, last, pattern} | null */
function nameFromLocal(local, extra) {
  const l = String(local || '').toLowerCase();
  if (!l || GENERIC_ALL.has(l) || /\d{3,}/.test(l)) return null;
  const title = s => s.charAt(0).toUpperCase() + s.slice(1);

  let m = l.match(/^([a-z]{2,})[._-]([a-z]{2,})$/);          // first.last / first_last / first-last
  if (m) {
    const [, a, b] = m;
    if (GENERIC_ALL.has(a) || GENERIC_ALL.has(b)) return null;
    // FIX (a): 'albion.groundworkers', 'russell.pres', 'lisa.jpdltd' are TRADING names
    if (isTradeToken(b, extra) || isTradeToken(a, extra)) return null;
    return { first: title(a), last: title(b), pattern: 'first.last' };
  }
  m = l.match(/^([a-z])[._-]([a-z]{3,})$/);                  // f.last (separator REQUIRED)
  if (m && !GENERIC_ALL.has(m[2]) && !isTradeToken(m[2], extra)) {
    return { first: m[1].toUpperCase() + '.', last: title(m[2]), pattern: 'f.last' };
  }
  // FIX (a), the other direction: a first-name-only mailbox is the best outreach address there is
  if (/^[a-z]{2,}$/.test(l) && FIRST_NAMES.has(l)) return { first: title(l), last: '', pattern: 'first_name' };
  return null;
}

/** Is this local part a person, not a mailbox or a trading name? */
function personShape(local) { return nameFromLocal(local) !== null; }

// ---------------------------------------------------------------------------
// FIX (b) — sibling-domain normalisation
// ---------------------------------------------------------------------------
// Public suffixes a business plausibly twins across. A suffix rootDomain() does not know as a
// two-level suffix (me.uk) falls back to a 2-label root, which yields a <4-char label and is
// rejected by the length rule — it fails CLOSED (a missed sibling, never a false one).
const SAME_COMPANY_TLD = new Set(['co.uk', 'com', 'uk', 'net', 'org', 'org.uk', 'me.uk', 'ltd.uk',
  'plc.uk', 'net.uk', 'biz', 'eu', 'london', 'co', 'info', 'company', 'services',
  'com.au', 'net.au', 'org.au', 'au', 'id.au']);   // AU twins (2026-09-20 AU run): buildfix.com.au owns info@buildfix.com

/** 'www.khb-piling.co.uk' -> {label:'khb-piling', suffix:'co.uk'} — public suffix via shared-hosts. */
function splitDomain(d) {
  const root = rootDomain(hostOf(d) || String(d || '').toLowerCase().trim().replace(/^\.+|\.+$/g, ''));
  if (!root || !root.includes('.')) return { label: '', suffix: '' };
  const i = root.indexOf('.');
  return { label: root.slice(0, i), suffix: root.slice(i + 1) };
}
/** the comparable second-level label: lowercase, hyphens and every other separator stripped */
function sldKey(d) { return splitDomain(d).label.replace(/[^a-z0-9]/g, ''); }

/** '' | 'exact' | 'subdomain' | 'sibling'. Arg 1 is an address or a bare domain. */
function ownness(email, rootDom) {
  const raw = String(email || '').toLowerCase().trim();
  const edom = (raw.includes('@') ? raw.slice(raw.lastIndexOf('@') + 1) : raw).replace(/^www\./, '').replace(/\.+$/, '');
  const dom = String(rootDom || '').toLowerCase().trim().replace(/^www\./, '').replace(/\.+$/, '');
  if (!dom || !edom) return '';
  if (edom === dom) return 'exact';
  if (edom.endsWith('.' + dom) || dom.endsWith('.' + edom)) return 'subdomain';
  const ka = sldKey(edom), kb = sldKey(dom);
  // SIBLING, not substring: the whole second-level label must match, and be long enough that a
  // generic trade word ('damp') cannot own an unrelated firm ('dampex').
  if (ka && ka === kb && ka.length >= 4) {
    const sa = splitDomain(edom).suffix, sb = splitDomain(dom).suffix;
    if (SAME_COMPANY_TLD.has(sa) && SAME_COMPANY_TLD.has(sb)) return 'sibling';
  }
  return '';
}

// ---------------------------------------------------------------------------
// ranking — stageC's score, with ownness from FIX (b) and kind from FIX (a)
// ---------------------------------------------------------------------------
function normCand(c) {
  if (Array.isArray(c)) return { email: c[0], source: c[1] || 'site' };
  if (c && typeof c === 'object') return { email: c.email, source: c.source || 'site' };
  return { email: c, source: 'site' };
}

/**
 * Rank every candidate address for one lead, best first.
 * @param {Array} cands  'a@b.com' | ['a@b.com','maps'] | {email,source}
 * @param {string} rootDom  the lead's root domain ('' when it has no site of its own)
 * @param {object} [opts]  {keepThirdParty:true} disables the third-party-off-the-site gate;
 *                         {country:'au'} adds that country's ISP webmail to the free-mail set;
 *                         {tradeWords:[...]} the job's trade vocabulary, so 'goldenstar.reblocking' is not a person
 */
function rankEmails(cands, rootDom, opts = {}) {
  const seen = new Set(), ranked = [];
  const extra = (opts.tradeWords || []).map(w => String(w).toLowerCase());
  for (const c of (cands || [])) {
    const { email: e0, source } = normCand(c);
    const e = String(e0 || '').trim().toLowerCase();
    if (!e || seen.has(e) || BAD.test(e) || PLACEHOLDER_DOMAIN.test(e) || THIRD.test(e) || !SHAPE.test(e)) continue;
    seen.add(e);
    const at = e.lastIndexOf('@');
    const local = e.slice(0, at), edom = e.slice(at + 1);
    const basis = ownness(e, rootDom);
    if (!basis && PLACEHOLDER_LOCAL.test(e)) continue;   // name@ / your@ / john.doe@ off the lead's own domain
    const own = !!basis;
    const free = isFree(e, opts.country);
    // a 3rd-party, non-free domain scraped off the site is not this business's mailbox
    if (!own && !free && source === 'site' && !opts.keepThirdParty) continue;
    const person = nameFromLocal(local, extra);
    const kind = person ? 'person' : (GENERIC_ALL.has(local) ? 'generic' : 'other');
    const score = (person ? 3 : kind === 'generic' ? 2 : 1) * 10 + (own ? 3 : source === 'maps' ? 2 : 1);
    ranked.push({ email: e, local, domain: edom, kind, own, basis, source, person, score });
  }
  // STABLE: equal scores keep caller order, so the row's current pick (pushed first) holds.
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

module.exports = {
  ownness, personShape, nameFromLocal, rankEmails, isFree, FREE_BY_COUNTRY, PLACEHOLDER, PLACEHOLDER_DOMAIN, PLACEHOLDER_LOCAL,
  splitDomain, sldKey, isTradeToken,
  GENERIC_GOOD, GENERIC_ALL, TRADE, FIRST_NAMES, SAME_COMPANY_TLD, BAD, THIRD, FREE, SHAPE,
};
