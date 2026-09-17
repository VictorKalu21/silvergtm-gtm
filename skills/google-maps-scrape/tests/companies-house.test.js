#!/usr/bin/env node
/* Tests the PURE matching half of companies-house.js — the script calls a live API, so nothing here
 * may touch the network: the module is required behind its `require.main` guard (so the argv parse,
 * the .env read and every https call stay unreached) and `https.get` is booby-trapped to prove it.
 *
 * Covers the two 2026-09-17 IMPROVEMENTS entries:
 *   - city-only acceptance is DEMOTED to low_confidence + demoted_reason (postcode and overlap>=0.9
 *     acceptances, including overlap+city together, stay `matched`);
 *   - normalised-title equality accepts BEFORE the overlap score, `&` is normalised in the
 *     tokeniser, and a lead with no postcode can be confirmed on its town.
 */
const https = require('https');
let netCalls = 0; const realGet = https.get;
https.get = function () { netCalls++; throw new Error('companies-house.test.js made a NETWORK CALL'); };
const CH = require('../companies-house.js');
https.get = realGet;
let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };

const co = (title, o = {}) => Object.assign({ title, company_number: o.num || '10000001', company_status: o.status || 'active', address_snippet: o.snippet || '', address: o.address || {} }, {});
const lead = (o) => Object.assign({ place_id: 'P1', name: 'Welba Construction Ltd.', full_address: '', city: '' }, o);

// ---- 1. acceptance basis: postcode / overlap>=0.9 / city-only -------------------------------------
const PC = lead({ name: 'Acme Damp Proofing', full_address: '4 Mill Road, Bolton, BL1 2AB', city: 'Bolton' });
const pcRec = CH.matchRecord(PC, [co('ACME DAMP PROOFING SOLUTIONS LTD', { num: '11110001', snippet: '9 Trade Park, Bolton, BL1 2AB' })]).rec;
check('postcode-confirmed stays matched', pcRec.matched === true && pcRec.confidence === 'matched' && pcRec.match_basis === 'postcode' && !pcRec.demoted_reason);
check('postcode record keeps its existing fields', pcRec.ch_company === 'ACME DAMP PROOFING SOLUTIONS LTD' && pcRec.ch_number === '11110001' && pcRec.ch_status === 'active' && pcRec.match_postcode === true && pcRec.lead_postcode === 'BL12AB' && typeof pcRec.name_overlap === 'number');

// word-order variant: overlap 1.0 but NOT a normalised-title equality, so this is the overlap path
const OV = lead({ name: 'Piling Bolton', full_address: '2 Foundry Lane, Bolton', city: 'Bolton' });
const ovRec = CH.matchRecord(OV, [co('BOLTON PILING LIMITED', { num: '11110002', snippet: '2 Foundry Lane, Bolton, BL3 9ZZ' })]).rec;
check('overlap>=0.9 WITH a city hit stays matched (must not demote with the rest)', ovRec.matched === true && ovRec.confidence === 'matched' && ovRec.match_basis === 'name_overlap' && ovRec.match_city === true && ovRec.name_overlap >= 0.9);

const CITY = lead({ name: 'Perlini Damp Proofing', full_address: '7 Bridge St, Leeds', city: 'Leeds' });
const cityRec = CH.matchRecord(CITY, [co('ABOVEWATER DAMP PROOFING LTD', { num: '11110003', snippet: '30 Kirkgate, Leeds, LS1 1AA' })]).rec;
check('city-only becomes low_confidence with demoted_reason city_only', cityRec.matched === true && cityRec.confidence === 'low_confidence' && cityRec.demoted_reason === 'city_only' && cityRec.match_basis === 'city_only');
check('demotion is a LABEL, not a drop — company + officers still reach the reader', cityRec.ch_company === 'ABOVEWATER DAMP PROOFING LTD' && cityRec.ch_number === '11110003' && cityRec.match_city === true && cityRec.match_postcode === false);

// a town name that is only a substring of the snippet must still not promote on its own
const cityOnlyDecision = CH.classify({ active: true, pcMatch: false, cityMatch: true, titleEq: false, townMatch: false, containsAll: false, ov: 0.5 });
check('classify(): cityMatch alone never returns confidence matched', cityOnlyDecision.accept === true && cityOnlyDecision.confidence === 'low_confidence' && cityOnlyDecision.demoted_reason === 'city_only');
check('classify(): an INACTIVE company is never accepted', CH.classify({ active: false, pcMatch: true, cityMatch: true, titleEq: true, ov: 1 }).accept === false);

// ---- 2. normalised-title equality + `&` in the tokeniser ------------------------------------------
const W = lead({ name: 'Welba Construction Ltd.', full_address: 'Unit 2, Trading Estate', city: '' }); // no postcode, no city: title equality is the ONLY basis
const wRec = CH.matchRecord(W, [co('WELBA CONSTRUCTION LTD', { num: '22220001' })]).rec;
check('"Welba Construction Ltd." vs "WELBA CONSTRUCTION LTD" accepts as matched', wRec.matched === true && wRec.confidence === 'matched' && wRec.match_basis === 'exact_title' && wRec.match_title === true);

const M = lead({ name: 'Master Waterproofing and Renovations Limited', full_address: 'Unit 9, Sea Road', city: '' });
const mRec = CH.matchRecord(M, [co('MASTER WATERPROOFING & RENOVATIONS LIMITED', { num: '22220002' })]).rec;
check('"… and Renovations Limited" vs "… & RENOVATIONS LIMITED" accepts as matched', mRec.matched === true && mRec.confidence === 'matched' && mRec.match_basis === 'exact_title');
check('`&` normalised in the overlap tokeniser (was 0.75, the demotion that lost ~10% of the names)', CH.nameOverlap('Master Waterproofing and Renovations Limited', 'MASTER WATERPROOFING & RENOVATIONS LIMITED') === 1);
check('titleEqual is punctuation/case/suffix blind but not blank-permissive', CH.titleEqual('J & B Piling LLP', 'J AND B PILING PLC') === true && CH.titleEqual('', '') === false);

const uRec = CH.matchRecord(W, [co('ABOVEWATER DAMP PROOFING LTD', { num: '22220003' })]).rec;
check('an UNRELATED title does not accept', uRec.matched === false && uRec.reason === 'no_name_match' && !uRec.ch_number);
const nearRec = CH.matchRecord(lead({ name: 'Welba Construction Ltd.' }), [co('WELBA CONSTRUCTION GROUP HOLDINGS LTD', { num: '22220004' })]).rec;
check('a same-first-word title with no postcode/town is a low_confidence CANDIDATE, not a match', nearRec.matched === false && nearRec.reason === 'low_confidence' && nearRec.candidate === 'WELBA CONSTRUCTION GROUP HOLDINGS LTD');

// ---- 3. --town fallback when the lead has NO postcode ---------------------------------------------
const T = lead({ place_id: 'T1', name: 'Welba Construction', full_address: 'Unit 4, Trading Estate, Preston', city: 'Preston' });
const townCo = co('WELBA CONSTRUCTION SERVICES LIMITED', { num: '33330001', snippet: '1 High Street, Preston', address: { locality: 'Preston' } });
const tRec = CH.matchRecord(T, [townCo]).rec;
check('no postcode + every core token in the title + office town = lead town -> matched', tRec.matched === true && tRec.confidence === 'matched' && tRec.match_basis === 'title_contains+town' && tRec.match_town === true);
const tWrong = CH.matchRecord(T, [co('WELBA CONSTRUCTION SERVICES LIMITED', { num: '33330002', snippet: '1 High Street, Manchester', address: { locality: 'Manchester' } })]).rec;
check('the town fallback needs the town to actually match', tWrong.matched === false && tWrong.reason === 'low_confidence');
const tHasPc = CH.matchRecord(Object.assign({}, T, { full_address: 'Unit 4, Trading Estate, Preston, PR1 2AB' }), [townCo]).rec;
check('a lead that HAS a postcode does not use the town fallback (unconfirmed postcode -> city_only)', tHasPc.matched === true && tHasPc.demoted_reason === 'city_only' && tHasPc.match_town === false);
const tCol = CH.matchRecord({ place_id: 'T2', name: 'Welba Construction', full_address: 'Unit 4, Trading Estate', city: '', town_name: 'Preston' }, [townCo], { townField: 'town_name' }).rec;
check('--town names the lead column it reads', tCol.matched === true && tCol.match_basis === 'title_contains+town');

// ---- 4. helpers the run path still depends on ------------------------------------------------------
check('lastPostcode takes the LAST postcode in the address, space-insensitively', CH.lastPostcode('PO1 1AA House, 12 Kings Rd, Leeds ls1 4dt').full === 'LS14DT' && CH.lastPostcode('no postcode here').full === '');
check('keepOfficer keeps directors/LLP members, drops secretaries + corporate + nominees', CH.keepOfficer('director') && CH.keepOfficer('llp-member') && !CH.keepOfficer('secretary') && !CH.keepOfficer('corporate-director') && !CH.keepOfficer('nominee-director') && !CH.keepOfficer(''));
const offs = CH.mapOfficers([
  { name: 'WELBA, John', officer_role: 'director', occupation: 'Builder', appointed_on: '2015-01-01' },
  { name: 'SMITH, Jane', officer_role: 'secretary', appointed_on: '2015-01-01' },
  { name: 'OLD, Bob', officer_role: 'director', appointed_on: '2011-01-01', resigned_on: '2019-02-02' },
  { name: 'JONES, Amy', officer_role: 'llp-member', appointed_on: '2018-03-03' }], 'Welba Construction Ltd.');
check('mapOfficers keeps active decision-makers only and flags the principal', offs.length === 2 && offs[0].name === 'WELBA, John' && offs[0].likely_principal === true && offs[1].name === 'JONES, Amy' && offs[1].likely_principal === false);
check('no network call was made', netCalls === 0);
process.exit(fails ? 1 : 0);
