#!/usr/bin/env node
/* backfill-city-nearest-metro.js :: for leads STILL missing city (service-area businesses with
 * no address but with lat/lng), assign the nearest target-metro hub as "City, ST". An SAB serves
 * the whole metro, so the hub city is the right granularity for the competitor search.
 * Usage: node backfill-city-nearest-metro.js --in <leads_city.csv> --out <leads_city.csv> [--maxdeg 2.0]
 */
const fs=require('fs');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const IN=arg('in'), OUT=arg('out'), MAXDEG=parseFloat(arg('maxdeg','2.0'));
if(!IN||!OUT){console.error('ERROR: --in --out required');process.exit(1);}
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
// 47 target-metro hubs: [lat, lng, "City, ST"]
const HUBS=[
 [33.4484,-112.0740,'Phoenix, AZ'],[32.2226,-110.9747,'Tucson, AZ'],[36.1699,-115.1398,'Las Vegas, NV'],
 [40.7608,-111.8910,'Salt Lake City, UT'],[35.0844,-106.6504,'Albuquerque, NM'],[38.8339,-104.8214,'Colorado Springs, CO'],
 [35.4676,-97.5164,'Oklahoma City, OK'],[36.1540,-95.9928,'Tulsa, OK'],[39.0997,-94.5786,'Kansas City, MO'],
 [41.2565,-95.9345,'Omaha, NE'],[41.5868,-93.6250,'Des Moines, IA'],[37.6872,-97.3301,'Wichita, KS'],
 [39.7684,-86.1581,'Indianapolis, IN'],[39.9612,-82.9988,'Columbus, OH'],[39.1031,-84.5120,'Cincinnati, OH'],
 [43.0389,-87.9065,'Milwaukee, WI'],[42.9634,-85.6681,'Grand Rapids, MI'],[33.5186,-86.8104,'Birmingham, AL'],
 [35.1495,-90.0490,'Memphis, TN'],[38.2527,-85.7585,'Louisville, KY'],[30.3322,-81.6557,'Jacksonville, FL'],
 [37.5407,-77.4360,'Richmond, VA'],[36.8508,-76.2859,'Virginia Beach, VA'],[34.0556,-117.1825,'Riverside, CA'],
 [28.5383,-81.3792,'Orlando, FL'],[27.9506,-82.4572,'Tampa, FL'],[29.9511,-90.0715,'New Orleans, LA'],
 [41.4993,-81.6944,'Cleveland, OH'],[40.4406,-79.9959,'Pittsburgh, PA'],[38.6270,-90.1994,'St Louis, MO'],
 [42.3314,-83.0458,'Detroit, MI'],[35.9606,-83.9207,'Knoxville, TN'],[35.0456,-85.3097,'Chattanooga, TN'],
 [36.0726,-79.7920,'Greensboro, NC'],[36.0999,-80.2442,'Winston-Salem, NC'],[34.8526,-82.3940,'Greenville, SC'],
 [34.7465,-92.2896,'Little Rock, AR'],[32.2988,-90.1848,'Jackson, MS'],[47.6588,-117.4260,'Spokane, WA'],
 [38.5816,-121.4944,'Sacramento, CA'],[44.9778,-93.2650,'Minneapolis, MN'],[39.2904,-76.6122,'Baltimore, MD'],
 [41.7658,-72.6734,'Hartford, CT'],[41.8240,-71.4128,'Providence, RI'],[40.2732,-76.8867,'Harrisburg, PA'],
 [36.7378,-119.7871,'Fresno, CA'],[21.3099,-157.8581,'Honolulu, HI']
];
function nearest(lat,lng){let best='',bd=Infinity;for(const[hl,hg,city]of HUBS){const d=(lat-hl)**2+(lng-hg)**2;if(d<bd){bd=d;best=city;}}return{city:best,deg:Math.sqrt(bd)};}
const rows=pc(fs.readFileSync(IN,'utf8')).filter(r=>r.length>1);
const H=rows.shift(); const ix=Object.fromEntries(H.map((h,i)=>[h,i]));
let filled=0, noLL=0, tooFar=0;
const out=[H.map(esc).join(',')];
for(const r of rows){
  while(r.length<H.length)r.push('');
  if(!String(r[ix.city]||'').trim()){
    const lat=parseFloat(r[ix.latitude]), lng=parseFloat(r[ix.longitude]);
    if(isNaN(lat)||isNaN(lng)){noLL++;}
    else{const{city,deg}=nearest(lat,lng); if(deg<=MAXDEG){r[ix.city]=city;filled++;}else tooFar++;}
  }
  out.push(r.map(esc).join(','));
}
fs.writeFileSync(OUT,out.join('\n')+'\n');
const stillBlank=rows.filter(r=>!String(r[ix.city]||'').trim()).length;
console.log(`nearest-metro filled: ${filled} | no lat/lng: ${noLL} | beyond ${MAXDEG}deg (left blank): ${tooFar}`);
console.log(`STILL blank after this pass: ${stillBlank}`);
console.log(`-> ${OUT}`);
