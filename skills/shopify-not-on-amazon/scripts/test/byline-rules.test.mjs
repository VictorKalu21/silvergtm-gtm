import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../amazon-verify.mjs', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('const GENERIC = GENERIC_WORDS;'), src.indexOf('function parseSearch'));
const { tok, GENERIC_WORDS } = await import('../amazon-autocomplete.mjs');
const fn = new Function('tok', 'GENERIC_WORDS', body + '\nreturn { bylineIsBrand, sellerIsBrand };');
const { bylineIsBrand } = fn(tok, GENERIC_WORDS);
const cases = [
 ['Visit the Vornado Store','vornado air','','vornado.com',true],
 ['Visit the HUDSON Store','hudson jeans','','hudsonjeans.com',true],
 ['Visit the Tifosi Store','tifosi optics','','tifosioptics.com',true],
 ['Visit the ARKON Store','arkon® mounts','','arkon.com',true],
 ['Visit the Condor Store','condor elite','','condoroutdoor.com',true],
 ['Visit the CHITA Store','chitaliving','','chitaliving.com',true],
 ['Visit the Milton Store','milton® industries','','miltonindustries.com',true],
 ['Visit the GTPLAYER Store','gtplayer gaming chair','','gtplayer.com',true],
 ['Visit the Square Store','market square','','marketsquarejewelers.com',false],
 ['Visit the Universal Store','universal standard','','universalstandard.com',false],
 ['Visit the Littlest Pet Shop Store','play pet brands','','playpetbrands.com',false],
 ['Visit the Ford Store','fiesta factory direct','','fiestafactorydirect.com',false],
 ['Visit the Coleman Store','icebox','','icebox.com',false],
 ["Visit the Dr. Bailey's Miracle Cream Store",'dr. bailey skin care','','drbaileyskincare.com',false],
 ['Visit the Kings County Tools Store','garrett wade','','garrettwade.com',false],
 ['Visit the Amazon Essentials Store','girls crew','','shopgirlscrew.com',false],
 ['Visit the Tyler, The Creator Store','golf wang','','golfwang.com',false],
 ['Visit the HUK Store','dive bomb industries','','divebombindustries.com',false],
 ['Brand: Ole Henriksen','ole henriksen','','olehenriksen.com',true],
 ['Visit the WARN Store','warn industries','WARN 12000 winch','warn.com',true],
 ['Visit the Energizer Store','battery','','batterywholesale.com',false],
 ['Visit the Kirby Store','top','','kirby.com',true],
];
let bad=0; for (const [b,q,t,d,exp] of cases) { const got = bylineIsBrand(b,q,t,d); if (got!==exp) { bad++; console.log('FAIL', b,'|',q,'|',d,'->',got,'expected',exp); } }
console.log(bad ? bad+' failures' : 'all '+cases.length+' cases pass');
console.log('hudson baby ->', bylineIsBrand('Visit the Hudson Baby Store','hudson jeans','','hudsonjeans.com'), '(expect false)');
const more = [
 ['Visit the Force Factor Store','force usa','','forceusa.com',false],
 ['Visit the Force Factor Store','force','','forceusa.com',false],
 ['Visit the Berkley Jensen Store','berkley fishing','','berkley-fishing.com',false],
 ['Visit the Berkley Store','berkley fishing','','berkley-fishing.com',true],
 ['Visit the Vincero Collective Store','vincero','','vincerocollective.com',true],
 ['Visit the BRUNT Workwear Store','brunt','','bruntworkwear.com',true],
 ['Visit the BulkSupplements.com Store','bulksupplements','','bulksupplements.com',true],
 ['Visit the Harney & Sons Store','harney & sons fine teas','','harney.com',true],
 ['Visit the CLEAN SKIN CLUB Store','natural, clean skincare','','farmacybeauty.com',false],
 ['Visit the Chomps Store','chomps','','chomps.com',true],
 ['Visit the Stanley 1913 Store','stanley','','stanley1913.com',true],
 ['Visit the Kirby Store','kirby vacuum','','kirby.com',true],
 ['Brand: OLEHENRIKSEN','ole henriksen','','olehenriksen.com',true],
 ['Visit the Honest Beauty Store','farmacy beauty','','farmacybeauty.com',false],
 ['Visit the Amazon Basics Store','amazon','','x.com',false],
];
let bad2=0; for (const [b,q,t,d,exp] of more) { const got = bylineIsBrand(b,q,t,d); if (got!==exp) { bad2++; console.log('FAIL', b,'|',q,'|',d,'->',got,'expected',exp); } }
console.log(bad2 ? bad2+' failures (more)' : 'all '+more.length+' more cases pass');
const m3 = [
 ['Visit the Darn Tough Vermont Store','darn tough','','darntough.com',true],
 ['Visit the Thinx for All Store','thinx','','thinx.com',true],
 ['Visit the PURA VIDA MORINGA Store','pura vida','','puravidabracelets.com',false],
 ['Visit the Toad&amp;Co Store','toad&co','','toadandco.com',false],
 ['Visit the Toad&Co Store','toad&co','','toadandco.com',true],
 ['Visit the POLY & BARK Store','poly & bark','','polyandbark.com',true],
 ['Visit the Moment Store','moment','','shopmoment.com',true],
 ['Visit the Drink Your Meditation Store','moment','','shopmoment.com',false],
 ['Visit the Hillhouse Naturals Store','hill house home','','hillhousehome.com',false],
 ['Visit the Haus Laboratories Store','haus','','gohaus.com',false],
 ['Visit the Randolph Engineering Store','randolph','','randolphusa.com',false],   // byline alone cannot tell; the seller 'Randolph USA' makes it official
 ['Visit the Motorola Store','moto','','motomachines.com',false],
];
let bad3=0; for (const [b,q,t,d,exp] of m3) { const got = bylineIsBrand(b,q,t,d); if (got!==exp) { bad3++; console.log('FAIL', b,'|',q,'|',d,'->',got,'expected',exp); } }
console.log(bad3 ? bad3+' failures (m3)' : 'all '+m3.length+' m3 cases pass');
const m4 = [
 ["Visit the Jordan's Skinny Mixes Store",'skinny mixes','','skinnymixes.com',true],
 ['Visit the SPRING HILL NURSERIES Store','spring hill nursery','','springhillnursery.com',true],
 ['Visit the Poo-Pourri Store','~pourri','','pourri.com',true],
 ['Brand: Glam-Aholic Lifestyle','glam-aholic','','glamaholiclifestyle.com',true],
 ['Visit the Christopher Bean Coffee Store',"chris' coffee",'','chriscoffee.com',false],
 ['Visit the Icy Hot Store','wear icy','','wearicy.com',false],
 ['Visit the Barsys Store','bar products','','barproducts.com',false],
 ['Visit the Honest Beauty Store','farmacy beauty','','farmacybeauty.com',false],
 ['Visit the Evermade Store','proof','','carryproof.com',false],
];
let bad4=0; for (const [b,q,t,d,exp] of m4) { const got = bylineIsBrand(b,q,t,d); if (got!==exp) { bad4++; console.log('FAIL', b,'|',q,'|',d,'->',got,'expected',exp); } }
console.log(bad4 ? bad4+' failures (m4)' : 'all '+m4.length+' m4 cases pass');
const m5 = [
 ['Visit the V-Force® Store','force usa fitness','','forceusa.com',false],
 ["Brand: L'AGENCE",'l agence','','lagence.com',true],
 ["Visit the Dr. Bailey's Miracle Cream Store",'dr. bailey skin care','','drbaileyskincare.com',false],
 ['Visit the Toad&Co Store','toad&co','','toadandco.com',true],
];
let bad5=0; for (const [b,q,t,d,exp] of m5) { const got = bylineIsBrand(b,q,t,d); if (got!==exp) { bad5++; console.log('FAIL', b,'|',q,'|',d,'->',got,'expected',exp); } }
console.log(bad5 ? bad5+' failures (m5)' : 'all '+m5.length+' m5 cases pass');
const { sellerIsBrand: sib } = fn(tok, GENERIC_WORDS);
const m6 = [
 ['Visit the Alegria by PG Lite Store','alegria shoes','','alegriashoes.com',true],
 ['Visit the Force Factor Store','force','','forceusa.com',false],
];
let bad6=0; for (const [b,q,t,d,exp] of m6) { const got = bylineIsBrand(b,q,t,d); if (got!==exp) { bad6++; console.log('FAIL', b,'|',q,'|',d,'->',got,'expected',exp); } }
const s6 = [['RBX','rbx active',true],['CEP Sportswear','cep compression',true],['OutdoorEquipped','alegria shoes',false],['Force Factor','force usa',false],['DripDrop Hydration','dripdrop',false],['Amazon.com','rbx active',false]];
for (const [sel,q,exp] of s6) { const got = sib(sel,q); if (got!==exp) { bad6++; console.log('FAIL seller', sel,'|',q,'->',got,'expected',exp); } }
console.log(bad6 ? bad6+' failures (m6)' : 'all '+(m6.length+s6.length)+' m6 cases pass');
