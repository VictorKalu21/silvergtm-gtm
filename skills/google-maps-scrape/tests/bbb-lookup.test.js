#!/usr/bin/env node
/* bbb-lookup.js matcher + principal parser. The search fixture is the real 2026-10-07 response for
 * find_text=plumber&find_loc=Phoenix, AZ (first result, trimmed) plus a synthetic same-name firm in
 * another city. Asserts: phone wins, name+city matches, name-only is low_confidence, partial name
 * in-city is low_confidence, unrelated is a miss, the slim record shape, HTML <em> stripped from
 * names, and the principals parser over the documented markdown shape. No network. */
const path = require('path');
const { pickMatch, normName, tokenOverlap, parsePrincipals } = require(path.join(__dirname, '..', 'bbb-lookup.js'));
let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };

const REAL = { id: '1126_1000124396_494176', businessName: 'Logan & Mike Plumbing LLC', address: '20650 N 29th Pl Ste 101', city: 'Phoenix', state: 'AZ', postalcode: '85050-4783', tobText: 'General Contractor', rating: 'A+', bbbMember: true, reportUrl: '/us/az/phoenix/profile/general-contractor/logan-mike-plumbing-llc-1126-1000124396', phone: ['(602) 919-4792'], businessId: '1000124396', bbbId: '1126', outOfBusinessStatus: null, categories: [{ id: '10035-000', name: 'General Contractor' }, { id: '10113-000', name: 'Plumber' }] };
const OTHER_CITY = { ...REAL, id: 'x', businessName: 'Logan & Mike Plumbing', city: 'Tucson', phone: ['(520) 555-0100'], reportUrl: '/us/az/tucson/profile/plumber/logan-mike-plumbing-1126-9' };
const EM = { ...REAL, id: 'y', businessName: '<em>George</em> <em>Brazil</em> <em>Plumbing</em> & Electrical', phone: ['(602) 257-9000'], reportUrl: '/us/az/phoenix/profile/home-services/george-brazil-plumbing-electrical-1126-5000904' };
const results = [OTHER_CITY, REAL, EM];

check('normName drops stopwords + punctuation', normName('Logan & Mike Plumbing LLC').join(' ') === 'logan mike plumbing');
check('tokenOverlap is min-normalised', tokenOverlap(['a', 'b'], ['a', 'b', 'c']) === 1);

let m = pickMatch({ name: 'Logan and Mike Plumbing', city: 'Tucson, AZ', phone_number: '+1 602-919-4792' }, results);
check('phone beats a wrong-city name match', m.status === 'matched' && m.match_basis === 'phone' && m.bbb.city === 'Phoenix');
m = pickMatch({ name: 'Logan & Mike Plumbing LLC', city: 'Phoenix, AZ', phone_number: '' }, results);
check('name+city → matched, picks the Phoenix record', m.status === 'matched' && m.match_basis === 'name+city' && m.bbb.business_id === '1000124396');
m = pickMatch({ name: 'Logan & Mike Plumbing', city: 'Mesa, AZ', phone_number: '' }, results);
check('name only, no city agreement → low_confidence candidate', m.status === 'low_confidence' && m.match_basis === 'name_only');
m = pickMatch({ name: 'Mike Plumbing Heating', city: 'Phoenix, AZ', phone_number: '' }, results);
check('2 of 3 distinctive tokens in-city (0.67) still counts as a name match', m.status === 'matched' && m.match_basis === 'name+city');
m = pickMatch({ name: 'Brazil Electrical Heating Air', city: 'Phoenix, AZ', phone_number: '' }, results);
check('half the tokens in-city (0.5) → low_confidence candidate', m.status === 'low_confidence' && m.match_basis === 'city+partial_name');
m = pickMatch({ name: 'Desert Sun Roofing', city: 'Phoenix, AZ', phone_number: '' }, results);
check('unrelated business → null (miss)', m === null);
m = pickMatch({ name: 'George Brazil Plumbing & Electrical', city: 'Phoenix, AZ', phone_number: '' }, results);
check('<em> highlight tags stripped from the matched name', m && m.bbb.businessName === 'George Brazil Plumbing & Electrical');
check('slim record shape', m.bbb.profile_url === 'https://www.bbb.org/us/az/phoenix/profile/home-services/george-brazil-plumbing-electrical-1126-5000904' && m.bbb.accredited === true && m.bbb.rating === 'A+' && m.bbb.categories.join('|') === 'General Contractor|Plumber' && m.bbb.out_of_business === null);
check('empty / missing results → null', pickMatch({ name: 'x', city: 'y' }, []) === null && pickMatch({ name: 'x', city: 'y' }, undefined) === null);

const REAL_RENDER = "Business Profile\nGeneral Contractor\n\nLogan & Mike Plumbing LLC\n\n## Overview\n\nLogan & Mike Plumbing LLC\n\n20650 N 29th Pl Ste 101\n\nPhoenix, AZ 85050-4783\n\n[View Service Area](/us/az/phoenix/profile/general-contractor/logan-mike-plumbing-llc-1126-1000124396/more-info#service-area)\n\n### Logan & Mike Plumbing LLC is BBB Accredited.\n\n![](https://m.bbb.org/brand/seals/Accredited_Business_Seal_NoRating_RGB.svg)[Why choose a BBB Accredited Business?](https://www.bbb.org/all/why-choose-a-bbb-accredited-business)\n\n## About This Business\n\nThis business offers plumbing services.\n\n**BBB Accredited Since:** 2/29/2024\n\n**Years in Business:** 4\n\n### Products and Services\n\nCommercial Plumber, General Contractor, Plumber\n\n## Business Details\n\nLocal BBB:[BBB, Mountain West & Pacific Southwest](/local-bbb/pacific-southwest-central-inland-california)\n\nBBB File Opened:2/29/2024\n\nBusiness Started:4/1/2022\n\nBusiness Incorporated:4/1/2022\n\nType of Entity:Corporation\n\nBusiness Management:Mr. Mike Cail, OwnerMr. Logan Knott, Member\n\n### Additional Contact Information\n\nPrincipal ContactsMr. Mike Cail, OwnerMr. Logan Knott, Member\n\nCustomer ContactsMr. Mike Cail, Owner\n\n### Licensing information\n\nThis business is in an industry that may require professional licensing, bonding or registration. BBB encourages you to check with the appropriate agency to be certain any requirements are currently being met.\n\n### Additional Information\n\nOther Resources\nArizona Registrar of Contractors (ROC)\n1700 W. Washington S";   // Keenable /v1/fetch/public of the real profile, 2026-10-19 (names run together, no separator)
const pr = parsePrincipals(REAL_RENDER);
check('REAL render: owner + member parsed from the run-together block', pr.length === 2 && pr[0].name === 'Mike Cail' && pr[0].title === 'Owner' && pr[0].source === 'business_management' && pr[1].name === 'Logan Knott' && pr[1].title === 'Member');
check('REAL render: the repeated principal/customer blocks dedupe, no honorific in the name', !pr.some(x => /^Mr/.test(x.name)) && !pr.some(x => /Licensing|Information/.test(x.title)));
check('run-together without honorifics still splits at the next capitalised name', parsePrincipals('Business Management:Angela May, CEOJohn Smith, President  ### Next').map(x => x.name + '/' + x.title).join(',') === 'Angela May/CEO,John Smith/President');

const MD = `# Logan & Mike Plumbing LLC\n\nSome intro text.\n\n## Business Management\n\n- Mr. Logan Smith, Owner\n- Mike Jones, Co-Owner\n\n## Contact Information\n\nPrincipal Contacts\nMr. Logan Smith, Owner\nCustomer Contact\nMs. Angela May, Office Manager\n\n## Customer Reviews\n\nJane Doe, Phoenix AZ\n`;
const p = parsePrincipals(MD);
check('principals parsed from management + principal + customer-contact blocks, deduped', p.length === 3 && p[0].name === 'Logan Smith' && p[0].title === 'Owner' && p[0].source === 'business_management' && p[1].name === 'Mike Jones' && p[2].name === 'Angela May' && p[2].source === 'customer_contact');
check('a reviewer name outside those blocks is never a principal', !p.some(x => x.name === 'Jane Doe'));
check('no block → nothing', parsePrincipals('# Page\nJohn Doe, Owner\n').length === 0);
process.exit(fails ? 1 : 0);
