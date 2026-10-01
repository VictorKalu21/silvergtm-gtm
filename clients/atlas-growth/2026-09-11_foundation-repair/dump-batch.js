#!/usr/bin/env node
/* Print one classify batch compactly for in-session reading.
 * ~420 chars of the services-preferred slice is enough to judge fit for this vertical; the full
 * 2500-char slice stays in the batch file for anything ambiguous (re-dump with --chars).
 * Usage: node dump-batch.js --batch <n> [--chars 420] [--dir <classify dir>]
 */
const fs=require('fs'), path=require('path');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const DIR=arg('dir',path.join(__dirname,'classify'));
const N=String(arg('batch','0')).padStart(3,'0');
const CH=parseInt(arg('chars','420'),10);
const f=path.join(DIR,`batch_${N}.jsonl`);
if(!fs.existsSync(f)){console.error('no such batch: '+f);process.exit(1);}
const L=fs.readFileSync(f,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
L.forEach((o,i)=>{
  const t=(o.text||'').replace(/\s+/g,' ').trim();
  console.log(`${i+1}|${o.place_id}|${o.name} [${o.city}] {${o.google_types}}`);
  console.log(`   ${t?t.slice(0,CH):'*** NO TEXT ***'}`);
});
console.log(`\n(batch ${N}: ${L.length} rows, ${L.filter(o=>!o.text).length} with no text)`);
