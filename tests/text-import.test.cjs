'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const T=require('../desktop/renderer/text-import.js'),D=require('../desktop/renderer/text-import-drafts.js'),C=require('../desktop/renderer/core.js');
const context={semesterStart:'2026-09-07',selectedWeek:7,today:'2026-10-20'};
const state=()=>({version:1,semesterStart:context.semesterStart,selectedWeek:7,rangeStart:360,rangeEnd:1440,events:[],completed:[],theme:'light'});
const parse=text=>T.parse(text,context).rows;
test('explicit weeks, multiple weekdays, odd weeks and Chinese times preserve exact intent',()=>{
 const rows=parse('第1-16周（单周）\n周一、周三 上午九点一刻到十一点半 数学 @A楼');
 assert.equal(rows.length,2);assert.deepEqual(rows.map(x=>x.day),[1,3]);assert.deepEqual(rows[0].weeks,[1,3,5,7,9,11,13,15]);
 assert.equal(rows[0].start,555);assert.equal(rows[0].end,690);assert.equal(rows[0].title,'数学');assert.equal(rows[0].location,'A楼');assert(!rows[0].uncertain);
 assert(rows.every(T.validDraft));assert.equal(T.prepare(state(),rows).added.length,2);
});
test('relative dates use Shanghai today and teaching weeks rather than the viewed week',()=>{
 const row=parse('明天下午三点到五点 项目讨论')[0];assert.equal(row.day,3);assert.deepEqual(row.weeks,[7]);assert.equal(row.start,900);assert.equal(row.end,1020);
 const next=parse('下周一 19:40-20:10 复习')[0];assert.equal(next.day,1);assert.deepEqual(next.weeks,[8]);assert.equal(next.start,1180);
 assert.equal(parse('明天晚上19:40到20:10 阅读')[0].start,1180);
 assert.equal(parse('明天上午十二点到下午一点 午餐')[0].start,720);
 const conflict=parse('第3周 下周一 19:00-20:00 周次冲突');assert.deepEqual(conflict[0].weeks,[]);assert.match(conflict[0].warnings.join('；'),/周次冲突/);assert.equal(T.prepare(state(),conflict).drafts.length,1);
});
test('missing and invalid fields remain drafts without fabricated slots',()=>{
 for(const text of ['明天写报告','周五九点开会','第7周 09:00-10:00 复习','2026-02-30 周一 09:00-10:00 讨论','2027-12-01 09:00-10:00 超学期','周三23:00-01:00 跨日']){
  const plan=T.prepare(state(),parse(text));assert.equal(plan.added.length,0,text);assert.equal(plan.drafts.length,1,text);assert(T.validDraft(plan.drafts[0]));
 }
});
test('ambiguous scope and time are marked while valid events can enter the grid',()=>{
 const rows=parse('周一 09:00-10:00 阅读\n第7周 周三大概下午3点到5点 讨论');
 const plan=T.prepare(state(),rows);assert.equal(plan.added.length,2);assert(plan.added.every(x=>x.uncertain));assert.match(plan.added[0].notes,/未写周次/);
 assert.equal(T.prepare(state(),parse('明天 09:00-10:00 复习 15:00-16:00 讨论')).drafts.length,1);
});
test('duplicate imports and partially covered weeks add no repeated occurrences',()=>{
 const rows=parse('第1-4周 周日 23:30-24:00 阅读'),first=T.prepare(state(),rows);
 assert.equal(first.added[0].end,1440);const second=T.prepare(first.state,parse('第1-6周 周日 23:30-24:00 阅读'));
 assert.deepEqual(second.added[0].weeks,[5,6]);assert.equal(T.prepare(second.state,parse('第1-6周 周日 23:30-24:00 阅读')).duplicates.length,1);
 assert.equal(C.validateState(second.state).length,0);
});
test('parser limits reject empty, excessive, and invalid contexts without returning partial results',()=>{
 assert.throws(()=>parse(''));assert.throws(()=>parse('字'.repeat(20001)));assert.throws(()=>parse('字'.repeat(1501)));
 assert.throws(()=>parse(Array(101).fill('明天写报告').join('\n')));assert.throws(()=>T.parse('明天写报告',{...context,today:'2026-02-30'}));
});
test('draft journal persists, survives write failures and refuses corrupt data',()=>{
 let raw=null,blocked=false;const store=()=>D.createBackend({read:()=>raw,write:value=>{if(blocked)throw Error('模拟磁盘写入失败');raw=value;}});
 const row=parse('明天写报告')[0];assert(store().stage([row]).ok);assert.deepEqual(store().read().items,[row]);
 blocked=true;assert(!store().remove(row.id).ok);assert.deepEqual(store().read().items,[row]);blocked=false;
 raw='{损坏';const original=raw;assert(!store().stage([row]).ok);assert.equal(raw,original);assert(!store().read().ok);
 raw=null;assert(store().stage([row]).ok);assert(store().remove(row.id).ok);assert.equal(store().read().items.length,0);
});
test('native draft storage writes only the specified independent directory',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'banke-text-import-'));try{
  const {createTextDrafts}=require('../desktop/lib/text-import-drafts.cjs'),row=parse('明天写报告')[0];assert(createTextDrafts({directory}).stage([row]).ok);
  assert.equal(createTextDrafts({directory}).read().items[0].id,row.id);assert.deepEqual(fs.readdirSync(directory),['text-import-drafts.json']);
  fs.writeFileSync(path.join(directory,'text-import-drafts.json'),'invalid');assert(!createTextDrafts({directory}).stage([row]).ok);assert.equal(fs.readFileSync(path.join(directory,'text-import-drafts.json'),'utf8'),'invalid');
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('phone and desktop use byte-identical parser, draft journal, preview and styles',()=>{
 for(const name of ['text-import.js','text-import-drafts.js','text-import-ui.js','text-import.css'])assert.deepEqual(fs.readFileSync(path.join(__dirname,'../desktop/renderer',name)),fs.readFileSync(path.join(__dirname,'../mobile/web',name)));
});
