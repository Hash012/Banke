'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DEFAULTS,makePlan,createLotusReminders}=require('../lib/lotus-reminders.cjs');
const settings={...DEFAULTS,enabled:true};
const local=(day,hour=0,minute=0)=>new Date(2026,9,day,hour,minute).getTime();
function event(overrides={}){return {id:'synthetic-lotus',title:'合成静心练习',day:1,start:600,end:630,weeks:[1,2],location:'合成地点',...overrides};}
function state(events=[event()],completed=[]){return {semesterStart:'2026-10-19',selectedWeek:24,rangeStart:960,rangeEnd:1440,events,completed};}
function fixture(t,time=local(19,9,54)) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'banke-lotus-'));let clock=time,batches=[];
  const build=()=>createLotusReminders({directory,now:()=>clock,onReminders:items=>batches.push(items)});
  const engine=build();t.after(()=>{engine.dispose();fs.rmSync(directory,{recursive:true,force:true});});
  return {directory,engine,build,batches,at:value=>clock=value};
}
test('start/end reminders use actual week and minute, independent of selected week and visible range',()=>{
  const plan=makePlan(state(),settings,local(19));assert.equal(plan.length,2);
  assert.equal(plan[0].due,local(19,9,55));assert.equal(plan[1].due,local(19,10,29));
  assert.equal(makePlan(state(),settings,local(26))[0].boundary,local(26,10));
  assert.equal(makePlan(state(),settings,local(12)).length,0);
  assert.equal(makePlan(state(),settings,local(19)+14*86400000).length,0);
});
test('24-hour leads include next day, Sunday 24:00 ends on Monday, completion suppresses both',()=>{
  const input=state([event({day:7,start:1410,end:1440,weeks:[1]})]);
  const plan=makePlan(input,{...settings,startMinutes:1440,endMinutes:1440},local(24,23,45));
  assert.equal(plan[0].due,local(24,23,30));assert.equal(plan[1].due,local(25));assert.equal(plan[1].boundary,local(26));
  input.completed=['synthetic-lotus:1'];assert.equal(makePlan(input,settings,local(25)).length,0);
});
test('durable deduplication survives ticks, restart, title edits and lead setting changes; new boundary can remind',t=>{
  const f=fixture(t);assert(f.engine.configure(settings).ok);f.engine.setState(state());assert.equal(f.engine.tick().length,0);
  f.at(local(19,9,55));assert.equal(f.engine.tick().length,1);assert.equal(f.engine.tick().length,0);
  const restarted=f.build();restarted.setState(state([event({title:'改名'})]));assert.equal(restarted.tick().length,0);
  restarted.configure({...settings,startMinutes:10});assert.equal(restarted.tick().length,0);
  restarted.setState(state([event({start:605})]));assert.equal(restarted.tick().length,1);restarted.dispose();
});
test('wake catches only useful reminders; zero lead fires at boundary; expired starts never flood',t=>{
  const f=fixture(t,local(19,10,1));f.engine.configure(settings);f.engine.setState(state());assert.equal(f.engine.tick().length,0);
  f.at(local(19,10,29));assert.equal(f.engine.tick()[0].kind,'end');
  const g=fixture(t,local(19,10));g.engine.configure({...settings,startMinutes:0});g.engine.setState(state());assert.equal(g.engine.tick()[0].kind,'start');
  const h=fixture(t,local(19,10,31));h.engine.configure(settings);h.engine.setState(state());assert.equal(h.engine.tick().length,0);
});
test('deletion, completion and rescheduling cancel pending reminders, while simultaneous reminders are batched',t=>{
  const f=fixture(t);f.engine.configure(settings);f.engine.setState(state());f.engine.setState(state([]));f.at(local(19,9,55));assert.equal(f.engine.tick().length,0);
  f.engine.setState(state([event()],['synthetic-lotus:1']));assert.equal(f.engine.tick().length,0);
  f.engine.setState(state([event({start:610})]));assert.equal(f.engine.tick().length,0);
  f.engine.setState(state([event(),event({id:'second'})]));assert.equal(f.engine.tick().length,2);assert.equal(f.batches.length,1);
});
test('disabled and invalid settings never deliver or overwrite good preferences; corrupted files remain untouched',t=>{
  const f=fixture(t,local(19,9,55));f.engine.setState(state());assert.equal(f.engine.tick().length,0);f.engine.configure(settings);
  const filename=path.join(f.directory,'lotus-preferences.json'),before=fs.readFileSync(filename);
  for(const s of [{...settings,startMinutes:-1},{...settings,endMinutes:1.5},{...settings,startMinutes:1441},{...settings,extra:true}])assert.equal(f.engine.configure(s).ok,false);
  assert.deepEqual(fs.readFileSync(filename),before);
  fs.writeFileSync(filename,'broken');const broken=f.build();assert.equal(broken.status().ok,false);assert.equal(broken.configure(settings).ok,false);assert.equal(fs.readFileSync(filename,'utf8'),'broken');broken.dispose();
});
test('failure to persist delivery prevents presenting an unrecorded reminder',t=>{
  const f=fixture(t,local(19,9,55));f.engine.configure(settings);f.engine.setState(state());
  const filename=path.join(f.directory,'lotus-preferences.json');fs.unlinkSync(filename);fs.mkdirSync(filename);
  assert.equal(f.engine.tick().length,0);assert.equal(f.batches.length,0);assert.equal(f.engine.status().ok,false);
});
test('DST transition follows local wall clock rather than a fixed 24-hour day',()=>{
  const old=process.env.TZ;process.env.TZ='America/New_York';
  try{const input={semesterStart:'2026-03-02',events:[event({day:7,start:540,end:600,weeks:[1]})],completed:[]};
    const plan=makePlan(input,settings,new Date(2026,2,8,8).getTime());assert.equal(new Date(plan[0].boundary).getHours(),9);
    assert.equal(plan[0].boundary-new Date(2026,2,7,9).getTime(),23*3600000);
  }finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});
