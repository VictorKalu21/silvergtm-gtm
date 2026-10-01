#!/usr/bin/env node
/* TDD test for apply-classify.js --fallback.
 * Guards the bug this flag fixes: a lead with no verdict silently took a hardcoded CLIENT vertical
 * ('commercial security company'), which on any other job fails the fit gate as silent lead loss.
 * Also guards the two behaviours that make such rows findable: confidence='fallback', and the
 * BOM-strip on agent-written JSON (a run once lost 48/60 batches to an unstripped BOM).
 */
const fs=require('fs'), path=require('path'), os=require('os'), {execFileSync}=require('child_process');
const SCRIPT=path.join(__dirname,'..','apply-classify.js');
let fails=0;
const check=(n,c)=>{console.log((c?'PASS ':'FAIL ')+n); if(!c)fails++;};
const csv=f=>{const L=fs.readFileSync(f,'utf8').split(/\r?\n/).filter(x=>x.trim());const H=L.shift().split(',');return L.map(l=>{const c=l.split(',');return Object.fromEntries(H.map((h,i)=>[h,c[i]]));});};

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'applycls-'));
const out=path.join(tmp,'out'); fs.mkdirSync(out);
fs.writeFileSync(path.join(tmp,'leads.csv'),
  'place_id,name\np1,Alpha Foundation Repair\np2,Beta Piers\np3,Gamma Crawl Space\n');
// p1 + p2 get verdicts; p3 deliberately absent -> must take the fallback
fs.writeFileSync(path.join(out,'batch_000.json'), JSON.stringify([
  {place_id:'p1',business_type:'residential_foundation',confidence:'high'},
  {place_id:'p2',business_type:'not_foundation',confidence:'medium'},
]));
// a second batch written WITH a UTF-8 BOM, as agents on Windows inconsistently do
fs.writeFileSync(path.join(out,'batch_001.json'), '﻿'+JSON.stringify([]));

const run=(extra,tag)=>{const o=path.join(tmp,'res'+tag+'.csv');
  execFileSync(process.execPath,[SCRIPT,'--leads',path.join(tmp,'leads.csv'),'--llm-out',out,'--out',o,...(extra||[])],{stdio:'pipe'});
  return csv(o);};

// 1. default preserved exactly — existing runs must not change behaviour
const d=run([],'default');
check('default fallback unchanged (backward compatible)', d.find(r=>r.place_id==='p3').business_type==='commercial security company');

// 2. --fallback overrides it
const f=run(['--fallback','unclear'],'flag');
const byId=Object.fromEntries(f.map(r=>[r.place_id,r]));
check('--fallback sets the no-verdict label', byId.p3.business_type==='unclear');
check('fallback row is marked confidence=fallback', byId.p3.business_type_confidence==='fallback');
check('real verdicts are untouched', byId.p1.business_type==='residential_foundation' && byId.p2.business_type==='not_foundation');
check('real verdict keeps its confidence', byId.p1.business_type_confidence==='high');
check('every input row survives', f.length===3);
check('BOM-prefixed batch did not crash the merge', f.length===3);

console.log(fails?`\n${fails} FAILURE(S)`:'\nALL PASS');
process.exit(fails?1:0);
