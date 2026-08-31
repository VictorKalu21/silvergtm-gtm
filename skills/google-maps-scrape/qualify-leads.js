#!/usr/bin/env node
/*
 * qualify-leads.js :: declarative list-qualification gate (deterministic, $0 — no API).
 * Evaluates cfg.qualify_rules against each lead in leads_clean.csv. Rules are ANDed;
 * the FIRST failing rule drops the lead with an auditable drop_reason. This replaces
 * the old category-only logic — qualification is now any captured field + operator,
 * driven entirely by config (a size floor, a rating floor, claimed-only, etc.).
 *
 * Rule shape: { field, op, value?, per_icp?, label?, stage? }
 *   numeric:    >= <= > < == !=   (review_count/rating coerced to Number;
 *                                  == / != fall back to case-insensitive string/bool compare,
 *                                  so `is_claimed == true` works for "true"/true)
 *   presence:   exists | not_exists            (non-empty trimmed field)
 *   set:        in | not_in                    (value = array, case-insensitive exact)
 *   substring:  contains_any | not_contains_any (value = array of substrings vs field, lowercased)
 *   category:   allow | deny                   (operate on google_types)
 *                 allow -> KEEP needs a hit; FAIL if no value-substring is in google_types.
 *                          per_icp:true => value is {icp_type:[substrings]}, matched against the
 *                          lead's icp_type(s) (replaces the old per-ICP allow map).
 *                 deny  -> FAIL if any value-substring matches the PRIMARY google_types token
 *                          (service-primary exclusion; primary-only avoids dropping a legit
 *                          business that merely has the denied type as a secondary tag).
 * Special field: "primary_type" = first google_types token (for targeting the primary explicitly).
 * Rules tagged stage:"enrichment" (or whose field is not a leads_clean column) are SKIPPED here —
 * they belong to enrich_rules and run AFTER Clay enrichment.
 *
 * Usage: node qualify-leads.js --in <leads_clean.csv> --config <config.json> --out <dir>
 * Outputs: <dir>/leads_clean_qualified.csv, <dir>/excluded_officp.csv (with drop_reason col)
 */
const fs = require('fs');
const path = require('path');
function arg(n, d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const IN=arg('in'), CFG=arg('config'), OUT=arg('out','.');
if(!IN||!CFG){console.error('ERROR: --in and --config required');process.exit(1);}
function parseCsv(t){const rows=[];let row=[],cur='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=c;}else{if(c==='"')q=true;else if(c===','){row.push(cur);cur='';}else if(c==='\n'){row.push(cur);rows.push(row);row=[];cur='';}else if(c==='\r'){}else cur+=c;}}if(cur!==''||row.length){row.push(cur);rows.push(row);}return rows;}
function csvCell(s){s=s==null?'':String(s);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}

const cfg=JSON.parse(fs.readFileSync(CFG,'utf8'));
if(!Array.isArray(cfg.qualify_rules)){console.error('ERROR: config has no qualify_rules[]');process.exit(1);}
const scrapeRules=cfg.qualify_rules.filter(r=>r.stage!=='enrichment');
const enrichSkipped=cfg.qualify_rules.length-scrapeRules.length;
const rows=parseCsv(fs.readFileSync(IN,'utf8')).filter(r=>r.length>1);
const H=rows.shift();
const idx=Object.fromEntries(H.map((h,i)=>[h,i]));

const low=s=>String(s==null?'':s).toLowerCase();
const num=s=>{const n=parseFloat(String(s).replace(/[^0-9.\-]/g,''));return isNaN(n)?null:n;};
const DERIVED=new Set(['primary_type']);
const CAT_OPS=new Set(['allow','deny']);

// Drop any non-enrichment rule whose field isn't available (config error) — warn, don't nuke the list.
const active=[];
for(const r of scrapeRules){
  const fieldOk = idx[r.field]!=null || DERIVED.has(r.field) || CAT_OPS.has(r.op);
  if(!fieldOk){console.error('WARN: skipping rule on unknown field "'+r.field+'" (op '+r.op+') — not a leads_clean column');continue;}
  active.push(r);
}

function getField(row,f){
  if(f==='primary_type') return (row[idx['google_types']]||'').split('|')[0].trim();
  return idx[f]!=null && row[idx[f]]!=null ? row[idx[f]] : '';
}

function passes(row,r){ // true = PASS, false = FAIL (drop)
  const op=r.op, val=r.value;
  if(CAT_OPS.has(op)){
    const gt=low(row[idx['google_types']]||'');
    if(op==='deny'){
      // Default: match the PRIMARY google_type only (backward compatible). Opt-in scope:"any"
      // matches ANY google_type — use for must-drop entities that hide behind a generic primary
      // (e.g. "Attorney | Bankruptcy attorney", "City government office | Bookkeeping"). Two-sided:
      // scope:"any" can also drop a real firm carrying an incidental off-ICP secondary tag, so opt in
      // per-rule only when the deny terms are unambiguous (gov/police/directory), not for fuzzy ones.
      const hay = r.scope==='any' ? gt : low((row[idx['google_types']]||'').split('|')[0]);
      return !(Array.isArray(val)&&val.some(d=>hay.includes(low(d))));
    }
    let subs=[]; // allow
    if(r.per_icp){
      for(const ic of (row[idx['icp_type']]||'').split('|')){const a=val&&val[ic];if(Array.isArray(a))subs=subs.concat(a);}
    } else if(Array.isArray(val)) subs=val;
    return subs.some(a=>gt.includes(low(a)));
  }
  const raw=getField(row,r.field);
  switch(op){
    case 'exists': return String(raw).trim()!=='';
    case 'not_exists': return String(raw).trim()==='';
    case 'in': return Array.isArray(val)&&val.map(low).includes(low(raw));
    case 'not_in': return !(Array.isArray(val)&&val.map(low).includes(low(raw)));
    case 'contains_any': return Array.isArray(val)&&val.some(v=>low(raw).includes(low(v)));
    case 'not_contains_any': return !(Array.isArray(val)&&val.some(v=>low(raw).includes(low(v))));
    case '>=': case '<=': case '>': case '<': {
      const a=num(raw); if(a==null) return false; const b=num(val);
      return op==='>='?a>=b:op==='<='?a<=b:op==='>'?a>b:a<b;
    }
    case '==': case '!=': {
      const a=num(raw), b=num(val);
      const eq=(a!=null&&b!=null)?a===b:low(raw)===low(val);
      return op==='=='?eq:!eq;
    }
    default: console.error('WARN: unknown op "'+op+'" — rule ignored'); return true;
  }
}

const kept=[], dropped=[]; const dropReason={};
for(const r of rows){
  let reason=null;
  for(const rule of active){ if(!passes(r,rule)){ reason=rule.label||(rule.op+':'+rule.field); break; } }
  if(reason){dropped.push([...r,reason]);dropReason[reason]=(dropReason[reason]||0)+1;}
  else kept.push(r);
}
fs.mkdirSync(OUT,{recursive:true});
fs.writeFileSync(path.join(OUT,'leads_clean_qualified.csv'),[H,...kept].map(r=>r.map(csvCell).join(',')).join('\n')+'\n');
fs.writeFileSync(path.join(OUT,'excluded_officp.csv'),[[...H,'drop_reason'],...dropped].map(r=>r.map(csvCell).join(',')).join('\n')+'\n');
console.log('QUALIFY -> '+OUT);
console.log('  rules:     '+active.length+' active'+(enrichSkipped?' ('+enrichSkipped+' enrichment-stage deferred)':''));
console.log('  input:     '+rows.length);
console.log('  KEEP:      '+kept.length+'  ('+(rows.length?(100*kept.length/rows.length).toFixed(0):0)+'%)');
console.log('  DROP:      '+dropped.length+'  ('+(rows.length?(100*dropped.length/rows.length).toFixed(0):0)+'%)');
console.log('  drop reasons: '+JSON.stringify(dropReason));
