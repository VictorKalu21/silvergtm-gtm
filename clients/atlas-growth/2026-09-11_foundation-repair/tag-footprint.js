#!/usr/bin/env node
/* tag-footprint.js :: KEEP all US rows, TAG whether each is inside the 10-state footprint.
 *
 * Client directive (2026-09-11): keep the out-of-footprint US spillover, drop only non-US. So the
 * region allow-list comes OFF footprint-gate (one pass, --keep-domestic, no --regions) and the
 * footprint becomes a SEGMENT rather than a filter — the operator decides later whether to work the
 * spillover. IMPROVEMENTS records the same choice on a prior client.
 *
 * Adds:
 *   state            two-letter state parsed from city/full_address ('' when unknowable)
 *   in_footprint     yes  = one of the 10 target states
 *                    border = TN/FL within --border-deg of a border-metro tile (Memphis/Chattanooga/Jacksonville)
 *                    spillover = US, outside the footprint (KEPT, but tagged)
 *                    unknown = no parseable state AND no nearby tile (address-less SAB far from every tile)
 *   nearest_tile_deg distance in degrees to the closest runsheet tile (blank if no coords)
 *
 * Usage: node tag-footprint.js --in <csv> --runsheet <runsheet.csv> --out <csv> [--border-deg 1.0]
 */
const fs=require('fs');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const IN=arg('in'), RS=arg('runsheet'), OUT=arg('out'), BORDER=parseFloat(arg('border-deg','1.0'));
if(!IN||!RS||!OUT){console.error('ERROR: --in --runsheet --out required');process.exit(1);}
function pc(t){const A=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);A.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);A.push(r);}return A;}
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
const FOOT=new Set(['TX','KS','MO','OK','LA','MS','CO','GA','AL','AR']);
const BORDER_SLUGS=/^(tn-memphis|tn-chattanooga|fl-jacksonville)/;

const rs=pc(fs.readFileSync(RS,'utf8')).filter(r=>r.length>1); const RH=rs.shift();
const iCell=RH.indexOf('cell_id'), iLat=RH.indexOf('lat'), iLng=RH.indexOf('lng');
const tiles=[], borderTiles=[]; const seen=new Set();
for(const r of rs){ const slug=(r[iCell]||'').replace(/-q\d+$/,''); if(seen.has(slug))continue; seen.add(slug);
  const t={lat:+r[iLat],lng:+r[iLng],slug}; tiles.push(t); if(BORDER_SLUGS.test(slug))borderTiles.push(t); }
const nearest=(la,lo,list)=>{let b=Infinity;for(const t of list){const d=Math.hypot(t.lat-la,t.lng-lo);if(d<b)b=d;}return b;};

const ST=/,\s*([A-Z]{2})\b/;
const rows=pc(fs.readFileSync(IN,'utf8')).filter(r=>r.length>1); const H=rows.shift();
const iC=H.indexOf('city'), iA=H.indexOf('full_address'), iLa=H.indexOf('latitude'), iLo=H.indexOf('longitude');
const OH=[...H,'state','in_footprint','nearest_tile_deg'];
const counts={}; const spillStates={};
const out=rows.map(r=>{
  const m=(r[iC]||'').match(ST)||(r[iA]||'').match(ST);
  const st=m?m[1].toUpperCase():'';
  const la=parseFloat(r[iLa]), lo=parseFloat(r[iLo]);
  const near=(isFinite(la)&&isFinite(lo))?nearest(la,lo,tiles):null;
  let tag;
  if(FOOT.has(st)) tag='yes';
  else if(st && isFinite(la) && isFinite(lo) && nearest(la,lo,borderTiles)<=BORDER) tag='border';
  else if(st) { tag='spillover'; spillStates[st]=(spillStates[st]||0)+1; }
  else if(near!=null && near<=BORDER) tag='yes';            // address-less SAB sitting on a target tile
  else tag='unknown';
  counts[tag]=(counts[tag]||0)+1;
  return [...r, st, tag, near==null?'':near.toFixed(2)];
});
fs.writeFileSync(OUT,[OH.map(esc).join(','),...out.map(r=>r.map(esc).join(','))].join('\n')+'\n');
console.log(`tagged ${rows.length} US rows (none dropped):`);
for(const k of ['yes','border','spillover','unknown']) if(counts[k]) console.log(`  ${String(counts[k]).padStart(4)}  in_footprint=${k}`);
const top=Object.entries(spillStates).sort((a,b)=>b[1]-a[1]).slice(0,12);
if(top.length) console.log(`  spillover states: ${top.map(([k,v])=>k+'='+v).join(' ')}`);
