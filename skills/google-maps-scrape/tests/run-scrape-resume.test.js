#!/usr/bin/env node
/* run-scrape.js --resume :: the ok-tile union that decides what gets re-billed.
 * A tile healed on pass 2 of an earlier run is already paid for; if okKeysFrom misses it the
 * resume re-scrapes it, which is exactly the cost --resume exists to avoid. */
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {key,okKeysFrom,allRunLogs,allPerCell,readRunsheet,writeRunsheet}=require('../run-scrape.js');
let pass=0;const t=(n,f)=>{try{f();console.log('  ok  '+n);pass++;}catch(e){console.log('  FAIL '+n+': '+e.message);process.exitCode=1;}};

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rsr-'));
const log=(d,cells)=>{fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,'run_log.json'),JSON.stringify({per_cell:cells}));};
// top-level pass: one ok, one timeout. heal-1: the timeout now ok. resume-0: a third tile ok.
log(tmp,[{query:'foundation repair',lat:29.76,lng:-95.37,status:'ok',count:40},
         {query:'foundation repair',lat:32.78,lng:-96.80,status:'timeout',count:0}]);
log(path.join(tmp,'heal-1'),[{query:'foundation repair',lat:32.78,lng:-96.80,status:'ok',count:31}]);
log(path.join(tmp,'resume-0'),[{query:'house leveling',lat:30.27,lng:-97.74,status:'OK',count:12}]);
log(path.join(tmp,'notalog'),[{query:'x',lat:1,lng:1,status:'ok',count:1}]); // must be ignored

console.log('run-scrape --resume');
t('allRunLogs finds top-level + heal- + resume-, and ignores other dirs',()=>{
  const f=allRunLogs(tmp).map(p=>path.relative(tmp,p).replace(/\\/g,'/')).sort();
  assert.deepStrictEqual(f,['heal-1/run_log.json','resume-0/run_log.json','run_log.json']);
});
t('ok union spans passes — a tile healed later counts as already paid',()=>{
  const ok=okKeysFrom(allRunLogs(tmp));
  assert.ok(ok.has(key('foundation repair',29.76,-95.37)),'pass-0 ok tile');
  assert.ok(ok.has(key('foundation repair',32.78,-96.80)),'heal-1 ok tile must not be re-scraped');
  assert.ok(ok.has(key('house leveling',30.27,-97.74)),'resume-0 ok tile');
  assert.strictEqual(ok.size,3);
});
t("status 'OK' and 'ok' both count",()=>{
  assert.ok(okKeysFrom([path.join(tmp,'resume-0','run_log.json')]).has(key('house leveling',30.27,-97.74)));
});
t('a never-attempted tile is NOT in the ok set (so resume still buys it)',()=>{
  assert.ok(!okKeysFrom(allRunLogs(tmp)).has(key('foundation repair',39.74,-104.99)));
});
t('key() rounds to 2dp so runsheet/log float drift still matches',()=>{
  assert.strictEqual(key('q',29.7604,-95.3698),key('q','29.76','-95.37'));
});
t('allPerCell unions every entry for the empty-but-ok report',()=>{
  assert.strictEqual(allPerCell(allRunLogs(tmp)).length,4);
});
t('a corrupt run_log is skipped, not fatal',()=>{
  const d=path.join(tmp,'heal-2');fs.mkdirSync(d);fs.writeFileSync(path.join(d,'run_log.json'),'{not json');
  assert.strictEqual(okKeysFrom(allRunLogs(tmp)).size,3);
});
// The heal and resume loops both write a runsheet and read it back, so this round-trip is
// load-bearing. NOTE (IMPROVEMENTS.md, OPEN): readRunsheet splits on ',' without honouring the
// quoting writeRunsheet emits, so a query CONTAINING a comma round-trips corrupted. Not fixed
// here (engine fix needs its own approval) and not hit by this client's 10 comma-free queries.
t('runsheet round-trips for comma-free queries (what heal/resume rely on)',()=>{
  const f=path.join(tmp,'rs.csv');
  const rows=[{cell_id:'c1',icp_type:'fr',query:'foundation repair',lat:29.76,lng:-95.37,zoom:12,priority:'P1'},
              {cell_id:'c2',icp_type:'fr',query:'crawl space encapsulation',lat:32.78,lng:-96.80,zoom:12,priority:'P1'}];
  writeRunsheet(rows,f);
  const r=readRunsheet(f);
  assert.strictEqual(r.length,2);
  assert.strictEqual(r[0].query,'foundation repair');
  assert.strictEqual(r[1].query,'crawl space encapsulation');
  // and the keys they produce must match the originals, or resume re-buys them
  assert.strictEqual(key(r[0].query,r[0].lat,r[0].lng),key(rows[0].query,rows[0].lat,rows[0].lng));
});
fs.rmSync(tmp,{recursive:true,force:true});
console.log(`\n${pass}/8 checks passed`);
