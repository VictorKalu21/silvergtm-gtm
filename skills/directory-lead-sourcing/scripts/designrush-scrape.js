// DesignRush agency scraper — Tier 1 plain fetch + parse. High-ticket ($10k+) filter from card budget bracket.
const https = require('https');
const fs = require('fs');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const CATEGORIES = ['video-production','content-marketing','creative-agencies','logo-branding','video-marketing'];
const COUNTRIES = ['us','uk','ca','de','nl'];          // us, UK, canada, germany, netherlands (fr looked unfiltered; au optional)
const PAGE_CAP = 16;                                    // pages per category x country (~50 agencies/page) — raise to go deeper
const DELAY = 550;

const sleep = ms => new Promise(r => setTimeout(r, ms));
function get(url,depth=0){return new Promise(res=>{const req=https.get(url,{headers:{'User-Agent':UA},timeout:25000},r=>{if([301,302,307,308].includes(r.statusCode)&&r.headers.location&&depth<4){r.resume();return res(get(new URL(r.headers.location,url).href,depth+1));}let b='';r.on('data',d=>b+=d);r.on('end',()=>res({code:r.statusCode,html:b}));});req.on('error',()=>res({code:0,html:''}));req.on('timeout',()=>{req.destroy();res({code:0,html:''});});});}
const decode = s => (s||'').replace(/&amp;/g,'&').replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/&amp;amp;/g,'&').trim();
function budgetLow(b){ if(!b) return null; const m=b.replace(/,/g,'').match(/\$(\d+)/); return m?parseInt(m[1],10):null; }

function ratingMap(html){
  const map={};
  const re=/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi; let m;
  while((m=re.exec(html))){
    let j; try{ j=JSON.parse(m[1]); }catch{ continue; }
    const els=[]; (function walk(o){ if(!o||typeof o!=='object')return; if(o.itemListElement)els.push(...[].concat(o.itemListElement)); if(Array.isArray(o))o.forEach(walk); else Object.values(o).forEach(walk); })(j);
    for(const li of els){ const item=(li&&li.item)||li; if(!item)continue; const slug=((item.url||'').match(/agency\/profile\/([a-z0-9-]+)/i)||[])[1]; const ar=item.aggregateRating||{}; if(slug)map[slug.toLowerCase()]={rating:ar.ratingValue??'',reviews:ar.reviewCount??''}; }
  }
  return map;
}
function parseCards(html){
  const out=[]; const rmap=ratingMap(html);
  const parts = html.split('agency-card="true"').slice(1);
  for(const p of parts){
    const id=(p.match(/data-agency-id="(\d+)"/)||[])[1];
    const name=decode((p.match(/data-agency-name="([^"]+)"/)||[])[1]||'');
    const slug=((p.match(/\/agency\/profile\/([a-z0-9-]+)/i)||[])[1]||'').toLowerCase();
    const chunk=p.slice(0,5000);
    const team=((chunk.match(/agency-icon-team[\s\S]{0,200}?<span>([^<]+)<\/span>/)||[])[1]||'').trim();
    const budget=((chunk.match(/agency-icon-budget[\s\S]{0,200}?<span>([^<]+)<\/span>/)||[])[1]||'').trim();
    const completed=((chunk.match(/agency-icon-completed[\s\S]{0,200}?<span>([^<]+)<\/span>/)||[])[1]||'').trim();
    const r=rmap[slug]||{};
    if(id&&name) out.push({id,name,slug,team,budget,completed,rating:r.rating||'',reviews:r.reviews||''});
  }
  return out;
}

(async()=>{
  const seen=new Map();
  for(const cat of CATEGORIES){
    for(const cc of COUNTRIES){
      const base=`https://www.designrush.com/agency/${cat}/${cc}`;
      const first=await get(base);
      if(first.code!==200){ console.error(`SKIP ${cat}/${cc} (HTTP ${first.code})`); await sleep(DELAY); continue; }
      const total=parseInt(((first.html.match(/([0-9,]+) Companies/)||[])[1]||'0').replace(/,/g,''),10);
      const pages=Math.min(PAGE_CAP, Math.max(1, Math.ceil(total/50)));
      let added=0;
      for(let pg=1; pg<=pages; pg++){
        const html = pg===1 ? first.html : (await get(`${base}?page=${pg}`)).html;
        const cards=parseCards(html);
        if(!cards.length) break;
        for(const c of cards){
          if(!seen.has(c.id)){ seen.set(c.id,{...c,cats:new Set(),ccs:new Set()}); added++; }
          const e=seen.get(c.id); e.cats.add(cat); e.ccs.add(cc);
          if(!e.budget&&c.budget) e.budget=c.budget; if(!e.team&&c.team) e.team=c.team;
          if(!e.rating&&c.rating) e.rating=c.rating; if(!e.reviews&&c.reviews) e.reviews=c.reviews; if(!e.completed&&c.completed) e.completed=c.completed;
        }
        if(pg<pages) await sleep(DELAY);
      }
      console.error(`${cat}/${cc}: ${total} total, scraped ${pages}pg, +${added} new (running ${seen.size})`);
      await sleep(DELAY);
    }
  }
  // classify high-ticket
  const rows=[...seen.values()].map(e=>{
    const low=budgetLow(e.budget);
    const tier = low==null ? 'unknown' : (low>=10000 ? 'high' : 'low');
    return {id:e.id,name:e.name,budget:e.budget||'',team:e.team||'',rating:e.rating||'',reviews:e.reviews||'',completed:e.completed||'',high_ticket:tier,profile:`https://www.designrush.com/agency/profile/${e.slug}`,categories:[...e.cats].join('|'),countries:[...e.ccs].join('|')};
  });
  const high=rows.filter(r=>r.high_ticket!=='low'); // keep high + unknown, drop clear low-ticket
  const cols=['name','budget','team','rating','reviews','completed','high_ticket','categories','countries','profile','id'];
  const esc=v=>{v=(v==null)?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
  fs.writeFileSync(process.env.OUT || 'designrush_agencies.csv',[cols.join(',')].concat(rows.map(r=>cols.map(c=>esc(r[c])).join(','))).join('\n'));
  fs.writeFileSync(process.env.OUT_HIGH || 'designrush_agencies_highticket.csv',[cols.join(',')].concat(high.map(r=>cols.map(c=>esc(r[c])).join(','))).join('\n'));
  const n=t=>rows.filter(r=>r.high_ticket===t).length;
  console.error(`\nDONE. ${rows.length} unique agencies | high:${n('high')} unknown:${n('unknown')} low(dropped from HT file):${n('low')}`);
  console.error(`-> designrush_agencies.csv (all) + designrush_agencies_highticket.csv (${high.length})`);
})();
