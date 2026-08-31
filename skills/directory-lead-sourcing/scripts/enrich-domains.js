// Add the real website domain to each agency by fetching its DesignRush profile and grabbing the utm_source=DesignRush outbound link.
const https=require('https'), fs=require('fs');
const IN=process.argv[2]||'designrush_top_rated.csv';
const OUT=process.argv[3]||'designrush_top_rated_domains.csv';
const CONC=6, DELAY=250;
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
function pc(s){const R=[];let r=[],c='',q=false;for(let i=0;i<s.length;i++){const x=s[i];if(q){if(x=='"'){if(s[i+1]=='"'){c+='"';i++;}else q=false;}else c+=x;}else{if(x=='"')q=true;else if(x==','){r.push(c);c='';}else if(x=='\n'||x=='\r'){if(x=='\r'&&s[i+1]=='\n')i++;if(c!==''||r.length){r.push(c);R.push(r);r=[];c='';}}else c+=x;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc=v=>{v=(v==null)?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
function get(url,d=0){return new Promise(res=>{const req=https.get(url,{headers:{'User-Agent':UA},timeout:20000},r=>{if([301,302,307,308].includes(r.statusCode)&&r.headers.location&&d<4){r.resume();return res(get(new URL(r.headers.location,url).href,d+1));}let b='';r.on('data',x=>b+=x);r.on('end',()=>res(b));});req.on('error',()=>res(''));req.on('timeout',()=>{req.destroy();res('');});});}
function domainOf(html){
  // the agency's OWN website link is inside its <h1 class="title"> (not a sidebar/featured agency)
  const m=html.match(/<h1[^>]*class="[^"]*title[^"]*"[^>]*>\s*<a [^>]*href="(https?:\/\/[^"]+)"/i)
        || html.match(/class="title[^"]*gtm-agency-website-link[^"]*"[^>]*href="(https?:\/\/[^"]+)"|href="(https?:\/\/[^"]+)"[^>]*class="title[^"]*gtm-agency-website-link/i);
  const href=m&&(m[1]||m[2]); if(!href)return '';
  try{ return new URL(href).host.replace(/^www\./,'').toLowerCase(); }catch{ return ''; }
}
(async()=>{
  const rows=pc(fs.readFileSync(IN,'utf8'));const H=rows.shift();const pi=H.indexOf('profile');
  const data=rows.map(r=>Object.fromEntries(H.map((h,i)=>[h,r[i]])));
  const cols=['domain',...H];
  fs.writeFileSync(OUT,cols.join(',')+'\n');
  let done=0,found=0;const q=data.slice();
  async function worker(){ while(q.length){ const row=q.shift(); const html=await get(row.profile); const dom=domainOf(html); if(dom)found++; done++;
    fs.appendFileSync(OUT,cols.map(c=>esc(c==='domain'?dom:row[c])).join(',')+'\n');
    if(done%25===0) console.error(`${done}/${data.length} (${found} domains)`); await new Promise(r=>setTimeout(r,DELAY)); } }
  await Promise.all(Array.from({length:CONC},worker));
  console.error(`DONE. ${done} agencies, ${found} domains found (${Math.round(found/done*100)}%) -> ${OUT}`);
})();
